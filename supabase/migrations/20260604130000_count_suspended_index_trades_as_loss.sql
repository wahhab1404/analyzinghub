-- Suspended index contracts count as a finalized FULL LOSS (until resumed).
-- Recreates analyzer_stats_v2 so status = 'suspended' is treated like a finished
-- trade: included in totals and the win-rate denominator. The suspend API writes
-- is_win = false and a negative computed_profit_usd, so a suspended contract
-- lands as a loss; resuming reverts those fields.
--
-- Only additive vs the previous definition (adds 'suspended' to the status sets);
-- closed-trade behaviour is unchanged.

DROP VIEW IF EXISTS public.analyzer_stats_v2;

CREATE VIEW public.analyzer_stats_v2
WITH (security_invoker = true)
AS
SELECT
  p.id as analyzer_id,
  p.full_name,
  p.email,
  p.avatar_url,

  COALESCE(SUM(pl.points_awarded), 0) as total_points,

  COUNT(DISTINCT CASE WHEN t.status IN ('active', 'closed', 'suspended') THEN t.id END) as total_trades,
  COUNT(DISTINCT CASE WHEN t.is_win = true THEN t.id END) as winning_trades,
  COUNT(DISTINCT CASE WHEN t.is_win = false THEN t.id END) as losing_trades,

  CASE
    WHEN COUNT(DISTINCT CASE WHEN t.status IN ('closed', 'suspended') THEN t.id END) > 0 THEN
      ROUND(
        COUNT(DISTINCT CASE WHEN t.is_win = true AND t.status IN ('closed', 'suspended') THEN t.id END)::NUMERIC /
        COUNT(DISTINCT CASE WHEN t.status IN ('closed', 'suspended') THEN t.id END) * 100,
        2
      )
    ELSE 0
  END as win_rate,

  COALESCE(SUM(t.computed_profit_usd), 0) as total_profit_usd,

  COUNT(DISTINCT pl_targets.id) FILTER (WHERE pl_targets.event_type = 'target_hit') as targets_hit,

  GREATEST(
    MAX(t.created_at),
    MAX(a.created_at)
  ) as last_activity_at

FROM profiles p
LEFT JOIN roles r ON r.id = p.role_id
LEFT JOIN index_trades t ON t.author_id = p.id
LEFT JOIN points_ledger pl ON pl.analyzer_id = p.id
LEFT JOIN points_ledger pl_targets ON pl_targets.analyzer_id = p.id AND pl_targets.event_type = 'target_hit'
LEFT JOIN analyses a ON a.analyzer_id = p.id
WHERE r.name IN ('analyzer', 'admin')
GROUP BY p.id, p.full_name, p.email, p.avatar_url;

GRANT SELECT ON public.analyzer_stats_v2 TO authenticated;
GRANT SELECT ON public.analyzer_stats_v2 TO anon;
