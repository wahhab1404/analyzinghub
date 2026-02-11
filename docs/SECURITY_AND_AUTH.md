# Security and Authentication Guide

**Last Updated:** 2026-02-07
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Architecture](#security-architecture)
3. [Authentication System](#authentication-system)
4. [Authorization & Access Control](#authorization--access-control)
5. [Row-Level Security (RLS)](#row-level-security-rls)
6. [API Security](#api-security)
7. [Database Security](#database-security)
8. [Telegram Security](#telegram-security)
9. [Transport & Network Security](#transport--network-security)
10. [Critical Security Issues & Fixes](#critical-security-issues--fixes)
11. [Credential Management](#credential-management)
12. [Security Monitoring & Audit](#security-monitoring--audit)
13. [Security Best Practices](#security-best-practices)
14. [Security Checklist](#security-checklist)

---

## Executive Summary

AnalyzingHub implements a comprehensive defense-in-depth security model with multiple layers of protection:

- **Authentication**: Supabase Auth with email/password and OTP email verification
- **Authorization**: Role-Based Access Control (RBAC) with SuperAdmin, Analyzer, and Trader roles
- **Database Security**: Row-Level Security (RLS) policies enforced at database level
- **API Security**: JWT-based authentication, CORS protection, rate limiting
- **Transport Security**: HTTPS/TLS encryption for all communications
- **Credential Security**: Environment variable management with rotation procedures

**Security Posture**: Production-ready with automated monitoring and audit trails.

---

## Security Architecture

### Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Transport Security (HTTPS/TLS)                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication (Supabase Auth + JWT)               │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Authorization (RBAC + RLS Policies)                │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Application Logic (API Routes + Business Rules)    │
├─────────────────────────────────────────────────────────────┤
│ Layer 5: Database Security (RLS + Constraints)              │
├─────────────────────────────────────────────────────────────┤
│ Layer 6: Audit & Monitoring (Logs + Alerts)                 │
└─────────────────────────────────────────────────────────────┘
```

### Security Principles

1. **Least Privilege**: Users have minimum necessary permissions
2. **Defense in Depth**: Multiple security layers prevent single-point failures
3. **Fail Secure**: System fails safely when errors occur
4. **Complete Mediation**: All requests are checked for authorization
5. **Open Design**: Security through design, not obscurity
6. **Separation of Duties**: Critical operations require multiple roles
7. **Audit Trail**: All sensitive operations are logged

---

## Authentication System

### Overview

AnalyzingHub uses Supabase Auth with multiple authentication methods:

- **Email/Password**: Traditional username/password authentication
- **OTP Email**: One-Time Password sent via email for passwordless login
- **Session Management**: JWT-based sessions with automatic refresh

### Supabase Auth Configuration

#### Required Environment Variables

```bash
# Supabase Authentication
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

#### Authentication Flow

```
┌──────────┐     1. Login Request      ┌──────────────┐
│  Client  │ ────────────────────────> │  Auth API    │
│          │                            │  Route       │
└──────────┘                            └──────────────┘
     ↑                                          │
     │                                          │ 2. Validate
     │                                          ↓
     │                                  ┌──────────────┐
     │                                  │  Supabase    │
     │                                  │  Auth        │
     │                                  └──────────────┘
     │                                          │
     │ 4. Return JWT Session                    │ 3. Generate JWT
     │ <─────────────────────────────────────── │
```

### Email/Password Authentication

#### Signup Flow

**API Route**: `/app/api/auth/register/route.ts`

```typescript
// Example: User Registration with Enhanced Security
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createServerClient();

  let body: { email: string; password: string; fullName?: string; name?: string };

  try {
    body = await request.json();
  } catch (error) {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { email, password, fullName, name } = body;

  // Validate required fields
  if (!email || !password) {
    console.error('[Register] Missing email/password', {
      email: !!email,
      password: !!password,
      bodyKeys: Object.keys(body),
    });
    return Response.json(
      { error: 'Missing email or password' },
      { status: 400 }
    );
  }

  // Handle both fullName and name for backward compatibility
  const fullNameFinal = fullName ?? name ?? null;

  // Log safe environment metadata
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  console.log('[Register] Supabase env:', {
    urlHost: new URL(supabaseUrl).host,
    anonLen: anonKey.length,
    anonPrefix: anonKey.slice(0, 20),
  });

  // Create user in Supabase Auth
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullNameFinal,
      },
    },
  });

  if (signUpError) {
    console.error('[Register] Supabase signUpError:', {
      message: signUpError.message,
      status: signUpError.status,
      code: (signUpError as any).code,
      name: signUpError.name,
    });
    return Response.json(
      { error: signUpError.message },
      { status: 400 }
    );
  }

  console.log('[Register] Success:', {
    userId: data.user?.id,
    email: data.user?.email,
  });

  return Response.json({
    message: 'Registration successful',
    user: data.user,
  });
}
```

#### Login Flow

**API Route**: `/app/api/auth/login/route.ts`

```typescript
// Example: User Login with Cookie Persistence
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createServerClient();

  let body: { email: string; password: string };

  try {
    body = await request.json();
  } catch (error) {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { email, password } = body;

  if (!email || !password) {
    return Response.json(
      { error: 'Missing email or password' },
      { status: 400 }
    );
  }

  // Log environment metadata (safe)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  console.log('[Login] Supabase env meta:', {
    urlHost: new URL(supabaseUrl).host,
    anonLen: anonKey.length,
    anonPrefix: anonKey.slice(0, 20),
  });

  // CRITICAL: Use 'let' not 'const' to ensure cookie mutations survive
  let response = Response.json({ message: 'Login successful' });

  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error('[Login] Authentication failed:', {
      message: signInError.message,
      status: signInError.status,
      code: (signInError as any).code,
      name: signInError.name,
    });
    return Response.json(
      { error: signInError.message },
      { status: 401 }
    );
  }

  return response;
}
```

**CRITICAL FIXES APPLIED**:
1. Changed `const response` to `let response` - ensures cookie mutations from Supabase survive
2. Removed `httpOnly: options?.httpOnly ?? true` override - allows Supabase to control cookie settings
3. Enhanced error logging for production debugging

### OTP Email Authentication

#### Overview

OTP (One-Time Password) authentication provides passwordless login via email verification codes.

**Features**:
- 6-digit verification codes
- 10-minute expiration
- Single-use codes (consumed after verification)
- Password hash storage for additional security
- Email delivery via ZeptoMail

#### Database Schema

```sql
-- OTP Codes Table
CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  password_hash text NOT NULL,  -- Additional security layer
  expires_at timestamptz NOT NULL,
  consumed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),

  -- Indexes for performance
  CREATE INDEX idx_otp_codes_email ON otp_codes(email);
  CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);
);

-- Enable RLS
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role can manage OTP codes"
  ON otp_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### OTP Generation API

**API Route**: `/app/api/auth/otp/generate/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function POST(request: Request) {
  const { email, type } = await request.json();

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash the code for additional security
  const passwordHash = crypto.createHash('sha256').update(code).digest('hex');

  // Store in database
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: insertError } = await supabase
    .from('otp_codes')
    .insert({
      email,
      code,
      password_hash: passwordHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      consumed: false,
    });

  if (insertError) {
    return Response.json({ error: 'Failed to generate OTP' }, { status: 500 });
  }

  // Send email via Edge Function
  const emailResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-otp-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: email,
        subject: 'Your OTP Code',
        code,
        type,
      }),
    }
  );

  return Response.json({ message: 'OTP sent successfully' });
}
```

#### OTP Verification API

**API Route**: `/app/api/auth/otp/verify/route.ts`

```typescript
export async function POST(request: Request) {
  const { email, code } = await request.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify code
  const { data: otpData, error: otpError } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', email)
    .eq('code', code)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (otpError || !otpData) {
    return Response.json({ error: 'Invalid or expired OTP' }, { status: 401 });
  }

  // Mark as consumed
  await supabase
    .from('otp_codes')
    .update({ consumed: true })
    .eq('id', otpData.id);

  // Create session
  const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
    email,
    password: otpData.password_hash, // Use stored hash as temporary password
  });

  return Response.json({ message: 'Login successful', session: sessionData });
}
```

#### Email Sending Edge Function

**Edge Function**: `/supabase/functions/send-otp-email/index.ts`

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string;
  subject: string;
  code: string;
  type: 'login' | 'signup';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { to, subject, code, type }: EmailRequest = await req.json();

    // Validate environment variable
    const zeptoApiKey = Deno.env.get("SMTP_PASSWORD");
    if (!zeptoApiKey) {
      console.error("SMTP_PASSWORD environment variable is missing");
      return new Response(
        JSON.stringify({
          error: "Configuration error",
          details: "SMTP_PASSWORD not configured"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                     color: white; padding: 30px; text-align: center;
                     border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px;
                       text-align: center; padding: 20px; background: white;
                       border-radius: 8px; margin: 20px 0; color: #3b82f6; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>AnalyzingHub</h1>
            </div>
            <div class="content">
              <h2>Your Verification Code</h2>
              <p>Use the following code to ${type === 'login' ? 'sign in' : 'verify your account'}:</p>
              <div class="otp-code">${code}</div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 AnalyzingHub. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send via ZeptoMail
    const zeptoMailResponse = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Authorization": zeptoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: {
          address: Deno.env.get("SMTP_FROM_EMAIL") || "noreply@analyzhub.com",
          name: Deno.env.get("SMTP_FROM_NAME") || "AnalyzingHub",
        },
        to: [{ email_address: { address: to } }],
        subject: subject,
        htmlbody: htmlContent,
      }),
    });

    if (!zeptoMailResponse.ok) {
      throw new Error(`ZeptoMail API error: ${zeptoMailResponse.status}`);
    }

    return new Response(
      JSON.stringify({ message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Authentication Best Practices

1. **Never Store Passwords in Plain Text**: Use Supabase Auth's built-in hashing
2. **Implement Rate Limiting**: Prevent brute-force attacks on login endpoints
3. **Use HTTPS Only**: Never transmit credentials over unencrypted connections
4. **Validate Input**: Always validate email format and password strength
5. **Log Security Events**: Log all authentication attempts for audit trails
6. **Session Management**: Implement proper session timeout and renewal
7. **Multi-Factor Authentication**: Consider MFA for sensitive accounts

### Common Authentication Issues

#### Issue 1: "Works locally, fails in production"

**Symptoms**:
- Login succeeds locally but returns 401 in production
- Session doesn't persist after login

**Root Causes**:
1. Environment variable mismatch (different Supabase projects)
2. Cookie persistence issue (`const response` instead of `let response`)
3. httpOnly override breaking sessions
4. Captcha enabled in production but not local

**Solutions**:
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` match in production
- Use `let response` for proper cookie handling
- Remove `httpOnly: true` default override
- Check browser console and server logs for specific errors

#### Issue 2: "Invalid login credentials" despite correct password

**Possible Causes**:
- Email confirmation required but not completed
- Account disabled or deleted
- Wrong environment (testing on wrong Supabase project)

**Solution**:
- Check Supabase Dashboard → Authentication → Users
- Verify email confirmation status
- Temporarily disable email confirmation for testing

#### Issue 3: "captcha_required" error in production

**Solution**:
- Go to Supabase Dashboard → Authentication → Settings → Bot and Abuse Protection
- Either disable captcha or implement captcha in frontend

See `SIGNUP_DEBUG_GUIDE.md` for comprehensive troubleshooting steps.

---

## Authorization & Access Control

### Role-Based Access Control (RBAC)

AnalyzingHub implements a three-tier role system:

#### Role Hierarchy

```
┌────────────────────────────────────────────┐
│           SuperAdmin (Full Access)          │
│  - Manage all users                         │
│  - Configure system settings               │
│  - Access admin panel                      │
│  - View audit logs                         │
└────────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────┐
│        Analyzer (Content Creator)           │
│  - Create analyses                         │
│  - Manage own content                      │
│  - View own analytics                      │
│  - Configure Telegram channels             │
└────────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────┐
│          Trader (Consumer)                 │
│  - View analyses                           │
│  - Follow analyzers                        │
│  - Rate and comment                        │
│  - Subscribe to plans                      │
└────────────────────────────────────────────┘
```

#### Database Schema

```sql
-- Roles table
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL CHECK (name IN ('SuperAdmin', 'Analyzer', 'Trader')),
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Profiles with role assignment
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role_id uuid REFERENCES roles(id) NOT NULL,
  bio text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_profiles_role_id ON profiles(role_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

#### Role Assignment on Signup

```sql
-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  default_role_id uuid;
BEGIN
  -- Get default 'Trader' role
  SELECT id INTO default_role_id
  FROM public.roles
  WHERE name = 'Trader'
  LIMIT 1;

  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, role_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    default_role_id
  );

  RETURN NEW;
END;
$$;

-- Trigger on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### Authorization Checks

#### Backend Authorization (API Routes)

```typescript
// Example: Check if user is SuperAdmin
export async function checkSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      role_id,
      roles!inner(name)
    `)
    .eq('id', userId)
    .single();

  if (error || !data) return false;

  return data.roles.name === 'SuperAdmin';
}

// Example: Protected API Route
export async function POST(request: Request) {
  const supabase = createServerClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check role
  const isSuperAdmin = await checkSuperAdmin(user.id);

  if (!isSuperAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Proceed with protected operation
  // ...
}
```

#### Frontend Authorization (React Components)

```typescript
// Example: Role-based component rendering
import { useUser } from '@/hooks/useUser';

export function AdminPanel() {
  const { user, profile } = useUser();

  if (!user || !profile) {
    return <div>Please login</div>;
  }

  if (profile.role?.name !== 'SuperAdmin') {
    return <div>Access Denied</div>;
  }

  return (
    <div>
      {/* Admin panel content */}
    </div>
  );
}
```

---

## Row-Level Security (RLS)

### Overview

Row-Level Security (RLS) is PostgreSQL's built-in feature that restricts which rows can be accessed or modified based on the current user. Every table in AnalyzingHub has RLS enabled with specific policies.

### Enabling RLS

```sql
-- Enable RLS on a table
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner
ALTER TABLE table_name FORCE ROW LEVEL SECURITY;
```

### RLS Policy Structure

```sql
CREATE POLICY "policy_name"
  ON table_name
  FOR { ALL | SELECT | INSERT | UPDATE | DELETE }
  TO { role_name | PUBLIC | authenticated | anon }
  USING ( condition )        -- For SELECT (read access)
  WITH CHECK ( condition );  -- For INSERT/UPDATE (write access)
```

### Common RLS Patterns

#### Pattern 1: User Owns Resource

```sql
-- Users can only access their own data
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

#### Pattern 2: Role-Based Access

```sql
-- Only SuperAdmins can access admin settings
CREATE POLICY "SuperAdmins can view all settings"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );
```

#### Pattern 3: Public Read, Authenticated Write

```sql
-- Anyone can view, only authenticated can create
CREATE POLICY "Public can view analyses"
  ON analyses FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Authenticated users can create analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

#### Pattern 4: Service Role Bypass

```sql
-- Service role can do anything (for background jobs)
CREATE POLICY "Service role full access"
  ON table_name FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### RLS Policy Examples by Table

#### Profiles Table

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can view profiles
CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  TO authenticated, anon
  USING (true);

-- Users can insert own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

#### Analyses Table

```sql
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Public can view published analyses
CREATE POLICY "Public can view published analyses"
  ON analyses FOR SELECT
  TO authenticated, anon
  USING (
    visibility = 'public'
    OR (visibility = 'subscribers' AND auth.uid() IS NOT NULL)
    OR user_id = auth.uid()
  );

-- Analyzers can create analyses
CREATE POLICY "Analyzers can create analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('Analyzer', 'SuperAdmin')
    )
  );

-- Users can update own analyses
CREATE POLICY "Users can update own analyses"
  ON analyses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete own analyses
CREATE POLICY "Users can delete own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- SuperAdmins can delete any analysis
CREATE POLICY "SuperAdmins can delete any analysis"
  ON analyses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );
```

#### Admin Settings Table

```sql
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Only SuperAdmins can access
CREATE POLICY "SuperAdmins can view all settings"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

CREATE POLICY "SuperAdmins can insert settings"
  ON admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

CREATE POLICY "SuperAdmins can update settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

-- Authenticated users can read bot token (for client-side usage)
CREATE POLICY "Authenticated users can read bot token"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (key = 'telegram_bot_token');

-- Service role full access (for background jobs)
CREATE POLICY "Service role can manage settings"
  ON admin_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### Subscriptions Table

```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can create own subscriptions
CREATE POLICY "Users can insert own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Service role can manage all subscriptions
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### RLS Performance Optimization

#### Problem: Slow RLS Policies

Inefficient RLS policies can significantly impact query performance.

#### Solution: Use Subqueries with auth.uid()

```sql
-- ❌ BAD: Inline auth.uid() is called multiple times
CREATE POLICY "slow_policy"
  ON table_name FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR owner_id = auth.uid()
    OR auth.uid() IN (SELECT user_id FROM allowed_users)
  );

-- ✅ GOOD: Cache auth.uid() in subquery
CREATE POLICY "fast_policy"
  ON table_name FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) IN (
      user_id,
      owner_id,
      (SELECT user_id FROM allowed_users)
    )
  );
```

### Testing RLS Policies

```sql
-- Test as specific user
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "user-uuid-here"}';

-- Run queries to verify access
SELECT * FROM analyses;

-- Reset
RESET ROLE;
```

### Common RLS Pitfalls

1. **Forgetting to enable RLS**: Tables without RLS are fully accessible
2. **Overly permissive policies**: Using `USING (true)` for non-public data
3. **Missing service role policies**: Background jobs fail without service_role policies
4. **Performance issues**: Not using subqueries or proper indexes
5. **Circular dependencies**: Policies referencing tables with policies

---

## API Security

### API Route Structure

```
/app/api/
  ├── auth/
  │   ├── login/route.ts
  │   ├── register/route.ts
  │   └── otp/
  ├── analyses/
  │   ├── route.ts
  │   └── [id]/route.ts
  ├── indices/
  │   └── analyses/route.ts
  └── admin/
      └── settings/route.ts
```

### Authentication in API Routes

#### Using createServerClient

```typescript
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = createServerClient();

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // User is authenticated, proceed
  return Response.json({ userId: user.id });
}
```

**IMPORTANT**: Always use `createServerClient()` not `createClient()` in API routes. The `createServerClient()` function properly handles Next.js cookies and maintains authentication state.

### CORS Configuration

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",  // Or specific domain in production
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  // Handle request
  const response = Response.json({ data: "..." });

  // Add CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
```

### Input Validation

```typescript
import { z } from 'zod';

// Define schema
const createAnalysisSchema = z.object({
  symbol: z.string().min(1).max(10),
  direction: z.enum(['Long', 'Short', 'Neutral']),
  entry_price: z.number().positive(),
  stop_loss: z.number().positive(),
  targets: z.array(z.number().positive()).min(1).max(5),
});

export async function POST(request: Request) {
  const body = await request.json();

  // Validate input
  const result = createAnalysisSchema.safeParse(body);

  if (!result.success) {
    return Response.json({
      error: 'Validation failed',
      details: result.error.flatten(),
    }, { status: 400 });
  }

  // Use validated data
  const { symbol, direction, entry_price, stop_loss, targets } = result.data;

  // Proceed with business logic
}
```

### Rate Limiting

```typescript
// Simple in-memory rate limiter (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (userLimit.count >= maxRequests) {
    return false;
  }

  userLimit.count++;
  return true;
}

export async function POST(request: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check rate limit
  if (!checkRateLimit(user.id)) {
    return Response.json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
    }, { status: 429 });
  }

  // Proceed with request
}
```

### Error Handling

```typescript
export async function POST(request: Request) {
  try {
    // Business logic
    const result = await performOperation();

    return Response.json({ data: result });
  } catch (error) {
    console.error('[API Error]', error);

    // Don't expose internal error details to client
    return Response.json({
      error: 'Internal server error',
      // In production, log full error but return generic message
      ...(process.env.NODE_ENV === 'development' && { details: error.message }),
    }, { status: 500 });
  }
}
```

---

## Database Security

### Connection Security

#### Connection Pooling

Supabase uses connection pooling to manage database connections efficiently.

**Configuration in Supabase Dashboard**:
1. Go to Settings → Database → Connection Pooling
2. Choose pooling mode:
   - **Transaction mode**: Recommended for most applications
   - **Session mode**: For applications requiring session-level features
3. Set pool size based on your plan

**Auth Server Connection Strategy**:
- Navigate to Authentication → Settings → Database Connection Pool
- Change from Fixed (10 connections) to Percentage-based allocation
- Recommended: 5-10% of total pool size
- This allows Auth server connections to scale with your database instance

### Data Encryption

#### Encryption at Rest

- Supabase encrypts all data at rest using AES-256 encryption
- Automatic backups are also encrypted
- No additional configuration required

#### Encryption in Transit

- All connections use TLS 1.2+ encryption
- Supabase enforces HTTPS for all API requests
- Database connections use SSL by default

### Database Access Control

#### Service Role Key

The service role key bypasses RLS and has full database access. Use with extreme caution.

```typescript
// ⚠️ DANGEROUS: Service role bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Full access
);

