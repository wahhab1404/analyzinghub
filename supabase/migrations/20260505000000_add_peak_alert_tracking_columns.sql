-- Add deduplication columns for peak (new-high) Telegram alerts.
-- Without these, dispatchPendingAlerts() in indices-trade-tracker always
-- evaluates lastPrice=0 and minsSinceLast=Infinity, firing an alert on
-- every cron tick regardless of whether the price actually changed.

ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS last_peak_alert_price NUMERIC,
  ADD COLUMN IF NOT EXISTS last_peak_alert_at     TIMESTAMPTZ;

-- Back-fill active trades so they don't immediately re-fire on next run.
UPDATE index_trades
SET
  last_peak_alert_price = contract_high_since,
  last_peak_alert_at    = now() - INTERVAL '10 minutes'
WHERE status = 'active'
  AND contract_high_since IS NOT NULL
  AND last_peak_alert_price IS NULL;
