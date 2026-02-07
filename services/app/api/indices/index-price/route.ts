import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.error('POLYGON_API_KEY not configured');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const indexTicker = symbol.startsWith('I:') ? symbol : `I:${symbol}`;
    const url = `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=${indexTicker}&apiKey=${apiKey}`;

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Polygon API error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch index price' },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const price = result.value || result.session?.close || null;

      if (price !== null) {
        return NextResponse.json(
          {
            symbol,
            price,
            timestamp: result.session?.updated || new Date().toISOString(),
            marketStatus: result.market_status || 'unknown',
          },
          {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
              'Pragma': 'no-cache',
              'Expires': '0',
            }
          }
        );
      }
    }

    return NextResponse.json(
      { error: 'No price data available for this symbol' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error fetching index price:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
