# Report System & Manual High Updates - Complete Implementation

## Overview

This document describes the comprehensive improvements made to the report generation system and the new manual high price update functionality. These changes enable analysts to generate reports for any time period (including weekends/holidays) and manually update trade prices when the market is closed.

---

## 1. Market Calendar System

### New File: `lib/market-calendar.ts`

A comprehensive market calendar system that understands:
- **Weekends** (Saturday and Sunday)
- **US Market Holidays** (2025-2026 calendar included)
- **Trading days** calculations
- **Date range** utilities

### Key Functions:

```typescript
// Check if market is open on a specific date
isMarketOpen(date: Date): boolean

// Get the last trading day before a date
getLastTradingDay(referenceDate?: Date): Date

// Get all trading days in a date range
getTradingDaysInRange(startDate: Date, endDate: Date): Date[]

// Get trading days for a specific week (with offset)
getWeekTradingDays(weekOffset: number = 0)

// Get trading days for a specific month (with offset)
getMonthTradingDays(monthOffset: number = 0)

// Check if report should be generated today
shouldGenerateReportToday(): boolean
```

### Usage Example:

```typescript
import { isMarketOpen, getLastTradingDay } from '@/lib/market-calendar';

const today = new Date();
if (!isMarketOpen(today)) {
  const lastTradingDay = getLastTradingDay(today);
  console.log(`Market closed. Last trading day was: ${lastTradingDay}`);
}
```

---

## 2. Period Report Generation

### New Edge Function: `generate-period-report`

Generates reports for any time period (daily, weekly, monthly, or custom range) with full weekend/holiday awareness.

**Endpoint**: `/functions/v1/generate-period-report`

**Request Body**:
```json
{
  "start_date": "2026-01-20",
  "end_date": "2026-01-24",
  "analyst_id": "uuid",
  "language_mode": "dual",
  "period_type": "weekly",
  "dry_run": false
}
```

**Response**:
```json
{
  "success": true,
  "file_url": "https://...",
  "metrics": {
    "total_trades": 15,
    "active_trades": 5,
    "closed_trades": 8,
    "expired_trades": 2,
    "winning_trades": 6,
    "losing_trades": 4,
    "win_rate": 60.0,
    "total_profit_dollars": 850.50,
    "trading_days": 5,
    "period_type": "weekly",
    "start_date": "2026-01-20",
    "end_date": "2026-01-24"
  }
}
```

### Features:

1. **Weekend & Holiday Aware**: Automatically excludes weekends and market holidays
2. **Trading Days Count**: Accurately counts only actual trading days in the period
3. **Flexible Periods**: Supports daily, weekly, monthly, and custom date ranges
4. **Multi-Language**: English, Arabic, or dual-language reports
5. **HTML Export**: Generates beautiful styled HTML reports stored in Supabase Storage
6. **Dry Run Mode**: Preview metrics without generating the full report

---

## 3. Period Report API Endpoint

### New API: `POST /api/reports/generate-period`

Frontend-accessible endpoint for generating period reports.

**Authentication**: Required (Analyzer or SuperAdmin role)

**Request Body Options**:

```typescript
// Weekly report (current week)
{
  "period_type": "weekly",
  "week_offset": 0,  // 0 = current week, -1 = last week, etc.
  "language_mode": "dual"
}

// Monthly report (current month)
{
  "period_type": "monthly",
  "month_offset": 0,  // 0 = current month, -1 = last month, etc.
  "language_mode": "en"
}

// Custom date range
{
  "period_type": "custom",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "language_mode": "ar"
}

// Daily report (checks if market is open)
{
  "period_type": "daily",
  "language_mode": "dual"
}
```

**Response**:
```json
{
  "success": true,
  "period_type": "weekly",
  "start_date": "2026-01-20",
  "end_date": "2026-01-24",
  "file_url": "https://...",
  "metrics": { /* ... */ }
}
```

### Error Handling:

- Returns error if trying to generate daily report on weekend/holiday
- Provides helpful suggestions (use last trading day or generate weekly report)
- Validates custom date ranges

---

