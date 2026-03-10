import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ─── Design tokens (kept in sync with generate-advanced-daily-report) ─────────
const D = {
  bg: '#0D1117', card: '#161B22', elevated: '#1C2128',
  border: '#30363D', borderLight: '#21262D',
  text: '#E6EDF3', textSub: '#8B949E', textMuted: '#6E7681',
  call: '#3FB950', put: '#F85149', blue: '#58A6FF',
};

// ─── Number helpers ───────────────────────────────────────────────────────────
function fmt(v: number, d = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUSD(v: number, d = 0): string {
  return `${v >= 0 ? '+' : '-'}$${fmt(Math.abs(v), d)}`;
}
function fmtPlain(v: number, d = 0): string {
  return `${v >= 0 ? '$' : '-$'}${fmt(Math.abs(v), d)}`;
}

// ─── Price / profit helpers ───────────────────────────────────────────────────
function getEntryPrice(trade: any): number {
  const s = trade.entry_contract_snapshot ?? {};
  const v = s.price ?? s.mid ?? s.last ?? 0;
  return Number.isFinite(+v) ? +v : 0;
}
function getHighestPrice(trade: any, entry: number): number {
  const v = trade.contract_high_since ?? trade.current_contract ?? entry;
  return Number.isFinite(+v) ? +v : entry;
}
function getTradeProfit(trade: any): number {
  if (trade.pnl_usd      != null) return +trade.pnl_usd      || 0;
  if (trade.final_profit != null) return +trade.final_profit  || 0;
  if (trade.max_profit   != null) return +trade.max_profit    || 0;
  const entry = getEntryPrice(trade);
  const high  = getHighestPrice(trade, entry);
  return (high - entry) * (trade.qty || 1) * (trade.contract_multiplier || 100);
}

interface GeneratePeriodReportRequest {
  start_date: string;
  end_date: string;
  analyst_id: string;
  language_mode?: 'en' | 'ar' | 'dual';
  period_type: 'daily' | 'weekly' | 'monthly' | 'custom';
  telegram_channel_id?: string;
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
      telegram_channel_id,
      dry_run = false
    }: GeneratePeriodReportRequest = await req.json();

    console.log(`[Period Report] ${period_type} report: ${start_date} to ${end_date} for analyst ${analyst_id}, channel: ${telegram_channel_id || 'all'}`);

    const startDate = new Date(start_date + 'T00:00:00.000Z');
    const endDate = new Date(end_date + 'T23:59:59.999Z');

    const tradingDays = getTradingDaysCount(startDate, endDate);
    console.log(`[Period Report] Trading days in period: ${tradingDays}`);

    let tradesQuery = supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analyst_id)
      .eq('is_testing', false)
      .order('created_at', { ascending: false });

    if (telegram_channel_id) {
      tradesQuery = tradesQuery.eq('telegram_channel_id', telegram_channel_id);
    }

    const { data: trades, error: tradesError } = await tradesQuery;

    if (tradesError) throw tradesError;

    console.log(`[Period Report] Total trades from DB: ${trades?.length || 0}`);
    console.log(`[Period Report] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const allTrades = (trades || []).filter(t => {
      const createdAt = new Date(t.created_at);
      const closedAt = t.closed_at ? new Date(t.closed_at) : null;
      const expiryDate = t.expiry ? new Date(t.expiry) : null;

      const matchCreated = createdAt >= startDate && createdAt <= endDate;
      const matchClosed = closedAt && closedAt >= startDate && closedAt <= endDate;
      const matchExpiry = expiryDate && expiryDate >= startDate && expiryDate <= endDate;
      const matchActive = t.status === 'active' && createdAt <= endDate;

      return matchCreated || matchClosed || matchExpiry || matchActive;
    });

    console.log(`[Period Report] Filtered trades: ${allTrades.length}`);

    const activeTrades = allTrades.filter(t => t.status === 'active');

    const expiredTrades = allTrades.filter(t => {
      if (!t.expiry) return false;
      const expiryDate = new Date(t.expiry);
      return expiryDate >= startDate && expiryDate <= endDate;
    });

    const closedTrades = allTrades.filter(t => {
      if (t.status !== 'closed') return false;
      const tradeExpiry = t.expiry ? new Date(t.expiry) : null;
      const isExpiredTrade = tradeExpiry && tradeExpiry >= startDate && tradeExpiry <= endDate;
      return !isExpiredTrade;
    });

    const completedTrades = allTrades.filter(t =>
      t.status === 'closed' ||
      t.status === 'expired' ||
      (t.expiry && new Date(t.expiry) >= startDate && new Date(t.expiry) <= endDate)
    );

    const winningTrades = completedTrades.filter(t => t.is_winning_trade === true);
    const losingTrades = completedTrades.filter(t => t.is_winning_trade === false);

    const totalProfit = winningTrades.reduce((sum, t) => {
      const profit = t.max_profit || 0;
      return sum + Math.abs(profit);
    }, 0);

    const totalLoss = losingTrades.reduce((sum, t) => {
      const loss = t.max_profit || 0;
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

    const allProfits = completedTrades.map(t => t.max_profit || 0);
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

    console.log(`[Period Report] About to generate HTML`);
    console.log(`[Period Report] allTrades length: ${allTrades.length}`);
    console.log(`[Period Report] allTrades array check:`, Array.isArray(allTrades));

    if (allTrades.length > 0) {
      console.log(`[Period Report] First 3 trades:`, allTrades.slice(0, 3).map(t => ({
        id: t.id,
        symbol: t.underlying_index_symbol,
        strike: t.strike,
        option_type: t.option_type,
        created: t.created_at,
        status: t.status,
        entry: t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last,
        high: t.contract_high_since
      })));
    }

    // Defensive check - ensure allTrades is an array
    const tradesForHtml = Array.isArray(allTrades) ? allTrades : [];
    console.log(`[Period Report] Passing ${tradesForHtml.length} trades to HTML generator`);

    const html = generatePeriodReportHTML({
      start_date,
      end_date,
      period_type,
      trades: tradesForHtml,
      metrics,
      language_mode,
      analyzer: analyzerProfile
    });

    console.log(`[Period Report] Generated HTML length: ${html.length}`);
    console.log(`[Period Report] HTML contains "no-trades":`, html.includes('no-trades'));

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
        telegram_channel_id: telegram_channel_id || null,
        channel_key: telegram_channel_id || '',
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
        onConflict: 'report_date,author_id,language_mode,period_type,channel_key'
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

// ─── Period report HTML generator ─────────────────────────────────────────────
// Unified premium dark design — matches generate-advanced-daily-report.
function generatePeriodReportHTML(data: any): string {
  const { start_date, end_date, period_type, trades, metrics, language_mode, analyzer } = data;

  console.log(`[HTML Generator] Received trades array:`, Array.isArray(trades));
  console.log(`[HTML Generator] Trades length:`, trades?.length || 0);

  const isAr   = language_mode === 'ar';
  const isDual = language_mode === 'dual';
  const dir    = isAr ? 'rtl' : 'ltr';

  function lbl(en: string, ar: string): string {
    return isDual ? `${en} | ${ar}` : isAr ? ar : en;
  }

  const periodLabel =
    period_type === 'weekly'  ? lbl('Weekly Report',  'تقرير أسبوعي') :
    period_type === 'monthly' ? lbl('Monthly Report', 'تقرير شهري')   :
    period_type === 'custom'  ? lbl('Period Report',  'تقرير الفترة') :
                                lbl('Daily Report',   'تقرير يومي');

  const startFormatted = new Date(start_date + 'T12:00:00Z').toLocaleDateString(
    isAr ? 'ar-SA' : 'en-US',
    { month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
  const endFormatted = new Date(end_date + 'T12:00:00Z').toLocaleDateString(
    isAr ? 'ar-SA' : 'en-US',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  );
  const dateRangeStr = `${startFormatted} – ${endFormatted}`;

  const analyzerName = analyzer?.full_name || analyzer?.username || 'Analyst';
  const initials     = analyzerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const avatarHTML   = analyzer?.avatar_url
    ? `<img src="${analyzer.avatar_url}" class="av-img" alt="${analyzerName}">`
    : `<div class="av-ph">${initials}</div>`;

  const netPos = metrics.net_profit >= 0;
  const wrGood = metrics.win_rate >= 50;

  const wlRatio = metrics.losing_trades > 0
    ? (metrics.winning_trades / metrics.losing_trades).toFixed(2) + '×'
    : metrics.winning_trades > 0 ? '∞' : '—';

  const avgWinStr = metrics.avg_profit_per_winning_trade > 0
    ? `+$${fmt(metrics.avg_profit_per_winning_trade, 0)}`
    : '—';

  const tradingDaysHint = metrics.trading_days
    ? `${metrics.trading_days} ${lbl('trading days', 'يوم تداول')}`
    : '';

  // ── Trade rows ──────────────────────────────────────────────────────────────
  const tradesHTML = (trades ?? []).length === 0
    ? `<div class="empty"><div class="empty-icon">📭</div><div class="empty-title">${lbl('No trades in this period', 'لا توجد صفقات في هذه الفترة')}</div><div class="empty-sub">${lbl('Trades will appear here once recorded', 'ستظهر الصفقات هنا بعد تسجيلها')}</div></div>`
    : (trades as any[]).map((t: any) => {
        const entry   = getEntryPrice(t);
        const high    = getHighestPrice(t, entry);
        const current = t.current_contract ? +t.current_contract : 0;
        const profit  = getTradeProfit(t);
        const pct     = entry > 0 ? ((high - entry) / entry) * 100 : 0;
        const win     = t.is_winning_trade === true;
        const isCall  = (t.option_type ?? '').toLowerCase() === 'call';
        const isActive = t.status === 'active';

        const sClass = isActive ? 'sb-active' : win ? 'sb-win' : 'sb-loss';
        const sLabel = isActive
          ? lbl('ACTIVE', 'نشطة')
          : t.status === 'closed'
            ? (win ? lbl('WIN ✓', 'ربح ✓') : lbl('CLOSED', 'مغلقة'))
            : (win ? lbl('WIN ✓', 'ربح ✓') : lbl('EXPIRED', 'منتهية'));

        const exp = t.expiry
          ? new Date(t.expiry + 'T00:00:00Z').toLocaleDateString(
              isAr ? 'ar-SA' : 'en-US',
              { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' },
            )
          : '—';

        const pColor  = profit > 0 ? '#22C55E' : profit < 0 ? '#EF4444' : '#8892A4';
        const pDollar = `${profit >= 0 ? '+' : '-'}$${fmt(Math.abs(profit), 0)}`;
        const pPct    = `${pct >= 0 ? '+' : ''}${fmt(pct, 1)}% ${lbl('gain', 'عائد')}`;

        const qty         = t.qty || 1;
        const contractLbl = qty > 1 ? lbl(`${qty} contracts`, `${qty} عقود`) : lbl('1 contract', 'عقد');

        const currentHTML = isActive && current > 0
          ? `<span class="px-sep">·</span><div class="px-grp"><span class="px-lbl">${lbl('Cur','الحالي')}</span><span class="px-val cur">${fmtPlain(current, 2)}</span></div>`
          : '';

        return `<div class="tr">
  <div class="tr-l">
    <div class="tr-id">
      <span class="sym">${t.underlying_index_symbol ?? '—'}</span>
      <span class="dir-badge ${isCall ? 'dc' : 'dp'}">${isCall ? lbl('CALL','شراء') : lbl('PUT','بيع')}</span>
      <span class="strike">${fmtPlain(t.strike ?? 0, 0)}</span>
      <span class="qty-info">· ${contractLbl}</span>
      <span class="exp-badge">${lbl('Exp','انتهاء')} ${exp}</span>
    </div>
    <div class="tr-px">
      <div class="px-grp"><span class="px-lbl">${lbl('Entry','الدخول')}</span><span class="px-val">${fmtPlain(entry, 2)}</span></div>
      <span class="arr">→</span>
      <div class="px-grp"><span class="px-lbl">${lbl('High','الأعلى')}</span><span class="px-val hi">${fmtPlain(high, 2)}</span></div>
      ${currentHTML}
    </div>
  </div>
  <div class="tr-r">
    <span class="status-badge ${sClass}">${sLabel}</span>
    <span class="pnl" style="color:${pColor}">${pDollar}</span>
    <span class="pnl-pct" style="color:${pColor}">${pPct}</span>
  </div>
</div>`;
      }).join('');

  // ── CSS ─────────────────────────────────────────────────────────────────────
  const genTime = new Date().toLocaleString(isAr ? 'ar-SA' : 'en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:${isAr||isDual?"'Cairo',":''}Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;background:#0B0F18;color:#EEF2F9;direction:${dir};padding:28px 16px;min-height:100vh;-webkit-font-smoothing:antialiased}
a{color:inherit}
.page{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.accent{height:4px;background:linear-gradient(90deg,#3B82F6 0%,#8B5CF6 50%,#EC4899 100%);border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hdr{background:linear-gradient(135deg,#141923 0%,#1A2030 100%);border:1px solid #252D3D;border-radius:14px;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.hdr-l{display:flex;flex-direction:column;gap:6px}
.brand{display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#3B82F6;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.22);border-radius:6px;padding:4px 10px;width:fit-content;margin-bottom:2px}
.title{font-size:24px;font-weight:800;color:#EEF2F9;line-height:1.2;letter-spacing:-.3px}
.sub{font-size:13px;color:#8892A4;margin-top:2px}
.hdr-r{display:flex;align-items:center;gap:14px;flex-shrink:0}
.av-img{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #252D3D}
.av-ph{width:52px;height:52px;border-radius:50%;background:rgba(59,130,246,0.10);border:2px solid rgba(59,130,246,0.25);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#3B82F6}
.an-name{font-size:14px;font-weight:700;color:#EEF2F9}
.an-role{font-size:11px;color:#5A6478;margin-top:2px}
.kpis{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
.kpi{border-radius:12px;padding:18px 20px;border:1px solid #252D3D}
.kpi-lbl{font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#5A6478;margin-bottom:8px}
.kpi-val{font-size:30px;font-weight:900;line-height:1;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.kpi-hint{font-size:11.5px;color:#8892A4;margin-top:7px;line-height:1.5}
.kpi-np{background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.18);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kpi-np .kpi-val{color:#22C55E}
.kpi-nn{background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.18);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kpi-nn .kpi-val{color:#EF4444}
.kpi-wr{background:#141923} .kpi-wr.good .kpi-val{color:#22C55E} .kpi-wr.bad .kpi-val{color:#EF4444}
.kpi-bt{background:#141923} .kpi-bt .kpi-val{color:#F59E0B}
.strip{background:#141923;border:1px solid #252D3D;border-radius:12px;display:grid;grid-template-columns:repeat(7,1fr)}
.st{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border-${dir==='rtl'?'left':'right'}:1px solid #1C2436;text-align:center}
.st:last-child{border:none}
.st-lbl{font-size:9px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5A6478}
.st-val{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.sh{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#5A6478;padding:0 2px}
.sh::after{content:'';flex:1;height:1px;background:#1C2436}
.trades{background:#141923;border:1px solid #252D3D;border-radius:12px;overflow:hidden}
.tr{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;border-bottom:1px solid #1C2436}
.tr:last-child{border-bottom:none}
.tr:hover{background:#1A2030}
.tr-l{display:flex;flex-direction:column;gap:7px;flex:1;min-width:0}
.tr-r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.tr-id{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sym{font-size:17px;font-weight:800;color:#EEF2F9}
.dir-badge{font-size:10px;font-weight:800;letter-spacing:.06em;padding:2px 8px;border-radius:5px}
.dc{background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.22);color:#22C55E;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.dp{background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.22);color:#EF4444;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.strike{font-size:13px;font-weight:700;color:#EEF2F9;font-variant-numeric:tabular-nums}
.qty-info{font-size:11px;color:#5A6478}
.exp-badge{font-size:10px;font-weight:600;color:#8892A4;background:rgba(138,146,164,0.08);border:1px solid rgba(138,146,164,0.15);border-radius:4px;padding:1px 7px}
.tr-px{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.px-grp{display:flex;align-items:center;gap:4px}
.px-lbl{font-size:10px;color:#5A6478;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.px-val{font-size:12px;font-weight:700;color:#8892A4;font-variant-numeric:tabular-nums}
.px-val.hi{color:#22C55E} .px-val.cur{color:#EEF2F9}
.arr{color:#3B4558;font-size:12px} .px-sep{color:#252D3D}
.status-badge{font-size:10px;font-weight:800;letter-spacing:.05em;padding:3px 8px;border-radius:5px;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sb-active{background:rgba(59,130,246,0.10);border:1px solid rgba(59,130,246,0.22);color:#3B82F6}
.sb-win{background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.22);color:#22C55E}
.sb-loss{background:rgba(90,100,120,0.10);border:1px solid rgba(90,100,120,0.22);color:#8892A4}
.pnl{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.pnl-pct{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:52px 24px;text-align:center}
.empty-icon{font-size:44px}
.empty-title{font-size:16px;font-weight:700;color:#8892A4}
.empty-sub{font-size:13px;color:#5A6478}
.ftr{background:#141923;border:1px solid #252D3D;border-radius:12px;padding:14px 22px;display:flex;align-items:center;justify-content:space-between}
.ftr-brand{font-size:12px;font-weight:700;color:#8892A4}
.ftr-note{font-size:11px;color:#5A6478}
@media print{
  body{background:#fff!important;color:#0f172a!important;padding:16px!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:100%!important;gap:12px!important}
  .accent{background:linear-gradient(90deg,#3B82F6,#8B5CF6,#EC4899)!important}
  .hdr,.strip,.trades,.ftr{background:#f8fafc!important;border-color:#e2e8f0!important}
  .kpi-np{background:rgba(34,197,94,0.06)!important;border-color:rgba(34,197,94,0.22)!important}
  .kpi-nn{background:rgba(239,68,68,0.06)!important;border-color:rgba(239,68,68,0.22)!important}
  .kpi-wr,.kpi-bt{background:#f8fafc!important;border-color:#e2e8f0!important}
  .brand{background:rgba(59,130,246,0.08)!important;border-color:rgba(59,130,246,0.22)!important;color:#2563eb!important}
  .title,.an-name,.sym,.strike{color:#0f172a!important}
  .sub,.kpi-hint,.an-role,.ftr-brand,.ftr-note{color:#475569!important}
  .kpi-lbl,.st-lbl,.px-lbl,.empty-sub{color:#64748b!important}
  .kpi-np .kpi-val{color:#16a34a!important}
  .kpi-nn .kpi-val{color:#dc2626!important}
  .kpi-wr.good .kpi-val{color:#16a34a!important}
  .kpi-wr.bad .kpi-val{color:#dc2626!important}
  .kpi-bt .kpi-val{color:#d97706!important}
  .st{border-color:#e2e8f0!important} .sh::after{background:#e2e8f0!important}
  .tr{border-color:#e2e8f0!important} .tr:hover{background:transparent!important}
  .dc{background:rgba(22,163,74,0.08)!important;border-color:rgba(22,163,74,0.22)!important;color:#16a34a!important}
  .dp{background:rgba(220,38,38,0.08)!important;border-color:rgba(220,38,38,0.22)!important;color:#dc2626!important}
  .sb-active{background:rgba(37,99,235,0.08)!important;border-color:rgba(37,99,235,0.22)!important;color:#2563eb!important}
  .sb-win{background:rgba(22,163,74,0.08)!important;border-color:rgba(22,163,74,0.22)!important;color:#16a34a!important}
  .sb-loss{background:rgba(100,116,139,0.08)!important;border-color:rgba(100,116,139,0.22)!important;color:#64748b!important}
  .px-val{color:#475569!important} .px-val.hi{color:#16a34a!important} .px-val.cur{color:#0f172a!important}
  .empty-title{color:#475569!important}
  .ftr{background:#f8fafc!important;border-color:#e2e8f0!important}
}
@media(max-width:640px){
  body{padding:12px 8px}
  .hdr{flex-direction:column;align-items:flex-start;padding:18px}
  .kpis{grid-template-columns:1fr 1fr}
  .kpis .kpi:first-child{grid-column:span 2}
  .strip{grid-template-columns:repeat(4,1fr)}
  .st:nth-child(n+5){border-top:1px solid #1C2436}
  .tr{flex-direction:column;align-items:flex-start}
  .tr-r{flex-direction:row;align-items:center;gap:10px}
}`;

  return `<!DOCTYPE html>
<html lang="${isAr?'ar':'en'}" dir="${dir}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${periodLabel} — ${analyzerName}</title>
${isAr||isDual?'<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">':''}
<style>${css}</style>
</head>
<body>
<div class="page">

<div class="accent"></div>

<div class="hdr">
  <div class="hdr-l">
    <div class="brand">AnalyzingHub</div>
    <div class="title">${periodLabel}</div>
    <div class="sub">${dateRangeStr}${tradingDaysHint ? ` &nbsp;·&nbsp; ${tradingDaysHint}` : ''}</div>
  </div>
  <div class="hdr-r">
    ${avatarHTML}
    <div>
      <div class="an-name">${analyzerName}</div>
      <div class="an-role">${lbl('Analyst · Index Trading','محلل · تداول المؤشرات')}</div>
    </div>
  </div>
</div>

<div class="kpis">
  <div class="kpi ${netPos?'kpi-np':'kpi-nn'}">
    <div class="kpi-lbl">${lbl('Net Profit','صافي الربح')}</div>
    <div class="kpi-val">${fmtUSD(metrics.net_profit,0)}</div>
    <div class="kpi-hint">${lbl('Profits','الأرباح')} +$${fmt(metrics.total_profit,0)} &nbsp;·&nbsp; ${lbl('Losses','الخسائر')} -$${fmt(Math.abs(metrics.total_loss),0)}</div>
  </div>
  <div class="kpi kpi-wr ${wrGood?'good':'bad'}">
    <div class="kpi-lbl">${lbl('Win Rate','معدل النجاح')}</div>
    <div class="kpi-val">${fmt(metrics.win_rate,1)}%</div>
    <div class="kpi-hint">${metrics.winning_trades}${lbl('W','ر')} · ${metrics.losing_trades}${lbl('L','خ')} &nbsp;·&nbsp; ${lbl('W/L','ر/خ')} ${wlRatio}</div>
  </div>
  <div class="kpi kpi-bt">
    <div class="kpi-lbl">${lbl('Best Trade','أفضل صفقة')}</div>
    <div class="kpi-val">+$${fmt(metrics.best_trade,0)}</div>
    <div class="kpi-hint">${lbl('Avg Win','متوسط الربح')} ${avgWinStr}</div>
  </div>
</div>

<div class="strip">
  <div class="st"><div class="st-lbl">${lbl('Total','إجمالي')}</div><div class="st-val" style="color:#EEF2F9">${metrics.total_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Active','نشطة')}</div><div class="st-val" style="color:#3B82F6">${metrics.active_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Closed','مغلقة')}</div><div class="st-val" style="color:#8892A4">${metrics.closed_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Won','رابحة')}</div><div class="st-val" style="color:#22C55E">${metrics.winning_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Lost','خاسرة')}</div><div class="st-val" style="color:#EF4444">${metrics.losing_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Best','أفضل')}</div><div class="st-val" style="color:#22C55E">+$${fmt(metrics.best_trade,0)}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Worst','أسوأ')}</div><div class="st-val" style="color:#EF4444">-$${fmt(Math.abs(metrics.worst_trade),0)}</div></div>
</div>

<div class="sh">${lbl('Trades','الصفقات')} (${(trades ?? []).length})</div>
<div class="trades">${tradesHTML}</div>

<div class="ftr">
  <span class="ftr-brand">AnalyzingHub &nbsp;·&nbsp; ${lbl('Index Trading Report','تقرير تداول المؤشرات')}</span>
  <span class="ftr-note">${lbl('Generated','تم الإنشاء')} ${genTime} UTC</span>
</div>

</div>
</body>
</html>`;
}

