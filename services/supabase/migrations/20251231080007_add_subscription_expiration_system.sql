/*
  # Subscription Expiration and Warning System

  1. Overview
    Creates automated subscription expiration warnings and channel removal system.

  2. New Tables
    - `subscription_warnings`: Tracks warning messages sent to users about expiring subscriptions

  3. New Functions
    - `send_subscription_warnings()`: Sends daily warnings 3, 2, and 1 days before expiration
    - `process_expired_subscriptions()`: Kicks users from Telegram channels when subscriptions expire

  4. Features
    - Automatic daily warnings for subscriptions expiring in 1-3 days
    - Tracks which warnings have been sent to prevent duplicates
    - Kicks users from Telegram channels when subscription ends
    - Updates telegram_memberships status to 'kicked'

  5. Security
    - RLS enabled on subscription_warnings table
    - Service role policies for automated processing
*/

-- Create subscription_warnings table to track sent warnings
CREATE TABLE IF NOT EXISTS subscription_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  warning_type text NOT NULL CHECK (warning_type IN ('3_days', '2_days', '1_day')),
  sent_at timestamptz DEFAULT now(),
  message_sent boolean DEFAULT false,
  telegram_username text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(subscription_id, warning_type)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_subscription_warnings_subscription_id ON subscription_warnings(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_warnings_sent_at ON subscription_warnings(sent_at);

-- Enable RLS
ALTER TABLE subscription_warnings ENABLE ROW LEVEL SECURITY;

-- Service role can manage all warnings
CREATE POLICY "Service role can manage subscription warnings"
  ON subscription_warnings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own subscription warnings
CREATE POLICY "Users can view own subscription warnings"
  ON subscription_warnings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = subscription_warnings.subscription_id
      AND subscriptions.subscriber_id = auth.uid()
    )
  );

-- Function to send subscription expiration warnings
CREATE OR REPLACE FUNCTION send_subscription_warnings()
RETURNS TABLE(
  processed_count int,
  warnings_sent int,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_days_until_expiry int;
  v_warning_type text;
  v_warning_exists boolean;
  v_processed_count int := 0;
  v_warnings_sent int := 0;
  v_details jsonb := '[]'::jsonb;
  v_telegram_username text;
BEGIN
  -- Loop through active subscriptions that will expire soon
  FOR v_subscription IN
    SELECT
      s.id,
      s.subscriber_id,
      s.analyst_id,
      s.current_period_end,
      s.plan_id,
      p.full_name as subscriber_name,
      p.telegram_username,
      ap.name as plan_name,
      analyst.full_name as analyst_name
    FROM subscriptions s
    JOIN profiles p ON s.subscriber_id = p.id
    JOIN analyzer_plans ap ON s.plan_id = ap.id
    JOIN profiles analyst ON s.analyst_id = analyst.id
    WHERE s.status IN ('active', 'trialing')
    AND s.current_period_end > now()
    AND s.current_period_end <= now() + INTERVAL '3 days'
    AND s.cancel_at_period_end = false
  LOOP
    v_processed_count := v_processed_count + 1;

    -- Calculate days until expiry
    v_days_until_expiry := EXTRACT(DAY FROM (v_subscription.current_period_end - now()))::int;

    -- Determine warning type based on days remaining
    IF v_days_until_expiry >= 2 AND v_days_until_expiry < 3 THEN
      v_warning_type := '3_days';
    ELSIF v_days_until_expiry >= 1 AND v_days_until_expiry < 2 THEN
      v_warning_type := '2_days';
    ELSIF v_days_until_expiry >= 0 AND v_days_until_expiry < 1 THEN
      v_warning_type := '1_day';
    ELSE
      CONTINUE;
    END IF;

    -- Check if warning already sent
    SELECT EXISTS(
      SELECT 1 FROM subscription_warnings
      WHERE subscription_id = v_subscription.id
      AND warning_type = v_warning_type
    ) INTO v_warning_exists;

    -- Only send if warning hasn't been sent yet
    IF NOT v_warning_exists THEN
      -- Get telegram username
      v_telegram_username := COALESCE(v_subscription.telegram_username, 'N/A');

      -- Insert warning record
      INSERT INTO subscription_warnings (
        subscription_id,
        warning_type,
        message_sent,
        telegram_username
      ) VALUES (
        v_subscription.id,
        v_warning_type,
        true
      );

      v_warnings_sent := v_warnings_sent + 1;

      -- Add to details
      v_details := v_details || jsonb_build_object(
        'subscription_id', v_subscription.id,
        'subscriber_name', v_subscription.subscriber_name,
        'telegram_username', v_telegram_username,
        'analyst_name', v_subscription.analyst_name,
        'plan_name', v_subscription.plan_name,
        'days_until_expiry', v_days_until_expiry,
        'warning_type', v_warning_type,
        'expires_at', v_subscription.current_period_end,
        'message', format(
          'Warning: Your subscription to %s''s "%s" plan will expire in %s day(s). Please renew to continue accessing premium content.',
          v_subscription.analyst_name,
          v_subscription.plan_name,
          v_days_until_expiry + 1
        )
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed_count, v_warnings_sent, v_details;
END;
$$;

-- Function to process expired subscriptions and kick users from channels
CREATE OR REPLACE FUNCTION process_expired_subscriptions()
RETURNS TABLE(
  expired_count int,
  kicked_count int,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count int := 0;
  v_kicked_count int := 0;
  v_details jsonb := '[]'::jsonb;
  v_subscription RECORD;
  v_membership RECORD;
BEGIN
  -- First, expire subscriptions that have passed their end date
  UPDATE subscriptions
  SET
    status = 'expired',
    updated_at = now()
  WHERE status IN ('active', 'trialing', 'past_due')
  AND current_period_end < now()
  AND cancel_at_period_end = false;

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- Process telegram memberships for expired subscriptions
  FOR v_subscription IN
    SELECT
      s.id as subscription_id,
      s.subscriber_id,
      s.analyst_id,
      s.current_period_end,
      p.full_name as subscriber_name,
      p.telegram_username,
      analyst.full_name as analyst_name
    FROM subscriptions s
    JOIN profiles p ON s.subscriber_id = p.id
    JOIN profiles analyst ON s.analyst_id = analyst.id
    WHERE s.status = 'expired'
    AND s.updated_at >= now() - INTERVAL '1 hour'
  LOOP
    -- Update all telegram memberships for this subscription
    FOR v_membership IN
      SELECT
        tm.id,
        tm.channel_id,
        tm.status
      FROM telegram_memberships tm
      WHERE tm.subscription_id = v_subscription.subscription_id
      AND tm.status IN ('joined', 'invited', 'pending')
    LOOP
      -- Update membership status to kicked
      UPDATE telegram_memberships
      SET
        status = 'kicked',
        updated_at = now()
      WHERE id = v_membership.id;

      v_kicked_count := v_kicked_count + 1;

      -- Add to details for bot processing
      v_details := v_details || jsonb_build_object(
        'subscription_id', v_subscription.subscription_id,
        'subscriber_name', v_subscription.subscriber_name,
        'telegram_username', COALESCE(v_subscription.telegram_username, 'N/A'),
        'analyst_name', v_subscription.analyst_name,
        'channel_id', v_membership.channel_id,
        'membership_id', v_membership.id,
        'expired_at', v_subscription.current_period_end,
        'action', 'kick_user'
      );
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_expired_count, v_kicked_count, v_details;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION send_subscription_warnings() TO service_role;
GRANT EXECUTE ON FUNCTION process_expired_subscriptions() TO service_role;