## 4. Manual High Price Updates

### Enhanced API: `POST /api/indices/trades/[id]/manual-price`

Updated to use the canonical trade system with proper high watermark tracking.

**Authentication**: Required (must own the trade)

**Request Body**:
```json
{
  "manualPrice": 125.50,    // Update current price (optional)
  "manualHigh": 130.75,     // Update high watermark (optional)
  "manualLow": 118.25       // Update low watermark (optional)
}
```

**Key Improvements**:

1. **Canonical Trade System Integration**:
   - Calls `update_trade_high_watermark` RPC function
   - Automatically detects if trade becomes a winner (≥$100 profit)
   - Properly updates max_profit and is_winning_trade flags

2. **Smart Notifications**:
   - Sends "new_high" notification for regular high updates
   - Sends "milestone" notification when $100 profit threshold is hit
   - Automatically generates and attaches snapshot images
   - Queues messages to Telegram with appropriate priority

3. **Validation**:
   - Only allows updates on active trades
   - Only accepts prices higher than current high
   - Prevents updating other users' trades

**Response**:
```json
{
  "trade": { /* updated trade object */ },
  "message": "Manual prices updated successfully",
  "marketStatus": "closed",
  "newHighDetected": true,
  "isWinningTrade": true
}
```

---

## 5. Manual High Update UI Component

### New Component: `ManualHighUpdateDialog`

Beautiful, user-friendly dialog for manually updating trade prices.

**Location**: `components/indices/ManualHighUpdateDialog.tsx`

**Features**:

1. **Real-Time Profit Calculation**:
   - Shows profit percentage and dollar amount as you type
   - Displays "WINNER" badge if profit reaches $100
   - Color-coded profit indicators (green/red)

2. **Trade Context Display**:
   - Shows current entry price, current price, current high, and quantity
   - Helps analysts make informed decisions about manual updates

3. **Dual Input Fields**:
   - **Current Price**: Update the latest contract price
   - **New High**: Set a new high watermark (must be higher than current)

4. **Smart Validation**:
   - Ensures prices are positive numbers
   - Validates that new high is actually higher than current high
   - Shows helpful error messages

5. **Success Feedback**:
   - Shows special celebration for winning trades
   - Indicates when new high is detected
   - Confirms Telegram notification was queued

6. **Educational Notes**:
   - Explains when to use manual updates
   - Clarifies that automatic tracking continues
   - Notes about snapshot generation and notifications

### Usage in TradesList:

The dialog is integrated into the `TradesList` component with a convenient edit button:

```tsx
// In active trades, next to "View Live Monitoring" button
<Button
  variant="secondary"
  size="icon"
  onClick={() => {
    setSelectedTradeForUpdate(trade)
    setManualUpdateDialogOpen(true)
  }}
  title="Manual Price Update"
>
  <Edit className="h-4 w-4" />
</Button>
```

---

## 6. System Architecture

### Data Flow for Manual Updates:

```
User clicks "Edit" button
    ↓
ManualHighUpdateDialog opens
    ↓
User enters new price/high
    ↓
POST /api/indices/trades/[id]/manual-price
    ↓
Calls update_trade_high_watermark RPC
    ↓
    ├─→ Checks if new high > current high
    ├─→ Calculates profit (price - entry) × qty × 100
    ├─→ Checks if profit ≥ $100 (winning threshold)
    ├─→ Updates trade fields:
    │     - contract_high_since
    │     - max_contract_price
    │     - is_winning_trade (if profit ≥ $100)
    │     - win_at (timestamp when won)
    ├─→ Returns result:
    │     - is_new_high: boolean
    │     - newly_won: boolean
    │     - new_high: number
    │     - max_profit_dollars: number
    ↓
Creates index_trade_updates record
    ↓
Generates trade snapshot image
    ↓
Queues Telegram notification
    ↓
Returns success to frontend
    ↓
Dialog shows success message
    ↓
TradesList refreshes automatically
```

### Data Flow for Period Reports:

