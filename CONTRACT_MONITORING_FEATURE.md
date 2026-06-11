# Contract Monitoring & Preparation (مراقبة وتجهيز العقد)

Prepare an options contract to **watch** with an execution range. The contract
is **not counted as a trade** until its live price reaches the range, at which
point the system auto-executes it at the **best price** as a brand-new trade and
sends an execution alert. If the price never reaches the range, it expires and
is never counted.

## Example

```
مراقبة وتجهيز عقد
CALL سترايك 7500
السعر الحالي: 6
رينج التنفيذ المقترح: 3.5 – 4
```

* A **preparation alert** (full details) is sent to Telegram immediately.
* When the price drops into `[3.5, 4]` the monitor enters the zone and starts
  tracking the **lowest** price seen.
* When the price **rebounds** off that low, **leaves the zone upward**, or the
  monitor **expires while in-zone**, the contract executes at the best price,
  becomes a live `active` trade, and an **execution alert** is sent.
* If the price never enters `[3.5, 4]` before expiry → marked `expired`,
  **never counted** as a trade.

## How it works

### Lifecycle

`status = 'monitoring'` with `monitor_status`:

```
watching ──(price ≤ exec_range_max)──► in_zone ──(rebound / leave-up / expiry)──► executed (status → active)
   └────────────(expiry, never in zone)────────────► expired   (never counted)
   └────────────(analyst cancels)──────────────────► cancelled (never counted)
```

Because `'monitoring'` is a dedicated status that **no stats / report query
references** (they all filter explicit `active / closed / tp_hit / sl_hit /
expired / suspended` lists), monitoring contracts are automatically excluded
from analyzer stats, win-rate and daily reports until — and unless — they
execute.

### "Best price" strategy

While the price is inside the execution range, the monitor records the running
**minimum** (`monitor_best_price`). It fills at that best price when the price
rebounds by `monitor_rebound_pct` (default 3%), leaves the zone upward, or the
monitor expires.

## Components

| Part | Path |
|------|------|
| DB migration (columns, RPCs, cron) | `supabase/migrations/20260611120000_add_contract_monitoring_system.sql` |
| Monitor edge function (cron, 1 min) | `supabase/functions/indices-contract-monitor/index.ts` |
| Create endpoint (monitoring mode) | `app/api/indices/trades/route.ts` (POST, `mode: 'monitoring'`) |
| Cancel endpoint | `app/api/indices/trades/[id]/monitor/route.ts` (DELETE) |
| Setup UI (toggle + execution range) | `components/indices/AddTradeForm.tsx` |
| Monitoring list section | `components/indices/TradesList.tsx` |
| Types | `services/indices/types.ts` |

### RPCs

* `execute_monitored_contract(p_trade_id, p_entry_price, p_underlying_price, p_underlying_snapshot, p_contract_snapshot)`
  — atomically converts a monitoring row into a live `active` trade at the best
  price. Idempotent (no-op if already executed). `service_role` only.
* `cancel_contract_monitoring(p_trade_id)` — owner/SuperAdmin cancels a monitor
  before it executes.

## Deployment

This feature requires **two deploy steps** beyond merging the code:

1. **Apply the migration** (adds columns/RPCs and schedules the cron job):
   ```
   supabase db push        # or apply 20260611120000_add_contract_monitoring_system.sql
   ```
2. **Deploy the edge function**:
   ```
   supabase functions deploy indices-contract-monitor --no-verify-jwt
   ```

The cron job (`indices-contract-monitor`, every minute) is created by the
migration and POSTs to the edge function using the existing
`app.settings.supabase_url` / `app.settings.supabase_service_role_key` settings,
matching the other indices cron jobs.

Required edge-function secrets (already used by the other indices functions):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POLYGON_API_KEY`,
`TELEGRAM_BOT_TOKEN` (or `admin_settings.telegram_bot_token`), `APP_BASE_URL`.
