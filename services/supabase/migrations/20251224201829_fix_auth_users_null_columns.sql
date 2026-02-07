/*
  # Fix Auth Users NULL Column Issue

  ## Problem
  According to Supabase GitHub issue #1940, the error "Database error querying schema" 
  occurs when certain auth.users columns are NULL instead of empty strings.
  
  These columns must not be NULL:
  - confirmation_token
  - email_change_token_new  
  - recovery_token
  - email_change

  ## Solution
  Update all NULL values in these columns to empty strings.

  ## Changes
  - Update existing users to have empty strings instead of NULL
*/

-- Update NULL values to empty strings for all users
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, '')
WHERE 
  confirmation_token IS NULL 
  OR email_change_token_new IS NULL 
  OR recovery_token IS NULL
  OR email_change IS NULL;
