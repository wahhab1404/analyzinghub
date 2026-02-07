/*
  # Complete Telegram Integration & Trade Lifecycle System
  
  ## Overview
  Implements comprehensive Telegram broadcasting, trade lifecycle automation,
  and analyst performance tracking for Indices Hub.
  
  ## Changes
  
  ### 1. Trade Lifecycle Fields
  - Add outcome tracking (succeed, loss, expired)
  - Add PnL calculations (pnl_usd, entry_cost_usd)
  - Add quantity and contract tracking
  - Add expiry datetime for precise expiration
  - Add telegram fields for broadcasting
  
  ### 2. Telegram Outbox Pattern
  - Create telegram_outbox table for reliable message delivery
  - Support retry logic with exponential backoff
  - Track delivery status and error details
  
  ### 3. Analysis Telegram Fields
  - Add telegram_channel_id for per-analysis channel override
  - Add telegram_send_enabled toggle
  
  ### 4. Analyst Trade Statistics
  - Create analyst_trade_stats table
  - Track wins, losses, PnL, win rate
  - Auto-update via triggers
  
  ### 5. Plan Telegram Integration
  - Update analyzer_plans.telegram_channel_id to reference telegram_channels
  - Add telegram_broadcast_enabled flag
  
  ## Security
  - All tables have RLS enabled
  - Proper foreign key constraints
  - Indexes for performance
*/

-- =====================================================
-- 1. TRADE LIFECYCLE ENHANCEMENTS
-- =====================================================

-- Add outcome and PnL tracking to index_trades
DO $$
BEGIN
  -- Add outcome enum
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'outcome'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN outcome TEXT;
    ALTER TABLE index_trades ADD CONSTRAINT valid_outcome 
      CHECK (outcome IS NULL OR outcome IN ('succeed', 'loss', 'expired'));
  END IF;
  
  -- Add PnL and cost tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'pnl_usd'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN pnl_usd NUMERIC(12, 2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'entry_cost_usd'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN entry_cost_usd NUMERIC(12, 2);
  END IF;
  
  -- Add quantity tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'qty'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN qty INTEGER DEFAULT 1;
    ALTER TABLE index_trades ADD CONSTRAINT valid_qty CHECK (qty >= 1);
  END IF;
  
  -- Add expiry datetime for precise tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'expiry_datetime'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN expiry_datetime TIMESTAMPTZ;
  END IF;
  
  -- Add telegram fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'telegram_channel_id'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN telegram_channel_id UUID REFERENCES telegram_channels(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'telegram_send_enabled'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN telegram_send_enabled BOOLEAN DEFAULT true;
  END IF;
  
  -- Add trade_price_basis if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'trade_price_basis'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN trade_price_basis TEXT DEFAULT 'OPTION_PREMIUM';
    ALTER TABLE index_trades ADD CONSTRAINT valid_trade_price_basis 
      CHECK (trade_price_basis IN ('OPTION_PREMIUM', 'UNDERLYING_PRICE'));
  END IF;
  
  -- Add entry_price_source if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'entry_price_source'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN entry_price_source TEXT DEFAULT 'polygon';
  END IF;
  
  -- Update status constraint to include 'expired'
  ALTER TABLE index_trades DROP CONSTRAINT IF EXISTS valid_status;
  ALTER TABLE index_trades ADD CONSTRAINT valid_status 
    CHECK (status IN ('draft', 'active', 'tp_hit', 'sl_hit', 'closed', 'canceled', 'expired'));
    
END $$;

-- Create index for expiry tracking
CREATE INDEX IF NOT EXISTS idx_index_trades_expiry ON index_trades(expiry_datetime) 
  WHERE status = 'active' AND expiry_datetime IS NOT NULL;

-- Create index for telegram channel
CREATE INDEX IF NOT EXISTS idx_index_trades_telegram_channel ON index_trades(telegram_channel_id);

-- =====================================================
-- 2. ANALYSIS TELEGRAM FIELDS
-- =====================================================

DO $$
BEGIN
  -- Add telegram channel override
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_analyses' AND column_name = 'telegram_channel_id'
  ) THEN
    ALTER TABLE index_analyses ADD COLUMN telegram_channel_id UUID REFERENCES telegram_channels(id);
  END IF;
  
  -- Add telegram send toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_analyses' AND column_name = 'telegram_send_enabled'
  ) THEN
    ALTER TABLE index_analyses ADD COLUMN telegram_send_enabled BOOLEAN DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_index_analyses_telegram_channel ON index_analyses(telegram_channel_id);