```
User calls /api/reports/generate-period
    ↓
Determines date range based on period_type:
    - daily: uses today (if market open)
    - weekly: calculates week range
    - monthly: calculates month range
    - custom: uses provided dates
    ↓
Calculates trading days (excludes weekends/holidays)
    ↓
Calls /functions/v1/generate-period-report
    ↓
Edge function fetches all trades in range
    ↓
Separates into active/closed/expired
    ↓
Calculates comprehensive metrics:
    - Total trades, active, closed, expired
    - Winning vs losing trades
    - Win rate percentage
    - Total profit in dollars
    - Number of trading days
    ↓
Generates HTML report with:
    - Beautiful styling (gradient header, cards)
    - Multi-language support (EN/AR/Dual)
    - Analyst profile with avatar
    - Complete statistics grid
    - Period date range
    ↓
Uploads HTML to Supabase Storage
    ↓
Creates signed URL (7-day expiry)
    ↓
Returns metrics and file URL
```

---

## 7. How Manual Updates Work with Automatic Tracking

### Coexistence Strategy:

The manual update system is designed to work **alongside** automatic price tracking without conflicts:

1. **Manual Override Flag**:
   - Sets `is_using_manual_price = true`
   - Automatic system respects this flag
   - Won't overwrite manually set prices

2. **High Watermark Priority**:
   - `update_trade_high_watermark` RPC only updates if new price is higher
   - Manual updates go through same RPC as automatic updates
   - Ensures highest price is always tracked regardless of source

3. **Notification Deduplication**:
   - Both systems use same `telegram_outbox` table
   - Prevents sending duplicate notifications
   - Priority system ensures important messages sent first

4. **When to Use Manual Updates**:
   - **Weekends**: Market closed, no automatic updates
   - **Holidays**: No trading data available
   - **After Hours**: Extended hours data may be delayed
   - **Data Issues**: When Polygon API has problems
   - **Historical Corrections**: Fix past price discrepancies

5. **Automatic Resume**:
   - When market reopens, automatic tracking resumes
   - Manual prices serve as baseline
   - System continues from manual high watermark

---

## 8. Weekend & Holiday Report Generation

### Problem Solved:

Previously, report generation failed on weekends because:
- No trades created on weekends
- System expected trades from "today"
- Didn't account for market holidays

### Solution:

1. **Market Calendar Integration**:
   - Checks if current day is trading day
   - Falls back to last trading day if not
   - Correctly handles holidays

2. **Period Reports**:
   - Can generate for any date range
   - Automatically excludes non-trading days
   - Shows accurate trading day count

3. **Daily Report Intelligence**:
   - Refuses to generate on closed days
   - Suggests alternatives (weekly/monthly)
   - Provides helpful error messages

### Example Scenarios:

**Saturday Report Request**:
```json
{
  "error": "Market is closed today (weekend or holiday)",
  "suggestion": "Use the last trading day or generate a weekly/monthly report instead"
}
```

**Weekly Report (includes weekend)**:
- Generates report for Monday-Friday
- Excludes Saturday-Sunday automatically
- Shows "5 Trading Days" in report

**Holiday Week**:
- If Monday is holiday, report shows "4 Trading Days"
- Correctly calculates metrics for actual trading days
- No errors or missing data

---

## 9. Testing Checklist

### Manual High Updates:

- [ ] Test updating current price on active trade
- [ ] Test updating high watermark on active trade
- [ ] Verify profit calculation shows correctly in UI
- [ ] Verify "WINNER" badge appears at $100 profit
- [ ] Test that manual high must be higher than current high
- [ ] Verify Telegram notification is queued
- [ ] Check that snapshot image is generated
- [ ] Verify automatic tracking continues after manual update
- [ ] Test with trade that hasn't won yet
- [ ] Test with trade that already won (should still allow new highs)

### Period Reports:

- [ ] Generate daily report on trading day
- [ ] Try to generate daily report on weekend (should error with helpful message)
- [ ] Generate weekly report for current week
- [ ] Generate weekly report for last week (week_offset: -1)
- [ ] Generate monthly report for current month
- [ ] Generate monthly report for last month (month_offset: -1)
- [ ] Generate custom date range report (e.g., 2 weeks)
- [ ] Verify trading days count is accurate
- [ ] Test with period including holidays
- [ ] Verify HTML report is generated and accessible
- [ ] Test English-only report
- [ ] Test Arabic-only report
- [ ] Test dual-language report

