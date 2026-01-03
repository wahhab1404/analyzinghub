import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { polygonService } from '@/services/indices/polygon.service';

/**
 * GET /api/indices/contracts
 * Fetch available options contracts for an underlying index
 *
 * Query params:
 * - underlying: SPX | NDX | DJI (required)
 * - expiry: YYYY-MM-DD (optional)
 * - optionType: call | put (optional)
 * - minStrike: number (optional)
 * - maxStrike: number (optional)
 * - minVolume: number (optional)
 * - minOpenInterest: number (optional)
 * - minPremium: number (optional)
 * - maxPremium: number (optional)
 * - limit: number (default: 100, max: 250)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin or analyzer
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json(
        { error: 'Only admins and analyzers can access contract data' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const underlying = searchParams.get('underlying');
    if (!underlying) {
      return NextResponse.json(
        { error: 'Missing required parameter: underlying' },
        { status: 400 }
      );
    }

    if (!['SPX', 'NDX', 'DJI'].includes(underlying)) {
      return NextResponse.json(
        { error: 'Invalid underlying. Must be SPX, NDX, or DJI' },
        { status: 400 }
      );
    }

    const filters: any = {
      underlying,
      limit: Math.min(parseInt(searchParams.get('limit') || '100'), 250),
    };

    if (searchParams.get('expiry')) {
      filters.expiry = searchParams.get('expiry');
    }

    if (searchParams.get('optionType')) {
      filters.optionType = searchParams.get('optionType');
    }

    if (searchParams.get('minStrike')) {
      filters.minStrike = parseFloat(searchParams.get('minStrike')!);
    }

    if (searchParams.get('maxStrike')) {
      filters.maxStrike = parseFloat(searchParams.get('maxStrike')!);
    }

    if (searchParams.get('minVolume')) {
      filters.minVolume = parseInt(searchParams.get('minVolume')!);
    }

    if (searchParams.get('minOpenInterest')) {
      filters.minOpenInterest = parseInt(searchParams.get('minOpenInterest')!);
    }

    if (searchParams.get('minPremium')) {
      filters.minPremium = parseFloat(searchParams.get('minPremium')!);
    }

    if (searchParams.get('maxPremium')) {
      filters.maxPremium = parseFloat(searchParams.get('maxPremium')!);
    }

    console.log('Fetching options chain with filters:', filters);

    try {
      const contracts = await polygonService.getOptionsChain(filters);

      return NextResponse.json({
        contracts,
        count: contracts.length,
      });
    } catch (polygonError: any) {
      console.error('Polygon API error:', polygonError);
      return NextResponse.json(
        { error: `Failed to fetch contracts: ${polygonError.message}` },
        { status: 503 }
      );
    }
  } catch (error: any) {
    console.error('Error in GET /api/indices/contracts:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
