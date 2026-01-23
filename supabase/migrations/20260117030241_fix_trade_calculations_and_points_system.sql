/*
  # Fix Trade Calculations and Points System

  ## Overview
  This migration implements comprehensive fixes to the trading system including:
  - Enhanced target hit detection with high/low price tracking
  - New index contract trade profit calculation (>$100 peak profit = win)
  - Revised points system with point ledger
  - Support for multiple trade entries (averaging)
  - Removal of breakeven classification

  ## Changes

  ### 1. Enhanced index_trades table
  - Add peak_price_after_entry for tracking highest price reached
  - Add computed_profit_usd for consistent profit calculation
  - Add is_win for win/loss determination (no breakevens)
  - Add point_events_awarded for tracking point awards
  - Add entries_data for storing multiple entry data when averaging

  ### 2. New trade_entries table
  - Track multiple entries per trade for entry averaging workflow

  ### 3. New points_ledger table
  - Prevent duplicate point awards
  - Enable recalculation and audit trail
  - Track all point-related events

  ### 4. Enhanced analyses table
  - Add targets_hit_data for tracking which targets hit and when
  - Add point_events_awarded for preventing duplicate target hit points

  ### 5. Update Functions
  - Enhanced target hit detection using high/low prices
  - New trade outcome calculation function
  - New points calculation function

  ## Security
  - RLS policies for new tables
  - Service role access for automated processes
*/

-- ============================================================================
-- 1. ENHANCE INDEX_TRADES TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'peak_price_after_entry'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN peak_price_after_entry DECIMAL(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'computed_profit_usd'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN computed_profit_usd DECIMAL(12, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'is_win'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN is_win BOOLEAN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'point_events_awarded'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN point_events_awarded JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'entries_data'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN entries_data JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'closure_reason'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN closure_reason TEXT;
  END IF;
END $$;

COMMENT ON COLUMN index_trades.is_win IS 'Win if peak_profit > $100, else loss. No breakevens.';
COMMENT ON COLUMN index_trades.peak_price_after_entry IS 'Highest price reached after entry while trade was active';
COMMENT ON COLUMN index_trades.computed_profit_usd IS 'Computed profit/loss in USD based on outcome rules';
COMMENT ON COLUMN index_trades.point_events_awarded IS 'JSON array of point events already awarded for this trade';
COMMENT ON COLUMN index_trades.entries_data IS 'JSON array of all entries when using entry averaging';
COMMENT ON COLUMN index_trades.closure_reason IS 'Reason for closure: manual, stop_loss, expired, replaced_by_new_entry, etc.';

-- ============================================================================
-- 2. CREATE TRADE_ENTRIES TABLE (using UUID)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES index_trades(id) ON DELETE CASCADE,
  entry_number INTEGER NOT NULL,
  entry_price DECIMAL(10, 2) NOT NULL,
  entry_amount DECIMAL(12, 2),
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(trade_id, entry_number)
);

ALTER TABLE trade_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trade entries"
  ON trade_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM index_trades t
      WHERE t.id = trade_entries.trade_id
      AND t.author_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own trade entries"
  ON trade_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM index_trades t
      WHERE t.id = trade_entries.trade_id
      AND t.author_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to trade_entries"
  ON trade_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_trade_entries_trade_id ON trade_entries(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_entries_entry_time ON trade_entries(entry_time);

-- ============================================================================
-- 3. CREATE POINTS_LEDGER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  points_awarded INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(analyzer_id, event_type, reference_type, reference_id)
);

ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own points ledger"
  ON points_ledger FOR SELECT
  TO authenticated
  USING (analyzer_id = auth.uid());

CREATE POLICY "Service role full access to points_ledger"
  ON points_ledger FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_points_ledger_analyzer_id ON points_ledger(analyzer_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_created_at ON points_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_event_type ON points_ledger(event_type);
CREATE INDEX IF NOT EXISTS idx_points_ledger_reference ON points_ledger(reference_type, reference_id);

-- ============================================================================
-- 4. ENHANCE ANALYSES TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'targets_hit_data'
  ) THEN
    ALTER TABLE analyses ADD COLUMN targets_hit_data JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'point_events_awarded'
  ) THEN
    ALTER TABLE analyses ADD COLUMN point_events_awarded JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN analyses.targets_hit_data IS 'JSON array tracking which targets hit, when, and at what price';
