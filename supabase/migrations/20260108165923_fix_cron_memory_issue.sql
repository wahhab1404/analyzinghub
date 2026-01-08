/*
  # Fix Cron Job Memory Issues
  
  1. Changes
    - Add automatic cleanup job for net._http_response table
    - This table accumulates HTTP responses and causes memory issues
    - Clean up responses older than 30 minutes every 5 minutes
  
  2. Why This Fixes the Issue
    - The net.http_post() function creates entries in net._http_response
    - These accumulate over time and exhaust database memory
    - Regular cleanup prevents memory exhaustion
*/

-- First, remove existing cleanup job if it exists
SELECT cron.unschedule('cleanup-http-responses') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-http-responses'
);

-- Create new cleanup job
SELECT cron.schedule(
  'cleanup-http-responses',
  '*/5 * * * *',
  $$DELETE FROM net._http_response WHERE created < NOW() - INTERVAL '30 minutes'$$
);

-- Immediately clean up old responses
DELETE FROM net._http_response 
WHERE created < NOW() - INTERVAL '30 minutes';
