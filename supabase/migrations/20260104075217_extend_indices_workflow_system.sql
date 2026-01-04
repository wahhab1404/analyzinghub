/*
  # Extend Indices Hub System for Advanced Workflow
  
  ## Summary
  Extends the Indices Hub system to support:
  - Enhanced analysis metadata (timeframe, schools, Telegram channel)
  - Trade price basis tracking (option premium vs underlying price)
  - Bilingual updates (Arabic + English)
  - Telegram publishing log with deduplication
  - System-generated updates for automated events
  
  ## New Fields
  
  ### index_analyses
  - `timeframe` - Trading timeframe (1m, 5m, 15m, 1h, 4h, 1d, etc.)
  - `schools_used` - Array of analysis methodologies used
  - `invalidation_price` - Price level that invalidates the analysis
  - `telegram_channel_id` - UUID reference to analyst's Telegram channel
  - `telegram_message_id` - Telegram message ID after publishing
  - `telegram_published_at` - Timestamp of Telegram publish
  
  ### index_trades
  - `trade_price_basis` - Whether targets/stops are on OPTION_PREMIUM or UNDERLYING_PRICE
  - `entry_price_source` - Whether entry was from Polygon or manual override
  - `entry_override_reason` - If manual, why was it overridden
  - `win_condition_met` - Description of win condition when closed
  - `loss_condition_met` - Description of loss condition when closed
  - `telegram_message_id` - Telegram message ID after publishing
  - `telegram_published_at` - Timestamp of Telegram publish
  
  ### analysis_updates & trade_updates
  - `text_ar` - Arabic text (renamed from body)
  - `text_en` - English text
  - `update_type` - Type: manual, system, target_hit, stop_hit, etc.
  - `telegram_message_id` - Telegram message ID if sent
  - `telegram_published_at` - Timestamp of Telegram publish
  
  ## New Tables
  
  ### telegram_send_log
  Tracks all Telegram sends for deduplication and audit
  - id, entity_type, entity_id, channel_id, payload_hash
  - telegram_message_id, status, error, created_at
  
  ## Notes
  - All changes are additive (no data loss)
  - Default values provided for existing records
  - Maintains backward compatibility
*/

-- =====================================================
-- EXTEND index_analyses TABLE
-- =====================================================

DO $$
BEGIN
  -- Add timeframe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_analyses' AND column_name = 'timeframe'
  ) THEN
    ALTER TABLE index_analyses 
    ADD COLUMN timeframe TEXT;
  END IF;
  
  -- Add schools_used (array of text)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_analyses' AND column_name = 'schools_used'
  ) THEN
    ALTER TABLE index_analyses 
    ADD COLUMN schools_used TEXT[] DEFAULT '{}';
  END IF;
  
  -- Add invalidation_price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_analyses' AND column_name = 'invalidation_price'
  ) THEN
    ALTER TABLE index_analyses 
    ADD COLUMN invalidation_price NUMERIC(10, 2);
  END IF;
  
  -- Add telegram_channel_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_analyses' AND column_name = 'telegram_channel_id'
  ) THEN
    ALTER TABLE index_analyses 
    ADD COLUMN telegram_channel_id UUID REFERENCES telegram_channels(id) ON DELETE SET NULL;
  END IF;
  
  -- Add telegram_message_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_analyses' AND column_name = 'telegram_message_id'
  ) THEN
    ALTER TABLE index_analyses 
    ADD COLUMN telegram_message_id TEXT;
  END IF;
  
  -- Add telegram_published_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_analyses' AND column_name = 'telegram_published_at'
  ) THEN
    ALTER TABLE index_analyses 
    ADD COLUMN telegram_published_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- EXTEND index_trades TABLE
-- =====================================================

DO $$
BEGIN
  -- Add trade_price_basis
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'trade_price_basis'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN trade_price_basis TEXT DEFAULT 'OPTION_PREMIUM';
    
    ALTER TABLE index_trades 
    ADD CONSTRAINT valid_price_basis 
    CHECK (trade_price_basis IN ('OPTION_PREMIUM', 'UNDERLYING_PRICE'));
  END IF;
  
  -- Add entry_price_source
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'entry_price_source'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN entry_price_source TEXT DEFAULT 'polygon';
    
    ALTER TABLE index_trades 
    ADD CONSTRAINT valid_entry_source 
    CHECK (entry_price_source IN ('polygon', 'manual'));
  END IF;
  
  -- Add entry_override_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'entry_override_reason'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN entry_override_reason TEXT;
  END IF;
  
  -- Add win_condition_met
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'win_condition_met'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN win_condition_met TEXT;
  END IF;
  
  -- Add loss_condition_met
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'loss_condition_met'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN loss_condition_met TEXT;
  END IF;
  
  -- Add telegram_message_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'telegram_message_id'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN telegram_message_id TEXT;
  END IF;
  
  -- Add telegram_published_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'telegram_published_at'
  ) THEN
    ALTER TABLE index_trades 
    ADD COLUMN telegram_published_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- EXTEND analysis_updates TABLE
-- =====================================================

