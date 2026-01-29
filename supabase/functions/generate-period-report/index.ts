import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function formatNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(value: number, decimals: number = 0): string {
  const formatted = formatNumber(Math.abs(value), decimals);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${formatted}`;
}

function formatCurrencySimple(value: number, decimals: number = 0): string {
  const formatted = formatNumber(Math.abs(value), decimals);
  return value >= 0 ? `$${formatted}` : `-$${formatted}`;
}

interface GeneratePeriodReportRequest {
  start_date: string;
  end_date: string;
  analyst_id: string;
  language_mode?: 'en' | 'ar' | 'dual';
  period_type: 'daily' | 'weekly' | 'monthly' | 'custom';
  dry_run?: boolean;
}

const US_MARKET_HOLIDAYS = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25'
];

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0];
  return US_MARKET_HOLIDAYS.includes(dateStr);
}

function isMarketOpen(date: Date): boolean {
  return !isWeekend(date) && !isMarketHoliday(date);
}

function getTradingDaysCount(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isMarketOpen(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      start_date,
      end_date,
      analyst_id,
      language_mode = 'dual',
      period_type,
      dry_run = false
    }: GeneratePeriodReportRequest = await req.json();

    console.log(`[Period Report] ${period_type} report: ${start_date} to ${end_date} for analyst ${analyst_id}`);

    const startDate = new Date(start_date + 'T00:00:00.000Z');
    const endDate = new Date(end_date + 'T23:59:59.999Z');

    const tradingDays = getTradingDaysCount(startDate, endDate);
    console.log(`[Period Report] Trading days in period: ${tradingDays}`);

    const { data: trades, error: tradesError } = await supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analyst_id)
      .order('created_at', { ascending: false });

    if (tradesError) throw tradesError;

    const allTrades = (trades || []).filter(t => {
      const createdAt = new Date(t.created_at);
      const closedAt = t.closed_at ? new Date(t.closed_at) : null;
      const expiryDate = t.expiry ? new Date(t.expiry) : null;

      return (
        (createdAt >= startDate && createdAt <= endDate) ||
        (closedAt && closedAt >= startDate && closedAt <= endDate) ||
        (expiryDate && expiryDate >= startDate && expiryDate <= endDate) ||
        (t.status === 'active' && createdAt <= endDate)
      );
    });
    const activeTrades = allTrades.filter(t => t.status === 'active');
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    const expiredTrades = allTrades.filter(t => t.status === 'expired');

    const completedTrades = allTrades.filter(t => t.status === 'closed' || t.status === 'expired');

    const winningTrades = completedTrades.filter(t => t.is_winning_trade === true);
    const losingTrades = completedTrades.filter(t => t.is_winning_trade === false);

    const totalProfit = winningTrades.reduce((sum, t) => {
      const profit = t.pnl_usd || t.final_profit || t.computed_profit_usd || 0;
      return sum + Math.abs(profit);
    }, 0);

    const totalLoss = losingTrades.reduce((sum, t) => {
      let loss = t.pnl_usd || t.final_profit || t.computed_profit_usd;

      if (!loss || loss === 0) {
        const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
        const qty = t.qty || 1;
        const multiplier = t.contract_multiplier || 100;
        loss = -(entryPrice * qty * multiplier);
      }

      return sum + Math.abs(loss);
    }, 0);

    const netProfit = totalProfit - totalLoss;

    const winRate = completedTrades.length > 0
      ? (winningTrades.length / completedTrades.length * 100)
      : 0;

    const avgProfitPerWinningTrade = winningTrades.length > 0
      ? totalProfit / winningTrades.length
      : 0;

    const avgLossPerLosingTrade = losingTrades.length > 0
      ? -(totalLoss / losingTrades.length)
      : 0;

    const allProfits = completedTrades.map(t => t.pnl_usd || t.final_profit || t.computed_profit_usd || 0);
    const bestTrade = allProfits.length > 0 ? Math.max(...allProfits) : 0;
    const worstTrade = allProfits.length > 0 ? Math.min(...allProfits) : 0;

    const metrics = {
      total_trades: allTrades.length,
      active_trades: activeTrades.length,
      closed_trades: closedTrades.length,
      expired_trades: expiredTrades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: winRate,
      total_profit: totalProfit,
      total_loss: -totalLoss,
      net_profit: netProfit,
      total_profit_dollars: netProfit,
      avg_profit_per_winning_trade: avgProfitPerWinningTrade,
      avg_loss_per_losing_trade: avgLossPerLosingTrade,
      best_trade: bestTrade,
      worst_trade: worstTrade,
      trading_days: tradingDays,
      period_type,
      start_date,
      end_date
    };

    const { data: analyzerProfile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', analyst_id)
      .single();

    const html = generatePeriodReportHTML({
      start_date,
      end_date,
      period_type,
      trades: allTrades,
      metrics,
      language_mode,
      analyzer: analyzerProfile
    });

    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          metrics,
          analyzer: analyzerProfile,
          dry_run: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileName = `${analyst_id}/${period_type}-report-${start_date}-to-${end_date}.html`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('daily-reports')
      .upload(fileName, new Blob([html], { type: 'text/html' }), { upsert: true });

    if (uploadError) throw uploadError;

    const downloadFileName = `${period_type}-report-${start_date}-to-${end_date}.html`;

    const { data: urlData } = await supabase.storage
      .from('daily-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7, {
        download: downloadFileName
      });

    const { data: reportRecord, error: insertError } = await supabase
      .from('daily_trade_reports')
      .upsert({
        report_date: end_date,
        author_id: analyst_id,
        telegram_channel_id: null,
        html_content: html,
        trade_count: allTrades.length,
        summary: metrics,
        language_mode,
        file_path: fileName,
        file_url: urlData?.signedUrl,
        file_size_bytes: new Blob([html]).size,
        status: 'generated',
        generated_by: analyst_id,
        period_type,
        start_date,
        end_date
      }, {
        onConflict: 'report_date,author_id,language_mode,period_type'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`[Period Report] Generated successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        file_url: urlData?.signedUrl,
        metrics,
        report_id: reportRecord?.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Period Report] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generatePeriodReportHTML(data: any): string {
  const { start_date, end_date, period_type, trades, metrics, language_mode, analyzer } = data;

  const isArabic = language_mode === 'ar';
  const isDual = language_mode === 'dual';
  const dir = isArabic ? 'rtl' : 'ltr';

  const periodTitle = {
    'daily': isDual ? 'Daily Report | تقرير يومي' : isArabic ? 'تقرير يومي' : 'Daily Report',
    'weekly': isDual ? 'Weekly Report | تقرير أسبوعي' : isArabic ? 'تقرير أسبوعي' : 'Weekly Report',
    'monthly': isDual ? 'Monthly Report | تقرير شهري' : isArabic ? 'تقرير شهري' : 'Monthly Report',
    'custom': isDual ? 'Period Report | تقرير الفترة' : isArabic ? 'تقرير الفترة' : 'Period Report'
  }[period_type];

  const startFormatted = new Date(start_date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const endFormatted = new Date(end_date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const dateRange = `${startFormatted} - ${endFormatted}`;

  const t = {
    tradesTitle: isDual ? 'Period Trades | صفقات الفترة' : isArabic ? 'صفقات الفترة' : 'Period Trades',
    entry: isDual ? 'Entry | الدخول' : isArabic ? 'الدخول' : 'Entry',
    highest: isDual ? 'Highest | الأعلى' : isArabic ? 'الأعلى' : 'Highest',
    strike: isDual ? 'Strike | السعر' : isArabic ? 'السعر' : 'Strike',
    profit: isDual ? 'Profit | الربح' : isArabic ? 'الربح' : 'Profit',
    noTrades: isDual ? 'No trades recorded | لا توجد صفقات مسجلة' : isArabic ? 'لا توجد صفقات مسجلة' : 'No trades recorded',
    created: isDual ? 'Created | تاريخ الإنشاء' : isArabic ? 'تاريخ الإنشاء' : 'Created'
  };

  const analyzerName = analyzer?.full_name || analyzer?.username || 'Analyzer';
  const analyzerInitials = analyzerName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const avatarHTML = analyzer?.avatar_url
    ? `<img src="${analyzer.avatar_url}" alt="${analyzerName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,0.3); box-shadow: 0 4px 12px rgba(0,0,0,0.2);" />`
    : `<div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: white; border: 4px solid rgba(255,255,255,0.3); box-shadow: 0 4px 12px rgba(0,0,0,0.2);">${analyzerInitials}</div>`;

  const tradesHTML = trades.length === 0
    ? `<div class="no-trades"><div class="no-trades-icon">📭</div><h3>${t.noTrades}</h3></div>`
    : trades.map((trade: any) => {
        const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const highestPrice = trade.contract_high_since || trade.current_contract || 0;
        const profitPercent = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice * 100) : 0;
        const profitDollars = trade.final_profit || trade.max_profit || 0;
        const profitClass = profitDollars > 0 ? 'positive' : profitDollars < 0 ? 'negative' : 'neutral';
        const statusText = trade.status?.toUpperCase() || 'N/A';
        const createdDate = new Date(trade.created_at).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return `
          <div class="trade-card">
            <div class="trade-header">
              <div>
                <span class="trade-symbol">${trade.underlying_index_symbol || 'N/A'}</span>
                <span class="trade-type ${trade.option_type?.toLowerCase()}">${trade.option_type?.toUpperCase() || 'N/A'}</span>
              </div>
              <div>
                <span class="trade-status ${trade.status}">${statusText}</span>
              </div>
            </div>
            <div class="trade-details">
              <div class="trade-detail">
                <div class="trade-detail-label">${t.strike}</div>
                <div class="trade-detail-value">${formatCurrencySimple(trade.strike || 0, 2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.entry}</div>
                <div class="trade-detail-value">${formatCurrencySimple(entryPrice, 2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.highest}</div>
                <div class="trade-detail-value">${formatCurrencySimple(highestPrice, 2)}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.profit}</div>
                <div class="profit-badge ${profitClass}">${profitDollars >= 0 ? '+' : ''}${formatCurrencySimple(profitDollars)} (${profitPercent >= 0 ? '+' : ''}${formatNumber(profitPercent, 1)}%)</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.created}</div>
                <div class="trade-detail-value" style="font-size: 14px;">${createdDate}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${periodTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${isArabic || isDual ? "'Cairo', " : ''}-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
    .header h1 { font-size: 36px; font-weight: 700; margin-bottom: 10px; }
    .header p { font-size: 18px; opacity: 0.95; margin-bottom: 10px; }
    .analyzer-info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin-top: 20px;
      padding: 15px 30px;
      background: rgba(255,255,255,0.1);
      border-radius: 50px;
      backdrop-filter: blur(10px);
      display: inline-flex;
    }
    .net-profit-hero {
      padding: 40px;
      margin: 0 40px 20px;
      border-radius: 20px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .net-profit-hero.positive {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      box-shadow: 0 20px 60px rgba(16, 185, 129, 0.4);
      animation: pulse-positive 3s ease-in-out infinite;
    }
    .net-profit-hero.negative {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      box-shadow: 0 20px 60px rgba(239, 68, 68, 0.4);
      animation: pulse-negative 3s ease-in-out infinite;
    }
    .net-profit-hero::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(45deg, transparent, rgba(255,255,255,0.15), transparent);
      transform: rotate(45deg);
      animation: shine 3s infinite;
    }
    @keyframes shine {
      0%, 100% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
      50% { transform: translateX(100%) translateY(100%) rotate(45deg); }
    }
    @keyframes pulse-positive {
      0%, 100% { box-shadow: 0 20px 60px rgba(16, 185, 129, 0.4); }
      50% { box-shadow: 0 25px 80px rgba(16, 185, 129, 0.6); }
    }
    @keyframes pulse-negative {
      0%, 100% { box-shadow: 0 20px 60px rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 25px 80px rgba(239, 68, 68, 0.6); }
    }
    .net-profit-icon {
      font-size: 48px;
      margin-bottom: 15px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
    }
    .net-profit-value {
      font-size: 56px;
      font-weight: 800;
      color: white;
      margin-bottom: 10px;
      text-shadow: 0 4px 12px rgba(0,0,0,0.3);
      position: relative;
      z-index: 1;
    }
    .net-profit-label {
      font-size: 18px;
      color: rgba(255,255,255,0.95);
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 600;
      position: relative;
      z-index: 1;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 0 40px 40px;
      background: #f7fafc;
    }
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.07);
      text-align: center;
      border-${dir === 'rtl' ? 'right' : 'left'}: 4px solid;
    }
    .stat-card.primary { border-${dir === 'rtl' ? 'right' : 'left'}-color: #667eea; }
    .stat-card.success { border-${dir === 'rtl' ? 'right' : 'left'}-color: #48bb78; }
    .stat-card.warning { border-${dir === 'rtl' ? 'right' : 'left'}-color: #ed8936; }
    .stat-card.info { border-${dir === 'rtl' ? 'right' : 'left'}-color: #4299e1; }
    .stat-value { font-size: 32px; font-weight: 700; color: #2d3748; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: #718096; text-transform: uppercase; }
    .trades-section { padding: 40px; }
    .section-title { font-size: 24px; font-weight: 700; color: #2d3748; margin-bottom: 25px; }
    .trade-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .trade-header { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: center; }
    .trade-symbol { font-size: 24px; font-weight: 700; color: #2d3748; }
    .trade-type {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-${dir === 'rtl' ? 'right' : 'left'}: 10px;
    }
    .trade-type.call { background: #c6f6d5; color: #22543d; }
    .trade-type.put { background: #fed7d7; color: #742a2a; }
    .trade-status { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .trade-status.active { background: #bee3f8; color: #2c5282; }
    .trade-status.closed { background: #c6f6d5; color: #22543d; }
    .trade-status.expired { background: #fbd38d; color: #744210; }
    .trade-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
    }
    .trade-detail { padding: 15px; background: #f7fafc; border-radius: 8px; }
    .trade-detail-label { font-size: 12px; color: #718096; margin-bottom: 5px; }
    .trade-detail-value { font-size: 18px; font-weight: 700; color: #2d3748; }
    .profit-badge { padding: 8px 16px; border-radius: 8px; font-size: 16px; font-weight: 700; }
    .profit-badge.positive { background: #c6f6d5; color: #22543d; }
    .profit-badge.negative { background: #fed7d7; color: #742a2a; }
    .profit-badge.neutral { background: #e2e8f0; color: #4a5568; }
    .no-trades { text-align: center; padding: 60px 20px; color: #718096; }
    .no-trades-icon { font-size: 64px; margin-bottom: 20px; }
    .footer { background: #2d3748; color: white; padding: 30px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 ${periodTitle}</h1>
      <p>${dateRange}</p>
      <p style="font-size: 14px; opacity: 0.8;">${isDual ? `${metrics.trading_days} Trading Days | ${metrics.trading_days} يوم تداول` : isArabic ? `${metrics.trading_days} يوم تداول` : `${metrics.trading_days} Trading Days`}</p>
      <div class="analyzer-info">
        ${avatarHTML}
        <span class="analyzer-name" style="font-size: 20px; font-weight: 600;">${analyzerName}</span>
      </div>
    </div>
    <div class="net-profit-hero ${metrics.net_profit >= 0 ? 'positive' : 'negative'}">
      <div class="net-profit-icon">${metrics.net_profit >= 0 ? '💰' : '📉'}</div>
      <div class="net-profit-value">${formatCurrency(metrics.net_profit)}</div>
      <div class="net-profit-label">${isDual ? 'Net Profit | صافي الربح' : isArabic ? 'صافي الربح' : 'Net Profit'}</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card success">
        <div class="stat-value">+${formatCurrencySimple(metrics.total_profit)}</div>
        <div class="stat-label">${isDual ? 'Total Profit | إجمالي الربح' : isArabic ? 'إجمالي الربح' : 'Total Profit'}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">-${formatCurrencySimple(metrics.total_loss)}</div>
        <div class="stat-label">${isDual ? 'Total Loss | إجمالي الخسارة' : isArabic ? 'إجمالي الخسارة' : 'Total Loss'}</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-value">${formatNumber(metrics.win_rate, 1)}%</div>
        <div class="stat-label">${isDual ? 'Win Rate | معدل الربح' : isArabic ? 'معدل الربح' : 'Win Rate'}</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-value">${metrics.total_trades}</div>
        <div class="stat-label">${isDual ? 'Total Trades | إجمالي الصفقات' : isArabic ? 'إجمالي الصفقات' : 'Total Trades'}</div>
      </div>
      <div class="stat-card info">
        <div class="stat-value">${metrics.active_trades}</div>
        <div class="stat-label">${isDual ? 'Active | نشطة' : isArabic ? 'نشطة' : 'Active'}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${metrics.winning_trades}</div>
        <div class="stat-label">${isDual ? 'Winners | رابحة' : isArabic ? 'رابحة' : 'Winners'}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${metrics.losing_trades}</div>
        <div class="stat-label">${isDual ? 'Losers | خاسرة' : isArabic ? 'خاسرة' : 'Losers'}</div>
      </div>
    </div>
    <div class="trades-section">
      <h2 class="section-title">📈 ${t.tradesTitle}</h2>
      ${tradesHTML}
    </div>
    <div class="footer">
      <p><strong>AnalyZHub</strong></p>
      <p>© ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>`;
}
