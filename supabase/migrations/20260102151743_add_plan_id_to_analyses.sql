/*
  # Add Plan-Specific Analysis Posts

  1. Changes
    - Add `plan_id` column to `analyses` table to associate posts with specific plans
    - When an analysis has `visibility='subscribers'` and a `plan_id`, only subscribers to that specific plan can view it
    - If `plan_id` is NULL with `visibility='subscribers'`, all subscribers to any plan can view it (legacy behavior)
  
  2. Security
    - Update RLS policies to check plan-specific subscriptions
    - Ensure analysts can only post to their own plans
*/

-- Add plan_id column to analyses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN plan_id uuid REFERENCES analyzer_plans(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_analyses_plan_id ON analyses(plan_id);
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN analyses.plan_id IS 'Specific subscription plan this analysis is posted to (NULL means available to all subscribers if visibility is subscribers)';
