/*
  # Indices Hub System - Complete Schema

  Creates comprehensive system for index trading analyses with live price tracking.
  Supports SPX, NDX, DJI indices with options and futures contracts.

  ## Tables
  1. indices_reference - Master data for supported indices
  2. index_analyses - Analyst-published chart analyses
  3. index_trades - Trade recommendations with live metrics
  4. analysis_updates - Timeline of analysis updates
  5. trade_updates - Timeline of trade updates

  ## Security
  - RLS enabled on all tables
  - Role-based access (SuperAdmin, Analyzer)
  - Subscription-based content access
  - Service role for pricing updates
*/

-- =====================================================
-- TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS indices_reference (
  index_symbol TEXT PRIMARY KEY,
  polygon_index_ticker TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  market TEXT DEFAULT 'US',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO indices_reference (index_symbol, polygon_index_ticker, display_name, description, market)
VALUES
  ('SPX', 'I:SPX', 'S&P 500 Index', 'Standard & Poor''s 500 Index - broad US equity market', 'US'),
  ('NDX', 'I:NDX', 'NASDAQ 100 Index', 'NASDAQ 100 Technology Index', 'US'),
  ('DJI', 'I:DJI', 'Dow Jones Industrial Average', 'Dow Jones 30 Industrial Companies', 'US')
ON CONFLICT (index_symbol) DO NOTHING;

CREATE TABLE IF NOT EXISTS index_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  index_symbol TEXT NOT NULL REFERENCES indices_reference(index_symbol) ON DELETE RESTRICT,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  chart_image_url TEXT,
  chart_embed_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'draft',
  views_count INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_visibility CHECK (visibility IN ('public', 'subscribers', 'admin_only')),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT require_chart CHECK (chart_image_url IS NOT NULL OR chart_embed_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_index_analyses_symbol ON index_analyses(index_symbol);
CREATE INDEX IF NOT EXISTS idx_index_analyses_author ON index_analyses(author_id);
CREATE INDEX IF NOT EXISTS idx_index_analyses_status ON index_analyses(status);
CREATE INDEX IF NOT EXISTS idx_index_analyses_published ON index_analyses(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_index_analyses_symbol_published ON index_analyses(index_symbol, published_at DESC NULLS LAST) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS index_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES index_analyses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  instrument_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  underlying_index_symbol TEXT NOT NULL REFERENCES indices_reference(index_symbol),
  polygon_underlying_index_ticker TEXT NOT NULL,
  polygon_option_ticker TEXT,
  strike NUMERIC(10, 2),
  expiry DATE,
  option_type TEXT,
  contract_multiplier INT DEFAULT 100,
  entry_underlying_snapshot JSONB NOT NULL,
  entry_contract_snapshot JSONB NOT NULL,
  current_underlying NUMERIC(10, 2),
  current_contract NUMERIC(10, 4),
  underlying_high_since NUMERIC(10, 2),
  underlying_low_since NUMERIC(10, 2),
  contract_high_since NUMERIC(10, 4),
  contract_low_since NUMERIC(10, 4),
  targets JSONB DEFAULT '[]'::jsonb,
  stoploss JSONB,
  notes TEXT,
  last_quote_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'tp_hit', 'sl_hit', 'closed', 'canceled')),
  CONSTRAINT valid_instrument CHECK (instrument_type IN ('options', 'futures')),
  CONSTRAINT valid_direction CHECK (direction IN ('call', 'put', 'long', 'short')),
  CONSTRAINT valid_option_type CHECK (option_type IS NULL OR option_type IN ('call', 'put')),
  CONSTRAINT options_require_details CHECK (
    instrument_type != 'options' OR (
      polygon_option_ticker IS NOT NULL AND
      strike IS NOT NULL AND
      expiry IS NOT NULL AND
      option_type IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_index_trades_analysis ON index_trades(analysis_id);
CREATE INDEX IF NOT EXISTS idx_index_trades_author ON index_trades(author_id);
CREATE INDEX IF NOT EXISTS idx_index_trades_status ON index_trades(status);
CREATE INDEX IF NOT EXISTS idx_index_trades_symbol ON index_trades(underlying_index_symbol);
CREATE INDEX IF NOT EXISTS idx_index_trades_published ON index_trades(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_index_trades_active ON index_trades(status, last_quote_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_index_trades_polygon_option ON index_trades(polygon_option_ticker) WHERE polygon_option_ticker IS NOT NULL;

CREATE TABLE IF NOT EXISTS analysis_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES index_analyses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_updates_analysis ON analysis_updates(analysis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_updates_author ON analysis_updates(author_id);

CREATE TABLE IF NOT EXISTS trade_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES index_trades(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachment_url TEXT,
  changes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_updates_trade ON trade_updates(trade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_updates_author ON trade_updates(author_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION indices_is_admin_or_analyzer(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON r.id = p.role_id
    WHERE p.id = user_id
    AND r.name IN ('SuperAdmin', 'Analyzer')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION indices_has_subscription(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = user_id
    AND status = 'active'
    AND current_period_end > now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION update_index_analysis_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE index_analyses
  SET updated_at = now()
  WHERE id = NEW.analysis_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION update_index_trade_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE index_trades
  SET updated_at = now()
  WHERE id = NEW.trade_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =====================================================
-- TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS update_analysis_on_update ON analysis_updates;
CREATE TRIGGER update_analysis_on_update
  AFTER INSERT ON analysis_updates
  FOR EACH ROW
  EXECUTE FUNCTION update_index_analysis_timestamp();

DROP TRIGGER IF EXISTS update_trade_on_update ON trade_updates;
CREATE TRIGGER update_trade_on_update
  AFTER INSERT ON trade_updates
  FOR EACH ROW
  EXECUTE FUNCTION update_index_trade_timestamp();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE indices_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_updates ENABLE ROW LEVEL SECURITY;

-- indices_reference policies
CREATE POLICY "Anyone can view indices reference"
  ON indices_reference FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can manage indices reference"
  ON indices_reference FOR ALL
  TO authenticated
  USING (indices_is_admin_or_analyzer(auth.uid()));

-- index_analyses policies
CREATE POLICY "Public can view published public analyses"
  ON index_analyses FOR SELECT
  TO public
  USING (status = 'published' AND visibility = 'public');

CREATE POLICY "Authenticated users can view published analyses"
  ON index_analyses FOR SELECT
  TO authenticated
  USING (
    status = 'published' AND (
      visibility = 'public' OR
      (visibility = 'subscribers' AND (indices_is_admin_or_analyzer(auth.uid()) OR indices_has_subscription(auth.uid()))) OR
      (visibility = 'admin_only' AND indices_is_admin_or_analyzer(auth.uid()))
    )
  );

CREATE POLICY "Authors can view own analyses"
  ON index_analyses FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Admins and analyzers can create analyses"
  ON index_analyses FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid() AND indices_is_admin_or_analyzer(auth.uid()));

CREATE POLICY "Authors can update own analyses"
  ON index_analyses FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete own analyses"
  ON index_analyses FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Service role can update analyses"
  ON index_analyses FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- index_trades policies
CREATE POLICY "Public can view trades from public analyses"
  ON index_trades FOR SELECT
  TO public
  USING (
    status IN ('active', 'tp_hit', 'sl_hit', 'closed') AND
    EXISTS (
      SELECT 1 FROM index_analyses
      WHERE index_analyses.id = index_trades.analysis_id
      AND index_analyses.status = 'published'
      AND index_analyses.visibility = 'public'
    )
  );

CREATE POLICY "Authenticated users can view trades"
  ON index_trades FOR SELECT
  TO authenticated
  USING (
    status IN ('active', 'tp_hit', 'sl_hit', 'closed') AND
    EXISTS (
      SELECT 1 FROM index_analyses
      WHERE index_analyses.id = index_trades.analysis_id
      AND index_analyses.status = 'published'
      AND (
        index_analyses.visibility = 'public' OR
        (index_analyses.visibility = 'subscribers' AND (indices_is_admin_or_analyzer(auth.uid()) OR indices_has_subscription(auth.uid()))) OR
        (index_analyses.visibility = 'admin_only' AND indices_is_admin_or_analyzer(auth.uid()))
      )
    )
  );

CREATE POLICY "Authors can view own trades"
  ON index_trades FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Admins and analyzers can create trades"
  ON index_trades FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    indices_is_admin_or_analyzer(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM index_analyses
      WHERE index_analyses.id = index_trades.analysis_id
      AND index_analyses.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update own trades"
  ON index_trades FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete own trades"
  ON index_trades FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Service role can update trade prices"
  ON index_trades FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- analysis_updates policies
CREATE POLICY "Users can view updates for public analyses"
  ON analysis_updates FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM index_analyses
      WHERE index_analyses.id = analysis_updates.analysis_id
      AND index_analyses.status = 'published'
      AND index_analyses.visibility = 'public'
    )
  );

CREATE POLICY "Authenticated users can view updates"
  ON analysis_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM index_analyses
      WHERE index_analyses.id = analysis_updates.analysis_id
      AND index_analyses.status = 'published'
      AND (
        index_analyses.visibility = 'public' OR
        (index_analyses.visibility = 'subscribers' AND (indices_is_admin_or_analyzer(auth.uid()) OR indices_has_subscription(auth.uid()))) OR
        (index_analyses.visibility = 'admin_only' AND indices_is_admin_or_analyzer(auth.uid()))
      )
    )
  );

CREATE POLICY "Authors can create updates on own analyses"
  ON analysis_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM index_analyses
      WHERE index_analyses.id = analysis_updates.analysis_id
      AND index_analyses.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can manage own updates"
  ON analysis_updates FOR ALL
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- trade_updates policies
CREATE POLICY "Users can view trade updates for public trades"
  ON trade_updates FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM index_trades
      JOIN index_analyses ON index_analyses.id = index_trades.analysis_id
      WHERE index_trades.id = trade_updates.trade_id
      AND index_trades.status IN ('active', 'tp_hit', 'sl_hit', 'closed')
      AND index_analyses.status = 'published'
      AND index_analyses.visibility = 'public'
    )
  );

CREATE POLICY "Authenticated users can view trade updates"
  ON trade_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM index_trades
      JOIN index_analyses ON index_analyses.id = index_trades.analysis_id
      WHERE index_trades.id = trade_updates.trade_id
      AND index_trades.status IN ('active', 'tp_hit', 'sl_hit', 'closed')
      AND index_analyses.status = 'published'
      AND (
        index_analyses.visibility = 'public' OR
        (index_analyses.visibility = 'subscribers' AND (indices_is_admin_or_analyzer(auth.uid()) OR indices_has_subscription(auth.uid()))) OR
        (index_analyses.visibility = 'admin_only' AND indices_is_admin_or_analyzer(auth.uid()))
      )
    )
  );

CREATE POLICY "Authors can create updates on own trades"
  ON trade_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM index_trades
      WHERE index_trades.id = trade_updates.trade_id
      AND index_trades.author_id = auth.uid()
    )
  );

CREATE POLICY "Authors can manage own trade updates"
  ON trade_updates FOR ALL
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('index-charts', 'index-charts', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('index-updates', 'index-updates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view index charts"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'index-charts');

CREATE POLICY "Admins and analyzers can upload index charts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'index-charts' AND indices_is_admin_or_analyzer(auth.uid()));

CREATE POLICY "Authors can delete own index charts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'index-charts' AND owner = auth.uid());

CREATE POLICY "Anyone can view index update attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'index-updates');

CREATE POLICY "Admins and analyzers can upload index update attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'index-updates' AND indices_is_admin_or_analyzer(auth.uid()));

CREATE POLICY "Authors can delete own index update attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'index-updates' AND owner = auth.uid());
