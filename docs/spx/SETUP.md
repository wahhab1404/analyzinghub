# SPX Intelligence Engine — Setup Guide

## Prerequisites

- Node.js 18+
- A Supabase project (free tier works for development)
- A Polygon.io API key (free tier covers the endpoints used; paid tier for full options chain)
- (Optional) A Telegram bot token for alerts

---

## 1. Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Polygon.io
POLYGON_API_KEY=<your-polygon-api-key>

# SPX alert suppression (optional)
SPX_ALERTS_SILENT=false      # set true to suppress all Telegram alerts
SPX_ALERTS_TEST=false        # set true to send alerts only to channels with audience_type='test'
```

See [ENV.md](./ENV.md) for a full reference of every variable.

---

## 2. Database Migrations

All migrations live in `supabase/migrations/`. Run them in order:

| File | Description |
|------|-------------|
| `20260328000000_spx_intelligence_engine.sql` | Phase 2 tables: price_history, wall_snapshots, score_snapshots, signal_events, contract_candidates, engine_state |
| `20260328000001_spx_trade_lifecycle.sql` | Phase 3 tables: spx_trades, spx_exit_events, spx_alert_log |
| `20260329000000_spx_phase4.sql` | Phase 4 tables: spx_settings (singleton config), spx_engine_runs (audit log) |

### Apply via Supabase CLI

```bash
npx supabase db push
```

### Apply via Supabase Dashboard

Navigate to **SQL Editor** and paste each migration file in order.

---

## 3. Install Dependencies

```bash
npm install
```

---

## 4. Run Locally

```bash
npm run dev
```

Navigate to `/dashboard/indices/spx-intelligence`.

---

## 5. Access Control

The SPX Intelligence module is gated to users with the `Analyzer` or `SuperAdmin` role.

To grant access:

```sql
UPDATE profiles SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer') WHERE id = '<user-uuid>';
```

---

## 6. Telegram Alerts Setup

1. Create a Telegram bot via `@BotFather` → get a bot token.
2. Start a chat with your bot (or add it to a group/channel).
3. In the database, insert a row into `telegram_channels`:

```sql
INSERT INTO telegram_channels (channel_id, user_id, enabled, audience_type)
VALUES ('-1001234567890', '<your-user-uuid>', true, 'live');
```

4. In the platform Settings → Telegram, enable the alert types you want.

---

## 7. Running Tests

Tests live in `services/spx/__tests__/`. They use only pure functions (no DB or API calls):

```bash
# With Jest (if configured)
npx jest services/spx/__tests__/

# With tsx (run as scripts)
npx tsx services/spx/__tests__/signal-scorer.test.ts
```

---

## 8. Polygon API Limits

| Endpoint | Free Tier |
|----------|-----------|
| `/v3/snapshot?ticker.any_of=I:SPX` | 5 req/min |
| `/v3/snapshot/options/SPX` | 5 req/min |
| `/v2/aggs/ticker/I:SPX/range/1/minute/…` | Unlimited (delayed 15min) |

For real-time options chain data, a **Starter** ($29/mo) or **Developer** plan is needed.

The engine handles Polygon failures gracefully — it falls back to the last stored price from `spx_price_history` when Polygon is unavailable (e.g. weekends, market closed).
