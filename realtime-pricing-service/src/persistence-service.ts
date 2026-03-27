/**
 * realtime-pricing-service/src/persistence-service.ts
 *
 * Handles two responsibilities:
 *
 * 1. UNDERLYING PERSISTENCE (unchanged):
 *    Periodically writes Redis underlying (index) price state to Supabase.
 *    Underlying prices come from the indices WebSocket and are stored in Redis
 *    for SSE broadcasting. Every PERSIST_INTERVAL_MS we flush them to the DB.
 *
 * 2. STALE TRADE REST FALLBACK (new):
 *    If a trade's data_freshness_status is 'stale' (no streaming event for
 *    >5 min), we fall back to REST snapshot polling for that trade and call
 *    process_streaming_price_update() to keep the DB accurate.
 *    This ensures active trades are never completely dark even when the
 *    options WebSocket is disconnected.
 *
 * NOTE: Contract high/low tracking for FRESH trades is handled entirely by
 * PolygonOptionsWebSocket → process_streaming_price_update() RPC.
 * This service only handles the underlying fields and stale-fallback case.
 */

import Redis from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';
import { SubscriptionManager } from './subscription-manager';

// ── CONFIG ────────────────────────────────────────────────────────────────────

const PERSIST_INTERVAL_MS         = 10_000;  // 10 s — underlying price flush
const FRESHNESS_CHECK_INTERVAL_MS = 60_000;  // 60 s — mark degraded/stale in DB
const REST_FALLBACK_INTERVAL_MS   = 30_000;  // 30 s — REST snapshots for stale trades
const STALE_THRESHOLD_SECONDS     = 300;     // 5 min without streaming → stale
const DEGRADED_THRESHOLD_SECONDS  = 60;      // 60 s without streaming → degraded

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE    = 'https://api.polygon.io';

// ── CLASS ─────────────────────────────────────────────────────────────────────

export class PersistenceService {
  private redis: Redis;
  private supabase: SupabaseClient;
  private subscriptionManager: SubscriptionManager;

  private persistInterval: NodeJS.Timeout | null = null;
  private freshnessInterval: NodeJS.Timeout | null = null;
  private restFallbackInterval: NodeJS.Timeout | null = null;

  constructor(
    redis: Redis,
    supabase: SupabaseClient,
    subscriptionManager: SubscriptionManager
  ) {
    this.redis = redis;
    this.supabase = supabase;
    this.subscriptionManager = subscriptionManager;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.persistInterval) return;

    this.persistInterval = setInterval(
      () => this.persistAll().catch(err => console.error('[Persist] Error:', err.message)),
      PERSIST_INTERVAL_MS
    );

    this.freshnessInterval = setInterval(
      () => this.updateFreshness().catch(err => console.error('[Freshness] Error:', err.message)),
      FRESHNESS_CHECK_INTERVAL_MS
    );

    this.restFallbackInterval = setInterval(
      () => this.runRestFallback().catch(err => console.error('[RESTFallback] Error:', err.message)),
      REST_FALLBACK_INTERVAL_MS
    );

