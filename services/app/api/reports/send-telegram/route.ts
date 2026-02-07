import { createRouteHandlerClient } from '@/lib/api-helpers';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { report_id, channel_ids, language_mode } = await request.json();

    if (!report_id) {
      return NextResponse.json({ error: 'report_id is required' }, { status: 400 });
    }

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('author_id')
      .eq('id', report_id)
      .maybeSingle();

    if (reportError) {
      console.error('Error fetching report:', reportError);
      return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
    }

    if (!report || report.author_id !== user.id) {
      return NextResponse.json({ error: 'Report not found or unauthorized' }, { status: 404 });
    }

    let targetChannels = channel_ids;

    if (!targetChannels || targetChannels.length === 0) {
      const { data: settings } = await supabase
        .from('report_settings')
        .select('default_channel_id, extra_channel_ids')
        .eq('analyst_id', report.author_id)
        .maybeSingle();

      if (settings) {
        targetChannels = [
          settings.default_channel_id,
          ...(settings.extra_channel_ids || [])
        ].filter(Boolean);
      }
    }

    if (!targetChannels || targetChannels.length === 0) {
      const { data: channels, error: channelsError } = await supabase
        .from('telegram_channels')
        .select('channel_id')
        .eq('user_id', report.author_id)
        .eq('enabled', true);

      console.log('[Send to Telegram API] Channels lookup:', {
        author_id: report.author_id,
        channels,
        channelsError
      });

      if (channels && channels.length > 0) {
        targetChannels = channels.map(c => c.channel_id).filter(Boolean);
      }
    }

    console.log('[Send to Telegram API] Target channels:', targetChannels);

    if (!targetChannels || targetChannels.length === 0) {
      return NextResponse.json({ error: 'No Telegram channels configured. Please set up channels in Settings.' }, { status: 400 });
    }

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-report-to-telegram`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        report_id,
        channel_ids: targetChannels,
        language_mode
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(result, { status: response.status });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error sending report to Telegram:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send report' },
      { status: 500 }
    );
  }
}
