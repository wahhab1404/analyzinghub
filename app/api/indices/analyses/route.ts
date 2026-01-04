import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CreateAnalysisRequest, IndexAnalysisWithAuthor } from '@/services/indices/types';

/**
 * GET /api/indices/analyses
 * List all accessible index analyses
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);

    const indexSymbol = searchParams.get('index_symbol');
    const status = searchParams.get('status') || 'published';
    const visibility = searchParams.get('visibility');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get current user to check their role and subscriptions
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let query = supabase
      .from('index_analyses')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url, email)
      `)
      .eq('status', status)
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (indexSymbol) {
      query = query.eq('index_symbol', indexSymbol);
    }

    if (visibility) {
      query = query.eq('visibility', visibility);
    }

    // If user is authenticated, check if they're a trader and filter by subscriptions
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id, roles(name)')
        .eq('id', user.id)
        .single();

      const roleName = (profile as any)?.roles?.name;

      // If user is a Trader, only show analyses from subscribed analyzers
      if (roleName === 'Trader') {
        // Get list of analysts the user is subscribed to
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('analyst_id')
          .eq('subscriber_id', user.id)
          .eq('status', 'active');

        const subscribedAnalystIds = subscriptions?.map(s => s.analyst_id) || [];

        // If trader has no subscriptions, return empty array
        if (subscribedAnalystIds.length === 0) {
          return NextResponse.json({ analyses: [] });
        }

        // Filter analyses by subscribed analyzers
        query = query.in('author_id', subscribedAnalystIds);
      }
      // Analyzers and Admins can see all analyses (no additional filter needed)
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching analyses:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Count active trades for each analysis
    const analysesWithCounts = await Promise.all(
      (data || []).map(async (analysis) => {
        const { count: tradesCount } = await supabase
          .from('index_trades')
          .select('*', { count: 'exact', head: true })
          .eq('analysis_id', analysis.id);

        const { count: activeTradesCount } = await supabase
          .from('index_trades')
          .select('*', { count: 'exact', head: true })
          .eq('analysis_id', analysis.id)
          .eq('status', 'active');

        return {
          ...analysis,
          trades_count: tradesCount || 0,
          active_trades_count: activeTradesCount || 0,
        };
      })
    );

    return NextResponse.json({ analyses: analysesWithCounts });
  } catch (error: any) {
    console.error('Error in GET /api/indices/analyses:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/indices/analyses
 * Create a new index analysis
 */
export async function POST(request: NextRequest) {
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
        { error: 'Only admins and analyzers can create analyses' },
        { status: 403 }
      );
    }

    const body: CreateAnalysisRequest = await request.json();

    // Validate required fields
    if (!body.index_symbol || !body.title || !body.body) {
      return NextResponse.json(
        { error: 'Missing required fields: index_symbol, title, body' },
        { status: 400 }
      );
    }

    // Ensure at least one chart is provided
    if (!body.chart_image_url && !body.chart_embed_url) {
      return NextResponse.json(
        { error: 'At least one chart (image or embed) is required' },
        { status: 400 }
      );
    }

    // Set published_at if status is published
    const published_at = body.status === 'published' ? new Date().toISOString() : null;

    const { data: analysis, error: insertError } = await supabase
      .from('index_analyses')
      .insert({
        index_symbol: body.index_symbol,
        author_id: user.id,
        title: body.title,
        body: body.body,
        chart_image_url: body.chart_image_url || null,
        chart_embed_url: body.chart_embed_url || null,
        visibility: body.visibility || 'public',
        status: body.status || 'draft',
        published_at,
      })
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url, email)
      `)
      .single();

    if (insertError) {
      console.error('Error creating analysis:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ analysis }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/analyses:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
