import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { CreateAnalysisRequest, IndexAnalysisWithAuthor } from '@/services/indices/types';

/**
 * GET /api/indices/analyses
 * List all accessible index analyses
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
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

    // Fetch trades for each analysis
    const analysesWithTrades = await Promise.all(
      (data || []).map(async (analysis) => {
        const { data: trades } = await supabase
          .from('index_trades')
          .select('*')
          .eq('analysis_id', analysis.id)
          .order('published_at', { ascending: false, nullsFirst: false });

        const activeTrades = (trades || []).filter(t => t.status === 'active');

        return {
          ...analysis,
          trades: trades || [],
          trades_count: trades?.length || 0,
          active_trades_count: activeTrades.length || 0,
        };
      })
    );

    return NextResponse.json({ analyses: analysesWithTrades });
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

    const { data: analysis, error: insertError} = await supabase
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
        timeframe: body.timeframe || null,
        schools_used: body.schools_used || [],
        invalidation_price: body.invalidation_price || null,
        targets: body.targets || [],
        parent_analysis_id: body.parent_analysis_id || null,
        telegram_channel_id: body.telegram_channel_id || null,
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

    // Publish to Telegram if requested and published
    if (body.auto_publish_telegram && body.status === 'published' && body.telegram_channel_id) {
      try {
        console.log(`Publishing analysis ${analysis.id} to Telegram channel ${body.telegram_channel_id}`);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && serviceRoleKey) {
          const response = await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              type: 'new_analysis',
              data: analysis,
              channelId: body.telegram_channel_id,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Telegram analysis publish failed:', errorText);
          } else {
            const result = await response.json();
            console.log('Successfully published analysis to Telegram:', result);
          }
        } else {
          console.error('Missing Supabase URL or service role key for Telegram publishing');
        }
      } catch (telegramError) {
        console.error('Failed to publish to Telegram:', telegramError);
        // Don't fail the request if Telegram fails
      }
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
