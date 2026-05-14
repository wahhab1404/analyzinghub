/**
 * realtime-pricing-service/src/polygon-options-ws.ts
 *
 * Production-grade Polygon.io Options WebSocket client.
 *
 * WHAT IT DOES:
 *   - Connects to wss://socket.polygon.io/options
 *   - Authenticates with POLYGON_API_KEY
 *   - Subscribes to Q.{ticker} (quotes) and T.{ticker} (trades) for each
 *     active option ticker
 *   - On every price event, computes a smart-hybrid premium and calls the
 *     process_streaming_price_update() Supabase RPC atomically
 *   - Handles reconnects with exponential backoff (max 10 attempts)
 *   - Prevents duplicate subscriptions
 *   - Falls back gracefully: on disconnect the existing DB state is preserved
 *     until reconnect or edge-function REST fallback kicks in
 *
 * ARCHITECTURE NOTE:
 *   This class owns ONLY the streaming path. Snapshot REST fallback is handled
 *   separately by the persistence service when data_freshness_status = 'stale'.
 */

import WebSocket from 'ws';
import { SupabaseClient } from '@supabase/supabase-js';
import { computeSmartHybridPrice } from './premium-calculator';
import { streamHealth } from './stream-health';
import { TelegramAlertsService, BuyRangeTrade } from './telegram-alerts';

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface PolygonQuoteEvent {
  ev: 'Q';
  sym: string;
  bp: number;   // bid price
  ap: number;   // ask price
  bs: number;   // bid size
  as: number;   // ask size
  t: number;    // SIP timestamp (nanoseconds)
  q: number;    // sequence number
}

interface PolygonTradeEvent {
  ev: 'T';
  sym: string;
  p: number;    // trade price
  s: number;    // trade size
  t: number;    // SIP timestamp (nanoseconds)
}

interface PolygonStatusEvent {
  ev: 'status';
  status: string;
  message: string;
}

type PolygonEvent = PolygonQuoteEvent | PolygonTradeEvent | PolygonStatusEvent;

/** Per-ticker pending state — batched so Q + T in same batch produce one RPC call */
interface PendingTickerState {
  bid: number | null;
  ask: number | null;
  lastTrade: number | null;
  volume: number;
  latestTimestampNs: number;
}

// ── CONFIG ────────────────────────────────────────────────────────────────────

const WS_URL = 'wss://socket.polygon.io/options';
const AUTH_TIMEOUT_MS       = 15_000;
const BASE_RECONNECT_MS     = 2_000;
const MAX_RECONNECT_MS      = 60_000;
const MAX_RECONNECT_ATTEMPTS = 15;
const FLUSH_INTERVAL_MS     = 250; // Batch events → flush to Supabase every 250 ms

// ── CLASS ─────────────────────────────────────────────────────────────────────

/** Buy-range metadata stored per trade, populated from syncActiveTrades */
interface BuyRangeMeta {
  min:         number;
  max:         number;
  channelUuid: string | null;
  authorId:    string;
  symbol:      string;
  ticker:      string;
  optionType:  string;
  strike:      number | null;
  expiry:      string | null;
  entryPrice:  number;
  analysisId:  string | null;
  analystName: string | null;
}

export class PolygonOptionsWebSocket {
  private ws: WebSocket | null = null;
  private supabase: SupabaseClient;
  private apiKey: string;
  private telegramAlerts: TelegramAlertsService | null;

  /** ticker → tradeId (for the active trades we care about) */
  private tickerToTradeId = new Map<string, string>();

  /** ticker → buy-range metadata (only for trades with pending buy-range alerts) */
  private tickerToBuyRange = new Map<string, BuyRangeMeta>();

  /** tickers currently subscribed in Polygon */
  private subscribedTickers = new Set<string>();

  /** tradeIds for which we have already resolved the Telegram channel (cache) */
  private resolvedChannels = new Map<string, string>();

