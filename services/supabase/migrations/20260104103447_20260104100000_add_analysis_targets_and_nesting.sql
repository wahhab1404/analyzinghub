/*
  # Add Analysis Targets and Nested Analysis Support

  ## Changes
  1. Add targets column to index_analyses
  2. Add parent_analysis_id for nested analyses
  3. Add target hit tracking columns
  4. Create analysis_target_hits table for notifications
  5. Add RLS policies

  ## New Features
  - Analysts can set price targets for their analyses
  - Nested/follow-up analyses linked to parent
  - Automatic notifications when targets are hit
*/

-- Add targets and nesting support to index_analyses
ALTER TABLE index_analyses 
ADD COLUMN IF NOT EXISTS targets JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS parent_analysis_id UUID REFERENCES index_analyses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS targets_hit JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_target_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_index_analyses_parent ON index_analyses(parent_analysis_id) WHERE parent_analysis_id IS NOT NULL;

-- Add additional technical fields to index_analyses
ALTER TABLE index_analyses
ADD COLUMN IF NOT EXISTS timeframe TEXT,
ADD COLUMN IF NOT EXISTS schools_used TEXT[],
ADD COLUMN IF NOT EXISTS invalidation_price NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS telegram_channel_id UUID REFERENCES telegram_channels(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS telegram_message_id TEXT,
ADD COLUMN IF NOT EXISTS telegram_published_at TIMESTAMPTZ;

-- Create table to track target hits
CREATE TABLE IF NOT EXISTS analysis_target_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES index_analyses(id) ON DELETE CASCADE,
  target_index INT NOT NULL,
  target_level NUMERIC(10, 2) NOT NULL,
  hit_price NUMERIC(10, 2) NOT NULL,
  hit_at TIMESTAMPTZ DEFAULT now(),
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_target_hit UNIQUE(analysis_id, target_index)
);

CREATE INDEX IF NOT EXISTS idx_analysis_target_hits_analysis ON analysis_target_hits(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_target_hits_notified ON analysis_target_hits(notified) WHERE notified = false;

ALTER TABLE analysis_target_hits ENABLE ROW LEVEL SECURITY;

-- RLS for analysis_target_hits
CREATE POLICY "analysis_target_hits_select_policy"
  ON analysis_target_hits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM index_analyses ia
      WHERE ia.id = analysis_target_hits.analysis_id
      AND (
        ia.author_id = auth.uid()
        OR ia.visibility = 'public'
        OR (
          ia.visibility = 'subscribers'
          AND EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.subscriber_id = auth.uid()
            AND s.analyst_id = ia.author_id
            AND s.status = 'active'
            AND (s.current_period_end IS NULL OR s.current_period_end > now())
          )
        )
      )
    )
  );

CREATE POLICY "analysis_target_hits_insert_service_role"
  ON analysis_target_hits FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "analysis_target_hits_update_service_role"
  ON analysis_target_hits FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment explaining targets JSON structure
COMMENT ON COLUMN index_analyses.targets IS 'Array of target objects: [{"level": 5900.50, "label": "Target 1", "reached": false, "reached_at": null}]';
COMMENT ON COLUMN index_analyses.targets_hit IS 'Array of hit target indices for quick reference';
