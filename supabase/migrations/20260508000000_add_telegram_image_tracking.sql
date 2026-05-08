/*
  # Telegram Image Tracking + Contract Entry Price v2

  ## New columns on index_trades:

  ### Contract entry price (dual-price model)
  - `selected_market_price`   — live market price auto-captured at trade selection time (read-only)
  - analyzer_entry_price is mapped to existing `entry_price` column (already present, writable)

  ### Telegram image delivery tracking
  - `telegram_image_sent_at`  — UTC when image was successfully delivered to Telegram
  - `telegram_image_error`    — last image-generation or Telegram delivery error message

  ### Buy-range image dedup
  - `buy_range_image_sent`    — true once the buy-range alert image has been sent (separate from text flag)

  All columns are added with IF NOT EXISTS guards.
*/

-- ─── selected_market_price ───────────────────────────────────────────────────
-- Raw Polygon market price captured automatically when the analyst selects the
-- contract. Never overwritten after capture (represents "what the market said").
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS selected_market_price numeric(18,6);

-- Backfill from entry_price for any existing rows that already have one
UPDATE index_trades
SET selected_market_price = entry_price
WHERE selected_market_price IS NULL
  AND entry_price IS NOT NULL;

-- ─── telegram_image_sent_at ──────────────────────────────────────────────────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS telegram_image_sent_at timestamptz;

-- ─── telegram_image_error ────────────────────────────────────────────────────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS telegram_image_error text;

-- ─── buy_range_image_sent ────────────────────────────────────────────────────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS buy_range_image_sent boolean NOT NULL DEFAULT false;

-- ─── Performance indexes ─────────────────────────────────────────────────────

-- Fast look-up of trades that have never received a Telegram image
CREATE INDEX IF NOT EXISTS idx_index_trades_no_telegram_image
  ON index_trades (status, telegram_image_sent_at)
  WHERE status IN ('active', 'published') AND telegram_image_sent_at IS NULL;

-- ─── Comments ────────────────────────────────────────────────────────────────

COMMENT ON COLUMN index_trades.selected_market_price IS
  'Live Polygon market price auto-captured when the analyst creates the trade. '
  'Immutable after creation — represents the raw market snapshot. '
  'The analyst may set entry_price to a different value (their actual fill price).';

COMMENT ON COLUMN index_trades.telegram_image_sent_at IS
  'UTC timestamp when the Telegram contract alert image was successfully uploaded '
  'via sendPhoto. NULL = image not yet sent (either never attempted, pending, or failed).';

COMMENT ON COLUMN index_trades.telegram_image_error IS
  'Last error message from image generation or Telegram sendPhoto, if the delivery '
  'failed. Overwritten on each attempt. NULL = no error recorded.';

COMMENT ON COLUMN index_trades.buy_range_image_sent IS
  'True once the buy-range alert image has been sent via Telegram sendPhoto. '
  'Prevents re-sending the image on a duplicate run of the alert checker.';
