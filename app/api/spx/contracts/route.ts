/**
 * GET /api/spx/contracts
 *
 * Runs the contract ranking engine for a given direction and configuration.
 * Returns best / backup / aggressive / conservative candidates.
 *
 * Query params (all optional except contractType):
 *   contractType: call | put  (required)
 *   underlying: SPX           (default: SPX)
 *   expiryPreference: 0DTE | 1DTE | weekly | any (default: any)
 *   minDTE: 0
 *   maxDTE: 7
 *   minDelta: 0.15
 *   maxDelta: 0.60
 *   maxSpreadPct: 30
 *   minOI: 100
 *   minVolume: 50
 *   minPremium: 0
 *   maxPremium: 50
 *   signalId: UUID            — link candidates to a signal event
 *
 * Auth: authenticated user required (Analyzer or SuperAdmin role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { rankContracts } from '@/services/spx/contract-ranker';
import { computeSPXFeatures } from '@/services/spx/feature-extractor';
import type { ContractRankingConfig } from '@/services/spx/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Analyzer/Admin only for contract data
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();
    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ error: 'Only analyzers can access contract ranking' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;

    const contractType = params.get('contractType') as 'call' | 'put' | null;
    if (!contractType || !['call', 'put'].includes(contractType)) {
      return NextResponse.json({ error: 'contractType must be call or put' }, { status: 400 });
    }

    const expiryPreference = (params.get('expiryPreference') || 'any') as ContractRankingConfig['expiryPreference'];
    if (!['0DTE', '1DTE', 'weekly', 'any'].includes(expiryPreference)) {
      return NextResponse.json({ error: 'Invalid expiryPreference' }, { status: 400 });
    }

    // Get live underlying price
    const features = await computeSPXFeatures({ readonly: true });
    const underlyingPrice = parseFloat(params.get('price') || '0') || features.underlying.price;

    const config: ContractRankingConfig = {
      contractType,
      underlying: (params.get('underlying') || 'SPX').toUpperCase(),
      underlyingPrice,
      signalId: params.get('signalId') || undefined,
      expiryPreference,
      minDTE: params.get('minDTE') ? parseInt(params.get('minDTE')!) : undefined,
      maxDTE: params.get('maxDTE') ? parseInt(params.get('maxDTE')!) : undefined,
      minDelta: params.get('minDelta') ? parseFloat(params.get('minDelta')!) : undefined,
      maxDelta: params.get('maxDelta') ? parseFloat(params.get('maxDelta')!) : undefined,
      maxSpreadPct: params.get('maxSpreadPct') ? parseFloat(params.get('maxSpreadPct')!) : undefined,
      minOI: params.get('minOI') ? parseInt(params.get('minOI')!) : undefined,
      minVolume: params.get('minVolume') ? parseInt(params.get('minVolume')!) : undefined,
      minPremium: params.get('minPremium') ? parseFloat(params.get('minPremium')!) : undefined,
      maxPremium: params.get('maxPremium') ? parseFloat(params.get('maxPremium')!) : undefined,
      minLiquidityScore: params.get('minLiquidityScore')
        ? parseFloat(params.get('minLiquidityScore')!)
        : undefined,
    };

    const ranking = await rankContracts(config);

    return NextResponse.json(
      { success: true, ranking, underlyingPrice },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/contracts]', err.message);
    return NextResponse.json(
      { error: err.message || 'Contract ranking failed' },
      { status: 503 },
    );
  }
}
