/*
  # Fix SPX Engine Runner Cron — use hardcoded URL/bearer

  The original spx_engine_cron migration scheduled the runner with
  `current_setting('app.supabase_url')` / `current_setting('app.supabase_anon_key')`.
  Those database GUCs are NOT set in this project, so `current_setting(...)`
  (without the missing_ok flag) raised "unrecognized configuration parameter"
  on every run — the cron fired each minute but the net.http_post never
  executed, so the SPX intelligence engine never ran automatically. It only
  ran while an admin had the Live panel open.

  This migration recreates both ticks using the same hardcoded URL + service
  role bearer pattern as the working `indices-trade-tracker` cron, so the
  engine runs continuously during market hours regardless of GUC state.

  NOTE: the spx-engine-runner edge function forwards an X-SPX-Engine-Secret
  header to /api/spx/signal. For the engine to bypass user auth, set
  SPX_ENGINE_SECRET to the SAME value in both the Netlify app env and the
  spx-engine-runner edge function env.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop the old (broken) schedules if present
    PERFORM cron.unschedule('spx-engine-runner-tick1')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'spx-engine-runner-tick1');
    PERFORM cron.unschedule('spx-engine-runner-tick2')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'spx-engine-runner-tick2');

    -- Tick 1 — top of every minute
    PERFORM cron.schedule(
      'spx-engine-runner-tick1',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/spx-engine-runner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      );
      $job$
    );

    -- Tick 2 — ~30s offset so the engine effectively runs twice per minute
    PERFORM cron.schedule(
      'spx-engine-runner-tick2',
      '* * * * *',
      $job$
      SELECT pg_sleep(30);
      SELECT net.http_post(
        url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/spx-engine-runner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      );
      $job$
    );
  END IF;
END $$;
