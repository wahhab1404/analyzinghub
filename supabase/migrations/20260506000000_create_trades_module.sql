/*
  # Trades Module — Full Schema

  Creates the core Trades feature supporting:
  - Stock trades (Long/Short)
  - Option contract trades (Call/Put)
  - Optional linking to existing company analyses
  - Subscription plan routing
  - Telegram channel routing
  - Live price tracking with high/low watermarks
  - Target and stop-loss hit detection
  - Trade alert history (deduplicates Telegram messages)

  ## Tables
  - `trades`               — core trade record (stock or option)
  - `option_trade_details` — option-specific fields (1-to-1 with trades where trade_type='option')
  - `trade_alerts`         — Telegram alert history per trade
*/

-- ────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE trade_type_enum AS ENUM ('stock', 'option');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_direction_enum AS ENUM ('long', 'short', 'call', 'put');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_status_enum AS ENUM (
    'draft', 'published', 'active', 'stopped', 'completed', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE option_type_enum AS ENUM ('call', 'put');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_alert_type_enum AS ENUM (
    'published', 'target_hit', 'new_high', 'stop_hit', 'completed', 'expired', 'update'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_alert_status_enum AS ENUM ('sent', 'failed', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stop_status_enum AS ENUM ('active', 'hit', 'adjusted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE expiration_status_enum AS ENUM ('active', 'expired', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_visibility_enum AS ENUM ('public', 'followers', 'subscribers', 'plan_only', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TRADES TABLE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trades (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id                    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Optional link to company analysis
  analysis_id                uuid REFERENCES analyses(id) ON DELETE SET NULL,

  -- Core identifiers
  symbol                     text NOT NULL,
  trade_type                 trade_type_enum NOT NULL DEFAULT 'stock',
  direction                  trade_direction_enum NOT NULL,

  -- Status lifecycle
  status                     trade_status_enum NOT NULL DEFAULT 'draft',

  -- Stock price tracking
  entry_price                numeric(18,6),
  current_price              numeric(18,6),
  highest_price_since_entry  numeric(18,6),
  lowest_price_since_entry   numeric(18,6),

  -- Stop loss
  stop_loss                  numeric(18,6),
  stop_status                stop_status_enum NOT NULL DEFAULT 'active',

  -- Targets stored as JSONB array:
  -- [{ "label": "TP1", "price": 150.00, "hit": false, "hit_at": null }]
  targets                    jsonb NOT NULL DEFAULT '[]',
  hit_targets                jsonb NOT NULL DEFAULT '[]',

  -- Trade metadata
  timeframe                  text,
  expected_duration          text,
  risk_level                 text CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
  notes                      text,

  -- Visibility / subscription routing
  visibility                 trade_visibility_enum NOT NULL DEFAULT 'public',
  plan_id                    uuid REFERENCES analyzer_plans(id) ON DELETE SET NULL,

  -- Telegram routing
  telegram_channel_id        uuid,

  -- Flags
  is_public                  boolean NOT NULL DEFAULT true,
  is_testing                 boolean NOT NULL DEFAULT false,

  -- Timestamps
  published_at               timestamptz,
  activated_at               timestamptz,
  completed_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_user_id          ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_analysis_id      ON trades(analysis_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol           ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status           ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_trade_type       ON trades(trade_type);
CREATE INDEX IF NOT EXISTS idx_trades_is_testing       ON trades(is_testing);
CREATE INDEX IF NOT EXISTS idx_trades_plan_id          ON trades(plan_id);
CREATE INDEX IF NOT EXISTS idx_trades_published_at     ON trades(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_trades_created_at       ON trades(created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- OPTION TRADE DETAILS TABLE
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS option_trade_details (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id                      uuid NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,

  underlying_symbol             text NOT NULL,
  option_type                   option_type_enum NOT NULL,
  strike_price                  numeric(18,6) NOT NULL,
  expiration_date               date NOT NULL,
  contract_symbol               text,

  -- Premium tracking
  entry_premium                 numeric(18,6) NOT NULL,
  current_premium               numeric(18,6),
  highest_premium_since_entry   numeric(18,6),
  lowest_premium_since_entry    numeric(18,6),
  stop_premium                  numeric(18,6),
  stop_rule                     text,

  -- Contract details
  quantity                      integer DEFAULT 1,
  contract_multiplier           integer DEFAULT 100,

  -- Derived cost (entry_premium * quantity * contract_multiplier)
  entry_cost_total              numeric(18,6) GENERATED ALWAYS AS (entry_premium * COALESCE(quantity, 1) * COALESCE(contract_multiplier, 100)) STORED,

  -- Win threshold tracking ($100 profit rule)
  win_threshold_met_at          timestamptz,
  max_profit_value              numeric(18,6),

  -- Expiration state
  expiration_status             expiration_status_enum NOT NULL DEFAULT 'active',

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opt_details_trade_id          ON option_trade_details(trade_id);
CREATE INDEX IF NOT EXISTS idx_opt_details_underlying        ON option_trade_details(underlying_symbol);
CREATE INDEX IF NOT EXISTS idx_opt_details_expiration_date   ON option_trade_details(expiration_date);

-- ────────────────────────────────────────────────────────────────────────────
-- TRADE ALERTS TABLE (deduplication log for Telegram messages)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id             uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,

  alert_type           trade_alert_type_enum NOT NULL,

  -- For target_hit alerts: index into targets array (0-based)
  target_index         integer,

  -- Price at the time of alert
  price                numeric(18,6),

  -- Delivery tracking
  sent_to_channel_id   text,
  telegram_message_id  text,
  status               trade_alert_status_enum NOT NULL DEFAULT 'pending',

  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_alerts_trade_id    ON trade_alerts(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_alerts_alert_type  ON trade_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_trade_alerts_created_at  ON trade_alerts(created_at DESC);

-- Unique constraint: prevent duplicate target_hit alerts per target per trade
CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_alerts_target
  ON trade_alerts(trade_id, alert_type, target_index)
  WHERE alert_type = 'target_hit' AND target_index IS NOT NULL;

-- Unique constraint: prevent duplicate stop_hit / completed / expired per trade
CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_alerts_lifecycle
  ON trade_alerts(trade_id, alert_type)
  WHERE alert_type IN ('stop_hit', 'completed', 'expired', 'published');

-- ────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_trades_updated_at ON trades;
CREATE TRIGGER set_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_option_details_updated_at ON option_trade_details;
CREATE TRIGGER set_option_details_updated_at
  BEFORE UPDATE ON option_trade_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_trade_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_alerts ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role name
CREATE OR REPLACE FUNCTION get_user_role_name(p_user_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER
STABLE
AS $$
  SELECT r.name
  FROM profiles p
  JOIN roles r ON r.id = p.role_id
  WHERE p.id = p_user_id;
$$;

-- Helper: check if user is subscribed to a plan
CREATE OR REPLACE FUNCTION is_subscribed_to_plan(p_user_id uuid, p_plan_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = p_user_id
      AND plan_id = p_plan_id
      AND status IN ('active', 'trialing')
  );
$$;

-- ── trades policies ──────────────────────────────────────────────────────────

-- SuperAdmin / Analyzer can see all their own trades (including drafts/testing)
CREATE POLICY "owners_see_all_trades"
  ON trades FOR SELECT
  USING (
    auth.uid() = user_id
    OR get_user_role_name(auth.uid()) = 'SuperAdmin'
  );

-- Public trades (non-testing, published/active/completed/stopped) are visible to all authed users
CREATE POLICY "public_trades_visible"
  ON trades FOR SELECT
  USING (
    is_public = true
    AND is_testing = false
    AND status IN ('published', 'active', 'completed', 'stopped', 'expired')
  );

-- Plan-gated trades: visible only to subscribers
CREATE POLICY "plan_trades_for_subscribers"
  ON trades FOR SELECT
  USING (
    is_testing = false
    AND status IN ('published', 'active', 'completed', 'stopped', 'expired')
    AND plan_id IS NOT NULL
    AND is_subscribed_to_plan(auth.uid(), plan_id)
  );

-- Analyzers can insert their own trades
CREATE POLICY "analyzers_insert_trades"
  ON trades FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND get_user_role_name(auth.uid()) IN ('SuperAdmin', 'Analyzer')
  );

-- Owners and SuperAdmins can update
CREATE POLICY "owners_update_trades"
  ON trades FOR UPDATE
  USING (
    auth.uid() = user_id
    OR get_user_role_name(auth.uid()) = 'SuperAdmin'
  );

-- Owners and SuperAdmins can delete
CREATE POLICY "owners_delete_trades"
  ON trades FOR DELETE
  USING (
    auth.uid() = user_id
    OR get_user_role_name(auth.uid()) = 'SuperAdmin'
  );

-- Service role bypass (for edge functions / background jobs)
CREATE POLICY "service_role_all_trades"
  ON trades FOR ALL
  USING (auth.role() = 'service_role');

-- ── option_trade_details policies ────────────────────────────────────────────

CREATE POLICY "option_details_owner_select"
  ON option_trade_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = option_trade_details.trade_id
        AND (t.user_id = auth.uid() OR get_user_role_name(auth.uid()) = 'SuperAdmin')
    )
  );

CREATE POLICY "option_details_public_select"
  ON option_trade_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = option_trade_details.trade_id
        AND t.is_public = true
        AND t.is_testing = false
        AND t.status IN ('published', 'active', 'completed', 'stopped', 'expired')
    )
  );

CREATE POLICY "option_details_plan_select"
  ON option_trade_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = option_trade_details.trade_id
        AND t.is_testing = false
        AND t.plan_id IS NOT NULL
        AND is_subscribed_to_plan(auth.uid(), t.plan_id)
        AND t.status IN ('published', 'active', 'completed', 'stopped', 'expired')
    )
  );

CREATE POLICY "option_details_owner_write"
  ON option_trade_details FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = option_trade_details.trade_id
        AND (t.user_id = auth.uid() OR get_user_role_name(auth.uid()) = 'SuperAdmin')
    )
  );

CREATE POLICY "service_role_all_option_details"
  ON option_trade_details FOR ALL
  USING (auth.role() = 'service_role');

-- ── trade_alerts policies ─────────────────────────────────────────────────────

CREATE POLICY "alerts_owner_select"
  ON trade_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_alerts.trade_id
        AND (t.user_id = auth.uid() OR get_user_role_name(auth.uid()) = 'SuperAdmin')
    )
  );

