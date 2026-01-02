/*
  # Add Post Types to Analyses Table

  1. Changes
    - Add `post_type` enum column with values: 'analysis', 'news', 'article'
    - Add `title` field for news and articles
    - Add `content` field for articles
    - Add `source_url` field for news posts
    - Add `summary` field for news posts
    - Make `stop_loss` nullable to support non-analysis posts
    - Make `direction` nullable to support non-analysis posts
    - Add default value 'analysis' for existing records
    - Add index for post_type column

  2. Security
    - No changes to RLS policies needed
    
  3. Notes
    - Existing analyses will be marked as 'analysis' type
    - News posts will have title, summary, and source_url
    - Article posts will have title and content
    - Analysis posts retain all existing fields
*/

-- Create post_type enum if not exists
DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('analysis', 'news', 'article');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to analyses table
DO $$
BEGIN
  -- Add post_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'post_type'
  ) THEN
    ALTER TABLE analyses ADD COLUMN post_type post_type DEFAULT 'analysis' NOT NULL;
  END IF;

  -- Add title column for news and articles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'title'
  ) THEN
    ALTER TABLE analyses ADD COLUMN title text;
  END IF;

  -- Add content column for articles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'content'
  ) THEN
    ALTER TABLE analyses ADD COLUMN content text;
  END IF;

  -- Add source_url for news
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'source_url'
  ) THEN
    ALTER TABLE analyses ADD COLUMN source_url text;
  END IF;

  -- Add summary for news
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'summary'
  ) THEN
    ALTER TABLE analyses ADD COLUMN summary text;
  END IF;
END $$;

-- Modify existing columns to be nullable
ALTER TABLE analyses ALTER COLUMN stop_loss DROP NOT NULL;
ALTER TABLE analyses ALTER COLUMN direction DROP NOT NULL;

-- Add check constraints for post types
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_post_type_fields_check;

ALTER TABLE analyses ADD CONSTRAINT analyses_post_type_fields_check CHECK (
  (post_type = 'analysis' AND stop_loss IS NOT NULL AND direction IS NOT NULL) OR
  (post_type = 'news' AND title IS NOT NULL AND summary IS NOT NULL) OR
  (post_type = 'article' AND title IS NOT NULL AND content IS NOT NULL)
);

-- Create index for post_type
CREATE INDEX IF NOT EXISTS idx_analyses_post_type ON analyses(post_type);
CREATE INDEX IF NOT EXISTS idx_analyses_post_type_created_at ON analyses(post_type, created_at DESC);

-- Add comment to table
COMMENT ON COLUMN analyses.post_type IS 'Type of post: analysis (technical analysis with targets), news (market news), or article (educational content)';
COMMENT ON COLUMN analyses.title IS 'Title for news and article posts';
COMMENT ON COLUMN analyses.content IS 'Full content for article posts';
COMMENT ON COLUMN analyses.source_url IS 'Source URL for news posts';
COMMENT ON COLUMN analyses.summary IS 'Summary for news posts';
