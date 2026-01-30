import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { polygonService } from '@/services/indices/polygon.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/indices/contract-quote
 * Fetch real-time quote for a specific options contract
 *
 * Query params:
 * - ticker: O:SPX251219C05900000 (required)
 * - underlying: SPX (required)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin or analyzer
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to verify user permissions' },
        { status: 500 }
      );
    }

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json(
        { error: 'Only admins and analyzers can access contract quote data' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const ticker = searchParams.get('ticker');
    const underlying = searchParams.get('underlying');

    if (!ticker || !underlying) {
      return NextResponse.json(
        { error: 'Missing required parameters: ticker and underlying' },
        { status: 400 }
      );
    }

    console.log('Fetching quote for contract:', ticker);

    try {
      const contract = await polygonService.getOptionSnapshot(underlying, ticker);

      return NextResponse.json({
        quote: contract.quote,
        success: true,
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } catch (polygonError: any) {
      console.error('Polygon API error:', polygonError);
      return NextResponse.json(
        { error: `Failed to fetch contract quote: ${polygonError.message}` },
        { status: 503 }
      );
    }
  } catch (error: any) {
    console.error('Error in GET /api/indices/contract-quote:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
