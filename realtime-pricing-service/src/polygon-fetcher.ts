/**
 * realtime-pricing-service/src/polygon-fetcher.ts
 *
 * Orchestrates all Polygon data sources for the realtime service:
 *   - PolygonOptionsWebSocket: streams Q/T events for active option contracts
 *     → updates contract_high_since, mfe, mae, etc. via process_streaming_price_update RPC
 *   - Indices WebSocket: streams V events for SPX/NDX/DJI index values
 *     → stores in Redis for SSE broadcast
 *
 * The old REST polling loop for options has been REMOVED. Options price
 * tracking is now entirely driven by the WebSocket stream.
 *
 * REST snapshot fallback is triggered by the persistence service when
 * data_freshness_status transitions to 'stale'.
 */

import WebSocket from 'ws';
import Redis from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';
import { SubscriptionManager } from './subscription-manager';
import { PolygonOptionsWebSocket } from './polygon-options-ws';
import { streamHealth } from './stream-health';
import { TelegramAlertsService } from './telegram-alerts';

// ── CONFIG ────────────────────────────────────────────────────────────────────

const INDICES_WS_URL          = 'wss://socket.polygon.io/indices';
const INDICES_RECONNECT_MS    = 5_000;
const INDICES_AUTH_TIMEOUT_MS = 15_000;

const ACTIVE_TRADE_SYNC_INTERVAL_MS = 30_000; // Re-sync active trades every 30 s

// ── MAIN CLASS ────────────────────────────────────────────────────────────────

export class PolygonQuoteFetcher {
  private redis: Redis;
  private apiKey: string;
  private supabase: SupabaseClient;
  private subscriptionManager: SubscriptionManager;

  // Indices WebSocket (unchanged architecture)
  private indicesWs: WebSocket | null = null;
  private indicesWsConnected = false;
  private indicesReconnectTimer: NodeJS.Timeout | null = null;

  // Options WebSocket (new)
  private optionsWs: PolygonOptionsWebSocket;

  // Periodic job to re-sync active trades with the options WS
  private tradeSyncTimer: NodeJS.Timeout | null = null;

