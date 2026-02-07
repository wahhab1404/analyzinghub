/*
  # Add Price at Post Time

  1. Changes
    - Add `price_at_post` column to `analyses` table to automatically capture the stock price when the analysis is created
    - This field helps track analysis accuracy and performance over time

  2. Notes
    - The field is nullable to support existing analyses
    - New analyses will have this field populated automatically via the API
*/

-- Add price_at_post column to analyses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'price_at_post'
  ) THEN
    ALTER TABLE analyses ADD COLUMN price_at_post numeric;
  END IF;
END $$;

-- Add index for queries filtering by price_at_post
CREATE INDEX IF NOT EXISTS idx_analyses_price_at_post ON analyses(price_at_post) WHERE price_at_post IS NOT NULL;

-- Add comment to document the field
COMMENT ON COLUMN analyses.price_at_post IS 'The stock/asset price at the time the analysis was posted';
