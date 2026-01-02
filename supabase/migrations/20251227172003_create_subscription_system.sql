/*
  # Subscription System for AnalyzingHub

  ## Overview
  Creates a manual subscription system for testing, with architecture ready for future payment provider integration.

  ## New Tables

  ### `analyzer_plans`
  Subscription plans created by analyzers
  - `id` (uuid, primary key) - Unique identifier
  - `analyst_id` (uuid, FK to profiles) - Plan owner/analyzer
  - `name` (text) - Plan name (e.g., "Lite", "Pro")
  - `price_cents` (int) - Price in cents (for future payment integration)
  - `billing_interval` (text) - 'month' or 'year'
  - `features` (jsonb) - Plan features and benefits
  - `is_active` (boolean) - Whether plan is available for subscription
  - `telegram_channel_id` (text, nullable) - Associated Telegram channel
  - `description` (text, nullable) - Plan description
  - `max_subscribers` (int, nullable) - Maximum allowed subscribers (null = unlimited)
  - `created_at`, `updated_at` (timestamptz)

  ### `subscriptions`
  User subscriptions to analyzer plans
  - `id` (uuid, primary key) - Unique identifier
  - `subscriber_id` (uuid, FK to profiles) - User subscribing
  - `analyst_id` (uuid, FK to profiles) - Analyzer being subscribed to
  - `plan_id` (uuid, FK to analyzer_plans) - Subscribed plan
  - `status` (enum) - 'trialing', 'active', 'past_due', 'canceled', 'expired'
  - `start_at` (timestamptz) - Subscription start date
  - `current_period_end` (timestamptz) - Current billing period end
  - `cancel_at_period_end` (boolean) - Whether to cancel at period end
  - `canceled_at` (timestamptz, nullable) - When subscription was canceled
  - `provider` (text) - Payment provider ('manual' for now)
  - `provider_subscription_id` (text, nullable) - External subscription ID
  - `metadata` (jsonb) - Additional metadata
  - `created_at`, `updated_at` (timestamptz)
  - Unique constraint on (subscriber_id, plan_id)

  ### `telegram_memberships`
  Tracks Telegram channel memberships for subscribers
  - `id` (uuid, primary key) - Unique identifier
  - `subscription_id` (uuid, FK to subscriptions) - Associated subscription
  - `channel_id` (text) - Telegram channel ID
  - `invite_link` (text, nullable) - Generated invite link
  - `status` (enum) - 'pending', 'invited', 'joined', 'kicked', 'revoked'
  - `joined_at` (timestamptz, nullable) - When user joined channel
  - `created_at`, `updated_at` (timestamptz)
  - Unique constraint on (subscription_id, channel_id)

  ## Table Modifications

  ### `analyses`
  - Add `visibility` column (enum: 'public', 'followers', 'subscribers', 'private')

  ## Security
  - All tables have RLS enabled
  - Plans: Public read for active plans, owner-only write
  - Subscriptions: Service role only for write operations
  - Memberships: Service role only for write operations

  ## Indexes
  - Index on subscriptions(subscriber_id)
  - Index on subscriptions(analyst_id)
  - Index on subscriptions(status)
  - Index on telegram_memberships(subscription_id)
*/

-- Create enum types
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('pending', 'invited', 'joined', 'kicked', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE visibility_type AS ENUM ('public', 'followers', 'subscribers', 'private');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add visibility column to analyses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE analyses ADD COLUMN visibility visibility_type DEFAULT 'public' NOT NULL;
  END IF;
END $$;

-- Create analyzer_plans table
CREATE TABLE IF NOT EXISTS analyzer_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents int NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  features jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  telegram_channel_id text,
  description text,
  max_subscribers int CHECK (max_subscribers IS NULL OR max_subscribers > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  analyst_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES analyzer_plans(id) ON DELETE RESTRICT,
  status subscription_status DEFAULT 'active' NOT NULL,
  start_at timestamptz DEFAULT now() NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamptz,
  provider text DEFAULT 'manual' NOT NULL,
  provider_subscription_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subscriber_id, plan_id)
);

-- Create telegram_memberships table
CREATE TABLE IF NOT EXISTS telegram_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  invite_link text,
  status membership_status DEFAULT 'pending' NOT NULL,
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subscription_id, channel_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_analyzer_plans_analyst_id ON analyzer_plans(analyst_id);
CREATE INDEX IF NOT EXISTS idx_analyzer_plans_active ON analyzer_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber_id ON subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_analyst_id ON subscriptions(analyst_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(subscriber_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_telegram_memberships_subscription_id ON telegram_memberships(subscription_id);
CREATE INDEX IF NOT EXISTS idx_telegram_memberships_channel_id ON telegram_memberships(channel_id);
CREATE INDEX IF NOT EXISTS idx_analyses_visibility ON analyses(visibility);

-- Enable RLS
ALTER TABLE analyzer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analyzer_plans

-- Anyone can view active plans
CREATE POLICY "Anyone can view active analyzer plans"
  ON analyzer_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Analysts can view their own plans (active or inactive)
CREATE POLICY "Analysts can view own plans"
  ON analyzer_plans FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

-- Analysts can create their own plans
CREATE POLICY "Analysts can create own plans"
  ON analyzer_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    analyst_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      JOIN roles ON profiles.role_id = roles.id
      WHERE profiles.id = auth.uid()
      AND roles.name = 'Analyzer'
    )
  );

