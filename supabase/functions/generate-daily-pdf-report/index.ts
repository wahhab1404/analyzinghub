import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Trade {
  id: string;
  underlying_index_symbol: string;
  option_type: string;
  strike: number;
  entry_contract_snapshot: any;
  current_contract: number;
  contract_high_since: number;
  status: string;
  max_profit: number;
  created_at: string;
  closed_at?: string;
  outcome?: string;
}

// PDF Translations
const translations = {
  en: {
    title: 'Daily Trading Report',
    totalTrades: 'Total Trades',
    activeTrades: 'Active Trades',
    closedTrades: 'Closed Trades',
    expiredTrades: 'Expired Trades',
    avgProfit: 'Avg Profit',
    maxProfit: 'Max Profit',
    winRate: 'Win Rate',
    todaysTrades: "Today's Trades",
    strikePrice: 'Strike Price',
    entryPrice: 'Entry Price',
    highestPrice: 'Highest Price',
    currentPrice: 'Current Price',
    maxProfitLabel: 'Max Profit',
    outcome: 'Outcome',
    win: 'WIN',
    loss: 'LOSS',
    noTrades: 'No Trades Today',
    noTradesDesc: 'There were no trades recorded for today.',
    platform: 'AnalyZHub - Professional Trading Analysis Platform',
    generatedOn: 'Generated on',
    copyright: 'All Rights Reserved',
    telegram: {
      title: 'Daily Trading Report',
      summary: 'Performance Summary',
      metrics: 'Profit Metrics',
      total: 'Total Trades',
      active: 'Active',
      closed: 'Closed',
      expired: 'Expired',
      avgProfit: 'Avg Profit',
      maxProfit: 'Max Profit',
      winRate: 'Win Rate',
      attached: 'Full detailed report attached below'
    }
  },
  ar: {
    title: 'التقرير اليومي للتداول',
    totalTrades: 'إجمالي الصفقات',
    activeTrades: 'الصفقات النشطة',
    closedTrades: 'الصفقات المغلقة',
    expiredTrades: 'الصفقات المنتهية',
    avgProfit: 'متوسط الربح',
    maxProfit: 'أعلى ربح',
    winRate: 'معدل النجاح',
    todaysTrades: 'صفقات اليوم',
    strikePrice: 'سعر التنفيذ',
    entryPrice: 'سعر الدخول',
    highestPrice: 'أعلى سعر',
    currentPrice: 'السعر الحالي',
    maxProfitLabel: 'أعلى ربح',
    outcome: 'النتيجة',
    win: 'ربح',
    loss: 'خسارة',
    noTrades: 'لا توجد صفقات اليوم',
    noTradesDesc: 'لم يتم تسجيل أي صفقات لهذا اليوم.',
    platform: 'AnalyZHub - منصة احترافية لتحليل التداول',
    generatedOn: 'تم الإنشاء في',
    copyright: 'جميع الحقوق محفوظة',
    telegram: {
      title: 'التقرير اليومي للتداول',
      summary: 'ملخص الأداء',
      metrics: 'مؤشرات الربح',
      total: 'إجمالي الصفقات',
      active: 'نشط',
      closed: 'مغلق',
      expired: 'منتهي',
      avgProfit: 'متوسط الربح',
      maxProfit: 'أعلى ربح',
      winRate: 'معدل النجاح',
      attached: 'التقرير التفصيلي الكامل مرفق أدناه'
    }
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const reportDateStr = body.date || new Date().toISOString().split('T')[0];
    const previewOnly = body.previewOnly === true;
    const language = body.language || 'ar'; // Default to Arabic

    console.log('[PDF Report] Request:', { reportDateStr, previewOnly, language });

    const t = translations[language as 'en' | 'ar'] || translations.ar;

    const reportDate = new Date(reportDateStr + 'T00:00:00Z');
    const startOfDay = new Date(reportDate.setUTCHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(reportDate.setUTCHours(23, 59, 59, 999)).toISOString();

    const { data: trades, error: tradesError } = await supabase
      .from('index_trades')
      .select('id, underlying_index_symbol, option_type, strike, entry_contract_snapshot, current_contract, contract_high_since, status, max_profit, created_at, closed_at, outcome, qty')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false });

    if (tradesError) throw tradesError;

    console.log('[PDF Report] Found trades:', trades?.length || 0);

    const tradesWithCalculatedProfit = (trades || []).map(trade => {
      const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
      const highestPrice = trade.contract_high_since || entryPrice;
      const qty = trade.qty || 1;
      const multiplier = 100;

      const calculatedMaxProfit = (highestPrice - entryPrice) * qty * multiplier;
      const maxProfitPercent = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice * 100) : 0;

      return {
        ...trade,
        calculated_max_profit: calculatedMaxProfit,
        max_profit_percent: maxProfitPercent
      };
    });

    const totalTrades = tradesWithCalculatedProfit.length;
    const activeTrades = tradesWithCalculatedProfit.filter(t => t.status === 'active').length;
    const closedTrades = tradesWithCalculatedProfit.filter(t => t.status === 'closed').length;
    const expiredTrades = tradesWithCalculatedProfit.filter(t => t.status === 'expired').length;

    const avgProfit = totalTrades > 0
      ? tradesWithCalculatedProfit.reduce((sum, t) => sum + t.max_profit_percent, 0) / totalTrades
      : 0;

    const maxProfit = totalTrades > 0
      ? Math.max(...tradesWithCalculatedProfit.map(t => t.max_profit_percent))
      : 0;

    const winningTrades = tradesWithCalculatedProfit.filter(t => t.calculated_max_profit >= 100).length;
    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100) : 0;

    const formattedDate = language === 'ar'
      ? reportDate.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : reportDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const html = generatePDFHTML({
      date: formattedDate,
      trades: tradesWithCalculatedProfit,
      stats: { totalTrades, activeTrades, closedTrades, expiredTrades, avgProfit, maxProfit, winRate },
      t,
      language
    });

    console.log('[PDF Report] HTML generated, length:', html.length);

    if (previewOnly) {
      console.log('[PDF Report] Returning preview');
      return new Response(
        JSON.stringify({
          success: true,
          html: html,
          stats: { totalTrades, activeTrades, closedTrades, expiredTrades, avgProfit, maxProfit, winRate }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: reportData, error: reportError } = await supabase
      .from('daily_trade_reports')
      .upsert({
        report_date: reportDateStr,
        total_trades: totalTrades,
        active_trades: activeTrades,
        closed_trades: closedTrades,
        expired_trades: expiredTrades,
        avg_profit_percent: avgProfit,
        max_profit_percent: maxProfit,
        win_rate: winRate,
        report_html: html,
      }, { onConflict: 'report_date' })
      .select()
      .single();

    if (reportError) console.error('Error storing report:', reportError);

    await sendToTelegramChannels(html, supabase, {
      totalTrades,
      activeTrades,
      closedTrades,
      expiredTrades,
      avgProfit,
      maxProfit,
      winRate
    }, reportDate, formattedDate, t);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Daily report generated',
        stats: { totalTrades, activeTrades, closedTrades, expiredTrades, avgProfit, maxProfit, winRate },
        reportSaved: !reportError,
        language
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating daily report:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generatePDFHTML(data: any): string {
  const { date, trades, stats, t, language } = data;
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const fontFamily = isRTL
    ? "'Cairo', 'Segoe UI', Tahoma, sans-serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const tradesHtml = trades.length === 0
    ? `<div class="no-trades"><div class="no-trades-icon">📭</div><h3>${t.noTrades}</h3><p>${t.noTradesDesc}</p></div>`
    : trades.map((trade: any) => {
        const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const highestPrice = trade.contract_high_since || trade.current_contract || 0;
        const profitDollar = trade.calculated_max_profit || 0;
        const profitPercent = trade.max_profit_percent || 0;
        const profitClass = profitDollar >= 100 ? 'positive' : profitDollar < 0 ? 'negative' : 'neutral';

        return `
          <div class="trade-card">
            <div class="trade-header">
              <div>
                <span class="trade-symbol">${trade.underlying_index_symbol}</span>
                <span class="trade-type ${trade.option_type?.toLowerCase()}">${trade.option_type?.toUpperCase() || 'N/A'}</span>
              </div>
              <div>
                <span class="trade-status ${trade.status}">${t[trade.status]?.toUpperCase() || trade.status?.toUpperCase()}</span>
              </div>
            </div>
            <div class="trade-details">
              <div class="trade-detail">
                <div class="trade-detail-label">${t.strikePrice}</div>
                <div class="trade-detail-value">$${trade.strike?.toFixed(2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.entryPrice}</div>
                <div class="trade-detail-value">$${entryPrice.toFixed(2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.highestPrice}</div>
                <div class="trade-detail-value">$${highestPrice.toFixed(2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.currentPrice}</div>
                <div class="trade-detail-value">$${trade.current_contract?.toFixed(2) || 'N/A'}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.maxProfitLabel}</div>
                <div class="trade-detail-value">
                  <span class="profit-badge ${profitClass}">$${profitDollar.toFixed(2)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(1)}%)</span>
                </div>
              </div>
              ${trade.status === 'closed' ? `
                <div class="trade-detail">
                  <div class="trade-detail-label">${t.outcome}</div>
                  <div class="trade-detail-value" style="font-size: 14px;">${profitDollar >= 100 ? t.win : t.loss}</div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title} - ${date}</title>
  ${isRTL ? '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">' : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      color: #1a202c;
      direction: ${dir};
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    .header h1 { font-size: 36px; font-weight: 700; margin-bottom: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header p { font-size: 18px; opacity: 0.95; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 40px;
      background: #f7fafc;
    }
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.07);
      text-align: center;
      border-left: 4px solid;
      ${isRTL ? 'border-left: none; border-right: 4px solid;' : ''}
    }
    .stat-card.primary { ${isRTL ? 'border-right-color: #667eea;' : 'border-left-color: #667eea;'} }
    .stat-card.success { ${isRTL ? 'border-right-color: #48bb78;' : 'border-left-color: #48bb78;'} }
    .stat-card.warning { ${isRTL ? 'border-right-color: #ed8936;' : 'border-left-color: #ed8936;'} }
    .stat-card.danger { ${isRTL ? 'border-right-color: #f56565;' : 'border-left-color: #f56565;'} }
    .stat-card.info { ${isRTL ? 'border-right-color: #4299e1;' : 'border-left-color: #4299e1;'} }
    .stat-value { font-size: 32px; font-weight: 700; color: #2d3748; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; }
    .trades-section { padding: 40px; }
    .section-title {
      font-size: 24px;
      font-weight: 700;
      color: #2d3748;
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 3px solid #667eea;
    }
    .trade-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .trade-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .trade-symbol { font-size: 24px; font-weight: 700; color: #2d3748; }
    .trade-type {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-${isRTL ? 'right' : 'left'}: 10px;
    }
    .trade-type.call { background: #c6f6d5; color: #22543d; }
    .trade-type.put { background: #fed7d7; color: #742a2a; }
    .trade-status {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .trade-status.active { background: #bee3f8; color: #2c5282; }
    .trade-status.closed { background: #c6f6d5; color: #22543d; }
    .trade-status.expired { background: #feebc8; color: #7c2d12; }
    .trade-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .trade-detail { padding: 15px; background: #f7fafc; border-radius: 8px; }
    .trade-detail-label {
      font-size: 12px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .trade-detail-value { font-size: 18px; font-weight: 700; color: #2d3748; }
    .profit-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 20px;
      font-weight: 700;
    }
    .profit-badge.positive { background: #c6f6d5; color: #22543d; }
    .profit-badge.negative { background: #fed7d7; color: #742a2a; }
    .profit-badge.neutral { background: #e2e8f0; color: #4a5568; }
    .footer {
      background: #2d3748;
      color: white;
      padding: 30px;
      text-align: center;
    }
    .footer p { margin: 5px 0; opacity: 0.9; }
    .no-trades { text-align: center; padding: 60px 20px; color: #718096; }
    .no-trades-icon { font-size: 64px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 ${t.title}</h1>
      <p>${date}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card primary">
        <div class="stat-value">${stats.totalTrades}</div>
        <div class="stat-label">${t.totalTrades}</div>
      </div>
      <div class="stat-card info">
        <div class="stat-value">${stats.activeTrades}</div>
        <div class="stat-label">${t.activeTrades}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${stats.closedTrades}</div>
        <div class="stat-label">${t.closedTrades}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${stats.expiredTrades}</div>
        <div class="stat-label">${t.expiredTrades}</div>
      </div>
      <div class="stat-card ${stats.avgProfit >= 0 ? 'success' : 'danger'}">
        <div class="stat-value">${stats.avgProfit.toFixed(1)}%</div>
        <div class="stat-label">${t.avgProfit}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${stats.maxProfit.toFixed(1)}%</div>
        <div class="stat-label">${t.maxProfit}</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-value">${stats.winRate.toFixed(1)}%</div>
        <div class="stat-label">${t.winRate}</div>
      </div>
    </div>
    <div class="trades-section">
      <h2 class="section-title">📈 ${t.todaysTrades}</h2>
      ${tradesHtml}
    </div>
    <div class="footer">
      <p><strong>${t.platform}</strong></p>
      <p>${t.generatedOn} ${new Date().toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</p>
      <p>© ${new Date().getFullYear()} ${t.copyright}</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendToTelegramChannels(html: string, supabase: any, stats: any, reportDate: Date, formattedDate: string, t: any) {
  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      console.error('Telegram bot token not found');
      return;
    }

    const { data: analyzerPlans, error } = await supabase
      .from('analyzer_plans')
      .select('id, analyst_id, telegram_channels!telegram_channel_id(channel_id, channel_name)')
      .not('telegram_channel_id', 'is', null)
      .eq('is_active', true);

    if (error) throw error;
    if (!analyzerPlans || analyzerPlans.length === 0) {
      console.log('No Telegram channels configured');
      return;
    }

    const profitEmoji = stats.avgProfit >= 0 ? '📈' : '📉';

    for (const plan of analyzerPlans) {
      const channelId = plan.telegram_channels.channel_id;
      const channelName = plan.telegram_channels.channel_name;

      const message = `📊 <b>${t.telegram.title}</b>
📅 ${formattedDate}

🎯 <b>${t.telegram.summary}</b>
━━━━━━━━━━━━━━━━━━━━
📌 ${t.telegram.total}: <b>${stats.totalTrades}</b>
🔵 ${t.telegram.active}: <b>${stats.activeTrades}</b>
✅ ${t.telegram.closed}: <b>${stats.closedTrades}</b>
⏰ ${t.telegram.expired}: <b>${stats.expiredTrades}</b>

${profitEmoji} <b>${t.telegram.metrics}</b>
━━━━━━━━━━━━━━━━━━━━
💰 ${t.telegram.avgProfit}: <b>${stats.avgProfit >= 0 ? '+' : ''}${stats.avgProfit.toFixed(1)}%</b>
🚀 ${t.telegram.maxProfit}: <b>+${stats.maxProfit.toFixed(1)}%</b>
🎯 ${t.telegram.winRate}: <b>${stats.winRate.toFixed(1)}%</b>

<i>📎 ${t.telegram.attached}</i>`.trim();

      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            text: message,
            parse_mode: 'HTML'
          })
        });

        const formData = new FormData();
        formData.append('chat_id', channelId);

        const htmlBlob = new Blob([html], { type: 'text/html' });
        const fileName = `Daily_Trading_Report_${reportDate.toISOString().split('T')[0]}.html`;
        formData.append('document', htmlBlob, fileName);
        formData.append('caption', `📊 ${t.telegram.title} - ${formattedDate}`);
        formData.append('parse_mode', 'HTML');

        await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
          method: 'POST',
          body: formData
        });

        console.log(`Daily report sent to channel: ${channelName}`);
      } catch (err) {
        console.error(`Error sending to channel ${channelName}:`, err);
      }
    }
  } catch (error) {
    console.error('Error sending to Telegram channels:', error);
  }
}