CREATE POLICY "alerts_owner_insert"
  ON trade_alerts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = trade_alerts.trade_id
        AND (t.user_id = auth.uid() OR get_user_role_name(auth.uid()) = 'SuperAdmin')
    )
  );

CREATE POLICY "service_role_all_alerts"
  ON trade_alerts FOR ALL
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────────
-- HELPER RPCs
-- ────────────────────────────────────────────────────────────────────────────

-- Update trade price watermarks and check for target/stop hits
-- Called by edge function price tracker
CREATE OR REPLACE FUNCTION update_trade_price(
  p_trade_id       uuid,
  p_current_price  numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_trade           trades%ROWTYPE;
  v_targets         jsonb;
  v_target          jsonb;
  v_hit_targets     jsonb;
  v_i               int;
  v_target_price    numeric;
  v_target_hit      boolean;
  v_stop_hit        boolean := false;
  v_any_target_hit  boolean := false;
  v_result          jsonb;
  v_new_highest     numeric;
  v_new_lowest      numeric;
BEGIN
  SELECT * INTO v_trade FROM trades WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'trade_not_found');
  END IF;

  IF v_trade.status NOT IN ('published', 'active') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'trade_not_active');
  END IF;

  -- Update watermarks
  v_new_highest := GREATEST(COALESCE(v_trade.highest_price_since_entry, p_current_price), p_current_price);
  v_new_lowest  := LEAST(COALESCE(v_trade.lowest_price_since_entry, p_current_price), p_current_price);

  -- Check stop loss hit
  IF v_trade.stop_loss IS NOT NULL THEN
    IF v_trade.direction IN ('long') AND p_current_price <= v_trade.stop_loss THEN
      v_stop_hit := true;
    ELSIF v_trade.direction IN ('short') AND p_current_price >= v_trade.stop_loss THEN
      v_stop_hit := true;
    END IF;
  END IF;

  -- Check targets
  v_targets     := v_trade.targets;
  v_hit_targets := v_trade.hit_targets;
  v_i := 0;

  FOR v_i IN 0 .. jsonb_array_length(v_targets) - 1 LOOP
    v_target      := v_targets -> v_i;
    v_target_price := (v_target ->> 'price')::numeric;
    v_target_hit   := COALESCE((v_target ->> 'hit')::boolean, false);

    IF NOT v_target_hit THEN
      IF v_trade.direction = 'long' AND p_current_price >= v_target_price THEN
        v_targets     := jsonb_set(v_targets, ARRAY[v_i::text], v_target || jsonb_build_object('hit', true, 'hit_at', now()::text));
        v_hit_targets := v_hit_targets || jsonb_build_array(jsonb_build_object('index', v_i, 'price', p_current_price, 'hit_at', now()::text));
        v_any_target_hit := true;
      ELSIF v_trade.direction = 'short' AND p_current_price <= v_target_price THEN
        v_targets     := jsonb_set(v_targets, ARRAY[v_i::text], v_target || jsonb_build_object('hit', true, 'hit_at', now()::text));
        v_hit_targets := v_hit_targets || jsonb_build_array(jsonb_build_object('index', v_i, 'price', p_current_price, 'hit_at', now()::text));
        v_any_target_hit := true;
      END IF;
    END IF;
  END LOOP;

  -- Persist updates
  UPDATE trades SET
    current_price              = p_current_price,
    highest_price_since_entry  = v_new_highest,
    lowest_price_since_entry   = v_new_lowest,
    targets                    = v_targets,
    hit_targets                = v_hit_targets,
    status                     = CASE
                                    WHEN v_stop_hit THEN 'stopped'::trade_status_enum
                                    ELSE status
                                  END,
    stop_status                = CASE
                                    WHEN v_stop_hit THEN 'hit'::stop_status_enum
                                    ELSE stop_status
                                  END,
    updated_at                 = now()
  WHERE id = p_trade_id;

  RETURN jsonb_build_object(
    'updated',          true,
    'stop_hit',         v_stop_hit,
    'any_target_hit',   v_any_target_hit,
    'new_highest',      v_new_highest,
    'new_lowest',       v_new_lowest,
    'current_price',    p_current_price
  );
