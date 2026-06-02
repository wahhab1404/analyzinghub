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
// Soft threshold: after this many attempts we stop escalating the backoff, but
// we NEVER give up — a silent/zombie Polygon connection (auth ok, zero events)
// would otherwise require a manual restart to recover.
const MAX_RECONNECT_ATTEMPTS = 15;
const FLUSH_INTERVAL_MS     = 250; // Batch events → flush to Supabase every 250 ms

// ── DATA-STALENESS WATCHDOG ─────────────────────────────────────────────────
// Polygon occasionally leaves a connection authenticated and "subscribed" but
// delivers zero market events after a reconnect (e.g. a stuck/duplicate
// connection slot). The socket never closes, so the close-based reconnect never
// fires and prices silently freeze until someone restarts the service. The
// watchdog detects this — subscribed + market open + no ticks for too long —
// and forces a fresh reconnect so the service self-heals.
const WATCHDOG_INTERVAL_MS  = 30_000; // how often to check for data staleness
const DATA_STALE_TIMEOUT_MS = 90_000; // force reconnect after this much silence

/**
 * True during the US options regular session (Mon–Fri, 9:30 AM–4:15 PM ET),
 * computed via the America/New_York timezone so EST/EDT (DST) is handled
 * automatically. Used only to avoid the watchdog reconnect-looping off-hours,
 * when zero events is normal.
 */
function isOptionsMarketOpenET(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  const etMinutes = hour * 60 + parseInt(get('minute'), 10);
  return etMinutes >= 570 && etMinutes <= 975; // 9:30 AM – 4:15 PM ET
}

/**
 * Normalise a Polygon event timestamp to epoch-milliseconds.
 *
 * Polygon's `t` field arrives in different units across feeds (s / ms / µs / ns).
 * The options quote/trade feed sends Unix milliseconds, but the old code divided
 * by 1e6 (assuming nanoseconds), corrupting every timestamp to ~1970. That made
 * last_stream_event_at look ancient, so the freshness logic flagged live trades
 * as "stale" and the edge tracker fell back to once-a-minute REST polling even
 * though the WebSocket stream was healthy. Detect the unit by magnitude and fall
 * back to the receive time when the value is missing or implausible.
 */
function normalizeEventMs(ts: number): number {
  const now = Date.now();
  if (!ts || ts <= 0) return now;
  let ms: number;
  if (ts >= 1e18)      ms = Math.floor(ts / 1e6); // nanoseconds
  else if (ts >= 1e15) ms = Math.floor(ts / 1e3); // microseconds
  else if (ts >= 1e12) ms = ts;                   // milliseconds
  else if (ts >= 1e9)  ms = ts * 1e3;             // seconds
  else                 return now;                // implausible → use receive time
  // Reject values that are wildly off (clock skew / bad unit) to protect freshness.
  if (ms < now - 86_400_000 || ms > now + 3_600_000) return now;
  return ms;
}

// ── CLASS ─────────────────────────────────────────────────────────────────────

