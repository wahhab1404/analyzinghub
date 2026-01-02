# AnalyzingHub Deployment Guide

Complete guide to deploy the AnalyzingHub platform to production.

## Prerequisites

- Supabase account and project
- Netlify/Vercel account (or any hosting platform)
- Domain name (optional)
- Telegram Bot Token (from @BotFather)
- Polygon.io API key (for stock prices)
- SMTP credentials (for email notifications)

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and set project name
4. Set database password (save this securely)
5. Select region closest to your users
6. Wait for project to be created (2-3 minutes)

### 1.2 Get Supabase Credentials

From your Supabase dashboard:

1. Go to **Settings** > **API**
2. Copy the following:
   - **Project URL** (NEXT_PUBLIC_SUPABASE_URL)
   - **anon public key** (NEXT_PUBLIC_SUPABASE_ANON_KEY)
   - **service_role key** (SUPABASE_SERVICE_ROLE_KEY)

### 1.3 Apply Database Migrations

All migrations are in the `supabase/migrations/` folder. Apply them in order:

**Option A: Using Supabase Dashboard**
1. Go to **SQL Editor** in your Supabase dashboard
2. For each migration file (in chronological order):
   - Copy the SQL content
   - Paste into SQL Editor
   - Click "Run"

**Option B: Using Supabase CLI** (if installed)
```bash
supabase link --project-ref your-project-ref
supabase db push
```

### 1.4 Configure Supabase Auth

