/*
  # Recreate handle_new_user Trigger

  ## Purpose
  Restore the trigger that automatically creates profiles for new auth users.
  Now that the NULL column issue is fixed, the trigger should work properly.

  ## Changes
  - Recreate the trigger on auth.users
*/

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
