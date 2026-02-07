/*
  # Add Trade Edit Audit and Telegram Dedupe Fields

  1. New Columns
    - `edited_by` - UUID of user who last edited the high watermark
    - `edited_at` - Timestamp of last manual edit
    - `previous_high_watermark` - Previous high value before edit (for audit)
    - `edit_reason` - Optional text explaining why high was edited
    - `last_telegram_high_sent` - Last high value sent to Telegram (dedupe)
    - `manually_edited_high` - Boolean flag if high was manually edited

  2. Purpose
    - Track who edited trades and when (audit trail)
    - Prevent duplicate Telegram notifications
    - Allow viewing edit history

  3. Security
    - Only trade creator or admin can edit
    - All edits are logged with timestamp and reason
*/

-- Add audit and dedupe fields to index_trades
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_trades' AND column_name = 'edited_by') THEN
    ALTER TABLE index_trades ADD COLUMN edited_by UUID REFERENCES profiles(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_trades' AND column_name = 'edited_at') THEN
    ALTER TABLE index_trades ADD COLUMN edited_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_trades' AND column_name = 'previous_high_watermark') THEN
    ALTER TABLE index_trades ADD COLUMN previous_high_watermark NUMERIC(10, 4);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_trades' AND column_name = 'edit_reason') THEN
    ALTER TABLE index_trades ADD COLUMN edit_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_trades' AND column_name = 'last_telegram_high_sent') THEN
    ALTER TABLE index_trades ADD COLUMN last_telegram_high_sent NUMERIC(10, 4);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_trades' AND column_name = 'manually_edited_high') THEN
    ALTER TABLE index_trades ADD COLUMN manually_edited_high BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN index_trades.edited_by IS 'User who last edited the high watermark manually';
COMMENT ON COLUMN index_trades.edited_at IS 'Timestamp of last manual high watermark edit';
COMMENT ON COLUMN index_trades.previous_high_watermark IS 'Previous high value before last edit (for audit)';
COMMENT ON COLUMN index_trades.edit_reason IS 'Optional reason for manual high watermark edit';
COMMENT ON COLUMN index_trades.last_telegram_high_sent IS 'Last high value sent to Telegram (prevents duplicate notifications)';
COMMENT ON COLUMN index_trades.manually_edited_high IS 'True if high watermark was manually edited by analyzer';

-- Create index for audit queries
CREATE INDEX IF NOT EXISTS idx_index_trades_edited_by ON index_trades(edited_by) WHERE edited_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_index_trades_edited_at ON index_trades(edited_at DESC NULLS LAST) WHERE edited_at IS NOT NULL;

-- Create function to log high watermark edits to trade_updates table
CREATE OR REPLACE FUNCTION log_high_watermark_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if high watermark changed and manually_edited_high is true
  IF NEW.manually_edited_high = true AND
     (OLD.contract_high_since IS DISTINCT FROM NEW.contract_high_since OR
      OLD.max_contract_price IS DISTINCT FROM NEW.max_contract_price) THEN

    INSERT INTO index_trade_updates (
      trade_id,
      update_type,
      title,
      body,
      changes
    ) VALUES (
      NEW.id,
      'manual_high_edit',
      'High Watermark Manually Edited',
      COALESCE(NEW.edit_reason, 'High watermark manually updated'),
      jsonb_build_object(
        'old_high', OLD.contract_high_since,
        'new_high', NEW.contract_high_since,
        'old_max_price', OLD.max_contract_price,
        'new_max_price', NEW.max_contract_price,
        'edited_by', NEW.edited_by,
        'edited_at', NEW.edited_at,
        'reason', NEW.edit_reason
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log edits
DROP TRIGGER IF EXISTS trigger_log_high_watermark_edit ON index_trades;
CREATE TRIGGER trigger_log_high_watermark_edit
  AFTER UPDATE ON index_trades
  FOR EACH ROW
  EXECUTE FUNCTION log_high_watermark_edit();