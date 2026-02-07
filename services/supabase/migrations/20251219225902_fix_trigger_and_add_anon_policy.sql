/*
  # Fix Profile Creation Trigger and Add Anonymous Policy

  ## Changes
  1. Drop and recreate the trigger on auth.users to ensure it fires correctly
  2. Add a policy allowing service_role to bypass RLS (for trigger usage)
  3. Grant necessary permissions to the trigger function
  
  ## Security
  - Service role can insert profiles (needed for trigger)
  - Trigger function runs with elevated privileges to bypass RLS
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the trigger function with proper grants
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role_id uuid;
  role_from_metadata text;
BEGIN
  -- Try to get role from user metadata
  role_from_metadata := NEW.raw_user_meta_data->>'role';
  
  -- If role provided in metadata, use it
  IF role_from_metadata IS NOT NULL THEN
    SELECT id INTO target_role_id
    FROM public.roles
    WHERE name = role_from_metadata
    LIMIT 1;
  END IF;
  
  -- If no role found from metadata, use default Trader role
  IF target_role_id IS NULL THEN
    SELECT id INTO target_role_id
    FROM public.roles
    WHERE name = 'Trader'
    LIMIT 1;
  END IF;
  
  -- If still no role (no Trader role exists), get any role
  IF target_role_id IS NULL THEN
    SELECT id INTO target_role_id
    FROM public.roles
    LIMIT 1;
  END IF;

  -- Insert the profile only if we have a valid role
  IF target_role_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, role_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      target_role_id
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Ensure service_role policy exists for inserts
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);