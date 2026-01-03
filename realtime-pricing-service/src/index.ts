import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { SubscriptionManager } from './subscription-manager';
import { PolygonQuoteFetcher } from './polygon-fetcher';
import { SSEHandler } from './sse-handler';
import { PersistenceService } from './persistence-service';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3001;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REDIS_URL = process.env.REDIS_URL;

// Validate required environment variables
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

// Initialize services
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

const app = express();

// Services
const subscriptionManager = new SubscriptionManager(redis, supabase);
const polygonFetcher = new PolygonQuoteFetcher(redis, POLYGON_API_KEY, subscriptionManager);
const persistenceService = new PersistenceService(redis, supabase, subscriptionManager);
const sseHandler = new SSEHandler(
  supabase,
  redis,
  subscriptionManager,
  polygonFetcher
);

// Start services
polygonFetcher.start();
persistenceService.start();

// Middleware
app.use(express.json());

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check Redis
    const redisPing = await redis.ping();
    const redisOk = redisPing === 'PONG';

    // Check Supabase
    const { error: supabaseError } = await supabase
      .from('indices_reference')
      .select('count')
      .limit(1)
      .single();
    const supabaseOk = !supabaseError;

    // Check Polygon (simple API call)
    const polygonOk = polygonFetcher.isConnected();

    const status = redisOk && supabaseOk && polygonOk ? 'ok' : 'degraded';

    res.json({
      status,
      redis: redisOk ? 'connected' : 'disconnected',
      supabase: supabaseOk ? 'connected' : 'disconnected',
      polygon: polygonOk ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      activeConnections: sseHandler.getConnectionCount(),
      activeSubscriptions: subscriptionManager.getActiveSymbols().length,
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      error: 'Service unhealthy',
    });
  }
});

/**
 * SSE stream endpoint
 * GET /stream?analysisId={uuid}
 */
app.get('/stream', (req: Request, res: Response) => {
  sseHandler.handleConnection(req, res);
});

/**
 * Manual trigger for persistence (for testing)
 */
app.post('/persist', async (req: Request, res: Response) => {
  try {
    await persistenceService.persistAll();
    res.json({ success: true, message: 'Persistence triggered' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Stop accepting new connections
  polygonFetcher.stop();
  persistenceService.stop();

  // Flush Redis data to Supabase
  await persistenceService.persistAll();

  // Close Redis connection
  await redis.quit();

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  polygonFetcher.stop();
  persistenceService.stop();
  await persistenceService.persistAll();
  await redis.quit();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Realtime Pricing Service listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`SSE endpoint: http://localhost:${PORT}/stream?analysisId=xxx`);
});
