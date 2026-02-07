import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json();
    const { analysisId, userId, channelId } = body;

    if (!analysisId || !userId) {
      return NextResponse.json(
        { ok: false, error: 'Analysis ID and User ID are required' },
        { status: 400 }
      );
    }

    // First, get the analysis to determine its visibility
    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select(`
        *,
        symbols:symbol_id (symbol),
        profiles:analyzer_id (full_name)
      `)
      .eq('id', analysisId)
      .maybeSingle();

    if (analysisError) {
      console.error('Error fetching analysis:', analysisError);
      return NextResponse.json(
        { ok: false, error: `Database error: ${analysisError.message}` },
        { status: 500 }
      );
    }

    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Determine which channel to use based on analysis visibility
    const visibility = analysis.visibility || 'public';
    let audienceType: string;

    switch (visibility) {
      case 'subscribers':
        audienceType = 'subscribers';
        break;
      case 'followers':
        audienceType = 'followers';
        break;
      case 'public':
      default:
        audienceType = 'public';
        break;
    }

    // Get the appropriate channel for this audience type
    const { data: channelData, error: channelError } = await supabase
      .from('telegram_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('audience_type', audienceType)
      .eq('enabled', true)
      .maybeSingle();

    if (channelError) {
      console.error('Error fetching channel:', channelError);
      return NextResponse.json(
        { ok: false, error: `Database error: ${channelError.message}` },
        { status: 500 }
      );
    }

    if (!channelData) {
      console.log(`No ${audienceType} channel connected for user ${userId}`);
      return NextResponse.json(
        { ok: false, error: `No ${audienceType} Telegram channel connected. Please connect a channel for this audience type.` },
        { status: 404 }
      );
    }

    if (!channelData.notify_new_analysis) {
      return NextResponse.json(
        { ok: false, error: 'New analysis notifications are disabled for this channel.' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing environment variables for edge function call:', {
        hasUrl: !!supabaseUrl,
        hasServiceRoleKey: !!serviceRoleKey
      });
      return NextResponse.json(
        { ok: false, error: 'Server configuration error: Missing Supabase service credentials' },
        { status: 500 }
      );
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/telegram-channel-broadcast`;
    const requestId = crypto.randomUUID();

    console.log('Calling edge function:', edgeFunctionUrl, 'RequestID:', requestId);
    console.log('With payload:', {
      userId,
      analysisId,
      eventType: 'new_analysis',
      symbol: analysis.symbols?.symbol,
      direction: analysis.direction,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'x-request-id': requestId,
      },
      body: JSON.stringify({
        userId: userId,
        analysisId: analysisId,
        channelId: channelId || channelData.channel_id,
        eventType: 'new_analysis',
        symbol: analysis.symbols?.symbol,
        direction: analysis.direction,
        entryPrice: analysis.entry_price,
      }),
    }).finally(() => clearTimeout(timeout));

    const raw = await response.text();
    console.log('Edge function response status:', response.status);
    console.log('Edge function raw response:', raw.slice(0, 500));

    if (!response.ok) {
      console.error('Edge function error response:', { requestId, status: response.status, raw });
      return NextResponse.json(
        {
          ok: false,
          error: 'EDGE_FUNCTION_ERROR',
          requestId,
          upstreamStatus: response.status,
          details: raw.slice(0, 2000)
        },
        { status: 502 }
      );
    }

    let result: any = null;
    try {
      result = raw ? JSON.parse(raw) : null;
    } catch (parseError) {
      console.error('Failed to parse edge function response:', parseError);
      console.error('Raw response:', raw.slice(0, 1000));
      return NextResponse.json(
        { ok: false, error: 'EDGE_FUNCTION_INVALID_RESPONSE', details: raw.slice(0, 1000) },
        { status: 502 }
      );
    }

    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'EDGE_FUNCTION_EMPTY_RESPONSE' },
        { status: 502 }
      );
    }

    console.log('Edge function result:', result);

    if (!result.ok) {
      console.error('Failed to broadcast new analysis:', result.error);
      return NextResponse.json(
        { ok: false, error: result.error ?? 'BROADCAST_FAILED', details: result.details },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error: any) {
    console.error('Error in broadcast-new-analysis route:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error', stack: error?.stack },
      { status: 500 }
    );
  }
}
