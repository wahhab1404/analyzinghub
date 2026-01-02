/*
  # Fix Symbols RLS Policy Case Sensitivity

  ## Summary
  Fixes the RLS policy for symbols table to correctly check role names with proper case sensitivity.

  ## Problem
  The current policy checks for role names 'analyzer' and 'admin' (lowercase), but the actual role names 
  in the database are 'Analyzer' and 'SuperAdmin' (with capital letters). This causes attempts to create 
  symbols to fail when creating analyses.

  ## Changes
  1. Update the INSERT policy on symbols table to check for correct role names:
     - 'Analyzer' (capital A)
     - 'SuperAdmin' (capital S and A)

  ## Impact
  - Users with Analyzer or SuperAdmin roles will now be able to create symbols when creating analyses
  - No changes to other policies or table structure
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Analyzers can create symbols" ON symbols;

-- Recreate with correct role name casing
CREATE POLICY "Analyzers can create symbols"
  ON symbols FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name IN ('Analyzer', 'SuperAdmin')
    )
  );