1. Go to **Authentication** > **Providers** > **Email**
2. Enable Email provider
3. **Disable** "Confirm email" (important for OTP login)
4. Go to **Authentication** > **URL Configuration**
5. Set **Site URL** to your production domain (e.g., https://analyzhub.com)
6. Add **Redirect URLs**:
   - `https://yourdomain.com/dashboard`
   - `https://yourdomain.com/auth/callback`

### 1.5 Configure Storage

1. Go to **Storage**
2. Verify buckets exist:
   - `avatars` (public)
   - `chart-images` (public)
3. If they don't exist, the migrations should create them

## Step 2: External Services Setup

### 2.1 Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow prompts to create your bot
4. Save the **Bot Token** (TELEGRAM_BOT_TOKEN)
5. Generate a random webhook secret:
   ```bash
   openssl rand -base64 32
   ```
   Save this as TELEGRAM_WEBHOOK_SECRET

### 2.2 Polygon.io API Key

1. Sign up at [polygon.io](https://polygon.io)
2. Choose a plan (free tier available)
3. Copy your API key (POLYGON_API_KEY)

### 2.3 Email SMTP Setup

For ZeptoMail (recommended):
1. Sign up at [zeptomail.zoho.com](https://zeptomail.zoho.com)
2. Verify your domain
3. Create SMTP credentials
4. Save:
   - SMTP_HOST: `smtp.zeptomail.com`
   - SMTP_PORT: `587`
   - SMTP_USER: `emailapikey`
   - SMTP_PASSWORD: your password
   - SMTP_FROM_EMAIL: `noreply@yourdomain.com`
   - SMTP_FROM_NAME: `AnalyzingHub`

## Step 3: Deployment to Netlify

### 3.1 Connect Repository

1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" > "Import an existing project"
4. Connect your Git provider
5. Select your repository

### 3.2 Configure Build Settings

Netlify should auto-detect from `netlify.toml`:
- **Build command**: `npx next build`
- **Publish directory**: `.next`
- **Functions directory**: (auto-configured by @netlify/plugin-nextjs)

### 3.3 Set Environment Variables

Go to **Site settings** > **Environment variables** and add:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Polygon API
POLYGON_API_KEY=your_polygon_api_key

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=your_random_secret_here

# App URL (your production domain)
APP_BASE_URL=https://your-site.netlify.app

# Email SMTP
SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=AnalyzingHub
```

### 3.4 Deploy

1. Click "Deploy site"
2. Wait for build to complete (3-5 minutes)
3. Your site will be live at `https://your-site.netlify.app`

### 3.5 Custom Domain (Optional)

1. Go to **Domain settings**
2. Click "Add custom domain"
3. Follow instructions to:
   - Add DNS records
   - Enable HTTPS (automatic via Let's Encrypt)

## Step 4: Deployment to Vercel (Alternative)

### 4.1 Connect Repository

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" > "Project"
3. Import your Git repository

### 4.2 Configure Project

- **Framework Preset**: Next.js
- **Root Directory**: ./
- **Build Command**: `next build`
- **Output Directory**: (auto-detected)

### 4.3 Environment Variables

Add the same environment variables as Step 3.3

### 4.4 Deploy

1. Click "Deploy"
2. Wait for deployment (2-4 minutes)
3. Site live at `https://your-project.vercel.app`

## Step 5: Post-Deployment Setup

### 5.1 Setup Telegram Webhook

After deployment, set up the webhook:

**Method 1: Using API endpoint**
Visit in browser:
```
https://yourdomain.com/api/telegram/setup-webhook-public
```

**Method 2: Using curl**
```bash
curl -X POST https://yourdomain.com/api/telegram/setup-webhook
```

Verify webhook:
```
https://yourdomain.com/api/telegram/status
```

### 5.2 Create Admin Account

**Option 1: Through registration**
1. Visit `https://yourdomain.com/register`
2. Create account with your admin email
3. In Supabase SQL Editor:
   ```sql
   UPDATE profiles
   SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin')
   WHERE email = 'your-admin@email.com';
   ```

**Option 2: Direct SQL**
```sql
-- Create admin in auth.users
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES ('admin@yourdomain.com', crypt('YourPassword123!', gen_salt('bf')), now());

-- Create profile
INSERT INTO profiles (id, email, full_name, role_id)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@yourdomain.com'),
  'admin@yourdomain.com',
  'Admin User',
  (SELECT id FROM roles WHERE name = 'SuperAdmin')
);
```

### 5.3 Create Test Analyzer Account

Use the npm script:
```bash
npm run create:analyzer
```

Or manually through registration and upgrade role in Supabase.

### 5.4 Configure Cron Jobs (Optional)

For subscription expiration and warnings, set up cron jobs:

**Netlify**
1. Use scheduled functions or external service like cron-job.org
2. Schedule calls to:
   - `POST https://yourdomain.com/api/subscriptions/process-warnings` (daily)
   - `POST https://yourdomain.com/api/subscriptions/process-expiration` (daily)

**Vercel**
1. Use Vercel Cron Jobs
2. Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/subscriptions/process-warnings",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/subscriptions/process-expiration",
      "schedule": "0 10 * * *"
    }
  ]
}
```

### 5.5 Test Core Functionality

1. **Authentication**:
   - Register new account
   - Login/Logout
   - OTP login

2. **Create Analysis**:
   - Login as Analyzer
   - Create a test analysis with chart
   - Verify it appears in feed

3. **Subscriptions**:
   - Login as Trader
   - Subscribe to an analyzer
   - Verify subscription status

4. **Telegram**:
   - Connect Telegram channel as analyzer
   - Create analysis
   - Verify broadcast to Telegram

## Step 6: Monitoring & Maintenance

### 6.1 Setup Monitoring

**Supabase**:
1. Go to **Reports** to monitor:
   - Database usage
   - API requests
   - Storage usage

**Netlify/Vercel**:
1. Monitor build logs
2. Check function logs for errors
3. Set up alerts for downtime

### 6.2 Backup Strategy

**Database Backups**:
- Supabase automatically backs up daily
- For manual backups, go to **Database** > **Backups**

**Environment Variables**:
- Keep secure copy of all environment variables
- Store in password manager or secrets vault

### 6.3 Regular Maintenance

1. **Weekly**:
   - Check error logs
   - Monitor API usage
   - Review user feedback

2. **Monthly**:
   - Update dependencies (`npm update`)
   - Review database performance
   - Audit security settings

3. **Quarterly**:
   - Review and optimize database indexes
   - Clean up unused data
   - Security audit

## Troubleshooting

### Build Fails

**Issue**: Build fails with module not found
```bash
npm install
npm run build
```

**Issue**: TypeScript errors
```bash
npm run typecheck
```

### Runtime Errors

**Issue**: 500 errors on API routes
- Check Netlify/Vercel function logs
- Verify environment variables are set
- Check Supabase connection

**Issue**: Telegram webhook not working
- Verify TELEGRAM_BOT_TOKEN is correct
- Check APP_BASE_URL matches production domain
- Re-run webhook setup

**Issue**: Database connection errors
- Verify Supabase project is not paused
- Check RLS policies are correct
- Ensure service role key is set

### Performance Issues

**Issue**: Slow page loads
- Enable caching in Netlify/Vercel
- Optimize images
- Review database queries with `EXPLAIN`

**Issue**: High database usage
- Add indexes to frequently queried columns
- Implement pagination
- Cache frequently accessed data

## Security Checklist

- [ ] All environment variables are set and secure
- [ ] RLS policies enabled on all tables
- [ ] Service role key never exposed to client
- [ ] HTTPS enabled (automatic with Netlify/Vercel)
- [ ] Telegram webhook secret set
- [ ] Admin password is strong and changed from default
- [ ] Email verification enabled (if required)
- [ ] Rate limiting configured (via Supabase)
- [ ] CORS configured correctly
- [ ] Input validation on all forms
- [ ] SQL injection prevention (via Supabase client)

## Production Checklist

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Telegram webhook setup
- [ ] Admin account created
- [ ] Test analyzer account created
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Monitoring setup
- [ ] Backup strategy in place
- [ ] Error tracking configured
- [ ] Performance optimized
- [ ] Security audit completed
- [ ] User documentation ready

## Support

For deployment issues:
1. Check Netlify/Vercel deployment logs
2. Review Supabase logs
3. Check browser console for client errors
4. Review API endpoint logs

## Next Steps After Deployment

1. Announce launch to users
2. Monitor initial user feedback
3. Set up analytics (Google Analytics, Mixpanel, etc.)
4. Create user onboarding flow
5. Prepare marketing materials
6. Scale infrastructure as needed

---

Last updated: December 31, 2024
