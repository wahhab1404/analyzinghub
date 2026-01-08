import { NextResponse } from 'next/server';
import { getMarketStatus } from '@/lib/market-hours';

export async function GET() {
  try {
    const marketStatus = getMarketStatus();

    return NextResponse.json({
      ...marketStatus,
      canSetManualPrice: !marketStatus.isOpen,
      message: marketStatus.isOpen
        ? 'Live prices are being tracked during RTH'
        : 'Manual price override available outside RTH'
    });
  } catch (error: any) {
    console.error('Error in GET /api/indices/market-status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
