/*
  # AnalyzingHub Database Schema - Week 1

  ## Overview
  Creates the foundational database structure for AnalyzingHub platform with role-based access control.

  ## New Tables
  
  ### roles
  Reference table for user roles in the system
  - id (uuid, primary key) - Unique identifier
  - name (text, unique) - Role name (SuperAdmin, Analyzer, Trader)
  - description (text) - Role description
  - created_at (timestamptz) - Creation timestamp

  ### profiles
  Extended user profile information linked to auth.users
  - id (uuid, primary key) - References auth.users(id)
  - email (text, unique) - User email (denormalized for quick access)
  - full_name (text) - User's full name
  - role_id (uuid, foreign key) - References roles table
  - bio (text, nullable) - User biography
  - avatar_url (text, nullable) - Profile picture URL
  - is_active (boolean) - Account active status
  - created_at (timestamptz) - Creation timestamp
  - updated_at (timestamptz) - Last update timestamp

  ### follows
  Tracks follow relationships between traders and analyzers
  - id (uuid, primary key) - Unique identifier
  - follower_id (uuid, foreign key) - User who follows (references profiles)
  - following_id (uuid, foreign key) - User being followed (references profiles)
  - created_at (timestamptz) - Follow timestamp
  - Unique constraint on (follower_id, following_id) to prevent duplicates

  ## Security
  
  ### Row Level Security (RLS)
  All tables have RLS enabled with appropriate policies for each role.
  
  ## Notes
  - Passwords are handled by Supabase Auth (not stored in profiles)
  - Role enforcement is done at both database (RLS) and application level
  - The profiles.id matches auth.users.id via foreign key
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role_id uuid REFERENCES roles(id) NOT NULL,
  bio text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

-- Enable Row Level Security
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles table
CREATE POLICY "Anyone can view roles"
  ON roles FOR SELECT
  TO authenticated, anon
  USING (true);

-- RLS Policies for profiles table
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for follows table
CREATE POLICY "Users can view all follows"
  ON follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create own follows"
  ON follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete own follows"
  ON follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update profiles.updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();