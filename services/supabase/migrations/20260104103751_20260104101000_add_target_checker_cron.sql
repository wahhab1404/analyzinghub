/*
  # Add Target Checker Cron Job

  Creates a pg_cron job to check analysis targets every 5 minutes during market hours.
*/

-- Create cron job to check targets every 5 minutes
SELECT cron.schedule(
  'check-analysis-targets',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url:=current_setting('app.settings.supabase_url') || '/functions/v1/analysis-target-checker',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
