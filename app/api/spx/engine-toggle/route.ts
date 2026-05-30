/**
 * POST /api/spx/engine-toggle
 * Body: { enabled: boolean }
 *
 * Flips the `engine_enabled` flag in spx_settings without requiring the full
 * SettingsPanel — used by the big Start/Stop button on the Live Engine panel.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { updateSettings, getSettings } from '@/services/spx/settings-engine';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();
    const roleName = (profile as any)?.roles?.name;
    if (!['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const enabled = !!body?.enabled;

    const settings = await updateSettings({ engineEnabled: enabled }, user.id);
    return NextResponse.json({ success: true, engineEnabled: settings.engineEnabled });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const s = await getSettings();
    return NextResponse.json({ success: true, engineEnabled: s.engineEnabled, autoTradeEnabled: s.autoTradeEnabled });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
