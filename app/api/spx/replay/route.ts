/**
 * GET /api/spx/replay
 *
 * Returns replay/backtest session data for a given historical trading date.
 *
 * Query params:
 *   date    YYYY-MM-DD  — date to replay (defaults to yesterday if missing)
 *   action  'session' | 'dates'
 *             'session' (default) — full ReplaySession + ReplayStats for the date
 *             'dates'             — list of available replay dates
 *
 * Response shapes:
 *   action=session → { success: true, session: ReplaySession, stats: ReplayStats }
 *   action=dates   → { success: true, dates: string[] }
 *
 * Auth: any authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  buildReplaySession,
  computeReplayStats,
  getAvailableDates,
} from '@/services/spx/replay-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns YYYY-MM-DD string for yesterday in UTC.
 */
function getYesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Validate a date string.
 * Returns an error message string on failure, null on success.
 *
 * Rules:
 *  - Must parse as a valid calendar date
 *  - Must not be in the future (UTC)
 *  - Must not be more than 365 days ago (UTC)
 */
function validateDate(dateStr: string): string | null {
  // Basic format check before parsing
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'date must be in YYYY-MM-DD format';
  }

  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(parsed.getTime())) {
    return `"${dateStr}" is not a valid date`;
  }

  // Verify the date round-trips (guards against 2024-02-30 etc.)
  const roundTripped = parsed.toISOString().slice(0, 10);
  if (roundTripped !== dateStr) {
    return `"${dateStr}" is not a valid calendar date`;
  }

  const nowUtc = new Date();
  // Strip time from today's UTC date for comparison
  const todayMidnightUtc = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate()),
  );

  if (parsed >= todayMidnightUtc) {
    return 'date cannot be today or in the future';
  }

  const msIn365Days = 365 * 24 * 60 * 60 * 1000;
  if (todayMidnightUtc.getTime() - parsed.getTime() > msIn365Days) {
    return 'date cannot be more than 365 days ago';
  }

  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────────
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse params ───────────────────────────────────────────────────────────
    const params = request.nextUrl.searchParams;
    const action = params.get('action') ?? 'session';

    if (action !== 'session' && action !== 'dates') {
      return NextResponse.json(
        { error: 'action must be "session" or "dates"' },
        { status: 400 },
      );
    }

    // ── action=dates ───────────────────────────────────────────────────────────
    if (action === 'dates') {
      const dates = await getAvailableDates(30);
      return NextResponse.json(
        { success: true, dates },
        { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
      );
    }

    // ── action=session ─────────────────────────────────────────────────────────
    const rawDate = params.get('date')?.trim();
    const date = rawDate && rawDate.length > 0 ? rawDate : getYesterdayUTC();

    const validationError = validateDate(date);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const session = await buildReplaySession(date);
    const stats = computeReplayStats(session);

    return NextResponse.json(
      { success: true, session, stats },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/replay]', err.message);
    return NextResponse.json(
      { error: err.message || 'Replay engine failed' },
      { status: 500 },
    );
  }
}
