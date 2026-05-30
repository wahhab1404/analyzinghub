/*
  # Company Contract Deals Price Update Cron

  Fallback price/peak updater for active company option-contract deals. The
  primary live tracking is the Fly.io CompanyContractTracker; this cron is the
  belt-and-suspenders path (same approach as index trades) so prices and high
  watermarks keep advancing even if the Fly.io stream is unavailable.

  Schedules the `company-contract-price-tracker` edge function every 2 minutes
  via net.http_post, using the supabase URL + service role key stored in
  settings — identical to the existing indices cron jobs.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('company-contract-price-tracker')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'company-contract-price-tracker'
      );

    PERFORM cron.schedule(
      'company-contract-price-tracker',
      '*/2 * * * *',
      $job$
      SELECT net.http_post(
        url := concat(current_setting('app.settings.supabase_url', true), '/functions/v1/company-contract-price-tracker'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', concat('Bearer ', current_setting('app.settings.supabase_service_role_key', true))
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
END $$;
