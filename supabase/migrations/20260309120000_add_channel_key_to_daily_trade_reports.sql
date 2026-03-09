/*
  # Add channel_key to daily_trade_reports

  1. Changes
    - Add `channel_key` column (text, NOT NULL, default '') to `daily_trade_reports`
    - Drop the old unique constraint `daily_trade_reports_unique_report`
    - Create a new unique constraint that includes `channel_key`

  2. Purpose
    - Enable per-channel reports: each (analyst, date, language, period, channel) combination
      gets its own stored report with only that channel's trades
    - `channel_key` stores the telegram_channel_id UUID as text, or '' for global reports
    - NULL-safe: avoids PostgreSQL unique constraint issues with nullable UUID columns

  3. Backward Compatibility
    - Existing reports have channel_key = '' (global scope) — unchanged behavior
    - New per-channel reports use channel_key = '<uuid>'
*/

-- Add channel_key column with default empty string (NULL-safe channel identifier)
ALTER TABLE daily_trade_reports
ADD COLUMN IF NOT EXISTS channel_key text NOT NULL DEFAULT '';

-- Backfill channel_key from telegram_channel_id for any rows that already have it set
UPDATE daily_trade_reports
SET channel_key = telegram_channel_id::text
WHERE telegram_channel_id IS NOT NULL AND channel_key = '';

-- Drop the old unique constraint (columns: report_date, author_id, language_mode, period_type)
ALTER TABLE daily_trade_reports
DROP CONSTRAINT IF EXISTS daily_trade_reports_unique_report;

-- Create new unique constraint including channel_key
ALTER TABLE daily_trade_reports
ADD CONSTRAINT daily_trade_reports_unique_report
  UNIQUE (report_date, author_id, language_mode, period_type, channel_key);

-- Add comment
COMMENT ON COLUMN daily_trade_reports.channel_key IS 'Telegram channel UUID as text, or empty string for global (all-channel) reports. Used in unique constraint.';
