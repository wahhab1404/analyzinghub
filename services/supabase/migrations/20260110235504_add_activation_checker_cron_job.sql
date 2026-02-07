/*
  # Add Activation Condition Checker Cron Job

  1. New Cron Job
    - Runs every 5 minutes
    - Checks activation conditions for all published_inactive analyses
    - Activates analyses when conditions are met
    - Logs pre-activation stop touches

  2. Notes
    - Runs frequently enough to catch intrabar conditions
    - Also processes candle-close conditions (1H, 4H, Daily)
    - Uses same infrastructure as indices cron jobs
*/

-- Unschedule existing job if it exists
SELECT cron.unschedule('check-activation-conditions') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-activation-conditions'
);

-- Schedule activation condition checker (every 5 minutes)
SELECT cron.schedule(
  'check-activation-conditions',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := concat(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/activation-condition-checker'
      ),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.supabase_service_role_key', true)),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Cron job scheduler including activation condition checking every 5 minutes';
