/*
  # Create Analyzer Ratings Table
  
  1. New Tables
    - `analyzer_ratings`
      - `id` (uuid, primary key)
      - `analyzer_id` (uuid, references profiles)
      - `user_id` (uuid, references profiles)
      - `rating` (integer, 1-10 stars)
      - `review_text` (text, optional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `analyzer_rating_stats`
      - `analyzer_id` (uuid, primary key)
      - `average_rating` (numeric)
      - `total_ratings` (integer)
      - `rating_distribution` (jsonb, stores count for each rating 1-10)
      - `last_updated` (timestamp)
  
  2. Security
    - Enable RLS on both tables
    - Users can read all ratings
    - Users can only create/update their own ratings
    - Rating stats are publicly readable
  
  3. Constraints
    - One rating per user per analyzer (unique constraint)
    - Rating must be between 1 and 10
    - Cannot rate yourself
*/

-- Drop the materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS analyzer_rating_stats CASCADE;

-- Create analyzer_ratings table
CREATE TABLE IF NOT EXISTS analyzer_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 10),
  review_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(analyzer_id, user_id),
  CHECK (analyzer_id != user_id)
);

-- Create analyzer_rating_stats table
CREATE TABLE IF NOT EXISTS analyzer_rating_stats (
  analyzer_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  average_rating numeric(3, 2) DEFAULT 0,
  total_ratings integer DEFAULT 0,
  rating_distribution jsonb DEFAULT '{}'::jsonb,
  last_updated timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_analyzer_ratings_analyzer ON analyzer_ratings(analyzer_id);
CREATE INDEX IF NOT EXISTS idx_analyzer_ratings_user ON analyzer_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_analyzer_rating_stats_avg ON analyzer_rating_stats(average_rating DESC);

-- Enable RLS on analyzer_ratings
ALTER TABLE analyzer_ratings ENABLE ROW LEVEL SECURITY;

-- Enable RLS on analyzer_rating_stats
ALTER TABLE analyzer_rating_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analyzer_ratings

-- Anyone can read ratings
CREATE POLICY "Anyone can view analyzer ratings"
  ON analyzer_ratings FOR SELECT
  USING (true);

-- Authenticated users can insert their own ratings
CREATE POLICY "Users can create own analyzer ratings"
  ON analyzer_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own ratings
CREATE POLICY "Users can update own analyzer ratings"
  ON analyzer_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own ratings
CREATE POLICY "Users can delete own analyzer ratings"
  ON analyzer_ratings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for analyzer_rating_stats

-- Anyone can read rating stats
CREATE POLICY "Anyone can view analyzer rating stats"
  ON analyzer_rating_stats FOR SELECT
  USING (true);

-- Function to update rating statistics
CREATE OR REPLACE FUNCTION update_analyzer_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update the stats for the analyzer
  INSERT INTO analyzer_rating_stats (analyzer_id, average_rating, total_ratings, rating_distribution, last_updated)
  SELECT
    COALESCE(NEW.analyzer_id, OLD.analyzer_id) as analyzer_id,
    ROUND(AVG(rating)::numeric, 2) as average_rating,
    COUNT(*)::integer as total_ratings,
    jsonb_object_agg(
      rating::text,
      rating_count
    ) as rating_distribution,
    now() as last_updated
  FROM (
    SELECT
      rating,
      COUNT(*) as rating_count
    FROM analyzer_ratings
    WHERE analyzer_id = COALESCE(NEW.analyzer_id, OLD.analyzer_id)
    GROUP BY rating
  ) subquery
  CROSS JOIN analyzer_ratings
  WHERE analyzer_id = COALESCE(NEW.analyzer_id, OLD.analyzer_id)
  GROUP BY analyzer_id
  ON CONFLICT (analyzer_id)
  DO UPDATE SET
    average_rating = EXCLUDED.average_rating,
    total_ratings = EXCLUDED.total_ratings,
    rating_distribution = EXCLUDED.rating_distribution,
    last_updated = EXCLUDED.last_updated;

  -- Handle case where all ratings are deleted
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM analyzer_ratings WHERE analyzer_id = OLD.analyzer_id) THEN
      DELETE FROM analyzer_rating_stats WHERE analyzer_id = OLD.analyzer_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update stats on any rating change
DROP TRIGGER IF EXISTS trigger_update_analyzer_rating_stats ON analyzer_ratings;
CREATE TRIGGER trigger_update_analyzer_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON analyzer_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_analyzer_rating_stats();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_analyzer_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_analyzer_ratings_updated_at ON analyzer_ratings;
CREATE TRIGGER trigger_analyzer_ratings_updated_at
  BEFORE UPDATE ON analyzer_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_analyzer_ratings_updated_at();