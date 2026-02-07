# Create Super Admin Account

To create the Super Admin account, follow these steps:

## Option 1: Via Registration Page (Recommended)

1. Visit the registration page at `/register`
2. Fill in the following details:
   - **Full Name**: Super Admin
   - **Email**: admin@analyzinghub.com
   - **Password**: ChangeMe@12345
   - **Role**: Select "Analyzer" (you'll need to update this to SuperAdmin)

3. After registration, update the role in the database:
   ```sql
   -- Get the SuperAdmin role ID
   SELECT id FROM roles WHERE name = 'SuperAdmin';

   -- Update the user's profile to SuperAdmin role
   UPDATE profiles
   SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin')
   WHERE email = 'admin@analyzinghub.com';
   ```

## Option 2: Via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to Authentication > Users
3. Click "Add User"
4. Enter:
   - Email: admin@analyzinghub.com
   - Password: ChangeMe@12345
   - Auto Confirm User: Yes

5. Copy the User ID from the created user

6. In the SQL Editor, run:
   ```sql
   -- Insert profile for the admin user
   INSERT INTO profiles (id, email, full_name, role_id)
   VALUES (
     'USER_ID_HERE',
     'admin@analyzinghub.com',
     'Super Admin',
     (SELECT id FROM roles WHERE name = 'SuperAdmin')
   );
   ```

## Verify Admin Account

After creating the admin account, you can verify it by:

1. Logging in at `/login` with:
   - Email: admin@analyzinghub.com
   - Password: ChangeMe@12345

2. You should see "SuperAdmin" as your role in the dashboard
3. The sidebar should show the "User Management" link (only visible to SuperAdmin)

## Security Note

**IMPORTANT**: Change the default password immediately after first login for security reasons.
