/*
  # Fix Cron Jobs with Hardcoded Configuration
  
  1. Updates
    - Drop and recreate cron jobs with hardcoded Supabase URL and service key
    - Ensures target checker and trade tracker can actually run
  
  This fixes the issue where app.settings were not configured.
*/

-- Drop existing cron jobs
SELECT cron.unschedule('indices-trade-tracker');
SELECT cron.unschedule('indices-telegram-publisher');
SELECT cron.unschedule('check-analysis-targets');

-- Recreate trade tracker (every 1 minute for real-time tracking)
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
      timeout_milliseconds := 55000
    );
  $$
);

-- Recreate analysis target checker (every 5 minutes)
SELECT cron.schedule(
  'check-analysis-targets',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/analysis-target-checker',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);