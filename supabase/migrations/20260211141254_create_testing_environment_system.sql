/*
  # Testing Environment System for Analyzers

  ## Overview
  Creates a comprehensive testing environment allowing analyzers to test-post analyses
  and trades to private testing channels without affecting stats, rankings, or reports.

  ## New Tables
  - analyzer_testing_channels: Max 2 testing channels per analyzer

  ## Schema Changes
  - analyses: Added is_testing, testing_channel_ids
  - contract_trades: Added is_testing, testing_channel_ids
  - index_analyses: Added is_testing, testing_channel_ids

  ## Testing Rules
  - Only owner can view testing items
  - Excluded from all stats, rankings, and reports
  - Telegram sent only to testing channels with 🧪 prefix
  - Max 2 channels enforced at DB level
*/

-- Create analyzer_testing_channels table
CREATE TABLE IF NOT EXISTS analyzer_testing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  telegram_channel_id text NOT NULL,
  telegram_channel_username text,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT unique_user_channel UNIQUE (user_id, telegram_channel_id),
  CONSTRAINT name_not_empty CHECK (char_length(name) > 0),
  CONSTRAINT telegram_channel_id_not_empty CHECK (char_length(telegram_channel_id) > 0)
);

-- Add testing fields to analyses table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analyses' AND column_name = 'is_testing'
  ) THEN
    ALTER TABLE analyses ADD COLUMN is_testing boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analyses' AND column_name = 'testing_channel_ids'
  ) THEN
    ALTER TABLE analyses ADD COLUMN testing_channel_ids uuid[] DEFAULT ARRAY[]::uuid[];
  END IF;
END $$;

-- Add testing fields to contract_trades table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_trades' AND column_name = 'is_testing'
  ) THEN
    ALTER TABLE contract_trades ADD COLUMN is_testing boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_trades' AND column_name = 'testing_channel_ids'
  ) THEN
    ALTER TABLE contract_trades ADD COLUMN testing_channel_ids uuid[] DEFAULT ARRAY[]::uuid[];
  END IF;
END $$;

-- Add testing fields to index_analyses table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'index_analyses' AND column_name = 'is_testing'
  ) THEN
    ALTER TABLE index_analyses ADD COLUMN is_testing boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'index_analyses' AND column_name = 'testing_channel_ids'
  ) THEN
    ALTER TABLE index_analyses ADD COLUMN testing_channel_ids uuid[] DEFAULT ARRAY[]::uuid[];
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_analyzer_testing_channels_user_id
  ON analyzer_testing_channels(user_id);

CREATE INDEX IF NOT EXISTS idx_analyzer_testing_channels_enabled
  ON analyzer_testing_channels(user_id, is_enabled)
  WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_analyses_testing
  ON analyses(analyzer_id, is_testing);

CREATE INDEX IF NOT EXISTS idx_contract_trades_testing
  ON contract_trades(author_id, is_testing);

CREATE INDEX IF NOT EXISTS idx_index_analyses_testing
  ON index_analyses(author_id, is_testing);

-- Function to enforce max 2 testing channels
CREATE OR REPLACE FUNCTION enforce_max_testing_channels()
RETURNS TRIGGER AS $$
DECLARE
  channel_count int;
BEGIN
  SELECT COUNT(*) INTO channel_count
  FROM analyzer_testing_channels
  WHERE user_id = NEW.user_id
    AND is_enabled = true
    AND (TG_OP = 'INSERT' OR id != NEW.id);

  IF channel_count >= 2 THEN
    RAISE EXCEPTION 'Maximum 2 testing channels allowed per analyzer';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_max_testing_channels ON analyzer_testing_channels;
CREATE TRIGGER trigger_enforce_max_testing_channels
  BEFORE INSERT OR UPDATE ON analyzer_testing_channels
  FOR EACH ROW
  WHEN (NEW.is_enabled = true)
  EXECUTE FUNCTION enforce_max_testing_channels();

