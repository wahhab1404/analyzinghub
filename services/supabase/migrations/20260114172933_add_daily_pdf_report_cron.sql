/*
  # Daily PDF Report Generation System

  1. Purpose
    - Automatically generate daily trading reports at market close (4 PM ET / 9 PM UTC)
    - Send professional reports to all subscriber Telegram channels
    - Store report data for historical tracking

  2. Cron Job
    - Runs Monday-Friday at 21:00 UTC (4 PM ET)
    - Only runs on trading days
    - Calls the generate-daily-pdf-report edge function

  3. Changes
    - Creates pg_cron job for daily report generation
    - Ensures job runs after market close
*/

-- Create the daily PDF report cron job (runs at 4 PM ET / 9 PM UTC)
SELECT cron.schedule(
  'daily-pdf-report-generator',
  '0 21 * * 1-5',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-daily-pdf-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'scheduled', true,
        'trigger_time', NOW()
      )
    );
  $$
);
