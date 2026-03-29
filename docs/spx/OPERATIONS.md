# SPX Intelligence Engine — Operations & Tuning Guide

## Engine Lifecycle

The intelligence engine runs on-demand, triggered by the frontend every 30 seconds via `GET /api/spx/signal`. Each run executes the full pipeline:

```
Feature Extraction → Wall Engine → Shock Engine → Signal Scorer
  → Contract Ranker → Engine State Upsert → Alert Dispatch → Trade Premium Refresh
```

Each step is independently fault-tolerant. Steps 7–8 (alerts, premium refresh) are wrapped in non-fatal try/catch, so a Telegram failure never blocks a signal run.

---

## Health Monitoring

### Health Panel (`/dashboard/indices/spx-intelligence` → Health tab)

Shows live status for:
- **Engine** — last run time, success rate, error count, current price/mode
- **Polygon Feed** — API key configured, last fetch timestamp, staleness
- **Database** — price history count, open trade count
- **Telegram** — channel count, alerts sent today
- **Data Quality** — grade (high/medium/low/offline), warnings

### Status Logic

| Status | Conditions |
|--------|-----------|
| `healthy` | Ran ≤5m ago, 0% errors, price data fresh |
| `degraded` | Ran ≤15m ago, or some errors (<20%), or data stale |
| `error` | >20% error rate in last 24h, or last run failed |
| `offline` | Not run in 15+ min, or no price history in DB |

---

## Settings Reference

All settings are stored in `spx_settings` (singleton row). They take effect on the **next engine run**.

### Engine Controls

| Setting | Default | Description |
|---------|---------|-------------|
| `engineEnabled` | `true` | Master switch. When false, the engine still runs but skips alert dispatch. |
| `paperMode` | `true` | Paper mode — trades are tracked but no real money involved. Shown in UI. |

### Score Thresholds

| Setting | Default | Description |
|---------|---------|-------------|
| `minScoreToAlert` | 60 | Minimum composite score (0–100) to trigger a Telegram alert |
| `minScoreToTrade` | 70 | Minimum composite score to recommend creating a trade |

**Tuning**: In volatile markets, lower thresholds increase signal frequency but raise false positives. In quiet markets, raise thresholds to filter noise.

### Contract Filters

| Setting | Default | Description |
|---------|---------|-------------|
| `minDelta` | 0.15 | Minimum absolute delta for contract selection |
| `maxDelta` | 0.60 | Maximum absolute delta (avoid deep ITM) |
| `maxSpreadPct` | 35% | Maximum bid-ask spread as % of mid price |
| `minOI` | 100 | Minimum open interest |
| `minVolume` | 50 | Minimum daily volume |
| `prefer0DTE` / `prefer1DTE` / `preferWeekly` | all true | Expiry preferences for contract ranker |
| `maxDTE` | 7 | Maximum days to expiry |

### Wall Sensitivity

| Setting | Default | Description |
|---------|---------|-------------|
| `wallStrengthThreshold` | 40 | Minimum wall strength score to report as a significant wall |
| `wallDistanceThreshold` | 20.0 | Minimum SPX points from price to qualify as a "nearby wall" |

**Tuning**: Lower `wallStrengthThreshold` surfaces more walls; higher value (60+) shows only dominant walls.

### Shock Thresholds

| Setting | Default | Description |
|---------|---------|-------------|
| `minShockSeverity` | `moderate` | Minimum severity to send shock alerts (`mild`/`moderate`/`severe`/`extreme`) |
| `minShockScore` | 30 | Minimum shock score (0–100) to dispatch alert |

### Flow Anomaly Sensitivity

| Setting | Default | Description |
|---------|---------|-------------|
| `flowAnomalySensitivity` | 1.0 | Multiplier for flow burst thresholds (0.5 = less sensitive, 2.0 = more sensitive) |

### Telegram Alert Controls

