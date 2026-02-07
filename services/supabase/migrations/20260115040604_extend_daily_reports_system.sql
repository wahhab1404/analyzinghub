/*
  # Extend Daily Reports System
  
  Adds comprehensive reporting features including:
  - PDF storage capability
  - Language support (Arabic/English/Dual)
  - Delivery tracking per channel
  - Per-analyst settings for automation
  
  Extends existing `daily_trade_reports` table and adds new supporting tables.
*/

-- Add new columns to existing daily_trade_reports table
ALTER TABLE daily_trade_reports 
  ADD COLUMN IF NOT EXISTS language_mode text CHECK (language_mode IN ('en', 'ar', 'dual')) DEFAULT 'dual',
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('pending', 'generating', 'generated', 'sent', 'failed')) DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS generated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN daily_trade_reports.language_mode IS 'Report language: en (English), ar (Arabic), or dual (both)';
COMMENT ON COLUMN daily_trade_reports.file_path IS 'Storage path for PDF file';
COMMENT ON COLUMN daily_trade_reports.file_url IS 'Signed URL or public URL for PDF access';
COMMENT ON COLUMN daily_trade_reports.status IS 'Generation and delivery status';

-- Create report_deliveries table for tracking Telegram sends
CREATE TABLE IF NOT EXISTS report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES daily_trade_reports(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  telegram_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_report ON report_deliveries(report_id);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_status ON report_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_channel ON report_deliveries(channel_id);

COMMENT ON TABLE report_deliveries IS 'Tracks Telegram delivery status for each report to each channel';

-- Create report_settings table for per-analyst configuration
CREATE TABLE IF NOT EXISTS report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  language_mode text NOT NULL DEFAULT 'dual' CHECK (language_mode IN ('en', 'ar', 'dual')),
  schedule_time time NOT NULL DEFAULT '16:30:00',
  timezone text NOT NULL DEFAULT 'Asia/Riyadh',
  default_channel_id text,
  extra_channel_ids text[] DEFAULT ARRAY[]::text[],
  last_generated_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(analyst_id)
);

CREATE INDEX IF NOT EXISTS idx_report_settings_analyst ON report_settings(analyst_id);
CREATE INDEX IF NOT EXISTS idx_report_settings_enabled ON report_settings(enabled);

COMMENT ON TABLE report_settings IS 'Per-analyst configuration for automated daily report generation';
COMMENT ON COLUMN report_settings.schedule_time IS 'Time to generate report (in specified timezone)';
COMMENT ON COLUMN report_settings.extra_channel_ids IS 'Additional Telegram channel IDs to send reports to';

-- Enable RLS on new tables
ALTER TABLE report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for report_deliveries

DROP POLICY IF EXISTS "Users can view own report deliveries" ON report_deliveries;
CREATE POLICY "Users can view own report deliveries"
  ON report_deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_trade_reports dtr
      WHERE dtr.id = report_deliveries.report_id
      AND (
        dtr.author_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN roles r ON p.role_id = r.id
          WHERE p.id = auth.uid()
          AND r.name = 'SuperAdmin'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Service role full access to deliveries" ON report_deliveries;
CREATE POLICY "Service role full access to deliveries"
  ON report_deliveries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for report_settings

DROP POLICY IF EXISTS "Analysts can view own settings" ON report_settings;
CREATE POLICY "Analysts can view own settings"
  ON report_settings FOR SELECT
  TO authenticated
  USING (
    analyst_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

DROP POLICY IF EXISTS "Analysts can manage own settings" ON report_settings;
CREATE POLICY "Analysts can manage own settings"
  ON report_settings FOR ALL
  TO authenticated
  USING (analyst_id = auth.uid())
  WITH CHECK (analyst_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all settings" ON report_settings;
CREATE POLICY "Admins can manage all settings"
  ON report_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'SuperAdmin'
    )
  );

DROP POLICY IF EXISTS "Service role full access to settings" ON report_settings;
CREATE POLICY "Service role full access to settings"
  ON report_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger for report_settings updated_at
CREATE OR REPLACE FUNCTION update_report_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_report_settings_timestamp ON report_settings;
CREATE TRIGGER trigger_update_report_settings_timestamp
  BEFORE UPDATE ON report_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_report_settings_updated_at();

-- Function to initialize report settings for analysts
CREATE OR REPLACE FUNCTION initialize_report_settings_for_analyst()
RETURNS TRIGGER AS $$
DECLARE
  role_name text;
BEGIN
  SELECT r.name INTO role_name
  FROM roles r
  WHERE r.id = NEW.role_id;
  
  IF role_name IN ('Analyzer', 'SuperAdmin') THEN
    INSERT INTO report_settings (analyst_id)
    VALUES (NEW.id)
    ON CONFLICT (analyst_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create settings for new analysts
DROP TRIGGER IF EXISTS auto_initialize_report_settings ON profiles;
CREATE TRIGGER auto_initialize_report_settings
  AFTER INSERT OR UPDATE OF role_id ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION initialize_report_settings_for_analyst();

-- Initialize settings for existing analysts
INSERT INTO report_settings (analyst_id)
SELECT p.id
FROM profiles p
JOIN roles r ON p.role_id = r.id
WHERE r.name IN ('Analyzer', 'SuperAdmin')
ON CONFLICT (analyst_id) DO NOTHING;