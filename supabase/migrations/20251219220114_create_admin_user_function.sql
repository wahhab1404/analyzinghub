/*
  # Create Admin User Setup Function

  ## Overview
  Creates a function to set up the Super Admin user profile after they register via Supabase Auth.
  This function should be called after the admin user signs up through the authentication system.

  ## Function
  - create_admin_profile: Creates a profile for the admin user with SuperAdmin role
  
  ## Usage
  After creating the user admin@analyzinghub.com through Supabase Auth, call this function
  with the user ID to create their profile with SuperAdmin privileges.
*/

CREATE OR REPLACE FUNCTION create_admin_profile(user_id uuid, user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role_id)
  VALUES (
    user_id,
    user_email,
    'Super Admin',
    (SELECT id FROM roles WHERE name = 'SuperAdmin')
  )
  ON CONFLICT (id) DO UPDATE
  SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin'),
      full_name = 'Super Admin';
END;
$$;
