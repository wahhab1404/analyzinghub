/*
  # Create Cron Jobs for Indices System

  1. Extensions
    - Enable `pg_cron` for scheduled jobs
    - Enable `pg_net` for HTTP requests to edge functions

  2. Cron Jobs
    - `indices-trade-tracker`: Runs every 5 minutes to check trade conditions
    - `indices-telegram-publisher`: Runs every 1 minute to publish pending updates

  3. Notes
    - Jobs call Supabase Edge Functions via HTTP
    - Uses service role authentication
    - Logs are available in cron.job_run_details table
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a helper function to get the service role key
-- Note: This stores the key in the database vault
-- You'll need to set this via: SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
CREATE OR REPLACE FUNCTION get_supabase_url()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.settings.supabase_url', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule trade tracker (every 5 minutes)
-- Checks active trades and determines if they've hit entry/target/stop conditions
SELECT cron.schedule(
  'indices-trade-tracker',
  '*/5 * * * *',
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
      timeout_milliseconds := 30000
    );
  $$
);

-- Schedule telegram publisher (every 1 minute)
-- Publishes pending trade updates to Telegram channels
SELECT cron.schedule(
  'indices-telegram-publisher',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := concat(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/indices-telegram-publisher'
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

-- Create a view to easily monitor cron job status
CREATE OR REPLACE VIEW cron_job_status AS
SELECT 
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  r.runid,
  r.status,
  r.start_time,
  r.end_time,
  r.return_message
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT runid, job_pid, status, start_time, end_time, return_message
  FROM cron.job_run_details
  WHERE jobid = j.jobid
  ORDER BY start_time DESC
  LIMIT 1
) r ON true
ORDER BY j.jobname;

-- Grant select on the view
GRANT SELECT ON cron_job_status TO authenticated;
GRANT SELECT ON cron_job_status TO service_role;

-- Add helpful comment
COMMENT ON VIEW cron_job_status IS 'Monitor the status of scheduled cron jobs for the indices system';
