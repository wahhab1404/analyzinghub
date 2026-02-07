/*
  # Make expected_time nullable in analysis_targets

  ## Changes
  - Alter `analysis_targets` table to make `expected_time` column nullable
  - This allows targets to be saved without requiring an expected time
  
  ## Reason
  - Users should be able to set price targets without specifying when they expect them to be hit
  - The expected time is useful but should not be mandatory
*/

ALTER TABLE analysis_targets 
ALTER COLUMN expected_time DROP NOT NULL;