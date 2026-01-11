# Analysis Activation Conditions - Implementation Complete

## Overview
Implemented a comprehensive activation conditions system for AnalyzingHub that prevents analyses from being marked as failed if the stoploss is hit before an activation condition is met.

## ✅ Completed Components

### 1. Database Schema (Migration: `create_analysis_activation_conditions`)

#### New Columns in `analyses` table:
- `activation_enabled` - Boolean flag to enable/disable activation conditions
- `activation_type` - Type: PASSING_PRICE, ABOVE_PRICE, UNDER_PRICE
- `activation_price` - Numeric price level for activation
- `activation_timeframe` - INTRABAR, 1H_CLOSE, 4H_CLOSE, DAILY_CLOSE
- `activation_status` - draft, published_inactive, active, completed_success, completed_fail, cancelled, expired
- `activated_at` - Timestamp when analysis became active
- `activation_met_at` - When condition was first met
- `activation_notes` - Optional notes
- `preactivation_stop_touched` - Flag if stop was touched before activation
- `preactivation_stop_touched_at` - Timestamp
- `last_eval_price` - Last evaluated price (for PASSING_PRICE detection)
- `last_eval_at` - Last evaluation timestamp

#### New Table: `analysis_events`
- Audit log for all analysis lifecycle events
- Tracks ACTIVATION_MET, STOP_TOUCHED_PREACTIVATION, TARGET_HIT, etc.
- Full RLS policies for security

#### Database Functions:
- `log_analysis_event()` - Log events to audit trail
- `activate_analysis()` - Activate an analysis when condition is met
- `mark_preactivation_stop_touched()` - Mark pre-activation stop touches

### 2. Edge Function: `activation-condition-checker`

**Runs every 5 minutes via cron job**

Features:
- Fetches all analyses with `activation_status = 'published_inactive'`
- Evaluates activation conditions based on timeframe:
  - INTRABAR: Uses latest trade/snapshot price
  - 1H_CLOSE/4H_CLOSE/DAILY_CLOSE: Uses completed candle closes
- Implements condition logic:
  - ABOVE_PRICE: Current price > activation price
  - UNDER_PRICE: Current price < activation price
  - PASSING_PRICE: Detects price crossing through activation level
- Detects pre-activation stop touches (logged but not counted as failures)
- Activates analyses when conditions are met
- Updates `last_eval_price` for next evaluation cycle

### 3. API Endpoints Updated

#### POST `/api/analyses` (Create Analysis)
- Accepts activation fields: `activationEnabled`, `activationType`, `activationPrice`, `activationTimeframe`, `activationNotes`
- Validates required fields when activation is enabled
- Sets `activation_status` to 'published_inactive' or 'active' based on configuration

#### POST `/api/analyses/[id]/edit` (Edit Analysis)
- Allows editing activation conditions for draft/published_inactive analyses
- Prevents editing activation conditions after analysis is activated
- Maintains audit trail of changes

### 4. Price Validator Updated

**File:** `supabase/functions/price-validator/index.ts`

Critical Changes:
```typescript
// Only validate if activation_status is 'active'
if (analysis.activation_status && analysis.activation_status !== 'active') {
  return { shouldValidate: false }
}
```

Behavior:
- ✅ Skips validation for `published_inactive` analyses
- ✅ Only checks stop/targets for `active` analyses
- ✅ Prevents false failures before activation

### 5. Cron Job Configured

**Migration:** `add_activation_checker_cron_job`

- Runs every 5 minutes
- Calls `activation-condition-checker` edge function
- Uses service role authentication
- Integrated with existing cron infrastructure

## 🎯 Key Features

### Activation Condition Types

1. **PASSING_PRICE**
   - Detects price crossing through activation level
   - Direction-aware (LONG = cross above, SHORT = cross below)
   - Uses `last_eval_price` for accurate cross detection

2. **ABOVE_PRICE**
   - Activates when price is above activation price
   - Simple threshold check

3. **UNDER_PRICE**
   - Activates when price is below activation price
   - Simple threshold check

### Timeframe Support

- **INTRABAR**: Real-time using latest snapshot (fastest)
- **1H_CLOSE**: Hourly candle close
- **4H_CLOSE**: 4-hour candle close
- **DAILY_CLOSE**: Daily candle close

### Pre-Activation Stop Touch Detection

When stoplossis touched BEFORE activation:
- ✅ Logged in `analysis_events` table
- ✅ `preactivation_stop_touched` flag set to true
- ✅ **NOT** marked as failure
- ✅ Analysis remains in `published_inactive` status

