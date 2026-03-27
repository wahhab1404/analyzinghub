import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/indices/stream-health
 *
 * Returns the streaming data freshness summary for all active trades.
 * Used by the dashboard to show stream health indicators without hitting
 * the realtime service directly (keeps the API surface clean).
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch freshness stats for active trades
    const { data: trades, error } = await supabase
      .from('index_trades')
      .select(
        'id, polygon_option_ticker, data_freshness_status, last_stream_event_at, premium_source'
      )
      .eq('status', 'active')
      .not('polygon_option_ticker', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts = { fresh: 0, degraded: 0, stale: 0, unknown: 0 };
    for (const t of trades ?? []) {
      const s = (t.data_freshness_status as keyof typeof counts) ?? 'unknown';
      if (s in counts) counts[s]++;
    }

    // Overall status = worst of all trades
    const overallStatus: string =
      counts.stale    > 0 ? 'stale'    :
      counts.degraded > 0 ? 'degraded' :
      counts.fresh    > 0 ? 'fresh'    :
      'unknown';

    return NextResponse.json({
      overall: overallStatus,
      counts,
      trades: trades ?? [],
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
