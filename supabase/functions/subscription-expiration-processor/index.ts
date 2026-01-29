import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the function to process expired subscriptions
    const { data, error } = await supabase.rpc('process_expired_subscriptions');

    if (error) {
      console.error('Error processing expired subscriptions:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to process expiration', details: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
    const details = result?.details || [];
    
    console.log(`Expired: ${result?.expired_count || 0}, Kicked: ${result?.kicked_count || 0}`);

    // Kick users from Telegram channels and send notifications
    const kickResults = [];
    if (botToken && Array.isArray(details)) {
      for (const item of details) {
        if (item.action === 'kick_user' && item.telegram_username && item.telegram_username !== 'N/A') {
          try {
            // First, get the user's Telegram chat_id from telegram_accounts
            const { data: telegramAccount } = await supabase
              .from('telegram_accounts')
              .select('chat_id')
              .eq('user_id', item.subscription_id)
              .is('revoked_at', null)
              .maybeSingle();

            let kicked = false;
            let kickError = null;

            // Try to kick user if we have their chat_id
            if (telegramAccount?.chat_id) {
              const kickResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/banChatMember`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: item.channel_id,
                    user_id: parseInt(telegramAccount.chat_id),
                    revoke_messages: false,
                  }),
                }
              );

              const kickData = await kickResponse.json();
              kicked = kickData.ok;
              kickError = kickData.description || null;

              if (!kickData.ok) {
                console.error('Telegram kick failed:', kickData);
              }
            } else {
              kickError = 'User chat_id not found';
            }

            // Send notification to user via username (DM)
            const messageText = `⚠️ *Subscription Expired*\n\nYour subscription to ${item.analyst_name}'s channel has expired.\n\n${kicked ? 'You have been removed from the channel.' : ''}\n\n🔄 Renew your subscription to regain access to exclusive content and analysis.\n\nThank you for your previous support!`;

            let notificationSent = false;
            try {
              const msgResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: `@${item.telegram_username}`,
                    text: messageText,
                    parse_mode: 'Markdown',
                  }),
                }
              );

              const msgData = await msgResponse.json();
              notificationSent = msgData.ok;
            } catch (msgError) {
              console.error('Failed to send notification:', msgError);
            }

            kickResults.push({
              username: item.telegram_username,
              channel_id: item.channel_id,
              kicked: kicked,
              notification_sent: notificationSent,
              error: kickError,
            });
          } catch (telegramError) {
            console.error('Telegram processing error:', telegramError);
            kickResults.push({
              username: item.telegram_username,
              channel_id: item.channel_id,
              kicked: false,
              notification_sent: false,
              error: String(telegramError),
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expired_count: result?.expired_count || 0,
        kicked_count: result?.kicked_count || 0,
        telegram_kicks_attempted: kickResults.length,
        telegram_kicks_successful: kickResults.filter(r => r.kicked).length,
        details: details,
        kick_results: kickResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Error in subscription expiration processor:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});