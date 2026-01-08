/*
  # Replace HTTP-based Cron with Direct Function Call
  
  1. Changes
    - Remove the existing indices-trade-tracker cron job that uses net.http_post()
    - Replace with a direct function call that doesn't use HTTP
    - This avoids memory issues with net.http_post()
  
  2. Why This Fixes the Issue
    - net.http_post() queues requests which exhausts memory
    - Direct function calls are more efficient
*/

-- Remove the old cron job
SELECT cron.unschedule('indices-trade-tracker') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'indices-trade-tracker');

-- Create new cron job with direct invocation
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
      timeout_milliseconds := 25000
    ) AS request_id;
  $$
);
