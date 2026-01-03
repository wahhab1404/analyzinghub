import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CreateAnalysisUpdateRequest } from '@/services/indices/types';

/**
 * POST /api/indices/analyses/[id]/updates
 * Post an update to an analysis
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const analysisId = params.id;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify analysis exists and user owns it
    const { data: analysis, error: analysisError } = await supabase
      .from('index_analyses')
      .select('author_id')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    if (analysis.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only post updates to your own analyses' },
        { status: 403 }
      );
    }

    const body: CreateAnalysisUpdateRequest = await request.json();

    if (!body.body) {
      return NextResponse.json(
        { error: 'Missing required field: body' },
        { status: 400 }
      );
    }

    const { data: update, error: insertError } = await supabase
      .from('analysis_updates')
      .insert({
        analysis_id: analysisId,
        author_id: user.id,
        body: body.body,
        attachment_url: body.attachment_url || null,
      })
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .single();

    if (insertError) {
      console.error('Error creating analysis update:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ update }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/analyses/[id]/updates:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