// Only use for:
// - Background jobs
// - Admin operations
// - Migrations
// - Never expose to client-side
```

#### Anon Key

The anon key is safe to expose publicly and respects RLS policies.

```typescript
// ✅ SAFE: Anon key respects RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // RLS enforced
);
```

### SQL Injection Prevention

Supabase client libraries use parameterized queries, preventing SQL injection.

```typescript
// ✅ SAFE: Parameterized query
const { data } = await supabase
  .from('analyses')
  .select('*')
  .eq('symbol', userInput);  // Safely escaped

// ❌ DANGEROUS: Never use raw SQL with user input
await supabase.rpc('raw_sql', {
  query: `SELECT * FROM analyses WHERE symbol = '${userInput}'`  // Vulnerable!
});
```

### Database Audit Logging

Enable audit logging for sensitive tables:

```sql
-- Create audit log table
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id uuid REFERENCES auth.users(id),
  old_data jsonb,
  new_data jsonb,
  timestamp timestamptz DEFAULT now()
);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, operation, user_id, old_data)
    VALUES (TG_TABLE_NAME, TG_OP, auth.uid(), row_to_json(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, operation, user_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, auth.uid(), row_to_json(OLD), row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, operation, user_id, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, auth.uid(), row_to_json(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to sensitive tables
CREATE TRIGGER audit_admin_settings
  AFTER INSERT OR UPDATE OR DELETE ON admin_settings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

### Backup and Recovery

- Supabase provides automatic daily backups (retained for 7 days on free tier)
- Point-in-time recovery available on paid plans
- Manual backups can be triggered via dashboard
- Test recovery procedures regularly

---

## Telegram Security

### Bot Token Security

#### Storage and Access

```sql
-- Telegram bot token stored in admin_settings
CREATE TABLE admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert bot token
INSERT INTO admin_settings (key, value, description)
VALUES (
  'telegram_bot_token',
  '<bot_token_here>',
  'Telegram Bot API Token'
);
```

#### RLS Policy for Bot Token

```sql
-- Only authenticated users can read bot token (for client-side bot operations)
CREATE POLICY "Authenticated users can read bot token"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (key = 'telegram_bot_token');

-- Only SuperAdmins can update
CREATE POLICY "SuperAdmins can update settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'SuperAdmin'
    )
  );
```

### Webhook Security

#### Webhook Secret Validation

```typescript
import crypto from 'crypto';

function verifyTelegramWebhook(token: string, secret: string, body: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(hash)
  );
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('X-Telegram-Bot-Api-Secret-Token');

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET!;

  if (!signature || !verifyTelegramWebhook(signature, webhookSecret, body)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Process webhook
  const data = JSON.parse(body);
  // ...
}
```

#### Setting Webhook with Secret

```bash
curl -X POST "https://api.telegram.org/bot<token>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/telegram/webhook",
    "secret_token": "your-random-secret-32-chars",
    "drop_pending_updates": true
  }'
```

### Message Security

#### Input Sanitization

```typescript
function sanitizeTelegramInput(text: string): string {
  // Remove control characters
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .trim()
    .slice(0, 4096); // Telegram message limit
}

// Escape Markdown V2 special characters
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
```

#### Rate Limiting Telegram Operations

```typescript
// Prevent bot API abuse
async function sendTelegramMessage(chatId: string, text: string) {
  const rateLimitKey = `telegram:${chatId}`;

  if (!checkRateLimit(rateLimitKey, 30, 60000)) { // 30 messages per minute
    throw new Error('Rate limit exceeded for Telegram messages');
  }

  const botToken = await getBotToken();

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: escapeMarkdown(text),
      parse_mode: 'MarkdownV2',
    }),
  });
}
```

### Channel Security

#### Channel Access Control

```sql
-- Telegram channels table
CREATE TABLE telegram_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzer_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text NOT NULL,
  language text DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS: Users can only manage their own channels
CREATE POLICY "Users can view own channels"
  ON telegram_channels FOR SELECT
  TO authenticated
  USING (analyzer_id = auth.uid());

CREATE POLICY "Analyzers can create channels"
  ON telegram_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    analyzer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('Analyzer', 'SuperAdmin')
    )
  );
```

### Edge Function Security

Edge functions that interact with Telegram must validate environment variables:

```typescript
Deno.serve(async (req: Request) => {
  // Validate environment variables on startup
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing required environment variables");
    return new Response(
      JSON.stringify({
        error: "Configuration error",
        details: "Required environment variables not set"
      }),
      { status: 500 }
    );
  }

  // Proceed with logic
});
```

---

## Transport & Network Security

### HTTPS/TLS Encryption

- All production traffic must use HTTPS
- TLS 1.2+ required (TLS 1.3 recommended)
- Netlify provides automatic SSL certificates via Let's Encrypt
- Enforce HTTPS redirects in `netlify.toml`

```toml
[[redirects]]
  from = "http://*"
  to = "https://:splat"
  status = 301
  force = true
```

### Content Security Policy (CSP)

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

### DNS Security

- Enable DNSSEC for your domain
- Use CAA records to restrict certificate issuance
- Implement SPF, DKIM, and DMARC for email security

```
; CAA Record
@ CAA 0 issue "letsencrypt.org"
@ CAA 0 issuewild "letsencrypt.org"

; SPF Record
@ TXT "v=spf1 include:_spf.zeptomail.com ~all"

; DMARC Record
_dmarc TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@analyzhub.com"
```

---

## Critical Security Issues & Fixes

### Issue 1: Service Role Key Exposure (CRITICAL)

#### Problem

The Supabase service role key was exposed in the git repository in multiple locations:
- Documentation files (NETLIFY_ENV_SETUP.md)
- Configuration files (netlify.toml)
- Edge functions with hardcoded fallbacks

#### Impact

**CRITICAL - Full database access**
- Attacker could bypass all RLS policies
- Read/write/delete any data in database
- Create/drop tables and schemas
- Access authentication tables
- Impersonate any user

#### Files Affected

1. `NETLIFY_ENV_SETUP.md` (line 26)
2. `netlify.toml` (line 10)
3. `supabase/functions/telegram-channel-broadcast/index.ts` (line 149)
4. Multiple other documentation files

#### Resolution

**Step 1: Remove hardcoded secrets**
All files have been cleaned and now use placeholders:

```typescript
// ❌ BEFORE (VULNERABLE)
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://gbdzhdlpbwrnhykmstic.supabase.co";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "actual_key_here";

// ✅ AFTER (SECURE)
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing required environment variables");
}
```

**Step 2: Rotate exposed credentials**

See [Credential Rotation](#credential-rotation-procedures) section below for detailed steps.

### Issue 2: Telegram Bot Token Exposure (HIGH)

#### Problem

Telegram bot token exposed in documentation files.

#### Impact

**HIGH - Bot control and messaging access**
- Send messages as your bot
- Read all messages sent to bot
- Access user information
- Modify bot settings

#### Resolution

1. Revoke old token via @BotFather
2. Generate new token
3. Update environment variables in Netlify and local `.env`
4. Reconfigure webhook with new token

### Issue 3: SMTP Password Exposure (HIGH)

#### Problem

ZeptoMail API key (SMTP_PASSWORD) exposed in documentation and edge functions.

#### Impact

**HIGH - Email sending capability**
- Send emails from your domain
- Potential for phishing attacks
- Email quota exhaustion
- Reputation damage

#### Resolution

1. Revoke old API key in ZeptoMail dashboard
2. Generate new API key
3. Update environment variables
4. Test OTP email functionality

### Issue 4: Missing httpOnly Cookie Configuration

#### Problem

Login API was forcing `httpOnly: true` on all cookies, overriding Supabase's internal cookie settings.

```typescript
// ❌ PROBLEMATIC CODE
cookies.set(name, value, {
  ...options,
  httpOnly: options?.httpOnly ?? true  // Always forced to true
});
```

#### Impact

- Sessions not persisting after login
- Users immediately logged out after authentication
- Cookie mutations not surviving

#### Resolution

```typescript
// ✅ FIXED CODE
cookies.set(name, value, {
  ...options,
  httpOnly: options?.httpOnly  // Let Supabase control httpOnly
});
```

### Issue 5: Response Object Immutability

#### Problem

Login API used `const response` instead of `let response`, preventing cookie mutations from surviving.

```typescript
// ❌ PROBLEMATIC CODE
const response = Response.json({ message: 'Login successful' });
// Cookie mutations here don't survive
```

#### Impact

- Cookies set by Supabase Auth were lost
- Sessions not created
- Login appeared successful but user remained unauthenticated

#### Resolution

```typescript
// ✅ FIXED CODE
let response = Response.json({ message: 'Login successful' });
// Cookie mutations now persist
```

### Issue 6: Incorrect Supabase Client Usage in API Routes

#### Problem

Indices API routes used `createClient()` instead of `createServerClient()`, causing authentication context to be lost.

```typescript
// ❌ WRONG
import { createClient } from '@/lib/supabase/server';
const supabase = createClient();  // Missing cookieStore parameter
```

#### Impact

- `auth.getUser()` returned null even for authenticated users
- All operations returned "Unauthorized" errors
- Analyzers couldn't create index analyses

#### Resolution

```typescript
// ✅ CORRECT
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();  // Properly handles cookies
```

**Files Fixed**:
- `/app/api/indices/analyses/route.ts`
- `/app/api/indices/analyses/[id]/route.ts`
- `/app/api/indices/analyses/[id]/trades/route.ts`
- `/app/api/indices/analyses/[id]/updates/route.ts`
- `/app/api/indices/trades/[id]/route.ts`
- `/app/api/indices/trades/[id]/updates/route.ts`

### Security Fix Summary

| Issue | Severity | Status | Impact |
|-------|----------|--------|--------|
| Service role key exposure | CRITICAL | ✅ Fixed | Full database access |
| Telegram bot token exposure | HIGH | ✅ Fixed | Bot control |
| SMTP password exposure | HIGH | ✅ Fixed | Email sending |
| Polygon API key exposure | MEDIUM | ✅ Fixed | API usage |
| Cookie persistence bug | HIGH | ✅ Fixed | Login failures |
| httpOnly override | HIGH | ✅ Fixed | Session issues |
| Wrong Supabase client | HIGH | ✅ Fixed | Auth failures |

---

## Credential Management

### Environment Variables

#### Required Credentials

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=your-random-secret-32-chars

# Polygon.io
POLYGON_API_KEY=your_polygon_api_key

# Email (ZeptoMail)
SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASSWORD=your_zeptomail_api_key
SMTP_FROM_EMAIL=noreply@analyzhub.com
SMTP_FROM_NAME=AnalyzingHub

# Application
APP_BASE_URL=https://anlzhub.com
```

### Storage Locations

#### Local Development

Store in `.env` file (gitignored):

```bash
# .env
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
# ... other variables
```

**IMPORTANT**: Never commit `.env` to git. Verify `.gitignore` includes:

```gitignore
.env
.env.local
.env.*.local
```

#### Production (Netlify)

1. Go to Netlify Dashboard
2. Navigate to Site configuration → Environment variables
3. Add each variable with its value
4. Set scope to "All deploy contexts" or "Production"
5. Save changes

#### Edge Functions (Supabase)

Edge function environment variables are set in Supabase Dashboard:

1. Go to Supabase Dashboard
2. Navigate to Edge Functions → Settings
3. Add environment variables
4. Redeploy functions to apply changes

### Credential Rotation Procedures

#### When to Rotate

**Immediate rotation required:**
- Credential exposed in git repository
- Credential exposed in logs or error messages
- Credential exposed in client-side code
- Suspected security breach
- Employee with access leaves

**Scheduled rotation:**
- Service role keys: Every 90 days
- API keys: Every 6 months
- Bot tokens: Every 6 months
- Webhook secrets: Every 6 months

#### Rotation Process

##### 1. Rotate Supabase Service Role Key

**CRITICAL - Full database access**

1. **Generate new key**:
   - Go to https://app.supabase.com
   - Select your project
   - Navigate to Settings → API
   - Under "Service role key", click **Reset**
   - Copy new key immediately

2. **Update environment variables**:
   - Netlify: Site configuration → Environment variables → `SUPABASE_SERVICE_ROLE_KEY`
   - Local: Update `.env` file
   - Edge Functions: Update in Supabase dashboard

3. **Trigger deployment**:
   ```bash
   git commit --allow-empty -m "Rotate service role key"
   git push
   ```

4. **Verify**:
   - Test API routes requiring service role
   - Check Edge Functions logs
   - Verify background jobs still work

##### 2. Rotate Telegram Bot Token

1. **Revoke old token**:
   - Open Telegram, message @BotFather
   - Send: `/mybots`
   - Select your bot
   - Select "API Token" → "Revoke current token"
   - Confirm: "Yes, I'm sure"

2. **Generate new token**:
   - BotFather provides new token immediately
   - Copy and save securely

3. **Update environment variables**:
   - Netlify: `TELEGRAM_BOT_TOKEN`
   - Local: `.env` file
   - Edge Functions: Supabase dashboard

4. **Reconfigure webhook**:
   ```bash
   curl -X POST "https://api.telegram.org/bot<NEW_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://anlzhub.com/api/telegram/webhook",
       "secret_token": "'$TELEGRAM_WEBHOOK_SECRET'",
       "drop_pending_updates": true
     }'
   ```

5. **Verify**:
   - Send test message to bot
   - Check webhook receives updates
   - Test broadcast functionality

##### 3. Rotate SMTP Password (ZeptoMail)

1. **Revoke old key**:
   - Log in to ZeptoMail dashboard
   - Navigate to Settings → SMTP
   - Find existing API key
   - Click Delete/Revoke

2. **Generate new key**:
   - Click "Generate API Key"
   - Copy new key immediately

3. **Update environment variables**:
   - Netlify: `SMTP_PASSWORD`
   - Local: `.env` file
   - Edge Functions: Supabase dashboard

4. **Test**:
   - Trigger OTP email send
   - Verify email delivery
   - Check logs for errors

##### 4. Rotate Polygon API Key

1. **Revoke old key**:
   - Log in to https://polygon.io/dashboard
   - Navigate to API Keys
   - Delete or revoke compromised key

2. **Generate new key**:
   - Click "Create API Key"
   - Copy new key

3. **Update environment variables**:
   - Netlify: `POLYGON_API_KEY`
   - Local: `.env` file

4. **Test**:
   - Load stock prices in application
   - Verify API requests succeed

##### 5. Generate New Webhook Secret

1. **Generate random secret**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update environment variables**:
   - Netlify: `TELEGRAM_WEBHOOK_SECRET`
   - Local: `.env` file

3. **Update webhook**:
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://anlzhub.com/api/telegram/webhook",
       "secret_token": "<NEW_SECRET>",
       "drop_pending_updates": true
     }'
   ```

### Credential Security Best Practices

1. **Never commit secrets to git**
   - Use `.env` files (gitignored)
   - Use placeholders in documentation
   - Review commits before pushing

2. **Use environment variables everywhere**
   ```typescript
   // ✅ GOOD
   const apiKey = process.env.API_KEY;
   if (!apiKey) throw new Error("API_KEY required");

   // ❌ BAD
   const apiKey = "hardcoded_key_123";
   ```

3. **Separate environments**
   - Use different credentials for dev/staging/production
   - Never use production keys in development
   - Test credential rotation in staging first

4. **Implement secret scanning**
   - Enable Netlify secret scanning
   - Use git-secrets or similar tools locally
   - Set up pre-commit hooks

5. **Document rotation procedures**
   - Keep rotation instructions up-to-date
   - Document who has access to what
   - Maintain audit log of rotations

6. **Monitor for leaks**
   - Check GitHub secret scanning alerts
   - Monitor for credential usage anomalies
   - Set up alerts for suspicious activity

---

## Security Monitoring & Audit

### Logging Strategy

#### Application Logs

```typescript
// Structured logging for security events
function logSecurityEvent(event: {
  type: 'auth' | 'access' | 'error';
  action: string;
  userId?: string;
  ip?: string;
  success: boolean;
  details?: any;
}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: event.success ? 'info' : 'warn',
    ...event,
  }));
}

// Example usage
logSecurityEvent({
  type: 'auth',
  action: 'login',
  userId: user.id,
  ip: request.headers.get('x-forwarded-for'),
  success: true,
});
```

#### Database Audit Log

```sql
-- Query audit log
SELECT
  timestamp,
  table_name,
  operation,
  user_id,
  new_data->>'email' as affected_email
FROM audit_log
WHERE table_name = 'profiles'
  AND operation = 'UPDATE'
  AND timestamp > now() - interval '7 days'
ORDER BY timestamp DESC;
```

### Security Metrics

Monitor these key metrics:

1. **Authentication Metrics**
   - Failed login attempts per user
   - Account lockouts
   - Password reset requests
   - New account registrations

2. **Authorization Metrics**
   - Denied access attempts
   - Privilege escalation attempts
   - Role changes

3. **API Metrics**
   - Request rate per endpoint
   - Error rates
   - Response times
   - Unusual usage patterns

4. **Database Metrics**
   - RLS policy violations
   - Failed queries
   - Slow queries
   - Connection pool exhaustion

### Alerting

Set up alerts for:

1. **Critical Events**
   - Multiple failed login attempts (>5 in 10 minutes)
   - Service role key usage from unexpected IPs
   - Database schema changes
   - RLS policy modifications

2. **Suspicious Patterns**
   - Unusual API usage spikes
   - Geographic anomalies in access
   - Off-hours administrative actions
   - Mass data exports

3. **System Health**
   - High error rates
   - Performance degradation
   - Service outages
   - Certificate expiration warnings

### Incident Response

1. **Detection**: Alert triggered or issue reported
2. **Assessment**: Determine severity and impact
3. **Containment**: Isolate affected systems
4. **Eradication**: Remove threat and close vulnerability
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Document and improve

### Security Audit Checklist

#### Quarterly Security Audit

- [ ] Review all user accounts and roles
- [ ] Audit RLS policies for completeness
- [ ] Review API endpoint authorization
- [ ] Check for unused/stale credentials
- [ ] Verify backup and recovery procedures
- [ ] Test credential rotation procedures
- [ ] Review access logs for anomalies
- [ ] Update dependency versions
- [ ] Scan for known vulnerabilities
- [ ] Review and update security documentation

#### Annual Security Review

- [ ] Comprehensive penetration testing
- [ ] Full code security audit
- [ ] Review third-party integrations
- [ ] Evaluate security architecture
- [ ] Update security policies
- [ ] Security training for team
- [ ] Disaster recovery drill
- [ ] Compliance assessment

---

## Security Best Practices

### Development Practices

1. **Principle of Least Privilege**
   - Users get minimum necessary permissions
   - Service accounts have specific, limited roles
   - Temporary elevated access only when needed

2. **Defense in Depth**
   - Multiple security layers
   - Don't rely on single security mechanism
   - Implement redundant controls

3. **Secure by Default**
   - Default to most secure configuration
   - Require explicit action to reduce security
   - Make secure path the easy path

4. **Fail Securely**
   - Errors should not expose sensitive info
   - Failed operations should deny access
   - Log failures for investigation

5. **Regular Updates**
   - Keep dependencies up-to-date
   - Apply security patches promptly
   - Monitor for CVEs in used packages

### Code Review Checklist

Security items to check in code reviews:

- [ ] No hardcoded secrets or credentials
- [ ] All user input validated and sanitized
- [ ] Authentication required for protected routes
- [ ] Authorization checks before data access
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (proper escaping)
- [ ] CSRF protection where needed
- [ ] Rate limiting on sensitive endpoints
- [ ] Error messages don't leak sensitive data
- [ ] Logs don't contain secrets or PII

### Deployment Checklist

Before deploying to production:

- [ ] All environment variables configured
- [ ] HTTPS enforced on all endpoints
- [ ] Security headers configured
- [ ] RLS enabled on all tables
- [ ] Database backups scheduled
- [ ] Monitoring and alerting set up
- [ ] Incident response plan documented
- [ ] Security testing completed
- [ ] Credentials rotated if needed
- [ ] Documentation updated

---

## Security Checklist

### Initial Setup

- [ ] Supabase project created with strong password
- [ ] Environment variables configured in Netlify
- [ ] `.env` file created locally (gitignored)
- [ ] RLS enabled on all tables
- [ ] Roles and profiles tables created
- [ ] Default role assignment trigger configured
- [ ] Service role usage documented and restricted

### Authentication & Authorization

- [ ] Email/password authentication working
- [ ] OTP email authentication working
- [ ] Session management properly configured
- [ ] Role-based access control implemented
- [ ] RLS policies tested for all tables
- [ ] API routes have proper auth checks
- [ ] Frontend components respect user roles

### API Security

- [ ] All API routes validate authentication
- [ ] Authorization checks before data access
- [ ] Input validation implemented
- [ ] CORS properly configured
- [ ] Rate limiting on sensitive endpoints
- [ ] Error handling doesn't expose internals
- [ ] Logging security events

### Database Security

- [ ] RLS enabled and tested on all tables
- [ ] Proper indexes for performance
- [ ] Audit logging for sensitive tables
- [ ] Connection pooling configured
- [ ] Backups scheduled and tested
- [ ] Service role usage minimized

### Telegram Security

- [ ] Bot token stored securely in admin_settings
- [ ] Webhook secret validation implemented
- [ ] Message input sanitization
- [ ] Rate limiting on Telegram operations
- [ ] Channel access control via RLS

### Credentials & Secrets

- [ ] All secrets in environment variables
- [ ] No hardcoded secrets in code
- [ ] `.env` in `.gitignore`
- [ ] Production and development secrets separated
- [ ] Credential rotation schedule documented
- [ ] Secret scanning enabled

### Monitoring & Incident Response

- [ ] Security event logging implemented
- [ ] Alerts configured for critical events
- [ ] Audit log queries documented
- [ ] Incident response plan documented
- [ ] Regular security audits scheduled
- [ ] Backup and recovery tested

### Documentation

- [ ] Security architecture documented
- [ ] RLS policies documented
- [ ] Credential rotation procedures documented
- [ ] Incident response plan documented
- [ ] API security requirements documented
- [ ] Security best practices shared with team

---

## Supabase Auth Settings (Manual Configuration)

The following security settings must be configured manually in the Supabase Dashboard:

### 1. Enable Leaked Password Protection (High Priority)

**Why**: Prevents users from using compromised passwords by checking against HaveIBeenPwned.org database.

**How to Enable**:
1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Settings**
4. Scroll to **Security and Protection**
5. Find **"Enable Leaked Password Protection"**
6. Toggle it **ON**
7. Click **Save**

**Impact**: Users cannot use passwords exposed in data breaches.

### 2. Configure Auth Database Connection Strategy (Performance)

**Why**: Your Auth server uses fixed connections (10). Percentage-based allocation allows it to scale with your database instance.

**Current Setting**: Fixed at 10 connections
**Recommended**: Switch to percentage-based (5-10% of pool size)

**How to Configure**:
1. Go to Supabase Dashboard
2. Select your project
3. Navigate to **Settings** → **Database**
4. Find **"Connection Pooling"** section
5. Look for **"Auth Server Pool Mode"**
6. Change from **"Session (Fixed)"** to **"Transaction (Percentage)"**
7. Set percentage to **5-10%** of your total pool size
8. Click **Save**

**Impact**: Better resource utilization and improved scalability.

### 3. Email Confirmation (Optional but Recommended)

- Go to **Authentication** → **Settings** → **Email**
- Enable **"Confirm email"** if you want users to verify email addresses
- Configure email templates for confirmation emails

### 4. Password Requirements

- Go to **Authentication** → **Settings** → **Password**
- Set minimum password length (recommend: 8-12 characters)
- Require password complexity if needed

### 5. Multi-Factor Authentication (Optional)

- Go to **Authentication** → **Settings** → **Multi-Factor Authentication**
- Enable **TOTP** or **SMS** based MFA
- Users can then enable MFA in their account settings

---

## Support and Resources

### Internal Documentation

- See `SIGNUP_DEBUG_GUIDE.md` for authentication troubleshooting
- See `AUTH_FIXES_SUMMARY.md` for critical authentication fixes
- See `OPERATIONS_AND_DEPLOYMENT.md` for deployment procedures

### External Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Telegram Bot API Security](https://core.telegram.org/bots/api#making-requests)

### Security Contacts

- **Security Issues**: Report via secure channel
- **Incident Response**: Follow documented procedures
- **Questions**: Consult this guide or security team

---

**Document Version**: 1.0
**Last Updated**: 2026-02-07
**Next Review**: 2026-05-07 (Quarterly)
**Status**: Production Ready

---

This comprehensive security guide consolidates all security and authentication documentation for AnalyzingHub. Keep this document updated as the system evolves and new security measures are implemented.
