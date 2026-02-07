/*
  # Create Daily Trade Reports Table
  
  1. New Table
    - `daily_trade_reports`
      - Stores generated HTML reports for daily trades
      - One report per channel per day
      
  2. Security
    - Enable RLS
    - Allow service role full access
    - Allow users to view their own channel reports
*/

CREATE TABLE IF NOT EXISTS daily_trade_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  telegram_channel_id uuid REFERENCES telegram_channels(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  html_content text NOT NULL,
  image_url text,
  trade_count integer DEFAULT 0,
  summary jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(report_date, telegram_channel_id)
);

-- Enable RLS
ALTER TABLE daily_trade_reports ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role has full access to reports"
  ON daily_trade_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view reports for their own channels
CREATE POLICY "Users can view own channel reports"
  ON daily_trade_reports
  FOR SELECT
  TO authenticated
  USING (
    author_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM telegram_channels
      WHERE telegram_channels.id = daily_trade_reports.telegram_channel_id
      AND telegram_channels.user_id = auth.uid()
    )
  );

-- Indexes for faster queries
CREATE INDEX idx_daily_reports_date ON daily_trade_reports(report_date DESC);
CREATE INDEX idx_daily_reports_channel ON daily_trade_reports(telegram_channel_id);
CREATE INDEX idx_daily_reports_author ON daily_trade_reports(author_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_daily_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_reports_timestamp
  BEFORE UPDATE ON daily_trade_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_reports_updated_at();

COMMENT ON TABLE daily_trade_reports IS 'Stores daily trade summary reports for each channel';
COMMENT ON COLUMN daily_trade_reports.html_content IS 'Generated HTML report content';
COMMENT ON COLUMN daily_trade_reports.image_url IS 'URL to generated report image (if created)';
COMMENT ON COLUMN daily_trade_reports.summary IS 'JSON summary of trade statistics';
