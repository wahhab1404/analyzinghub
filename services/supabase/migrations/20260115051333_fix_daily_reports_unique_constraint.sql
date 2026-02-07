/*
  # Fix Daily Reports Unique Constraint

  1. Changes
    - Add unique constraint on (report_date, author_id, language_mode)
    - This allows the upsert in the edge function to work correctly
    - Allows multiple reports per day per author for different languages
  
  2. Notes
    - The existing constraint on (report_date, telegram_channel_id) is kept
    - This supports both scenarios: reports for channels and reports for authors
*/

-- Add unique constraint on report_date, author_id, language_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'daily_trade_reports_report_date_author_lang_key'
  ) THEN
    ALTER TABLE daily_trade_reports 
    ADD CONSTRAINT daily_trade_reports_report_date_author_lang_key 
    UNIQUE (report_date, author_id, language_mode);
  END IF;
END $$;
