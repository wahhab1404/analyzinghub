import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { SubscriptionManager, TradeSubscription } from './subscription-manager';
import { PolygonQuoteFetcher } from './polygon-fetcher';

interface SSEConnection {
  id: string;
  analysisId: string;
  res: Response;
  heartbeatInterval: NodeJS.Timeout;
}

/**
 * Handles Server-Sent Events (SSE) connections for live updates
 */
export class SSEHandler {
  private supabase: SupabaseClient;
  private redis: Redis;
  private subscriptionManager: SubscriptionManager;
  private polygonFetcher: PolygonQuoteFetcher;

  private connections = new Map<string, SSEConnection>();
  private broadcastInterval: NodeJS.Timeout | null = null;

  constructor(
    supabase: SupabaseClient,
    redis: Redis,
    subscriptionManager: SubscriptionManager,
    polygonFetcher: PolygonQuoteFetcher
  ) {
    this.supabase = supabase;
    this.redis = redis;
    this.subscriptionManager = subscriptionManager;
    this.polygonFetcher = polygonFetcher;

    // Start broadcast loop
    this.broadcastInterval = setInterval(() => this.broadcast(), 1000); // Broadcast every 1s
  }

  /**
   * Handle new SSE connection
   */
  async handleConnection(req: Request, res: Response): Promise<void> {
    const analysisId = req.query.analysisId as string;
    const authHeader = req.headers.authorization;

    if (!analysisId) {
      res.status(400).json({ error: 'Missing analysisId parameter' });
      return;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);

    // Validate JWT and check entitlements
    try {
      const { data: { user }, error: authError } = await this.supabase.auth.getUser(token);

      if (authError || !user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      // Check if user has access to this analysis
      const { data: analysis, error: analysisError } = await this.supabase
        .from('index_analyses')
        .select('id, visibility, status')
        .eq('id', analysisId)
        .single();

      if (analysisError || !analysis) {
        res.status(404).json({ error: 'Analysis not found' });
        return;
      }

      // Check visibility permissions
      if (analysis.status !== 'published') {
        res.status(403).json({ error: 'Analysis not published' });
        return;
      }

      if (analysis.visibility === 'subscribers') {
        // Check if user has active subscription or is admin/analyzer
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('role_id, roles(name)')
          .eq('id', user.id)
          .single();

        const roleName = (profile as any)?.roles?.name;
        const isAdminOrAnalyzer = roleName && ['SuperAdmin', 'Analyzer'].includes(roleName);

        if (!isAdminOrAnalyzer) {
          // Check subscription
          const { data: subscription } = await this.supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('subscriber_id', user.id)
            .eq('status', 'active')
            .gte('current_period_end', new Date().toISOString())
            .single();

          if (!subscription) {
            res.status(403).json({ error: 'Subscription required' });
            return;
          }
        }
      }

      if (analysis.visibility === 'admin_only') {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('role_id, roles(name)')
          .eq('id', user.id)
          .single();

        const roleName = (profile as any)?.roles?.name;
        if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }
      }

      // All checks passed, establish SSE connection
      await this.setupSSEConnection(analysisId, res);
    } catch (error) {
      console.error('Error handling SSE connection:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Setup SSE connection
   */
  private async setupSSEConnection(analysisId: string, res: Response): Promise<void> {
    const connectionId = `${analysisId}-${Date.now()}-${Math.random()}`;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Subscribe to analysis
    const trades = await this.subscriptionManager.subscribe(analysisId, connectionId);

    // Send initial snapshot
    const snapshot = await this.getSnapshot(trades);
    this.sendSSE(res, 'snapshot', snapshot);

    // Setup heartbeat
    const heartbeatInterval = setInterval(() => {
      this.sendSSE(res, 'heartbeat', { timestamp: new Date().toISOString() });
    }, 30000); // Every 30s

    // Store connection
    this.connections.set(connectionId, {
      id: connectionId,
      analysisId,
      res,
      heartbeatInterval,
    });

    console.log(`SSE connection established: ${connectionId} (${trades.length} trades)`);

    // Handle disconnect
    res.on('close', async () => {
      clearInterval(heartbeatInterval);
      this.connections.delete(connectionId);
      await this.subscriptionManager.unsubscribe(analysisId, connectionId);
      console.log(`SSE connection closed: ${connectionId}`);
    });
  }

  /**
   * Get initial snapshot for trades
   */
  private async getSnapshot(trades: TradeSubscription[]): Promise<any> {
    const tradeMetrics = [];

    for (const trade of trades) {
      const metrics = await this.getTradeMetrics(trade.tradeId);
      if (metrics) {
        tradeMetrics.push(metrics);
      }
    }

    return { trades: tradeMetrics };
  }

  /**
   * Get current metrics for a trade
   */
  private async getTradeMetrics(tradeId: string): Promise<any | null> {
    try {
      // Get from Redis
      const [
        underlyingCurrent,
        underlyingHigh,
        underlyingLow,
        contractCurrent,
        contractHigh,
        contractLow,
        lastQuote,
      ] = await Promise.all([
        this.redis.get(`trade:${tradeId}:underlying:current`),
        this.redis.get(`trade:${tradeId}:underlying:high`),
        this.redis.get(`trade:${tradeId}:underlying:low`),
        this.redis.get(`trade:${tradeId}:contract:current`),
        this.redis.get(`trade:${tradeId}:contract:high`),
        this.redis.get(`trade:${tradeId}:contract:low`),
        this.redis.get(`trade:${tradeId}:last_quote`),
      ]);

      return {
        trade_id: tradeId,
        underlying: {
          current: underlyingCurrent ? parseFloat(underlyingCurrent) : null,
          high: underlyingHigh ? parseFloat(underlyingHigh) : null,
          low: underlyingLow ? parseFloat(underlyingLow) : null,
        },
        contract: {
          current: contractCurrent ? parseFloat(contractCurrent) : null,
          high: contractHigh ? parseFloat(contractHigh) : null,
          low: contractLow ? parseFloat(contractLow) : null,
        },
        timestamp: lastQuote || new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error getting metrics for trade ${tradeId}:`, error);
      return null;
    }
  }

  /**
   * Broadcast updates to all connected clients
   */
  private async broadcast(): Promise<void> {
    if (this.connections.size === 0) return;

    const allTrades = this.subscriptionManager.getAllTrades();

    for (const trade of allTrades) {
      const metrics = await this.getTradeMetrics(trade.tradeId);
      if (!metrics) continue;

      // Find all connections interested in this trade's analysis
      for (const [connectionId, connection] of this.connections.entries()) {
        if (connection.analysisId === trade.analysisId) {
          this.sendSSE(connection.res, 'update', metrics);
        }
      }
    }
  }

  /**
   * Send SSE message
   */
  private sendSSE(res: Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('Error sending SSE:', error);
    }
  }

  /**
   * Get number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Stop the SSE handler
   */
  stop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    // Close all connections
    for (const [connectionId, connection] of this.connections.entries()) {
      clearInterval(connection.heartbeatInterval);
      connection.res.end();
    }

    this.connections.clear();
  }
}