-- Analysts can update their own plans
CREATE POLICY "Analysts can update own plans"
  ON analyzer_plans FOR UPDATE
  TO authenticated
  USING (analyst_id = auth.uid())
  WITH CHECK (analyst_id = auth.uid());

-- Analysts can delete their own plans (if no active subscriptions)
CREATE POLICY "Analysts can delete own plans"
  ON analyzer_plans FOR DELETE
  TO authenticated
  USING (
    analyst_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions
      WHERE plan_id = analyzer_plans.id
      AND status IN ('active', 'trialing')
    )
  );

-- RLS Policies for subscriptions

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (subscriber_id = auth.uid());

-- Analysts can view subscriptions to their plans
CREATE POLICY "Analysts can view subscriptions to own plans"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

-- Service role can manage all subscriptions (for server-side operations)
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for telegram_memberships

-- Users can view their own memberships
CREATE POLICY "Users can view own memberships"
  ON telegram_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = telegram_memberships.subscription_id
      AND subscriptions.subscriber_id = auth.uid()
    )
  );

-- Analysts can view memberships for their channels
CREATE POLICY "Analysts can view memberships for own channels"
  ON telegram_memberships FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = telegram_memberships.subscription_id
      AND subscriptions.analyst_id = auth.uid()
    )
  );

-- Service role can manage all memberships
CREATE POLICY "Service role can manage memberships"
  ON telegram_memberships FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check if user has active subscription to analyst
CREATE OR REPLACE FUNCTION has_active_subscription(
  p_subscriber_id uuid,
  p_analyst_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = p_subscriber_id
    AND analyst_id = p_analyst_id
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

-- Function to get active subscriber count for a plan
CREATE OR REPLACE FUNCTION get_plan_subscriber_count(p_plan_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::int
  FROM subscriptions
  WHERE plan_id = p_plan_id
  AND status IN ('active', 'trialing');
$$;

-- Function to automatically expire subscriptions
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE subscriptions
  SET status = 'expired',
      updated_at = now()
  WHERE status IN ('active', 'trialing', 'past_due')
  AND current_period_end < now()
  AND cancel_at_period_end = false;
  
  UPDATE subscriptions
  SET status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  WHERE status IN ('active', 'trialing')
  AND current_period_end < now()
  AND cancel_at_period_end = true;
END;
$$;

-- Update analyses RLS policies to respect visibility

-- Drop existing "Anyone can read analyses" policy if it exists
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can read analyses" ON analyses;
  DROP POLICY IF EXISTS "Public analyses are viewable by everyone" ON analyses;
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

-- New policy for public analyses
CREATE POLICY "Public analyses are viewable by everyone"
  ON analyses FOR SELECT
  TO authenticated
  USING (visibility = 'public');

-- Policy for followers-only analyses
CREATE POLICY "Followers can view follower-only analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (
    visibility = 'followers'
    AND (
      analyzer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM follows
        WHERE follows.following_id = analyses.analyzer_id
        AND follows.follower_id = auth.uid()
      )
    )
  );

-- Policy for subscribers-only analyses
CREATE POLICY "Subscribers can view subscriber-only analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (
    visibility = 'subscribers'
    AND (
      analyzer_id = auth.uid()
      OR has_active_subscription(auth.uid(), analyses.analyzer_id)
    )
  );

-- Policy for private analyses (owner only)
CREATE POLICY "Private analyses viewable by owner only"
  ON analyses FOR SELECT
  TO authenticated
  USING (
    visibility = 'private'
    AND analyzer_id = auth.uid()
  );

-- Policy for service role to read all analyses
CREATE POLICY "Service role can read all analyses"
  ON analyses FOR SELECT
  TO service_role
  USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_analyzer_plans_updated_at ON analyzer_plans;
  CREATE TRIGGER update_analyzer_plans_updated_at
    BEFORE UPDATE ON analyzer_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN others THEN null;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
  CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN others THEN null;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_telegram_memberships_updated_at ON telegram_memberships;
  CREATE TRIGGER update_telegram_memberships_updated_at
    BEFORE UPDATE ON telegram_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN others THEN null;
END $$;