DO $$
BEGIN
  -- Rename body to text_en (keep both for transition)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analysis_updates' AND column_name = 'text_en'
  ) THEN
    ALTER TABLE analysis_updates 
    ADD COLUMN text_en TEXT;
    
    -- Copy existing body to text_en
    UPDATE analysis_updates SET text_en = body WHERE text_en IS NULL;
  END IF;
  
  -- Add text_ar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analysis_updates' AND column_name = 'text_ar'
  ) THEN
    ALTER TABLE analysis_updates 
    ADD COLUMN text_ar TEXT;
  END IF;
  
  -- Add update_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analysis_updates' AND column_name = 'update_type'
  ) THEN
    ALTER TABLE analysis_updates 
    ADD COLUMN update_type TEXT DEFAULT 'manual';
    
    ALTER TABLE analysis_updates 
    ADD CONSTRAINT valid_update_type 
    CHECK (update_type IN ('manual', 'system', 'target_hit', 'stop_hit', 'invalidation', 'adjustment'));
  END IF;
  
  -- Add telegram fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analysis_updates' AND column_name = 'telegram_message_id'
  ) THEN
    ALTER TABLE analysis_updates 
    ADD COLUMN telegram_message_id TEXT,
    ADD COLUMN telegram_published_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- EXTEND trade_updates TABLE
-- =====================================================

DO $$
BEGIN
  -- Rename body to text_en (keep both for transition)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trade_updates' AND column_name = 'text_en'
  ) THEN
    ALTER TABLE trade_updates 
    ADD COLUMN text_en TEXT;
    
    -- Copy existing body to text_en
    UPDATE trade_updates SET text_en = body WHERE text_en IS NULL;
  END IF;
  
  -- Add text_ar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trade_updates' AND column_name = 'text_ar'
  ) THEN
    ALTER TABLE trade_updates 
    ADD COLUMN text_ar TEXT;
  END IF;
  
  -- Add update_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trade_updates' AND column_name = 'update_type'
  ) THEN
    ALTER TABLE trade_updates 
    ADD COLUMN update_type TEXT DEFAULT 'manual';
    
    ALTER TABLE trade_updates 
    ADD CONSTRAINT valid_trade_update_type 
    CHECK (update_type IN ('manual', 'system', 'target_hit', 'stop_hit', 'entry_fill', 'scale', 'adjustment'));
  END IF;
  
  -- Add telegram fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trade_updates' AND column_name = 'telegram_message_id'
  ) THEN
    ALTER TABLE trade_updates 
    ADD COLUMN telegram_message_id TEXT,
    ADD COLUMN telegram_published_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- CREATE telegram_send_log TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS telegram_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL,
  telegram_message_id TEXT,
  telegram_chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT valid_entity_type CHECK (entity_type IN ('analysis', 'trade', 'analysis_update', 'trade_update', 'trade_result')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_send_log_entity ON telegram_send_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_telegram_send_log_channel ON telegram_send_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_telegram_send_log_hash ON telegram_send_log(payload_hash);
CREATE INDEX IF NOT EXISTS idx_telegram_send_log_status ON telegram_send_log(status, created_at) WHERE status = 'pending';

-- Add RLS to telegram_send_log
ALTER TABLE telegram_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors can view own telegram logs"
  ON telegram_send_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM telegram_channels
      WHERE telegram_channels.id = telegram_send_log.channel_id
      AND telegram_channels.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage telegram logs"
  ON telegram_send_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to compute payload hash for deduplication
CREATE OR REPLACE FUNCTION compute_telegram_payload_hash(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_channel_id UUID,
  p_content TEXT
)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    digest(
      p_entity_type || '::' || p_entity_id::text || '::' || p_channel_id::text || '::' || p_content,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if message already sent (deduplication)
CREATE OR REPLACE FUNCTION telegram_message_already_sent(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_channel_id UUID,
  p_payload_hash TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM telegram_send_log
    WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND channel_id = p_channel_id
    AND payload_hash = p_payload_hash
    AND status = 'sent'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =====================================================
-- ADD INDEXES FOR NEW FIELDS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_index_analyses_telegram_channel 
ON index_analyses(telegram_channel_id) WHERE telegram_channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_index_trades_price_basis 
ON index_trades(trade_price_basis);

-- Index for finding trades that need price updates
CREATE INDEX IF NOT EXISTS idx_index_trades_needs_update 
ON index_trades(status, last_quote_at) 
WHERE status = 'active';

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN index_analyses.timeframe IS 'Trading timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, etc.';
COMMENT ON COLUMN index_analyses.schools_used IS 'Analysis methodologies: Classic TA, Elliott Wave, ICT, Harmonics, Supply/Demand, etc.';
COMMENT ON COLUMN index_analyses.invalidation_price IS 'Price level that would invalidate this analysis';
COMMENT ON COLUMN index_analyses.telegram_channel_id IS 'Telegram channel where this analysis was/will be published';

COMMENT ON COLUMN index_trades.trade_price_basis IS 'Whether targets/stops reference OPTION_PREMIUM or UNDERLYING_PRICE';
COMMENT ON COLUMN index_trades.entry_price_source IS 'Source of entry price: polygon (auto) or manual (override)';
COMMENT ON COLUMN index_trades.entry_override_reason IS 'If manual entry, explanation of why override was needed';
COMMENT ON COLUMN index_trades.win_condition_met IS 'Description of win condition when trade closed as tp_hit';
COMMENT ON COLUMN index_trades.loss_condition_met IS 'Description of loss condition when trade closed as sl_hit';

COMMENT ON TABLE telegram_send_log IS 'Audit log of all Telegram messages sent, with deduplication support';
COMMENT ON COLUMN telegram_send_log.payload_hash IS 'SHA256 hash of message content for deduplication';
