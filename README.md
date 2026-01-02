# AnalyzingHub - Week 1 MVP

A production-ready market analysis platform with role-based access control, built with Next.js, TypeScript, and Supabase.

## Features

### Authentication & Authorization
- Email/password authentication via Supabase Auth
- Role-based access control (RBAC) with three roles:
  - **SuperAdmin**: Full system access and user management
  - **Analyzer**: Can create and publish market analyses
  - **Trader**: Can follow analyzers and view analyses
- Protected routes with server-side and client-side guards
- Secure session management

### User Management
- User registration with role selection
- User profiles with extended information
- Follow system (traders can follow analyzers)
- Activity tracking

### Dashboard
- Role-specific navigation
- Personalized dashboard based on user role
- User profile management
- Statistics and activity overview

## Tech Stack

- **Framework**: Next.js 13 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React

## Architecture

```
/app
  ├── /dashboard          # Protected dashboard routes
  │   ├── layout.tsx      # Dashboard layout with auth check
  │   └── page.tsx        # Main dashboard
  ├── /login              # Login page
  ├── /register           # Registration page
  ├── layout.tsx          # Root layout
  └── page.tsx            # Landing page

/components
  ├── /auth               # Authentication components
  │   ├── LoginForm.tsx
  │   └── RegisterForm.tsx
  ├── /dashboard          # Dashboard components
  │   ├── Header.tsx
  │   └── Sidebar.tsx
  └── /ui                 # shadcn/ui components

/lib
  ├── /auth               # Auth utilities
  │   ├── rbac.ts         # Role-based access control
  │   └── session.ts      # Session management
  ├── /supabase           # Supabase clients
  │   ├── client.ts       # Client-side
  │   └── server.ts       # Server-side
  └── /types              # TypeScript types
      └── database.ts     # Database types

/services
  ├── auth.service.ts     # Authentication business logic
  └── user.service.ts     # User management business logic

middleware.ts             # Route protection middleware
```

## Database Schema

### Tables

#### `roles`
- `id` (uuid, primary key)
- `name` (text, unique) - SuperAdmin, Analyzer, Trader
- `description` (text)
- `created_at` (timestamptz)

#### `profiles`
- `id` (uuid, primary key, references auth.users)
- `email` (text, unique)
- `full_name` (text)
- `role_id` (uuid, references roles)
- `bio` (text, nullable)
- `avatar_url` (text, nullable)
- `is_active` (boolean, default true)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

#### `follows`
- `id` (uuid, primary key)
- `follower_id` (uuid, references profiles)
- `following_id` (uuid, references profiles)
- `created_at` (timestamptz)
- Unique constraint on (follower_id, following_id)

### Security

All tables have Row Level Security (RLS) enabled with appropriate policies:
- Users can read all profiles
- Users can only update their own profile
- Users can create/delete their own follows
- Role information is publicly readable

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase project set up
- Environment variables configured

### Installation

1. Install dependencies:
```bash
npm install
```

2. Verify environment variables in `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Database is already set up with:
   - Schema and tables created
   - RLS policies configured
   - Three roles seeded (SuperAdmin, Analyzer, Trader)

### Creating the Super Admin Account

#### Method 1: Using Registration + SQL Update

1. Visit `/register` and create an account with:
   - Email: admin@analyzinghub.com
   - Password: ChangeMe@12345
   - Role: Analyzer (temporary)

2. In Supabase SQL Editor, run:
```sql
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin')
WHERE email = 'admin@analyzinghub.com';
```

#### Method 2: Using Supabase Dashboard

1. Go to Supabase Dashboard > Authentication > Users
2. Click "Add User"
3. Enter:
   - Email: admin@analyzinghub.com
   - Password: ChangeMe@12345
   - Auto Confirm User: Yes

4. Copy the User ID, then in SQL Editor:
```sql
SELECT create_admin_profile('USER_ID_HERE', 'admin@analyzinghub.com');
```

### Running the Application

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

Type checking:
```bash
npm run typecheck
```

Visit `http://localhost:3000` to see the application.

## Usage

### User Flows

#### Registration
1. Visit `/register`
2. Fill in full name, email, password, and select role (Trader or Analyzer)
3. Submit form
4. Redirected to dashboard upon success

#### Login
1. Visit `/login`
2. Enter email and password
3. Submit form
4. Redirected to dashboard upon success

#### Dashboard Access
- All authenticated users can access `/dashboard`
- Navigation items are filtered based on user role
- SuperAdmin sees additional "User Management" option
- Analyzers see "My Analyses" option
- Traders see "Following" option

## Security Features

### Authentication
- Passwords hashed and managed by Supabase Auth
- Secure session management with HTTP-only cookies
- Protected routes with server-side validation
- CSRF protection via Supabase

### Authorization
- Role-based access control enforced at:
  - Database level (RLS policies)
  - API level (session checks)
  - UI level (conditional rendering)
- Server-side session validation on every protected request
- Middleware protection for dashboard routes

### Input Validation
- Email format validation
- Password strength requirements (min 8 characters)
- SQL injection prevention via Supabase client
- XSS protection via React and Next.js defaults

## API Routes (Future)

The application is structured to support API routes:
- `/api/auth/*` - Authentication endpoints
- `/api/users/*` - User management
- `/api/follows/*` - Follow relationships
- `/api/analyses/*` - Market analyses (Week 2+)

## What's NOT Included (Week 1)

- Analyses management
- Charts and visualizations
- Subscription system
- Notifications
- Email verification
- Password reset
- Social authentication
- File uploads
- Search functionality
- Advanced user management

## Development Notes

### Code Structure
- Server Components used by default for better performance
- Client Components marked with 'use client' directive
- Services layer for business logic separation
- Type-safe database queries with TypeScript
- Reusable UI components via shadcn/ui

### Best Practices
- No secrets in client code
- Server-side validation for all mutations
- Proper error handling and user feedback
- Loading states for async operations
- Accessible UI components
- Mobile-responsive design

## Troubleshooting

### "Invalid role" error during registration
- Ensure the roles table is seeded with SuperAdmin, Analyzer, and Trader roles
- Check that the database migrations have been applied

### Cannot access dashboard after login
- Check that the profile was created successfully
- Verify the user has a valid role_id in their profile
- Check browser console for errors

### Middleware redirect loop
- Clear browser cookies
- Verify environment variables are set correctly
- Check that Supabase URL and anon key are valid

## Next Steps (Week 2+)

1. Implement analysis creation and management
2. Add charts and data visualizations
3. Build notification system
4. Implement search and filtering
5. Add user management UI for SuperAdmin
6. Implement subscription/payment system
7. Add email notifications
8. Implement real-time updates

## License

Proprietary - All rights reserved

## Support

For issues or questions, contact the development team.
