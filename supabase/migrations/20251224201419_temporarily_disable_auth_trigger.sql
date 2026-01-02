/*
  # Temporarily Disable Auth Trigger to Test

  ## Problem
  Supabase auth operations are failing with "Database error" messages.
  Testing if the trigger is causing the issue.

  ## Solution
  Temporarily drop the trigger to see if auth works without it.
*/

-- Drop the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
