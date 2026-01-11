/*
  # Add Expired Trades Closer Cron Job
  
  1. Purpose
    - Automatically close expired option trades daily
    - Trades that reached $100+ max profit are counted as wins
    - Trades that didn't reach $100 are counted as losses
    
  2. Schedule
    - Runs daily at 9:00 PM ET (after market close)
    - Uses pg_cron extension
    
  3. Logic
    - Checks all active option trades
    - Closes any with expiry date < current date
    - Sets final profit based on max_profit achieved
*/

-- Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('expired-trades-closer');
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

-- Create cron job to run daily at 9:00 PM ET (01:00 UTC next day)
SELECT cron.schedule(
  'expired-trades-closer',
  '0 1 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/expired-trades-closer',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
  $$
);

-- Add comment
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used for automated trade management';
