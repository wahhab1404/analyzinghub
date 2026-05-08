/*
  # Alert Image URL column

  Stores the pre-generated Supabase Storage URL for the trade alert PNG.
  Set when the trade is created or activated. Used by the buy-range-alert-checker
  edge function to send a Telegram photo without needing to generate the image at
  alert time (eliminates the 3-8 s satori/WASM rendering from the alert path).
*/

ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS alert_image_url text;

COMMENT ON COLUMN index_trades.alert_image_url IS
  'Public Supabase Storage URL of the pre-generated alert PNG. '
  'Populated by POST /api/indices/trades/[id]/snapshot-image at trade creation/activation. '
  'When present, the buy-range-alert-checker uses sendPhoto with this URL instead of generating on demand.';
