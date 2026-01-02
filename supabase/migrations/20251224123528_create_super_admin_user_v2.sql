/*
  # Create Super Admin User

  ## Overview
  Creates a super admin user with full system privileges.

  ## Details
  - Email: admin@anlzhub.com
  - Password: admin1984
  - Role: SuperAdmin
  - Full Name: Super Administrator

  ## Security
  - User is created with SuperAdmin role for full system access
  - Profile is automatically linked to the auth user
  - All admin privileges are enabled

  ## Notes
  - This creates the user directly in Supabase Auth
  - Email confirmation is bypassed
  - User can login immediately after creation
*/

DO $$
DECLARE
  v_user_id uuid;
  v_role_id uuid;
BEGIN
  -- Get SuperAdmin role ID
  SELECT id INTO v_role_id FROM roles WHERE name = 'SuperAdmin';
  
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'SuperAdmin role not found';
  END IF;

  -- Check if admin user already exists in auth.users
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = 'admin@anlzhub.com';

  IF v_user_id IS NULL THEN
    -- Create the auth user with a specific UUID for consistency
    v_user_id := gen_random_uuid();
    
    -- Insert into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@anlzhub.com',
      crypt('admin1984', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"],"role":"SuperAdmin"}',
      '{"full_name":"Super Administrator"}',
      false,
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );

    -- Insert identity for email provider
    INSERT INTO auth.identities (
      provider_id,
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', 'admin@anlzhub.com',
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  -- Create or update the profile
  INSERT INTO profiles (
    id,
    email,
    full_name,
    role_id,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'admin@anlzhub.com',
    'Super Administrator',
    v_role_id,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    role_id = v_role_id,
    full_name = 'Super Administrator',
    updated_at = now();

  RAISE NOTICE 'Super Admin user created successfully with ID: %', v_user_id;
END $$;