/**
 * realtime-pricing-service/src/company-contract-tracker.ts
 *
 * Live tracking for STANDALONE COMPANY OPTION-CONTRACT DEALS (contract_trades,
 * scope='company'). Runs on Fly.io and continuously refreshes each active
 * deal's current price and high-watermark peak (max_price_since_entry) from the
 * Polygon options REST snapshot, auto-closing deals that hit a target or stop.
 *
 * This mirrors the index-trade tracking pipeline but for company contracts, so
 * company option deals are followed live "via Fly.io" exactly like index deals.
 * Supabase Realtime then pushes the updated rows to the dashboard instantly.
 */

import { SupabaseClient } from '@supabase/supabase-js';

const POLL_INTERVAL_MS = 4_000; // 4 s — live refresh cadence
const THROTTLE_MS = 200;        // between Polygon REST calls
const POLYGON_BASE = 'https://api.polygon.io';

interface CompanyContractRow {
  id: string;
  symbol: string;
  direction: string;
  polygon_option_ticker: string | null;
  entry_price: number;
  max_price_since_entry: number | null;
  targets: Array<{ level?: number; price?: number }> | null;
  stoploss: { level?: number; price?: number } | null;
}

export class CompanyContractTracker {
  private supabase: SupabaseClient;
  private apiKey: string;
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(supabase: SupabaseClient, apiKey: string) {
    this.supabase = supabase;
    this.apiKey = apiKey;
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.tick().catch(err => console.error('[CompanyContractTracker] tick error:', err?.message));
    }, POLL_INTERVAL_MS);
    console.log('[CompanyContractTracker] Started');
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    console.log('[CompanyContractTracker] Stopped');
  }

  private async tick(): Promise<void> {
    if (!this.apiKey) return;
    if (this.running) return; // skip overlapping runs
    this.running = true;
    try {
      const { data, error } = await this.supabase
        .from('contract_trades')
        .select('id, symbol, direction, polygon_option_ticker, entry_price, max_price_since_entry, targets, stoploss')
        .eq('scope', 'company')
        .eq('status', 'ACTIVE')
        .not('polygon_option_ticker', 'is', null);

      if (error) {
        console.error('[CompanyContractTracker] load error:', error.message);
        return;
      }

      const trades = (data || []) as CompanyContractRow[];
      if (trades.length === 0) return;

      const priceCache = new Map<string, number | null>();

      for (const trade of trades) {
        const ticker = trade.polygon_option_ticker!;
        let price: number | null;
        if (priceCache.has(ticker)) {
          price = priceCache.get(ticker) ?? null;
        } else {
          price = await this.fetchPrice(trade.symbol, ticker);
          priceCache.set(ticker, price);
          await this.sleep(THROTTLE_MS);
        }
        if (price == null || price <= 0) continue;

        const updates: Record<string, unknown> = {
          current_price: price,
          last_price_update_at: new Date().toISOString(),
        };

        if (trade.max_price_since_entry == null || price > trade.max_price_since_entry) {
          updates.max_price_since_entry = price;
        }

        const target = trade.targets?.[0];
        const targetPrice = target?.level ?? target?.price;
        const stopPrice = trade.stoploss?.level ?? trade.stoploss?.price;
        if (targetPrice != null && price >= targetPrice) {
          updates.status = 'CLOSED';
          updates.close_reason = 'TARGET_WIN';
          updates.close_time = new Date().toISOString();
        } else if (stopPrice != null && price <= stopPrice) {
          updates.status = 'CLOSED';
          updates.close_reason = 'STOPLOSS';
          updates.close_time = new Date().toISOString();
        }

        const { error: updErr } = await this.supabase
          .from('contract_trades')
          .update(updates)
          .eq('id', trade.id);

        if (updErr) {
          console.error(`[CompanyContractTracker] update error for ${trade.id}:`, updErr.message);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async fetchPrice(underlying: string, ticker: string): Promise<number | null> {
    try {
      const clean = ticker.startsWith('O:') ? ticker : `O:${ticker}`;
      const url =
        `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(underlying)}/` +
        `${encodeURIComponent(clean)}?apiKey=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json() as any;
      const r = data?.results;
      if (!r) return null;
      const bid = r.last_quote?.bid ?? 0;
      const ask = r.last_quote?.ask ?? 0;
      const last = r.last_trade?.price ?? r.day?.close ?? 0;
      if (bid > 0 && ask > 0) return parseFloat(((bid + ask) / 2).toFixed(4));
      if (last > 0) return last;
      if (bid > 0) return bid;
      return null;
    } catch (err: any) {
      console.error('[CompanyContractTracker] fetch error:', err?.message);
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