-- =====================================================
-- 3. TELEGRAM OUTBOX FOR RELIABLE DELIVERY
-- =====================================================

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  telegram_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  CONSTRAINT valid_message_type CHECK (message_type IN (
    'new_analysis', 'new_trade', 'analysis_update', 'trade_update', 
    'trade_result', 'new_high', 'target_hit', 'stop_hit'
  )),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_outbox_status ON telegram_outbox(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_retry ON telegram_outbox(next_retry_at) 
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;

-- Enable RLS
ALTER TABLE telegram_outbox ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access to telegram_outbox"
  ON telegram_outbox FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Analysts can view their own outbox messages
CREATE POLICY "Analysts can view own telegram_outbox"
  ON telegram_outbox FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM telegram_channels tc
      WHERE tc.channel_id = telegram_outbox.channel_id
      AND tc.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. ANALYST TRADE STATISTICS
-- =====================================================

CREATE TABLE IF NOT EXISTS analyst_trade_stats (
  analyst_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_trades INTEGER DEFAULT 0,
  active_trades INTEGER DEFAULT 0,
  closed_trades INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  expired INTEGER DEFAULT 0,
  win_rate NUMERIC(5, 2) DEFAULT 0,
  total_pnl_usd NUMERIC(12, 2) DEFAULT 0,
  avg_win_usd NUMERIC(12, 2) DEFAULT 0,
  avg_loss_usd NUMERIC(12, 2) DEFAULT 0,
  largest_win_usd NUMERIC(12, 2) DEFAULT 0,
  largest_loss_usd NUMERIC(12, 2) DEFAULT 0,
  last_30_days_trades INTEGER DEFAULT 0,
  last_30_days_wins INTEGER DEFAULT 0,
  last_30_days_pnl_usd NUMERIC(12, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyst_trade_stats_win_rate ON analyst_trade_stats(win_rate DESC);
CREATE INDEX IF NOT EXISTS idx_analyst_trade_stats_pnl ON analyst_trade_stats(total_pnl_usd DESC);

-- Enable RLS
ALTER TABLE analyst_trade_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can view trade stats
CREATE POLICY "Anyone can view analyst_trade_stats"
  ON analyst_trade_stats FOR SELECT
  TO authenticated
  USING (true);

-- Service role can update
CREATE POLICY "Service role can update analyst_trade_stats"
  ON analyst_trade_stats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 5. UPDATE ANALYZER PLANS TELEGRAM INTEGRATION
-- =====================================================

DO $$
BEGIN
  -- Update telegram_channel_id to be UUID reference
  -- First, check if it's text type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyzer_plans' 
    AND column_name = 'telegram_channel_id'
    AND data_type = 'text'
  ) THEN
    -- Drop existing column and recreate as UUID
    ALTER TABLE analyzer_plans DROP COLUMN IF EXISTS telegram_channel_id;
    ALTER TABLE analyzer_plans ADD COLUMN telegram_channel_id UUID REFERENCES telegram_channels(id);
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyzer_plans' AND column_name = 'telegram_channel_id'
  ) THEN
    ALTER TABLE analyzer_plans ADD COLUMN telegram_channel_id UUID REFERENCES telegram_channels(id);
  END IF;
  
  -- Add broadcast enabled flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyzer_plans' AND column_name = 'telegram_broadcast_enabled'
  ) THEN
    ALTER TABLE analyzer_plans ADD COLUMN telegram_broadcast_enabled BOOLEAN DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_analyzer_plans_telegram_channel ON analyzer_plans(telegram_channel_id);

-- =====================================================
-- 6. FUNCTIONS FOR TRADE STATS UPDATES
-- =====================================================

