-- AI Analysis Results: persists every AI-generated analysis so a
-- public result page can be served without requiring user login.
CREATE TABLE IF NOT EXISTS ai_analysis_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT        UNIQUE NOT NULL,
  analysis_type  TEXT        NOT NULL
                   CHECK (analysis_type IN ('financial','technical','quick_summary','compare')),
  ticker         TEXT,
  company_name   TEXT,
  market         TEXT,
  language       TEXT        NOT NULL DEFAULT 'en',
  chat_id        TEXT,                        -- Telegram chat_id that requested it
  result         JSONB       NOT NULL,         -- full structured AI response
  telegram_preview TEXT,                       -- short preview text shown in Telegram
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ                   -- optional; NULL = never expires
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_slug    ON ai_analysis_results (slug);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_ticker  ON ai_analysis_results (ticker);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_type    ON ai_analysis_results (analysis_type);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_created ON ai_analysis_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_chat    ON ai_analysis_results (chat_id);

-- No login required; anyone with the slug can read the record
ALTER TABLE ai_analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read ai_analysis_results"
  ON ai_analysis_results FOR SELECT
  USING (true);

-- Only service-role (backend) may insert / update / delete
CREATE POLICY "service role write ai_analysis_results"
  ON ai_analysis_results FOR ALL
  USING (auth.role() = 'service_role');
