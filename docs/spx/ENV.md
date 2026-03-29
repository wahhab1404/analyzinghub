# SPX Intelligence Engine — Environment Variables Reference

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | `eyJhbGciOi...` |
| `POLYGON_API_KEY` | Polygon.io API key | `abc123xyz` |

## Optional — Alert Control

| Variable | Default | Description |
|----------|---------|-------------|
| `SPX_ALERTS_SILENT` | `false` | Set `true` to suppress **all** Telegram alert dispatch |
| `SPX_ALERTS_TEST` | `false` | Set `true` to send alerts only to channels where `audience_type = 'test'` |

## Optional — Supabase Alias

The service role client also accepts `SUPABASE_URL` as a fallback if `NEXT_PUBLIC_SUPABASE_URL` is not set:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Fallback Supabase URL (non-public environments) |

## Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It is **only** used server-side in Next.js API routes and services. Never expose it to the browser.
- `POLYGON_API_KEY` is server-side only (never prefixed with `NEXT_PUBLIC_`).
- All alert routing goes through `telegram_channels` in the database — no bot token in env vars.

## Bot Token Storage

Telegram bot tokens are stored in the `telegram_bots` (or `settings`) table, not in environment variables. The `getBotToken()` function in `lib/telegram/bot-sender.ts` looks up the token by URL + key lookup, falling back to a `TELEGRAM_BOT_TOKEN` env var if the DB has nothing.

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Fallback bot token if none is stored in the DB |
