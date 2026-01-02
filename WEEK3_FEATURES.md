# Week 3: Price Tracking and Validation System

## Overview

Week 3 implements a comprehensive price tracking and validation system that automatically monitors analyses and determines their success or failure based on real-time price movements.

## Architecture

### Components

1. **Database Schema**
   - `price_snapshots` - Historical price data
   - `validation_events` - Audit log of validation events
   - `analyses.status` - Analysis status (IN_PROGRESS, SUCCESS, FAILED)
   - `analyses.validated_at` - Timestamp of validation

2. **Price Provider Layer** (`services/price/`)
   - Abstract `PriceProvider` interface
   - `PolygonPriceProvider` - Live market data from Polygon.io API
   - `MockPriceProvider` - Development/testing provider with simulated price movements
   - `ApiPriceProvider` - Stub for custom API integration
   - `PriceService` - Main service coordinating price operations

3. **Validation Service** (`services/validation/`)
   - Logic for determining if stop loss or targets are hit
   - Handles different trade directions (Long/Short)
   - Creates immutable validation events

4. **Edge Function** (`price-validator`)
   - Serverless function that runs validation cycles
   - Fetches all IN_PROGRESS analyses
   - Gets current prices and checks against targets/stop loss
   - Creates validation events and saves price snapshots
   - Can be triggered manually or via cron

5. **UI Components**
   - Status badges (In Progress, Success, Failed)
   - Visual indicators for hit targets/stop loss
   - Price validation trigger button
   - Toast notifications

## Validation Logic

### Trade Direction: Long

- **Stop Loss Hit**: Current price <= stop_loss → FAILED
- **Target Hit**: Current price >= target_price → SUCCESS

### Trade Direction: Short

- **Stop Loss Hit**: Current price >= stop_loss → FAILED
- **Target Hit**: Current price <= target_price → SUCCESS

### Priority Rules

1. First hit wins (stop loss or target)
2. Targets are checked in order (TP1, TP2, TP3)
3. Once validated, status cannot change
4. All events are immutable audit logs

## Usage

### Manual Validation

1. Navigate to the Feed page
2. Click "Check Prices" button
3. System fetches current prices for all IN_PROGRESS analyses
4. Validation events are created automatically
5. UI refreshes to show updated statuses

### Automated Validation (Future)

The edge function can be triggered via:
- Supabase Cron Jobs
- External webhooks
- Scheduled tasks

### API Endpoint

```bash
POST /api/validate-prices
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "results": {
    "checked": 5,
    "validated": 2,
    "errors": []
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Database Triggers

The system uses a PostgreSQL trigger to automatically update analysis status when a validation event is created:

```sql
CREATE TRIGGER trigger_update_analysis_status
  AFTER INSERT ON validation_events
  FOR EACH ROW
  EXECUTE FUNCTION update_analysis_status_on_validation();
```

This ensures:
- Deterministic status updates
- Data consistency
- Audit trail preservation

## Security

### Row Level Security (RLS)

- **price_snapshots**: All authenticated users can read (market data is public)
- **validation_events**: Users can read events for analyses they can access
- **System writes**: Handled via service role key in edge function

### Constraints

- No manual status overrides
- No editing of validation events
- Status transitions are one-way: IN_PROGRESS → (SUCCESS | FAILED)

## Testing

### Test Flow

1. Create an analysis with:
   - Symbol: AAPL
   - Direction: Long
   - Stop Loss: $170
   - Target: $180

2. Trigger validation multiple times
3. Mock provider simulates price movements
4. Observe status changes and badges

### Edge Function Testing

```bash
# Via API
curl -X POST https://<project>.supabase.co/functions/v1/price-validator \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json"
```

## Future Enhancements

Not implemented in Week 3 (as per requirements):
- Alerts/notifications
- Search functionality
- Subscriptions
- Admin moderation tools

## Code Quality

- **Deterministic**: All validation logic is reproducible
- **Auditable**: Complete event history preserved
- **Type-safe**: Full TypeScript coverage
- **Testable**: Abstract provider layer for mocking
- **Scalable**: Edge function can handle high load

## Files Created/Modified

### New Files
- `supabase/migrations/add_price_tracking_and_validation.sql`
- `services/price/types.ts`
- `services/price/price.service.ts`
- `services/price/providers/mock-provider.ts`
- `services/price/providers/api-provider.ts`
- `services/price/providers/polygon-provider.ts`
- `services/validation/validation.service.ts`
- `supabase/functions/price-validator/index.ts`
- `app/api/validate-prices/route.ts`

### Modified Files
- `components/analysis/AnalysisCard.tsx` - Added status badges and hit indicators
- `app/dashboard/feed/page.tsx` - Added validation trigger button
- `app/api/analyses/route.ts` - Include validation_events in queries
- `app/layout.tsx` - Added Toaster component
- `tsconfig.json` - Excluded edge functions from build
- `.env` - Added POLYGON_API_KEY

## Polygon.io Integration

### Live Market Data

The system now uses **Polygon.io** for real-time market data. The integration provides:

- Real-time stock prices (AAPL, GOOGL, MSFT, etc.)
- Crypto prices (BTC/USD, ETH/USD, etc.)
- Last trade information with precise timestamps
- Automatic fallback to mock provider if API fails

### Configuration

The Polygon API key is configured in `.env`:
```
POLYGON_API_KEY=jKbMRYMKztcbYVZylExoLutnJXeMlexe
```

### Symbol Format

- **Stocks**: Use ticker symbols directly (e.g., `AAPL`, `MSFT`)
- **Crypto**: Use format `SYMBOL/USD` (e.g., `BTC/USD`, `ETH/USD`)
  - Automatically converted to Polygon format `X:BTCUSD`

### Provider Priority

The system automatically selects the best available provider:

1. **Polygon.io** - If `POLYGON_API_KEY` is configured (Live data)
2. **Custom API** - If `PRICE_API_URL` is configured
3. **Mock Provider** - Fallback for development/testing

### Edge Function

The `price-validator` edge function uses Polygon by default:
- Fetches real-time prices for all IN_PROGRESS analyses
- Saves price snapshots with actual market data
- Includes provider name in validation results
- Handles API errors gracefully with fallback

### Error Handling

- Graceful fallback to mock provider if Polygon API fails
- Symbol-level error logging (continues processing other symbols)
- Detailed error messages in validation results

## Notes

- The mock provider simulates realistic price movements with 2% volatility
- Price snapshots are saved for future analytics
- The system is designed to be extended with additional API providers
- All timestamps are in UTC (ISO 8601 format)
- Polygon timestamps are automatically converted from nanoseconds to milliseconds
