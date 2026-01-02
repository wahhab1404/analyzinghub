import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get the Telegram account
    const { data: account, error: fetchError } = await supabase
      .from('telegram_accounts')
      .select('id, chat_id')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching Telegram account:', fetchError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch account' },
        { status: 500 }
      );
    }

    if (!account) {
      return NextResponse.json(
        { ok: false, error: 'No linked Telegram account found' },
        { status: 404 }
      );
    }

    // Revoke the account (soft delete)
    const { error: updateError } = await supabase
      .from('telegram_accounts')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', account.id);

    if (updateError) {
      console.error('Error revoking Telegram account:', updateError);
      return NextResponse.json(
        { ok: false, error: 'Failed to disconnect account' },
        { status: 500 }
      );
    }

    // Disable Telegram notifications
    await supabase
      .from('notification_preferences')
      .update({ telegram_enabled: false })
      .eq('user_id', user.id);

    // Send goodbye message to user
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: account.chat_id,
            text:
              '👋 Your Telegram account has been disconnected from AnalyzingHub.\n\n' +
              'You will no longer receive notifications here.\n\n' +
              'Use /start <code> to link again anytime.\n\n' +
              '👋 تم فصل حساب تيليجرام الخاص بك من AnalyzingHub.\n\n' +
              'لن تتلقى إشعارات هنا بعد الآن.\n\n' +
              'استخدم /start <الرمز> للربط مرة أخرى في أي وقت.',
            parse_mode: 'HTML',
          }),
        });
      } catch (error) {
        console.error('Error sending disconnect message:', error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in disconnect route:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
