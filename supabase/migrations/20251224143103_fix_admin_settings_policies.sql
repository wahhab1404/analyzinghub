/*
  # Fix Admin Settings RLS Policies

  1. Changes
    - Drop existing RLS policies on admin_settings table
    - Create new policies that check for 'SuperAdmin' role instead of 'admin'
    - Ensure consistency with API authorization checks

  2. Security
    - Only SuperAdmin users can access admin settings
    - Maintains strict access control
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all settings" ON admin_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON admin_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON admin_settings;

-- SuperAdmin users can view all settings
CREATE POLICY "SuperAdmins can view all settings"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

-- SuperAdmin users can insert settings
CREATE POLICY "SuperAdmins can insert settings"
  ON admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

-- SuperAdmin users can update settings
CREATE POLICY "SuperAdmins can update settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );
