# Financial Management and Subscriber Management System
## System Architecture Design

---

## 1. Executive Summary

This document outlines a **modular Financial Management and Subscriber Management System** for AnalyzingHub. The system operates as an isolated module with minimal impact on existing platform logic, providing comprehensive financial tracking, revenue management, and subscriber insights.

### Key Principles
- **Zero Impact**: Isolated module with event-based integration
- **Ledger-First**: All financial operations recorded in immutable ledger
- **Role-Based Access**: Granular permissions for Admin, Analyst, End User
- **Payment Agnostic**: Compatible with any payment gateway
- **Audit Trail**: Complete history of all financial operations

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Existing Platform                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Analyses   │  │ Subscriptions │  │   Profiles   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
└─────────┼──────────────────┼──────────────────┼───────────────┘
          │                  │                  │
          │    Event Bus (Webhooks/Messages)   │
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼───────────────┐
│           FINANCIAL MANAGEMENT MODULE (Isolated)              │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │   Financial    │  │   Subscriber   │  │   Payout      │ │
│  │   Ledger       │  │   Manager      │  │   Manager     │ │
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘ │
│           │                    │                    │         │
│  ┌────────▼────────────────────▼────────────────────▼───────┐ │
│  │              Financial Database Schema                   │ │
│  │  • transactions  • revenue_splits  • payouts            │ │
│  │  • platform_fees • analyst_earnings • audit_log         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  API Layer (RBAC)                       │  │
│  │  • /api/financial/*  • /api/subscribers/*              │  │
│  │  • /api/payouts/*    • /api/admin/financial/*          │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Module Isolation Strategy

**Integration Points:**
1. **Event Listeners**: Listen to subscription events (created, renewed, canceled, refunded)
2. **Read-Only Queries**: Access existing subscription data without modification
3. **Separate Tables**: All financial data in dedicated tables
4. **Independent APIs**: New API endpoints under `/api/financial/*`
5. **Service Layer**: Dedicated services with no cross-dependencies

**No Impact Guarantee:**
- Existing subscription APIs unchanged
- No modifications to `subscriptions`, `analyzer_plans`, or `profiles` tables
- Financial calculations happen asynchronously
- Failures in financial module don't affect subscription operations

---

## 3. Database Schema Design

### 3.1 Core Financial Tables

#### **financial_transactions**
Immutable ledger of all financial events

```sql
CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction Identity
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'subscription_payment',    -- Initial subscription payment
    'subscription_renewal',    -- Recurring payment
    'subscription_upgrade',    -- Plan upgrade payment
    'subscription_downgrade',  -- Plan downgrade credit
    'refund',                 -- Payment refund
    'chargeback',             -- Payment chargeback
    'adjustment'              -- Manual adjustment
  )),

  -- Related Entities
  subscription_id UUID REFERENCES subscriptions(id),
  analyst_id UUID NOT NULL REFERENCES profiles(id),
  subscriber_id UUID NOT NULL REFERENCES profiles(id),
  plan_id UUID REFERENCES analyzer_plans(id),

  -- Financial Details
  gross_amount_cents INTEGER NOT NULL CHECK (gross_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Platform Deduction
  platform_fee_cents INTEGER NOT NULL CHECK (platform_fee_cents >= 0),
  platform_fee_type TEXT CHECK (platform_fee_type IN ('percentage', 'fixed')),
  platform_fee_rate NUMERIC(5,2), -- For percentage (e.g., 20.00 = 20%)

  -- Net Amount (what analyst receives)
  net_amount_cents INTEGER NOT NULL CHECK (net_amount_cents >= 0),

  -- Payment Provider Details
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_transaction_id TEXT,
  provider_fee_cents INTEGER DEFAULT 0,
  provider_metadata JSONB DEFAULT '{}',

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Awaiting confirmation
    'completed',    -- Successfully processed
    'failed',       -- Failed to process
    'reversed',     -- Refunded or charged back
    'disputed'      -- Under dispute
  )),

  -- Timestamps
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_net_amount CHECK (
    net_amount_cents = gross_amount_cents - platform_fee_cents - COALESCE(provider_fee_cents, 0)
  )
);

CREATE INDEX idx_financial_transactions_analyst ON financial_transactions(analyst_id, transaction_date);
CREATE INDEX idx_financial_transactions_subscriber ON financial_transactions(subscriber_id, transaction_date);
CREATE INDEX idx_financial_transactions_subscription ON financial_transactions(subscription_id);
CREATE INDEX idx_financial_transactions_status ON financial_transactions(status, transaction_date);
```

#### **platform_fee_rules**
Defines platform deduction rules (per analyst or per plan)

```sql
CREATE TABLE platform_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Scope (either analyst or plan specific, or global)
  analyst_id UUID REFERENCES profiles(id),
  plan_id UUID REFERENCES analyzer_plans(id),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('analyst', 'plan', 'global')),

  -- Fee Configuration
  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value NUMERIC(10,2) NOT NULL CHECK (fee_value >= 0),
  -- For percentage: 20.00 = 20%
  -- For fixed: amount in cents

  -- Priority (higher number = higher priority)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Validity
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,

  -- Audit
  created_by UUID NOT NULL REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT rule_scope CHECK (
    (rule_type = 'analyst' AND analyst_id IS NOT NULL AND plan_id IS NULL) OR
    (rule_type = 'plan' AND plan_id IS NOT NULL AND analyst_id IS NULL) OR
    (rule_type = 'global' AND analyst_id IS NULL AND plan_id IS NULL)
  ),
  CONSTRAINT one_analyst_rule UNIQUE (analyst_id) WHERE analyst_id IS NOT NULL,
  CONSTRAINT one_plan_rule UNIQUE (plan_id) WHERE plan_id IS NOT NULL
);

CREATE INDEX idx_platform_fee_rules_analyst ON platform_fee_rules(analyst_id) WHERE analyst_id IS NOT NULL;
CREATE INDEX idx_platform_fee_rules_plan ON platform_fee_rules(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX idx_platform_fee_rules_active ON platform_fee_rules(is_active, effective_from);
```

#### **analyst_earnings_summary**
Pre-calculated earnings summary for analysts (materialized view)

```sql
CREATE TABLE analyst_earnings_summary (
  analyst_id UUID PRIMARY KEY REFERENCES profiles(id),

  -- All-Time Earnings
  total_gross_cents BIGINT NOT NULL DEFAULT 0,
  total_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  total_net_cents BIGINT NOT NULL DEFAULT 0,

  -- Current Month
  month_gross_cents BIGINT NOT NULL DEFAULT 0,
  month_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  month_net_cents BIGINT NOT NULL DEFAULT 0,

  -- Current Year
  year_gross_cents BIGINT NOT NULL DEFAULT 0,
  year_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  year_net_cents BIGINT NOT NULL DEFAULT 0,

  -- Subscriber Metrics
  total_subscribers_all_time INTEGER NOT NULL DEFAULT 0,
  active_subscribers_count INTEGER NOT NULL DEFAULT 0,
  churned_subscribers_count INTEGER NOT NULL DEFAULT 0,

  -- Payout Status
  total_paid_out_cents BIGINT NOT NULL DEFAULT 0,
  pending_payout_cents BIGINT NOT NULL DEFAULT 0,

  -- Metadata
  currency TEXT NOT NULL DEFAULT 'USD',
  last_transaction_at TIMESTAMPTZ,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyst_earnings_updated ON analyst_earnings_summary(updated_at);
```

#### **payouts**
Tracks analyst payouts

```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Analyst
  analyst_id UUID NOT NULL REFERENCES profiles(id),

  -- Payout Details
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Period Covered
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Awaiting processing
    'processing',   -- Being processed
    'completed',    -- Successfully paid
    'failed',       -- Payment failed
    'canceled'      -- Canceled by admin
  )),

  -- Payment Method
  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'paypal', 'stripe', 'manual')),
  payment_reference TEXT, -- Bank ref, PayPal transaction ID, etc.

  -- Linked Transactions
  transaction_ids UUID[] DEFAULT '{}',

  -- Notes
  notes TEXT,
  failure_reason TEXT,

  -- Timestamps
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  processed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payouts_analyst ON payouts(analyst_id, created_at);
CREATE INDEX idx_payouts_status ON payouts(status, scheduled_at);
CREATE INDEX idx_payouts_period ON payouts(period_start, period_end);
```

#### **subscriber_revenue_history**
Tracks revenue from each subscriber over time

```sql
CREATE TABLE subscriber_revenue_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  analyst_id UUID NOT NULL REFERENCES profiles(id),
  subscriber_id UUID NOT NULL REFERENCES profiles(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),

  -- Revenue Metrics
  total_gross_cents BIGINT NOT NULL DEFAULT 0,
  total_platform_fee_cents BIGINT NOT NULL DEFAULT 0,
  total_net_cents BIGINT NOT NULL DEFAULT 0,

  -- Subscription Metrics
  subscription_start_date TIMESTAMPTZ NOT NULL,
  subscription_end_date TIMESTAMPTZ,
  total_renewals INTEGER NOT NULL DEFAULT 0,
  total_refunds_cents BIGINT NOT NULL DEFAULT 0,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Lifetime Value
  lifetime_value_cents BIGINT NOT NULL DEFAULT 0,

  -- Timestamps
  first_payment_at TIMESTAMPTZ,
  last_payment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriber_revenue_analyst ON subscriber_revenue_history(analyst_id, subscriber_id);
CREATE INDEX idx_subscriber_revenue_subscription ON subscriber_revenue_history(subscription_id);
CREATE INDEX idx_subscriber_revenue_active ON subscriber_revenue_history(analyst_id, is_active);
```

#### **financial_audit_log**
Complete audit trail of all financial changes

```sql
CREATE TABLE financial_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action Details
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

  -- Entity
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Changes
  old_values JSONB,
  new_values JSONB,

  -- Actor
  performed_by UUID NOT NULL REFERENCES profiles(id),
  ip_address TEXT,
  user_agent TEXT,

  -- Context
  reason TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_audit_entity ON financial_audit_log(entity_type, entity_id);
CREATE INDEX idx_financial_audit_performer ON financial_audit_log(performed_by, created_at);
CREATE INDEX idx_financial_audit_action ON financial_audit_log(action_type, created_at);
```

#### **plan_performance_metrics**
Analytics for each subscription plan

```sql
CREATE TABLE plan_performance_metrics (
  plan_id UUID PRIMARY KEY REFERENCES analyzer_plans(id),

  -- Subscription Metrics
  total_subscriptions INTEGER NOT NULL DEFAULT 0,
  active_subscriptions INTEGER NOT NULL DEFAULT 0,
  canceled_subscriptions INTEGER NOT NULL DEFAULT 0,

  -- Revenue
  total_revenue_cents BIGINT NOT NULL DEFAULT 0,
  monthly_recurring_revenue_cents BIGINT NOT NULL DEFAULT 0,
  average_revenue_per_user_cents INTEGER NOT NULL DEFAULT 0,

  -- Conversion
  conversion_rate NUMERIC(5,2) DEFAULT 0, -- Percentage
  churn_rate NUMERIC(5,2) DEFAULT 0, -- Percentage

  -- Lifetime Value
  average_lifetime_value_cents BIGINT NOT NULL DEFAULT 0,
  average_subscription_length_days INTEGER NOT NULL DEFAULT 0,

  -- Platform Revenue
  total_platform_fee_cents BIGINT NOT NULL DEFAULT 0,

  -- Timestamps
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_performance_updated ON plan_performance_metrics(updated_at);
```

### 3.2 Helper Functions

```sql
-- Calculate platform fee for a transaction
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
  -- Priority: Plan-specific > Analyst-specific > Global
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
    -- Default: 20% platform fee
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Record subscription payment transaction
CREATE OR REPLACE FUNCTION record_subscription_transaction(
  p_subscription_id UUID,
  p_transaction_type TEXT,
  p_gross_amount_cents INTEGER,
  p_provider TEXT DEFAULT 'manual',
  p_provider_transaction_id TEXT DEFAULT NULL,
  p_provider_fee_cents INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_subscription RECORD;
  v_fee RECORD;
  v_transaction_id UUID;
BEGIN
  -- Get subscription details
  SELECT s.*, ap.analyst_id
  INTO v_subscription
  FROM subscriptions s
  JOIN analyzer_plans ap ON s.plan_id = ap.id
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  -- Calculate platform fee
  SELECT * INTO v_fee
  FROM calculate_platform_fee(
    v_subscription.analyst_id,
    v_subscription.plan_id,
    p_gross_amount_cents
  );

  -- Insert transaction
  INSERT INTO financial_transactions (
    transaction_type,
    subscription_id,
    analyst_id,
    subscriber_id,
    plan_id,
    gross_amount_cents,
    platform_fee_cents,
    platform_fee_type,
    platform_fee_rate,
    net_amount_cents,
    provider,
    provider_transaction_id,
    provider_fee_cents,
    status,
    transaction_date,
    completed_at
  ) VALUES (
    p_transaction_type,
    p_subscription_id,
    v_subscription.analyst_id,
    v_subscription.subscriber_id,
    v_subscription.plan_id,
    p_gross_amount_cents,
    v_fee.fee_cents,
    v_fee.fee_type,
    v_fee.fee_rate,
    p_gross_amount_cents - v_fee.fee_cents - p_provider_fee_cents,
    p_provider,
    p_provider_transaction_id,
    p_provider_fee_cents,
    'completed',
    now(),
    now()
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. API Structure

### 4.1 Analyst APIs

#### **GET /api/financial/analyst/dashboard**
Returns financial overview for analyst

**Authentication:** Analyst role required

**Response:**
```json
{
  "earnings": {
    "allTime": {
      "gross": 500000,      // cents
      "platformFee": 100000,
      "net": 400000
    },
    "thisMonth": {
      "gross": 50000,
      "platformFee": 10000,
      "net": 40000
    },
    "thisYear": {
      "gross": 300000,
      "platformFee": 60000,
      "net": 240000
    }
  },
  "subscribers": {
    "active": 45,
    "total": 120,
    "churned": 75
  },
  "payouts": {
    "totalPaidOut": 300000,
    "pending": 100000,
    "nextPayoutDate": "2025-02-01T00:00:00Z"
  },
  "currency": "USD"
}
```

#### **GET /api/financial/analyst/subscribers**
List analyst's subscribers with revenue details

**Query Parameters:**
- `status`: active | canceled | all
- `sortBy`: revenue | startDate | name
- `page`: number
- `limit`: number

**Response:**
```json
{
  "subscribers": [
    {
      "subscriberId": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "plan": {
        "id": "uuid",
        "name": "Pro Plan"
      },
      "status": "active",
      "startDate": "2024-01-15T00:00:00Z",
      "endDate": null,
      "revenue": {
        "total": 30000,      // cents
        "platformFee": 6000,
        "net": 24000
      },
      "renewals": 3,
      "lifetimeValue": 30000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

#### **GET /api/financial/analyst/history**
Transaction history for analyst

**Query Parameters:**
- `startDate`: ISO date
- `endDate`: ISO date
- `type`: payment | refund | adjustment
- `page`: number
- `limit`: number

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "date": "2024-12-30T10:00:00Z",
      "type": "subscription_payment",
      "subscriber": {
        "id": "uuid",
        "name": "John Doe"
      },
      "plan": {
        "id": "uuid",
        "name": "Pro Plan"
      },
      "gross": 10000,
      "platformFee": 2000,
      "net": 8000,
      "status": "completed"
    }
  ],
  "summary": {
    "totalGross": 150000,
    "totalPlatformFee": 30000,
    "totalNet": 120000
  },
  "pagination": {...}
}
```

#### **GET /api/financial/analyst/earnings-by-plan**
Breakdown of earnings by subscription plan

**Response:**
```json
{
  "plans": [
    {
      "planId": "uuid",
      "planName": "Pro Plan",
      "activeSubscribers": 30,
      "totalRevenue": 300000,
      "platformFee": 60000,
      "netEarnings": 240000,
      "averageRevenuePerUser": 10000
    }
  ]
}
```

#### **GET /api/financial/analyst/earnings-by-date**
Earnings over time (for charts)

**Query Parameters:**
- `period`: day | week | month | year
- `startDate`: ISO date
- `endDate`: ISO date

**Response:**
```json
{
  "data": [
    {
      "date": "2024-12",
      "gross": 50000,
      "platformFee": 10000,
      "net": 40000,
      "newSubscribers": 5,
      "churned": 2
    }
  ]
}
```

#### **GET /api/financial/analyst/payout-history**
Payout history for analyst

**Response:**
```json
{
  "payouts": [
    {
      "id": "uuid",
      "amount": 100000,
      "period": {
        "start": "2024-12-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z"
      },
      "status": "completed",
      "paymentMethod": "bank_transfer",
      "paymentReference": "REF123456",
      "scheduledAt": "2025-01-05T00:00:00Z",
      "completedAt": "2025-01-05T14:30:00Z"
    }
  ]
}
```

### 4.2 Admin APIs

#### **GET /api/admin/financial/overview**
Platform-wide financial overview

**Authentication:** Admin role required

**Response:**
```json
{
  "platform": {
    "totalRevenue": 10000000,
    "platformFees": 2000000,
    "analystPayouts": 8000000,
    "pendingPayouts": 500000
  },
  "thisMonth": {
    "revenue": 500000,
    "platformFees": 100000,
    "growth": 15.5  // percentage
  },
  "topAnalysts": [
    {
      "analystId": "uuid",
      "name": "Top Analyst",
      "revenue": 200000,
      "subscribers": 50
    }
  ],
  "topPlans": [
    {
      "planId": "uuid",
      "name": "Elite Plan",
      "revenue": 300000,
      "subscribers": 30
    }
  ]
}
```

#### **POST /api/admin/financial/fee-rules**
Create platform fee rule

**Request:**
```json
{
  "ruleType": "analyst",  // analyst | plan | global
  "analystId": "uuid",    // if analyst-specific
  "planId": "uuid",       // if plan-specific
  "feeType": "percentage", // percentage | fixed
  "feeValue": 15.00,      // 15% or cents if fixed
  "effectiveFrom": "2025-01-01T00:00:00Z",
  "effectiveUntil": null,
  "reason": "Special agreement"
}
```

**Response:**
```json
{
  "ruleId": "uuid",
  "status": "created",
  "effectiveFrom": "2025-01-01T00:00:00Z"
}
```

#### **GET /api/admin/financial/fee-rules**
List all platform fee rules

**Response:**
```json
{
  "rules": [
    {
      "id": "uuid",
      "ruleType": "analyst",
      "analyst": {
        "id": "uuid",
        "name": "John Analyst"
      },
      "feeType": "percentage",
      "feeValue": 15.00,
      "isActive": true,
      "effectiveFrom": "2025-01-01T00:00:00Z",
      "effectiveUntil": null,
      "createdBy": {
        "id": "uuid",
        "name": "Admin User"
      },
      "reason": "Special agreement"
    }
  ]
}
```

#### **PUT /api/admin/financial/fee-rules/:id**
Update fee rule

**Request:**
```json
{
  "feeValue": 12.00,
  "reason": "Negotiated lower rate"
}
```

#### **DELETE /api/admin/financial/fee-rules/:id**
Deactivate fee rule

**Request:**
```json
{
  "reason": "Contract ended"
}
```

#### **GET /api/admin/financial/analysts**
List all analysts with financial metrics

**Query Parameters:**
- `sortBy`: revenue | subscribers | name
- `page`: number
- `limit`: number

**Response:**
```json
{
  "analysts": [
    {
      "analystId": "uuid",
      "name": "John Analyst",
      "email": "john@example.com",
      "earnings": {
        "total": 500000,
        "platformFee": 100000,
        "net": 400000
      },
      "subscribers": {
        "active": 45,
        "total": 120
      },
      "feeRule": {
        "type": "percentage",
        "value": 20.00
      },
      "pendingPayout": 50000
    }
  ],
  "pagination": {...}
}
```

#### **POST /api/admin/financial/payouts/create**
Create payout for analyst

**Request:**
```json
{
  "analystId": "uuid",
  "amount": 100000,  // cents
  "periodStart": "2024-12-01T00:00:00Z",
  "periodEnd": "2024-12-31T23:59:59Z",
  "paymentMethod": "bank_transfer",
  "scheduledAt": "2025-01-05T00:00:00Z",
  "notes": "Monthly payout"
}
```

#### **POST /api/admin/financial/payouts/:id/complete**
Mark payout as completed

**Request:**
```json
{
  "paymentReference": "BANK_REF_123456",
  "completedAt": "2025-01-05T14:30:00Z"
}
```

#### **POST /api/admin/financial/payouts/:id/fail**
Mark payout as failed

**Request:**
```json
{
  "failureReason": "Invalid bank account"
}
```

#### **GET /api/admin/financial/audit-log**
View financial audit trail

**Query Parameters:**
- `actionType`: filter by action
- `performedBy`: filter by user
- `startDate`: ISO date
- `endDate`: ISO date
- `page`: number

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "action": "fee_rule_updated",
      "entity": {
        "type": "platform_fee_rule",
        "id": "uuid"
      },
      "changes": {
        "before": {"feeValue": 20.00},
        "after": {"feeValue": 15.00}
      },
      "performedBy": {
        "id": "uuid",
        "name": "Admin User"
      },
      "reason": "Negotiated lower rate",
      "timestamp": "2025-01-01T10:00:00Z",
      "ipAddress": "192.168.1.1"
    }
  ],
  "pagination": {...}
}
```

#### **POST /api/admin/financial/transactions/adjust**
Create manual financial adjustment

**Request:**
```json
{
  "analystId": "uuid",
  "amount": 5000,  // can be negative
  "reason": "Refund processing error",
  "notes": "Compensating for system error on 2024-12-15"
}
```

#### **GET /api/admin/financial/plan-performance**
Analytics for all plans

**Response:**
```json
{
  "plans": [
    {
      "planId": "uuid",
      "planName": "Pro Plan",
      "analyst": {
        "id": "uuid",
        "name": "John Analyst"
      },
      "metrics": {
        "totalSubscriptions": 120,
        "activeSubscriptions": 45,
        "churnRate": 12.5,
        "totalRevenue": 1200000,
        "platformRevenue": 240000,
        "mrr": 45000,
        "arpu": 1000,
        "averageLifetimeValue": 10000
      }
    }
  ]
}
```

---

## 5. Permission Model (RBAC)

### 5.1 Role Definitions

#### **Analyst Role**
Permissions:
- ✅ View own financial dashboard
- ✅ View own subscribers (name, email, plan, status, dates)
- ✅ View own transaction history
- ✅ View own payout history
- ✅ View earnings breakdown by plan
- ✅ View earnings over time
- ❌ View other analysts' data
- ❌ View platform fee rules
- ❌ View sensitive payment data (card numbers, bank accounts)
- ❌ Modify any financial data
- ❌ Create or modify fee rules

#### **Admin Role**
Permissions:
- ✅ Full access to all financial data
- ✅ Create/update/delete platform fee rules
- ✅ View all analysts' financial data
- ✅ View platform-wide analytics
- ✅ Create/manage payouts
- ✅ View audit logs
- ✅ Create manual adjustments
- ✅ View plan performance metrics
- ❌ View end-user payment methods (PCI compliance)

#### **End User Role**
Permissions:
- ✅ View own subscription status
- ✅ View own payment history
- ❌ View any analyst financial data
- ❌ View other users' data
- ❌ Access financial management APIs

### 5.2 RLS Policies

```sql
-- Analyst can view their own financial data
CREATE POLICY "analysts_view_own_transactions"
  ON financial_transactions FOR SELECT
  TO authenticated
  USING (
    analyst_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
    )
  );

-- Admin can view all financial data
CREATE POLICY "admins_view_all_transactions"
  ON financial_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

-- Only admins can modify fee rules
CREATE POLICY "admins_manage_fee_rules"
  ON platform_fee_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Admin')
    )
  );

-- Analysts can view their own earnings summary
CREATE POLICY "analysts_view_own_earnings"
  ON analyst_earnings_summary FOR SELECT
  TO authenticated
  USING (
    analyst_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
    )
  );

-- Only service role can update earnings summaries
CREATE POLICY "service_role_update_earnings"
  ON analyst_earnings_summary FOR UPDATE
  TO service_role
  USING (true);
```

---

## 6. Data Flow & Integration

### 6.1 Event-Based Integration

#### Subscription Created Flow
```
1. User subscribes to plan via existing API
   ↓
2. Subscription record created in `subscriptions` table
   ↓
3. [Event Trigger] New subscription event
   ↓
4. Financial Module listens to event
   ↓
5. Create transaction in `financial_transactions`
   ↓
6. Update `analyst_earnings_summary`
   ↓
7. Update `subscriber_revenue_history`
   ↓
8. Update `plan_performance_metrics`
```

#### Subscription Renewed Flow
```
1. Renewal payment processed (webhook from payment provider)
   ↓
2. Update `subscriptions.current_period_end`
   ↓
3. [Event Trigger] Renewal event
   ↓
4. Record transaction with type='subscription_renewal'
   ↓
5. Update all summary tables
```

#### Refund Flow
```
1. Admin/Payment Provider initiates refund
   ↓
2. Create transaction with type='refund' and status='completed'
   ↓
3. Set gross_amount_cents as negative value
   ↓
4. Reverse original transaction (set status='reversed')
   ↓
5. Update analyst earnings (subtract refund)
   ↓
6. Update subscriber revenue history
   ↓
7. Log in audit trail
```

### 6.2 Async Processing

All financial calculations happen asynchronously:

1. **Transaction Recording**: Immediate
2. **Summary Updates**: Queued (processed within seconds)
3. **Analytics Recalculation**: Batch (hourly/daily)
4. **Payout Generation**: Scheduled (monthly)

### 6.3 Failure Handling

**Principle**: Financial module failures MUST NOT break subscription operations

Strategies:
1. **Dead Letter Queue**: Failed events stored for retry
2. **Idempotent Operations**: Duplicate events don't create duplicate transactions
3. **Reconciliation Jobs**: Daily job to ensure data consistency
4. **Alerts**: Notify admins of discrepancies

---

## 7. Security Considerations

### 7.1 Data Protection

1. **PCI Compliance**: Never store card numbers or CVV
2. **Encryption**: All financial data encrypted at rest
3. **Access Logs**: All financial data access logged
4. **IP Restriction**: Admin financial APIs restricted to office IPs (optional)

### 7.2 Fraud Prevention

1. **Transaction Limits**: Maximum transaction amounts
2. **Rate Limiting**: API rate limits per user
3. **Anomaly Detection**: Flag unusual patterns (e.g., 100 subscriptions in 1 hour)
4. **Manual Review**: High-value transactions require admin approval

### 7.3 Audit Requirements

All changes must be logged:
- Who made the change
- What changed (before/after values)
- When it changed
- Why it changed (reason field)
- From where (IP address)

---

## 8. Implementation Phases

### Phase 1: Core Financial Tracking (Week 1-2)
- [ ] Create database tables
- [ ] Implement helper functions
- [ ] Create event listeners for subscription events
- [ ] Build transaction recording system
- [ ] Basic RLS policies

### Phase 2: Analyst Dashboard (Week 3)
- [ ] Analyst financial dashboard API
- [ ] Subscribers list with revenue API
- [ ] Transaction history API
- [ ] Earnings breakdown APIs
- [ ] Frontend components

### Phase 3: Admin Management (Week 4)
- [ ] Platform fee rules CRUD APIs
- [ ] Admin financial overview API
- [ ] Audit log API
- [ ] Admin dashboard frontend

### Phase 4: Payout System (Week 5)
- [ ] Payout creation and management APIs
- [ ] Payout processing workflow
- [ ] Email notifications
- [ ] Payout history UI

### Phase 5: Analytics & Optimization (Week 6)
- [ ] Plan performance metrics
- [ ] Advanced analytics dashboard
- [ ] Automated reconciliation jobs
- [ ] Performance optimization

---

## 9. Testing Strategy

### 9.1 Unit Tests
- Fee calculation functions
- Transaction validation
- RLS policy enforcement

### 9.2 Integration Tests
- Subscription → Transaction flow
- Refund → Reversal flow
- Payout creation → Completion flow
- Event processing

### 9.3 Load Tests
- 1000 concurrent transactions
- Dashboard query performance
- Summary table updates

### 9.4 Security Tests
- Unauthorized access attempts
- RLS bypass attempts
- SQL injection tests
- API rate limiting

---

## 10. Monitoring & Alerting

### 10.1 Metrics to Track
- Transaction volume (per hour/day)
- Failed transactions
- Average transaction processing time
- Payout processing time
- API response times
- RLS policy evaluation time

### 10.2 Alerts
- Failed transactions exceeding threshold
- Large discrepancies in reconciliation
- Payout failures
- Suspicious activity detected
- API error rate spike

---

## 11. Future Enhancements

1. **Multi-Currency Support**: Handle USD, EUR, etc.
2. **Tax Handling**: VAT, sales tax calculation
3. **Invoicing**: Auto-generate invoices
4. **Subscription Upgrades/Downgrades**: Prorated billing
5. **Tiered Pricing**: Volume-based discounts
6. **Affiliate System**: Referral tracking and payouts
7. **Advanced Analytics**: ML-based churn prediction
8. **White-Label**: Branded payment pages

---

## 12. Migration Strategy

Since this is a new module:
1. **Zero Migration**: No existing data to migrate
2. **Backfill Option**: Optionally create transactions for historical subscriptions
3. **Parallel Running**: Run alongside existing system without interference
4. **Gradual Rollout**: Enable for subset of analysts first

---

## Appendix A: Database Diagram

```
┌─────────────────────────┐
│  financial_transactions │◄────────┐
│  (Immutable Ledger)     │         │
└─────────────┬───────────┘         │
              │                     │
              │ updates             │ references
              │                     │
              ▼                     │
┌─────────────────────────┐         │
│ analyst_earnings_summary│         │
└─────────────────────────┘         │
                                    │
┌─────────────────────────┐         │
│  platform_fee_rules     │─────────┤ defines fees
└─────────────────────────┘         │
                                    │
┌─────────────────────────┐         │
│        payouts          │─────────┤ groups transactions
└─────────────────────────┘         │
                                    │
┌─────────────────────────┐         │
│subscriber_revenue_history│────────┘ tracks per subscriber
└─────────────────────────┘
```

---

## Appendix B: Sample Transaction Scenarios

### Scenario 1: New Subscription
```
Analyst: John (20% platform fee)
Plan: Pro Plan ($100/month)
Subscriber: Alice

Transaction Created:
- gross_amount_cents: 10000
- platform_fee_cents: 2000 (20%)
- net_amount_cents: 8000
- transaction_type: 'subscription_payment'
- status: 'completed'

Updates:
- analyst_earnings_summary: +$80 net, +$100 gross
- subscriber_revenue_history: +$100 lifetime value
- plan_performance_metrics: +1 subscriber
```

### Scenario 2: Subscription with Custom Fee
```
Analyst: Jane (custom 10% fee rule)
Plan: Elite Plan ($500/month)
Subscriber: Bob

Fee Calculation:
1. Check plan-specific rule: None
2. Check analyst-specific rule: 10%
3. Apply: 10% fee

Transaction Created:
- gross_amount_cents: 50000
- platform_fee_cents: 5000 (10%)
- net_amount_cents: 45000
```

### Scenario 3: Refund After 2 Renewals
```
Original Total Paid: $300 (3 months × $100)
Refund Amount: $100 (last month)

Refund Transaction:
- gross_amount_cents: -10000
- platform_fee_cents: -2000
- net_amount_cents: -8000
- transaction_type: 'refund'

Original Transactions:
- Status changed to 'reversed' for refunded period
```

---

## Conclusion

This Financial Management System design provides:
✅ Complete isolation from existing platform
✅ Comprehensive financial tracking
✅ Granular role-based access control
✅ Full audit trail
✅ Payment gateway agnostic architecture
✅ Scalable and maintainable structure

The system can be implemented incrementally without disrupting current operations and provides a solid foundation for future payment provider integrations and advanced financial features.
