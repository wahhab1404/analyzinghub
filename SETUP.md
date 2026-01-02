# AnalyzingHub - Quick Setup Guide

## Initial Setup Complete

The database and application are fully configured and ready to use. All migrations have been applied:

- Database schema created (roles, profiles, follows tables)
- Row Level Security policies configured
- Three roles seeded: SuperAdmin, Analyzer, Trader
- Helper functions created for admin management

## Creating the Super Admin Account

To create the required Super Admin account with credentials:
- Email: `admin@analyzinghub.com`
- Password: `ChangeMe@12345`

Follow **ONE** of these methods:

### Method 1: Quick Registration (Recommended)

1. Start the application:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3000/register`

3. Fill in the form:
   - Full Name: `Super Admin`
   - Email: `admin@analyzinghub.com`
   - Role: Select **Analyzer** (we'll upgrade this)
   - Password: `ChangeMe@12345`
   - Confirm Password: `ChangeMe@12345`

4. Click "Create Account"

5. Go to your Supabase Dashboard > SQL Editor and run:
   ```sql
   UPDATE profiles
   SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin')
   WHERE email = 'admin@analyzinghub.com';
   ```

6. Log out and log back in to see the SuperAdmin role

### Method 2: Via Supabase Dashboard

1. Go to your Supabase Project Dashboard

2. Navigate to **Authentication** > **Users** > **Add User**

3. Fill in:
   - Email: `admin@analyzinghub.com`
   - Password: `ChangeMe@12345`
   - Auto Confirm User: **Yes** ✓

4. Click "Create User" and copy the User ID

5. Go to **SQL Editor** and run:
   ```sql
   SELECT create_admin_profile(
     'PASTE_USER_ID_HERE'::uuid,
     'admin@analyzinghub.com'
   );
   ```

   Replace `PASTE_USER_ID_HERE` with the actual User ID from step 4.

## Verification

1. Visit `http://localhost:3000/login`

2. Sign in with:
   - Email: `admin@analyzinghub.com`
   - Password: `ChangeMe@12345`

3. You should be redirected to `/dashboard`

4. Verify that:
   - Your role shows as "SuperAdmin" in the header
   - You see the "User Management" link in the sidebar
   - All navigation items are visible

## Testing Other Roles

Create test accounts to verify role-based access:

### Test Analyzer Account
1. Visit `/register`
2. Use any email and select "Analyzer" role
3. Login and verify you see "My Analyses" in sidebar

### Test Trader Account
1. Visit `/register`
2. Use any email and select "Trader" role
3. Login and verify you see "Following" in sidebar

## Production Deployment

Before deploying to production:

1. **Change the default admin password** immediately
2. Update the password via:
   - Supabase Dashboard > Authentication > Users
   - Or implement a password reset feature

3. Set up proper environment variables in your hosting platform

4. Configure your Supabase project URL whitelist:
   - Supabase Dashboard > Authentication > URL Configuration
   - Add your production domain

## Next Steps

With authentication working, you can now:

1. Test the user registration flow
2. Test role-based navigation
3. Build out the analyses features (Week 2)
4. Implement user management UI
5. Add profile editing functionality

## Troubleshooting

**Issue**: Cannot log in after registration
- Check that a profile was created in the `profiles` table
- Verify the profile has a valid `role_id`

**Issue**: "SuperAdmin" doesn't show correct navigation
- Ensure the role update SQL was executed
- Try logging out and back in
- Check browser console for errors

**Issue**: "Invalid role" error during registration
- Verify roles table has data: `SELECT * FROM roles;`
- Re-run the seed migration if needed

## Support

For issues, check:
1. Browser console for errors
2. Supabase logs in Dashboard
3. Network tab for API responses
4. README.md for detailed documentation
