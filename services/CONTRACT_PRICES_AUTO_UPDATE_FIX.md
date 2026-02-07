# Contract Prices Auto-Update Fix

## Problem
In the "New Trade" dialog, when searching for option contracts, the prices were **not updating automatically**. They would only refresh when the user clicked "Search Contracts" again, causing stale prices to be displayed.

## Root Cause
The contract search fetched prices once from the Polygon API (with a 5-second cache), but there was **no auto-refresh mechanism** to keep the prices updated while the dialog remained open.

## Solution Implemented

### 1. Added Auto-Refresh Mechanism
- **Auto-refresh interval**: Prices now refresh every **10 seconds** automatically
- **Background updates**: Refreshes happen silently without showing loading UI
- **Cache bypass**: Uses `bypassCache=true` parameter to force fresh data from Polygon
- **Smart activation**: Only refreshes when contracts are displayed and search is not in progress

### 2. Added Live Price Indicator
- **Visual feedback**: Added a green pulsing badge that says "Live - Updated now/recently"
- **Real-time status**: Shows users that prices are actively updating
- **Appears in both views**: Added to both "Calls & Puts" view and single-type view

### 3. Implementation Details

**File Modified**: `components/indices/AddTradeForm.tsx`

**New Features**:
1. `lastPriceUpdate` state to track when prices were last refreshed
2. `refreshContractPrices()` function that silently fetches fresh prices
3. Auto-refresh useEffect hook that triggers every 10 seconds
4. Live update badge with green dot indicator

**Key Code**:
```typescript
// Auto-refresh contract prices every 10 seconds
useEffect(() => {
  if ((callsData.length > 0 || putsData.length > 0 || expirationGroups.length > 0) && !searchingContracts) {
    const refreshInterval = setInterval(() => {
      refreshContractPrices()
    }, 10000)

    return () => clearInterval(refreshInterval)
  }
}, [callsData.length, putsData.length, expirationGroups.length, searchingContracts, datePreset, showBothSides])
```

## How It Works

1. **Initial Search**
   - User clicks "Search Contracts"
   - Fetches contracts with prices from Polygon API
   - Displays results and sets `lastPriceUpdate` timestamp

2. **Auto-Refresh Cycle**
   - Every 10 seconds, `refreshContractPrices()` is called
   - Fetches fresh prices with `bypassCache=true`
   - Updates displayed prices without resetting user's selection
   - Updates `lastPriceUpdate` timestamp

3. **Visual Feedback**
   - Green pulsing badge shows "Live - Updated now" when recently refreshed
   - Badge changes to "recently" after 2 seconds
   - Pulsing animation indicates live data

## Benefits

- **Real-time accuracy**: Prices stay current while dialog is open
- **Better UX**: No need to manually re-search for fresh prices
- **Visual confidence**: Users can see prices are live and updating
- **Performance**: Silent background updates don't disrupt user experience
- **Smart fetching**: Only refreshes when contracts are displayed

## Testing

To verify the fix:

1. Open Indices Hub
2. Click "Add Trade" or create a standalone trade
3. Search for contracts (e.g., SPX Calls expiring this week)
4. Watch the prices:
   - Notice the green "Live" badge pulsing
   - Prices will update every 10 seconds
   - Badge shows "Updated now" when refresh occurs
5. Keep dialog open for 30+ seconds to see multiple updates

## Technical Notes

- **Refresh Rate**: 10 seconds (balances freshness with API rate limits)
- **Cache Bypass**: Forces fresh data on each refresh
- **Smart Cleanup**: Auto-refresh stops when dialog closes
- **Error Handling**: Silent failures prevent disruption
- **Selection Preserved**: User's selected contract remains highlighted during updates

## Related Files

- `components/indices/AddTradeForm.tsx` - Main form component
- `app/api/indices/contracts/route.ts` - Contract search API endpoint
- `services/indices/options-chain.service.ts` - Polygon options chain service

## Future Enhancements

Consider for future:
- WebSocket integration for real-time streaming (even faster updates)
- Configurable refresh interval in settings
- Highlight price changes (green for up, red for down)
- Show last price change amount in badge
