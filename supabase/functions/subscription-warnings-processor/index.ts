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

    // Call the function to send warnings
    const { data, error } = await supabase.rpc('send_subscription_warnings');

    if (error) {
      console.error('Error sending warnings:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send warnings', details: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
    const details = result?.details || [];
    
    console.log(`Processed: ${result?.processed_count || 0}, Sent: ${result?.warnings_sent || 0}`);

    // Send Telegram messages for each warning
    const telegramResults = [];
    if (botToken && Array.isArray(details)) {
      for (const warning of details) {
        if (warning.telegram_username && warning.telegram_username !== 'N/A') {
          try {
            const telegramResponse = await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: `@${warning.telegram_username}`,
                  text: warning.message,
                  parse_mode: 'Markdown',
                }),
              }
            );

            const telegramData = await telegramResponse.json();
            telegramResults.push({
              username: warning.telegram_username,
              success: telegramData.ok,
              error: telegramData.description || null,
            });
          } catch (telegramError) {
            console.error('Telegram error:', telegramError);
            telegramResults.push({
              username: warning.telegram_username,
              success: false,
              error: String(telegramError),
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: result?.processed_count || 0,
        warnings_sent: result?.warnings_sent || 0,
        telegram_messages_sent: telegramResults.filter(r => r.success).length,
        telegram_errors: telegramResults.filter(r => !r.success).length,
        details: details,
        telegram_results: telegramResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Error in subscription warnings processor:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});