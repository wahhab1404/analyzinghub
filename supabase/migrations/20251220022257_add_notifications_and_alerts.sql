/*
  # Add Notifications and Alert Preferences

  ## Overview
  Adds notification system for price alerts when targets or stop losses are hit.

  ## New Tables

  ### notification_preferences
  User preferences for receiving notifications
  - id (uuid, primary key) - Unique identifier
  - user_id (uuid, foreign key) - References profiles table
  - alerts_enabled (boolean) - Master switch for all alerts
  - target_alerts_enabled (boolean) - Enable notifications when target is hit
  - stop_alerts_enabled (boolean) - Enable notifications when stop loss is hit
  - created_at (timestamptz) - Creation timestamp
  - updated_at (timestamptz) - Last update timestamp

  ### notifications
  Stores all user notifications
  - id (uuid, primary key) - Unique identifier
  - user_id (uuid, foreign key) - References profiles table
  - analysis_id (uuid, foreign key) - References analyses table
  - type (text) - Notification type (target_hit, stop_hit, comment, like)
  - title (text) - Notification title
  - message (text) - Notification message
  - is_read (boolean) - Read status
  - created_at (timestamptz) - Creation timestamp

  ## Security
  - Enable RLS on both tables
  - Users can only view/manage their own notifications and preferences

  ## Notes
  - Notifications are in-app only (no email/SMS for MVP)
  - Alert checking will be handled by edge function
*/

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  alerts_enabled boolean DEFAULT true,
  target_alerts_enabled boolean DEFAULT true,
  stop_alerts_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('target_hit', 'stop_hit', 'comment', 'like', 'follow', 'repost')),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification_preferences
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update notification_preferences.updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create default notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default notification preferences
CREATE TRIGGER on_profile_created_notification_preferences
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();