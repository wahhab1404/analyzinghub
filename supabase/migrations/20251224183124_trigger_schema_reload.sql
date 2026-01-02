/*
  # Trigger schema cache reload
  
  1. Purpose
    - Force PostgREST to reload schema cache
    - This ensures the API recognizes all tables
  
  2. Changes
    - Add comment to roles table to trigger reload
*/

-- Trigger schema cache reload by modifying table comment
COMMENT ON TABLE roles IS 'User roles for RBAC system';

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
