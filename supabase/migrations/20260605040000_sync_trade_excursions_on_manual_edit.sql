-- ============================================================================
-- sync_trade_excursions: single source of truth for MFE / MAE / max_profit
--
-- Problem: the manual price / edit-high paths raise contract_high_since (and
-- contract_low_since) but never recompute the mfe / mae columns — those are
-- only written by the live RPC process_streaming_price_update. After a manual
-- high edit the contract card therefore showed a stale MFE (e.g. High 16.50 but
-- MFE $520, which corresponds to the old 8.80 peak). The manual-price route also
-- computed max_profit WITHOUT the contract multiplier.
--
-- Fix: a small, idempotent function that recomputes mfe, mae and max_profit from
-- the canonical fields (entry, peak high, trough low, qty, multiplier) using the
-- same dollar formula as process_streaming_price_update (mfe == max_profit). The
-- manual routes call it after every edit so the excursion columns always agree
-- with the stored high/low — regardless of which path set them.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_trade_excursions(p_trade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade  index_trades%ROWTYPE;
  v_entry  numeric;
  v_high   numeric;
  v_low    numeric;
  v_qty    integer;
  v_mult   integer;
BEGIN
  SELECT * INTO v_trade FROM index_trades WHERE id = p_trade_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Entry premium: snapshot mid > price > last > entry_price column.
  v_entry := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::numeric,
    (v_trade.entry_contract_snapshot->>'price')::numeric,
    (v_trade.entry_contract_snapshot->>'last')::numeric,
    v_trade.entry_price,
    0
  );

  IF v_entry IS NULL OR v_entry <= 0 THEN
    RETURN;
  END IF;

  v_qty  := COALESCE(v_trade.qty, 1);
  v_mult := COALESCE(v_trade.contract_multiplier, 100);

  -- Canonical peak / trough since entry. Take the greater of the two high
  -- columns so a stale value in one never lowers the result.
  v_high := COALESCE(GREATEST(v_trade.max_contract_price, v_trade.contract_high_since), v_entry);
  v_low  := COALESCE(v_trade.contract_low_since, v_entry);

  UPDATE index_trades SET
    mfe        = GREATEST(0, (v_high - v_entry) * v_qty * v_mult),
    mae        = GREATEST(0, (v_entry - v_low)  * v_qty * v_mult),
    -- max_profit is the dollar MFE (same identity used by the live RPC).
    max_profit = GREATEST(0, (v_high - v_entry) * v_qty * v_mult),
    updated_at = now()
  WHERE id = p_trade_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_trade_excursions(uuid) TO authenticated, service_role;

-- ── One-time backfill ───────────────────────────────────────────────────────
-- Correct the excursion columns for live trades and any trade whose high was
-- ever set manually. Scoped to active + manually-edited rows so historical
-- (closed/expired) records published in past reports are left untouched.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM index_trades
    WHERE status = 'active'
       OR manually_edited_high = true
       OR high_source = 'manual'
  LOOP
    PERFORM public.sync_trade_excursions(r.id);
  END LOOP;
END $$;
