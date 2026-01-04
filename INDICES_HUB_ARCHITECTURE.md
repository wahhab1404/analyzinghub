# Indices Hub - Architecture Blueprint

## Overview

The Indices Hub feature enables analysts to publish index chart analyses with multiple trade recommendations (options/futures contracts) and display live, continuously updated metrics for each active trade.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                           │
│  ┌────────────────┐         ┌──────────────────────────────┐   │
│  │  Next.js App   │◄────SSE─┤  Realtime Pricing Service    │   │
│  │  (Netlify)     │         │  (Fly.io/Render/Railway)     │   │
│  └────────┬───────┘         └──────────┬───────────────────┘   │
└───────────┼─────────────────────────────┼───────────────────────┘
            │                             │
            │ API Calls                   │ Polygon.io WebSocket/REST
            │ (CRUD, Snapshots)           │ Redis Cache
            ▼                             ▼
    ┌───────────────┐           ┌─────────────────┐
    │   Netlify     │           │   Redis         │
    │   Functions   │           │   (Upstash)     │
    │               │           │                 │
    │ - CRUD APIs   │           │ - Live quotes   │
    │ - Snapshot on │           │ - Hi/Lo tracks  │
    │   Publish     │           │ - Viewer counts │
    └───────┬───────┘           └─────────────────┘
            │
            │ Database/Storage
            ▼
    ┌───────────────┐
    │   Supabase    │
    │               │
    │ - Postgres DB │
    │ - RLS         │
    │ - Storage     │
    │ - Auth        │
    └───────────────┘
```

## Component Responsibilities

### 1. Netlify App (Next.js)

**Purpose**: Main application hosting with server-side rendering and API routes

**Responsibilities**:
- CRUD operations for analyses, trades, and updates
- Server-side Polygon.io snapshot on trade publish
- File uploads to Supabase Storage
- Authentication and authorization
- Static/SSR page rendering

**Key Endpoints**:
- `POST /api/indices/analyses` - Create new index analysis
- `POST /api/indices/analyses/[id]/trades` - Publish new trade with snapshot
- `GET /api/indices/contracts` - Fetch available contracts from Polygon
- `POST /api/indices/trades/[id]/updates` - Post trade updates
- `PATCH /api/indices/trades/[id]` - Update trade status/targets

**Performance Constraints**:
- No long-lived connections (max 10s timeout)
- Snapshot fetching only on publish (not continuous)
- Lazy-load heavy components
- Cache Polygon contract chains for 5 minutes

### 2. Realtime Pricing Service (External Node.js)

**Purpose**: Isolated service for live price streaming and metrics tracking

**Deployment**: Fly.io (recommended) / Render / Railway

**Technology Stack**:
- Node.js with Express
- Polygon.io WebSocket client
- Redis client (ioredis)
- Supabase client (service role)

**Core Features**:

#### A. SSE Stream Endpoint
```
GET /stream?analysisId={uuid}
Authorization: Bearer {supabase_jwt}
```

**Workflow**:
1. Validate JWT with Supabase
2. Check user entitlements (role/subscription)
3. Query active trades for analysisId
4. Subscribe to required symbols (viewer count++)
5. Send initial snapshot from Redis/DB
6. Stream live updates as SSE events
7. On disconnect: viewer count--, unsubscribe if count=0 after grace period

#### B. Subscription Manager

**Tracks**:
- Active viewers per analysis/trade
- Symbol subscriptions (map: symbol → Set<tradeId>)
- Graceful cleanup (60s grace period after last viewer)

**Logic**:
```javascript
{
  'I:SPX': {
    viewerCount: 5,
    trades: ['trade-uuid-1', 'trade-uuid-2'],
    lastActivity: timestamp
  },
  'O:SPX251219C05900000': {
    viewerCount: 2,
    trades: ['trade-uuid-1'],
    lastActivity: timestamp
  }
}
```

#### C. Polygon Integration

**Index Quotes** (Underlying):
- WebSocket: `wss://socket.polygon.io/indices`
- Subscribe to: `I:SPX`, `I:NDX`, `I:DJI`
- Events: value updates with timestamp
- Fallback: REST snapshot every 3s if WS fails

**Options Quotes**:
- WebSocket: `wss://socket.polygon.io/options` (if available)
- REST Snapshot: Every 5-10s per active option
- Endpoint: `GET /v3/snapshot/options/{underlyingAsset}/{optionContract}`

