/**
 * app/api/spx/settings/route.ts
 *
 * GET  /api/spx/settings  — Returns current SPX engine settings (any authenticated user)
 * PATCH /api/spx/settings — Updates settings (Analyzer / SuperAdmin only)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSettings, updateSettings } from '@/services/spx/settings-engine';

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    console.error('[GET /api/spx/settings]', err);
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Role check — Analyzer or SuperAdmin only
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.roles?.name;
    if (!['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: insufficient role' },
        { status: 403 },
      );
    }

    // Parse body
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const settings = await updateSettings(body, user.id);
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    console.error('[PATCH /api/spx/settings]', err);
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}
