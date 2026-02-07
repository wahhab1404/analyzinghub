/*
  # Fix Analyses INSERT RLS Policy

  ## Summary
  Fixes the RLS policy for analyses table to properly allow analyzers to create posts.

  ## Problem
  Users with Analyzer role are unable to create analyses due to RLS policy violations.
  The policy needs to be updated to correctly check for the Analyzer role.

  ## Changes
  1. Drop and recreate the INSERT policy with simplified and correct logic
  2. Ensure the policy checks for 'Analyzer' role (case-sensitive)
  3. Verify analyzer_id matches the authenticated user

  ## Security
  - Only authenticated users with Analyzer role can insert
  - Users can only insert analyses for themselves (analyzer_id must match auth.uid())
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Analyzers can create analyses" ON analyses;

-- Recreate with correct and simplified logic
CREATE POLICY "Analyzers can create analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (
    analyzer_id = auth.uid() AND
    EXISTS (
      SELECT 1 
      FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
        AND r.name = 'Analyzer'
    )
  );
