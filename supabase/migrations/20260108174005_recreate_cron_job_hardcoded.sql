/*
  # Recreate Cron Job with Hardcoded URL

  This migration recreates the indices-trade-tracker cron job with hardcoded URLs
  instead of relying on database settings.

  ## Changes
  - Create the cron job with hardcoded Supabase URL and service role key
*/

-- Create with hardcoded URL
SELECT cron.schedule(
  'indices-trade-tracker',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/indices-trade-tracker',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    ) AS request_id;
  $$
);
