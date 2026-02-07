import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/telegram/query-symbol
 *
 * Server-side API for querying analyses by symbol (used by Telegram webhook)
 *
 * Security: Service role only (validates webhook secret)
 *
 * Body:
 * - symbol: string (normalized symbol to query)
 * - page: number (optional, default 1)
 * - pageSize: number (optional, default 10)
 * - chatId: string (for rate limiting)
 *
 * Returns:
 * - analyses: array of analysis results
 * - pagination: { currentPage, totalPages, totalCount, pageSize }
 * - rateLimited: boolean
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Telegram Query Symbol] Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Configuration error' },
        { status: 500 }
      );
    }

    // Verify webhook secret
    const webhookSecret = request.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.log('[Telegram Query Symbol] Invalid webhook secret');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { symbol, page = 1, pageSize = 10, chatId } = body;

    if (!symbol || !chatId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check rate limit
    const { data: rateLimitOk } = await supabase.rpc(
      'check_telegram_symbol_query_limit',
      {
        p_user_chat_id: chatId.toString(),
        p_max_queries: 10,
        p_window_minutes: 10
      }
    );

    if (!rateLimitOk) {
      return NextResponse.json({
        rateLimited: true,
        analyses: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalCount: 0,
          pageSize: 10
        }
      });
    }

    // Query analyses
    const { data: analyses, error } = await supabase.rpc(
      'get_analyses_by_symbol',
      {
        p_symbol_normalized: symbol,
        p_page: page,
        p_page_size: pageSize
      }
    );

    if (error) {
      console.error('[Telegram Query Symbol] Database error:', error);
      return NextResponse.json(
        { error: 'Query failed' },
        { status: 500 }
      );
    }

    // Extract total count and build pagination info
    const totalCount = analyses && analyses.length > 0 ? Number(analyses[0].total_count) : 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      rateLimited: false,
      analyses: analyses || [],
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        pageSize
      }
    });
  } catch (error: any) {
    console.error('[Telegram Query Symbol] Error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
