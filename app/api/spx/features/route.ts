/**
 * GET /api/spx/features
 *
 * Returns the latest computed SPX feature set.
 * Triggers a fresh computation on each call (no cache).
 *
 * Query params:
 *   readonly=true  — Skip writing price history (use for read-only inspection)
 *
 * Auth: authenticated user required (any role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
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

    const readonly = request.nextUrl.searchParams.get('readonly') === 'true';

    const features = await computeSPXFeatures({ readonly });

    return NextResponse.json({ success: true, features }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (err: any) {
    console.error('[GET /api/spx/features]', err.message);
    return NextResponse.json(
      { error: err.message || 'Feature extraction failed' },
      { status: 503 },
    );
  }
}