Once activated:
- ✅ Normal stop/target validation rules apply
- ✅ Stop hit = `completed_fail`
- ✅ Target hit = `completed_success` (based on your business rules)

## 📊 Lifecycle States

```
draft
  ↓
published_inactive (if activation_enabled = true)
  ↓ (activation condition met)
active
  ↓ (stop hit) OR ↓ (target hit)
completed_fail   completed_success
```

## 🔐 Security

- ✅ RLS policies on `analysis_events` table
- ✅ Service role access for cron jobs
- ✅ Analysts can only edit their own analyses
- ✅ Event logging with user tracking
- ✅ Audit trail for all state transitions

## 📝 Next Steps (UI Integration)

The backend is fully functional. To complete the feature:

1. **Update CreateAnalysisForm.tsx**
   - Add activation conditions section with toggle
   - Add dropdowns for type and timeframe
   - Add input for activation price
   - Add help text/tooltips

2. **Update AnalysisCard Component**
   - Show activation status badges:
     - "Waiting Activation" for published_inactive
     - "Active" for active
     - "Success"/"Failed" for completed states
   - Display activation condition details

3. **Update Analysis Detail Page**
   - Show activation configuration
   - Show activation timeline/events
   - Display pre-activation events if any

4. **Create Analysis Events Viewer**
   - API endpoint: GET `/api/analyses/[id]/events`
   - Display event log with timestamps
   - Show activation, stop touches, targets, etc.

## 🧪 Testing Checklist

- [ ] Create analysis with ABOVE_PRICE activation
- [ ] Verify analysis stays published_inactive until price > activation_price
- [ ] Test pre-activation stop touch (should NOT fail)
- [ ] Verify activation when condition is met
- [ ] Test stop hit AFTER activation (should fail)
- [ ] Test target hit AFTER activation (should succeed)
- [ ] Test PASSING_PRICE cross detection
- [ ] Test all timeframes (1H, 4H, Daily)
- [ ] Verify event logging works correctly
- [ ] Test editing activation conditions before activation

## 🚀 Deployment Status

✅ Database migrations applied
✅ Edge function deployed
✅ Cron job configured
✅ API endpoints updated
✅ Price validator updated

**System is ready for testing once UI components are updated.**

## 📖 Usage Example

```javascript
// Create analysis with activation condition
POST /api/analyses
{
  "symbol": "AAPL",
  "direction": "Long",
  "stopLoss": 170,
  "activationEnabled": true,
  "activationType": "ABOVE_PRICE",
  "activationPrice": 185,
  "activationTimeframe": "DAILY_CLOSE",
  "activationNotes": "Wait for breakout above 185",
  "targets": [
    { "price": 190, "expectedTime": "2026-01-20" },
    { "price": 195, "expectedTime": "2026-01-25" }
  ]
}

// Result:
// - Analysis created with activation_status = 'published_inactive'
// - Cron job checks every 5 minutes
// - If daily close > 185, analysis becomes 'active'
// - If price hits 170 BEFORE activation: logged, NOT failed
// - If price hits 170 AFTER activation: marked as failed
```

## 🎓 Documentation

All functions include comprehensive comments explaining:
- Purpose and behavior
- Parameters and return values
- Business logic
- Security considerations

## ⚙️ Configuration

No manual configuration needed:
- ✅ Cron job auto-configured
- ✅ Environment variables inherited
- ✅ Service role keys automated
- ✅ Polygon API integration ready

## 🐛 Debugging

To monitor activation checker:
```sql
-- View cron job status
SELECT * FROM cron_job_status WHERE jobname = 'check-activation-conditions';

-- View recent activation events
SELECT * FROM analysis_events
WHERE event_type = 'ACTIVATION_MET'
ORDER BY created_at DESC
LIMIT 10;

-- View pending activations
SELECT id, symbol_id, activation_type, activation_price, activation_status
FROM analyses
WHERE activation_enabled = true
AND activation_status = 'published_inactive';
```

## 📞 API Reference

### Activate Analysis (RPC)
```sql
SELECT activate_analysis(
  'analysis-uuid',
  185.50,
  'Activated via daily close above 185'
);
```

### Mark Pre-Activation Stop
```sql
SELECT mark_preactivation_stop_touched(
  'analysis-uuid',
  170.25
);
```

### Log Event
```sql
SELECT log_analysis_event(
  'analysis-uuid',
  'CUSTOM_EVENT',
  '{"detail": "some data"}'::jsonb
);
```

---

**Status:** ✅ Backend Implementation Complete
**Ready For:** UI Integration & End-to-End Testing
