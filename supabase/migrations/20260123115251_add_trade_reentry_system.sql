/*
  # Trade Re-Entry System

  1. New Table
    - `index_trade_events` - Audit trail for all trade lifecycle events
      - `id` (uuid, primary key)
      - `trade_id` (uuid, foreign key)
      - `author_id` (uuid, foreign key)
      - `event_type` (text) - CREATED, AVERAGE_ADJUSTMENT, REENTER_NEW_ENTRY, etc.
      - `event_data` (jsonb) - Flexible metadata about the event
      - `created_at` (timestamptz)
      
  2. New Fields to index_trades
    - `idempotency_key` (text) - Prevents duplicate trade creation
    - `averaged_times` (integer) - Count of how many times entry was averaged
    - `original_entry_price` (numeric) - First entry price before any averaging
    
  3. Indexes
    - Unique index on idempotency_key
    - Index on trade_id for events
    - Composite index for detecting duplicate active trades
    
  4. Security
    - RLS enabled on index_trade_events
    - Service role and authors can access their events
*/

-- Create index_trade_events table
CREATE TABLE IF NOT EXISTS index_trade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES index_trades(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_index_trade_events_trade_id 
  ON index_trade_events(trade_id);

CREATE INDEX IF NOT EXISTS idx_index_trade_events_author_id 
  ON index_trade_events(author_id);

CREATE INDEX IF NOT EXISTS idx_index_trade_events_created_at 
  ON index_trade_events(created_at DESC);

-- Add new fields to index_trades
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN idempotency_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'averaged_times'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN averaged_times integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'original_entry_price'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN original_entry_price numeric;
  END IF;
END $$;

-- Create unique index on idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_trades_idempotency_key 
  ON index_trades(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Create composite index for detecting active trades on same contract
CREATE INDEX IF NOT EXISTS idx_index_trades_active_contract_lookup 
  ON index_trades(
    author_id, 
    polygon_option_ticker, 
    status
  ) WHERE status = 'active';

-- Enable RLS
ALTER TABLE index_trade_events ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access to index_trade_events"
  ON index_trade_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authors can view their own trade events
CREATE POLICY "Authors can view own trade events"
  ON index_trade_events
  FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

-- Function to detect active trade for same contract
CREATE OR REPLACE FUNCTION check_active_trade_for_contract(
  p_author_id uuid,
  p_polygon_option_ticker text,
  p_strike numeric,
  p_expiry date,
  p_option_type text,
  p_underlying_symbol text
)
RETURNS TABLE(
  trade_id uuid,
  trade_status text,
  entry_price numeric,
  qty integer,
  entry_cost_usd numeric,
  max_profit numeric,
  max_contract_price numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as trade_id,
    t.status as trade_status,
    (t.entry_contract_snapshot->>'mid')::numeric as entry_price,
    t.qty,
    t.entry_cost_usd,
    t.max_profit,
    t.max_contract_price
  FROM index_trades t
  WHERE t.author_id = p_author_id
    AND t.status = 'active'
    AND (
      (p_polygon_option_ticker IS NOT NULL AND t.polygon_option_ticker = p_polygon_option_ticker)
      OR
      (p_polygon_option_ticker IS NULL AND 
       t.strike = p_strike AND 
       t.expiry = p_expiry AND 
       t.option_type = p_option_type AND
       t.underlying_index_symbol = p_underlying_symbol)
    )
  ORDER BY t.created_at DESC
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_active_trade_for_contract TO authenticated, service_role;

-- Function to handle NEW_ENTRY decision (close previous, create new)
CREATE OR REPLACE FUNCTION process_trade_new_entry(
  p_existing_trade_id uuid,
  p_new_trade_data jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_trade record;
  v_new_trade_id uuid;
  v_final_pnl numeric;
  v_outcome text;
  v_result jsonb;
BEGIN
  -- Lock and get existing trade
  SELECT * INTO v_existing_trade
  FROM index_trades
  WHERE id = p_existing_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Existing trade not found');
  END IF;

  -- Check if already processed (idempotency)
  IF EXISTS (SELECT 1 FROM index_trades WHERE idempotency_key = p_idempotency_key) THEN
    SELECT id INTO v_new_trade_id FROM index_trades WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already processed',
      'new_trade_id', v_new_trade_id
    );
  END IF;

  -- Finalize existing trade using high watermark rules
  IF COALESCE(v_existing_trade.max_profit, 0) >= 100 THEN
    -- WIN: use max_profit as final pnl
    v_final_pnl := v_existing_trade.max_profit;
    v_outcome := 'win';
  ELSE
    -- LOSS: use -total_cost
    v_final_pnl := -COALESCE(v_existing_trade.entry_cost_usd, 0);
    v_outcome := 'loss';
  END IF;

  -- Close existing trade
  UPDATE index_trades
  SET 
    status = 'closed',
    closure_reason = 'REENTER_NEW_ENTRY',
    closed_at = now(),
    pnl_usd = v_final_pnl,
    final_profit = v_final_pnl,
    outcome = v_outcome,
    is_win = (v_outcome = 'win'),
    trade_outcome = CASE WHEN v_outcome = 'win' THEN 'win'::trade_outcome_type ELSE 'loss'::trade_outcome_type END,
    updated_at = now()
  WHERE id = p_existing_trade_id;

  -- Create event for closure
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    p_existing_trade_id,
    v_existing_trade.author_id,
    'REENTER_NEW_ENTRY_CLOSE',
    jsonb_build_object(
      'reason', 'REENTER_NEW_ENTRY',
      'final_pnl', v_final_pnl,
      'outcome', v_outcome,
      'max_profit', v_existing_trade.max_profit,
      'max_contract_price', v_existing_trade.max_contract_price,
      'entry_cost', v_existing_trade.entry_cost_usd
    )
  );

  -- Create new trade
  INSERT INTO index_trades (
    author_id,
    analysis_id,
    status,
    instrument_type,
    direction,
    underlying_index_symbol,
    polygon_underlying_index_ticker,
    polygon_option_ticker,
    strike,
    expiry,
    option_type,
    contract_multiplier,
    entry_underlying_snapshot,
    entry_contract_snapshot,
    current_contract,
    qty,
    entry_cost_usd,
    max_profit,
    max_contract_price,
    original_entry_price,
    trade_price_basis,
    telegram_channel_id,
    telegram_send_enabled,
    idempotency_key,
    created_at,
    published_at
  ) VALUES (
    (p_new_trade_data->>'author_id')::uuid,
    (p_new_trade_data->>'analysis_id')::uuid,
    COALESCE(p_new_trade_data->>'status', 'active'),
    p_new_trade_data->>'instrument_type',
    p_new_trade_data->>'direction',
    p_new_trade_data->>'underlying_index_symbol',
    p_new_trade_data->>'polygon_underlying_index_ticker',
    p_new_trade_data->>'polygon_option_ticker',
    (p_new_trade_data->>'strike')::numeric,
    (p_new_trade_data->>'expiry')::date,
    p_new_trade_data->>'option_type',
    COALESCE((p_new_trade_data->>'contract_multiplier')::integer, 100),
    p_new_trade_data->'entry_underlying_snapshot',
    p_new_trade_data->'entry_contract_snapshot',
    (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
    COALESCE((p_new_trade_data->>'qty')::integer, 1),
    (p_new_trade_data->>'entry_cost_usd')::numeric,
    0,
    (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
    (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
    COALESCE(p_new_trade_data->>'trade_price_basis', 'OPTION_PREMIUM'),
    (p_new_trade_data->>'telegram_channel_id')::uuid,
    COALESCE((p_new_trade_data->>'telegram_send_enabled')::boolean, true),
    p_idempotency_key,
    now(),
    now()
  ) RETURNING id INTO v_new_trade_id;

  -- Create event for new trade
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    v_new_trade_id,
    (p_new_trade_data->>'author_id')::uuid,
    'REENTER_NEW_ENTRY_CREATE',
    jsonb_build_object(
      'previous_trade_id', p_existing_trade_id,
      'previous_outcome', v_outcome,
      'previous_pnl', v_final_pnl,
      'new_entry_price', (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
      'new_qty', COALESCE((p_new_trade_data->>'qty')::integer, 1)
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'action', 'NEW_ENTRY',
    'closed_trade_id', p_existing_trade_id,
    'closed_trade_pnl', v_final_pnl,
    'closed_trade_outcome', v_outcome,
    'new_trade_id', v_new_trade_id
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_trade_new_entry TO authenticated, service_role;

-- Function to handle AVERAGE_ADJUSTMENT decision
CREATE OR REPLACE FUNCTION process_trade_average_adjustment(
  p_existing_trade_id uuid,
  p_new_entry_price numeric,
  p_new_qty integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_trade record;
  v_old_entry numeric;
  v_old_qty integer;
  v_combined_qty integer;
  v_avg_entry numeric;
  v_new_total_cost numeric;
  v_new_max_profit numeric;
  v_multiplier integer;
  v_already_processed boolean;
  v_result jsonb;
BEGIN
  -- Lock and get existing trade
  SELECT * INTO v_existing_trade
  FROM index_trades
  WHERE id = p_existing_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Existing trade not found');
  END IF;

  -- Check if already processed (idempotency) - check events
  SELECT EXISTS(
    SELECT 1 FROM index_trade_events
    WHERE trade_id = p_existing_trade_id
    AND event_type = 'AVERAGE_ADJUSTMENT'
    AND event_data->>'idempotency_key' = p_idempotency_key
  ) INTO v_already_processed;

  IF v_already_processed THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already processed',
      'trade_id', p_existing_trade_id
    );
  END IF;

  -- Get current values
  v_old_entry := (v_existing_trade.entry_contract_snapshot->>'mid')::numeric;
  v_old_qty := COALESCE(v_existing_trade.qty, 1);
  v_multiplier := COALESCE(v_existing_trade.contract_multiplier, 100);

  -- Calculate weighted average
  v_combined_qty := v_old_qty + p_new_qty;
  v_avg_entry := (v_old_entry * v_old_qty + p_new_entry_price * p_new_qty) / v_combined_qty;
  v_new_total_cost := v_avg_entry * v_combined_qty * v_multiplier;

  -- Recalculate max_profit (keep existing high watermark, don't reduce)
  v_new_max_profit := GREATEST(0, 
    (COALESCE(v_existing_trade.max_contract_price, v_avg_entry) - v_avg_entry) * v_combined_qty * v_multiplier
  );

  -- Update existing trade
  UPDATE index_trades
  SET 
    qty = v_combined_qty,
    entry_contract_snapshot = jsonb_set(
      entry_contract_snapshot,
      '{mid}',
      to_jsonb(v_avg_entry)
    ),
    entry_cost_usd = v_new_total_cost,
    max_profit = v_new_max_profit,
    averaged_times = COALESCE(averaged_times, 0) + 1,
    original_entry_price = COALESCE(original_entry_price, v_old_entry),
    is_win = (v_new_max_profit >= 100) OR COALESCE(is_win, false),
    entries_data = COALESCE(entries_data, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'entry_price', p_new_entry_price,
        'qty', p_new_qty,
        'timestamp', now()
      )
    ),
    updated_at = now()
  WHERE id = p_existing_trade_id;

  -- Create event
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    p_existing_trade_id,
    v_existing_trade.author_id,
    'AVERAGE_ADJUSTMENT',
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'old_entry', v_old_entry,
      'new_entry', p_new_entry_price,
      'avg_entry', v_avg_entry,
      'old_qty', v_old_qty,
      'added_qty', p_new_qty,
      'combined_qty', v_combined_qty,
      'old_total_cost', v_existing_trade.entry_cost_usd,
      'new_total_cost', v_new_total_cost,
      'old_max_profit', v_existing_trade.max_profit,
      'new_max_profit', v_new_max_profit
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'action', 'AVERAGE_ADJUSTMENT',
    'trade_id', p_existing_trade_id,
    'old_entry', v_old_entry,
    'new_entry', p_new_entry_price,
    'avg_entry', v_avg_entry,
    'old_qty', v_old_qty,
    'new_qty', v_combined_qty,
    'new_total_cost', v_new_total_cost,
    'new_max_profit', v_new_max_profit
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_trade_average_adjustment TO authenticated, service_role;
