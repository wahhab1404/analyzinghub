# 🚀 QUICKSTART - Deploy Live Streaming in 5 Minutes

## Current Status

✅ **18 active SPX options** ready for streaming
✅ **Extended hours enabled** (24/5 trading)
✅ **Auto-reconnect** configured
✅ **Error handling** implemented
✅ **All API keys** configured

## Deploy NOW

### Step 1: Install Fly CLI (30 seconds)

```bash
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
```

### Step 2: Login (30 seconds)

```bash
fly auth login
```

Browser will open - login with your Fly.io account (or create one - it's free)

### Step 3: Deploy (3 minutes)

```bash
cd databento-live-service

# Create the app
fly apps create databento-live-service --region iad

# Set secrets
fly secrets set \
  DATABENTO_API_KEY="db-DiedQk3PdYRE4Dr5njjxeyHN7c3es" \
  SUPABASE_URL="https://gbdzhdlpbwrnhykmstic.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8" \
  -a databento-live-service

# Deploy
fly deploy -a databento-live-service
```

### Step 4: Verify (1 minute)

Watch the logs - you should see prices streaming:

```bash
fly logs -a databento-live-service
```

Expected output:
```
🚀 STARTING DATABENTO LIVE SERVICE
============================================================
📍 Supabase: https://gbdzhdlpbwrnhykmstic.supabase.co
🔑 API Key: db-DiedQ...c3es
⏰ Extended Hours: ENABLED (24/5 SPX trading)
============================================================
🎯 Found 18 unique symbols to subscribe:
   - SPXW260105C06895000
   - SPXW260105C06880000
   - SPXW260105C06885000
   ...
📡 Subscribing to SPXW260105C06895000 on OPRA.PILLAR (extended hours enabled)
✅ Subscribed to SPXW260105C06895000 - Ready for 24/5 trading
...
============================================================
✅ ALL SYSTEMS GO - STREAMING LIVE!
============================================================
🟢 Service is LIVE! Streaming real-time prices for 18 SPX options...
📊 Press Ctrl+C to stop

[22:30:15] 📊 5 updates | SPXW260105C06895000 = $12.35 | Δ 0.15%
[22:30:18] 📊 10 updates | SPXW260105C06880000 = $18.20 | Δ 0.22%
[22:30:21] 📊 15 updates | SPXW260105C06885000 = $15.10 | Δ 0.18%
...
```

## Verify Database Updates

Check that prices are updating in your database:

```bash
./check_trades.sh
```

You should see `last_quote_at` less than 10 seconds ago.

## What Happens Next

Once deployed:

1. ✅ Service connects to Databento Live API
2. ✅ Subscribes to all 18 active SPX options
3. ✅ Streams prices in real-time (<1 second)
4. ✅ Updates your database automatically
5. ✅ Auto-reconnects if disconnected
6. ✅ Monitors targets and stops 24/5
7. ✅ Your frontend shows live prices immediately

## Common Issues

### "error: not authorized"

Run: `fly auth login` and login to your account

### "App already exists"

Skip the create step, go straight to secrets

### "No updates in logs"

Market might be closed. SPX options trade:
- **Regular Hours:** 9:30 AM - 4:00 PM ET
- **Extended Hours:** 6:00 PM Sunday - 9:15 AM Friday ET

Check market status at: https://www.cboe.com/

### Service shows errors

Check logs: `fly logs -a databento-live-service`

Most common: Invalid API key or network issues

## Service Management

**View status:**
```bash
fly status -a databento-live-service
```

**Restart service:**
```bash
fly apps restart databento-live-service
```

**View live logs:**
```bash
fly logs -a databento-live-service -f
```

**Scale up (more RAM):**
```bash
fly scale vm shared-cpu-1x --memory 1024 -a databento-live-service
```

**Stop service:**
```bash
fly apps stop databento-live-service
```

**Resume service:**
```bash
fly apps start databento-live-service
```

## Cost Estimate

- **Compute:** $3/month (512MB RAM, always-on)
- **Data:** ~$5/month (18 symbols, live streaming)
- **Total:** ~$8/month

**Worth it?** YES! You get:
- Real-time updates (<1 sec vs 60 sec)
- 24/5 extended hours coverage
- Automatic reconnection
- Target/stop monitoring

## Next Steps

After confirming it works:

1. ✅ Disable old cron job (Supabase Dashboard → Database → Cron Jobs)
2. ✅ Monitor for 24 hours
3. ✅ Check your frontend - prices update in real-time
4. ✅ Test target/stop notifications

## Support

**Service issues:**
```bash
fly logs -a databento-live-service
```

**Databento API status:**
https://status.databento.com

**Fly.io docs:**
https://fly.io/docs

**Need help?** Check logs first, 90% of issues show there.

---

**You're 5 minutes away from real-time prices! 🚀**
