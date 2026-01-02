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

    // Kick users from Telegram channels
    const kickResults = [];
    if (botToken && Array.isArray(details)) {
      for (const item of details) {
        if (item.action === 'kick_user' && item.telegram_username && item.telegram_username !== 'N/A') {
          try {
            // Try to kick/ban user from channel
            const kickResponse = await fetch(
              `https://api.telegram.org/bot${botToken}/banChatMember`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: item.channel_id,
                  user_id: `@${item.telegram_username}`,
                  revoke_messages: false,
                }),
              }
            );

            const kickData = await kickResponse.json();
            
            // Send notification to user
            const messageText = `Your subscription to ${item.analyst_name}'s channel has expired. You have been removed from the channel. Please renew your subscription to regain access.`;
            
            await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: `@${item.telegram_username}`,
                  text: messageText,
                }),
              }
            );

            kickResults.push({
              username: item.telegram_username,
              channel_id: item.channel_id,
              kicked: kickData.ok,
              error: kickData.description || null,
            });
          } catch (telegramError) {
            console.error('Telegram kick error:', telegramError);
            kickResults.push({
              username: item.telegram_username,
              channel_id: item.channel_id,
              kicked: false,
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