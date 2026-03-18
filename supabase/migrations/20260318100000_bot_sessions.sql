-- Bot Sessions: stores per-user state for the interactive Telegram bot menu flow
CREATE TABLE IF NOT EXISTS bot_sessions (
  chat_id       TEXT        PRIMARY KEY,
  state         TEXT        NOT NULL DEFAULT 'IDLE',
  context       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_state      ON bot_sessions (state);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_updated_at ON bot_sessions (updated_at DESC);

-- Auto-maintain updated_at
CREATE OR REPLACE FUNCTION _bot_sessions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_sessions_updated_at ON bot_sessions;
CREATE TRIGGER trg_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW EXECUTE FUNCTION _bot_sessions_set_updated_at();

-- Purge sessions older than 24 h to keep the table lean
-- (call via a cron/edge-function or add a pg_cron job)
CREATE OR REPLACE FUNCTION purge_stale_bot_sessions()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM bot_sessions WHERE updated_at < NOW() - INTERVAL '24 hours';
$$;
