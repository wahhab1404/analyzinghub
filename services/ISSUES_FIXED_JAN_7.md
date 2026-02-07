# Issues Fixed - January 7, 2026

## Issue 1: Contract Prices Not Updating Outside RTH ✅

### Problem
User reported that contract prices (e.g., 6920 PUT) are not updating outside Regular Trading Hours.

### Root Cause
**This is NOT a bug** - it's expected market behavior. Options contracts only trade during Regular Trading Hours (9:30 AM - 4:00 PM ET). Outside these hours, the Polygon API returns the last available quote from the most recent trading session.

### Verification
Ran diagnostic and confirmed:
- ✅ Trade tracker runs every minute
- ✅ Polygon API is fetched successfully
- ✅ Database updates with `last_quote_at` timestamp
- ✅ Prices stay the same because no new trading occurs

Example from diagnostics:
```
Trade: O:SPXW260107P06920000 (6920 PUT)
Entry: $4.45
Current: $4.45 (no change - expected outside RTH)
Last Updated: Just now ✅
```

### Solution Implemented
Added a **Market Hours Alert** to the UI that displays when markets are closed:

```
⚠️ Markets closed (Weekend/After-hours)

Options prices update during Regular Trading Hours (9:30 AM - 4:00 PM ET).
Current prices reflect the last available quote from the most recent trading session.
Current time: 1:30 AM ET
```

This alert appears in:
- `TradesList.tsx` - Shows above all trades
- `TradeMonitor.tsx` - Already had market status badge

### Files Changed
- ✅ `components/indices/TradesList.tsx` - Added market hours alert
- ✅ `scripts/diagnose-trade-updates.ts` - New diagnostic script
- ✅ `OPTIONS_TRADING_HOURS_EXPLANATION.md` - Complete explanation document

### User Education
Users now understand:
1. Options don't trade 24/7 like crypto
2. Prices update only during RTH (9:30 AM - 4:00 PM ET)
3. Outside RTH, prices show last trading session quote
4. System IS working - it's monitoring and ready for market open

---

## Issue 2: Databento Live Service Crashing ✅

### Problem
The databento-live-service on Fly.io is crashing with:
```
ValueError: Missing required environment variables
machine has reached its max restart count of 10
```

### Root Cause
The Fly.io app was deployed without setting the required secrets. The service needs:
1. `DATABENTO_API_KEY`
2. `SUPABASE_URL`
3. `SUPABASE_SERVICE_ROLE_KEY`

These must be set as Fly secrets (not just in local .env file).

### Solution Created
Created automated fix scripts and documentation:

#### 1. Fix Scripts
**Linux/Mac:**
```bash
cd databento-live-service
./fix-secrets.sh
```

**Windows:**
```powershell
cd databento-live-service
.\fix-secrets.ps1
```

The scripts:
- Load values from parent `.env` file
- Set all required secrets in Fly.io
- Automatically trigger app restart

#### 2. Manual Alternative
```bash
fly secrets set DATABENTO_API_KEY="db-DiedQk3PdYRE4Dr5njjxeyHN7c3es" -a databento-live-svc
fly secrets set SUPABASE_URL="https://gbdzhdlpbwrnhykmstic.supabase.co" -a databento-live-svc
fly secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." -a databento-live-svc
```

#### 3. Verification
```bash
# Check secrets are set
fly secrets list -a databento-live-svc

# Monitor logs
fly logs -a databento-live-svc

# Check status
fly status -a databento-live-svc
```

### Files Created
- ✅ `databento-live-service/fix-secrets.sh` - Bash automation script
- ✅ `databento-live-service/fix-secrets.ps1` - PowerShell automation script
- ✅ `databento-live-service/FIX_SECRETS_GUIDE.md` - Complete troubleshooting guide
- ✅ `databento-live-service/README.md` - Updated with prominent secret setup warning

### Next Steps for User
1. Run the fix script to set secrets:
   ```bash
   cd databento-live-service
   ./fix-secrets.sh  # or fix-secrets.ps1 on Windows
   ```

2. Verify service starts successfully:
   ```bash
   fly logs -a databento-live-svc
   ```

3. Expected success logs:
   ```
   ✅ Connected to Databento Live API
   ✅ Supabase client initialized
   📊 Fetching active trades...
   ```

---

## Summary

### Options Pricing (Issue 1)
- System is working correctly
- Added UI indicators for market hours
- Users now understand when to expect price updates

### Databento Service (Issue 2)
- Created automated fix scripts
- Added comprehensive documentation
- User needs to run fix script to set Fly secrets

### Documentation Added
1. `OPTIONS_TRADING_HOURS_EXPLANATION.md` - Market hours details
2. `FIX_SECRETS_GUIDE.md` - Databento service fix guide
3. `ISSUES_FIXED_JAN_7.md` - This summary document

### Build Status
✅ Project builds successfully with no errors