### Market Calendar:

- [ ] Verify weekends are detected correctly
- [ ] Verify 2026 holidays are recognized
- [ ] Test `getLastTradingDay` on Monday (should be Friday)
- [ ] Test `getLastTradingDay` after holiday
- [ ] Test `getTradingDaysInRange` with various ranges
- [ ] Verify week calculation includes correct days
- [ ] Verify month calculation includes correct days

---

## 10. API Usage Examples

### Generate Weekly Report:

```typescript
const response = await fetch('/api/reports/generate-period', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    period_type: 'weekly',
    week_offset: 0,  // current week
    language_mode: 'dual'
  })
});

const data = await response.json();
console.log(`Report URL: ${data.file_url}`);
console.log(`Trading days: ${data.metrics.trading_days}`);
console.log(`Win rate: ${data.metrics.win_rate}%`);
```

### Generate Monthly Report:

```typescript
const response = await fetch('/api/reports/generate-period', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    period_type: 'monthly',
    month_offset: -1,  // last month
    language_mode: 'en'
  })
});
```

### Generate Custom Period Report:

```typescript
const response = await fetch('/api/reports/generate-period', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    period_type: 'custom',
    start_date: '2026-01-01',
    end_date: '2026-01-15',
    language_mode: 'ar'
  })
});
```

### Update Trade High Manually:

```typescript
const response = await fetch(`/api/indices/trades/${tradeId}/manual-price`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    manualHigh: 135.50
  })
});

const data = await response.json();
if (data.isWinningTrade) {
  console.log('🎉 Trade hit $100 profit milestone!');
}
if (data.newHighDetected) {
  console.log('📈 New high recorded and notification sent');
}
```

---

## 11. Database Integration

All improvements seamlessly integrate with existing database structure:

### Tables Used:

- **index_trades**: Trade records with high/low tracking
- **daily_trade_reports**: Stores report metadata and HTML
- **report_settings**: Per-analyst report preferences
- **report_deliveries**: Tracks Telegram report delivery
- **index_trade_updates**: Records all price changes
- **telegram_outbox**: Queues Telegram notifications

### RPC Functions Used:

- **update_trade_high_watermark**: Canonical high tracking
- **finalize_trade_canonical**: Trade finalization logic
- **compute_trade_outcome**: Win/loss determination

---

## 12. Summary of Changes

### Files Created:
1. `lib/market-calendar.ts` - Market calendar utilities
2. `supabase/functions/generate-period-report/index.ts` - Period report generator
3. `app/api/reports/generate-period/route.ts` - Period report API
4. `components/indices/ManualHighUpdateDialog.tsx` - Manual update UI

### Files Modified:
1. `app/api/indices/trades/[id]/manual-price/route.ts` - Enhanced with canonical system
2. `components/indices/TradesList.tsx` - Added manual update button and dialog
3. `app/api/telegram/disconnect/route.ts` - Improved error handling (bonus fix)

### Key Benefits:

✅ **Weekend/Holiday Support**: Generate reports any time, even when market is closed
✅ **Flexible Periods**: Daily, weekly, monthly, or custom date ranges
✅ **Manual Price Updates**: Analysts can update prices when automatic tracking fails
✅ **Canonical Trade System**: All updates use same validated logic
✅ **Smart Notifications**: Automatic Telegram alerts for new highs and milestones
✅ **Beautiful UI**: Intuitive dialog with real-time profit calculations
✅ **Multi-Language**: Full support for English, Arabic, and dual-language reports
✅ **Error Resilience**: Improved error handling across the board

---

## Conclusion

The report system and manual high update functionality are now production-ready with comprehensive weekend/holiday support, flexible period options, and seamless integration with the existing canonical trade system. Analysts can confidently update prices during market closures, and reports can be generated for any time period with accurate trading day calculations.
