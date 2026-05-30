-- ────────────────────────────────────────────────────────────────────────────
-- SPX Auto-Trade Feature
--
-- Adds:
--   1. spx_settings columns for auto-trade controls (premium cap, liquidity
--      floor, min confidence, selected Telegram channels, master toggle)
--   2. spx_trades.is_auto + auto_channel_ids + alert_sent_at for separating
--      automated trades from manual ones in reports/analytics
-- ────────────────────────────────────────────────────────────────────────────

-- 1) spx_settings extensions ─────────────────────────────────────────────────
ALTER TABLE spx_settings
  ADD COLUMN IF NOT EXISTS auto_trade_enabled                  boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_trade_max_premium              numeric(8,2) DEFAULT 4.00,
  ADD COLUMN IF NOT EXISTS auto_trade_min_liquidity            numeric(5,1) DEFAULT 60,
  ADD COLUMN IF NOT EXISTS auto_trade_min_confidence_class     text         DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS auto_trade_channel_ids              text[]       DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS auto_trade_track_lifecycle          boolean      DEFAULT true;

COMMENT ON COLUMN spx_settings.auto_trade_enabled              IS 'Master ON/OFF for automated SPX trade selection.';
COMMENT ON COLUMN spx_settings.auto_trade_max_premium          IS 'Maximum contract mid premium ($) eligible for auto-trade.';
COMMENT ON COLUMN spx_settings.auto_trade_min_liquidity        IS 'Minimum liquidity_score (0-100) required to auto-pick a contract.';
COMMENT ON COLUMN spx_settings.auto_trade_min_confidence_class IS 'Minimum signal confidence class accepted (A is strongest, E weakest).';
COMMENT ON COLUMN spx_settings.auto_trade_channel_ids          IS 'Telegram chat_id strings to receive automated trade alerts.';
COMMENT ON COLUMN spx_settings.auto_trade_track_lifecycle      IS 'When true, auto-trades get TP/SL/closed alerts to the same channels.';

-- 2) spx_trades extensions ───────────────────────────────────────────────────
ALTER TABLE spx_trades
  ADD COLUMN IF NOT EXISTS is_auto             boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_channel_ids    text[]       DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS alert_sent_at       timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_target_alerted smallint     DEFAULT 0;

CREATE INDEX IF NOT EXISTS spx_trades_is_auto_idx          ON spx_trades (is_auto) WHERE is_auto = true;
CREATE INDEX IF NOT EXISTS spx_trades_pending_auto_alert   ON spx_trades (created_at) WHERE is_auto = true AND alert_sent_at IS NULL;

COMMENT ON COLUMN spx_trades.is_auto             IS 'TRUE if the trade was created by the auto-trade selector (excluded from manual analytics).';
COMMENT ON COLUMN spx_trades.auto_channel_ids    IS 'Telegram chat_ids that received this auto-trade alert (for lifecycle replies).';
COMMENT ON COLUMN spx_trades.alert_sent_at       IS 'Timestamp the initial NEW_TRADE image was sent to Telegram.';
COMMENT ON COLUMN spx_trades.last_target_alerted IS 'Highest target index (1/2/3) we already alerted on, to avoid duplicates.';