CREATE OR REPLACE FUNCTION update_analyst_trade_stats(p_analyst_id UUID)
RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Calculate all stats in one query
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'active') as active,
    COUNT(*) FILTER (WHERE status IN ('tp_hit', 'sl_hit', 'expired', 'closed')) as closed,
    COUNT(*) FILTER (WHERE outcome = 'succeed') as wins,
    COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
    COUNT(*) FILTER (WHERE outcome = 'expired') as expired,
    COALESCE(SUM(pnl_usd), 0) as total_pnl,
    COALESCE(AVG(pnl_usd) FILTER (WHERE outcome = 'succeed'), 0) as avg_win,
    COALESCE(AVG(pnl_usd) FILTER (WHERE outcome IN ('loss', 'expired')), 0) as avg_loss,
    COALESCE(MAX(pnl_usd), 0) as largest_win,
    COALESCE(MIN(pnl_usd), 0) as largest_loss,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') as last_30_trades,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days' AND outcome = 'succeed') as last_30_wins,
    COALESCE(SUM(pnl_usd) FILTER (WHERE created_at >= now() - interval '30 days'), 0) as last_30_pnl
  INTO v_stats
  FROM index_trades
  WHERE author_id = p_analyst_id
  AND status != 'draft';
  
  -- Calculate win rate
  DECLARE
    v_win_rate NUMERIC(5, 2);
  BEGIN
    IF v_stats.closed > 0 THEN
      v_win_rate := (v_stats.wins::numeric / v_stats.closed::numeric * 100);
    ELSE
      v_win_rate := 0;
    END IF;
    
    -- Upsert stats
    INSERT INTO analyst_trade_stats (
      analyst_id, total_trades, active_trades, closed_trades,
      wins, losses, expired, win_rate, total_pnl_usd,
      avg_win_usd, avg_loss_usd, largest_win_usd, largest_loss_usd,
      last_30_days_trades, last_30_days_wins, last_30_days_pnl_usd,
      updated_at
    ) VALUES (
      p_analyst_id, v_stats.total, v_stats.active, v_stats.closed,
      v_stats.wins, v_stats.losses, v_stats.expired, v_win_rate, v_stats.total_pnl,
      v_stats.avg_win, v_stats.avg_loss, v_stats.largest_win, v_stats.largest_loss,
      v_stats.last_30_trades, v_stats.last_30_wins, v_stats.last_30_pnl,
      now()
    )
    ON CONFLICT (analyst_id) DO UPDATE SET
      total_trades = EXCLUDED.total_trades,
      active_trades = EXCLUDED.active_trades,
      closed_trades = EXCLUDED.closed_trades,
      wins = EXCLUDED.wins,
      losses = EXCLUDED.losses,
      expired = EXCLUDED.expired,
      win_rate = EXCLUDED.win_rate,
      total_pnl_usd = EXCLUDED.total_pnl_usd,
      avg_win_usd = EXCLUDED.avg_win_usd,
      avg_loss_usd = EXCLUDED.avg_loss_usd,
      largest_win_usd = EXCLUDED.largest_win_usd,
      largest_loss_usd = EXCLUDED.largest_loss_usd,
      last_30_days_trades = EXCLUDED.last_30_days_trades,
      last_30_days_wins = EXCLUDED.last_30_days_wins,
      last_30_days_pnl_usd = EXCLUDED.last_30_days_pnl_usd,
      updated_at = now();
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Trigger to update stats when trade status changes
CREATE OR REPLACE FUNCTION trigger_update_analyst_trade_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update stats for the analyst
  PERFORM update_analyst_trade_stats(NEW.author_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS tr_index_trades_update_stats ON index_trades;
CREATE TRIGGER tr_index_trades_update_stats
  AFTER INSERT OR UPDATE OF status, outcome, pnl_usd
  ON index_trades
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_analyst_trade_stats();

-- =====================================================
-- 7. HELPER FUNCTION TO QUEUE TELEGRAM MESSAGES
-- =====================================================

CREATE OR REPLACE FUNCTION queue_telegram_message(
  p_message_type TEXT,
  p_payload JSONB,
  p_channel_id TEXT,
  p_priority INTEGER DEFAULT 5
)
RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO telegram_outbox (
    message_type,
    payload,
    channel_id,
    status,
    priority,
    next_retry_at
  ) VALUES (
    p_message_type,
    p_payload,
    p_channel_id,
    'pending',
    p_priority,
    now()
  )
  RETURNING id INTO v_message_id;
  
  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION queue_telegram_message TO service_role;
GRANT EXECUTE ON FUNCTION update_analyst_trade_stats TO service_role;
