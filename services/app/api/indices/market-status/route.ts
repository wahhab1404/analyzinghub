import { NextResponse } from 'next/server';
import { getMarketStatus } from '@/lib/market-hours';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const now = new Date();
    const etTimeString = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
    });
    const etDate = new Date(etTimeString);

    const marketStatus = getMarketStatus();

    console.log('Market Status Check:', {
      serverTime: now.toISOString(),
      etTime: etDate.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        weekday: 'short'
      }),
      isOpen: marketStatus.isOpen,
      status: marketStatus.status,
      dayOfWeek: etDate.getDay(),
      hours: etDate.getHours(),
      minutes: etDate.getMinutes()
    });

    return NextResponse.json({
      ...marketStatus,
      canSetManualPrice: !marketStatus.isOpen,
      message: marketStatus.isOpen
        ? 'Live prices are being tracked during RTH'
        : 'Manual price override available outside RTH',
      debug: {
        serverTime: now.toISOString(),
        etTime: etDate.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/indices/market-status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
