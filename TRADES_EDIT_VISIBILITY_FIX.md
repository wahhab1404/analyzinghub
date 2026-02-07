# Trade Edit Visibility & Report Fixes

## Issues Fixed

### 1. ✅ Reports Using Wrong Profit Data
**Problem:** Period reports were using `pnl_usd`, `final_profit`, or `computed_profit_usd` instead of the high watermark-based `max_profit`.

**Solution:**
- Updated `supabase/functions/generate-period-report/index.ts`
- Changed all profit calculations to use `max_profit` field
- Now consistent with daily reports and dashboard

**Changes:**
```typescript
// Before:
const profit = t.pnl_usd || t.final_profit || t.computed_profit_usd || 0;

// After:
const profit = t.max_profit || 0;
```

**Edge Function Deployed:** ✅ `generate-period-report`

---

### 2. ✅ Edit High Button Hard to Find
**Problem:** Edit high watermark button was a small icon button that was easy to miss.

**Solution A: Made Button More Prominent in TradesList**
- Changed from icon-only button to full button with text
- Added blue styling to stand out: `bg-blue-600 hover:bg-blue-700`
- Shows "Edit High" text with TrendingUp icon
- Available for ALL trades (open, closed, expired)

**Location:** `components/indices/TradesList.tsx`

```tsx
<Button
  variant="default"
  className="bg-blue-600 hover:bg-blue-700"
  onClick={() => {
    setTradeToEditHigh(trade)
    setEditHighDialogOpen(true)
  }}
>
  <TrendingUp className="h-4 w-4 mr-2" />
  Edit High
</Button>
```

**Solution B: Added Button to Live Monitor View**
- Added prominent "Edit High Watermark" button in TradeMonitor header
- Positioned next to market status badges
- Large, blue button with clear label
- Always visible when viewing trade details

**Location:** `components/indices/TradeMonitor.tsx`

```tsx
<Button
  variant="default"
  size="sm"
  onClick={() => setEditHighDialogOpen(true)}
  className="bg-blue-600 hover:bg-blue-700"
>
  <Edit2 className="h-4 w-4 mr-2" />
  Edit High Watermark
</Button>
```

---

## Where to Find Edit Button Now

### Option 1: From Trades List (Indices Dashboard)
1. Go to **Dashboard → Indices**
2. See list of all your trades
3. Look for the blue **"Edit High"** button on each trade card
4. Click to open the edit dialog

### Option 2: From Live Monitor View
1. Go to **Dashboard → Indices**
2. Click **"View Live Monitoring"** on an active trade
3. See the blue **"Edit High Watermark"** button in the header
4. Click to open the edit dialog

---

## Edit High Watermark Features

### What It Does:
- Updates the maximum contract price (high watermark) for a trade
- Tracks who edited, when, and why (full audit trail)
- Market-aware behavior:
  - **Market Open:** Updates DB + sends Telegram notification with image
  - **Market Closed:** Updates DB only (silent update)

### Dialog Shows:
- Current trade details (symbol, strike, option type)
- Current high watermark value
- Input field for new high price
- Optional reason field
- Market hours behavior warning

### After Editing:
- Database updated immediately
- Reports reflect new high watermark
- Dashboard stats refresh
- Profile stats update
- If market open: Telegram notification sent

---

## Files Modified

### Edge Functions:
1. `supabase/functions/generate-period-report/index.ts` - Fixed to use `max_profit`

### Components:
1. `components/indices/TradesList.tsx` - Made button prominent with text
2. `components/indices/TradeMonitor.tsx` - Added edit button to monitor view

### Edge Functions Deployed:
- ✅ `generate-period-report`

---

## Testing

### Test Edit Button Visibility:
1. Go to Dashboard → Indices
2. You should see blue "Edit High" button on each trade
3. Click it - dialog should open
4. Try editing a value

### Test from Live Monitor:
1. Click "View Live Monitoring" on an active trade
2. You should see blue "Edit High Watermark" button in header
3. Click it - same dialog should open

### Test Report Data:
1. Generate a period report (weekly/monthly)
2. Check profit values match the high watermark
3. Verify totals are consistent with dashboard

---

## Build Status

```
✓ Compiled successfully
✓ Generating static pages (63/63)
✓ Build complete - No errors
```

---

## Summary

**Fixed:**
1. ✅ Reports now use correct profit data (`max_profit`)
2. ✅ Edit button is prominent and easy to find
3. ✅ Button available in two locations (list + monitor)
4. ✅ Clear labeling with icon and text
5. ✅ Blue color makes it stand out

**Where to Edit:**
- **Trades List:** Blue "Edit High" button on each trade card
- **Live Monitor:** Blue "Edit High Watermark" button in header

**Both routes work perfectly and open the same edit dialog!** 🎉