  private isAuthenticated = false;
  private isConnecting    = false;
  private destroyed       = false;

  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** Pending price data per ticker, flushed to Supabase every FLUSH_INTERVAL_MS */
  private pendingUpdates = new Map<string, PendingTickerState>();
  private flushTimer: NodeJS.Timeout | null = null;

  // Rate-limit guard: how many RPC calls made in the last second
  private rpcCallsThisSecond = 0;
  private rpcRateLimitTimer: NodeJS.Timeout | null = null;
  private readonly MAX_RPC_PER_SECOND = 60;

  constructor(apiKey: string, supabase: SupabaseClient, telegramAlerts: TelegramAlertsService | null = null) {
    this.apiKey         = apiKey;
    this.supabase       = supabase;
    this.telegramAlerts = telegramAlerts;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  /** Register all active trades that should be tracked via streaming */
  setActiveTrades(trades: Array<{
    tradeId: string;
    optionTicker: string;
    buyRange?: BuyRangeMeta | null;
  }>): void {
    const newTradeMap    = new Map<string, string>();
    const newBuyRangeMap = new Map<string, BuyRangeMeta>();

    for (const t of trades) {
      const ticker = t.optionTicker.startsWith('O:')
        ? t.optionTicker
        : `O:${t.optionTicker}`;
      newTradeMap.set(ticker, t.tradeId);
      if (t.buyRange) {
        newBuyRangeMap.set(ticker, t.buyRange);
      }
    }

    // Unsubscribe tickers no longer needed
    for (const [ticker] of this.tickerToTradeId) {
      if (!newTradeMap.has(ticker) && this.subscribedTickers.has(ticker)) {
        this.sendUnsubscribe([ticker]);
        this.subscribedTickers.delete(ticker);
      }
    }

    this.tickerToTradeId    = newTradeMap;
    this.tickerToBuyRange   = newBuyRangeMap;
    streamHealth.setSubscribedCount('options', newTradeMap.size);

    // Subscribe to new tickers
    if (this.isAuthenticated) {
      const toSubscribe = Array.from(newTradeMap.keys()).filter(
        t => !this.subscribedTickers.has(t)
      );
      if (toSubscribe.length > 0) {
        this.sendSubscribe(toSubscribe);
      }
    }
  }

  connect(): void {
    if (this.destroyed || this.isConnecting || this.ws) return;
    this.isConnecting = true;

    console.log(`[OptionsWS] Connecting to ${WS_URL}...`);
    streamHealth.setConnected('options', false);

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err: any) {
      console.error('[OptionsWS] Failed to create WebSocket:', err.message);
      this.isConnecting = false;
      this.scheduleReconnect();
      return;
    }

    // Auth timeout
    const authTimeout = setTimeout(() => {
      if (!this.isAuthenticated) {
        console.error('[OptionsWS] Authentication timed out');
        this.ws?.close();
      }
    }, AUTH_TIMEOUT_MS);

    this.ws.on('open', () => {
      console.log('[OptionsWS] Connected. Authenticating...');
      this.isConnecting = false;
      streamHealth.setConnected('options', true);
      this.sendJson({ action: 'auth', params: this.apiKey });
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      clearTimeout(authTimeout);
      try {
        const events: PolygonEvent[] = JSON.parse(data.toString());
        for (const event of Array.isArray(events) ? events : [events]) {
          this.handleEvent(event);
        }
      } catch (err: any) {
        console.error('[OptionsWS] Failed to parse message:', err.message);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[OptionsWS] WebSocket error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      clearTimeout(authTimeout);
      console.warn(`[OptionsWS] Disconnected (code=${code}, reason=${reason?.toString() ?? ''})`);
      this.ws = null;
      this.isAuthenticated = false;
      this.isConnecting = false;
      this.subscribedTickers.clear();
      streamHealth.setConnected('options', false);
      streamHealth.setAuthenticated('options', false);
      streamHealth.setSubscribedCount('options', 0);
      this.stopFlush();

      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.stopFlush();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.rpcRateLimitTimer) {
      clearInterval(this.rpcRateLimitTimer);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.isAuthenticated;
  }

  // ── PRIVATE: RECONNECT ─────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[OptionsWS] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. ` +
        'Edge function REST fallback is now the primary price source.'
      );
      return;
    }

    this.reconnectAttempts++;
    streamHealth.recordReconnect('options');

    // Exponential backoff with jitter
    const base = Math.min(
      BASE_RECONNECT_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_MS
    );
    const jitter = Math.random() * 0.3 * base;
    const delay  = Math.floor(base + jitter);

    console.log(
      `[OptionsWS] Reconnecting in ${(delay / 1000).toFixed(1)}s ` +
      `(attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ── PRIVATE: EVENT HANDLING ────────────────────────────────────────────────

  private handleEvent(event: PolygonEvent): void {
    if (event.ev === 'status') {
      this.handleStatus(event as PolygonStatusEvent);
      return;
    }

    if (event.ev === 'Q') {
      const q = event as PolygonQuoteEvent;
      streamHealth.recordEvent('options');
      this.accumulatePriceData(q.sym, {
        bid: q.bp,
        ask: q.ap,
        lastTrade: null,
        volume: 0,
        timestampNs: q.t,
      });
      return;
    }

    if (event.ev === 'T') {
      const t = event as PolygonTradeEvent;
      streamHealth.recordEvent('options');
      this.accumulatePriceData(t.sym, {
        bid: null,
        ask: null,
        lastTrade: t.p,
        volume: t.s,
        timestampNs: t.t,
      });
      return;
    }
  }

  private handleStatus(event: PolygonStatusEvent): void {
    console.log(`[OptionsWS] Status: ${event.status} — ${event.message}`);

    if (event.status === 'auth_success') {
      this.isAuthenticated = true;
      this.reconnectAttempts = 0; // reset on successful auth
      streamHealth.setAuthenticated('options', true);

      // Subscribe to all active trades
      const tickers = Array.from(this.tickerToTradeId.keys());
      if (tickers.length > 0) {
        this.sendSubscribe(tickers);
      } else {
        console.log('[OptionsWS] No active trades to subscribe to at connect time');
      }

      // Start flush loop
      this.startFlush();
    }

    if (event.status === 'auth_failed') {
      console.error('[OptionsWS] Authentication failed — check POLYGON_API_KEY');
      this.ws?.close();
    }
  }

  // ── PRIVATE: PRICE ACCUMULATION ───────────────────────────────────────────

  /**
   * Accumulate bid/ask/lastTrade data for a ticker. Multiple events for the
   * same ticker within a flush interval are merged into one RPC call.
   */
  private accumulatePriceData(
    rawSym: string,
    data: { bid: number | null; ask: number | null; lastTrade: number | null; volume: number; timestampNs: number }
  ): void {
    const ticker = rawSym.startsWith('O:') ? rawSym : `O:${rawSym}`;

    // Only track tickers we care about
    if (!this.tickerToTradeId.has(ticker)) return;

    const existing = this.pendingUpdates.get(ticker) ?? {
      bid: null,
      ask: null,
      lastTrade: null,
      volume: 0,
      latestTimestampNs: 0,
    };

    // Always take the most recent bid/ask; accumulate last trade & volume
    const pending: PendingTickerState = {
      bid:               data.bid         ?? existing.bid,
      ask:               data.ask         ?? existing.ask,
      lastTrade:         data.lastTrade   ?? existing.lastTrade,
      volume:            existing.volume + data.volume,
      latestTimestampNs: Math.max(data.timestampNs, existing.latestTimestampNs),
    };

    this.pendingUpdates.set(ticker, pending);
  }

  // ── PRIVATE: FLUSH LOOP ────────────────────────────────────────────────────

  private startFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

    // Reset RPC rate-limiter every second
    this.rpcRateLimitTimer = setInterval(() => {
      this.rpcCallsThisSecond = 0;
    }, 1_000);
  }

  private stopFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.rpcRateLimitTimer) {
      clearInterval(this.rpcRateLimitTimer);
      this.rpcRateLimitTimer = null;
    }
  }

  /**
   * Flush pending price updates to Supabase via the process_streaming_price_update RPC.
   * Called every FLUSH_INTERVAL_MS.
   */
  private async flush(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    // Drain the map (swap with empty so new events accumulate while we process)
    const batch = this.pendingUpdates;
    this.pendingUpdates = new Map();

    const promises: Promise<void>[] = [];

    for (const [ticker, pending] of batch) {
      const tradeId = this.tickerToTradeId.get(ticker);
      if (!tradeId) continue;

      // Rate-limit guard
      if (this.rpcCallsThisSecond >= this.MAX_RPC_PER_SECOND) {
        console.warn('[OptionsWS] RPC rate limit hit — deferring tick for', ticker);
        // Put it back for next flush
        this.pendingUpdates.set(ticker, pending);
        continue;
      }

      const priceResult = computeSmartHybridPrice({
        bid:       pending.bid,
        ask:       pending.ask,
        lastTrade: pending.lastTrade,
      });

      if (!priceResult.isValid || priceResult.price === null) {
        console.warn(`[OptionsWS] Skipping invalid price for ${ticker}:`, priceResult.invalidReason);
        continue;
      }

      this.rpcCallsThisSecond++;

      const eventTs = pending.latestTimestampNs > 0
        ? new Date(Math.floor(pending.latestTimestampNs / 1_000_000)).toISOString()
        : new Date().toISOString();

      promises.push(this.callPriceRpc(tradeId, ticker, priceResult, pending, eventTs));
    }

    // Fire all RPC calls concurrently (already rate-limited above)
    await Promise.allSettled(promises);
  }

  private async callPriceRpc(
    tradeId: string,
    ticker: string,
    priceResult: ReturnType<typeof computeSmartHybridPrice>,
    pending: PendingTickerState,
    eventTs: string
  ): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('process_streaming_price_update', {
        p_trade_id:      tradeId,
        p_current_price: priceResult.price,
        p_premium_source: 'smart_hybrid',
        p_bid:           priceResult.bid || null,
        p_ask:           priceResult.ask || null,
        p_last_trade:    priceResult.lastTrade || null,
        p_volume:        pending.volume || null,
        p_event_ts:      eventTs,
      });

      if (error) {
        console.error(`[OptionsWS] RPC error for trade ${tradeId} (${ticker}):`, error.message);
        return;
      }

      const result = data as any;

      if (result?.skipped) {
        return; // Manual price override active — skip silently
      }

      if (result?.is_new_high) {
        console.log(
          `[OptionsWS] 📈 NEW HIGH — trade ${tradeId} (${ticker}): ` +
          `$${(result.new_high as number).toFixed(4)} | MFE: $${(result.mfe as number).toFixed(2)}`
        );
      }

      if (result?.newly_won) {
        console.log(
          `[OptionsWS] 🎉 WIN! — trade ${tradeId} (${ticker}): ` +
          `max_profit $${(result.max_profit_dollars as number).toFixed(2)}`
        );
      }

      // ── Buy-range check ─────────────────────────────────────────────────
      // On every tick, check if the live price has entered the analyst's
      // buy range. If yes — and the alert hasn't been sent — fire Telegram.
      const buyRange = this.tickerToBuyRange.get(ticker);
      if (
        buyRange &&
        priceResult.price !== null &&
        this.telegramAlerts
      ) {
        const price = priceResult.price;
        const inRange = price >= buyRange.min && price <= buyRange.max;

        if (inRange) {
          console.log(
            `[OptionsWS] 🎯 PRICE IN BUY RANGE — trade ${tradeId} ticker=${ticker} ` +
            `price=${price} range=[${buyRange.min}, ${buyRange.max}]`
          );

          // Resolve the Telegram channel id for this trade
          const channelId = await this.resolveTelegramChannel(tradeId, buyRange);

          if (channelId) {
            const alertTrade: BuyRangeTrade = {
              id:          tradeId,
              symbol:      buyRange.symbol,
              ticker:      buyRange.ticker,
              optionType:  buyRange.optionType.toUpperCase(),
              strike:      buyRange.strike,
              expiry:      buyRange.expiry,
              entryPrice:  buyRange.entryPrice,
              buyRangeMin: buyRange.min,
              buyRangeMax: buyRange.max,
              channelId,
              analysisId:  buyRange.analysisId,
              analystName: buyRange.analystName,
            };

            // Remove from map immediately to prevent duplicate concurrent calls
            this.tickerToBuyRange.delete(ticker);

            // Fire-and-forget with error guard
            this.telegramAlerts.sendBuyRangeAlert(alertTrade, price).then(res => {
              if (res.ok) {
                console.log(`[OptionsWS] ✅ Buy-range alert sent for trade ${tradeId} — image=${res.imageSent}`);
              } else {
                console.error(`[OptionsWS] ❌ Buy-range alert failed for trade ${tradeId}: ${res.error}`);
              }
            }).catch(err => {
              console.error(`[OptionsWS] ❌ Buy-range alert exception for trade ${tradeId}:`, err.message);
            });
          } else {
            console.warn(`[OptionsWS] ⚠️  No Telegram channel for trade ${tradeId} — buy-range alert skipped`);
            // Remove from map so we don't keep trying every tick
            this.tickerToBuyRange.delete(ticker);
          }
        }
      }

    } catch (err: any) {
      console.error(`[OptionsWS] Exception calling RPC for trade ${tradeId}:`, err.message);
    }
  }

  /** Resolve the Telegram channel_id string for a trade's buy-range alert */
  private async resolveTelegramChannel(tradeId: string, buyRange: BuyRangeMeta): Promise<string | null> {
    // Check in-memory cache first
    const cached = this.resolvedChannels.get(tradeId);
    if (cached) return cached;

    let channelId: string | null = null;

    // Try the specific channel assigned to this buy-range alert
    if (buyRange.channelUuid) {
      const { data } = await this.supabase
        .from('telegram_channels')
        .select('channel_id')
        .eq('id', buyRange.channelUuid)
        .eq('enabled', true)
        .maybeSingle();
      channelId = data?.channel_id ?? null;
    }

    // Fall back to the analyst's first enabled channel
    if (!channelId) {
      const { data } = await this.supabase
        .from('telegram_channels')
        .select('channel_id')
        .eq('user_id', buyRange.authorId)
        .eq('enabled', true)
        .limit(1);
      channelId = data?.[0]?.channel_id ?? null;
    }

    if (channelId) {
      this.resolvedChannels.set(tradeId, channelId);
    }

    return channelId;
  }

  // ── PRIVATE: SUBSCRIPTIONS ─────────────────────────────────────────────────

  private sendSubscribe(tickers: string[]): void {
    // Polygon options WebSocket subscription format:
    //   {"action":"subscribe","params":"Q.O:SPX251219C05900000,T.O:SPX251219C05900000"}
    const params = tickers
      .flatMap(t => [`Q.${t}`, `T.${t}`])
      .join(',');

    console.log(`[OptionsWS] Subscribing to ${tickers.length} ticker(s): ${tickers.join(', ')}`);
    this.sendJson({ action: 'subscribe', params });
    tickers.forEach(t => this.subscribedTickers.add(t));
    streamHealth.setSubscribedCount('options', this.subscribedTickers.size);
  }

  private sendUnsubscribe(tickers: string[]): void {
    const params = tickers
      .flatMap(t => [`Q.${t}`, `T.${t}`])
      .join(',');

    console.log(`[OptionsWS] Unsubscribing from ${tickers.length} ticker(s)`);
    this.sendJson({ action: 'unsubscribe', params });
    tickers.forEach(t => this.subscribedTickers.delete(t));
    streamHealth.setSubscribedCount('options', this.subscribedTickers.size);
  }

  private sendJson(payload: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[OptionsWS] sendJson called but WebSocket is not open');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }
}
