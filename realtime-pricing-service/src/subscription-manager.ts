import Redis from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';

export interface TradeSubscription {
  tradeId: string;
  analysisId: string;
  underlyingSymbol: string; // I:SPX, I:NDX, I:DJI
  optionTicker?: string; // O:SPX251219C05900000
  instrumentType: 'options' | 'futures';
}

/**
 * Manages viewer subscriptions and symbol tracking
 */
export class SubscriptionManager {
  private redis: Redis;
  private supabase: SupabaseClient;

  // In-memory state
  private analysisViewers = new Map<string, Set<string>>(); // analysisId -> Set<connectionId>
  private symbolSubscriptions = new Map<string, Set<string>>(); // symbol -> Set<tradeId>
  private tradeMetadata = new Map<string, TradeSubscription>(); // tradeId -> metadata

  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly GRACE_PERIOD_MS = 60000; // 60s grace period

  constructor(redis: Redis, supabase: SupabaseClient) {
    this.redis = redis;
    this.supabase = supabase;

    // Start cleanup job
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Subscribe a connection to an analysis
   * Returns the list of active trades for that analysis
   */
  async subscribe(analysisId: string, connectionId: string): Promise<TradeSubscription[]> {
    // Add viewer to analysis
    if (!this.analysisViewers.has(analysisId)) {
      this.analysisViewers.set(analysisId, new Set());
    }
    this.analysisViewers.get(analysisId)!.add(connectionId);

    // Increment viewer count in Redis
    await this.redis.incr(`sub:analysis:${analysisId}:viewers`);

    // Fetch active trades for this analysis from Supabase
    const { data: trades, error } = await this.supabase
      .from('index_trades')
      .select('id, analysis_id, underlying_index_symbol, polygon_underlying_index_ticker, polygon_option_ticker, instrument_type')
      .eq('analysis_id', analysisId)
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching trades:', error);
      return [];
    }

    const subscriptions: TradeSubscription[] = [];

    for (const trade of trades || []) {
      const subscription: TradeSubscription = {
        tradeId: trade.id,
        analysisId: trade.analysis_id,
        underlyingSymbol: trade.polygon_underlying_index_ticker,
        optionTicker: trade.polygon_option_ticker || undefined,
        instrumentType: trade.instrument_type,
      };

      subscriptions.push(subscription);

      // Add to symbol subscriptions
      if (!this.symbolSubscriptions.has(subscription.underlyingSymbol)) {
        this.symbolSubscriptions.set(subscription.underlyingSymbol, new Set());
      }
      this.symbolSubscriptions.get(subscription.underlyingSymbol)!.add(trade.id);

      if (subscription.optionTicker) {
        if (!this.symbolSubscriptions.has(subscription.optionTicker)) {
          this.symbolSubscriptions.set(subscription.optionTicker, new Set());
        }
        this.symbolSubscriptions.get(subscription.optionTicker)!.add(trade.id);
      }

      // Store trade metadata
      this.tradeMetadata.set(trade.id, subscription);

      // Add to Redis
      await this.redis.sadd(`sub:symbol:${subscription.underlyingSymbol}:trades`, trade.id);
      if (subscription.optionTicker) {
        await this.redis.sadd(`sub:symbol:${subscription.optionTicker}:trades`, trade.id);
      }
    }

    return subscriptions;
  }

  /**
   * Unsubscribe a connection from an analysis
   */
  async unsubscribe(analysisId: string, connectionId: string): Promise<void> {
    const viewers = this.analysisViewers.get(analysisId);
    if (viewers) {
      viewers.delete(connectionId);
      if (viewers.size === 0) {
        this.analysisViewers.delete(analysisId);
      }
    }

    // Decrement viewer count
    const count = await this.redis.decr(`sub:analysis:${analysisId}:viewers`);
    if (count <= 0) {
      await this.redis.del(`sub:analysis:${analysisId}:viewers`);

      // Mark for cleanup after grace period
      await this.redis.setex(
        `sub:analysis:${analysisId}:last_viewer`,
        Math.ceil(this.GRACE_PERIOD_MS / 1000),
        Date.now().toString()
      );
    }
  }

  /**
   * Get all active symbols that have viewers
   */
  getActiveSymbols(): string[] {
    return Array.from(this.symbolSubscriptions.keys());
  }

  /**
   * Get trades subscribed to a symbol
   */
  getTradesForSymbol(symbol: string): string[] {
    const trades = this.symbolSubscriptions.get(symbol);
    return trades ? Array.from(trades) : [];
  }

  /**
   * Get trade metadata
   */
  getTrade(tradeId: string): TradeSubscription | undefined {
    return this.tradeMetadata.get(tradeId);
  }

  /**
   * Get all active trades
   */
  getAllTrades(): TradeSubscription[] {
    return Array.from(this.tradeMetadata.values());
  }

  /**
   * Check if a symbol has active viewers
   */
  hasViewers(symbol: string): boolean {
    return this.symbolSubscriptions.has(symbol);
  }

  /**
   * Cleanup stale subscriptions
   */
  private async cleanup(): Promise<void> {
    // Clean up analyses with no viewers after grace period
    const keys = await this.redis.keys('sub:analysis:*:last_viewer');

    for (const key of keys) {
      const analysisId = key.split(':')[2];

      // Check if grace period has expired (Redis TTL will handle this automatically)
      const exists = await this.redis.exists(key);
      if (!exists) {
        // Grace period expired, remove symbol subscriptions
        const { data: trades } = await this.supabase
          .from('index_trades')
          .select('id, polygon_underlying_index_ticker, polygon_option_ticker')
          .eq('analysis_id', analysisId)
          .eq('status', 'active');

        for (const trade of trades || []) {
          const underlying = trade.polygon_underlying_index_ticker;
          const option = trade.polygon_option_ticker;

          // Remove from symbol subscriptions
          this.symbolSubscriptions.get(underlying)?.delete(trade.id);
          if (this.symbolSubscriptions.get(underlying)?.size === 0) {
            this.symbolSubscriptions.delete(underlying);
          }

          if (option) {
            this.symbolSubscriptions.get(option)?.delete(trade.id);
            if (this.symbolSubscriptions.get(option)?.size === 0) {
              this.symbolSubscriptions.delete(option);
            }
          }

          // Remove trade metadata
          this.tradeMetadata.delete(trade.id);

          // Clean up Redis
          await this.redis.srem(`sub:symbol:${underlying}:trades`, trade.id);
          if (option) {
            await this.redis.srem(`sub:symbol:${option}:trades`, trade.id);
          }
        }
      }
    }
  }

  /**
   * Stop the subscription manager
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
