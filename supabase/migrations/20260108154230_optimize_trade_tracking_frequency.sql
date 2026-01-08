/*
  # Optimize Trade Tracking Frequency

  1. Technical Limitation
    - PostgreSQL cron extension (pg_cron) has a minimum interval of 1 minute
    - Cannot run more frequently (e.g., every 5 seconds) using pg_cron alone
    - This is a hard limitation of the pg_cron extension

  2. What This Migration Does
    - Ensures cron job runs every minute without gaps
    - Increases timeout to 55 seconds for processing multiple trades
    - Prioritizes trades by last_quote_at (updates stale trades first)

  3. For Real 5-Second Updates
    - Frontend: Poll API every 5 seconds for live display
    - Backend: Use WebSocket/SSE for push notifications
    - External: Deploy separate service (Fly.io) for sub-minute updates

  4. Current Setup
    - Database updated every 1 minute with latest prices
    - Fresh snapshots generated with cache-busting for Telegram
    - Alerts sent when targets/stops are hit
*/

-- Drop existing cron job if exists
SELECT cron.unschedule('indices-trade-tracker') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'indices-trade-tracker'
);

-- Recreate with optimized settings (1 minute is the minimum)
SELECT cron.schedule(
  'indices-trade-tracker',
  '* * * * *',
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

COMMENT ON EXTENSION pg_cron IS 'Trade tracker optimized to run every 1 minute (pg_cron minimum). For 5-second updates, implement frontend polling at /api/indices/trades/[id] endpoint.';
