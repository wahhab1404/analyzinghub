/*
  # Fix Trade Tracking to 1-Minute Intervals

  1. Changes
    - Update indices-trade-tracker to run every 1 minute (pg_cron minimum)
    - For 5-second updates, use the realtime-pricing-service instead
    - Cron job handles: target/stoploss detection, database updates, Telegram alerts
    - Realtime service handles: live price streaming to frontend

  2. Architecture
    - Cron (1 min): Database persistence, alerts, snapshot generation
    - Realtime Service (5 sec): Live frontend updates via SSE
    - Both work together for optimal performance

  3. Performance
    - 1-minute cron = 60 checks/hour = 1,440 checks/day
    - Efficient for background processing and alerts
*/

-- Drop existing cron job (if exists)
SELECT cron.unschedule('indices-trade-tracker') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'indices-trade-tracker'
);

-- Recreate with 1 minute interval (fastest pg_cron supports)
SELECT cron.schedule(
  'indices-trade-tracker',
  '* * * * *',  -- Every 1 minute
  $$
  SELECT
    net.http_post(
      url := concat(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/indices-trade-tracker'
      ),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.supabase_service_role_key', true)),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'indices-trade-tracker runs every 1 minute for price checks and alerts. Use realtime-pricing-service for 5-second frontend updates.';
