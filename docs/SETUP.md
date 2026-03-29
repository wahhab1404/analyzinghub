# SPX Intelligence Engine — Setup Guide

This guide covers everything needed to get the SPX Intelligence Engine running
from a fresh clone.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | 18.x | Required by Next.js App Router and crypto module |
| Package manager | npm 9+ or pnpm 8+ | pnpm is recommended for faster installs |
| Supabase project | Any plan | Free tier works for development; Pro recommended for production |
| Polygon.io API key | Starter plan or above | Options data requires the Options Add-on |
| Telegram bot token | — | Create via BotFather; needed for trade alerts |

---

## Environment Variables

Create a `.env.local` file in the project root.  Copy the block below and fill
in your values.  Never commit this file to version control.

```dotenv
# ── Supabase ──────────────────────────────────────────────────────────────────
# Found in: Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── Polygon.io ────────────────────────────────────────────────────────────────
# Found in: polygon.io → Dashboard → API Keys
# Must have the Options Add-on enabled for /v3/snapshot/options/* endpoints
POLYGON_API_KEY=your_polygon_key_here

# ── Alert flags ───────────────────────────────────────────────────────────────
# Set to "true" to suppress all outgoing Telegram messages (safe for dev/test)
SPX_ALERTS_SILENT=false

# Set to "true" to route alerts to test channels only (not production channels)
SPX_ALERTS_TEST=false
```

### Variable Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public Supabase project URL (safe to expose to browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (safe to expose to browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — bypasses RLS. Never expose to browser. |
| `POLYGON_API_KEY` | Yes | Required for live SPX price and options chain data |
| `SPX_ALERTS_SILENT` | No | `false` (default) — set `true` to disable all Telegram alerts |
| `SPX_ALERTS_TEST` | No | `false` (default) — set `true` to send alerts to test channels only |

---

## Database Setup

The engine requires several Supabase tables.  Run the SQL migrations in order.

### Step 1 — Locate migration files

```
supabase/migrations/
  ├── 0001_spx_core_tables.sql
  ├── 0002_spx_signal_events.sql
  ├── 0003_spx_wall_snapshots.sql
  ├── 0004_spx_trades.sql
  ├── 0005_spx_settings.sql
  ├── 0006_spx_score_snapshots.sql
  └── 0007_spx_alert_log.sql
```

### Step 2 — Apply migrations

**Option A — Supabase CLI (recommended)**

```bash
npx supabase db push
```

**Option B — Supabase Dashboard SQL editor**

Open each migration file and paste its contents into the SQL editor, running
them in numerical order.

### Step 3 — Verify tables

After migration, confirm the following tables exist in your Supabase project
(Table Editor or SQL `\dt`):

- `spx_trades`
- `spx_signal_events`
- `spx_wall_snapshots`
- `spx_score_snapshots`
- `spx_settings`
- `spx_alert_log`
- `spx_price_history`

### Step 4 — Seed settings

The engine reads its runtime configuration from a singleton `spx_settings` row.
The row is created automatically on the first Settings save via the UI, or you
can insert it manually:

```sql
INSERT INTO spx_settings DEFAULT VALUES;
```

---

## Installing Dependencies

```bash
npm install
# or
pnpm install
```

---

## Development Startup

```bash
npm run dev
```

The Next.js development server starts on `http://localhost:3000`.

---

## Accessing SPX Intelligence

Navigate to:

```
http://localhost:3000/spx
```

This is the main SPX Intelligence dashboard.  Sub-panels are accessible from
the navigation tabs within that route:

| Path | Panel |
|---|---|
| `/spx` | Live intelligence dashboard |
| `/spx?tab=trades` | Trade management |
| `/spx?tab=analytics` | Performance analytics |
| `/spx?tab=settings` | Engine settings |
| `/spx?tab=replay` | Historical replay |
| `/spx?tab=health` | System health monitor |

---

## First-Run Checklist

Work through this checklist after your first `npm run dev` to confirm everything
is connected correctly.

- [ ] **Environment variables loaded** — No red "Missing env var" banners in the
  console on startup.
- [ ] **Supabase connection** — Navigate to `/spx?tab=health`.  The Health panel
  should show "Supabase: Connected".
- [ ] **Polygon connection** — Trigger a manual engine run from the Settings
  panel.  The Health panel should show a recent `lastFeatureAt` timestamp with
  no Polygon error.
- [ ] **Settings row exists** — Open the Settings panel.  Default values should
  be displayed.  Save once to persist the row.
- [ ] **Engine enabled** — In Settings, enable the engine toggle.  Leave
  `paperMode: true` until you are satisfied with signal quality.
- [ ] **Telegram test** — Add a test Telegram channel in Settings → Telegram.
  Click "Send Test Alert".  Confirm the message arrives.
- [ ] **First signal** — During market hours, trigger a manual engine run.  A
  signal row should appear in the Live Intelligence panel and in the
  `spx_signal_events` table.
- [ ] **Trade created** — If the signal is above `minScoreToTrade`, a row should
  appear in the Trades panel in `detected` or `candidate` state.

---

## Verifying Polygon Options Access

The wall engine and contract ranker require Polygon's options snapshot endpoint:

```
GET /v3/snapshot/options/SPX
```

This endpoint requires the **Options Add-on** on your Polygon plan.  To verify
your key has access, run:

```bash
curl "https://api.polygon.io/v3/snapshot/options/SPX?limit=1&apiKey=YOUR_KEY"
```

A successful response returns `{ "results": [...], "status": "OK" }`.
A `403 Forbidden` response indicates the Options Add-on is not active on your
plan.

---

## Running Tests

```bash
# Run all Jest tests (requires jest to be installed)
npx jest services/spx/__tests__/

# Run a single test file
npx jest services/spx/__tests__/signal-scorer.test.ts

# Run with coverage
npx jest --coverage services/spx/__tests__/
```

The test suite covers pure scoring and calculation logic without requiring
Supabase or Polygon credentials.
