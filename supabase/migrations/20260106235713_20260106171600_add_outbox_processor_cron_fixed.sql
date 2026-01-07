/*
  # Add Telegram Outbox Processor Cron Job
  
  Adds cron job to process telegram outbox messages every 2 minutes
*/

-- Schedule telegram outbox processor every 2 minutes
SELECT cron.schedule(
  'telegram-outbox-processor',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/telegram-outbox-processor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
