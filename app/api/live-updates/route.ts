import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';
import { EntitlementsService } from '@/services/entitlements/entitlements.service';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, analysis_id, content, metadata } = body;

    if (!type || !content) {
      return NextResponse.json(
        { error: 'type and content are required' },
        { status: 400 }
      );
    }

    // Check entitlement
    const entitlementCheck = await EntitlementsService.checkCanPostLiveUpdate(user.id);

    if (!entitlementCheck.allowed) {
      return NextResponse.json(
        {
          error: entitlementCheck.reason,
          upgradePackage: entitlementCheck.upgradePackage,
        },
        { status: 403 }
      );
    }

    // Validate type
    if (!['analysis_update', 'spx_live', 'ndx_live'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Insert followup
    const { data, error } = await supabase
      .from('analysis_followups')
      .insert({
        analysis_id: analysis_id || null,
        author_id: user.id,
        type,
        content,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating live update:', error);
      return NextResponse.json(
        { error: 'Failed to create live update' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      update: data,
      message: 'Live update posted successfully',
    });
  } catch (error) {
    console.error('Error posting live update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const analysisId = searchParams.get('analysis_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Check if user can view live index updates
    if (type && ['spx_live', 'ndx_live'].includes(type)) {
      const entitlementCheck = await EntitlementsService.checkCanViewLiveIndexUpdates(user.id);

      if (!entitlementCheck.allowed) {
        return NextResponse.json(
          {
            error: entitlementCheck.reason,
            upgradePackage: entitlementCheck.upgradePackage,
          },
          { status: 403 }
        );
      }
    }

    let query = supabase
      .from('analysis_followups')
      .select('*, profiles:author_id(id, full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('type', type);
    }

    if (analysisId) {
      query = query.eq('analysis_id', analysisId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching live updates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch live updates' },
        { status: 500 }
      );
    }

    return NextResponse.json({ updates: data || [] });
  } catch (error) {
    console.error('Error fetching live updates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
