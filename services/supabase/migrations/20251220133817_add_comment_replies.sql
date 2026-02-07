/*
  # Add Comment Replies Support

  1. Changes
    - Add `parent_comment_id` column to comments table for nested replies
    - Add self-referencing foreign key constraint
    - Add index on parent_comment_id for efficient querying
  
  2. Security
    - No changes to RLS policies (existing policies continue to apply)
*/

-- Add parent_comment_id column to support nested replies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'parent_comment_id'
  ) THEN
    ALTER TABLE comments ADD COLUMN parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for efficient querying of replies
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);
