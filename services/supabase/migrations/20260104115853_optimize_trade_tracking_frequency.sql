/*
  # Optimize Trade Tracking Frequency

  1. Changes
    - Update indices-trade-tracker cron to run every 30 seconds (instead of 5 minutes)
    - This enables near real-time price monitoring without overwhelming the system
    - More frequent checks = faster detection of new highs and target hits

  2. Performance Impact
    - 30 second interval = 2 checks per minute = 120 checks per hour
    - Each check processes up to 50 active trades
    - Uses efficient queries with proper indexing
    - Polygon API calls are batched and cached

  3. Notes
    - Previous: Every 5 minutes (12 checks/hour)
    - New: Every 30 seconds (120 checks/hour)
    - 10x increase in frequency for better user experience
*/

-- Drop existing cron job
SELECT cron.unschedule('indices-trade-tracker');

-- Recreate with 30 second interval
SELECT cron.schedule(
  'indices-trade-tracker',
  '*/30 * * * * *',  -- Every 30 seconds (note the 6th field for seconds)
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
      timeout_milliseconds := 25000
    );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Updated indices-trade-tracker to run every 30 seconds for near real-time price monitoring';
