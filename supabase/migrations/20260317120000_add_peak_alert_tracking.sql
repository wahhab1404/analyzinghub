-- ============================================================================
-- Peak Alert Tracking Columns
-- Prevents Telegram rate-limiting by recording the price and time at which
-- the last peak-high alert was sent, so the tracker can throttle alerts.
-- ============================================================================

DO $$
BEGIN
  -- Price at which the last peak alert was sent for this trade.
  -- NULL = no peak alert has been sent yet.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'last_peak_alert_price'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN last_peak_alert_price NUMERIC(10, 4) DEFAULT NULL;
  END IF;

  -- Timestamp when the last peak alert was sent.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'last_peak_alert_at'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN last_peak_alert_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN index_trades.last_peak_alert_price IS
  'Contract price at which the last new-high Telegram alert was sent. '
  'Used to throttle alerts: a new alert fires only when the gain has improved '
  'by ≥20 % over this value and at least 5 minutes have elapsed.';

COMMENT ON COLUMN index_trades.last_peak_alert_at IS
  'Timestamp of the most recent new-high Telegram alert for this trade. '
  'Used together with last_peak_alert_price to prevent alert spam.';
