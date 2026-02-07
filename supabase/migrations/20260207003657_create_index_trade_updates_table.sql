/*
  # Create Index Trade Updates Table

  1. New Tables
    - `index_trade_updates`
      - `id` (uuid, primary key)
      - `trade_id` (uuid, foreign key to index_trades)
      - `update_type` (text) - Type of update: 'manual_high_edit', 'target_reached', 'status_change', etc.
      - `title` (text) - Short title for the update
      - `body` (text) - Detailed description
      - `changes` (jsonb) - JSON object with old/new values
      - `created_at` (timestamptz)
      - `created_by` (uuid, foreign key to profiles)
  
  2. Security
    - Enable RLS
    - Allow trade owners and admins to view updates
    - Only system and admins can insert updates

  3. Purpose
    - Audit trail for trade changes
    - Track manual high watermark edits
    - Log target reaches and status changes
*/

-- Create the index_trade_updates table
CREATE TABLE IF NOT EXISTS index_trade_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES index_trades(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  changes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_index_trade_updates_trade_id ON index_trade_updates(trade_id);
CREATE INDEX IF NOT EXISTS idx_index_trade_updates_created_at ON index_trade_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_index_trade_updates_update_type ON index_trade_updates(update_type);

-- Enable RLS
ALTER TABLE index_trade_updates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view updates for their own trades
CREATE POLICY "Users can view updates for their trades"
  ON index_trade_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM index_trades
      WHERE index_trades.id = index_trade_updates.trade_id
      AND index_trades.author_id = auth.uid()
    )
  );

-- Policy: Admins can view all updates
CREATE POLICY "Admins can view all updates"
  ON index_trade_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
      AND r.name IN ('SuperAdmin', 'Admin')
    )
  );

-- Policy: Service role can insert updates (for triggers and system operations)
CREATE POLICY "Service role can insert updates"
  ON index_trade_updates
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Admins can insert updates manually
CREATE POLICY "Admins can insert updates"
  ON index_trade_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
      AND r.name IN ('SuperAdmin', 'Admin')
    )
  );

-- Add helpful comments
COMMENT ON TABLE index_trade_updates IS 'Audit trail for index trade changes and updates';
COMMENT ON COLUMN index_trade_updates.update_type IS 'Type of update: manual_high_edit, target_reached, status_change, etc.';
COMMENT ON COLUMN index_trade_updates.changes IS 'JSON object containing old and new values for the change';
