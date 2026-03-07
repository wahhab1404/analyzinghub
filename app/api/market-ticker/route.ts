import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const POLYGON_BASE = 'https://api.polygon.io';

interface TickerResult {
  sym: string;
  val: string;
  chg: string;
  up: boolean;
}

interface MarketStatusResult {
  status: string; // 'open' | 'closed' | 'extended-hours'
  label: string;  // 'OPEN' | 'CLOSED' | 'PRE-MKT' | 'AFTER-HRS'
  isOpen: boolean;
}

async function fetchStockSnapshot(
  tickers: string[],
  apiKey: string
): Promise<Record<string, { price: number; prevClose: number }>> {
  const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Stock snapshot failed: ${res.status}`);
  const data = await res.json();
  const out: Record<string, { price: number; prevClose: number }> = {};
  for (const item of data.tickers ?? []) {
    const price = item.day?.c || item.prevDay?.c || 0;
    const prevClose = item.prevDay?.c || 0;
    out[item.ticker] = { price, prevClose };
  }
  return out;
}

async function fetchIndexSnapshot(
  tickers: string[], // e.g. ['I:VIX', 'I:DXY']
  apiKey: string
): Promise<Record<string, { price: number; prevClose: number }>> {
  const url = `${POLYGON_BASE}/v3/snapshot/indices?ticker.any_of=${tickers.join(',')}&apiKey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Index snapshot failed: ${res.status}`);
  const data = await res.json();
  const out: Record<string, { price: number; prevClose: number }> = {};
  for (const item of data.results ?? []) {
    const price = item.value || item.session?.close || 0;
    const prevClose = item.session?.previousClose || 0;
    out[item.ticker] = { price, prevClose };
  }
  return out;
}

async function fetchMarketStatus(apiKey: string): Promise<MarketStatusResult> {
  const url = `${POLYGON_BASE}/v1/marketstatus/now?apiKey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Market status failed: ${res.status}`);
  const data = await res.json();

  const nyse = data.exchanges?.nyse ?? data.market ?? 'unknown';
  let label = 'CLOSED';
  let isOpen = false;

  if (nyse === 'open') {
    label = 'OPEN';
    isOpen = true;
  } else if (nyse === 'extended-hours') {
    // Determine pre vs after by time
    const now = new Date();
    const etHour = parseInt(
      now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
    );
    label = etHour < 9 ? 'PRE-MKT' : 'AFTER-HRS';
    isOpen = false;
  }

  return { status: nyse, label, isOpen };
}

function fmt(price: number, decimals = 2): string {
  if (!price) return '—';
  return price.toFixed(decimals);
}

function fmtChange(price: number, prevClose: number): { chg: string; up: boolean } {
  if (!prevClose || !price) return { chg: '—', up: true };
  const pct = ((price - prevClose) / prevClose) * 100;
  const sign = pct >= 0 ? '+' : '';
  return { chg: `${sign}${pct.toFixed(2)}%`, up: pct >= 0 };
}

export async function GET() {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey || apiKey === 'your_polygon_api_key_here') {
    return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });
  }

  try {
    const [stocks, indices, marketStatus] = await Promise.all([
      fetchStockSnapshot(['SPY', 'QQQ', 'GLD'], apiKey),
      fetchIndexSnapshot(['I:VIX', 'I:DXY'], apiKey),
      fetchMarketStatus(apiKey),
    ]);

    const tickers: TickerResult[] = [
      (() => {
        const d = stocks['SPY'] || { price: 0, prevClose: 0 };
        return { sym: 'SPY', val: fmt(d.price), ...fmtChange(d.price, d.prevClose) };
      })(),
      (() => {
        const d = stocks['QQQ'] || { price: 0, prevClose: 0 };
        return { sym: 'QQQ', val: fmt(d.price), ...fmtChange(d.price, d.prevClose) };
      })(),
      (() => {
        const d = indices['I:VIX'] || { price: 0, prevClose: 0 };
        return { sym: 'VIX', val: fmt(d.price), ...fmtChange(d.price, d.prevClose) };
      })(),
      (() => {
        const d = stocks['GLD'] || { price: 0, prevClose: 0 };
        return { sym: 'GLD', val: fmt(d.price), ...fmtChange(d.price, d.prevClose) };
      })(),
      (() => {
        const d = indices['I:DXY'] || { price: 0, prevClose: 0 };
        return { sym: 'DXY', val: fmt(d.price, 2), ...fmtChange(d.price, d.prevClose) };
      })(),
    ];

    return NextResponse.json(
      { tickers, marketStatus },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('market-ticker error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