-- Function to validate testing analysis
CREATE OR REPLACE FUNCTION validate_testing_analysis()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_testing = true THEN
    IF NEW.testing_channel_ids IS NULL OR array_length(NEW.testing_channel_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Testing analyses must have at least one testing channel selected';
    END IF;

    IF EXISTS (
      SELECT 1 FROM unnest(NEW.testing_channel_ids) AS channel_id
      WHERE NOT EXISTS (
        SELECT 1 FROM analyzer_testing_channels
        WHERE id = channel_id
          AND user_id = NEW.analyzer_id
          AND is_enabled = true
      )
    ) THEN
      RAISE EXCEPTION 'All testing channels must belong to the analyzer and be enabled';
    END IF;
  ELSE
    NEW.testing_channel_ids := ARRAY[]::uuid[];
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_validate_testing_analysis ON analyses;
CREATE TRIGGER trigger_validate_testing_analysis
  BEFORE INSERT OR UPDATE ON analyses
  FOR EACH ROW
  EXECUTE FUNCTION validate_testing_analysis();

-- Function to validate testing trade
CREATE OR REPLACE FUNCTION validate_testing_trade()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_testing = true THEN
    IF NEW.testing_channel_ids IS NULL OR array_length(NEW.testing_channel_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Testing trades must have at least one testing channel selected';
    END IF;

    IF EXISTS (
      SELECT 1 FROM unnest(NEW.testing_channel_ids) AS channel_id
      WHERE NOT EXISTS (
        SELECT 1 FROM analyzer_testing_channels
        WHERE id = channel_id
          AND user_id = NEW.author_id
          AND is_enabled = true
      )
    ) THEN
      RAISE EXCEPTION 'All testing channels must belong to the trade author and be enabled';
    END IF;
  ELSE
    NEW.testing_channel_ids := ARRAY[]::uuid[];
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_validate_testing_trade ON contract_trades;
CREATE TRIGGER trigger_validate_testing_trade
  BEFORE INSERT OR UPDATE ON contract_trades
  FOR EACH ROW
  EXECUTE FUNCTION validate_testing_trade();

-- Function to validate testing index analysis
CREATE OR REPLACE FUNCTION validate_testing_index_analysis()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_testing = true THEN
    IF NEW.testing_channel_ids IS NULL OR array_length(NEW.testing_channel_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Testing index analyses must have at least one testing channel selected';
    END IF;

    IF EXISTS (
      SELECT 1 FROM unnest(NEW.testing_channel_ids) AS channel_id
      WHERE NOT EXISTS (
        SELECT 1 FROM analyzer_testing_channels
        WHERE id = channel_id
          AND user_id = NEW.author_id
          AND is_enabled = true
      )
    ) THEN
      RAISE EXCEPTION 'All testing channels must belong to the author and be enabled';
    END IF;
  ELSE
    NEW.testing_channel_ids := ARRAY[]::uuid[];
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_validate_testing_index_analysis ON index_analyses;
CREATE TRIGGER trigger_validate_testing_index_analysis
  BEFORE INSERT OR UPDATE ON index_analyses
  FOR EACH ROW
  EXECUTE FUNCTION validate_testing_index_analysis();

-- Enable RLS
ALTER TABLE analyzer_testing_channels ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analyzer_testing_channels
CREATE POLICY "Users can view own testing channels"
  ON analyzer_testing_channels
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('SuperAdmin', 'Admin')
    )
  );

CREATE POLICY "Users can create own testing channels"
  ON analyzer_testing_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own testing channels"
  ON analyzer_testing_channels
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own testing channels"
  ON analyzer_testing_channels
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to testing channels"
  ON analyzer_testing_channels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update RLS for analyses
DROP POLICY IF EXISTS "Anyone can view public analyses" ON analyses;
DROP POLICY IF EXISTS "Public analyses are viewable by all" ON analyses;
DROP POLICY IF EXISTS "Public analyses viewable by all" ON analyses;
DROP POLICY IF EXISTS "Analyses visible based on testing mode" ON analyses;

CREATE POLICY "Analyses visible based on testing mode"
  ON analyses
  FOR SELECT
  TO authenticated
  USING (
    (is_testing = false)
    OR (is_testing = true AND analyzer_id = auth.uid())
    OR (is_testing = true AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('SuperAdmin', 'Admin')
    ))
  );

-- Update RLS for contract_trades
DROP POLICY IF EXISTS "Anyone can view active trades" ON contract_trades;
DROP POLICY IF EXISTS "Public trades viewable by all" ON contract_trades;
DROP POLICY IF EXISTS "Public trades are viewable" ON contract_trades;
DROP POLICY IF EXISTS "Trades visible based on testing mode" ON contract_trades;

CREATE POLICY "Trades visible based on testing mode"
  ON contract_trades
  FOR SELECT
  TO authenticated
  USING (
    (is_testing = false)
    OR (is_testing = true AND author_id = auth.uid())
    OR (is_testing = true AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('SuperAdmin', 'Admin')
    ))
  );

-- Update RLS for index_analyses
DROP POLICY IF EXISTS "Anyone can view published index analyses" ON index_analyses;
DROP POLICY IF EXISTS "Public index analyses viewable" ON index_analyses;
DROP POLICY IF EXISTS "Public index analyses viewable by all" ON index_analyses;
DROP POLICY IF EXISTS "Index analyses visible based on testing mode" ON index_analyses;

CREATE POLICY "Index analyses visible based on testing mode"
  ON index_analyses
  FOR SELECT
  TO authenticated
  USING (
    (is_testing = false)
    OR (is_testing = true AND author_id = auth.uid())
    OR (is_testing = true AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('SuperAdmin', 'Admin')
    ))
  );

-- Updated trigger
CREATE OR REPLACE FUNCTION update_analyzer_testing_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_analyzer_testing_channels_updated_at ON analyzer_testing_channels;
CREATE TRIGGER trigger_update_analyzer_testing_channels_updated_at
  BEFORE UPDATE ON analyzer_testing_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_analyzer_testing_channels_updated_at();

COMMENT ON TABLE analyzer_testing_channels IS 'Private testing channels for analyzers. Max 2 per analyzer.';
COMMENT ON COLUMN analyses.is_testing IS 'If true, excluded from all stats/reports and visible only to owner';
COMMENT ON COLUMN contract_trades.is_testing IS 'If true, excluded from all stats/reports and visible only to owner';
COMMENT ON COLUMN index_analyses.is_testing IS 'If true, excluded from all stats/reports and visible only to owner';

GRANT ALL ON analyzer_testing_channels TO authenticated;
GRANT ALL ON analyzer_testing_channels TO service_role;