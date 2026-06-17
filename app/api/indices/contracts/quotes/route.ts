import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { polygonService } from '@/services/indices/polygon.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/indices/contracts/quotes
 *
 * Fetch fresh live quotes for a batch of option contracts in one shot. Used by
 * the contract picker (AddTradeForm) to keep the prices of the contracts the
 * analyst is currently looking at near-live, without re-fetching the entire
 * option chain on every refresh.
 *
 * Body: { tickers: string[] }  // O:SPX... contract tickers (max 500)
 * Returns: { quotes: { [ticker]: { bid, ask, mid, last, volume, openInterest } } }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: 'Failed to verify user permissions' }, { status: 500 });
    }

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json(
        { error: 'Only admins and analyzers can access contract quote data' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const tickers: unknown = body?.tickers;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: 'tickers must be a non-empty array' }, { status: 400 });
    }

    // Cap to a sane upper bound so a runaway request can't fan out unboundedly.
    const cleaned = tickers
      .filter((t): t is string => typeof t === 'string' && t.startsWith('O:'))
      .slice(0, 500);

    if (cleaned.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    type Quote = { bid: number; ask: number; mid: number; last: number; volume: number; openInterest: number };
    const quotes: Record<string, Quote> = {};

    // 1) Live tick prices from the realtime options WebSocket service (Fly). This
    //    is the same real-time source the live tracker uses, so picker prices
    //    match the market. Only values with a recent tick are trusted.
    const realtimeBase = process.env.REALTIME_SERVICE_URL || process.env.NEXT_PUBLIC_REALTIME_SERVICE_URL;
    if (realtimeBase) {
      try {
        const res = await fetch(`${realtimeBase.replace(/\/$/, '')}/picker-quotes`, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: cleaned }),
          signal: AbortSignal.timeout(2500),
        });
        if (res.ok) {
          const data = await res.json();
          const now = Date.now();
          for (const [ticker, q] of Object.entries((data?.quotes ?? {}) as Record<string, any>)) {
            // Reject stale cache entries (no fresh tick within 10s) so an illiquid
            // contract falls back to REST instead of showing a frozen WS price.
            if (!q || !(q.mid > 0)) continue;
            if (typeof q.ts === 'number' && now - q.ts > 10_000) continue;
            quotes[ticker] = {
              bid: q.bid || 0,
              ask: q.ask || 0,
              mid: q.mid || 0,
              last: q.last || 0,
              volume: q.volume || 0,
              openInterest: 0, // not streamed; UI keeps its last known OI
            };
          }
        }
      } catch {
        // Realtime service unavailable/slow — fall through to REST for everything.
      }
    }

    // 2) REST snapshot fallback for any ticker without a fresh live value.
    const missing = cleaned.filter(t => !quotes[t]);
    if (missing.length > 0) {
      const rest = await polygonService.getOptionQuotesBulk(missing);
      Object.assign(quotes, rest);
    }

    return NextResponse.json(
      { quotes },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Error in POST /api/indices/contracts/quotes:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
