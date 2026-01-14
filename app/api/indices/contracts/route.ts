import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { optionsChainService } from '@/services/indices/options-chain.service';
import { optionsCacheService } from '@/services/indices/options-cache.service';

/**
 * GET /api/indices/contracts
 * Fetch curated options contracts with ATM-centered strike selection
 *
 * NEW IMPLEMENTATION:
 * - Uses Polygon Option Chain Snapshot API (includes pricing + underlying)
 * - ATM-centered strike selection algorithm
 * - Auto-detects strike increments
 * - DTE filtering (days to expiration)
 * - Liquidity filtering (volume/OI)
 * - Supabase caching with TTL
 * - Grouped by expiration with curated strikes
 *
 * Query params:
 * - underlying: SPX | NDX | DJI (required)
 * - direction: call | put (required)
 * - percentBand: % around ATM (default: 3, range: 1-10)
 * - minDTE: min days to expiration (default: 0)
 * - maxDTE: max days to expiration (default: 45)
 * - maxExpirations: max expirations to return (default: 5)
 * - strikesPerExpiration: strikes per expiration (default: 8)
 * - includeOneITM: include 1 ITM strike (default: true)
 * - minVolume: minimum volume filter (default: 0)
 * - minOpenInterest: minimum OI filter (default: 0)
 * - cacheTTL: cache TTL in seconds (default: 60)
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
        { error: 'Only admins and analyzers can access contract data' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Validate required parameters
    const underlying = searchParams.get('underlying')?.toUpperCase().trim();
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

    const direction = searchParams.get('direction') || searchParams.get('optionType');
    if (!direction || !['call', 'put'].includes(direction)) {
      return NextResponse.json(
        { error: 'Missing or invalid required parameter: direction (call or put)' },
        { status: 400 }
      );
    }

    // Build enhanced config
    const config: any = {
      underlying,
      contractType: direction as 'call' | 'put',
    };

    // Parse optional parameters with validation
    if (searchParams.get('percentBand')) {
      const percentBand = parseFloat(searchParams.get('percentBand')!);
      if (percentBand > 0 && percentBand <= 0.20) {
        config.percentBand = percentBand;
      } else {
        return NextResponse.json(
          { error: 'percentBand must be between 0 and 0.20 (0-20%)' },
          { status: 400 }
        );
      }
    }

    if (searchParams.get('minDTE')) {
      config.minDTE = Math.max(0, parseInt(searchParams.get('minDTE')!));
    }

    if (searchParams.get('maxDTE')) {
      config.maxDTE = Math.min(365, parseInt(searchParams.get('maxDTE')!));
    }

    if (searchParams.get('maxExpirations')) {
      config.maxExpirations = Math.min(10, parseInt(searchParams.get('maxExpirations')!));
    }

    if (searchParams.get('strikesPerExpiration')) {
      config.strikesPerExpiration = Math.min(100, parseInt(searchParams.get('strikesPerExpiration')!));
    }

    if (searchParams.get('includeOneITM') !== null) {
      config.includeOneITM = searchParams.get('includeOneITM') === 'true';
    }

    if (searchParams.get('minVolume')) {
      config.minVolume = parseInt(searchParams.get('minVolume')!);
    }

    if (searchParams.get('minOpenInterest')) {
      config.minOpenInterest = parseInt(searchParams.get('minOpenInterest')!);
    }

    const cacheTTL = parseInt(searchParams.get('cacheTTL') || '60');
    const bypassCache = searchParams.get('bypassCache') === 'true';

    console.log('[API /indices/contracts] Request config:', JSON.stringify(config, null, 2));

    try {
      // Check cache first (unless bypass is requested)
      let response;
      if (!bypassCache) {
        response = await optionsCacheService.get(config);

        if (response) {
          console.log('[API /indices/contracts] Cache hit');
          return NextResponse.json(response);
        }
      } else {
        console.log('[API /indices/contracts] Cache bypassed');
      }

      // Cache miss - fetch from Polygon
      console.log('[API /indices/contracts] Cache miss - fetching from Polygon');
      response = await optionsChainService.getOptionsChain(config);

      // Cache the response
      await optionsCacheService.set(config, response, cacheTTL);

      return NextResponse.json(response);
    } catch (error: any) {
      console.error('[API /indices/contracts] Error:', error);
      return NextResponse.json(
        {
          error: error.message || 'Failed to fetch options chain',
          details: error.toString(),
        },
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
