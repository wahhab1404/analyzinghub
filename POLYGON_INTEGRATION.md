# Polygon.io Integration Guide

## Overview

AnalyzingHub now uses Polygon.io API for real-time market data. This provides accurate, up-to-date prices for stocks and cryptocurrencies.

## API Key

The Polygon API key is already configured in `.env`:
```
POLYGON_API_KEY=jKbMRYMKztcbYVZylExoLutnJXeMlexe
```

## Supported Symbols

### Stocks
Use standard ticker symbols:
- `AAPL` - Apple Inc.
- `GOOGL` - Alphabet Inc.
- `MSFT` - Microsoft Corporation
- `TSLA` - Tesla, Inc.
- `AMZN` - Amazon.com, Inc.
- Any other US stock ticker

### Cryptocurrencies
Use the format `SYMBOL/USD`:
- `BTC/USD` - Bitcoin
- `ETH/USD` - Ethereum
- `SOL/USD` - Solana
- `MATIC/USD` - Polygon

The system automatically converts these to Polygon's format (e.g., `BTC/USD` → `X:BTCUSD`)

## How It Works

### 1. Price Validation Flow

1. User creates an analysis with a symbol (e.g., `AAPL`)
2. User clicks "Check Prices" button on the Feed page
3. System calls the `price-validator` edge function
4. Edge function:
   - Fetches all IN_PROGRESS analyses
   - Gets current price from Polygon.io for each symbol
   - Saves price snapshot to database
   - Checks if stop loss or targets are hit
   - Creates validation events if thresholds are crossed
   - Updates analysis status automatically

### 2. Provider Selection

The system uses a priority-based provider selection:

```
1. Try Polygon.io (if POLYGON_API_KEY is set)
   ↓
2. If Polygon fails, try Custom API (if PRICE_API_URL is set)
   ↓
3. Fallback to Mock Provider (simulated prices)
```

### 3. Timestamp Handling

Polygon returns timestamps in nanoseconds. The system automatically converts these to JavaScript Date objects:

```typescript
// Polygon timestamp (nanoseconds)
const polygonTimestamp = 1734700800000000000

// Convert to milliseconds for JavaScript
const jsDate = new Date(polygonTimestamp / 1000000)
```

## API Endpoints

### Polygon Last Trade Endpoint

The system uses Polygon's "Last Trade" endpoint:

```
GET https://api.polygon.io/v2/last/trade/{symbol}?apiKey={key}
```

#### Example Response

```json
{
  "status": "OK",
  "symbol": "AAPL",
  "results": {
    "p": 175.25,  // Price
    "t": 1734700800000000000,  // Timestamp (nanoseconds)
    "x": "NASDAQ"  // Exchange
  }
}
```

## Testing

### 1. Create a Test Analysis

1. Go to Dashboard → Create Analysis
2. Enter a symbol: `AAPL`
3. Set direction: Long
4. Set stop loss: `170.00`
5. Set target: `180.00`
6. Submit

### 2. Validate Prices

1. Go to Dashboard → Feed
2. Click "Check Prices" button
3. Watch for toast notification with results
4. See analysis card update with status badge

### 3. Monitor Price Snapshots

Price snapshots are saved in the `price_snapshots` table:

```sql
SELECT * FROM price_snapshots
ORDER BY timestamp DESC
LIMIT 10;
```

### 4. Check Validation Events

Validation events are saved in the `validation_events` table:

```sql
SELECT
  ve.*,
  a.direction,
  s.symbol
FROM validation_events ve
JOIN analyses a ON a.id = ve.analysis_id
JOIN symbols s ON s.id = a.symbol_id
ORDER BY ve.hit_at DESC;
```

## Error Handling

### Symbol Not Found

If a symbol doesn't exist on Polygon:

```
Error: Symbol XYZ not found on Polygon
```

The system logs the error and continues processing other symbols.

### API Rate Limits

Polygon free tier has rate limits. If exceeded:

```
Error: Polygon API error: 429 Too Many Requests
```

The system will automatically fall back to the mock provider.

### Network Issues

If Polygon API is unreachable:

```
Error: Failed to fetch: network timeout
```

The system falls back to mock provider and logs the error.

## Provider Comparison

| Feature | Polygon.io | Mock Provider |
|---------|-----------|---------------|
| Real-time data | ✅ Yes | ❌ No |
| Historical data | ✅ Yes | ❌ No |
| Accurate prices | ✅ Yes | ❌ Simulated |
| Rate limits | ⚠️ Yes (free tier) | ✅ Unlimited |
| Network required | ✅ Yes | ❌ No |
| Testing | ⚠️ Limited | ✅ Ideal |

## Troubleshooting

### Issue: Prices not updating

**Check:**
1. Is `POLYGON_API_KEY` set in `.env`?
2. Is the symbol valid? (Check Polygon docs)
3. Is it market hours? (Polygon returns last trade)
4. Check browser console for errors

### Issue: Validation not triggering

**Check:**
1. Is analysis status `IN_PROGRESS`?
2. Has price actually crossed the threshold?
3. Check validation_events table for errors
4. Review edge function logs in Supabase dashboard

### Issue: Getting mock prices instead of real prices

**Check:**
1. Verify `POLYGON_API_KEY` is set correctly
2. Check edge function logs for initialization errors
3. Ensure symbol format is correct
4. Try a well-known symbol like `AAPL`

## Best Practices

1. **Use Standard Symbols**: Stick to major stocks and cryptos
2. **Check Market Hours**: Stock prices only update during trading hours
3. **Monitor Rate Limits**: Free tier has limits, upgrade if needed
4. **Test with Mock First**: Use mock provider for development
5. **Handle Errors Gracefully**: System falls back automatically

## Resources

- [Polygon.io Documentation](https://polygon.io/docs)
- [Polygon API Reference](https://polygon.io/docs/stocks/getting-started)
- [Supported Symbols](https://polygon.io/stocks)
- [Rate Limits](https://polygon.io/pricing)

## Support

For issues with the Polygon integration:

1. Check edge function logs in Supabase dashboard
2. Review `price_snapshots` table for data
3. Check `validation_events` for validation errors
4. Review WEEK3_FEATURES.md for architecture details