/** SPX auto-trade metadata — used to monitor TP/SL on real-time price ticks */
export interface SPXAutoTradeMeta {
  tradeId:          string;
  ticker:           string;       // O:SPX...
  optionType:       'call' | 'put';
  strike:           number | null;
  expiry:           string | null;
  dte:              number | null;
  entryPremium:     number | null;
  stopPremium:      number | null;
  target1Premium:   number | null;
  target2Premium:   number | null;
  target3Premium:   number | null;
  lastTargetAlerted: number;      // 0 / 1 / 2 / 3
  channelIds:       string[];     // auto_trade_channel_ids — only these get alerts
  signalMode:       string | null;
  confidenceClass:  string | null;
  compositeScore:   number | null;
  directionBias:    string | null;
}

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

  /** ticker → tradeId (for the active indices trades we care about) */
  private tickerToTradeId = new Map<string, string>();

  /** ticker → buy-range metadata (only for trades with pending buy-range alerts) */
  private tickerToBuyRange = new Map<string, BuyRangeMeta>();

  /** ticker → SPX auto-trade metadata (TP/SL monitored in realtime) */
  private spxAutoTradeMeta = new Map<string, SPXAutoTradeMeta>();

  /** tickers currently subscribed in Polygon */
  private subscribedTickers = new Set<string>();

  /** tradeIds for which we have already resolved the Telegram channel (cache) */
  private resolvedChannels = new Map<string, string>();

  private isAuthenticated = false;
  private isConnecting    = false;
  private destroyed       = false;

  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** Epoch-ms of the last market event (Q/T) received — drives the watchdog. */
  private lastEventAt = 0;
  private watchdogTimer: NodeJS.Timeout | null = null;

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

    // Unsubscribe tickers no longer needed — BUT only if the SPX map doesn't keep them alive
    for (const [ticker] of this.tickerToTradeId) {
      if (!newTradeMap.has(ticker) && !this.spxAutoTradeMeta.has(ticker) && this.subscribedTickers.has(ticker)) {
        this.sendUnsubscribe([ticker]);
        this.subscribedTickers.delete(ticker);
      }
    }

    this.tickerToTradeId    = newTradeMap;
    this.tickerToBuyRange   = newBuyRangeMap;
    streamHealth.setSubscribedCount('options', newTradeMap.size + this.spxAutoTradeMeta.size);

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

  /**
   * Register all live SPX auto-trades whose TP/SL should be monitored on
   * every WebSocket tick. Called by the fetcher every 30s.
   */
  setActiveSPXAutoTrades(trades: SPXAutoTradeMeta[]): void {
    const newMap = new Map<string, SPXAutoTradeMeta>();
    for (const t of trades) {
      const ticker = t.ticker.startsWith('O:') ? t.ticker : `O:${t.ticker}`;
      newMap.set(ticker, { ...t, ticker });
    }

    // Unsubscribe SPX tickers that are no longer active AND not held by indices map
    for (const [ticker] of this.spxAutoTradeMeta) {
      if (!newMap.has(ticker) && !this.tickerToTradeId.has(ticker) && this.subscribedTickers.has(ticker)) {
        this.sendUnsubscribe([ticker]);
        this.subscribedTickers.delete(ticker);
      }
    }

    this.spxAutoTradeMeta = newMap;
    streamHealth.setSubscribedCount('options', this.tickerToTradeId.size + newMap.size);

    if (this.isAuthenticated) {
      const toSubscribe = Array.from(newMap.keys()).filter(t => !this.subscribedTickers.has(t));
      if (toSubscribe.length > 0) this.sendSubscribe(toSubscribe);
    }
  }

  connect(): void {
    if (this.destroyed || this.isConnecting || this.ws) return;
    this.isConnecting = true;

    // Grace period: don't let the watchdog flag a brand-new connection before it
    // has had a chance to receive its first tick.
    this.lastEventAt = Date.now();
    this.startWatchdog();

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
    this.stopWatchdog();
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
    if (this.reconnectTimer) return; // a reconnect is already scheduled

    this.reconnectAttempts++;
    streamHealth.recordReconnect('options');

    // Past the soft threshold we keep retrying — just at the capped interval —
    // so the stream always recovers on its own without a manual restart.
    if (this.reconnectAttempts === MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[OptionsWS] ${MAX_RECONNECT_ATTEMPTS} reconnect attempts reached — ` +
        `continuing to retry every ${(MAX_RECONNECT_MS / 1000)}s. ` +
        'REST fallback is covering prices meanwhile.'
      );
    }

    // Exponential backoff with jitter, capped. Clamp the exponent so the math
    // can't overflow once attempts grow large.
    const expo = Math.min(this.reconnectAttempts - 1, 10);
    const base = Math.min(BASE_RECONNECT_MS * Math.pow(2, expo), MAX_RECONNECT_MS);
    const jitter = Math.random() * 0.3 * base;
    const delay  = Math.floor(base + jitter);

    console.log(
      `[OptionsWS] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ── PRIVATE: DATA-STALENESS WATCHDOG ───────────────────────────────────────

  private startWatchdog(): void {
    if (this.watchdogTimer) return; // single watchdog for the service lifetime
    this.watchdogTimer = setInterval(() => this.checkDataStaleness(), WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Detects a "silent" connection: authenticated and subscribed to live tickers,
   * market open, yet no Q/T event for DATA_STALE_TIMEOUT_MS. Polygon sometimes
   * leaves a connection in this zombie state after a reconnect; the socket never
   * closes so the normal reconnect path never triggers. Forcing a fresh
   * reconnect here is what lets the stream self-heal.
   */
  private checkDataStaleness(): void {
    if (this.destroyed || !this.isAuthenticated || this.ws === null) return;

    const subscribed = this.tickerToTradeId.size + this.spxAutoTradeMeta.size;
    if (subscribed === 0) return;        // nothing subscribed → no events expected
    if (!isOptionsMarketOpenET()) return; // off-hours silence is normal

    const idleMs = Date.now() - this.lastEventAt;
    if (idleMs <= DATA_STALE_TIMEOUT_MS) return;

    console.error(
      `[OptionsWS] ⚠️ Watchdog: authenticated & subscribed to ${subscribed} ticker(s) but ` +
      `received 0 market events for ${Math.round(idleMs / 1000)}s during market hours — ` +
      'forcing a fresh reconnect.'
    );

    // Treat this as a brand-new problem so backoff starts low, and reset the
    // grace clock so the new connection isn't immediately flagged again.
    this.reconnectAttempts = 0;
    this.lastEventAt = Date.now();
    this.forceReconnect();
  }

  /** Tear down the current socket; the 'close' handler schedules the reconnect. */
  private forceReconnect(): void {
    const ws = this.ws;
    if (!ws) {
      this.scheduleReconnect();
      return;
    }
    try {
      // terminate() destroys the socket immediately even if it's a zombie that
      // won't respond to a graceful close.
      ws.terminate();
    } catch {
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  // ── PRIVATE: EVENT HANDLING ────────────────────────────────────────────────

  private handleEvent(event: PolygonEvent): void {
    if (event.ev === 'status') {
      this.handleStatus(event as PolygonStatusEvent);
      return;
    }

    if (event.ev === 'Q') {
      const q = event as PolygonQuoteEvent;
      this.lastEventAt = Date.now();
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
      this.lastEventAt = Date.now();
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
      this.lastEventAt = Date.now(); // reset watchdog grace on (re)auth
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

    // Only track tickers we care about (indices trades OR SPX auto-trades)
    if (!this.tickerToTradeId.has(ticker) && !this.spxAutoTradeMeta.has(ticker)) return;

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
      const spxMeta = this.spxAutoTradeMeta.get(ticker);
      if (!tradeId && !spxMeta) continue;

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

      const eventTs = new Date(normalizeEventMs(pending.latestTimestampNs)).toISOString();

      if (tradeId) {
        promises.push(this.callPriceRpc(tradeId, ticker, priceResult, pending, eventTs));
      }
      if (spxMeta) {
        promises.push(this.processSPXAutoTradeTick(spxMeta, priceResult.price!, eventTs));
      }
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

  // ── SPX AUTO-TRADE TICK HANDLER ────────────────────────────────────────────

  /**
   * Process one realtime tick for an SPX auto-trade:
   *   1. Update spx_trades.current_premium / highest / lowest / unrealized_pnl_pct
   *   2. Check stop_premium → if hit, send Telegram stop alert + close trade
   *   3. Check target_1/2/3 in order → send target alert + close on T3
   */
  private async processSPXAutoTradeTick(
    meta: SPXAutoTradeMeta,
    currentPremium: number,
    eventTs: string,
  ): Promise<void> {
    try {
      // 1. Update premium tracking via RPC (atomic high/low + pnl)
      const { data: rpcData, error: rpcErr } = await this.supabase.rpc('spx_update_trade_premium', {
        p_trade_id:        meta.tradeId,
        p_current_premium: currentPremium,
        p_event_ts:        eventTs,
      });
      if (rpcErr) {
        // Fallback: direct UPDATE if RPC doesn't exist yet
        await this.supabase
          .from('spx_trades')
          .update({
            current_premium:    currentPremium,
            premium_updated_at: eventTs,
            updated_at:         eventTs,
          })
          .eq('id', meta.tradeId);
      }

      // 2. Check stop_premium hit
      if (meta.stopPremium != null && currentPremium <= meta.stopPremium) {
        const pnlPct = meta.entryPremium && meta.entryPremium > 0
          ? ((currentPremium - meta.entryPremium) / meta.entryPremium) * 100
          : 0;
        if (this.telegramAlerts) {
          this.telegramAlerts.sendSPXLifecycleAlert({
            type:          'stop_hit',
            ticker:        meta.ticker,
            currentPremium,
            entryPremium:  meta.entryPremium,
            pnlPct,
            channelIds:    meta.channelIds,
            tradeId:       meta.tradeId,
          }).catch((err: any) => console.error('[OptionsWS] SPX stop alert failed:', err.message));
        }
        // Close trade in DB
        await this.supabase
          .from('spx_trades')
          .update({
            state:               currentPremium > (meta.entryPremium ?? 0) ? 'closed_win' : 'closed_loss',
            exit_timestamp:      eventTs,
            exit_premium:        currentPremium,
            exit_reason:         'auto_stop_hit',
            realized_pnl_pct:    pnlPct,
            updated_at:          eventTs,
          })
          .eq('id', meta.tradeId);
        // Remove from active map so we stop alerting
        this.spxAutoTradeMeta.delete(meta.ticker);
        return;
      }

      // 3. Check target hits (in order)
      const targets: Array<[number | null, 1 | 2 | 3]> = [
        [meta.target1Premium, 1],
        [meta.target2Premium, 2],
        [meta.target3Premium, 3],
      ];
      for (const [tPremium, tNum] of targets) {
        if (tPremium == null) continue;
        if (currentPremium < tPremium) continue;
        if (meta.lastTargetAlerted >= tNum) continue;

        const pnlPct = meta.entryPremium && meta.entryPremium > 0
          ? ((currentPremium - meta.entryPremium) / meta.entryPremium) * 100
          : 0;

        if (this.telegramAlerts) {
          this.telegramAlerts.sendSPXLifecycleAlert({
            type:          'target_hit',
            targetNum:     tNum,
            ticker:        meta.ticker,
            currentPremium,
            entryPremium:  meta.entryPremium,
            pnlPct,
            channelIds:    meta.channelIds,
            tradeId:       meta.tradeId,
          }).catch((err: any) => console.error('[OptionsWS] SPX target alert failed:', err.message));
        }

        meta.lastTargetAlerted = tNum;

        await this.supabase
          .from('spx_trades')
          .update({
            last_target_alerted: tNum,
            state:               tNum === 3 ? 'closed_win' : 'active',
            ...(tNum === 3 ? {
              exit_timestamp: eventTs,
              exit_premium:   currentPremium,
              exit_reason:    'auto_target_3_hit',
              realized_pnl_pct: pnlPct,
            } : {}),
            updated_at: eventTs,
          })
          .eq('id', meta.tradeId);

        if (tNum === 3) this.spxAutoTradeMeta.delete(meta.ticker);
        break;
      }
    } catch (err: any) {
      console.error(`[OptionsWS] processSPXAutoTradeTick(${meta.tradeId}) failed:`, err.message);
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