**Rate Limiting**:
- Circuit breaker pattern
- Exponential backoff on errors
- Queue requests, batch where possible

#### D. Redis Schema

```
# Live Quotes
quote:index:I:SPX -> JSON {price, timestamp, session_high, session_low}
quote:option:{ticker} -> JSON {bid, ask, mid, last, timestamp}

# Trade Trackers
trade:{tradeId}:underlying:high -> float
trade:{tradeId}:underlying:low -> float
trade:{tradeId}:contract:high -> float
trade:{tradeId}:contract:low -> float

# Subscription State
sub:analysis:{analysisId}:viewers -> int (counter)
sub:symbol:{symbol}:viewers -> int (counter)
sub:symbol:{symbol}:trades -> set of tradeIds

# Last Persist
trade:{tradeId}:last_persist -> timestamp
```

#### E. High/Low Algorithm

```javascript
// On every quote update for an active trade
async function updateHighLow(tradeId, symbol, price, isUnderlying) {
  const prefix = isUnderlying ? 'underlying' : 'contract';

  // Update high
  const highKey = `trade:${tradeId}:${prefix}:high`;
  const currentHigh = await redis.get(highKey);
  if (!currentHigh || price > parseFloat(currentHigh)) {
    await redis.set(highKey, price);
  }

  // Update low
  const lowKey = `trade:${tradeId}:${prefix}:low`;
  const currentLow = await redis.get(lowKey);
  if (!currentLow || price < parseFloat(currentLow)) {
    await redis.set(lowKey, price);
  }
}
```

#### F. Persistence Strategy

**Frequent Updates** (In-Memory Redis):
- Every quote: update current + hi/lo in Redis
- Broadcast to SSE clients: every update

**Periodic Persistence** (To Supabase):
- Every 30-60 seconds: batch update DB with Redis values
- Only for trades with changes
- Reduces DB writes from 1000s/sec to ~10s/min

**On Trade Close**:
- Final reconciliation: flush Redis → DB
- Mark trade as CLOSED
- Remove from active tracking

#### G. SSE Event Format

```javascript
// Initial snapshot
event: snapshot
data: {
  "trades": [
    {
      "id": "trade-uuid",
      "underlying": {"current": 4500, "high": 4520, "low": 4490},
      "contract": {"current": 15.50, "high": 16.20, "low": 15.10},
      "lastUpdate": "2025-01-03T10:30:45Z"
    }
  ]
}

// Live update
event: update
data: {
  "tradeId": "trade-uuid",
  "underlying": {"current": 4505, "high": 4520, "low": 4490},
  "contract": {"current": 15.75, "high": 16.20, "low": 15.10},
  "timestamp": "2025-01-03T10:31:00Z"
}

// Heartbeat (every 30s)
event: heartbeat
data: {"timestamp": "2025-01-03T10:31:00Z"}
```

### 3. Supabase (Database + Storage)

**Postgres Tables**:
- `indices_reference` - Index master data
- `index_analyses` - Analysis posts
- `index_trades` - Trade recommendations
- `analysis_updates` - Updates on analyses
- `trade_updates` - Updates on trades

**Row-Level Security**:
- Public: read public analyses/trades
- Subscribers: read subscriber-only content
- Admin only: write operations
- Service role: update pricing fields

**Storage Buckets**:
- `index-charts` - Chart images for analyses
- `index-updates` - Attachments for updates

### 4. Redis (Upstash)

**Purpose**: High-frequency state management

**Features**:
- Sub-millisecond reads/writes
- Persistence enabled (snapshot every 5 min)
- Eviction: LRU for old data
- Max memory: 1GB (sufficient for 1000s of trades)

**Sizing**:
- ~1KB per trade tracker (4 floats + metadata)
- ~500 bytes per quote
- 10,000 active trades = ~15MB
- Plus overhead: 100MB total conservative estimate

## Data Flow

### Publish New Trade Flow