COMMENT ON COLUMN analyses.point_events_awarded IS 'JSON array of point events already awarded for this analysis';

-- ============================================================================
-- 5. ENHANCED TARGET HIT DETECTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_target_hit(
  p_current_price DECIMAL,
  p_current_high DECIMAL,
  p_current_low DECIMAL,
  p_target_price DECIMAL,
  p_direction TEXT,
  p_require_close BOOLEAN DEFAULT false
) RETURNS BOOLEAN AS $$
BEGIN
  IF p_require_close THEN
    IF p_direction = 'LONG' THEN
      RETURN p_current_price >= p_target_price;
    ELSIF p_direction = 'SHORT' THEN
      RETURN p_current_price <= p_target_price;
    END IF;
    RETURN false;
  END IF;

  IF p_direction = 'LONG' THEN
    RETURN COALESCE(p_current_high, p_current_price) >= p_target_price;
  ELSIF p_direction = 'SHORT' THEN
    RETURN COALESCE(p_current_low, p_current_price) <= p_target_price;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 6. TRADE OUTCOME CALCULATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_trade_outcome(
  p_trade_id UUID
) RETURNS TABLE(
  is_win BOOLEAN,
  computed_profit_usd DECIMAL,
  peak_profit_usd DECIMAL,
  should_award_points BOOLEAN
) AS $$
DECLARE
  v_trade RECORD;
  v_entry_price DECIMAL;
  v_peak_price DECIMAL;
  v_current_price DECIMAL;
  v_multiplier INTEGER;
  v_qty INTEGER;
  v_peak_profit DECIMAL;
  v_computed_profit DECIMAL;
  v_is_win BOOLEAN;
