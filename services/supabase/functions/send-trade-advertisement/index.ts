import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface TradeAdData {
  tradeId: string;
  channelIds?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tradeId, channelIds, userId }: TradeAdData & { userId: string } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Fetch trade details with related data
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select(`
        *,
        analysis:index_analyses(
          id,
          index_symbol,
          direction,
          entry_point,
          take_profit,
          stop_loss,
          user_id
        )
      `)
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      throw new Error('Trade not found');
    }

    // Verify the user owns this trade
    if (trade.analysis?.user_id !== userId) {
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

    // Calculate profit
    const entryPrice = trade.entry_contract_price || 0;
    const highPrice = trade.contract_high_since || entryPrice;
    const profitPoints = highPrice - entryPrice;
    const profitDollars = profitPoints * (trade.qty || 1) * 100;
    const profitPercent = entryPrice > 0 ? ((profitPoints / entryPrice) * 100).toFixed(1) : '0.0';

    // Format expiry date
    const expiryDate = trade.expiry
      ? new Date(trade.expiry).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
      : '';

    const optionType = trade.option_type?.toUpperCase() || trade.direction?.toUpperCase() || '';

    // Generate advertisement HTML
    const html = generateAdHTML({
      indexSymbol: trade.analysis?.index_symbol || trade.underlying_index_symbol || '',
      strike: trade.strike || 0,
      expiry: expiryDate,
      optionType,
      entryPrice,
      highPrice,
      profitDollars,
      profitPercent,
      contractUrl: trade.contract_url,
    });

    // Build caption in Arabic
    const caption = `
🎯 <b>تحليل ناجح</b>

<b>المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}
<b>العقد:</b> ${trade.strike?.toFixed(0)} - ${expiryDate} - ${optionType}

💰 <b>النتائج:</b>
<b>سعر الدخول:</b> $${entryPrice.toFixed(2)}
<b>أعلى سعر:</b> $${highPrice.toFixed(2)}
<b>المكسب:</b> $${profitDollars.toFixed(2)} (+${profitPercent}%)

✅ <b>انضم لقناتنا للحصول على التحليلات الفائزة!</b>
    `.trim();

    // Send to each channel
    const results = [];
    for (const channel of channels) {
      try {
        let response;

        if (trade.contract_url) {
          // Send as photo with caption
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
          // Send as message
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

function generateAdHTML(data: {
  indexSymbol: string;
  strike: number;
  expiry: string;
  optionType: string;
  entryPrice: number;
  highPrice: number;
  profitDollars: number;
  profitPercent: string;
  contractUrl?: string;
}): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Arial', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      padding: 20px;
      direction: rtl;
    }
    .card {
      background: white;
      border-radius: 15px;
      padding: 30px;
      max-width: 500px;
      margin: 0 auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #10b981;
      margin: 0;
      font-size: 28px;
    }
    .contract-info {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .contract-info .label {
      color: #6b7280;
      font-size: 14px;
    }
    .contract-info .value {
      color: #111827;
      font-size: 18px;
      font-weight: bold;
      margin-top: 5px;
    }
    .results {
      background: #ecfdf5;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .results .profit {
      color: #10b981;
      font-size: 32px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 15px;
    }
    .price-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .price-row .label {
      color: #6b7280;
    }
    .price-row .value {
      color: #111827;
      font-weight: bold;
    }
    .cta {
      background: #8b5cf6;
      color: white;
      text-align: center;
      padding: 15px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>🎯 تحليل ناجح</h1>
    </div>

    <div class="contract-info">
      <div class="label">المؤشر</div>
      <div class="value">${data.indexSymbol}</div>
      <div class="label" style="margin-top: 10px;">العقد</div>
      <div class="value">${data.strike.toFixed(0)} - ${data.expiry} - ${data.optionType}</div>
    </div>

    <div class="results">
      <div class="profit">$${data.profitDollars.toFixed(2)}</div>
      <div class="price-row">
        <span class="label">سعر الدخول:</span>
        <span class="value">$${data.entryPrice.toFixed(2)}</span>
      </div>
      <div class="price-row">
        <span class="label">أعلى سعر:</span>
        <span class="value">$${data.highPrice.toFixed(2)}</span>
      </div>
      <div class="price-row">
        <span class="label">نسبة المكسب:</span>
        <span class="value">+${data.profitPercent}%</span>
      </div>
    </div>

    <div class="cta">
      ✅ انضم لقناتنا للحصول على التحليلات الفائزة!
    </div>
  </div>
</body>
</html>
  `.trim();
}
