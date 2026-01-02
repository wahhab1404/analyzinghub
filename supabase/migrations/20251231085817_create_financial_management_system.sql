/*
  # Financial Management and Subscriber Management System

  1. New Tables
    - `financial_transactions`
      - Immutable ledger of all financial events
      - Tracks subscription payments, renewals, refunds, adjustments
      - Stores gross amount, platform fee, and net amount
      - Links to subscriptions, analysts, subscribers, and plans

    - `platform_fee_rules`
      - Defines platform deduction percentages
      - Can be per analyst, per plan, or global
      - Supports both percentage and fixed fees
      - Priority-based rule application

    - `analyst_earnings_summary`
      - Pre-calculated earnings summary for analysts
      - Tracks all-time, monthly, and yearly earnings
      - Subscriber counts and payout status

    - `payouts`
      - Tracks analyst payouts
      - Status tracking (pending, processing, completed, failed)
      - Links to transaction periods

    - `subscriber_revenue_history`
      - Tracks revenue from each subscriber over time
      - Lifetime value calculations
      - Subscription metrics per subscriber

    - `financial_audit_log`
      - Complete audit trail of all financial changes
      - Tracks who, what, when, why, from where

    - `plan_performance_metrics`
      - Analytics for each subscription plan
      - Revenue, conversion, churn metrics

  2. Security
    - Enable RLS on all tables
    - Analysts can view their own financial data
    - Admins can view all financial data
    - Service role for system operations
    - Complete audit logging

  3. Functions
    - `calculate_platform_fee()` - Calculates fee based on rules
*/

