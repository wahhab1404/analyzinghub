/*
  # Fix Indices Trade System - Complete Setup
  
  1. Simplify RLS Policies
    - Remove complex helper function checks
    - Allow any authenticated Analyzer to create trades
    
  2. Ensure indices reference data exists
  
  3. Add helpful views for debugging
*/

-- Drop and recreate simplified INSERT policy
DROP POLICY IF EXISTS "Admins and analyzers can create trades" ON index_trades;

CREATE POLICY "Analyzers can create trades for own analyses"
ON index_trades
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 
    FROM index_analyses 
    WHERE index_analyses.id = index_trades.analysis_id 
    AND index_analyses.author_id = auth.uid()
  )
);

-- Ensure indices reference data exists
INSERT INTO indices_reference (index_symbol, polygon_index_ticker, display_name, description, market)
VALUES
  ('SPX', 'I:SPX', 'S&P 500 Index', 'Standard & Poor''s 500 Index - broad US equity market', 'US'),
  ('NDX', 'I:NDX', 'NASDAQ 100 Index', 'NASDAQ 100 Technology Index', 'US'),
  ('DJI', 'I:DJI', 'Dow Jones Industrial Average', 'Dow Jones 30 Industrial Companies', 'US'),
  ('RUT', 'I:RUT', 'Russell 2000 Index', 'Russell 2000 Small Cap Index', 'US'),
  ('VIX', 'I:VIX', 'CBOE Volatility Index', 'Volatility Index', 'US')
ON CONFLICT (index_symbol) DO NOTHING;

-- Create helper view for debugging
CREATE OR REPLACE VIEW v_user_indices_permissions AS
SELECT 
  p.id as user_id,
  p.full_name,
  p.email,
  r.name as role_name,
  CASE 
    WHEN r.name IN ('SuperAdmin', 'Analyzer') THEN true
    ELSE false
  END as can_create_trades,
  (SELECT COUNT(*) FROM index_analyses WHERE author_id = p.id) as analyses_count,
  (SELECT COUNT(*) FROM index_trades WHERE author_id = p.id) as trades_count
FROM profiles p
JOIN roles r ON r.id = p.role_id;

-- Grant access to the view
GRANT SELECT ON v_user_indices_permissions TO authenticated;

COMMENT ON VIEW v_user_indices_permissions IS 'Helper view to debug user permissions for indices features';
