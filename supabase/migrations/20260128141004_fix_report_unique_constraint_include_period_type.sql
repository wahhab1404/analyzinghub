/*
  # Fix Report Unique Constraint to Include Period Type
  
  1. Changes
    - Drop the existing unique constraint on (report_date, author_id, language_mode)
    - Create a new unique constraint that includes period_type
    - This allows weekly, monthly, and daily reports to coexist for the same date
  
  2. Impact
    - Monthly and weekly reports will now be properly stored in history
    - Each period_type (daily, weekly, monthly, custom) can have its own report for the same date
*/

-- Drop the old unique constraint
ALTER TABLE daily_trade_reports 
  DROP CONSTRAINT IF EXISTS daily_trade_reports_report_date_author_lang_key;

-- Create new unique constraint including period_type
-- Default period_type to 'daily' for existing records if needed
UPDATE daily_trade_reports 
SET period_type = 'daily' 
WHERE period_type IS NULL;

-- Add the new unique constraint
ALTER TABLE daily_trade_reports 
  ADD CONSTRAINT daily_trade_reports_unique_report 
  UNIQUE (report_date, author_id, language_mode, period_type);