BEGIN
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found: %', p_trade_id;
  END IF;

  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mark')::DECIMAL,
    (v_trade.entry_contract_snapshot->>'last')::DECIMAL,
    0
  );
  
  v_peak_price := COALESCE(
    v_trade.peak_price_after_entry,
    v_trade.contract_high_since,
    v_entry_price
  );
  
  v_current_price := COALESCE(v_trade.current_contract, v_entry_price);
  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty := COALESCE(v_trade.qty, 1);

  v_peak_profit := (v_peak_price - v_entry_price) * v_multiplier * v_qty;

  v_is_win := v_peak_profit > 100;

  IF v_is_win THEN
    IF v_trade.status = 'closed' THEN
      v_computed_profit := COALESCE(v_trade.pnl_usd, (v_current_price - v_entry_price) * v_multiplier * v_qty);
    ELSE
      v_computed_profit := GREATEST(
        (v_current_price - v_entry_price) * v_multiplier * v_qty,
        v_peak_profit
      );
    END IF;
  ELSE
    v_computed_profit := -COALESCE(v_trade.entry_cost_usd, v_entry_price * v_multiplier * v_qty);
  END IF;

  RETURN QUERY SELECT
    v_is_win,
    v_computed_profit,
    v_peak_profit,
    true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. POINTS CALCULATION AND AWARD FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION award_points_for_event(
  p_analyzer_id UUID,
  p_event_type TEXT,
  p_reference_type TEXT,
  p_reference_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER := 0;
  v_description TEXT;
  v_profit_usd DECIMAL;
  v_already_awarded BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM points_ledger
    WHERE analyzer_id = p_analyzer_id
    AND event_type = p_event_type
    AND reference_type = p_reference_type
    AND reference_id = p_reference_id
  ) INTO v_already_awarded;

  IF v_already_awarded THEN
    RETURN 0;
  END IF;

  CASE p_event_type
    WHEN 'target_hit' THEN
      v_points := 10;
      v_description := 'Target hit bonus';

    WHEN 'trade_win' THEN
      v_profit_usd := COALESCE((p_metadata->>'profit_usd')::DECIMAL, 0);
      v_points := FLOOR(v_profit_usd / 100)::INTEGER * 10;
      v_description := format('Winning trade: $%s profit', v_profit_usd);

    WHEN 'trade_loss' THEN
      v_points := -10;
      v_description := 'Losing trade penalty';

    WHEN 'stop_loss' THEN
      v_points := -5;
      v_description := 'Stop loss hit';

    ELSE
      RAISE EXCEPTION 'Unknown event type: %', p_event_type;
  END CASE;

  INSERT INTO points_ledger (
    analyzer_id,
    event_type,
    points_awarded,
    reference_type,
    reference_id,
    description,
    metadata
  ) VALUES (
    p_analyzer_id,
    p_event_type,
    v_points,
    p_reference_type,
    p_reference_id,
    v_description,
    p_metadata
  );

  RETURN v_points;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNCTION TO GET ANALYZER TOTAL POINTS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_analyzer_total_points(
  p_analyzer_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_total_points INTEGER;
BEGIN
  SELECT COALESCE(SUM(points_awarded), 0)
  INTO v_total_points
  FROM points_ledger
  WHERE analyzer_id = p_analyzer_id;

  RETURN v_total_points;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. FUNCTION TO DETECT SAME STRIKE ACTIVE TRADE
-- ============================================================================

CREATE OR REPLACE FUNCTION check_same_strike_active_trade(
  p_analyzer_id UUID,
  p_symbol TEXT,
  p_strike DECIMAL,
  p_expiry DATE,
  p_option_type TEXT,
  p_exclude_trade_id UUID DEFAULT NULL
) RETURNS TABLE(
  trade_id UUID,
  entry_price DECIMAL,
  current_price DECIMAL,
  highest_price DECIMAL,
  entry_cost DECIMAL,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    (t.entry_contract_snapshot->>'mark')::DECIMAL,
    t.current_contract,
    t.contract_high_since,
    t.entry_cost_usd,
    t.status
  FROM index_trades t
  WHERE t.author_id = p_analyzer_id
    AND t.underlying_index_symbol = p_symbol
    AND t.strike = p_strike
    AND t.expiry = p_expiry
    AND t.option_type = p_option_type
    AND t.status = 'active'
    AND (p_exclude_trade_id IS NULL OR t.id != p_exclude_trade_id)
  ORDER BY t.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. UPDATE RANKING CALCULATION TO USE NEW POINTS SYSTEM
-- ============================================================================

CREATE OR REPLACE VIEW analyzer_stats_v2 AS
SELECT
  p.id as analyzer_id,
  p.full_name,
  p.email,
  p.avatar_url,

  COALESCE(SUM(pl.points_awarded), 0) as total_points,

  COUNT(DISTINCT CASE WHEN t.status IN ('active', 'closed') THEN t.id END) as total_trades,
  COUNT(DISTINCT CASE WHEN t.is_win = true THEN t.id END) as winning_trades,
  COUNT(DISTINCT CASE WHEN t.is_win = false THEN t.id END) as losing_trades,

  CASE
    WHEN COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) > 0 THEN
      ROUND(
        COUNT(DISTINCT CASE WHEN t.is_win = true AND t.status = 'closed' THEN t.id END)::NUMERIC /
        COUNT(DISTINCT CASE WHEN t.status = 'closed' THEN t.id END) * 100,
        2
      )
    ELSE 0
  END as win_rate,

  COALESCE(SUM(t.computed_profit_usd), 0) as total_profit_usd,

  COUNT(DISTINCT pl_targets.id) FILTER (WHERE pl_targets.event_type = 'target_hit') as targets_hit,

  GREATEST(
    MAX(t.created_at),
    MAX(a.created_at)
  ) as last_activity_at

FROM profiles p
LEFT JOIN roles r ON r.id = p.role_id
LEFT JOIN index_trades t ON t.author_id = p.id
LEFT JOIN points_ledger pl ON pl.analyzer_id = p.id
LEFT JOIN points_ledger pl_targets ON pl_targets.analyzer_id = p.id AND pl_targets.event_type = 'target_hit'
LEFT JOIN analyses a ON a.analyzer_id = p.id
WHERE r.name IN ('analyzer', 'admin')
GROUP BY p.id, p.full_name, p.email, p.avatar_url;

GRANT SELECT ON analyzer_stats_v2 TO authenticated;
GRANT SELECT ON analyzer_stats_v2 TO anon;
