import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  getBotToken,
  editMessage,
  editMessageCaption,
  sendMessage,
  deleteMessage,
} from '@/lib/telegram/bot-sender';
import {
  buildIndexAnalysisMessage,
  TELEGRAM_CAPTION_LIMIT,
} from '@/lib/telegram/index-analysis-message';

// Authors may edit/delete their published Telegram message only within this
// window after publishing.
const EDIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_BASE_URL ||
  'https://analyzinghub.com';

interface SentMessage {
  id: string;
  chat_id: string;
  message_id: number;
  kind: 'caption' | 'text';
}

/**
 * Loads the analysis, verifies ownership, enforces the 1-hour window, and
 * returns the analysis row plus its recorded Telegram messages.
 */
async function loadAndAuthorize(request: NextRequest, id: string) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: analysis, error: fetchError } = await supabase
    .from('index_analyses')
    .select(`*, author:profiles!author_id(id, full_name)`)
    .eq('id', id)
    .single();

  if (fetchError || !analysis) {
    return { error: NextResponse.json({ error: 'Analysis not found' }, { status: 404 }) };
  }

  if (analysis.author_id !== user.id) {
    return {
      error: NextResponse.json(
        { error: 'You can only manage your own analyses' },
        { status: 403 },
      ),
    };
  }

  const publishedAt = analysis.published_at || analysis.created_at;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    return {
      error: NextResponse.json(
        {
          error: 'EDIT_WINDOW_EXPIRED',
          message: 'يمكن تعديل أو حذف رسالة تيليجرام خلال ساعة واحدة فقط من وقت النشر',
        },
        { status: 403 },
      ),
    };
  }

  const admin = createServiceRoleClient();
  const { data: messages } = await admin
    .from('index_analysis_telegram_messages')
    .select('id, chat_id, message_id, kind')
    .eq('analysis_id', id);

  return { analysis, messages: (messages || []) as SentMessage[], admin };
}

/**
 * PATCH /api/indices/analyses/[id]/telegram
 * Re-pushes the current analysis content to its published Telegram message(s).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await loadAndAuthorize(request, id);
    if ('error' in auth) return auth.error;
    const { analysis, messages, admin } = auth;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'NO_TELEGRAM_MESSAGE', message: 'لا توجد رسالة تيليجرام مرتبطة بهذا التحليل' },
        { status: 404 },
      );
    }

    const botToken = await getBotToken(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    if (!botToken) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    const { text, caption } = buildIndexAnalysisMessage(analysis, BASE_URL);
    const fits = text.length <= TELEGRAM_CAPTION_LIMIT;
    const captionRows = messages.filter((m) => m.kind === 'caption');
    const textRows = messages.filter((m) => m.kind === 'text');

    let edited = 0;
    let failed = 0;

    for (const row of captionRows) {
      // A caption message holds the full text only when there is no separate
      // text message and the text fits within the caption limit.
      const newCaption = textRows.length > 0 ? caption : fits ? text : caption;
      const ok = await editMessageCaption(botToken, row.chat_id, row.message_id, newCaption);
      ok ? edited++ : failed++;
    }

    for (const row of textRows) {
      const ok = await editMessage(botToken, row.chat_id, row.message_id, text);
      ok ? edited++ : failed++;
    }

    // The body grew past the caption limit since publishing and there is no
    // text message yet — send the full text as a follow-up and record it.
    if (textRows.length === 0 && !fits && captionRows.length > 0) {
      for (const row of captionRows) {
        const newId = await sendMessage(botToken, row.chat_id, text);
        if (newId) {
          edited++;
          await admin.from('index_analysis_telegram_messages').insert({
            analysis_id: id,
            chat_id: row.chat_id,
            message_id: newId,
            kind: 'text',
          });
        } else {
          failed++;
        }
      }
    }

    return NextResponse.json({ success: failed === 0, edited, failed });
  } catch (error: any) {
    console.error('Error in PATCH /api/indices/analyses/[id]/telegram:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/indices/analyses/[id]/telegram
 * Deletes the analysis's published Telegram message(s).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const auth = await loadAndAuthorize(request, id);
    if ('error' in auth) return auth.error;
    const { messages, admin } = auth;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'NO_TELEGRAM_MESSAGE', message: 'لا توجد رسالة تيليجرام مرتبطة بهذا التحليل' },
        { status: 404 },
      );
    }

    const botToken = await getBotToken(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    if (!botToken) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    let deleted = 0;
    let failed = 0;
    const removedIds: string[] = [];

    for (const row of messages) {
      const ok = await deleteMessage(botToken, row.chat_id, row.message_id);
      if (ok) {
        deleted++;
        removedIds.push(row.id);
      } else {
        failed++;
      }
    }

    if (removedIds.length > 0) {
      await admin.from('index_analysis_telegram_messages').delete().in('id', removedIds);
    }

    return NextResponse.json({ success: failed === 0, deleted, failed });
  } catch (error: any) {
    console.error('Error in DELETE /api/indices/analyses/[id]/telegram:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
