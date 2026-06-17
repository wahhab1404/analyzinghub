/**
 * realtime-pricing-service/src/index.ts
 *
 * Entry point for the realtime pricing service.
 *
 * Services started:
 *   - PolygonQuoteFetcher: manages both indices WS + options WS
 *   - PersistenceService: periodic Redis→Supabase sync + REST fallback for stale trades
 *   - SSEHandler: pushes live data to connected browser clients
 *   - StreamHealthTracker: monitors WS health and logs status
 */

import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { SubscriptionManager } from './subscription-manager';
import { PolygonQuoteFetcher } from './polygon-fetcher';
import { SSEHandler } from './sse-handler';
import { PersistenceService } from './persistence-service';
import { CompanyContractTracker } from './company-contract-tracker';
import { streamHealth } from './stream-health';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const PORT                  = process.env.PORT || 3001;
const POLYGON_API_KEY       = process.env.POLYGON_API_KEY;
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL             = process.env.REDIS_URL;

// ── VALIDATION ────────────────────────────────────────────────────────────────

if (!POLYGON_API_KEY) {
  console.error('FATAL: POLYGON_API_KEY not set');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

if (!REDIS_URL) {
  console.error('FATAL: REDIS_URL not set');
  process.exit(1);
}

// ── SERVICE INIT ──────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,   // required for Upstash — it closes idle check connections
  tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  retryStrategy(times: number) {
    if (times > 10) return null; // stop retrying after 10 attempts
    return Math.min(times * 200, 5000);
  },
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

const app = express();

// Wire services
// NOTE: PolygonQuoteFetcher now requires supabase for the options WS RPC calls
const subscriptionManager = new SubscriptionManager(redis, supabase);
const polygonFetcher = new PolygonQuoteFetcher(
  redis,
  POLYGON_API_KEY,
  subscriptionManager,
  supabase  // ← new: needed for process_streaming_price_update RPC
);
const persistenceService = new PersistenceService(redis, supabase, subscriptionManager);
const sseHandler = new SSEHandler(
  supabase,
  redis,
  subscriptionManager,
  polygonFetcher
);

// Company option-contract deals are tracked via Polygon REST snapshots on a
// short interval (live "via Fly.io"), mirroring index-trade tracking.
const companyContractTracker = new CompanyContractTracker(supabase, POLYGON_API_KEY);

// Start services
polygonFetcher.start();
persistenceService.start();
companyContractTracker.start();

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Detailed health check for load balancer, monitoring, and the edge-function
 * fallback decision logic.
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    const [redisPing, supabaseCheck] = await Promise.allSettled([
      redis.ping(),
      supabase.from('indices_reference').select('index_symbol').limit(1),
    ]);

    const redisOk    = redisPing.status === 'fulfilled' && redisPing.value === 'PONG';
    const supabaseOk = supabaseCheck.status === 'fulfilled' && !supabaseCheck.value.error;
    const healthSnap = streamHealth.getHealthSnapshot();

    const overallOk = redisOk && supabaseOk && healthSnap.overallStatus !== 'disconnected';
    const httpStatus = overallOk ? 200 : 503;

    res.status(httpStatus).json({
      status:               overallOk ? 'ok' : 'degraded',
      redis:                redisOk ? 'connected' : 'disconnected',
      supabase:             supabaseOk ? 'connected' : 'disconnected',
      streaming:            healthSnap,
      uptime:               process.uptime(),
      activeConnections:    sseHandler.getConnectionCount(),
      activeSubscriptions:  subscriptionManager.getActiveSymbols().length,
    });
  } catch (err: any) {
    console.error('[Health] Error:', err.message);
    res.status(503).json({ status: 'error', error: 'Service unhealthy' });
  }
});

/**
 * GET /stream?analysisId={uuid}
 * Server-Sent Events endpoint for live dashboard updates.
 */
app.get('/stream', (req: Request, res: Response) => {
  sseHandler.handleConnection(req, res);
});

/**
 * POST /persist
 * Manually trigger the Redis→Supabase persistence flush.
 * Useful for testing and graceful shutdown scripts.
 */
app.post('/persist', async (req: Request, res: Response) => {
  try {
    await persistenceService.persistAll();
    res.json({ success: true, message: 'Persistence flush triggered' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /sync
 * Trigger an immediate active-trade sync so a freshly created (or closed) trade
 * is subscribed/unsubscribed on the Polygon options + indices streams within
 * ~1s, instead of waiting for the next polling cycle. Fired (fire-and-forget)
 * by the Next.js trade-create route. Safe to call repeatedly.
 */
app.post('/sync', async (_req: Request, res: Response) => {
  try {
    await polygonFetcher.syncNow();
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Sync] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /streaming-health
 * Returns the streaming engine health snapshot in JSON.
 * Called by the Next.js /api/indices/stream-health route and by the
 * edge function to decide whether to fall back to REST polling.
 */
app.get('/streaming-health', (_req: Request, res: Response) => {
  res.json(streamHealth.getHealthSnapshot());
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Express] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[Shutdown] ${signal} received — shutting down gracefully...`);

  polygonFetcher.stop();
  persistenceService.stop();
  companyContractTracker.stop();
  streamHealth.stop();

  // Final flush of Redis → Supabase
  try {
    await persistenceService.persistAll();
    console.log('[Shutdown] Final persistence flush complete');
  } catch (err: any) {
    console.error('[Shutdown] Final flush error:', err.message);
  }

  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Realtime Pricing Service listening on port ${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   SSE:       http://localhost:${PORT}/stream?analysisId=xxx`);
  console.log(`   Stream:    http://localhost:${PORT}/streaming-health`);
});
