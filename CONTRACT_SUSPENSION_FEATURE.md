# Contract Suspension Feature | ميزة وقف العقود

Suspend a contract/trade so the platform **stops tracking it**, **sends a
Telegram alert** about the suspension, and removes it from every automated
price-update / auto-close job. Suspension is **manual** today, with the schema
and APIs already shaped to support **automatic** suspension rules later.

## How it works

A new lifecycle value — `suspended` (للعقود: `suspended` / SPX state:
`suspended`) — was added to every trade system. All price-tracking and
auto-close jobs only ever query the *live* statuses (`active`, `published`, and
the SPX `ACTIVE_STATES`), so flipping a contract to `suspended` removes it from
tracking **without any change to the trackers themselves**.

On suspension the platform:

1. Sets the status/state to `suspended` and records `suspended_at`,
   `suspended_by`, `suspension_reason`, and `suspension_mode` (`manual` | `auto`).
2. Sends a bilingual (AR/EN) Telegram notice to the trade's channel.
3. Stops appearing in the active-tracking queries → no further updates.

Resuming sets the status back to `active` and re-enables tracking (plus a
"resumed" Telegram notice).

## Covered systems

| System          | Table          | Suspend status | Manual UI                                  | API |
| --------------- | -------------- | -------------- | ------------------------------------------ | --- |
| Indices Hub     | `index_trades` | `suspended`    | `components/admin/TradesManagement.tsx`    | `POST /api/indices/trades/[id]/suspend` |
| Trades module   | `trades`       | `suspended`    | `components/trades/TradeCard.tsx`          | `POST /api/trades/[id]/suspend` |
| SPX engine      | `spx_trades`   | `suspended`    | `components/spx/ActiveTradesPanel.tsx`     | `POST /api/spx/trades/[id]/suspend` |

### API contract

All three endpoints accept the same body and require the trade owner or a
SuperAdmin (SPX: Analyzer or SuperAdmin):

```jsonc
POST /api/<system>/trades/[id]/suspend
{
  "action": "suspend",   // or "resume" (default: "suspend")
  "reason": "optional free-text shown in the alert"
}
```

## Database migrations

Two new migrations (apply in order):

1. `supabase/migrations/20260604119000_add_suspended_enum_values.sql`
   — adds the `suspended` value to `trade_status_enum` and `suspended`/`resumed`
   to `trade_alert_type_enum`. Must commit first (Postgres forbids using a new
   enum value in the same transaction that adds it).
2. `supabase/migrations/20260604120000_add_contract_suspension.sql`
   — extends the `index_trades` / `spx_trades` status CHECKs, adds the
   `suspended_*` audit columns to all three tables, widens the
   `telegram_outbox` and `spx_alert_log` alert-type CHECKs (`trade_suspended` /
   `trade_resumed`), and creates partial indexes for suspended-contract views.

> ⚠️ The feature only works once these migrations are applied to the database
> (`supabase db push`, or via the Supabase dashboard). Until then the
> `suspended` status/columns don't exist and suspend calls will error.

## Telegram plumbing

- **index_trades** → queued to `telegram_outbox` as `trade_suspended` /
  `trade_resumed`; the `telegram-outbox-processor` edge function renders the
  pre-built bilingual message.
- **trades module** → sent directly via `getBotToken` + `sendMessage`, message
  built by `buildTradeMessage('suspended' | 'resumed', …)`, logged in
  `trade_alerts`.
- **SPX** → `sendContractSuspendedAlert` / `sendContractResumedAlert` in
  `services/spx/spx-telegram.ts`, with cooldowns registered in
  `alert-controller.ts` and logged in `spx_alert_log`.

## Extending to automatic suspension (future)

The `suspension_mode = 'auto'` column is already in place. An automated rule
(e.g. stale price feed, approaching expiry, or a drawdown threshold) only needs
to set status → `suspended` with `suspension_mode = 'auto'` and call the same
alert helper; no tracker changes are required.