```
1. Analyst clicks "Publish Trade" in UI
   ↓
2. POST /api/indices/analyses/{id}/trades
   {
     "instrument_type": "OPTIONS",
     "direction": "CALL",
     "polygon_option_ticker": "O:SPX251219C05900000",
     "strike": 5900,
     "expiry": "2025-12-19",
     ...
   }
   ↓
3. Server-side Polygon snapshot (Netlify Function):
   - GET /v3/snapshot/indices/I:SPX
   - GET /v3/snapshot/options/SPX/O:SPX251219C05900000
   ↓
4. Store in Supabase:
   - entry_underlying_snapshot = {price: 4500, timestamp: ...}
   - entry_contract_snapshot = {mid: 15.50, timestamp: ...}
   - current_* = entry_*
   - high/low = entry values
   - status = ACTIVE
   ↓
5. Initialize Redis (via Realtime Service webhook or on first view):
   - trade:{id}:underlying:high = 4500
   - trade:{id}:underlying:low = 4500
   - trade:{id}:contract:high = 15.50
   - trade:{id}:contract:low = 15.50
   ↓
6. Return success to client
```

### Live Viewing Flow

```
1. User opens analysis detail page
   ↓
2. Page loads from Supabase (fast):
   - Analysis content + chart
   - List of trades with last persisted values
   ↓
3. Browser connects to Realtime Service:
   GET https://realtime-pricing.fly.dev/stream?analysisId={id}
   Authorization: Bearer {jwt}
   ↓
4. Realtime Service validates and subscribes:
   - Verify JWT entitlements
   - Load active trades
   - Increment viewer counts
   - Subscribe to required symbols (if not already)
   ↓
5. Send initial snapshot from Redis/DB
   ↓
6. Stream live updates as prices change:
   - Polygon quote → Redis update → Hi/Lo check → SSE broadcast
   ↓
7. Client updates UI reactively (React state)
```

## Performance Characteristics

### Scalability Targets

**Concurrent Users**:
- 1,000 simultaneous viewers
- 100 active trades per analysis
- 50 analyses with active trades

**Data Throughput**:
- Polygon quotes: 1-10 updates/sec per symbol
- SSE broadcasts: match quote rate (1-10/sec)
- DB writes: 1 update per trade per 60s = 50-100 writes/min

**Latency**:
- Page load (initial): <1s (cached)
- SSE connection: <500ms
- Quote update → UI: <200ms (network + processing)

### Cost Efficiency

**Netlify**:
- Functions: 125k/month free, then $25/100k
- Bandwidth: 100GB/month free
- Estimated: Free tier sufficient for 10k MAU

**Realtime Service (Fly.io)**:
- 1x shared-cpu-1x (256MB RAM): $1.94/month
- Scale to 2-4 instances for HA: $4-8/month

**Redis (Upstash)**:
- 10k commands/day free, then $0.20/100k
- Estimated: $5-10/month for 1M commands/day

**Polygon.io**:
- Starter: $199/month (5 API calls/sec)
- Advanced: $399/month (50 calls/sec)
- Indices data included in most plans

**Supabase**:
- Free tier: 500MB DB, 1GB transfer
- Pro: $25/month (8GB DB, 50GB transfer)

**Total Monthly**: ~$50-100 for moderate traffic

## Reliability & Observability

### Health Checks

**Realtime Service**:
- `/health` endpoint (200 OK if operational)
- Checks: Redis ping, Supabase query, Polygon API test

**Monitoring**:
- Uptime: UptimeRobot / Better Uptime
- Metrics: Grafana Cloud / Datadog free tier
- Logs: Fly.io logs / CloudWatch

### Key Metrics

1. **Latency**:
   - SSE connection time (p50, p95, p99)
   - Polygon API response time
   - Redis operation time

2. **Throughput**:
   - SSE connections/sec
   - Quotes processed/sec
   - DB writes/min

3. **Errors**:
   - Polygon rate limits
   - Redis connection failures
   - SSE disconnects

4. **Business**:
   - Active trades count
   - Viewer count per analysis
   - Trade outcomes (TP hit rate)

### Graceful Degradation

**If Realtime Service is down**:
- Analysis page still loads with last DB values
- Show "Live updates unavailable" banner
- Fallback to manual refresh button

**If Polygon rate-limits**:
- Circuit breaker: pause requests for 60s
- Serve stale quotes from Redis (max age: 5 min)
- Log and alert

**If Redis is down**:
- Read hi/lo from Supabase (stale but functional)
- Disable hi/lo updates until Redis recovers
- Continue serving current prices

## Security

### API Keys

**Never in Browser**:
- Polygon API key: only in Netlify env + Realtime Service env
- Supabase Service Role: only in server contexts

