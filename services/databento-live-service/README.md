# Databento Live Streaming Service

Real-time options and indices data streaming service using Databento's Live API. This service maintains persistent WebSocket connections to stream live market data and updates your Supabase database in real-time.

## Features

- **Real-time Streaming**: WebSocket connection to Databento Live API
- **Auto-Discovery**: Automatically subscribes to symbols from active trades
- **Smart Updates**: Only updates database when prices change significantly (>0.1%)
- **Reconnection Logic**: Automatic reconnection with exponential backoff
- **Trade Monitoring**: Detects target hits, stop losses, and new highs
- **Multi-Symbol Support**: Handles both options (OPRA.PILLAR) and indices (XNAS.ITCH)
- **Graceful Shutdown**: Handles SIGTERM/SIGINT for clean shutdowns

## Architecture

```
┌─────────────────────────────────────────┐
│   Databento Live API (WebSocket)       │
│   - OPRA.PILLAR (Options)              │
│   - XNAS.ITCH (Indices)                │
└─────────────┬───────────────────────────┘
              │ Real-time quotes
              │ (mbp-1 schema)
              ▼
┌─────────────────────────────────────────┐
│   Python Service                        │
│   - Quote processing                    │
│   - Price change detection              │
│   - Trade condition checking            │
└─────────────┬───────────────────────────┘
              │ Database updates
              ▼
┌─────────────────────────────────────────┐
│   Supabase Database                     │
│   - index_trades table                  │
│   - Real-time price updates             │
└─────────────────────────────────────────┘
```

## Prerequisites

- Python 3.11+
- Databento API key with Live API access
- Supabase project with service role key
- Active trades in `index_trades` table

## Setup

### 1. Install Dependencies

```bash
cd databento-live-service
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABENTO_API_KEY=db-YOUR_32_CHAR_KEY_HERE
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
LOG_LEVEL=INFO
UPDATE_INTERVAL_SECONDS=1
HEARTBEAT_INTERVAL_SECONDS=30
```

### 3. Run Locally

```bash
python src/main.py
```

## Deployment

### Deploy to Fly.io

1. **Install Fly CLI**:
```bash
curl -L https://fly.io/install.sh | sh
```

2. **Login**:
```bash
fly auth login
```

3. **Create App** (if not already created):
```bash
fly apps create databento-live-svc
```

4. **⚠️ CRITICAL: Set Secrets Before Deployment**

The service will crash without these secrets. Use the automated script:

**Linux/Mac:**
```bash
./fix-secrets.sh
```

**Windows:**
```powershell
.\fix-secrets.ps1
```

**Or manually:**
```bash
fly secrets set DATABENTO_API_KEY="your_databento_key" -a databento-live-svc
fly secrets set SUPABASE_URL="your_supabase_url" -a databento-live-svc
fly secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" -a databento-live-svc
```

**Verify secrets are set:**
```bash
fly secrets list -a databento-live-svc
```

5. **Deploy**:
```bash
fly deploy
```

6. **Monitor**:
```bash
fly logs -a databento-live-svc
fly status -a databento-live-svc
```

> **Troubleshooting**: If the service crashes with "Missing required environment variables", see [FIX_SECRETS_GUIDE.md](./FIX_SECRETS_GUIDE.md)

### Deploy to Railway

1. **Install Railway CLI**:
```bash
npm i -g @railway/cli
```

2. **Login and Init**:
```bash
railway login
railway init
```

3. **Set Variables**:
```bash
railway variables set DATABENTO_API_KEY=your_key
railway variables set SUPABASE_URL=your_url
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_key
```

4. **Deploy**:
```bash
railway up
```

### Deploy with Docker

```bash
docker build -t databento-live-service .
docker run -d \
  --name databento-live \
  --env-file .env \
  --restart unless-stopped \
  databento-live-service
```

## How It Works

### 1. Symbol Discovery

On startup, the service:
1. Queries Supabase for active trades
2. Extracts unique option and index symbols
3. Converts Polygon tickers to Databento format

### 2. Live Streaming

For each symbol:
- Subscribes to appropriate dataset (OPRA.PILLAR or XNAS.ITCH)
- Uses `mbp-1` schema (Market By Price Level 1)
- Receives real-time bid/ask quotes

### 3. Price Processing

For each quote:
1. Calculate mid price: `(bid + ask) / 2`
2. Compare with last known price
3. If change > 0.1%, update database
4. Check trade conditions (targets/stops)

