# SPX Intelligence Engine — Operations Guide

This guide covers day-to-day operation of the SPX Intelligence Engine, from
understanding how it runs to managing trades and interpreting analytics.

---

## How the Engine Runs

The SPX Intelligence Engine is **request-triggered** — there is no persistent
background process or cron job.  Each engine cycle is initiated by an HTTP
request to:

```
POST /api/spx/signal
```

This design keeps the system stateless and compatible with serverless hosting
(Vercel, Netlify).  In practice, the dashboard triggers this endpoint
automatically when you load the `/spx` page and at configurable refresh
intervals.

**Manual trigger:** Click "Run Engine Now" in the Settings panel at any time.

---

## Engine Cycle Description

Each call to `/api/spx/signal` runs the following pipeline in sequence.
The total cycle typically completes in 1–4 seconds depending on Polygon API
response times.

```
1. Feature Extraction  (feature-extractor.ts)
   └── Fetch live SPX price from Polygon
   └── Load recent price history from spx_price_history
   └── Compute trends, momentum, session context, IV, flow
   └── Store price snapshot to spx_price_history

2. Wall Engine  (wall-engine.ts)
   └── Fetch full SPX options chain from Polygon
   └── Score every strike for OI/volume/gamma concentration
   └── Identify call wall (primary resistance) and put wall (primary support)
   └── Detect state changes (holding → approached → rejected/broken)
   └── Detect wall compression and migration
   └── Persist snapshot to spx_wall_snapshots

3. Shock Engine  (shock-engine.ts)
   └── Compute price velocity and acceleration from price history
   └── Score sudden repricing, flow burst, gamma acceleration
   └── Classify severity (none / mild / moderate / severe / extreme)

4. Signal Scorer  (signal-scorer.ts)
   └── Compute 8 sub-scores (structure, flow, gamma, wall, IV, execution, time, contract fit)
   └── Weight into composite score (0–100)
   └── Select signal type (BUY_CALL / BUY_PUT / WATCH / NO_TRADE / WARNING)
   └── Assign confidence class (A / B / C / D / E)
   └── Persist to spx_signal_events and spx_score_snapshots

5. Alert Controller  (alert-controller.ts)
   └── Check deduplication windows (prevent repeat alerts)
   └── Format and send Telegram alerts to configured channels
   └── Log to spx_alert_log

6. Trade Refresh  (trade-engine.ts)
   └── Advance candidate trades through state machine
   └── Refresh live premiums for active/entered trades
   └── Check stop/target conditions
   └── Compute unrealized P&L, MFE, MAE
```

---

## Settings Panel Guide

Navigate to `/spx?tab=settings`.

### Engine Section

| Setting | Default | Description |
|---|---|---|
| Engine Enabled | Off | Master switch. Must be enabled for signals to be generated. |
| Paper Mode | On | When enabled, trades are tracked but no real money is implied. Disable only when you are trading live. |

### Score Thresholds

| Setting | Default | Description |
|---|---|---|
| Min Score to Alert | 45 | Composite score (0–100) required to send a Telegram alert. |
| Min Score to Trade | 60 | Composite score required to create a trade row. Signals below this are logged but not tracked. |

### Contract Filters

| Setting | Default | Description |
|---|---|---|
| Min Delta | 0.15 | Minimum absolute delta for contract selection. |
| Max Delta | 0.55 | Maximum absolute delta. Keeps the contract in the directional sweet spot. |
| Max Spread % | 30% | Maximum bid-ask spread as a percentage of mid price. Filters illiquid contracts. |
| Min Open Interest | 100 | Minimum OI to consider a contract tradeable. |
| Min Volume | 10 | Minimum intraday volume. |

### Expiry Preferences

| Setting | Default | Description |
|---|---|---|
| Prefer 0DTE | On | Prioritise same-day expiry contracts. |
| Prefer 1DTE | Off | Prioritise next-day expiry. |
| Prefer Weekly | Off | Prioritise end-of-week expiry. |
| Max DTE | 7 | Hard limit on days-to-expiry. Contracts further out are excluded. |

### Wall Sensitivity

| Setting | Default | Description |
|---|---|---|
| Wall Strength Threshold | 40 | Minimum wall strength score (0–100) to treat a strike as a wall. |
| Wall Distance Threshold | 0.5% | Price must be within this percentage of the wall for state to change to "approached". |

### Shock Settings

| Setting | Default | Description |
|---|---|---|
| Min Shock Severity | moderate | Minimum shock severity to include in shock-mode alerts. |
| Min Shock Score | 50 | Minimum composite shock score (0–100) for shock-mode signal activation. |

### Flow Anomaly

| Setting | Default | Description |
|---|---|---|
| Flow Anomaly Sensitivity | 2.0 | Multiplier on rolling average volume to flag a burst. Higher = less sensitive. |

### Telegram

