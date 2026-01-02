/*
  # Fix Analyses RLS Policy Case Sensitivity

  ## Summary
  Fixes the RLS policy for analyses table to correctly check role names with proper case sensitivity.

  ## Problem
  The current policy checks for role names 'analyzer' and 'admin' (lowercase), but the actual role names 
  in the database are 'Analyzer' and 'SuperAdmin' (with capital letters). This causes all attempts to 
  create analyses to fail with an RLS policy violation.

  ## Changes
  1. Update the INSERT policy on analyses table to check for correct role names:
     - 'Analyzer' (capital A)
     - 'SuperAdmin' (capital S and A)

  ## Impact
  - Users with Analyzer or SuperAdmin roles will now be able to create analysis posts
  - No changes to other policies or table structure
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Analyzers can create analyses" ON analyses;

-- Recreate with correct role name casing
CREATE POLICY "Analyzers can create analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = analyzer_id AND
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name IN ('Analyzer', 'SuperAdmin')
    )
  );