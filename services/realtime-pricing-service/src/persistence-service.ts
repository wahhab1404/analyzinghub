import Redis from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';
import { SubscriptionManager } from './subscription-manager';

/**
 * Periodically persists Redis data to Supabase
 * Reduces DB writes from 1000s/sec to ~10s/min
 */
export class PersistenceService {
  private redis: Redis;
  private supabase: SupabaseClient;
  private subscriptionManager: SubscriptionManager;

  private persistInterval: NodeJS.Timeout | null = null;
  private readonly PERSIST_INTERVAL_MS = 10000; // 10s for real-time updates

  constructor(
    redis: Redis,
    supabase: SupabaseClient,
    subscriptionManager: SubscriptionManager
  ) {
    this.redis = redis;
    this.supabase = supabase;
    this.subscriptionManager = subscriptionManager;
  }

  /**
   * Start periodic persistence
   */
  start(): void {
    if (this.persistInterval) return;

    this.persistInterval = setInterval(async () => {
      await this.persistAll();
    }, this.PERSIST_INTERVAL_MS);

    console.log('Persistence service started');
  }

  /**
   * Stop periodic persistence
   */
  stop(): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }

    console.log('Persistence service stopped');
  }

  /**
   * Persist all active trades to Supabase
   */
  async persistAll(): Promise<void> {
    const allTrades = this.subscriptionManager.getAllTrades();

    if (allTrades.length === 0) {
      return;
    }

    console.log(`Persisting ${allTrades.length} trades to Supabase...`);

    const updates = [];

    for (const trade of allTrades) {
      try {
        // Get current values from Redis
        const [
          underlyingCurrent,
          underlyingHigh,
          underlyingLow,
          contractCurrent,
          contractHigh,
          contractLow,
          lastQuote,
        ] = await Promise.all([
          this.redis.get(`trade:${trade.tradeId}:underlying:current`),
          this.redis.get(`trade:${trade.tradeId}:underlying:high`),
          this.redis.get(`trade:${trade.tradeId}:underlying:low`),
          this.redis.get(`trade:${trade.tradeId}:contract:current`),
          this.redis.get(`trade:${trade.tradeId}:contract:high`),
          this.redis.get(`trade:${trade.tradeId}:contract:low`),
          this.redis.get(`trade:${trade.tradeId}:last_quote`),
        ]);

        // Check if we have data to persist
        if (!underlyingCurrent && !contractCurrent) {
          continue;
        }

        // Build update object
        const update: any = {
          updated_at: new Date().toISOString(),
        };

        if (underlyingCurrent) update.current_underlying = parseFloat(underlyingCurrent);
        if (underlyingHigh) update.underlying_high_since = parseFloat(underlyingHigh);
        if (underlyingLow) update.underlying_low_since = parseFloat(underlyingLow);
        if (contractCurrent) update.current_contract = parseFloat(contractCurrent);
        if (contractHigh) update.contract_high_since = parseFloat(contractHigh);
        if (contractLow) update.contract_low_since = parseFloat(contractLow);
        if (lastQuote) update.last_quote_at = lastQuote;

        updates.push({
          id: trade.tradeId,
          ...update,
        });
      } catch (error) {
        console.error(`Error preparing persistence for trade ${trade.tradeId}:`, error);
      }
    }

    if (updates.length === 0) {
      return;
    }

    // Batch update to Supabase
    try {
      // Use service role to bypass RLS
      const { error } = await this.supabase
        .from('index_trades')
        .upsert(updates, {
          onConflict: 'id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Error persisting to Supabase:', error);
      } else {
        console.log(`Successfully persisted ${updates.length} trades`);
      }
    } catch (error) {
      console.error('Error in batch upsert:', error);
    }
  }

  /**
   * Persist and finalize a closed trade
   */
  async finalizeTrade(tradeId: string): Promise<void> {
    try {
      // Get final values from Redis
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

      // Build final update
      const update: any = {
        updated_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      };

      if (underlyingCurrent) update.current_underlying = parseFloat(underlyingCurrent);
      if (underlyingHigh) update.underlying_high_since = parseFloat(underlyingHigh);
      if (underlyingLow) update.underlying_low_since = parseFloat(underlyingLow);
      if (contractCurrent) update.current_contract = parseFloat(contractCurrent);
      if (contractHigh) update.contract_high_since = parseFloat(contractHigh);
      if (contractLow) update.contract_low_since = parseFloat(contractLow);
      if (lastQuote) update.last_quote_at = lastQuote;

      // Update Supabase
      const { error } = await this.supabase
        .from('index_trades')
        .update(update)
        .eq('id', tradeId);

      if (error) {
        console.error(`Error finalizing trade ${tradeId}:`, error);
      } else {
        console.log(`Finalized trade ${tradeId}`);
      }

      // Clean up Redis
      await this.redis.del(
        `trade:${tradeId}:underlying:current`,
        `trade:${tradeId}:underlying:high`,
        `trade:${tradeId}:underlying:low`,
        `trade:${tradeId}:contract:current`,
        `trade:${tradeId}:contract:high`,
        `trade:${tradeId}:contract:low`,
        `trade:${tradeId}:last_quote`
      );
    } catch (error) {
      console.error(`Error finalizing trade ${tradeId}:`, error);
    }
  }
}
