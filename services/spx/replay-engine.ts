/**
 * services/spx/replay-engine.ts
 *
 * Phase 4 — SPX Replay / Backtest Engine
 *
 * Provides replay infrastructure for reviewing historical trading days.
 * Fetches minute bars from Polygon (I:SPX), loads stored signals/trades/wall
 * snapshots from Supabase, aligns all events to bar indices, and computes
 * session statistics.
 *
 * All Polygon calls use the historical aggregates endpoint:
 *   GET /v2/aggs/ticker/I:SPX/range/1/minute/{from}/{to}
 *
 * All DB reads use the service role client (bypasses RLS).
 */

import { createClient } from '@supabase/supabase-js';

// ── CLIENT ────────────────────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── POLYGON FETCH ─────────────────────────────────────────────────────────────

const POLYGON_BASE_URL = 'https://api.polygon.io';

/**
 * Internal Polygon fetch with 429-aware retry (up to 3 attempts).
 * Returns parsed JSON or throws on persistent failure.
 */
async function polygonFetch(path: string): Promise<any> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error('POLYGON_API_KEY not configured');

  const separator = path.includes('?') ? '&' : '?';
  const url = `${POLYGON_BASE_URL}${path}${separator}apiKey=${apiKey}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    });

    if (res.status === 429) {
      // Back-off: 1.5s, 3s, 4.5s
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Polygon HTTP ${res.status} for ${path}`);
    }

    return res.json();
  }

  throw new Error(`Polygon rate-limited after 3 attempts: ${path}`);
}

// ── EXPORTED TYPES ────────────────────────────────────────────────────────────

export interface ReplayBar {
  t: number;   // Unix ms timestamp
  o: number;   // open
  h: number;   // high
  l: number;   // low
  c: number;   // close (SPX price)
  v: number;   // volume
}

export interface ReplayEvent {
  id: string;
  type: 'signal' | 'trade_open' | 'trade_close' | 'wall_snapshot' | 'score_snapshot';
  ts: string;                    // ISO timestamp
  barIndex: number;              // index into bars array at the time of this event
  spxPriceAtEvent: number | null;
  data: any;                     // the raw event data
  summary: string;               // human-readable one-liner
}

export interface ReplaySession {
  date: string;                  // YYYY-MM-DD
  bars: ReplayBar[];
  events: ReplayEvent[];
  tradingDayOpen: number | null; // first bar close
  tradingDayClose: number | null; // last bar close
  tradingDayHigh: number | null;
  tradingDayLow: number | null;
  sessionRange: number | null;   // high - low
  totalEvents: number;
  signalCount: number;
  tradeCount: number;
}

export interface ReplayStats {
  // Price movement stats for the day
  openToClose: number | null;      // % change
  maxDrawdown: number | null;      // % from session high to low
  volatilityProxy: number | null;  // avg bar range as % of price
  // Signal stats for the day
  signalCount: number;
  actionableSignals: number;
  tradesOpened: number;
  tradesClosed: number;
  wins: number;
  losses: number;
}

// ── BAR ALIGNMENT HELPER ──────────────────────────────────────────────────────

/**
 * Binary-search the bars array to find the index of the bar that contains
 * the given timestamp (bars[i].t <= ts < bars[i+1].t).
 *
 * Returns -1 when ts is before the first bar or bars is empty.
 * Returns bars.length - 1 for any ts >= the last bar's timestamp.
 */
function findBarIndex(bars: ReplayBar[], tsMs: number): number {
  if (bars.length === 0) return -1;
  if (tsMs < bars[0].t) return -1;
  if (tsMs >= bars[bars.length - 1].t) return bars.length - 1;

  let lo = 0;
  let hi = bars.length - 2;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid].t <= tsMs && tsMs < bars[mid + 1].t) {
      return mid;
    }
    if (tsMs < bars[mid].t) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return lo;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Fetch historical minute bars from Polygon for a given date.
 *
 * Uses the I:SPX index ticker. The date range is [date, date+1) to capture
 * the full trading day including pre-market. Returns empty array if market
 * was closed, bars array is empty, or any API/network error occurs.
 */
export async function fetchHistoricalBars(date: string): Promise<ReplayBar[]> {
  try {
    // Compute "to" date as the next calendar day
    const fromDate = new Date(`${date}T00:00:00Z`);
    const toDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
    const toStr = toDate.toISOString().slice(0, 10);

    const path =
      `/v2/aggs/ticker/I:SPX/range/1/minute/${date}/${toStr}` +
      `?adjusted=true&sort=asc&limit=50000`;

    const json = await polygonFetch(path);

    // Polygon returns status 'OK' and results array when data exists;
    // status 'OK' with empty/missing results = market closed.
    if (!json || json.resultsCount === 0 || !Array.isArray(json.results)) {
      return [];
    }

    return (json.results as any[]).map((r) => ({
      t: r.t,
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: r.v ?? 0,
    }));
  } catch (err: any) {
    console.error(`[ReplayEngine] fetchHistoricalBars(${date}) failed:`, err.message);
    return [];
  }
}

