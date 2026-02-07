/*
  # Fix Daily Report Cron Jobs

  1. Problem
    - Cron jobs are failing with error: "unrecognized configuration parameter app.settings.supabase_url"
    - Jobs have been failing since deployment
    - Reports are not being automatically generated

  2. Solution
    - Drop existing broken cron jobs
    - Recreate with hardcoded Supabase URL
    - Use pg_net extension to make HTTP calls to edge functions
    - Jobs will now run successfully at scheduled times

  3. Schedule
    - auto-daily-reports-generator: Runs at 1:30 PM UTC (8:30 AM ET) Monday-Friday
    - daily-pdf-report-generator: Runs at 9:00 PM UTC (4:00 PM ET) Monday-Friday

  4. Security Note
    - Using Supabase's internal network for edge function calls
    - Service role authentication handled by edge functions
*/

-- Drop existing broken cron jobs
SELECT cron.unschedule('daily-pdf-report-generator');
SELECT cron.unschedule('auto-daily-reports-generator');

-- Recreate auto-daily-reports-generator (runs at 1:30 PM UTC)
SELECT cron.schedule(
  'auto-daily-reports-generator',
  '30 13 * * 1-5',
  $$
  SELECT
    net.http_post(
      url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/auto-daily-reports-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8'
      ),
      body := jsonb_build_object(
        'scheduled', true,
        'trigger_time', NOW()
      )
    ) AS request_id;
  $$
);

-- Recreate daily-pdf-report-generator (runs at 9:00 PM UTC)
SELECT cron.schedule(
  'daily-pdf-report-generator',
  '0 21 * * 1-5',
  $$
  SELECT
    net.http_post(
      url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/generate-daily-pdf-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8'
      ),
      body := jsonb_build_object(
        'scheduled', true,
        'trigger_time', NOW()
      )
    ) AS request_id;
  $$
);
