# Manual Price Override & RTH Tracking System

This feature allows analyzers to manually set strike prices when markets are closed (outside RTH) while using live prices during regular trading hours.

## Features

### 1. **Automatic RTH Detection**
- System automatically detects Regular Trading Hours (9:30 AM - 4:00 PM ET, Mon-Fri)
- During RTH: Uses live Polygon API prices
- Outside RTH: Allows manual price overrides

### 2. **Manual Price Override (Outside RTH Only)**
Analyzers can manually set:
- **Contract Price**: Override current contract price
- **Contract High**: Update the highest price reached
- **Contract Low**: Update the lowest price reached

### 3. **Automatic RTH Tracking**
- During RTH, system automatically:
  - Fetches live prices from Polygon API
  - Updates highs and lows
  - Clears manual override flags
  - Tracks last RTH update timestamp

### 4. **Manual High/Low Updates**
- Analyzers can manually update highs/lows anytime (even during RTH)
- Useful for catching peaks outside automated tracking

## API Endpoints

### Check Market Status
```http
GET /api/indices/market-status
```

**Response:**
```json
{
  "isOpen": false,
  "status": "closed",
  "canSetManualPrice": true,
  "message": "Manual price override available outside RTH"
}
```

### Set Manual Prices (Outside RTH Only)
```http
POST /api/indices/trades/[tradeId]/manual-price
```

**Request Body:**
```json
{
  "manualPrice": 5.75,
  "manualHigh": 6.25,
  "manualLow": 5.50
}
```

**Success Response:**
```json
{
  "trade": { ... },
  "message": "Manual prices updated successfully",
  "marketStatus": "closed"
}
```

**Error (During RTH):**
```json
{
  "error": "Cannot set manual prices during RTH. Live prices are being tracked.",
  "marketStatus": "open"
}
```

### Update Trade Highs/Lows (Anytime)
```http
PATCH /api/indices/trades/[tradeId]
```

**Request Body:**
```json
{
  "manualContractHigh": 6.50,
  "manualContractLow": 5.25
}
```

## Database Fields

### New Fields in `index_trades`
- `manual_contract_price` - Manual price set by analyzer (outside RTH)
- `manual_contract_high` - Manually updated high price
- `manual_contract_low` - Manually updated low price
- `is_using_manual_price` - Boolean flag (true when using manual price)
- `last_rth_tracking_at` - Timestamp of last RTH price update

## How It Works

### During RTH (9:30 AM - 4:00 PM ET)
1. Trade tracker runs every minute
2. Fetches live prices from Polygon API
3. Updates `current_contract` and `current_underlying`
4. Tracks highs and lows automatically
5. Sets `is_using_manual_price = false`
6. Updates `last_rth_tracking_at` timestamp

### Outside RTH
1. If analyzer sets manual price:
   - `manual_contract_price` is stored
   - `current_contract` is updated to manual price
   - `is_using_manual_price = true`
2. Trade tracker respects manual prices
3. No live price fetching (saves API calls)

### Manual High/Low Updates
- Analyzer can set `manualContractHigh` or `manualContractLow`
- These override tracked highs/lows
- Useful for:
  - Capturing peaks during low-liquidity periods
  - Correcting tracking errors
  - Recording prices from other sources

## Usage Examples

### Example 1: Set Manual Price After Hours
```javascript
// Check market status first
const status = await fetch('/api/indices/market-status');
const { isOpen, canSetManualPrice } = await status.json();

if (canSetManualPrice) {
  // Set manual price
  await fetch(`/api/indices/trades/${tradeId}/manual-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manualPrice: 5.75,
      manualHigh: 6.00
    })
  });
}
```

### Example 2: Update High During Trading
```javascript
// Update high even during RTH
await fetch(`/api/indices/trades/${tradeId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    manualContractHigh: 7.50
  })
});
```

## Security & Validation

### Authorization
- Only trade owner (analyzer) can set manual prices
- Must be authenticated
- Trade must be in `active` status

### Validation
- Manual prices must be positive numbers
- Cannot set manual price during RTH
- System validates market hours in real-time

### RTH Detection
- Uses US Eastern Time (America/New_York)
- Excludes weekends (Saturday/Sunday)
- Market hours: 9:30 AM - 4:00 PM ET

## Benefits

1. **Cost Savings**: No unnecessary API calls outside RTH
2. **Accuracy**: Analyzer can correct prices during low-liquidity periods
3. **Flexibility**: Manual override when automated tracking is insufficient
4. **Automatic**: Seamlessly switches between manual and live prices
5. **Transparent**: Tracks when manual prices are used vs. live prices

## Edge Function Updates

The `indices-trade-tracker` edge function has been updated to:
- Check market hours before fetching prices
- Respect manual price overrides outside RTH
- Clear manual flags during RTH
- Track manual highs/lows alongside automated tracking

## Best Practices

1. **Use Manual Override Sparingly**: Only when live tracking isn't available
2. **Check Market Status**: Always verify market status before setting manual prices
3. **Update Highs**: If you notice a new high, update it manually for accuracy
4. **Document Changes**: The system automatically creates trade updates when manual prices are set
5. **Trust RTH Tracking**: During market hours, let the system handle price updates automatically

## Troubleshooting

### "Cannot set manual prices during RTH"
- Error occurs when trying to set manual price during trading hours
- Wait until market closes (after 4:00 PM ET)
- Or use manual high/low updates instead

### Manual Price Not Updating
- Ensure trade status is `active`
- Verify you're the trade owner
- Check authentication token is valid

### Prices Reset to Live
- This is normal behavior when RTH starts
- Manual prices are automatically replaced with live prices
- Manual override flag is cleared

## Future Enhancements

Potential improvements:
- Email notifications when manual override needed
- Suggested manual prices based on last known value
- Historical tracking of manual vs. live price periods
- UI indicators showing when manual prices are active
