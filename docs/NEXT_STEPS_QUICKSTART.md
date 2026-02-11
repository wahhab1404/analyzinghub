# Next Steps - Quick Start Guide

## ✅ What's Already Done

1. **Database Schema** - Unified contract trades system with canonical P/L logic
2. **Canonical P/L Service** - Complete TypeScript service with all calculations
3. **Navigation** - Restructured sidebar with Companies and Indices Hub sections
4. **Translations** - English and Arabic labels for all new nav items
5. **Report Dedupe** - Database constraints to prevent duplicate trades

## 🎯 Priority 1: Complete Companies Section

### Step 1: Create Companies Routes

Create these files:

```
/app/dashboard/companies/page.tsx
- Search/explore companies
- List popular companies
- Recent company analyses

/app/dashboard/companies/analyses/page.tsx
- List all company analyses
- Filter by company, date, status
- Link to individual analysis pages
```

### Step 2: Add Options Trades to Company Analyses

Update: `/app/dashboard/analysis/[id]/page.tsx`

Add a new tab: "Options Trades"

Create components:
```
/components/companies/CompanyContractTradesTab.tsx
- Main tab component
- Shows list of trades
- Add trade button

/components/companies/CreateCompanyTradeDialog.tsx
- Form to create new contract trade
- Symbol, direction, strike, expiry
- Entry price, targets, stoploss
- Average entry adjustment prompt

/components/companies/CompanyTradesList.tsx
- Display trades with status
- Show P/L (using canonical service)
- Edit/close actions
```

### Step 3: Create API Endpoints

```typescript
// /app/api/companies/trades/route.ts
POST /api/companies/trades
- Create new company contract trade
- Insert into contract_trades with scope='company'
- Link to analysis_id

GET /api/companies/trades
- List trades for user
- Filter by company, status, analysis

// /app/api/companies/trades/[id]/route.ts
GET /api/companies/trades/[id]
- Get single trade details

PATCH /api/companies/trades/[id]
- Update trade (price, status)
- Recalculate canonical P/L

DELETE /api/companies/trades/[id]
- Soft delete trade
```

## 🎯 Priority 2: Update All P/L Calculations

### Files to Update:

1. **Dashboard Stats** - `/app/dashboard/page.tsx`
   - Replace P/L calculations with canonical service
   - Remove breakeven logic

2. **Profile Stats** - `/components/profile/ProfileStats.tsx`
   - Use canonical P/L for user stats
   - Win rate = wins / (wins + losses)

3. **Rankings** - `/services/scoring/scoring.service.ts`
   - Calculate points using canonical P/L
   - Update ranking calculations

4. **Reports** - `/services/indices/daily-report-generator.ts`
   - Apply canonical P/L to all trades in reports
   - Sum using pnl_value field
   - Count wins where is_win = true

### Example Update:

**Before:**
```typescript
const profit = (closePrice - entryPrice) * qty * multiplier
const status = profit > 0 ? 'win' : profit < 0 ? 'loss' : 'breakeven'
```

**After:**
```typescript
import { calculateCanonicalPnL } from '@/services/trades/canonical-pnl.service'

const result = calculateCanonicalPnL({
  entryPrice,
  maxPriceSinceEntry,
  contractsQty: qty,
  contractMultiplier: multiplier
})

const { pnlValue, isWin, outcome } = result
// outcome is 'WIN' or 'LOSS' - no breakevens!
```

## 🎯 Priority 3: Image Generation

### Create Playwright-Based Image Service

File: `/services/image/contract-image.service.ts`

```typescript
export async function generateContractImage(trade: ContractTrade): Promise<string> {
  // 1. Create HTML template with trade data
  // 2. Launch Playwright browser
  // 3. Render HTML to image
  // 4. Upload to Supabase Storage
  // 5. Return public URL

  // Support Arabic text rendering
  // Use proper RTL CSS
  // Format strike as "سترايك: ####"
}
```

### Create Edge Function

File: `/supabase/functions/generate-contract-image/index.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req: Request) => {
  // 1. Receive trade data
  // 2. Generate image using template
  // 3. Upload to storage
  // 4. Return URL

  // Handle retries
  // Log errors
  // Fallback to text-only
})
```

## 🎯 Priority 4: Report Deduplication

### Update Report Generator

File: `/services/indices/daily-report-generator.ts`