### 4. Database Updates

Updates `index_trades` table:
```sql
UPDATE index_trades SET
  current_contract = $1,
  current_underlying = $2,
  last_quote_at = NOW(),
  contract_high_since = GREATEST(contract_high_since, $1),
  contract_low_since = LEAST(contract_low_since, $1)
WHERE status = 'active' AND polygon_option_ticker = $3
```

## Monitoring

### Logs

The service logs:
- Connection status
- Subscription confirmations
- Price updates (every 10th update)
- Trade condition hits
- Errors and warnings

Example output:
```
2025-01-05 10:30:15 - INFO - Starting Databento Live Service...
2025-01-05 10:30:16 - INFO - Found 5 unique symbols to subscribe
2025-01-05 10:30:17 - INFO - Subscribing to SPXW250103P06050000 on OPRA.PILLAR
2025-01-05 10:30:18 - INFO - Service is running. Press Ctrl+C to stop.
2025-01-05 10:31:22 - INFO - Processed 10 updates. Latest: SPXW250103P06050000 = $12.3500
```

### Health Checks

To add a health check endpoint, you can extend the service with a simple HTTP server:

```python
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

# In main():
health_server = HTTPServer(('', 8080), HealthCheckHandler)
threading.Thread(target=health_server.serve_forever, daemon=True).start()
```

## Databento API Details

### Datasets

- **OPRA.PILLAR**: Options data (SPX, SPXW options)
- **XNAS.ITCH**: Nasdaq indices

### Schema

- **mbp-1**: Market By Price Level 1
  - Best bid/ask prices
  - Bid/ask sizes
  - Timestamp information

### Pricing

Databento charges per MB of data streamed. Typical usage:
- 10 symbols × 1 update/second = ~10-20 MB/hour
- Cost: ~$0.01-0.05 per hour (varies by dataset)

## Troubleshooting

### No Active Trades

```
WARNING - No active trades found. Waiting 30 seconds...
```

**Solution**: Create active trades in your database.

### Authentication Failed

```
ERROR - Service error: Authentication failed
```

**Solution**: Verify `DATABENTO_API_KEY` is correct.

### Symbol Resolution Failed

```
ERROR - Failed to subscribe to SPXW250103P06050000: Symbol resolution failed
```

**Solution**:
- Check symbol format (should be without "O:" prefix)
- Verify contract exists and is trading
- Check Databento dataset has this symbol

### Connection Timeouts

```
WARNING - Connection closed. Reconnecting in 5 seconds...
```

**Solution**: Normal behavior. Service will auto-reconnect.

### Database Update Errors

```
ERROR - Database update error: column "current_contract" does not exist
```

**Solution**: Ensure `index_trades` table has all required columns.

## Cost Optimization

### Reduce Data Usage

1. **Fewer Symbols**: Only subscribe to active trades
2. **Higher Threshold**: Increase price change threshold from 0.1% to 0.5%
3. **Batch Updates**: Buffer updates and write in batches

### Update Threshold

In `src/main.py`, adjust:
```python
price_change_pct = abs((mid_price - last_price) / last_price * 100) if last_price else 100

# Change from 0.1 to 0.5 for fewer updates
if price_change_pct >= 0.5:
    self._update_database(...)
```

## Comparison: Live vs Historical API

| Feature | Historical API (Polling) | Live API (Streaming) |
|---------|-------------------------|---------------------|
| **Latency** | 60+ seconds | <1 second |
| **Connection** | HTTP REST | WebSocket |
| **Complexity** | Simple | Moderate |
| **Cost** | Per request | Per MB |
| **Best For** | Periodic updates | Real-time trading |
| **Your Use Case** | ❌ Too slow | ✅ Perfect fit |

## Migration from Edge Function

The old cron-based approach:
```
Edge Function (every 1 min) → Databento Historical API → Database
```

New real-time approach:
```
Python Service (persistent) → Databento Live API → Database (instant)
```

Benefits:
- 60x faster updates (1 second vs 60 seconds)
- True real-time price tracking
- Instant target/stop detection
- Better user experience

## Support

- **Databento Docs**: https://databento.com/docs/api-reference-live
- **Supabase Docs**: https://supabase.com/docs
- **GitHub Issues**: Create an issue in your repository

## License

Proprietary - Part of Analyzing Hub platform
