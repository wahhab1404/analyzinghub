import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { generateTradeImage } from './trade-image.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface TradeAdData {
  tradeId: string;
  channelIds?: string[];
}

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: botTokenSetting } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'telegram_bot_token')
      .maybeSingle();

    const botToken = botTokenSetting?.setting_value || Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      throw new Error('Telegram bot token not configured');
    }

    const { tradeId, channelIds, userId }: TradeAdData & { userId: string } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Fetch the trade with only the author embed (proven to work in the
    // generate-image route). We deliberately do NOT embed index_analyses: most
    // trades are manual (analysis_id IS NULL), and that table lacks the columns
    // an embed was selecting — the bad embed was what made every send 500.
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select('*, author:profiles!author_id(id, full_name)')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      console.error('Trade fetch failed:', tradeError);
      throw new Error('Trade not found');
    }

    // Ownership lives on index_trades.author_id.
    if (trade.author_id !== userId) {
      throw new Error('Unauthorized: You can only advertise your own trades');
    }

    // Fetch user's ad channels (either specified or all active)
    let query = supabase
      .from('telegram_ad_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (channelIds && channelIds.length > 0) {
      query = query.in('channel_id', channelIds);
    }

    const { data: channels, error: channelsError } = await query;

    if (channelsError || !channels || channels.length === 0) {
      throw new Error('No active ad channels found');
    }

    // Calculate profit. Entry price comes from the entry snapshot (same source the
    // image uses) and falls back to the entry_price column.
    const snap = trade.entry_contract_snapshot ?? {};
    const entryPrice = safeNum(snap.mid ?? snap.price ?? snap.last, safeNum(trade.entry_price));
    const highPrice = safeNum(trade.contract_high_since, entryPrice);
    const profitPoints = highPrice - entryPrice;
    const profitDollars = profitPoints * (trade.qty || 1) * 100;
    const profitPercent = entryPrice > 0 ? ((profitPoints / entryPrice) * 100).toFixed(1) : '0.0';

    // Format expiry date
    const expiryDate = trade.expiry
      ? new Date(trade.expiry).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
      : '';

    const optionType = trade.option_type?.toUpperCase() || trade.direction?.toUpperCase() || '';
    const indexSymbol = trade.underlying_index_symbol || '';

    // Build Arabic caption — headed "من صفقاتنا الخاصة" with entry + high highlighted.
    const caption = `
🎯 <b>من صفقاتنا الخاصة</b>

<b>المؤشر:</b> ${indexSymbol}
<b>العقد:</b> ${trade.strike?.toFixed(0)} · ${expiryDate} · ${optionType}

📈 <b>سعر الدخول:</b> $${entryPrice.toFixed(2)}
🚀 <b>أعلى سعر:</b> $${highPrice.toFixed(2)}
💰 <b>المكسب:</b> +$${profitDollars.toFixed(2)} (+${profitPercent}%)

✅ <b>انضم لقناتنا للحصول على التحليلات الفائزة!</b>
    `.trim();

    // Generate a fresh "winning trade" image card (shows Entry + High + P/L).
    // The previous implementation built HTML that was never rendered, so the ad
    // only ever carried an image when a stale contract_url happened to exist.
    // Generating here guarantees an organized image every time.
    let imageBytes: Uint8Array | null = null;
    try {
      imageBytes = await generateTradeImage(trade, { isAd: true, highPrice });
    } catch (imgError) {
      console.error('Trade ad image generation failed, will fall back:', imgError);
    }

    // Send to each channel
    const results = [];
    for (const channel of channels) {
      try {
        let response: Response;

        if (imageBytes) {
          // Preferred: upload the freshly generated PNG as a photo (multipart).
          const form = new FormData();
          form.append('chat_id', channel.channel_id);
          form.append('photo', new Blob([imageBytes], { type: 'image/png' }), 'trade.png');
          form.append('caption', caption.substring(0, 1024));
          form.append('parse_mode', 'HTML');

          response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendPhoto`,
            { method: 'POST', body: form }
          );
        } else if (trade.contract_url) {
          // Fallback: a previously stored snapshot image by URL.
          response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendPhoto`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: channel.channel_id,
                photo: trade.contract_url,
                caption: caption,
                parse_mode: 'HTML',
              }),
            }
          );
        } else {
          // Last resort: text-only message.
          response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: channel.channel_id,
                text: caption,
                parse_mode: 'HTML',
              }),
            }
          );
        }

        const result = await response.json();

        results.push({
          channelId: channel.channel_id,
          channelName: channel.channel_name,
          success: result.ok,
          messageId: result.result?.message_id,
          error: result.ok ? undefined : result.description,
        });
      } catch (error) {
        results.push({
          channelId: channel.channel_id,
          channelName: channel.channel_name,
          success: false,
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        totalSent: results.filter((r) => r.success).length,
        totalFailed: results.filter((r) => !r.success).length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error sending trade advertisement:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
