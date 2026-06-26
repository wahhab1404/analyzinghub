/*
  # Security hardening: pin search_path on all SECURITY DEFINER functions

  The Supabase Security Advisor flagged ~30 SECURITY DEFINER functions in the
  public schema that have no fixed search_path ("Function Search Path Mutable").
  A SECURITY DEFINER function with a mutable search_path can be hijacked: a
  caller can prepend a schema they control and shadow an unqualified object the
  function references, then have it execute with the definer's (elevated)
  privileges.

  Fix: pin `search_path = public, pg_temp` on every SECURITY DEFINER function in
  public that lacks an explicit search_path. This is safe — the default path is
  ("$user", public), which already excludes cron/net/vault/extensions, so any
  function that works today must already schema-qualify those references;
  restricting to public cannot break a currently-working function, and pg_temp
  is listed LAST so it cannot be used to shadow anything.

  Done dynamically so every flagged function is covered regardless of signature.

  NOTE: the two RLS-enabled-no-policy tables (bot_sessions,
  index_analysis_telegram_messages) are intentionally deny-all — they are only
  ever accessed by the service-role key server-side, so they are already secure
  and need no policy.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                   -- SECURITY DEFINER only
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;
