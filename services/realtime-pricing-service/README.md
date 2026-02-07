# Realtime Pricing Service

Standalone Node.js service for streaming live price updates to Indices Hub clients.

## Purpose

This service handles real-time market data streaming for active index trades. It:
- Connects to Polygon.io WebSocket/REST APIs for live quotes
- Manages viewer subscriptions per analysis/trade
- Tracks high/low values since trade publish
- Broadcasts updates via Server-Sent Events (SSE)
- Persists data periodically to Supabase
- Uses Redis for fast state management

## Architecture

```
Client Browser
    │
    │ SSE Connection (GET /stream?analysisId=xxx)
    ▼
Realtime Pricing Service (this)
    │
    ├── Polygon.io WebSocket ────► Live Index Quotes (I:SPX, I:NDX, I:DJI)
    ├── Polygon.io REST API  ────► Options Snapshots
    ├── Redis (Upstash)      ────► Fast state (quotes, hi/lo, viewers)
    └── Supabase             ────► Periodic persistence + auth validation
```

## Deployment

### Fly.io (Recommended)

```bash
fly launch
fly secrets set POLYGON_API_KEY=xxx
fly secrets set SUPABASE_URL=xxx
fly secrets set SUPABASE_SERVICE_ROLE_KEY=xxx
fly secrets set REDIS_URL=xxx
fly deploy
```

### Render

1. Create new Web Service
2. Connect to repo
3. Set environment variables
4. Deploy

### Railway

1. Create new project
2. Add service from GitHub
3. Configure environment
4. Deploy

## Environment Variables

```
POLYGON_API_KEY=your_polygon_api_key
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
JWT_SECRET=your_jwt_secret (same as Supabase JWT secret)
PORT=3001 (optional, defaults to 3001)
NODE_ENV=production
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "redis": "connected",
  "supabase": "connected",
  "polygon": "connected",
  "uptime": 12345,
  "activeConnections": 42
}
```

### GET /stream?analysisId={uuid}
SSE stream endpoint for live trade updates

**Headers:**
- `Authorization: Bearer {supabase_jwt}`

**Events:**
- `snapshot` - Initial state on connection
- `update` - Live price update for a trade
- `heartbeat` - Keep-alive every 30s

**Example:**
```
event: snapshot
data: {"trades":[{"trade_id":"xxx","underlying":{"current":4500,"high":4520,"low":4490},"contract":{"current":15.50,"high":16.20,"low":15.10},"timestamp":"2025-01-03T10:30:45Z"}]}

event: update
data: {"trade_id":"xxx","underlying":{"current":4505,"high":4520,"low":4490},"contract":{"current":15.75,"high":16.20,"low":15.10},"timestamp":"2025-01-03T10:31:00Z"}

event: heartbeat
data: {"timestamp":"2025-01-03T10:31:30Z"}
```

## Development

### Install

```bash
cd realtime-pricing-service
npm install
```

### Run

```bash
npm run dev
```

### Test

```bash
# Test health check
curl http://localhost:3001/health

# Test SSE stream
curl -N -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:3001/stream?analysisId=xxx"
```

## Performance

### Capacity
- 1,000+ concurrent SSE connections
- 100+ active trades
- 10 updates/sec per symbol
- <200ms latency from quote → client

### Resource Usage
- Memory: ~200MB base + ~100KB per connection
- CPU: <10% on single core (Node.js is single-threaded)
- Network: ~10KB/sec per connection

### Scaling
- Horizontal: Deploy multiple instances behind load balancer
- Sticky sessions: Required (use IP hash or cookie-based routing)
- Redis: Shared state across instances

## Monitoring

Key metrics to track:
- Active SSE connections count
- Polygon API calls per minute
- Redis operations per second
- Average latency (quote → broadcast)
- Error rates (Polygon, Redis, Supabase)
- Memory usage and GC pressure

## Troubleshooting

### High Memory Usage
- Check for WebSocket connection leaks
- Verify SSE cleanup on disconnect
- Monitor Redis connection pool

### Polygon Rate Limits
- Reduce polling frequency for options (10s → 30s)
- Implement circuit breaker (included)
- Upgrade Polygon plan if needed

### Redis Connection Errors
- Check REDIS_URL format
- Verify Upstash firewall rules
- Enable TLS if required

### SSE Disconnects
- Check for reverse proxy timeouts (increase to 5min+)
- Verify heartbeat is sent every 30s
- Ensure proper Connection: keep-alive headers

## License

MIT
