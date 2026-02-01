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

interface GenerateReportRequest {
  date?: string;
  analyst_id: string;
  language_mode?: 'en' | 'ar' | 'dual';
  period_type?: 'daily' | 'weekly' | 'monthly';
  dry_run?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { date, analyst_id, language_mode = 'dual', period_type = 'daily', dry_run = false }: GenerateReportRequest = await req.json();

    const reportDate = date || new Date().toISOString().split('T')[0];
    console.log(`[Report Generator] Starting for date: ${reportDate}, analyst: ${analyst_id}, language: ${language_mode}, period: ${period_type}`);

    let startOfDay: Date;
    let endOfDay: Date;

    if (period_type === 'weekly') {
      const refDate = new Date(reportDate + 'T00:00:00.000Z');
      const dayOfWeek = refDate.getUTCDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfDay = new Date(refDate);
      startOfDay.setUTCDate(refDate.getUTCDate() - diff);
      startOfDay.setUTCHours(0, 0, 0, 0);

      endOfDay = new Date(startOfDay);
      endOfDay.setUTCDate(startOfDay.getUTCDate() + 6);
      endOfDay.setUTCHours(23, 59, 59, 999);
    } else if (period_type === 'monthly') {
      const refDate = new Date(reportDate + 'T00:00:00.000Z');
      startOfDay = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1, 0, 0, 0, 0));
      endOfDay = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      startOfDay = new Date(reportDate + 'T00:00:00.000Z');
      endOfDay = new Date(reportDate + 'T23:59:59.999Z');
    }

    const { data: allTradesFromDB, error: tradesError } = await supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analyst_id)
      .order('created_at', { ascending: false });

    if (tradesError) throw tradesError;

    console.log(`[Report Generator] Total trades from DB: ${allTradesFromDB?.length || 0}`);
    console.log(`[Report Generator] Date range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    const trades = (allTradesFromDB || []).filter(t => {
      const createdAt = new Date(t.created_at);
      const closedAt = t.closed_at ? new Date(t.closed_at) : null;
      const expiryDate = t.expiry ? new Date(t.expiry) : null;

      const matchCreated = createdAt >= startOfDay && createdAt <= endOfDay;
      const matchClosed = closedAt && closedAt >= startOfDay && closedAt <= endOfDay;
      const matchExpiry = expiryDate && expiryDate >= startOfDay && expiryDate <= endOfDay;
      const matchActive = t.status === 'active' && createdAt <= endOfDay;

      return matchCreated || matchClosed || matchExpiry || matchActive;
    });

    console.log(`[Report Generator] Filtered trades for period: ${trades?.length || 0}`);

    const activeTrades = trades.filter(t => t.status === 'active');

    const closedTrades = trades.filter(t => {
      if (!t.closed_at) return false;
      const closedAt = new Date(t.closed_at);
      return t.status === 'closed' &&
        closedAt >= startOfDay &&
        closedAt <= endOfDay;
    });

    const closedTradeIds = new Set(closedTrades.map(t => t.id));

    const expiredTrades = trades.filter(t => {
      if (closedTradeIds.has(t.id)) return false;
      if (!t.expiry) return false;
      const expiryDate = new Date(t.expiry);
      return expiryDate >= startOfDay &&
        expiryDate <= endOfDay;
    });

    const enrichedExpiredTrades = expiredTrades.map(trade => {
      const entryPrice = trade.entry_contract_snapshot?.price || trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
      const highestPrice = trade.contract_high_since || entryPrice;
      const qty = trade.qty || 1;
      const maxProfit = (highestPrice - entryPrice) * qty * 100;
      
      return {
        ...trade,
        is_expired_winner: maxProfit >= 100,
        expired_status: maxProfit >= 100 
          ? 'Expired (Counted as Close — Winner by +$100 rule)'
          : 'Expired (Counted as Close)'
      };
    });

    const allTrades = [...activeTrades, ...closedTrades, ...enrichedExpiredTrades];

    const totalTrades = allTrades.length;
    const totalActive = activeTrades.length;
    const totalClosed = closedTrades.length;
    const totalExpired = expiredTrades.length;

    const profitableTrades = [...closedTrades, ...enrichedExpiredTrades].filter(t => {
      const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
      const highestPrice = t.contract_high_since || entryPrice;
      const qty = t.qty || 1;
      const maxProfit = (highestPrice - entryPrice) * qty * 100;
      return maxProfit >= 100;
    });

    const avgProfit = allTrades.length > 0
      ? allTrades.reduce((sum, t) => {
          const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
          const highestPrice = t.contract_high_since || entryPrice;
          return sum + (entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice * 100) : 0);
        }, 0) / allTrades.length
      : 0;

    const maxProfit = allTrades.length > 0
      ? Math.max(...allTrades.map(t => {
          const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
          const highestPrice = t.contract_high_since || entryPrice;
          return entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice * 100) : 0;
        }))
      : 0;

    const winRate = (closedTrades.length + expiredTrades.length) > 0
      ? (profitableTrades.length / (closedTrades.length + expiredTrades.length) * 100)
      : 0;

    const completedTrades = [...closedTrades, ...enrichedExpiredTrades];
    const winningTradesList = completedTrades.filter(t => t.is_winning_trade === true || t.is_expired_winner === true);
    const losingTradesList = completedTrades.filter(t => t.is_winning_trade === false && !t.is_expired_winner);

    const totalProfit = winningTradesList.reduce((sum, t) => {
      const profit = t.pnl_usd || t.final_profit || t.computed_profit_usd || 0;
      return sum + Math.abs(profit);
    }, 0);

    const totalLoss = losingTradesList.reduce((sum, t) => {
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

    const winningTrades = winningTradesList.length;
    const losingTrades = losingTradesList.length;

    const metrics = {
      total_trades: totalTrades,
      active_trades: totalActive,
      closed_trades: totalClosed,
      expired_trades: totalExpired,
      avg_profit_percent: avgProfit,
      max_profit_percent: maxProfit,
      win_rate: winRate,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      total_profit: totalProfit,
      total_loss: totalLoss,
      net_profit: netProfit,
      total_profit_dollars: netProfit
    };

    const { data: analyzerProfile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', analyst_id)
      .single();

    const html = generateReportHTML({
      date: reportDate,
      trades: allTrades,
      expiredTrades: enrichedExpiredTrades,
      metrics,
      language_mode,
      analyzer: analyzerProfile
    });

    if (dry_run) {
      const tradesForPreview = allTrades.map(trade => {
        const entryPrice = trade.entry_contract_snapshot?.price || trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const highestPrice = trade.contract_high_since || trade.current_contract || 0;
        const currentPrice = trade.current_contract || 0;
        const qty = trade.qty || 1;
        const profit = (highestPrice - entryPrice) * qty * 100;
        const profitPercent = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice * 100) : 0;

        return {
          id: trade.id,
          symbol: trade.underlying_index_symbol,
          type: trade.option_type,
          strike: trade.strike,
          entry_price: entryPrice,
          highest_price: highestPrice,
          current_price: currentPrice,
          qty: qty,
          profit: profit,
          profit_percent: profitPercent,
          status: trade.status,
          expired_status: trade.expired_status,
          created_at: trade.created_at,
          expiry: trade.expiry
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          metrics,
          trades: tradesForPreview,
          analyzer: analyzerProfile,
          dry_run: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileName = `${analyst_id}/${reportDate}-${language_mode}.html`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('daily-reports')
      .upload(fileName, new Blob([html], { type: 'text/html' }), {
        upsert: true
      });

    if (uploadError) throw uploadError;

    const downloadFileName = `daily-report-${reportDate}.html`;

    const { data: urlData } = await supabase.storage
      .from('daily-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7, {
        download: downloadFileName
      });

    const { data: reportRecord, error: insertError } = await supabase
      .from('daily_trade_reports')
      .upsert({
        report_date: reportDate,
        author_id: analyst_id,
        telegram_channel_id: null,
        html_content: html,
        trade_count: totalTrades,
        summary: metrics,
        language_mode,
        period_type,
        start_date: startOfDay.toISOString().split('T')[0],
        end_date: endOfDay.toISOString().split('T')[0],
        file_path: fileName,
        file_url: urlData?.signedUrl,
        file_size_bytes: html.length,
        status: 'generated'
      }, {
        onConflict: 'report_date,author_id,language_mode,period_type',
        returning: 'representation'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`[Report Generator] Successfully generated report ${reportRecord.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        report_id: reportRecord.id,
        file_url: urlData?.signedUrl,
        metrics
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Report Generator] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateReportHTML(data: any): string {
  const { date, trades, expiredTrades, metrics, language_mode, analyzer } = data;
  
  const isArabic = language_mode === 'ar';
  const isDual = language_mode === 'dual';
  const dir = isArabic ? 'rtl' : 'ltr';
  
  const dateFormatted = new Date(date).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const t = {
    title: isDual ? 'Daily Trading Report | تقرير التداول اليومي' : isArabic ? 'تقرير التداول اليومي' : 'Daily Trading Report',
    date: isDual ? `Date | التاريخ` : isArabic ? 'التاريخ' : 'Date',
    summary: isDual ? 'Performance Summary | ملخص الأداء' : isArabic ? 'ملخص الأداء' : 'Performance Summary',
    total: isDual ? 'Total Trades | إجمالي الصفقات' : isArabic ? 'إجمالي الصفقات' : 'Total Trades',
    active: isDual ? 'Active | نشطة' : isArabic ? 'نشطة' : 'Active',
    closed: isDual ? 'Closed | مغلقة' : isArabic ? 'مغلقة' : 'Closed',
    expired: isDual ? 'Expired | منتهية' : isArabic ? 'منتهية' : 'Expired',
    winners: isDual ? 'Winners | رابحة' : isArabic ? 'رابحة' : 'Winners',
    losers: isDual ? 'Losers | خاسرة' : isArabic ? 'خاسرة' : 'Losers',
    totalProfit: isDual ? 'Total Profit | إجمالي الربح' : isArabic ? 'إجمالي الربح' : 'Total Profit',
    totalLoss: isDual ? 'Total Loss | إجمالي الخسارة' : isArabic ? 'إجمالي الخسارة' : 'Total Loss',
    netProfit: isDual ? 'Net Profit | صافي الربح' : isArabic ? 'صافي الربح' : 'Net Profit',
    avgProfit: isDual ? 'Avg Profit | متوسط الربح' : isArabic ? 'متوسط الربح' : 'Avg Profit',
    maxProfit: isDual ? 'Max Profit | أقصى ربح' : isArabic ? 'أقصى ربح' : 'Max Profit',
    winRate: isDual ? 'Win Rate | معدل النجاح' : isArabic ? 'معدل النجاح' : 'Win Rate',
    todayTrades: isDual ? "Today's Trades | صفقات اليوم" : isArabic ? 'صفقات اليوم' : "Today's Trades",
    tradeDetails: isDual ? 'Trade Details | تفاصيل الصفقة' : isArabic ? 'تفاصيل الصفقة' : 'Trade Details',
    entry: isDual ? 'Entry | الدخول' : isArabic ? 'الدخول' : 'Entry',
    highest: isDual ? 'Highest | الأعلى' : isArabic ? 'الأعلى' : 'Highest',
    strike: isDual ? 'Strike | السعر' : isArabic ? 'السعر' : 'Strike',
    expiry: isDual ? 'Expiry | الانتهاء' : isArabic ? 'الانتهاء' : 'Expiry',
    profit: isDual ? 'Profit | الربح' : isArabic ? 'الربح' : 'Profit',
    noTrades: isDual ? 'No trades recorded | لا توجد صفقات مسجلة' : isArabic ? 'لا توجد صفقات مسجلة' : 'No trades recorded',
    call: isDual ? 'CALL | شراء' : isArabic ? 'شراء' : 'CALL',
    put: isDual ? 'PUT | بيع' : isArabic ? 'بيع' : 'PUT',
    activeStatus: isDual ? 'ACTIVE | نشطة' : isArabic ? 'نشطة' : 'ACTIVE',
    closedStatus: isDual ? 'CLOSED | مغلقة' : isArabic ? 'مغلقة' : 'CLOSED',
    expiredStatus: isDual ? 'EXPIRED | منتهية' : isArabic ? 'منتهية' : 'EXPIRED'
  };

  const analyzerName = analyzer?.full_name || analyzer?.username || 'Analyzer';
  const analyzerInitials = analyzerName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const avatarHTML = analyzer?.avatar_url 
    ? `<img src="${analyzer.avatar_url}" alt="${analyzerName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,0.3); box-shadow: 0 4px 12px rgba(0,0,0,0.2);" />`
    : `<div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: white; border: 4px solid rgba(255,255,255,0.3); box-shadow: 0 4px 12px rgba(0,0,0,0.2);">${analyzerInitials}</div>`;

  const tradesHTML = trades.length === 0
    ? `<div class="no-trades"><div class="no-trades-icon">📭</div><h3>${t.noTrades}</h3></div>`
    : trades.map((trade: any) => {
        const entryPrice = trade.entry_contract_snapshot?.price || trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const highestPrice = trade.contract_high_since || trade.current_contract || 0;
        const currentPrice = trade.current_contract || 0;
        const qty = trade.qty || 1;
        const multiplier = 100;

        // Use actual P&L from database for closed trades, otherwise calculate
        let profitDollars: number;
        if (trade.status === 'closed' && (trade.pnl_usd !== null && trade.pnl_usd !== undefined)) {
          profitDollars = parseFloat(trade.pnl_usd.toString());
        } else if (trade.final_profit !== null && trade.final_profit !== undefined) {
          profitDollars = parseFloat(trade.final_profit.toString());
        } else {
          profitDollars = (highestPrice - entryPrice) * qty * multiplier;
        }

        const profitPercent = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice * 100) : 0;
        const profitClass = profitDollars > 0 ? 'positive' : profitDollars < 0 ? 'negative' : 'neutral';

        const optionTypeText = trade.option_type?.toLowerCase() === 'call' ? t.call : trade.option_type?.toLowerCase() === 'put' ? t.put : trade.option_type?.toUpperCase();

        let statusText = trade.expired_status || trade.status?.toUpperCase();
        if (trade.status === 'active') {
          statusText = t.activeStatus;
        } else if (trade.status === 'closed') {
          statusText = t.closedStatus;
        } else if (trade.expired_status) {
          statusText = t.expiredStatus;
        }

        return `
          <div class="trade-card">
            <div class="trade-header">
              <div>
                <span class="trade-symbol">${trade.underlying_index_symbol}</span>
                <span class="trade-type ${trade.option_type?.toLowerCase()}">${optionTypeText}</span>
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
                <div class="trade-detail-label">${t.expiry}</div>
                <div class="trade-detail-value">${trade.expiry ? new Date(trade.expiry).toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</div>
              </div>
              <div class="trade-detail">
                <div class="trade-detail-label">${t.profit}</div>
                <div class="trade-detail-value">
                  <span class="profit-badge ${profitClass}">${profitDollars > 0 ? '+' : profitDollars < 0 ? '-' : ''}${formatCurrencySimple(Math.abs(profitDollars), 0)}</span>
                </div>
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
  <title>${t.title}</title>
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
    .header-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
    .header h1 { font-size: 36px; font-weight: 700; margin-bottom: 10px; }
    .header p { font-size: 18px; opacity: 0.95; }
    .analyzer-info {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-top: 10px;
      padding: 15px 30px;
      background: rgba(255,255,255,0.1);
      border-radius: 50px;
      backdrop-filter: blur(10px);
    }
    .analyzer-name {
      font-size: 20px;
      font-weight: 600;
      color: white;
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
    .trade-header { display: flex; justify-content: space-between; margin-bottom: 20px; }
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
    .trade-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
    }
    .trade-detail { padding: 15px; background: #f7fafc; border-radius: 8px; }
    .trade-detail-label { font-size: 12px; color: #718096; margin-bottom: 5px; }
    .trade-detail-value { font-size: 18px; font-weight: 700; color: #2d3748; }
    .profit-badge { padding: 8px 16px; border-radius: 8px; font-size: 20px; font-weight: 700; }
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
      <div class="header-content">
        <div>
          <h1>📊 ${t.title}</h1>
          <p>${dateFormatted}</p>
        </div>
        <div class="analyzer-info">
          ${avatarHTML}
          <span class="analyzer-name">${analyzerName}</span>
        </div>
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
        <div class="stat-label">${t.winRate}</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-value">${metrics.total_trades}</div>
        <div class="stat-label">${t.total}</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-value">${metrics.active_trades}</div>
        <div class="stat-label">${t.active}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${metrics.winning_trades}</div>
        <div class="stat-label">${t.winners}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${metrics.losing_trades}</div>
        <div class="stat-label">${t.losers}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${formatNumber(metrics.max_profit_percent, 1)}%</div>
        <div class="stat-label">${t.maxProfit}</div>
      </div>
    </div>
    <div class="trades-section">
      <h2 class="section-title">📈 ${t.todayTrades}</h2>
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
