/*
  # Standalone Company Contract (Options) Deals

  Enables creating company options-contract deals directly ("new deal") without
  first creating a stock analysis, and adds the columns needed to track those
  contracts live (current price, high-watermark peak, image) exactly like index
  option trades.

  ## Changes
  1. Relax `valid_scope_analysis` so company-scope trades may have a NULL
     analysis_id (standalone deals). Index-scope already allowed NULL.
  2. Add live-tracking columns to `contract_trades`:
     - current_price        — latest option premium (Fly.io / cron updated)
     - underlying_price      — latest underlying stock price
     - last_price_update_at  — last time the price was refreshed
     - image_url             — generated shareable alert card
  3. Add `contract_trades` to the supabase_realtime publication so the deals
     dashboard receives live price/peak updates instantly.
  4. Ensure a public `trade-images` storage bucket exists for alert cards.

  Note: `max_price_since_entry` (the peak / القمة) already exists and drives the
  canonical P/L trigger.
*/

-- 1. Allow standalone company contract deals (analysis_id NULL)
ALTER TABLE contract_trades DROP CONSTRAINT IF EXISTS valid_scope_analysis;

-- 2. Live-tracking columns
ALTER TABLE contract_trades
  ADD COLUMN IF NOT EXISTS current_price numeric,
  ADD COLUMN IF NOT EXISTS underlying_price numeric,
  ADD COLUMN IF NOT EXISTS last_price_update_at timestamptz,
  ADD COLUMN IF NOT EXISTS image_url text;

-- 3. Realtime (live price/peak updates pushed to the dashboard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contract_trades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contract_trades;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- publication doesn't exist in this environment; ignore
  NULL;
END $$;

-- 4. Public storage bucket for generated alert images
INSERT INTO storage.buckets (id, name, public)
VALUES ('trade-images', 'trade-images', true)
ON CONFLICT (id) DO NOTHING;