-- =====================================================
-- FINANCIAL TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'subscription_payment',
    'subscription_renewal',
    'subscription_upgrade',
    'subscription_downgrade',
    'refund',
    'chargeback',
    'adjustment'
  )),

  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  analyst_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES analyzer_plans(id) ON DELETE SET NULL,

  gross_amount_cents INTEGER NOT NULL CHECK (gross_amount_cents >= -1000000000),
  currency TEXT NOT NULL DEFAULT 'USD',

  platform_fee_cents INTEGER NOT NULL CHECK (platform_fee_cents >= -1000000000),
  platform_fee_type TEXT CHECK (platform_fee_type IN ('percentage', 'fixed')),
  platform_fee_rate NUMERIC(5,2),

  net_amount_cents INTEGER NOT NULL CHECK (net_amount_cents >= -1000000000),

  provider TEXT NOT NULL DEFAULT 'manual',
  provider_transaction_id TEXT,
  provider_fee_cents INTEGER DEFAULT 0,
  provider_metadata JSONB DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'completed',
    'failed',
    'reversed',
    'disputed'
  )),

  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_analyst ON financial_transactions(analyst_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_subscriber ON financial_transactions(subscriber_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_subscription ON financial_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_status ON financial_transactions(status, transaction_date);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date DESC);

-- =====================================================
-- PLATFORM FEE RULES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS platform_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  analyst_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES analyzer_plans(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('analyst', 'plan', 'global')),

  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value NUMERIC(10,2) NOT NULL CHECK (fee_value >= 0),

  priority INTEGER NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,

  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rule_scope CHECK (
    (rule_type = 'analyst' AND analyst_id IS NOT NULL AND plan_id IS NULL) OR
    (rule_type = 'plan' AND plan_id IS NOT NULL AND analyst_id IS NULL) OR
    (rule_type = 'global' AND analyst_id IS NULL AND plan_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_rules_analyst ON platform_fee_rules(analyst_id) WHERE analyst_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_fee_rules_plan ON platform_fee_rules(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_fee_rules_active ON platform_fee_rules(is_active, effective_from);

-- =====================================================
-- ANALYST EARNINGS SUMMARY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS analyst_earnings_summary (
  analyst_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  total_gross_cents BIGINT NOT NULL DEFAULT 0,
  total_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  total_net_cents BIGINT NOT NULL DEFAULT 0,

  month_gross_cents BIGINT NOT NULL DEFAULT 0,
  month_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  month_net_cents BIGINT NOT NULL DEFAULT 0,

  year_gross_cents BIGINT NOT NULL DEFAULT 0,
  year_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  year_net_cents BIGINT NOT NULL DEFAULT 0,

  total_subscribers_all_time INTEGER NOT NULL DEFAULT 0,
  active_subscribers_count INTEGER NOT NULL DEFAULT 0,
  churned_subscribers_count INTEGER NOT NULL DEFAULT 0,

  total_paid_out_cents BIGINT NOT NULL DEFAULT 0,
  pending_payout_cents BIGINT NOT NULL DEFAULT 0,

  currency TEXT NOT NULL DEFAULT 'USD',
  last_transaction_at TIMESTAMPTZ,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyst_earnings_updated ON analyst_earnings_summary(updated_at);

-- =====================================================
-- PAYOUTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  analyst_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'canceled'
  )),

  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'paypal', 'stripe', 'manual')),
  payment_reference TEXT,

  transaction_ids UUID[] DEFAULT '{}',

  notes TEXT,
  failure_reason TEXT,

  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_analyst ON payouts(analyst_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_payouts_period ON payouts(period_start, period_end);

-- =====================================================
-- SUBSCRIBER REVENUE HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriber_revenue_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  analyst_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  total_gross_cents BIGINT NOT NULL DEFAULT 0,
  total_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  total_net_cents BIGINT NOT NULL DEFAULT 0,

  subscription_start_date TIMESTAMPTZ NOT NULL,
  subscription_end_date TIMESTAMPTZ,
  total_renewals INTEGER NOT NULL DEFAULT 0,
  total_refunds_cents BIGINT NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT true,

  lifetime_value_cents BIGINT NOT NULL DEFAULT 0,

  first_payment_at TIMESTAMPTZ,
  last_payment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriber_revenue_analyst ON subscriber_revenue_history(analyst_id, subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_revenue_subscription ON subscriber_revenue_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_revenue_active ON subscriber_revenue_history(analyst_id, is_active);

-- =====================================================
-- FINANCIAL AUDIT LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS financial_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  action_type TEXT NOT NULL CHECK (action_type IN (
    'fee_rule_created',
    'fee_rule_updated',
    'fee_rule_deleted',
    'transaction_created',
    'transaction_reversed',
    'payout_initiated',
    'payout_completed',
    'payout_failed',
    'manual_adjustment'
  )),

  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  old_values JSONB,
  new_values JSONB,

  performed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,

  reason TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_entity ON financial_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_performer ON financial_audit_log(performed_by, created_at);
CREATE INDEX IF NOT EXISTS idx_financial_audit_action ON financial_audit_log(action_type, created_at);

-- =====================================================
-- PLAN PERFORMANCE METRICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS plan_performance_metrics (
  plan_id UUID PRIMARY KEY REFERENCES analyzer_plans(id) ON DELETE CASCADE,

  total_subscriptions INTEGER NOT NULL DEFAULT 0,
  active_subscriptions INTEGER NOT NULL DEFAULT 0,
  canceled_subscriptions INTEGER NOT NULL DEFAULT 0,

  total_revenue_cents BIGINT NOT NULL DEFAULT 0,
  monthly_recurring_revenue_cents BIGINT NOT NULL DEFAULT 0,
  average_revenue_per_user_cents INTEGER NOT NULL DEFAULT 0,

  conversion_rate NUMERIC(5,2) DEFAULT 0,
  churn_rate NUMERIC(5,2) DEFAULT 0,

  average_lifetime_value_cents BIGINT NOT NULL DEFAULT 0,
  average_subscription_length_days INTEGER NOT NULL DEFAULT 0,

  total_platform_fee_cents BIGINT NOT NULL DEFAULT 0,

  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_performance_updated ON plan_performance_metrics(updated_at);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_platform_fee(
  p_analyst_id UUID,
  p_plan_id UUID,
  p_gross_amount_cents INTEGER
)
RETURNS TABLE (
  fee_cents INTEGER,
  fee_type TEXT,
  fee_rate NUMERIC
) AS $$
DECLARE
  v_rule RECORD;
BEGIN
  SELECT * INTO v_rule
  FROM platform_fee_rules
  WHERE is_active = true
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
    AND (
      (rule_type = 'plan' AND platform_fee_rules.plan_id = p_plan_id) OR
      (rule_type = 'analyst' AND platform_fee_rules.analyst_id = p_analyst_id) OR
      (rule_type = 'global')
    )
  ORDER BY
    CASE
      WHEN rule_type = 'plan' THEN 1
      WHEN rule_type = 'analyst' THEN 2
      WHEN rule_type = 'global' THEN 3
    END,
    priority DESC
  LIMIT 1;

  IF v_rule IS NULL THEN
    RETURN QUERY SELECT
      (p_gross_amount_cents * 20 / 100)::INTEGER,
      'percentage'::TEXT,
      20.00::NUMERIC;
  ELSIF v_rule.fee_type = 'percentage' THEN
    RETURN QUERY SELECT
      (p_gross_amount_cents * v_rule.fee_value / 100)::INTEGER,
      'percentage'::TEXT,
      v_rule.fee_value;
  ELSE
    RETURN QUERY SELECT
      v_rule.fee_value::INTEGER,
      'fixed'::TEXT,
      v_rule.fee_value;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_earnings_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriber_revenue_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analysts can view their own transactions"
  ON financial_transactions FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

CREATE POLICY "Admins can view all transactions"
  ON financial_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage transactions"
  ON financial_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can view all fee rules"
  ON platform_fee_rules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Admins can manage fee rules"
  ON platform_fee_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage fee rules"
  ON platform_fee_rules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Analysts can view their own earnings"
  ON analyst_earnings_summary FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

CREATE POLICY "Admins can view all earnings"
  ON analyst_earnings_summary FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage earnings"
  ON analyst_earnings_summary FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Analysts can view their own payouts"
  ON payouts FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

CREATE POLICY "Admins can view all payouts"
  ON payouts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Admins can manage payouts"
  ON payouts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage payouts"
  ON payouts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Analysts can view their subscriber revenue"
  ON subscriber_revenue_history FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

CREATE POLICY "Admins can view all subscriber revenue"
  ON subscriber_revenue_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage subscriber revenue"
  ON subscriber_revenue_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can view audit log"
  ON financial_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage audit log"
  ON financial_audit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Analysts can view their plan metrics"
  ON plan_performance_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyzer_plans
      WHERE id = plan_id
      AND analyst_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all plan metrics"
  ON plan_performance_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

CREATE POLICY "Service role can manage plan metrics"
  ON plan_performance_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id
  FROM profiles
  WHERE role_id = (SELECT id FROM roles WHERE name = 'Admin')
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM profiles LIMIT 1;
  END IF;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO platform_fee_rules (
      rule_type,
      fee_type,
      fee_value,
      is_active,
      created_by,
      change_reason
    )
    SELECT
      'global',
      'percentage',
      20.00,
      true,
      v_admin_id,
      'Default platform fee'
    WHERE NOT EXISTS (
      SELECT 1 FROM platform_fee_rules
      WHERE rule_type = 'global'
    );
  END IF;
END $$;
