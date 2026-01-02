/*
  # Fix Social Tables Profiles Relationship

  ## Overview
  This migration updates likes, saves, and reposts tables to reference profiles.id
  instead of auth.users.id for consistency and proper query capabilities.

  ## Changes
  1. Update likes.user_id foreign key to reference profiles.id
  2. Update saves.user_id foreign key to reference profiles.id
  3. Update reposts.user_id foreign key to reference profiles.id

  ## Notes
  - Ensures all social features can properly join with profile data
  - Maintains data integrity with CASCADE deletion
*/

-- Fix likes table
ALTER TABLE likes 
DROP CONSTRAINT IF EXISTS likes_user_id_fkey;

ALTER TABLE likes 
ADD CONSTRAINT likes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Fix saves table
ALTER TABLE saves 
DROP CONSTRAINT IF EXISTS saves_user_id_fkey;

ALTER TABLE saves 
ADD CONSTRAINT saves_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Fix reposts table
ALTER TABLE reposts 
DROP CONSTRAINT IF EXISTS reposts_user_id_fkey;

ALTER TABLE reposts 
ADD CONSTRAINT reposts_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
