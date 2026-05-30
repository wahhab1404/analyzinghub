-- Atomic premium update for SPX auto-trades, called from Fly.io realtime worker.
-- Updates highest/lowest, MFE/MAE, and unrealized_pnl_pct in a single statement.

CREATE OR REPLACE FUNCTION spx_update_trade_premium(
  p_trade_id        uuid,
  p_current_premium numeric,
  p_event_ts        timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry      numeric;
  v_high       numeric;
  v_low        numeric;
  v_new_high   boolean := false;
  v_unrealized numeric;
  v_mfe        numeric;
  v_mae        numeric;
BEGIN
  SELECT entry_premium, highest_premium, lowest_premium
    INTO v_entry, v_high, v_low
  FROM spx_trades WHERE id = p_trade_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF v_high IS NULL OR p_current_premium > v_high THEN
    v_high := p_current_premium; v_new_high := true;
  END IF;
  IF v_low IS NULL OR p_current_premium < v_low THEN
    v_low := p_current_premium;
  END IF;

  IF v_entry IS NOT NULL AND v_entry > 0 THEN
    v_unrealized := ((p_current_premium - v_entry) / v_entry) * 100;
    v_mfe := GREATEST(0, ((v_high - v_entry) / v_entry) * 100);
    v_mae := GREATEST(0, ((v_entry - v_low)  / v_entry) * 100);
  END IF;

  UPDATE spx_trades SET
    current_premium     = p_current_premium,
    premium_updated_at  = p_event_ts,
    highest_premium     = v_high,
    lowest_premium      = v_low,
    highest_premium_at  = CASE WHEN v_new_high THEN p_event_ts ELSE highest_premium_at END,
    lowest_premium_at   = CASE WHEN p_current_premium <= v_low THEN p_event_ts ELSE lowest_premium_at END,
    unrealized_pnl_pct  = COALESCE(v_unrealized, unrealized_pnl_pct),
    mfe                 = COALESCE(v_mfe, mfe),
    mae                 = COALESCE(v_mae, mae),
    updated_at          = p_event_ts
  WHERE id = p_trade_id;

  RETURN jsonb_build_object('ok', true, 'is_new_high', v_new_high,
                            'unrealized_pnl_pct', v_unrealized, 'mfe', v_mfe, 'mae', v_mae);
END;
$$;

GRANT EXECUTE ON FUNCTION spx_update_trade_premium(uuid, numeric, timestamptz) TO service_role;
