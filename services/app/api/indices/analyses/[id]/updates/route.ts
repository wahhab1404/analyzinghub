import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { CreateAnalysisUpdateRequest } from '@/services/indices/types';

/**
 * POST /api/indices/analyses/[id]/updates
 * Post an update to an analysis
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
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

    const textEn = body.text_en || body.body || '';
    if (!textEn) {
      return NextResponse.json(
        { error: 'Missing required field: text_en or body' },
        { status: 400 }
      );
    }

    const { data: update, error: insertError } = await supabase
      .from('analysis_updates')
      .insert({
        analysis_id: analysisId,
        author_id: user.id,
        body: textEn, // For backward compatibility
        text_en: textEn,
        text_ar: body.text_ar || null,
        update_type: body.update_type || 'manual',
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

    // Publish to Telegram if requested
    if (body.auto_publish_telegram) {
      try {
        const { data: analysisData } = await supabase
          .from('index_analyses')
          .select('telegram_channel_id')
          .eq('id', analysisId)
          .single();

        const channelId = analysisData?.telegram_channel_id;

        if (channelId) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (supabaseUrl && serviceRoleKey) {
            await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                entityType: 'analysis_update',
                entityId: update.id,
                channelId: channelId,
              }),
            });
          }
        }
      } catch (telegramError) {
        console.error('Failed to publish update to Telegram:', telegramError);
      }
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