  constructor(
    redis: Redis,
    apiKey: string,
    subscriptionManager: SubscriptionManager,
    supabase: SupabaseClient
  ) {
    this.redis                = redis;
    this.apiKey               = apiKey;
    this.supabase             = supabase;
    this.subscriptionManager  = subscriptionManager;

    // Build TelegramAlertsService if bot token + base URL are available
    const botToken   = process.env.TELEGRAM_BOT_TOKEN ?? '';
    const appBaseUrl = process.env.APP_BASE_URL ?? 'https://analyzhub.com';
    const telegramAlerts = botToken
      ? new TelegramAlertsService(botToken, appBaseUrl, supabase)
      : null;

    if (!botToken) {
      console.warn('[PolygonFetcher] TELEGRAM_BOT_TOKEN not set — buy-range Telegram alerts disabled');
    }

    this.optionsWs = new PolygonOptionsWebSocket(apiKey, supabase, telegramAlerts);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  start(): void {
    streamHealth.start();
    this.connectIndicesWebSocket();
    this.optionsWs.connect();
    this.startTradeSyncLoop();
  }

  stop(): void {
    streamHealth.stop();
    this.stopTradeSyncLoop();
    this.optionsWs.destroy();

    if (this.indicesWs) {
      this.indicesWs.close();
      this.indicesWs = null;
    }
    if (this.indicesReconnectTimer) {
      clearTimeout(this.indicesReconnectTimer);
    }
  }

  isConnected(): boolean {
    return this.indicesWsConnected || this.optionsWs.isConnected();
  }

  isOptionsConnected(): boolean {
    return this.optionsWs.isConnected();
  }

  // ── INDICES WEBSOCKET ──────────────────────────────────────────────────────

  private connectIndicesWebSocket(): void {
    if (this.indicesWs) return;

    console.log('[IndicesWS] Connecting to', INDICES_WS_URL);
    streamHealth.setConnected('indices', false);

    try {
      this.indicesWs = new WebSocket(INDICES_WS_URL);
    } catch (err: any) {
      console.error('[IndicesWS] Failed to create WebSocket:', err.message);
      this.scheduleIndicesReconnect();
      return;
    }

    const authTimeout = setTimeout(() => {
      if (!this.indicesWsConnected) {
        console.error('[IndicesWS] Auth timeout');
        this.indicesWs?.close();
      }
    }, INDICES_AUTH_TIMEOUT_MS);

    this.indicesWs.on('open', () => {
      console.log('[IndicesWS] Connected. Authenticating...');
      streamHealth.setConnected('indices', true);
      this.indicesWs!.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
    });

    this.indicesWs.on('message', async (data: WebSocket.Data) => {
      clearTimeout(authTimeout);
      try {
        const messages = JSON.parse(data.toString());
        for (const msg of Array.isArray(messages) ? messages : [messages]) {
          await this.handleIndicesMessage(msg);
        }
      } catch (err: any) {
        console.error('[IndicesWS] Parse error:', err.message);
      }
    });

    this.indicesWs.on('error', (err) => {
      console.error('[IndicesWS] Error:', err.message);
    });

    this.indicesWs.on('close', () => {
      clearTimeout(authTimeout);
      console.warn('[IndicesWS] Disconnected');
      this.indicesWs = null;
      this.indicesWsConnected = false;
      streamHealth.setConnected('indices', false);
      streamHealth.setAuthenticated('indices', false);
      this.scheduleIndicesReconnect();
    });
  }

  private async handleIndicesMessage(msg: any): Promise<void> {
    if (msg.ev === 'status') {
      console.log(`[IndicesWS] Status: ${msg.status} — ${msg.message}`);

      if (msg.status === 'auth_success') {
        this.indicesWsConnected = true;
        streamHealth.setAuthenticated('indices', true);

        // Subscribe to active index symbols
        const activeSymbols = this.subscriptionManager.getActiveSymbols();
        const indexSymbols = activeSymbols.filter((s: string) => s.startsWith('I:'));

        if (indexSymbols.length > 0) {
          const params = indexSymbols.join(',');
          this.indicesWs!.send(JSON.stringify({ action: 'subscribe', params }));
          console.log(`[IndicesWS] Subscribed to ${indexSymbols.length} index symbol(s):`, indexSymbols);
          streamHealth.setSubscribedCount('indices', indexSymbols.length);
        }
      }
      return;
    }

    // Index value event: {ev:"V", T:"I:SPX", val:5432.1, t:1704000000000}
    if (msg.ev === 'V' && msg.T && msg.val) {
      streamHealth.recordEvent('indices');

      const quote = {
        symbol:    msg.T as string,
        price:     msg.val as number,
        timestamp: new Date(msg.t as number).toISOString(),
      };

      // Store in Redis for SSE broadcasts
      await this.redis.setex(
        `quote:${quote.symbol}`,
        300,  // 5 min TTL
        JSON.stringify({ price: quote.price, timestamp: quote.timestamp })
      );

      // Update trade underlying tracking via Redis
      const tradeIds = this.subscriptionManager.getTradesForSymbol(quote.symbol);
      for (const tradeId of tradeIds) {
        await this.updateUnderlyingInRedis(tradeId, quote.price, quote.timestamp);
      }
    }
  }

  private async updateUnderlyingInRedis(
    tradeId: string,
    price: number,
    timestamp: string
  ): Promise<void> {
    const [currentHigh, currentLow] = await Promise.all([
      this.redis.get(`trade:${tradeId}:underlying:high`),
      this.redis.get(`trade:${tradeId}:underlying:low`),
    ]);

    const updates: Array<Promise<any>> = [
      this.redis.setex(`trade:${tradeId}:underlying:current`, 300, price.toString()),
      this.redis.setex(`trade:${tradeId}:last_quote`, 300, timestamp),
    ];

    if (!currentHigh || price > parseFloat(currentHigh)) {
      updates.push(this.redis.set(`trade:${tradeId}:underlying:high`, price.toString()));
    }
    if (!currentLow || price < parseFloat(currentLow)) {
      updates.push(this.redis.set(`trade:${tradeId}:underlying:low`, price.toString()));
    }

    await Promise.all(updates);
  }

  private scheduleIndicesReconnect(): void {
    this.indicesReconnectTimer = setTimeout(() => {
      console.log('[IndicesWS] Reconnecting...');
      this.connectIndicesWebSocket();
    }, INDICES_RECONNECT_MS);
  }

  // ── TRADE SYNC LOOP ────────────────────────────────────────────────────────

  /**
   * Periodically fetches all active trades from Supabase and updates the
   * options WebSocket subscription list. This handles:
   *   - new trades published while the service is running
   *   - trades that were closed (removes subscription)
   */
  private startTradeSyncLoop(): void {
    // Run immediately on start
    this.syncActiveTrades().catch(err =>
      console.error('[FetcherSync] Initial sync failed:', err.message)
    );

    this.tradeSyncTimer = setInterval(async () => {
      await this.syncActiveTrades().catch(err =>
        console.error('[FetcherSync] Sync failed:', err.message)
      );
    }, ACTIVE_TRADE_SYNC_INTERVAL_MS);
  }

  private stopTradeSyncLoop(): void {
    if (this.tradeSyncTimer) {
      clearInterval(this.tradeSyncTimer);
      this.tradeSyncTimer = null;
    }
  }

  private async syncActiveTrades(): Promise<void> {
    // Fetch active trades including buy-range fields so the options WS can
    // trigger near-realtime alerts when price enters the analyst-defined range.
    const { data: trades, error } = await this.supabase
      .from('index_trades')
      .select(`
        id,
        polygon_option_ticker,
        polygon_underlying_index_ticker,
        instrument_type,
        underlying_index_symbol,
        strike,
        expiry,
        option_type,
        direction,
        entry_price,
        entry_contract_snapshot,
        buy_range_min,
        buy_range_max,
        buy_range_status,
        buy_range_alert_sent,
        buy_range_telegram_channel_id,
        author_id,
        analysis_id,
        author:profiles!author_id(full_name),
        analysis:index_analyses(id, index_symbol)
      `)
      .eq('status', 'active')
      .not('polygon_option_ticker', 'is', null);

    if (error) {
      console.error('[FetcherSync] Failed to fetch active trades:', error.message);
      return;
    }

    const activeTrades = (trades ?? []).map(t => {
      // Resolve the Telegram channel id synchronously (stored in buy_range_telegram_channel_id
      // as a UUID; the options WS will look it up when needed, or fall back to author's channel).
      const snap       = (t.entry_contract_snapshot as any) ?? {};
      const entryPrice = parseFloat(snap.price ?? snap.mid ?? snap.last ?? '0') || 0;

      return {
        tradeId:      t.id as string,
        optionTicker: t.polygon_option_ticker as string,
        // Buy-range fields for realtime alert checking
        buyRange: (t.buy_range_min && t.buy_range_max && t.buy_range_status === 'pending' && !t.buy_range_alert_sent)
          ? {
              min:          Number(t.buy_range_min),
              max:          Number(t.buy_range_max),
              channelUuid:  t.buy_range_telegram_channel_id as string | null,
              authorId:     t.author_id as string,
              symbol:       ((t.analysis as any)?.index_symbol ?? t.underlying_index_symbol ?? '') as string,
              ticker:       (t.polygon_option_ticker ?? '') as string,
              optionType:   (t.option_type ?? t.direction ?? '') as string,
              strike:       t.strike ? Number(t.strike) : null,
              expiry:       t.expiry ? new Date(t.expiry).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null,
              entryPrice,
              analysisId:   ((t.analysis as any)?.id ?? t.analysis_id ?? null) as string | null,
              analystName:  ((t.author as any)?.full_name ?? null) as string | null,
            }
          : null,
      };
    });

    const withBuyRange = activeTrades.filter(t => t.buyRange !== null).length;
    console.log(`[FetcherSync] Synced ${activeTrades.length} active trade(s) — ${withBuyRange} with pending buy-range alerts`);
    this.optionsWs.setActiveTrades(activeTrades);
  }
}