**Netlify Environment Variables**:
```
POLYGON_API_KEY=...
REALTIME_SERVICE_URL=https://realtime-pricing.fly.dev
REALTIME_SERVICE_SECRET=... (for internal calls)
```

**Realtime Service Environment Variables**:
```
POLYGON_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=...
JWT_SECRET=... (for validation)
```

### Authentication Flow

1. User authenticates with Supabase (browser)
2. Gets JWT with claims (role, user_id, subscription)
3. Passes JWT to Realtime Service in Authorization header
4. Realtime Service validates JWT and checks entitlements
5. Only subscribers can stream subscriber-only analyses

### Rate Limiting

**Netlify APIs**:
- 100 requests/min per IP for public endpoints
- No limit for authenticated admins

**Realtime Service SSE**:
- 5 concurrent connections per user
- Automatic cleanup of stale connections

## Load Testing Strategy

### Tools
- k6 for HTTP load testing
- Artillery for SSE streaming

### Test Scenarios

**Scenario 1: Peak Load**
- 1,000 concurrent SSE connections
- 100 active trades (10 symbols)
- 5 updates/sec per symbol
- Duration: 10 minutes

**Expected**:
- CPU: <70% on realtime service
- Memory: <500MB
- SSE latency: p99 <500ms
- No dropped connections

**Scenario 2: Trade Publish Burst**
- 10 analysts publish 50 trades in 60 seconds
- Each publish: 2 Polygon API calls
- Total: 100 API calls in 60s

**Expected**:
- All publishes succeed
- API latency: p95 <2s
- No rate limit errors

**Scenario 3: Thundering Herd**
- 500 users load same analysis page simultaneously
- All connect to SSE within 5 seconds

**Expected**:
- Connection setup: p95 <1s
- Initial snapshot: p95 <500ms
- Symbol subscription: no duplicate Polygon calls

### Optimization Targets

1. **Pre-warm Redis**: Load recent trades on service start
2. **Connection pooling**: Reuse Polygon WS connections
3. **Batch DB writes**: Accumulate 60s of updates, write once
4. **CDN caching**: Static analysis content, 5-min cache
5. **Lazy Polygon subscriptions**: Only subscribe when viewers > 0

## Deployment Checklist

### Phase 1: Database (Week 1)
- [ ] Create Supabase migrations
- [ ] Apply RLS policies
- [ ] Create storage buckets with policies
- [ ] Seed indices_reference table (SPX, NDX, DJI)

### Phase 2: Core APIs (Week 1-2)
- [ ] Implement CRUD endpoints
- [ ] Polygon snapshot integration
- [ ] Contract chain fetcher
- [ ] File upload handling

### Phase 3: Realtime Service (Week 2-3)
- [ ] Deploy to Fly.io
- [ ] Set up Redis (Upstash)
- [ ] Implement SSE endpoint
- [ ] Integrate Polygon WebSocket/REST
- [ ] Implement hi/lo tracking
- [ ] Add health checks and logging

### Phase 4: Frontend (Week 3-4)
- [ ] Indices Hub list page
- [ ] Analysis detail page
- [ ] Trade cards with live metrics
- [ ] New Trade modal with contract picker
- [ ] Updates timeline
- [ ] Admin controls

### Phase 5: Hardening (Week 4-5)
- [ ] Load testing
- [ ] Error handling and retries
- [ ] Monitoring and alerting
- [ ] Documentation
- [ ] Launch runbook

## Future Enhancements

1. **Backtesting**: Historical performance of analyst calls
2. **Alerts**: Push notifications when trade hits target/SL
3. **Social**: Comments and ratings on analyses
4. **Export**: PDF reports of analyses with outcomes
5. **Advanced Charts**: Integrated TradingView charts with annotations
6. **Mobile App**: Native apps with push notifications
7. **Machine Learning**: Predict TP hit probability based on historical data

## Conclusion

This architecture ensures:
✅ **Performance**: No long-lived Netlify connections, isolated realtime service
✅ **Scalability**: Per-symbol polling, Redis caching, batch DB writes
✅ **Reliability**: Graceful degradation, circuit breakers, health checks
✅ **Cost-Effective**: Minimal infrastructure, leverages Supabase free tier
✅ **Maintainable**: Clear separation of concerns, well-defined interfaces

The system is designed to handle 1,000+ concurrent viewers with <200ms latency while keeping infrastructure costs under $100/month.
