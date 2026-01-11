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
      activation_enabled: analysis.activation_enabled,
      activation_type: analysis.activation_type,
      activation_price: analysis.activation_price,
      activation_timeframe: analysis.activation_timeframe,
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

    // Handle activation condition changes (only if analysis is not yet activated)
    if (analysis.activation_status === 'draft' || analysis.activation_status === 'published_inactive') {
      if (changes.hasOwnProperty('activation_enabled')) {
        updateData.activation_enabled = changes.activation_enabled;

        if (changes.activation_enabled) {
          // Validate activation fields
          if (!changes.activation_type || !changes.activation_price || !changes.activation_timeframe) {
            return NextResponse.json(
              { error: 'When activation is enabled, activation_type, activation_price, and activation_timeframe are required' },
              { status: 400 }
            );
          }

          updateData.activation_type = changes.activation_type;
          updateData.activation_price = parseFloat(changes.activation_price);
          updateData.activation_timeframe = changes.activation_timeframe;
          updateData.activation_notes = changes.activation_notes || null;

          // Update status to published_inactive if not already
          if (analysis.activation_status === 'active') {
            updateData.activation_status = 'published_inactive';
          }
        } else {
          // If disabling activation, set status to active
          updateData.activation_status = 'active';
        }
      } else if (analysis.activation_enabled) {
        // Update individual activation fields if activation is enabled
        if (changes.activation_type) updateData.activation_type = changes.activation_type;
        if (changes.activation_price) updateData.activation_price = parseFloat(changes.activation_price);
        if (changes.activation_timeframe) updateData.activation_timeframe = changes.activation_timeframe;
        if (changes.hasOwnProperty('activation_notes')) updateData.activation_notes = changes.activation_notes;
      }
    }

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