END;
$$;

-- Option-specific price update: tracks premium watermarks + $100 win rule
CREATE OR REPLACE FUNCTION update_option_trade_price(
  p_trade_id        uuid,
  p_current_premium numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_details         option_trade_details%ROWTYPE;
  v_trade           trades%ROWTYPE;
  v_new_highest     numeric;
  v_new_lowest      numeric;
  v_max_profit      numeric;
  v_win_threshold   boolean := false;
  v_stop_hit        boolean := false;
BEGIN
  SELECT * INTO v_trade   FROM trades               WHERE id = p_trade_id FOR UPDATE;
  SELECT * INTO v_details FROM option_trade_details WHERE trade_id = p_trade_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'details_not_found');
  END IF;

  v_new_highest := GREATEST(COALESCE(v_details.highest_premium_since_entry, p_current_premium), p_current_premium);
  v_new_lowest  := LEAST(COALESCE(v_details.lowest_premium_since_entry, p_current_premium), p_current_premium);
  v_max_profit  := (v_new_highest - v_details.entry_premium) * COALESCE(v_details.quantity, 1) * COALESCE(v_details.contract_multiplier, 100);

  -- Check $100 win threshold
  IF v_max_profit >= 100 AND v_details.win_threshold_met_at IS NULL THEN
    v_win_threshold := true;
  END IF;

  -- Check stop
  IF v_details.stop_premium IS NOT NULL AND p_current_premium <= v_details.stop_premium THEN
    v_stop_hit := true;
  END IF;

  UPDATE option_trade_details SET
    current_premium             = p_current_premium,
    highest_premium_since_entry = v_new_highest,
    lowest_premium_since_entry  = v_new_lowest,
    max_profit_value            = v_max_profit,
    win_threshold_met_at        = CASE WHEN v_win_threshold THEN now() ELSE win_threshold_met_at END,
    updated_at                  = now()
  WHERE trade_id = p_trade_id;

  UPDATE trades SET
    current_price             = p_current_premium,
    highest_price_since_entry = v_new_highest,
    lowest_price_since_entry  = v_new_lowest,
    status                    = CASE WHEN v_stop_hit THEN 'stopped'::trade_status_enum ELSE status END,
    updated_at                = now()
  WHERE id = p_trade_id;

  RETURN jsonb_build_object(
    'updated',           true,
    'new_highest',       v_new_highest,
    'new_lowest',        v_new_lowest,
    'max_profit',        v_max_profit,
    'win_threshold_met', v_win_threshold,
    'stop_hit',          v_stop_hit
  );
END;
$$;