**Add dedupe logic:**
```typescript
// Before inserting trades into report_trades
const uniqueTrades = trades.reduce((acc, trade) => {
  const key = `${trade.id}-${trade.entry_time}`
  if (!acc.has(key)) {
    acc.set(key, trade)
  }
  return acc
}, new Map())

// Insert only unique trades
for (const trade of uniqueTrades.values()) {
  await insertReportTrade(reportId, trade)
}
```

### Create Backfill Script

File: `/scripts/dedupe-historical-reports.ts`

```typescript
// 1. Find all report_trades duplicates
// 2. Keep earliest created record
// 3. Delete duplicates
// 4. Log all changes
```

## 📝 Quick Reference: Canonical P/L Service

```typescript
import canonicalPnL from '@/services/trades/canonical-pnl.service'

// Calculate P/L
const result = canonicalPnL.calculateCanonicalPnL({
  entryPrice: 5.00,
  maxPriceSinceEntry: 6.50,
  contractsQty: 1,
  contractMultiplier: 100
})

console.log(result)
// {
//   pnlValue: 150,        // Profit since >= $100
//   isWin: true,
//   maxProfitValue: 150,
//   entryCostTotal: 500,
//   outcome: 'WIN'
// }

// Check if trade met threshold
const metThreshold = canonicalPnL.hasMetWinThreshold(metrics)

// Update high watermark
const { newHigh, isNewHigh } = canonicalPnL.updateHighWatermark(
  currentPrice,
  previousHigh
)

// Format for display
const formattedPnL = canonicalPnL.formatPnL(150) // "+$150.00"
const color = canonicalPnL.getOutcomeColor('WIN') // "green"
```

## 🗄️ Database Queries

### Create Company Trade
```sql
INSERT INTO contract_trades (
  scope,
  analysis_id,
  author_id,
  symbol,
  direction,
  strike,
  expiry_date,
  entry_price,
  contracts_qty,
  created_by
) VALUES (
  'company',
  'analysis-uuid',
  'user-uuid',
  'AAPL',
  'CALL',
  150.00,
  '2026-03-21',
  5.00,
  1,
  'user-uuid'
);
```

### Query Trades with Canonical P/L
```sql
SELECT
  id,
  symbol,
  strike,
  expiry_date,
  entry_price,
  max_price_since_entry,
  max_profit_value,  -- Generated column
  pnl_value,         -- Canonical P/L
  is_win,
  status,
  entry_cost_total   -- Generated column
FROM contract_trades
WHERE author_id = 'user-uuid'
AND scope = 'company'
AND status = 'ACTIVE';
```

### Get Win Rate
```sql
SELECT
  COUNT(*) FILTER (WHERE is_win = true) as wins,
  COUNT(*) FILTER (WHERE is_win = false) as losses,
  ROUND(
    COUNT(*) FILTER (WHERE is_win = true)::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as win_rate_percent
FROM contract_trades
WHERE author_id = 'user-uuid'
AND status IN ('CLOSED', 'EXPIRED');
```

## 🔄 Migration Path

### For Existing Index Trades

Create script: `/scripts/migrate-index-trades-to-canonical.ts`

```typescript
// 1. For each index_trade:
//    - Calculate max_profit_value
//    - Apply canonical P/L rules
//    - Update pnl_value and is_win
//    - Set win_threshold_met_at if applicable

// 2. Update all reports referencing these trades

// 3. Validate totals match expected values
```

## 🧪 Testing Checklist

- [ ] Create company trade via API
- [ ] Trade with $80 profit shows as LOSS
- [ ] Trade with $120 profit shows as WIN
- [ ] Expired trade with $60 profit shows as LOSS
- [ ] Average entry adjustment calculates correctly
- [ ] Reports show no duplicates
- [ ] Win rate excludes breakevens
- [ ] Dashboard stats use canonical P/L
- [ ] Telegram sends Arabic text correctly
- [ ] Images generate and display

## 📞 Support

If you encounter issues:

1. Check `/docs/RESTRUCTURING_PROGRESS.md` for overall status
2. Review canonical P/L service: `/services/trades/canonical-pnl.service.ts`
3. Check database migration: `/supabase/migrations/create_unified_contract_trades_system.sql`
4. Verify RLS policies are working correctly

---

**Remember:** The $100 threshold is MANDATORY. No breakevens. Only WIN or LOSS.
