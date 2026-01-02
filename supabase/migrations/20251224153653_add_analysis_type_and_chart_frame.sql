/*
  # Add Analysis Type and Chart Frame Fields

  1. Changes
    - Add `analysis_type` column to `analyses` table
      - Type: text with check constraint
      - Options: 'classic', 'elliott_wave', 'harmonics', 'ict', 'other'
      - Default: 'classic'
    - Add `chart_frame` column to `analyses` table
      - Type: text (e.g., '1H', '4H', '1D', etc.)
      - Optional field
    
  2. Notes
    - These fields help categorize analyses by methodology and timeframe
    - Will be displayed in analysis views and Telegram notifications
*/

-- Add analysis_type column with constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'analysis_type'
  ) THEN
    ALTER TABLE analyses 
    ADD COLUMN analysis_type text DEFAULT 'classic' NOT NULL
    CHECK (analysis_type IN ('classic', 'elliott_wave', 'harmonics', 'ict', 'other'));
  END IF;
END $$;

-- Add chart_frame column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'chart_frame'
  ) THEN
    ALTER TABLE analyses 
    ADD COLUMN chart_frame text;
  END IF;
END $$;

-- Create index for filtering by analysis type
CREATE INDEX IF NOT EXISTS idx_analyses_analysis_type 
ON analyses(analysis_type);
