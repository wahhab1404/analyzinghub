/*
  # Add period_type to daily_trade_reports

  1. Changes
    - Add `period_type` column to `daily_trade_reports` table
    - Add `start_date` and `end_date` columns for weekly/monthly reports
    - Set default value for existing records to 'daily'

  2. Purpose
    - Enable tracking of report type (daily, weekly, monthly, custom)
    - Store date range for period reports
    - Improve report listing UI with type information
*/

-- Add period_type column
ALTER TABLE daily_trade_reports
ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'custom'));

-- Add start_date and end_date for period reports
ALTER TABLE daily_trade_reports
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS end_date date;

-- Update existing records to set start_date and end_date based on report_date
UPDATE daily_trade_reports
SET 
  start_date = report_date,
  end_date = report_date
WHERE start_date IS NULL;

-- Add comment
COMMENT ON COLUMN daily_trade_reports.period_type IS 'Type of report: daily, weekly, monthly, or custom';
COMMENT ON COLUMN daily_trade_reports.start_date IS 'Start date of reporting period';
COMMENT ON COLUMN daily_trade_reports.end_date IS 'End date of reporting period';
