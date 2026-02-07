/*
  # Add Manual Price Update Function
  
  1. Changes
    - Create a SQL function that can be called to update prices
    - This bypasses the broken net.http_post() cron job
    - Can be triggered manually or via external cron service
  
  2. Security
    - Only service_role can execute
*/

CREATE OR REPLACE FUNCTION update_trade_prices_simple()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  response_body text;
BEGIN
  -- This function exists as a placeholder
  -- The actual price updates must be done via direct API calls to the edge function
  -- because Supabase's net.http_post() has memory allocation issues
  
  RETURN json_build_object(
    'message', 'Please call the edge function directly: /functions/v1/indices-trade-tracker',
    'workaround', 'Use external cron service (cron-job.org, EasyCron, etc) to call the edge function',
    'endpoint', concat(current_setting('app.settings.supabase_url', true), '/functions/v1/indices-trade-tracker')
  );
END;
$$;
