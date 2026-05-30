-- Schedule spx-engine-runner edge function every 30 seconds
-- (pg_cron minimum is 1 minute, so we schedule it twice per minute with a 30s offset)

SELECT cron.schedule(
  'spx-engine-runner-tick1',
  '* * * * *',
  $$
    SELECT net.http_post(
      url       := current_setting('app.supabase_url') || '/functions/v1/spx-engine-runner',
      headers   := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
                   ),
      body      := '{}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'spx-engine-runner-tick2',
  '* * * * *',
  $$
    SELECT pg_sleep(30);
    SELECT net.http_post(
      url       := current_setting('app.supabase_url') || '/functions/v1/spx-engine-runner',
      headers   := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
                   ),
      body      := '{}'::jsonb
    );
  $$
);