| Setting | Default | Description |
|---------|---------|-------------|
| `telegramEnabled` | `true` | Master Telegram switch |
| `telegramSendSignals` | `true` | New signal alerts |
| `telegramSendShock` | `true` | Shock/volatility alerts |
| `telegramSendWall` | `true` | Wall break/rejection alerts |
| `telegramSendTrade` | `true` | Trade lifecycle alerts (entry, targets, stop) |

### Deduplication Windows

Prevents the same alert type from firing multiple times in a short period.

| Setting | Default | Description |
|---------|---------|-------------|
| `dedupNewSignalS` | 300s | 5 min cooldown between new signal alerts |
| `dedupShockWarningS` | 180s | 3 min cooldown between shock alerts |
| `dedupWallAlertS` | 300s | 5 min cooldown between wall alerts |
| `dedupExitAlertS` | 120s | 2 min cooldown between exit alerts |

### Active Hours

The engine respects active hours for alert dispatch (not for signal generation).

| Setting | Default | Description |
|---------|---------|-------------|
| `activeHourStart` | 9 | Start hour (Eastern Time, 24h) — 9 = 9:00 AM ET |
| `activeHourEnd` | 16 | End hour — 16 = 4:00 PM ET |

### Data Quality

| Setting | Default | Description |
|---------|---------|-------------|
| `premiumSource` | `polygon` | Data source for live options premiums |
| `staleDataThresholdS` | 120s | Age at which price data is considered stale |

---

## Alert Flow

1. Engine generates signal with `compositeScore ≥ minScoreToAlert`
2. `shouldSendAlert()` checks:
   - `SPX_ALERTS_SILENT` env var
   - `SPX_ALERTS_TEST` env var (routes to test channels only)
   - `telegramEnabled` setting
   - Dedup cooldown from `spx_alert_log`
   - Active hours (ET)
3. If allowed: `getActiveAlertChannels()` fetches enabled channels
4. `getBotToken()` looks up bot token from DB
5. `sendMessage()` calls Telegram Bot API directly
6. `logAlert()` inserts to `spx_alert_log` with dedup key

---

## Replay / Backtest

The Replay tab fetches historical Polygon minute bars for any past trading day, overlaid with signals and trades stored in the database.

**Limitations:**
- Options chain data is **not** available historically (Polygon only provides live snapshots)
- Signal scores shown in replay are the **actual stored values** from when the signal ran, not reconstructed
- Wall snapshots from `spx_wall_snapshots` are used as-is

**Use cases:**
- Reviewing why a signal triggered on a specific day
- Checking price action vs signal timing
- Comparing realized price movement vs signal direction

---

## Database Maintenance

Two purge functions keep tables from growing unbounded:

```sql
-- Prune price history older than 4 hours (called per engine cycle)
SELECT purge_spx_price_history(4);

-- Prune engine run logs older than 7 days
SELECT purge_spx_engine_runs(7);
```

Recommend scheduling `purge_spx_engine_runs` as a daily Supabase Edge Function or cron job.

---

## Troubleshooting

### `GET /api/spx/signal` returns 503

1. Check browser Network → Response body for the error message
2. Common causes:
   - **"POLYGON_API_KEY not configured"** → set the env var in your hosting platform
   - **"No SPX snapshot returned from Polygon"** → market is closed; the engine now falls back to last stored price
   - **"Missing Supabase env vars"** → check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - **Module import error** → check deployment logs for TypeScript/build errors

### Alerts not sending

1. Check Health panel → Telegram status
2. Verify `telegramEnabled = true` in Settings
3. Check `spx_alert_log` for recent entries and suppression reasons
4. Verify `telegram_channels` has at least one row with `enabled = true`
5. Check `SPX_ALERTS_SILENT` env var is not set to `true`

### Stale data warnings

The engine falls back to the last stored price when Polygon is unavailable. The Health panel shows how stale the data is. During market hours, staleness > 2 minutes typically means a Polygon connectivity issue.
