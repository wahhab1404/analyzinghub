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
    let updateSuccess = false;
    let retryCount = 0;
    const maxRetries = 3;

    while (!updateSuccess && retryCount < maxRetries) {
      try {
        const { error: updateError } = await supabase
          .from('telegram_accounts')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', account.id);

        if (updateError) {
          throw updateError;
        }

        updateSuccess = true;
      } catch (error: any) {
        retryCount++;
        console.error(`Error revoking Telegram account (attempt ${retryCount}/${maxRetries}):`, error);

        // If it's a network error and we have retries left, wait and try again
        if (retryCount < maxRetries && (error.message?.includes('fetch failed') || error.message?.includes('network'))) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        } else {
          // Final failure or non-network error
          return NextResponse.json(
            {
              ok: false,
              error: 'Failed to disconnect account',
              details: error.message || 'Network error - please try again'
            },
            { status: 500 }
          );
        }
      }
    }

    // Disable Telegram notifications (non-critical, continue even if it fails)
    try {
      await supabase
        .from('notification_preferences')
        .update({ telegram_enabled: false })
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error disabling notifications (non-critical):', error);
    }

    // Send goodbye message to user (non-critical, continue even if it fails)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

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
          signal: controller.signal,
        });

        clearTimeout(timeout);
      } catch (error) {
        console.error('Error sending disconnect message (non-critical):', error);
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