| Setting | Default | Description |
|---|---|---|
| Telegram Enabled | Off | Master switch for all Telegram output. |
| Send Signals | On | Send BUY/WATCH signal alerts. |
| Send Shock | On | Send SHOCK_WARNING alerts. |
| Send Wall | On | Send WALL_SHIFT_WARNING alerts. |
| Send Trade | On | Send trade entry/exit alerts. |

### Deduplication Windows

| Setting | Default | Description |
|---|---|---|
| New Signal Window | 300 s | Minimum seconds between identical signal-type alerts. |
| Shock Warning Window | 180 s | Minimum seconds between shock alerts. |
| Wall Alert Window | 600 s | Minimum seconds between wall-related alerts. |
| Exit Alert Window | 60 s | Minimum seconds between exit notifications. |

### Active Hours

| Setting | Default | Description |
|---|---|---|
| Active Hour Start | 9 (ET) | Engine ignores signals generated before this hour. |
| Active Hour End | 16 (ET) | Engine ignores signals generated after this hour. |

---

## Telegram Alert Setup

### Adding a Channel

1. Create a Telegram channel or group, or use an existing one.
2. Add your bot (created via BotFather) as an administrator.
3. Obtain the chat ID:
   - For public channels: use `@channel_username`.
   - For private groups/channels: forward a message to `@userinfobot` or use
     the Telegram Bot API: `GET /getUpdates` after sending a message to the group.
4. In the Settings panel → Telegram section, paste the chat ID and save.
5. Click "Send Test Alert" to verify delivery.

### Testing Alerts Without Affecting Production Channels

Set `SPX_ALERTS_TEST=true` in your `.env.local`.  When this flag is active,
all alerts are routed to channels marked as "test" in the channel configuration
and production channels receive nothing.

To completely silence all outgoing Telegram messages (e.g. during backfilling
historical data or bulk replays), set `SPX_ALERTS_SILENT=true`.

---

## Trade Management Workflow

### How Trades Are Created

The engine automatically creates a trade row when a signal exceeds
`minScoreToTrade` and the signal type is `BUY_CALL` or `BUY_PUT`.  The trade
starts in the `detected` state with an associated contract (from the contract
ranker) and a partial entry plan.

### Trade States

```
detected → candidate → confirmed → alerted → entered → active
                                                    ↓
                                           partially_exited
                                                    ↓
                                        closed_win / closed_loss

Any state → expired / invalidated / cancelled
```

| State | Meaning |
|---|---|
| detected | Trade created from signal; no manual action taken yet. |
| candidate | Trade has been reviewed by the operator. |
| confirmed | Entry plan computed; trade is ready to take. |
| alerted | Telegram alert sent to operator. |
| entered | Operator has entered the trade at the suggested zone. |
| active | Trade is live; premiums are being refreshed each cycle. |
| partially_exited | Partial position closed (e.g. taken T1 profit). |
| closed_win | Trade closed with positive P&L. |
| closed_loss | Trade closed with negative P&L. |
| expired | Trade expired without being entered (time stop reached). |
| invalidated | Trade thesis broken (stop condition triggered). |
| cancelled | Trade manually cancelled before entry. |

### Manually Advancing a Trade

From the Trades panel:

1. Click the trade row to expand its details.
2. Use the state action buttons (Confirm, Mark Entered, Close Win, Close Loss,
   Invalidate, Cancel) to advance the state.
3. When marking "entered", input the actual fill price to enable accurate P&L
   and MFE/MAE tracking.

### Closing a Trade

When you exit a position, click "Close Trade" on the trade row.  Enter:
- **Exit premium** — your actual fill price (per share, e.g. `3.50`).
- **Exit reason** — a short description (e.g. `T1 target hit`, `stop triggered`,
  `time stop`).

The engine will compute realized P&L and classify the outcome automatically.

---

## Replay / Backtest Workflow

The replay panel lets you step through historical SPX data to review how the
engine would have signalled on a past day.

Navigate to `/spx?tab=replay`.

### Starting a Replay

1. Select a date from the date picker (up to `replayDefaultDaysBack` days ago).
2. Click "Load Replay Data".  The engine fetches stored `spx_price_history`,
   `spx_wall_snapshots`, and `spx_signal_events` for that date.
3. Use the timeline scrubber or step-forward button to advance through the day
   minute by minute.
4. Each step re-renders the Intelligence panel as if that moment were live.

### Replay Speed

Set `replaySpeed` in Settings to control the automatic playback rate:
- `1.0` = real-time (1 second of replay time = 1 second of wall-clock time).
- `5.0` = 5× speed.
- `0.0` = step-by-step (no auto-advance; use the step button manually).

### What Replay Does Not Do

Replay renders stored snapshots — it does not re-run live Polygon API calls.
Signal scores shown in replay are the scores that were computed at the time,
not hypothetical recalculations.  Use replay to understand *what the engine saw
and decided*, not to tune parameters retroactively.

---

## Health Monitoring

Navigate to `/spx?tab=health`.

The Health panel displays the current engine state from `spx_engine_state` and
live connectivity checks.

### Indicators

