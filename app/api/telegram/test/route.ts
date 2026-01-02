import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        ok: false,
        error: 'Server configuration error'
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'telegram_bot_token')
      .maybeSingle();

    const botTokenFromDB = data?.setting_value;
    const botTokenFromEnv = process.env.TELEGRAM_BOT_TOKEN;

    const botToken = botTokenFromDB || botTokenFromEnv;

    if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
      return NextResponse.json({
        ok: false,
        error: 'Bot token not configured',
        details: {
          hasDBToken: !!botTokenFromDB,
          hasEnvToken: !!botTokenFromEnv,
        }
      });
    }

    const botInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const botInfo = await botInfoResponse.json();

    if (!botInfo.ok) {
      return NextResponse.json({
        ok: false,
        error: 'Invalid bot token',
        details: botInfo
      });
    }

    const testChatId = request.nextUrl.searchParams.get('chat_id');
    let testMessageResult = null;

    if (testChatId) {
      const testResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: testChatId,
          text: '✅ Test message from AnalyzingHub Bot',
          parse_mode: 'HTML',
        }),
      });

      testMessageResult = await testResponse.json();
    }

    return NextResponse.json({
      ok: true,
      botInfo: botInfo.result,
      tokenSource: botTokenFromDB ? 'database' : 'environment',
      testMessage: testMessageResult,
      webhookUrl: `${request.nextUrl.origin}/api/telegram/webhook`,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
