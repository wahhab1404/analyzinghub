import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { report_id, channel_ids, language_mode = 'en' } = await req.json();

    if (!report_id) {
      return new Response(
        JSON.stringify({ error: 'report_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('*, profiles(full_name, username)')
      .eq('id', report_id)
      .single();

    if (reportError || !report) {
      return new Response(
        JSON.stringify({ error: 'Report not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: channels, error: channelsError } = channel_ids && channel_ids.length > 0
      ? await supabase
          .from('telegram_channels')
          .select('*')
          .eq('analyzer_id', report.analyst_id)
          .in('id', channel_ids)
      : await supabase
          .from('telegram_channels')
          .select('*')
          .eq('analyzer_id', report.analyst_id)
          .eq('is_active', true);

    if (channelsError || !channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active Telegram channels found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return new Response(
        JSON.stringify({ error: 'Telegram bot token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isArabic = language_mode === 'ar';
    const isDual = language_mode === 'dual';
    const metrics = report.summary || {};

    const analyzerName = report.profiles?.full_name || report.profiles?.username || 'Analyzer';

    const periodTypeTranslations: Record<string, { en: string; ar: string }> = {
      'daily': { en: 'Daily Report', ar: 'تقرير يومي' },
      'weekly': { en: 'Weekly Report', ar: 'تقرير أسبوعي' },
      'monthly': { en: 'Monthly Report', ar: 'تقرير شهري' },
      'custom': { en: 'Period Report', ar: 'تقرير الفترة' }
    };

    const periodTrans = periodTypeTranslations[report.period_type] || periodTypeTranslations['custom'];
    const reportType = isDual
      ? `${periodTrans.en} | ${periodTrans.ar}`
      : isArabic
        ? periodTrans.ar
        : periodTrans.en;

    const dateText = report.period_type === 'daily'
      ? new Date(report.report_date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : `${new Date(report.start_date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })} - ${new Date(report.end_date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const totalProfit = metrics.total_profit || 0;
    const totalLoss = metrics.total_loss || 0;
    const netProfit = metrics.net_profit || 0;
    const winRate = metrics.win_rate || 0;
    const totalTrades = metrics.total_trades || 0;
    const winners = metrics.winning_trades || 0;
    const losers = metrics.losing_trades || 0;
    const avgProfit = metrics.avg_profit_per_winning_trade || 0;
    const avgLoss = metrics.avg_loss_per_losing_trade || 0;
    const bestTrade = metrics.best_trade || 0;
    const worstTrade = metrics.worst_trade || 0;

    let message = '';

    if (isDual) {
      message = `📊 *${reportType}*\n`;
      message += `📅 ${dateText}\n`;
      message += `👤 ${analyzerName}\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `💰 *Performance Summary | ملخص الأداء*\n\n`;
      message += `✅ Total Profit | إجمالي الربح: +$${totalProfit.toFixed(0)}\n`;
      message += `❌ Total Loss | إجمالي الخسارة: -$${Math.abs(totalLoss).toFixed(0)}\n`;
      message += `💵 Net Profit | صافي الربح: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(0)}\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📊 *Trades Summary | ملخص الصفقات*\n\n`;
      message += `📦 Total Trades | إجمالي الصفقات: ${totalTrades}\n`;
      message += `🎯 Winners | الرابحة: ${winners} (${winRate.toFixed(1)}%)\n`;
      message += `💔 Losers | الخاسرة: ${losers}\n\n`;
      if (avgProfit > 0) {
        message += `📈 Avg Win | متوسط الربح: +$${avgProfit.toFixed(0)}\n`;
      }
      if (avgLoss < 0) {
        message += `📉 Avg Loss | متوسط الخسارة: -$${Math.abs(avgLoss).toFixed(0)}\n`;
      }
      if (bestTrade > 0) {
        message += `🏆 Best Trade | أفضل صفقة: +$${bestTrade.toFixed(0)}\n`;
      }
      if (worstTrade < 0) {
        message += `⚠️ Worst Trade | أسوأ صفقة: -$${Math.abs(worstTrade).toFixed(0)}\n`;
      }
      message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📄 [Download Full Report | تحميل التقرير الكامل](${report.file_url})\n`;
    } else if (isArabic) {
      message = `📊 *${reportType}*\n`;
      message += `📅 ${dateText}\n`;
      message += `👤 ${analyzerName}\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `💰 *ملخص الأداء*\n\n`;
      message += `✅ إجمالي الربح: +$${totalProfit.toFixed(0)}\n`;
      message += `❌ إجمالي الخسارة: -$${Math.abs(totalLoss).toFixed(0)}\n`;
      message += `💵 صافي الربح: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(0)}\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📊 *ملخص الصفقات*\n\n`;
      message += `📦 إجمالي الصفقات: ${totalTrades}\n`;
      message += `🎯 الصفقات الرابحة: ${winners} (${winRate.toFixed(1)}%)\n`;
      message += `💔 الصفقات الخاسرة: ${losers}\n\n`;
      if (avgProfit > 0) {
        message += `📈 متوسط الربح: +$${avgProfit.toFixed(0)}\n`;
      }
      if (avgLoss < 0) {
        message += `📉 متوسط الخسارة: -$${Math.abs(avgLoss).toFixed(0)}\n`;
      }
      if (bestTrade > 0) {
        message += `🏆 أفضل صفقة: +$${bestTrade.toFixed(0)}\n`;
      }
      if (worstTrade < 0) {
        message += `⚠️ أسوأ صفقة: -$${Math.abs(worstTrade).toFixed(0)}\n`;
      }
      message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📄 [تحميل التقرير الكامل](${report.file_url})\n`;
    } else {
      message = `📊 *${reportType}*\n`;
      message += `📅 ${dateText}\n`;
      message += `👤 ${analyzerName}\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `💰 *Performance Summary*\n\n`;
      message += `✅ Total Profit: +$${totalProfit.toFixed(0)}\n`;
      message += `❌ Total Loss: -$${Math.abs(totalLoss).toFixed(0)}\n`;
      message += `💵 Net Profit: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(0)}\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📊 *Trades Summary*\n\n`;
      message += `📦 Total Trades: ${totalTrades}\n`;
      message += `🎯 Winning Trades: ${winners} (${winRate.toFixed(1)}%)\n`;
      message += `💔 Losing Trades: ${losers}\n\n`;
      if (avgProfit > 0) {
        message += `📈 Average Win: +$${avgProfit.toFixed(0)}\n`;
      }
      if (avgLoss < 0) {
        message += `📉 Average Loss: -$${Math.abs(avgLoss).toFixed(0)}\n`;
      }
      if (bestTrade > 0) {
        message += `🏆 Best Trade: +$${bestTrade.toFixed(0)}\n`;
      }
      if (worstTrade < 0) {
        message += `⚠️ Worst Trade: -$${Math.abs(worstTrade).toFixed(0)}\n`;
      }
      message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📄 [Download Full Report](${report.file_url})\n`;
    }

    const results = [];

    for (const channel of channels) {
      try {
        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channel.telegram_channel_id,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
          })
        });

        const result = await response.json();

        if (result.ok) {
          results.push({ channel_id: channel.id, success: true, message_id: result.result.message_id });
        } else {
          results.push({ channel_id: channel.id, success: false, error: result.description });
        }
      } catch (error: any) {
        results.push({ channel_id: channel.id, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: successCount,
        total_channels: channels.length,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Send Report to Telegram] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
