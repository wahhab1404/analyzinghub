-- ============================================================================
-- Peak Alert Telegram Message Tracking
-- Records the Telegram message_id (and chat_id) of the live "قمة جديدة" /
-- new-high alert so the tracker can EDIT it in place when a higher peak is
-- reached, instead of posting a brand-new message. This keeps the Telegram
-- alert in sync with the platform's live contract_high_since (which updates on
-- every new peak) without spamming the channel.
-- ============================================================================

DO $$
BEGIN
  -- Telegram message_id of the most recent new-high alert for this trade.
  -- NULL = no editable new-high message exists yet (next high posts fresh).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'peak_alert_message_id'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN peak_alert_message_id TEXT DEFAULT NULL;
  END IF;

  -- Telegram chat_id the new-high message was delivered to (needed to edit it).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'peak_alert_chat_id'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN peak_alert_chat_id TEXT DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN index_trades.peak_alert_message_id IS
  'Telegram message_id of the live new-high ("قمة جديدة") alert. The tracker '
  'edits this message in place when a higher peak is reached so the channel '
  'mirrors the platform''s live high. NULL until the first new-high alert is sent.';

COMMENT ON COLUMN index_trades.peak_alert_chat_id IS
  'Telegram chat_id the new-high alert was delivered to, used as the edit target '
  'for subsequent in-place updates of peak_alert_message_id.';
