/*
  # Fix Comments and Profiles Relationship

  ## Overview
  This migration adds a foreign key constraint from comments.user_id to profiles.id
  to enable proper joins when querying comments with user profile data.

  ## Changes
  1. Drop existing foreign key constraint to auth.users
  2. Add new foreign key constraint to profiles.id
  3. This is safe because profiles.id matches auth.users.id

  ## Notes
  - Every auth.users entry should have a corresponding profiles entry
  - The trigger in the initial migration ensures this relationship
*/

-- Drop the existing foreign key constraint to auth.users
ALTER TABLE comments 
DROP CONSTRAINT IF EXISTS comments_user_id_fkey;

-- Add foreign key constraint to profiles instead
ALTER TABLE comments 
ADD CONSTRAINT comments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
