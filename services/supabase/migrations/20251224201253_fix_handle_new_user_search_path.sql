/*
  # Fix handle_new_user Function Search Path

  ## Problem
  The handle_new_user function has a restrictive search_path that might be causing
  "Database error querying schema" errors during authentication.

  ## Solution
  Recreate the function with a less restrictive search_path that includes both
  'public' and 'auth' schemas to allow Supabase's auth system to function properly.

  ## Changes
  - Drop and recreate handle_new_user function with updated search_path
  - Recreate the trigger to ensure it's properly linked
*/

-- Drop the existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the existing function
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with a more permissive search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public', 'auth';

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
