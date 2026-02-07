/*
  # Week 2: Analysis Posts and Feed System

  ## Overview
  This migration creates the core schema for analysis posts, symbols, and targets.

  ## New Tables
  
  ### `symbols`
  - `id` (uuid, primary key) - Unique identifier
  - `symbol` (text, unique) - Trading symbol (e.g., "AAPL", "BTC/USD")
  - `created_at` (timestamptz) - Creation timestamp
  
  ### `analyses`
  - `id` (uuid, primary key) - Unique identifier
  - `analyzer_id` (uuid, foreign key to profiles) - Creator of the analysis
  - `symbol_id` (uuid, foreign key to symbols) - Trading symbol
  - `direction` (text) - Trade direction: "Long", "Short", or "Neutral"
  - `stop_loss` (numeric) - Stop loss price level
  - `chart_image_url` (text, nullable) - URL to uploaded chart image
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  
  ### `analysis_targets`
  - `id` (uuid, primary key) - Unique identifier
  - `analysis_id` (uuid, foreign key to analyses) - Parent analysis
  - `price` (numeric) - Target price level
  - `expected_time` (timestamptz) - Expected time to reach target
  - `created_at` (timestamptz) - Creation timestamp

  ## Security
  - RLS enabled on all tables
  - Symbols: Anyone authenticated can read, only analyzers can create
  - Analyses: Anyone authenticated can read, only analyzers can create/update their own
  - Targets: Anyone authenticated can read, only analyzers can manage their analysis targets

  ## Indexes
  - Index on analyses.analyzer_id for profile queries
  - Index on analyses.created_at for feed queries
*/

-- Create symbols table
CREATE TABLE IF NOT EXISTS symbols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol_id uuid NOT NULL REFERENCES symbols(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('Long', 'Short', 'Neutral')),
  stop_loss numeric NOT NULL,
  chart_image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create analysis_targets table
CREATE TABLE IF NOT EXISTS analysis_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  expected_time timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_analyses_analyzer_id ON analyses(analyzer_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_targets_analysis_id ON analysis_targets(analysis_id);

-- Enable RLS
ALTER TABLE symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_targets ENABLE ROW LEVEL SECURITY;

-- Symbols policies
CREATE POLICY "Anyone can read symbols"
  ON symbols FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Analyzers can create symbols"
  ON symbols FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN roles ON profiles.role_id = roles.id
      WHERE profiles.id = auth.uid()
      AND roles.name = 'Analyzer'
    )
  );

-- Analyses policies
CREATE POLICY "Anyone can read analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Analyzers can create analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (
    analyzer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      JOIN roles ON profiles.role_id = roles.id
      WHERE profiles.id = auth.uid()
      AND roles.name = 'Analyzer'
    )
  );

CREATE POLICY "Analyzers can update own analyses"
  ON analyses FOR UPDATE
  TO authenticated
  USING (analyzer_id = auth.uid())
  WITH CHECK (analyzer_id = auth.uid());

CREATE POLICY "Analyzers can delete own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING (analyzer_id = auth.uid());

-- Analysis targets policies
CREATE POLICY "Anyone can read analysis targets"
  ON analysis_targets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Analyzers can create targets for own analyses"
  ON analysis_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  );

CREATE POLICY "Analyzers can update targets for own analyses"
  ON analysis_targets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  );

CREATE POLICY "Analyzers can delete targets for own analyses"
  ON analysis_targets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  );

-- Trigger to update analyses.updated_at
CREATE TRIGGER update_analyses_updated_at
  BEFORE UPDATE ON analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();