/**
 * GET /api/spx/engine-state
 *
 * Returns the current SPX intelligence engine state (singleton row from DB).
 * Lightweight — no Polygon calls.
 *
 * Auth: authenticated user required (any role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getEngineState } from '@/services/spx/intelligence-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const engineState = await getEngineState();

    return NextResponse.json(
      { success: true, engineState },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/engine-state]', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch engine state' },
      { status: 500 },
    );
  }
}