| Indicator | Healthy Value | Action if Unhealthy |
|---|---|---|
| Supabase | Connected | Check `SUPABASE_SERVICE_ROLE_KEY` and project URL |
| Polygon | Connected | Check `POLYGON_API_KEY` and Options Add-on status |
| Last Feature | < 5 minutes ago | Run engine manually; check for Polygon 503 errors |
| Last Signal | < 15 minutes ago | Check `engineEnabled` setting and session hours |
| Last Wall | < 15 minutes ago | Check Polygon options chain access |
| Error Count | 0 | Inspect `lastError` field and application logs |
| Data Quality | high | Low quality indicates missing chain or price data |

### Stale Data Warning

A "Stale Data" warning appears when the last feature computation is older than
`staleDataThresholdS` seconds (default: 120 s).  This is normal outside market
hours.  During market hours, stale data indicates a connectivity or error issue.

---

## Analytics Interpretation Guide

Navigate to `/spx?tab=analytics`.

### Win Rate

```
Win Rate = (closed_win trades) / (closed_win + closed_loss trades) × 100
```

A win rate above 55% is generally considered positive for this type of
short-duration options strategy.  However, win rate alone is misleading — a
40% win rate with large winners can still be profitable.

### Expectancy

```
Expectancy = (Win Rate × Average Win %) - (Loss Rate × Average Loss %)
```

Positive expectancy means the strategy is profitable over a large enough sample.
A target expectancy of `> 0.10` (10 cents per dollar risked) is a reasonable
starting benchmark.

### MFE (Maximum Favorable Excursion)

MFE is the highest unrealized gain the trade achieved at any point during its
life, expressed as a percentage of entry premium.

```
MFE = (highest_premium - entry_premium) / entry_premium × 100
```

**How to use it:**
- A high average MFE relative to your average exit P&L suggests you are
  exiting too early.  Consider letting winners run to T2 or T3 before scaling out.
- A low average MFE with consistent losses suggests the signal quality is
  insufficient and the trade thesis is not playing out.

### MAE (Maximum Adverse Excursion)

MAE is the worst unrealized loss the trade saw at any point, expressed as a
percentage of entry premium.

```
MAE = (entry_premium - lowest_premium) / entry_premium × 100
```

**How to use it:**
- A high MAE on winning trades indicates the trade went against you before
  recovering.  This suggests your stop is well-placed (not too tight) but
  also that you are experiencing unnecessary drawdown.
- If average MAE is consistently close to your stop level (e.g. 35–40%),
  most stopped-out trades were already near the loss limit — the stop is
  calibrated correctly.
- If most winning trades have near-zero MAE, the entry timing is excellent.

### Composite Score vs Outcome

The analytics panel includes a score-vs-outcome scatter chart.  A well-tuned
engine should show a positive correlation: higher composite scores should
correlate with `big_win` and `small_win` outcomes.  If no correlation is
visible, the scoring weights may need recalibration (see TUNING.md).

---

## Troubleshooting Common Issues

### 503 on `/api/spx/signal`

**Cause:** The Polygon API is unreachable or returned an error.

**Checks:**
1. Confirm `POLYGON_API_KEY` is set correctly in `.env.local`.
2. Verify the Options Add-on is active: `GET /v3/snapshot/options/SPX?limit=1&apiKey=YOUR_KEY`
3. Check if the US equity market is open (weekday 9:30 AM–4:00 PM ET).  Polygon's
   options endpoints often return empty results outside market hours; the engine
   falls back to degraded mode but will not return 503 for this reason alone.
4. Check Polygon API status at `status.polygon.io`.

### No Telegram Alerts Received

**Checks (in order):**
1. Is `telegramEnabled` set to `true` in Settings?
2. Is `SPX_ALERTS_SILENT=true` in your environment?  If so, remove or set to `false`.
3. Is `SPX_ALERTS_TEST=true`?  If so, check your test channel instead of the
   production channel.
4. Does the signal score exceed `minScoreToAlert`?  Check the composite score in
   the Live Intelligence panel.
5. Is the deduplication window blocking the alert?  A signal of the same type
   sent within `dedupNewSignalS` seconds will be suppressed.  Check `spx_alert_log`
   to confirm the alert was generated but deduped.
6. Is your bot an administrator of the target channel with "Post Messages" permission?

### Empty Analytics Panel

**Cause:** No trades have reached a terminal state (`closed_win`, `closed_loss`).

Analytics are computed only over closed trades.  If all your trades are still
active or in `detected/candidate` state, the analytics will be empty.
Close (win or loss) at least one trade to populate the charts.

### Stale Data Warning During Market Hours

**Cause:** The engine has not completed a cycle recently.

**Checks:**
1. Confirm `engineEnabled` is `true` in Settings.
2. Confirm the current time is within `activeHourStart` and `activeHourEnd`.
3. Check the Health panel for a recent `lastError` value.
4. Trigger a manual engine run (Settings → "Run Engine Now") and check the
   browser Network tab for errors on the `/api/spx/signal` request.
5. Check server logs for `[FeatureExtractor]`, `[WallEngine]`, or `[SignalScorer]`
   error messages.
