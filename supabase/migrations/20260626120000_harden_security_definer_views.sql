/*
  # Harden the SECURITY DEFINER views flagged by the Supabase Security Advisor

  Views flagged (CRITICAL — "Security Definer View"):
    - public.cron_job_status
    - public.v_user_indices_permissions   (leaked email/full_name/role of ALL
                                            users to any authenticated client)
    - public.spx_recent_prices
    - public.spx_signal_performance

  These are monitoring / debug / engine helper views. A grep of the whole repo
  (frontend, API routes, edge functions) shows NONE of them are queried by app
  code — they were only ever reachable through the auto-exposed PostgREST API.

  Fix (safe — nothing in code depends on them):
    1. security_invoker = on  → the view runs with the *caller's* RLS/privileges
       instead of the owner's, which clears the advisor finding. (Postgres 15+;
       this project is PG17.)
    2. REVOKE from anon/authenticated → they are no longer exposed via the API
       at all. The Supabase SQL editor / admin (role `postgres`) and service_role
       server code can still read them.
*/

ALTER VIEW public.cron_job_status            SET (security_invoker = on);
ALTER VIEW public.v_user_indices_permissions SET (security_invoker = on);
ALTER VIEW public.spx_recent_prices          SET (security_invoker = on);
ALTER VIEW public.spx_signal_performance     SET (security_invoker = on);

REVOKE ALL ON public.cron_job_status            FROM anon, authenticated;
REVOKE ALL ON public.v_user_indices_permissions FROM anon, authenticated;
REVOKE ALL ON public.spx_recent_prices          FROM anon, authenticated;
REVOKE ALL ON public.spx_signal_performance     FROM anon, authenticated;
