import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';
import { EntitlementsService } from '@/services/entitlements/entitlements.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const analysisId = params.id;
    const body = await request.json();
    const { price, label, notes } = body;

    if (!price || !label) {
      return NextResponse.json(
        { error: 'price and label are required' },
        { status: 400 }
      );
    }

    // Check entitlement
    const entitlementCheck = await EntitlementsService.checkCanAddExtendedTarget(user.id);

    if (!entitlementCheck.allowed) {
      return NextResponse.json(
        {
          error: entitlementCheck.reason,
          upgradePackage: entitlementCheck.upgradePackage,
        },
        { status: 403 }
      );
    }

    // Get current analysis
    const { data: analysis, error: fetchError } = await supabase
      .from('analyses')
      .select('extended_targets, analyzer_id')
      .eq('id', analysisId)
      .single();

    if (fetchError || !analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    if (analysis.analyzer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Add extended target
    const extendedTargets = analysis.extended_targets || [];
    const newTarget = {
      price: parseFloat(price),
      label,
      notes: notes || null,
      added_at: new Date().toISOString(),
    };

    extendedTargets.push(newTarget);

    const { error: updateError } = await supabase
      .from('analyses')
      .update({ extended_targets: extendedTargets })
      .eq('id', analysisId);

    if (updateError) {
      console.error('Error adding extended target:', updateError);
      return NextResponse.json(
        { error: 'Failed to add extended target' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      target: newTarget,
      message: 'Extended target added successfully',
    });
  } catch (error) {
    console.error('Error adding extended target:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient(request);
    const analysisId = params.id;

    const { data: analysis, error } = await supabase
      .from('analyses')
      .select('extended_targets')
      .eq('id', analysisId)
      .single();

    if (error || !analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      extendedTargets: analysis.extended_targets || [],
    });
  } catch (error) {
    console.error('Error fetching extended targets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
