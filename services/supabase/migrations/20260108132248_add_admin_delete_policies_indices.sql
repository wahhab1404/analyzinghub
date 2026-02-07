/*
  # Add Admin Delete Policies for Indices Hub

  1. Changes
    - Add DELETE policies for index_analyses (admin only)
    - Add DELETE policies for index_trades (admin only)
    - Cascade deletion already exists (trades deleted when analysis deleted)

  2. Security
    - Only SuperAdmin role can delete analyses
    - Only SuperAdmin role can delete trades
    - Cascade deletion handles related records automatically
*/

-- Drop existing delete policies if any
DROP POLICY IF EXISTS "Admins can delete any analysis" ON index_analyses;
DROP POLICY IF EXISTS "Admins can delete any trade" ON index_trades;

-- Allow admins to delete any analysis
CREATE POLICY "Admins can delete any analysis"
  ON index_analyses
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

-- Allow admins to delete any trade
CREATE POLICY "Admins can delete any trade"
  ON index_trades
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );
