import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateAnalysisRequest } from '@/services/indices/types';

/**
 * GET /api/indices/analyses/[id]
 * Get a single analysis with trades and updates
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    // Fetch analysis
    const { data: analysis, error: analysisError } = await supabase
      .from('index_analyses')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url, email)
      `)
      .eq('id', id)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    // Fetch trades for this analysis
    const { data: trades, error: tradesError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .eq('analysis_id', id)
      .in('status', ['active', 'tp_hit', 'sl_hit', 'closed'])
      .order('published_at', { ascending: false, nullsFirst: false });

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
    }

    // Fetch updates for this analysis
    const { data: updates, error: updatesError } = await supabase
      .from('analysis_updates')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .eq('analysis_id', id)
      .order('created_at', { ascending: false });

    if (updatesError) {
      console.error('Error fetching updates:', updatesError);
    }

    // Increment views count (fire and forget)
    supabase
      .from('index_analyses')
      .update({ views_count: (analysis.views_count || 0) + 1 })
      .eq('id', id)
      .then(() => {})
      .catch((err) => console.error('Error updating views:', err));

    return NextResponse.json({
      analysis,
      trades: trades || [],
      updates: updates || [],
    });
  } catch (error: any) {
    console.error('Error in GET /api/indices/analyses/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/indices/analyses/[id]
 * Update an analysis
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user owns this analysis
    const { data: existing, error: fetchError } = await supabase
      .from('index_analyses')
      .select('author_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    if (existing.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only update your own analyses' },
        { status: 403 }
      );
    }

    const body: UpdateAnalysisRequest = await request.json();

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.chart_image_url !== undefined) updates.chart_image_url = body.chart_image_url;
    if (body.chart_embed_url !== undefined) updates.chart_embed_url = body.chart_embed_url;
    if (body.visibility !== undefined) updates.visibility = body.visibility;
    if (body.status !== undefined) {
      updates.status = body.status;
      // Set published_at when publishing
      if (body.status === 'published' && !existing.published_at) {
        updates.published_at = new Date().toISOString();
      }
    }

    const { data: analysis, error: updateError } = await supabase
      .from('index_analyses')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url, email)
      `)
      .single();

    if (updateError) {
      console.error('Error updating analysis:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error('Error in PATCH /api/indices/analyses/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/indices/analyses/[id]
 * Delete an analysis
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user owns this analysis
    const { data: existing, error: fetchError } = await supabase
      .from('index_analyses')
      .select('author_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    if (existing.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only delete your own analyses' },
        { status: 403 }
      );
    }

    // Delete (cascade will handle trades, updates, etc.)
    const { error: deleteError } = await supabase
      .from('index_analyses')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting analysis:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/indices/analyses/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
