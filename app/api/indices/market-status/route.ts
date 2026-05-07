import { NextResponse } from 'next/server';
import { getMarketStatus } from '@/lib/market-hours';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const now = new Date();
    const marketStatus = getMarketStatus();

    // Extract ET parts the same reliable way as the library for the debug log
    const etParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour:    'numeric',
      minute:  'numeric',
      second:  'numeric',
      hour12:  false,
    }).formatToParts(now);
    const getPart = (t: string) => etParts.find(p => p.type === t)?.value ?? '?';
    const etDebug = `${getPart('weekday')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')} ET`;

    console.log('Market Status Check:', {
      serverTime: now.toISOString(),
      etTime:     etDebug,
      isOpen:     marketStatus.isOpen,
      status:     marketStatus.status,
    });

    return NextResponse.json({
      ...marketStatus,
      canSetManualPrice: !marketStatus.isOpen,
      message: marketStatus.isOpen
        ? 'Live prices are being tracked during RTH'
        : 'Manual price override available outside RTH',
      debug: {
        serverTime: now.toISOString(),
        etTime:     etDebug,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma':  'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/indices/market-status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