    console.log('[Persistence] Service started');
  }

  stop(): void {
    [this.persistInterval, this.freshnessInterval, this.restFallbackInterval].forEach(t => {
      if (t) clearInterval(t);
    });
    this.persistInterval = null;
    this.freshnessInterval = null;
    this.restFallbackInterval = null;
    console.log('[Persistence] Service stopped');
  }

  // ── UNDERLYING PERSISTENCE ─────────────────────────────────────────────────

  /**
   * Flush underlying (index) price data from Redis to Supabase.
   * Contract prices are NOT flushed here — they are written by the RPC.
   */
  async persistAll(): Promise<void> {
    const allTrades = this.subscriptionManager.getAllTrades();
    if (allTrades.length === 0) return;

    const updates: any[] = [];

    for (const trade of allTrades) {
      try {
        const [underlyingCurrent, underlyingHigh, underlyingLow] = await Promise.all([
          this.redis.get(`trade:${trade.tradeId}:underlying:current`),
          this.redis.get(`trade:${trade.tradeId}:underlying:high`),
          this.redis.get(`trade:${trade.tradeId}:underlying:low`),
        ]);

        if (!underlyingCurrent) continue;

        const update: any = { id: trade.tradeId, updated_at: new Date().toISOString() };
        update.current_underlying  = parseFloat(underlyingCurrent);
        if (underlyingHigh) update.underlying_high_since = parseFloat(underlyingHigh);
        if (underlyingLow)  update.underlying_low_since  = parseFloat(underlyingLow);

        updates.push(update);
      } catch (err: any) {
        console.error(`[Persist] Error preparing trade ${trade.tradeId}:`, err.message);
      }
    }

    if (updates.length === 0) return;

    const { error } = await this.supabase
      .from('index_trades')
      .upsert(updates, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      console.error('[Persist] Supabase upsert error:', error.message);
    } else {
      console.log(`[Persist] Flushed ${updates.length} underlying price update(s)`);
    }
  }

  // ── FRESHNESS MANAGEMENT ───────────────────────────────────────────────────

  /**
   * Call the update_streaming_freshness() RPC to mark trades as
   * degraded or stale based on their last_stream_event_at timestamp.
   */
  private async updateFreshness(): Promise<void> {
    const { data, error } = await this.supabase.rpc('update_streaming_freshness', {
      p_degraded_after_seconds: DEGRADED_THRESHOLD_SECONDS,
      p_stale_after_seconds:    STALE_THRESHOLD_SECONDS,
    });

    if (error) {
      console.error('[Freshness] RPC error:', error.message);
      return;
    }

    const result = data as any;
    if (result?.stale_updated > 0 || result?.degraded_updated > 0) {
      console.warn(
        `[Freshness] Updated — stale: ${result.stale_updated}, degraded: ${result.degraded_updated}`
      );
    }
  }

  // ── REST FALLBACK ──────────────────────────────────────────────────────────

  /**
   * For trades that are 'stale' (no streaming event for >STALE_THRESHOLD),
   * poll the Polygon REST snapshot endpoint and call process_streaming_price_update.
   *
   * This keeps active trades accurate even during extended streaming outages.
   */
  private async runRestFallback(): Promise<void> {
    if (!POLYGON_API_KEY) return;

    // Find active trades with stale streaming data
    const { data: staleTrades, error } = await this.supabase
      .from('index_trades')
      .select('id, polygon_option_ticker, underlying_index_symbol')
      .eq('status', 'active')
      .eq('data_freshness_status', 'stale')
      .not('polygon_option_ticker', 'is', null);

    if (error) {
      console.error('[RESTFallback] Failed to fetch stale trades:', error.message);
      return;
    }

    if (!staleTrades || staleTrades.length === 0) return;

    console.log(`[RESTFallback] Fetching REST snapshots for ${staleTrades.length} stale trade(s)`);

    for (const trade of staleTrades) {
      try {
        const underlying = trade.underlying_index_symbol as string;
        const ticker = trade.polygon_option_ticker as string;
        const cleanTicker = ticker.startsWith('O:') ? ticker : `O:${ticker}`;

        const url =
          `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(underlying)}/` +
          `${encodeURIComponent(cleanTicker)}?apiKey=${POLYGON_API_KEY}`;

        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[RESTFallback] Snapshot HTTP ${response.status} for ${cleanTicker}`);
          continue;
        }

        const data = await response.json() as any;
        const result = data?.results;
        if (!result) continue;

        const lastQuote = result.last_quote ?? {};
        const bid  = (lastQuote.bid  ?? 0) as number;
        const ask  = (lastQuote.ask  ?? 0) as number;
        const last = (lastQuote.last_price ?? 0) as number;

        // Compute smart price
        let price: number | null = null;
        if (bid > 0 && ask > 0) {
          price = parseFloat(((bid + ask) / 2).toFixed(4));
        } else if (last > 0) {
          price = last;
        } else if (bid > 0) {
          price = bid;
        }

        if (price === null || price <= 0) {
          console.warn(`[RESTFallback] No valid price for ${cleanTicker}`);
          continue;
        }

        const { error: rpcError } = await this.supabase.rpc('process_streaming_price_update', {
          p_trade_id:       trade.id,
          p_current_price:  price,
          p_premium_source: 'snapshot',
          p_bid:            bid || null,
          p_ask:            ask || null,
          p_last_trade:     last || null,
          p_event_ts:       new Date().toISOString(),
        });

        if (rpcError) {
          console.error(`[RESTFallback] RPC error for trade ${trade.id}:`, rpcError.message);
        } else {
          console.log(`[RESTFallback] Updated stale trade ${trade.id}: $${price.toFixed(4)}`);
        }

        // Throttle between REST calls — be respectful of Polygon rate limits
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (err: any) {
        console.error(`[RESTFallback] Exception for trade ${trade.id}:`, err.message);
      }
    }
  }

  // ── FINALIZE TRADE ─────────────────────────────────────────────────────────

  /**
   * Clean up Redis state for a trade that has been closed/expired.
   */
  async finalizeTrade(tradeId: string): Promise<void> {
    const keys = [
      `trade:${tradeId}:underlying:current`,
      `trade:${tradeId}:underlying:high`,
      `trade:${tradeId}:underlying:low`,
      `trade:${tradeId}:contract:current`,
      `trade:${tradeId}:contract:high`,
      `trade:${tradeId}:contract:low`,
      `trade:${tradeId}:last_quote`,
    ];

    try {
      await this.redis.del(...keys);
      console.log(`[Persistence] Cleaned up Redis state for trade ${tradeId}`);
    } catch (err: any) {
      console.error(`[Persistence] Error cleaning up trade ${tradeId}:`, err.message);
    }
  }
}
