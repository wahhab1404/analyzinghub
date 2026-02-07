# Databento Live Service - Fix Missing Secrets

## Problem
The databento-live-service is crashing with error:
```
ValueError: Missing required environment variables
```

This happens because the Fly.io app doesn't have the required secrets set.

## Solution

### Option 1: Automated Script (Recommended)

**On Linux/Mac:**
```bash
cd databento-live-service
./fix-secrets.sh
```

**On Windows:**
```powershell
cd databento-live-service
.\fix-secrets.ps1
```

The script will:
1. Load values from your `.env` file
2. Set all required secrets in Fly.io
3. Automatically restart the service

### Option 2: Manual Setup

Set each secret manually using the Fly CLI:

```bash
# Get values from your .env file first
cd databento-live-service

# Set DATABENTO_API_KEY
fly secrets set DATABENTO_API_KEY="db-DiedQk3PdYRE4Dr5njjxeyHN7c3es" -a databento-live-svc

# Set SUPABASE_URL (use NEXT_PUBLIC_SUPABASE_URL value)
fly secrets set SUPABASE_URL="https://gbdzhdlpbwrnhykmstic.supabase.co" -a databento-live-svc

# Set SUPABASE_SERVICE_ROLE_KEY
fly secrets set SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." -a databento-live-svc
```

## Required Secrets

The service needs these 3 environment variables:

| Secret Name | Source from .env | Purpose |
|------------|------------------|---------|
| `DATABENTO_API_KEY` | `DATABENTO_API_KEY` | Databento Live API access |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access |

## Verification

After setting secrets, verify the service is running:

```bash
# Check app status
fly status -a databento-live-svc

# View live logs
fly logs -a databento-live-svc

# Check if service is healthy
fly checks list -a databento-live-svc
```

### Expected Logs (Success)
```
✅ Connected to Databento Live API
✅ Supabase client initialized
📊 Fetching active trades...
🔔 Found X active trades to monitor
```

### Error Logs (Problem)
```
❌ ValueError: Missing required environment variables
❌ DATABENTO_API_KEY not configured
```

## Troubleshooting

### Service Still Crashing?

1. **Check if secrets were set correctly:**
   ```bash
   fly secrets list -a databento-live-svc
   ```

2. **View recent logs:**
   ```bash
   fly logs -a databento-live-svc --lines 100
   ```

3. **Force restart:**
   ```bash
   fly apps restart databento-live-svc
   ```

### Invalid API Key Error

If you see authentication errors:
- Verify DATABENTO_API_KEY is valid at https://databento.com/
- Make sure you have an active subscription
- Check if the key has the correct permissions

### Supabase Connection Error

If you see Supabase errors:
- Verify SUPABASE_URL matches your project URL
- Ensure SUPABASE_SERVICE_ROLE_KEY is the service role key (not anon key)
- Check if Supabase project is active

## Why This Happened

The service was deployed without setting the required secrets in Fly.io. Unlike local development where `.env` files are used, deployed apps on Fly.io need secrets to be set explicitly using the `fly secrets set` command.

## Prevention

When deploying services to Fly.io in the future:
1. Always set required secrets before first deployment
2. Use `fly secrets list` to verify secrets are set
3. Check logs immediately after deployment
4. Consider using `.env.example` as a checklist

## Related Documentation

- [Fly.io Secrets](https://fly.io/docs/reference/secrets/)
- [Databento Live API](https://databento.com/docs/api-reference-live)
- [Supabase Service Role Key](https://supabase.com/docs/guides/api#the-service_role-key)
