/**
 * GET /api/spx/walls
 *
 * Returns the current wall engine output for SPX.
 * Triggers a fresh computation; also returns the last N wall snapshots
 * from spx_wall_snapshots for history display.
 *
 * Query params:
 *   price=5500     — underlying price override (optional; if omitted, fetched live)
 *   history=10     — number of past snapshots to return (default: 10, max: 50)
 *
 * Auth: authenticated user required (any role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeWallEngine } from '@/services/spx/wall-engine';
import { computeSPXFeatures } from '@/services/spx/feature-extractor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const historyCount = Math.min(50, parseInt(params.get('history') || '10'));

    // Determine underlying price
    let underlyingPrice: number;
    const priceParam = params.get('price');
    if (priceParam) {
      underlyingPrice = parseFloat(priceParam);
      if (isNaN(underlyingPrice) || underlyingPrice <= 0) {
        return NextResponse.json({ error: 'Invalid price parameter' }, { status: 400 });
      }
    } else {
      // Fetch live price via feature extractor (readonly — no history write)
      const features = await computeSPXFeatures({ readonly: true });
      underlyingPrice = features.underlying.price;
    }

    const walls = await computeWallEngine(underlyingPrice);

    // Load snapshot history
    const serviceClient = createServiceRoleClient();
    const { data: snapshotHistory } = await serviceClient
      .from('spx_wall_snapshots')
      .select(
        'id, captured_at, underlying_price, call_wall_strike, call_wall_strength, ' +
        'put_wall_strike, put_wall_strength, wall_score, wall_compression, ' +
        'nearest_wall_strike, nearest_wall_side, nearest_wall_distance',
      )
      .order('captured_at', { ascending: false })
      .limit(historyCount);

    return NextResponse.json(
      {
        success: true,
        walls,
        snapshotHistory: snapshotHistory ?? [],
      },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/walls]', err.message);
    return NextResponse.json(
      { error: err.message || 'Wall engine failed' },
      { status: 503 },
    );
  }
}