/**
 * Load all stored events (signals, trades, wall snapshots) for a given date
 * from Supabase and align them to bar indices.
 *
 * Date range queried: [date 00:00 UTC, date+1 00:00 UTC)
 */
export async function loadSessionEvents(date: string, bars: ReplayBar[]): Promise<ReplayEvent[]> {
  const supabase = getServiceRoleClient();

  const dayStart = `${date}T00:00:00.000Z`;
  const nextDay = new Date(new Date(`${date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
  const dayEnd = nextDay.toISOString();

  const events: ReplayEvent[] = [];

  // ── 1. Signal events ─────────────────────────────────────────────────────────
  const { data: signals, error: signalError } = await supabase
    .from('spx_signal_events')
    .select(
      'id, created_at, signal_type, signal_mode, direction_bias, market_mode, ' +
      'underlying_price, composite_score, confidence_class, recommended_strike, ' +
      'recommended_expiry, recommended_option_type, rationale, expires_at, ' +
      'resolved_at, resolution_outcome',
    )
    .gte('created_at', dayStart)
    .lt('created_at', dayEnd)
    .order('created_at', { ascending: true });

  if (signalError) {
    console.error('[ReplayEngine] loadSessionEvents: signals query failed:', signalError.message);
  }

  for (const sig of signals ?? []) {
    const tsMs = new Date(sig.created_at).getTime();
    const barIndex = findBarIndex(bars, tsMs);
    const spxPrice = sig.underlying_price != null ? Number(sig.underlying_price) : null;

    const signalType: string = sig.signal_type ?? 'UNKNOWN';
    const strike = sig.recommended_strike != null ? Number(sig.recommended_strike) : null;
    const score = sig.composite_score != null ? Math.round(Number(sig.composite_score)) : null;
    const cls: string = sig.confidence_class ?? '';

    const strikePart = strike != null ? ` @ ${strike}` : '';
    const scorePart = score != null ? ` | Score ${score}` : '';
    const clsPart = cls ? ` | ${cls}` : '';

    events.push({
      id: sig.id,
      type: 'signal',
      ts: sig.created_at,
      barIndex,
      spxPriceAtEvent: spxPrice,
      data: sig,
      summary: `${signalType}${strikePart}${scorePart}${clsPart}`,
    });
  }

  // ── 2. Trades ─────────────────────────────────────────────────────────────────
  // Fetch trades that were opened (entered) or closed on this date.
  // We fetch any trade whose created_at, entry_timestamp, or exit_timestamp
  // falls within the day range.
  const { data: trades, error: tradeError } = await supabase
    .from('spx_trades')
    .select('*')
    .or(
      `and(created_at.gte.${dayStart},created_at.lt.${dayEnd}),` +
      `and(entry_timestamp.gte.${dayStart},entry_timestamp.lt.${dayEnd}),` +
      `and(exit_timestamp.gte.${dayStart},exit_timestamp.lt.${dayEnd})`,
    )
    .order('created_at', { ascending: true });

  if (tradeError) {
    console.error('[ReplayEngine] loadSessionEvents: trades query failed:', tradeError.message);
  }

  const seenTradeOpen = new Set<string>();
  const seenTradeClose = new Set<string>();

  for (const t of trades ?? []) {
    const ticker: string = t.ticker ?? '';
    const strike: string = t.strike != null ? String(t.strike) : '?';
    const optionType: string = t.option_type ?? '';
    const contractLabel = ticker || `${optionType.toUpperCase()} ${strike}`;

    // Trade open event — emit when the trade transitioned to 'entered'
    const openTs: string | null = t.entry_timestamp ?? null;
    if (openTs && !seenTradeOpen.has(t.id)) {
      seenTradeOpen.add(t.id);
      const tsMs = new Date(openTs).getTime();
      const barIndex = findBarIndex(bars, tsMs);
      const entryPremium: number | null = t.entry_premium != null ? Number(t.entry_premium) : null;
      const entrySpx: number | null = t.entry_spx_price != null ? Number(t.entry_spx_price) : null;
      const premiumPart = entryPremium != null ? ` @ $${entryPremium.toFixed(2)}` : '';
      const spxPart = entrySpx != null ? ` | SPX ${entrySpx}` : '';

      events.push({
        id: `${t.id}:open`,
        type: 'trade_open',
        ts: openTs,
        barIndex,
        spxPriceAtEvent: entrySpx,
        data: t,
        summary: `ENTERED ${contractLabel}${premiumPart}${spxPart}`,
      });
    }

    // Trade close event — emit when the trade has an exit_timestamp
    const closeTs: string | null = t.exit_timestamp ?? null;
    if (closeTs && !seenTradeClose.has(t.id)) {
      seenTradeClose.add(t.id);
      const tsMs = new Date(closeTs).getTime();
      const barIndex = findBarIndex(bars, tsMs);
      const exitPremium: number | null = t.exit_premium != null ? Number(t.exit_premium) : null;
      const exitSpx: number | null = t.exit_spx_price != null ? Number(t.exit_spx_price) : null;
      const pnlPct: number | null = t.realized_pnl_pct != null ? Number(t.realized_pnl_pct) : null;
      const exitReason: string = t.exit_reason ?? t.state ?? '';

      const premiumPart = exitPremium != null ? ` @ $${exitPremium.toFixed(2)}` : '';
      const pnlPart = pnlPct != null
        ? ` | ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`
        : '';
      const outcome: string = t.final_score_outcome ?? '';
      const outcomePart = outcome ? ` [${outcome}]` : '';

      events.push({
        id: `${t.id}:close`,
        type: 'trade_close',
        ts: closeTs,
        barIndex,
        spxPriceAtEvent: exitSpx,
        data: t,
        summary: `CLOSED ${contractLabel}${premiumPart}${pnlPart}${outcomePart} — ${exitReason}`,
      });
    }
  }

  // ── 3. Wall snapshots ─────────────────────────────────────────────────────────
  const { data: wallSnaps, error: wallError } = await supabase
    .from('spx_wall_snapshots')
    .select(
      'id, captured_at, underlying_price, call_wall_strike, call_wall_strength, ' +
      'put_wall_strike, put_wall_strength, wall_score, wall_compression, ' +
      'nearest_wall_strike, nearest_wall_side, nearest_wall_distance',
    )
    .gte('captured_at', dayStart)
    .lt('captured_at', dayEnd)
    .order('captured_at', { ascending: true });

  if (wallError) {
    console.error('[ReplayEngine] loadSessionEvents: wall_snapshots query failed:', wallError.message);
  }

  for (const snap of wallSnaps ?? []) {
    const tsMs = new Date(snap.captured_at).getTime();
    const barIndex = findBarIndex(bars, tsMs);
    const spxPrice: number | null = snap.underlying_price != null
      ? Number(snap.underlying_price)
      : null;

    const callStrike: number | null = snap.call_wall_strike != null
      ? Number(snap.call_wall_strike)
      : null;
    const callStr: number | null = snap.call_wall_strength != null
      ? Math.round(Number(snap.call_wall_strength))
      : null;
    const putStrike: number | null = snap.put_wall_strike != null
      ? Number(snap.put_wall_strike)
      : null;
    const putStr: number | null = snap.put_wall_strength != null
      ? Math.round(Number(snap.put_wall_strength))
      : null;

    const callPart = callStrike != null
      ? `Call Wall: ${callStrike}${callStr != null ? ` (str ${callStr})` : ''}`
      : 'No Call Wall';
    const putPart = putStrike != null
      ? `Put Wall: ${putStrike}${putStr != null ? ` (str ${putStr})` : ''}`
      : 'No Put Wall';

    events.push({
      id: snap.id,
      type: 'wall_snapshot',
      ts: snap.captured_at,
      barIndex,
      spxPriceAtEvent: spxPrice,
      data: snap,
      summary: `${callPart} | ${putPart}`,
    });
  }

  // ── Sort all events chronologically ──────────────────────────────────────────
  events.sort((a, b) => {
    if (a.ts < b.ts) return -1;
    if (a.ts > b.ts) return 1;
    return 0;
  });

  return events;
}

/**
 * Build a complete ReplaySession for a given date.
 * Fetches minute bars from Polygon and loads all events from Supabase,
 * then computes session-level price stats.
 */
export async function buildReplaySession(date: string): Promise<ReplaySession> {
  const [bars, rawEvents] = await Promise.all([
    fetchHistoricalBars(date),
    // We need bars first to align events, but we can start the Supabase queries
    // in parallel and align after both resolve.  However, loadSessionEvents
    // requires bars for alignment.  Fetch bars first, then load events.
    Promise.resolve(null),
  ]);

  // Now that we have bars, load and align events
  const events = await loadSessionEvents(date, bars);

  // Compute day-level OHLC from bars
  let tradingDayOpen: number | null = null;
  let tradingDayClose: number | null = null;
  let tradingDayHigh: number | null = null;
  let tradingDayLow: number | null = null;
  let sessionRange: number | null = null;

  if (bars.length > 0) {
    tradingDayOpen = bars[0].c;
    tradingDayClose = bars[bars.length - 1].c;
    tradingDayHigh = bars.reduce((max, b) => Math.max(max, b.h), -Infinity);
    tradingDayLow = bars.reduce((min, b) => Math.min(min, b.l), Infinity);
    sessionRange = tradingDayHigh - tradingDayLow;
  }

  const signalCount = events.filter((e) => e.type === 'signal').length;
  const tradeOpenCount = events.filter((e) => e.type === 'trade_open').length;
  const tradeCloseCount = events.filter((e) => e.type === 'trade_close').length;
  // tradeCount = unique trade IDs across open + close events
  const tradeIds = new Set([
    ...events.filter((e) => e.type === 'trade_open').map((e) => (e.data as any)?.id ?? e.id),
    ...events.filter((e) => e.type === 'trade_close').map((e) => (e.data as any)?.id ?? e.id),
  ]);

  return {
    date,
    bars,
    events,
    tradingDayOpen,
    tradingDayClose,
    tradingDayHigh,
    tradingDayLow,
    sessionRange,
    totalEvents: events.length,
    signalCount,
    tradeCount: tradeIds.size,
  };
}

/**
 * Get a list of available replay dates (dates that have stored signals).
 * Returns the last `limit` calendar dates (YYYY-MM-DD) that have at least
 * one signal event stored, ordered most-recent first.
 */
export async function getAvailableDates(limit: number = 30): Promise<string[]> {
  const supabase = getServiceRoleClient();

  // We need distinct dates from created_at. Supabase doesn't expose a direct
  // DATE_TRUNC via the query builder, so we fetch enough rows and deduplicate
  // in JS. Fetch limit × 50 rows to ensure coverage across sparse days.
  const fetchLimit = Math.min(limit * 50, 5000);

  const { data, error } = await supabase
    .from('spx_signal_events')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (error) {
    console.error('[ReplayEngine] getAvailableDates failed:', error.message);
    return [];
  }

  const seen = new Set<string>();
  const dates: string[] = [];

  for (const row of data ?? []) {
    if (!row.created_at) continue;
    const dateStr = (row.created_at as string).slice(0, 10);
    if (!seen.has(dateStr)) {
      seen.add(dateStr);
      dates.push(dateStr);
      if (dates.length >= limit) break;
    }
  }

  return dates;
}

/**
 * Compute stats for a replay session.
 * All percentage values are rounded to two decimal places.
 */
export function computeReplayStats(session: ReplaySession): ReplayStats {
  const { bars, events } = session;

  // ── Price stats ───────────────────────────────────────────────────────────────
  let openToClose: number | null = null;
  let maxDrawdown: number | null = null;
  let volatilityProxy: number | null = null;

  if (bars.length > 0 && session.tradingDayOpen != null && session.tradingDayClose != null) {
    openToClose = round2(
      ((session.tradingDayClose - session.tradingDayOpen) / session.tradingDayOpen) * 100,
    );
  }

  if (
    session.tradingDayHigh != null &&
    session.tradingDayLow != null &&
    session.tradingDayHigh > 0
  ) {
    maxDrawdown = round2(
      ((session.tradingDayHigh - session.tradingDayLow) / session.tradingDayHigh) * 100,
    );
  }

  if (bars.length > 0) {
    const avgBarRange =
      bars.reduce((sum, b) => sum + (b.h - b.l), 0) / bars.length;
    const refPrice = session.tradingDayOpen ?? bars[0].c;
    if (refPrice > 0) {
      volatilityProxy = round2((avgBarRange / refPrice) * 100);
    }
  }

  // ── Signal stats ──────────────────────────────────────────────────────────────
  const signalEvents = events.filter((e) => e.type === 'signal');
  const signalCount = signalEvents.length;

  // Actionable = BUY_CALL or BUY_PUT signals
  const actionableSignals = signalEvents.filter((e) => {
    const sigType: string = (e.data as any)?.signal_type ?? '';
    return sigType === 'BUY_CALL' || sigType === 'BUY_PUT';
  }).length;

  const tradesOpened = events.filter((e) => e.type === 'trade_open').length;
  const tradesClosed = events.filter((e) => e.type === 'trade_close').length;

  // Win/loss from closed trades: positive realized_pnl_pct = win
  let wins = 0;
  let losses = 0;
  for (const e of events) {
    if (e.type !== 'trade_close') continue;
    const pnl: number | null = (e.data as any)?.realized_pnl_pct != null
      ? Number((e.data as any).realized_pnl_pct)
      : null;
    if (pnl === null) continue;
    if (pnl > 0) {
      wins++;
    } else {
      losses++;
    }
  }

  return {
    openToClose,
    maxDrawdown,
    volatilityProxy,
    signalCount,
    actionableSignals,
    tradesOpened,
    tradesClosed,
    wins,
    losses,
  };
}

// ── INTERNAL HELPERS ──────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
