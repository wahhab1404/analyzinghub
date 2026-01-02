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
    const { edit_note, changes } = body;

    if (!edit_note || !changes) {
      return NextResponse.json(
        { error: 'edit_note and changes are required' },
        { status: 400 }
      );
    }

    // Check entitlement
    const entitlementCheck = await EntitlementsService.checkCanEditAnalysis(
      user.id,
      analysisId
    );

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
      .select('*')
      .eq('id', analysisId)
      .eq('analyzer_id', user.id)
      .single();

    if (fetchError || !analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Create snapshot
    const beforeSnapshot = {
      direction: analysis.direction,
      entry_price: analysis.entry_price,
      stop_loss: analysis.stop_loss,
      target_1: analysis.target_1,
      target_2: analysis.target_2,
      target_3: analysis.target_3,
      description: analysis.description,
    };

    // Apply changes
    const updateData: any = {};
    if (changes.direction) updateData.direction = changes.direction;
    if (changes.entry_price) updateData.entry_price = changes.entry_price;
    if (changes.stop_loss) updateData.stop_loss = changes.stop_loss;
    if (changes.target_1) updateData.target_1 = changes.target_1;
    if (changes.target_2) updateData.target_2 = changes.target_2;
    if (changes.target_3) updateData.target_3 = changes.target_3;
    if (changes.description) updateData.description = changes.description;

    updateData.is_edited = true;
    updateData.last_edited_at = new Date().toISOString();

    // Update analysis
    const { error: updateError } = await supabase
      .from('analyses')
      .update(updateData)
      .eq('id', analysisId);

    if (updateError) {
      console.error('Error updating analysis:', updateError);
      return NextResponse.json(
        { error: 'Failed to update analysis' },
        { status: 500 }
      );
    }

    // Insert audit record (using service role for this)
    const { error: auditError } = await supabase
      .from('analysis_edits_audit')
      .insert({
        analysis_id: analysisId,
        editor_id: user.id,
        edit_note,
        before_snapshot: beforeSnapshot,
        after_snapshot: { ...beforeSnapshot, ...updateData },
      });

    if (auditError) {
      console.error('Error inserting audit record:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: 'Analysis updated successfully',
    });
  } catch (error) {
    console.error('Error editing analysis:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
