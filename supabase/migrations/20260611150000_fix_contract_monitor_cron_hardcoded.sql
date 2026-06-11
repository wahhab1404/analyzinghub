/*
  # Fix indices-contract-monitor cron

  The original schedule used current_setting('app.settings.supabase_url') /
  service_role_key GUCs, but those are NOT configured on this project, so the
  cron's net.http_post URL resolved to NULL and every run failed — the monitor
  never executed (no preparation alerts, no price tracking, no execution).

  Re-schedule with a hardcoded project URL and no auth header, matching the
  working buy-range-alert-checker cron. The function is deployed with
  verify_jwt=false, so no Authorization header is required.
*/

DO $$
BEGIN
  PERFORM cron.unschedule('indices-contract-monitor');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'indices-contract-monitor',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/indices-contract-monitor',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
