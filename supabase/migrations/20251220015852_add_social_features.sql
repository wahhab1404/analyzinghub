/*
  # Add Social Features to Analyses

  ## Overview
  This migration adds social engagement features including comments, likes, saves, and reposts for analyses.

  ## New Tables
  
  1. `comments`
     - `id` (uuid, primary key)
     - `analysis_id` (uuid, foreign key to analyses)
     - `user_id` (uuid, foreign key to auth.users)
     - `content` (text, the comment text)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
  
  2. `likes`
     - `id` (uuid, primary key)
     - `analysis_id` (uuid, foreign key to analyses)
     - `user_id` (uuid, foreign key to auth.users)
     - `created_at` (timestamptz)
     - Unique constraint on (analysis_id, user_id)
  
  3. `saves`
     - `id` (uuid, primary key)
     - `analysis_id` (uuid, foreign key to analyses)
     - `user_id` (uuid, foreign key to auth.users)
     - `created_at` (timestamptz)
     - Unique constraint on (analysis_id, user_id)
  
  4. `reposts`
     - `id` (uuid, primary key)
     - `analysis_id` (uuid, foreign key to analyses)
     - `user_id` (uuid, foreign key to auth.users)
     - `comment` (text, optional comment on repost)
     - `created_at` (timestamptz)
     - Unique constraint on (analysis_id, user_id)

  ## Security
  - Enable RLS on all tables
  - Users can read all comments, likes, saves, and reposts
  - Users can only create their own comments, likes, saves, and reposts
  - Users can only update/delete their own comments
  - Users can only delete their own likes, saves, and reposts

  ## Indexes
  - Index on analysis_id for all tables (for fast lookups)
  - Index on user_id for saves table (for user's saved analyses page)
*/

-- Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create likes table
CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(analysis_id, user_id)
);

-- Create saves table
CREATE TABLE IF NOT EXISTS saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(analysis_id, user_id)
);

-- Create reposts table
CREATE TABLE IF NOT EXISTS reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(analysis_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comments_analysis_id ON comments(analysis_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_analysis_id ON likes(analysis_id);
CREATE INDEX IF NOT EXISTS idx_saves_analysis_id ON saves(analysis_id);
CREATE INDEX IF NOT EXISTS idx_saves_user_id ON saves(user_id);
CREATE INDEX IF NOT EXISTS idx_reposts_analysis_id ON reposts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON reposts(user_id);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;

-- Comments Policies
CREATE POLICY "Anyone can view comments"
  ON comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Likes Policies
CREATE POLICY "Anyone can view likes"
  ON likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create likes"
  ON likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
  ON likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Saves Policies
CREATE POLICY "Users can view own saves"
  ON saves FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create saves"
  ON saves FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saves"
  ON saves FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reposts Policies
CREATE POLICY "Anyone can view reposts"
  ON reposts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create reposts"
  ON reposts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reposts"
  ON reposts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at for comments
DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
