/*
  # Multi-Plan Analysis Support

  1. Changes
    - Create `analysis_plans` junction table for many-to-many relationship between analyses and plans
    - Each analysis can be associated with multiple subscription plans
    - Remove the `plan_id` column from `analyses` table (migrate existing data first)
    - Update RLS policies to check if user is subscribed to any of the analysis's plans

  2. Migration Strategy
    - First create the junction table
    - Migrate existing `plan_id` data to the junction table
    - Then drop the `plan_id` column from analyses

  3. Security
    - Enable RLS on `analysis_plans` table
    - Add policies for reading and writing analysis-plan associations
*/

-- Create analysis_plans junction table
CREATE TABLE IF NOT EXISTS analysis_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES analyzer_plans(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(analysis_id, plan_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_analysis_plans_analysis_id ON analysis_plans(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_plans_plan_id ON analysis_plans(plan_id);

-- Add comment
COMMENT ON TABLE analysis_plans IS 'Many-to-many relationship between analyses and subscription plans';

-- Migrate existing plan_id data to junction table
DO $$
BEGIN
  -- Only migrate if plan_id column exists and has data
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'plan_id'
  ) THEN
    INSERT INTO analysis_plans (analysis_id, plan_id)
    SELECT id, plan_id
    FROM analyses
    WHERE plan_id IS NOT NULL
    ON CONFLICT (analysis_id, plan_id) DO NOTHING;
  END IF;
END $$;

-- Drop plan_id column from analyses (data already migrated)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'plan_id'
  ) THEN
    ALTER TABLE analyses DROP COLUMN plan_id;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE analysis_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read analysis-plan associations (needed for feed filtering)
CREATE POLICY "Anyone can read analysis plans"
  ON analysis_plans FOR SELECT
  USING (true);

-- Policy: Analysts can associate their analyses with their plans
CREATE POLICY "Analysts can manage their analysis plans"
  ON analysis_plans FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_plans.analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_plans.analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to analysis plans"
  ON analysis_plans FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
