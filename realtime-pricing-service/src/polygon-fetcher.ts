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

const UNDERLYING_DB_FLUSH_MS   = 1_000; // Persist current_underlying to DB at most 1×/s per index
const UNDERLYING_REST_POLL_MS  = 3_000; // REST safety poll for the underlying index value
const UNDERLYING_WS_STALE_MS   = 8_000; // If no V tick within this window, REST takes over

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

  // Underlying index streaming, driven by active trades (not by SSE viewers) so
  // current_underlying stays live in the DB even when no dashboard is open.
  private activeUnderlyings = new Map<string, Set<string>>(); // I:SPX -> {tradeId,...}
  private indicesSubscribed = new Set<string>();              // V.<ticker> currently subscribed
  private lastUnderlyingWsMs = new Map<string, number>();     // I:SPX -> last V event (ms)
  private underlyingFlush = new Map<string, number>();        // I:SPX -> latest price pending DB write
  private underlyingDbTimer: NodeJS.Timeout | null = null;
  private underlyingRestTimer: NodeJS.Timeout | null = null;

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
    const appBaseUrl = process.env.APP_BASE_URL ?? 'https://analyzinghub.com';
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
    this.startUnderlyingDbFlush();
    this.startUnderlyingRestLoop();
  }

  stop(): void {
    streamHealth.stop();
    this.stopTradeSyncLoop();
    this.optionsWs.destroy();

    if (this.underlyingDbTimer)   clearInterval(this.underlyingDbTimer);
    if (this.underlyingRestTimer) clearInterval(this.underlyingRestTimer);

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

        // Subscribe to the underlying index of every active trade (independent of
        // whether a dashboard viewer is connected). reconcile handles the diff.
        this.indicesSubscribed.clear();
        this.reconcileIndicesSubscriptions();
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

      // Queue a debounced DB write so current_underlying stays live for the
      // active trades on this index, regardless of SSE viewers.
      if (quote.price > 0) {
        this.lastUnderlyingWsMs.set(quote.symbol, Date.now());
        this.underlyingFlush.set(quote.symbol, quote.price);
      }

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
    Promise.all([
      this.syncActiveTrades().catch(err => console.error('[FetcherSync] Initial sync failed:', err.message)),
      this.syncActiveSPXAutoTrades().catch(err => console.error('[FetcherSync] Initial SPX sync failed:', err.message)),
    ]);

    this.tradeSyncTimer = setInterval(async () => {
      await Promise.allSettled([
        this.syncActiveTrades().catch(err => console.error('[FetcherSync] Sync failed:', err.message)),
        this.syncActiveSPXAutoTrades().catch(err => console.error('[FetcherSync] SPX sync failed:', err.message)),
      ]);
    }, ACTIVE_TRADE_SYNC_INTERVAL_MS);
  }

  /**
   * Fetch all live SPX auto-trades and hand them to the options WS so it
   * monitors TP/SL on every tick.
   */
  private async syncActiveSPXAutoTrades(): Promise<void> {
    const { data: trades, error } = await this.supabase
      .from('spx_trades')
      .select(
        'id, ticker, option_type, strike, expiry, dte, entry_premium, current_premium, ' +
        'stop_premium, target_1_premium, target_2_premium, target_3_premium, last_target_alerted, ' +
        'auto_channel_ids, signal_mode, confidence_class, composite_score, direction_bias',
      )
      .eq('is_auto', true)
      .in('state', ['alerted', 'entered', 'active'])
      .not('ticker', 'is', null);

    if (error) {
      console.error('[FetcherSync] Failed to fetch SPX auto-trades:', error.message);
      return;
    }

    const mapped = (trades ?? [])
      .filter((t: any) => Array.isArray(t.auto_channel_ids) && t.auto_channel_ids.length > 0)
      .map((t: any) => ({
        tradeId:           t.id as string,
        ticker:            t.ticker as string,
        optionType:        (t.option_type ?? 'call') as 'call' | 'put',
        strike:            t.strike != null ? Number(t.strike) : null,
        expiry:            t.expiry ?? null,
        dte:               t.dte != null ? Number(t.dte) : null,
        entryPremium:      t.entry_premium != null ? Number(t.entry_premium) : (t.current_premium != null ? Number(t.current_premium) : null),
        stopPremium:       t.stop_premium != null ? Number(t.stop_premium) : null,
        target1Premium:    t.target_1_premium != null ? Number(t.target_1_premium) : null,
        target2Premium:    t.target_2_premium != null ? Number(t.target_2_premium) : null,
        target3Premium:    t.target_3_premium != null ? Number(t.target_3_premium) : null,
        lastTargetAlerted: Number(t.last_target_alerted ?? 0),
        channelIds:        t.auto_channel_ids as string[],
        signalMode:        t.signal_mode ?? null,
        confidenceClass:   t.confidence_class ?? null,
        compositeScore:    t.composite_score != null ? Number(t.composite_score) : null,
        directionBias:     t.direction_bias ?? null,
      }));

    console.log(`[FetcherSync] Synced ${mapped.length} SPX auto-trade(s) for realtime monitoring`);
    this.optionsWs.setActiveSPXAutoTrades(mapped);
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

    // Build the underlying-index → tradeIds map and (re)subscribe the indices WS.
    const nextUnderlyings = new Map<string, Set<string>>();
    for (const t of trades ?? []) {
      let ticker = (t as any).polygon_underlying_index_ticker as string | null;
      if (!ticker) {
        const sym = ((t as any).underlying_index_symbol ?? (t.analysis as any)?.index_symbol) as string | undefined;
        ticker = sym ? `I:${sym}` : null;
      }
      if (!ticker) continue;
      if (!ticker.startsWith('I:')) ticker = `I:${ticker}`;
      if (!nextUnderlyings.has(ticker)) nextUnderlyings.set(ticker, new Set());
      nextUnderlyings.get(ticker)!.add(t.id as string);
    }
    this.activeUnderlyings = nextUnderlyings;
    this.reconcileIndicesSubscriptions();
  }

  // ── UNDERLYING INDEX STREAMING (DB-backed, viewer-independent) ───────────────

  /** Diff the desired underlying subscriptions against the live ones. */
  private reconcileIndicesSubscriptions(): void {
    if (!this.indicesWs || !this.indicesWsConnected) return;

    const desired = new Set(this.activeUnderlyings.keys());
    const toAdd    = [...desired].filter(s => !this.indicesSubscribed.has(s));
    const toRemove = [...this.indicesSubscribed].filter(s => !desired.has(s));

    if (toAdd.length > 0) {
      this.indicesWs.send(JSON.stringify({ action: 'subscribe', params: toAdd.map(s => `V.${s}`).join(',') }));
      toAdd.forEach(s => this.indicesSubscribed.add(s));
      console.log(`[IndicesWS] Subscribed to ${toAdd.length} index value channel(s):`, toAdd);
    }
    if (toRemove.length > 0) {
      this.indicesWs.send(JSON.stringify({ action: 'unsubscribe', params: toRemove.map(s => `V.${s}`).join(',') }));
      toRemove.forEach(s => this.indicesSubscribed.delete(s));
    }
    streamHealth.setSubscribedCount('indices', this.indicesSubscribed.size);
  }

  private startUnderlyingDbFlush(): void {
    this.underlyingDbTimer = setInterval(() => {
      this.flushUnderlyingToDb().catch(err =>
        console.error('[IndicesWS] Underlying DB flush failed:', err.message)
      );
    }, UNDERLYING_DB_FLUSH_MS);
  }

  private async flushUnderlyingToDb(): Promise<void> {
    if (this.underlyingFlush.size === 0) return;
    const batch = this.underlyingFlush;
    this.underlyingFlush = new Map();
    for (const [symbol, price] of batch) {
      const tradeIds = this.activeUnderlyings.get(symbol);
      if (tradeIds && tradeIds.size > 0) {
        await this.writeUnderlyingPrice([...tradeIds], price);
      }
    }
  }

  private async writeUnderlyingPrice(tradeIds: string[], price: number): Promise<void> {
    if (!(price > 0) || tradeIds.length === 0) return;
    const { error } = await this.supabase
      .from('index_trades')
      .update({ current_underlying: price })
      .in('id', tradeIds)
      .eq('status', 'active');
    if (error) console.error('[IndicesWS] current_underlying update failed:', error.message);
  }

  /**
   * REST safety poll: keeps current_underlying live even when the Polygon
   * indices WebSocket delivers no events (e.g. the plan lacks the indices
   * entitlement). Only polls indexes whose WS feed is stale.
   */
  private startUnderlyingRestLoop(): void {
    this.underlyingRestTimer = setInterval(() => {
      this.pollUnderlyingRest().catch(err =>
        console.error('[IndicesWS] Underlying REST poll failed:', err.message)
      );
    }, UNDERLYING_REST_POLL_MS);
  }

  private async pollUnderlyingRest(): Promise<void> {
    const now = Date.now();
    const symbols = [...this.activeUnderlyings.keys()].filter(
      s => now - (this.lastUnderlyingWsMs.get(s) ?? 0) > UNDERLYING_WS_STALE_MS
    );
    if (symbols.length === 0) return;

    const url =
      `https://api.polygon.io/v3/snapshot/indices` +
      `?ticker.any_of=${encodeURIComponent(symbols.join(','))}&apiKey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) return;
    const data: any = await res.json();
    if (data.status !== 'OK' || !Array.isArray(data.results)) return;

    for (const r of data.results) {
      const symbol = r.ticker as string;
      const price  = Number(r.value ?? r.session?.close ?? 0);
      const tradeIds = this.activeUnderlyings.get(symbol);
      if (price > 0 && tradeIds && tradeIds.size > 0) {
        await this.writeUnderlyingPrice([...tradeIds], price);
      }
    }
  }
}
