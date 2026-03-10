import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ─── Design Tokens (kept in sync with generate-report-image) ─────────────────
const D = {
  bg: '#0D1117', card: '#161B22', elevated: '#1C2128',
  border: '#30363D', borderLight: '#21262D',
  text: '#E6EDF3', textSub: '#8B949E', textMuted: '#6E7681',
  call: '#3FB950', callBg: 'rgba(63,185,80,0.10)',  callBorder: 'rgba(63,185,80,0.25)',
  put:  '#F85149', putBg:  'rgba(248,81,73,0.10)',  putBorder:  'rgba(248,81,73,0.25)',
  blue: '#58A6FF', blueBg: 'rgba(88,166,255,0.10)', blueBorder: 'rgba(88,166,255,0.25)',
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

// ─── UNIFIED price / profit helpers ──────────────────────────────────────────
// Single source of truth: price > mid > last > 0
function getEntryPrice(trade: any): number {
  const s = trade.entry_contract_snapshot ?? {};
  const v = s.price ?? s.mid ?? s.last ?? 0;
  return Number.isFinite(+v) ? +v : 0;
}

function getHighestPrice(trade: any, entry: number): number {
  const v = trade.contract_high_since ?? trade.current_contract ?? entry;
  return Number.isFinite(+v) ? +v : entry;
}

// Realized P&L: DB fields take priority over calculated.
function getTradeProfit(trade: any): number {
  if (trade.pnl_usd      != null) return +trade.pnl_usd      || 0;
  if (trade.final_profit != null) return +trade.final_profit  || 0;
  if (trade.max_profit   != null) return +trade.max_profit    || 0;
  const entry = getEntryPrice(trade);
  const high  = getHighestPrice(trade, entry);
  return (high - entry) * (trade.qty || 1) * (trade.contract_multiplier || 100);
}

// Max potential profit entry → highest (used for win classification).
function getMaxProfit(trade: any): number {
  const entry = getEntryPrice(trade);
  const high  = getHighestPrice(trade, entry);
  return (high - entry) * (trade.qty || 1) * (trade.contract_multiplier || 100);
}

// Win: reached ≥ $100 max profit from entry (single consistent definition).
function isWinner(trade: any): boolean {
  return getMaxProfit(trade) >= 100;
}

// ─── Request interface ────────────────────────────────────────────────────────
interface GenerateReportRequest {
  date?: string;
  analyst_id: string;
  language_mode?: 'en' | 'ar' | 'dual';
  period_type?: 'daily' | 'weekly' | 'monthly';
  telegram_channel_id?: string;
  dry_run?: boolean;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase       = createClient(supabaseUrl, serviceRoleKey);

    const {
      date, analyst_id, language_mode = 'dual',
      period_type = 'daily', telegram_channel_id, dry_run = false,
    }: GenerateReportRequest = await req.json();

    const reportDate = date || new Date().toISOString().split('T')[0];
    console.log(`[Report] date=${reportDate} analyst=${analyst_id} lang=${language_mode} period=${period_type} channel=${telegram_channel_id ?? 'all'}`);

    // ── Date range ──────────────────────────────────────────────────────────
    let startOfDay: Date, endOfDay: Date;

    if (period_type === 'weekly') {
      const ref   = new Date(reportDate + 'T00:00:00.000Z');
      const dow   = ref.getUTCDay();
      const toMon = dow === 0 ? 6 : dow - 1;
      startOfDay  = new Date(ref);
      startOfDay.setUTCDate(ref.getUTCDate() - toMon);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay    = new Date(startOfDay);
      endOfDay.setUTCDate(startOfDay.getUTCDate() + 6);
      endOfDay.setUTCHours(23, 59, 59, 999);
    } else if (period_type === 'monthly') {
      const ref  = new Date(reportDate + 'T00:00:00.000Z');
      startOfDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
      endOfDay   = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      startOfDay = new Date(reportDate + 'T00:00:00.000Z');
      endOfDay   = new Date(reportDate + 'T23:59:59.999Z');
    }

    // ── Fetch trades (channel-scoped, no test trades) ───────────────────────
    let q = supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analyst_id)
      .eq('is_testing', false)
      .order('created_at', { ascending: false });

    if (telegram_channel_id) q = q.eq('telegram_channel_id', telegram_channel_id);

    const { data: allTradesFromDB, error: tradesError } = await q;
    if (tradesError) throw tradesError;

    console.log(`[Report] DB trades: ${allTradesFromDB?.length ?? 0}  range: ${startOfDay.toISOString()} – ${endOfDay.toISOString()}`);

    // ── Filter to period ────────────────────────────────────────────────────
    const trades = (allTradesFromDB ?? []).filter(t => {
      const created = new Date(t.created_at);
      const closed  = t.closed_at ? new Date(t.closed_at) : null;
      const expiry  = t.expiry    ? new Date(t.expiry)    : null;
      return (created >= startOfDay && created <= endOfDay)
          || (closed  && closed  >= startOfDay && closed  <= endOfDay)
          || (expiry  && expiry  >= startOfDay && expiry  <= endOfDay)
          || (t.status === 'active' && created <= endOfDay);
    });

    console.log(`[Report] Filtered trades: ${trades.length}`);

    // ── Categorise ──────────────────────────────────────────────────────────
    const activeTrades  = trades.filter(t => t.status === 'active');
    const closedTrades  = trades.filter(t =>
      t.status === 'closed' && t.closed_at &&
      new Date(t.closed_at) >= startOfDay && new Date(t.closed_at) <= endOfDay,
    );
    const closedIds     = new Set(closedTrades.map(t => t.id));
    const expiredTrades = trades.filter(t =>
      !closedIds.has(t.id) && t.expiry &&
      new Date(t.expiry) >= startOfDay && new Date(t.expiry) <= endOfDay,
    );
    const completedTrades = [...closedTrades, ...expiredTrades];

    // ── Win classification — single path, used everywhere ───────────────────
    const winnerIds         = new Set(completedTrades.filter(isWinner).map(t => t.id));
    const winningTradesList = completedTrades.filter(t =>  winnerIds.has(t.id));
    const losingTradesList  = completedTrades.filter(t => !winnerIds.has(t.id));

    // ── Core metrics ────────────────────────────────────────────────────────
    const totalTrades   = trades.length;
    const totalActive   = activeTrades.length;
    const totalClosed   = closedTrades.length;
    const totalExpired  = expiredTrades.length;
    const winningTrades = winningTradesList.length;
    const losingTrades  = losingTradesList.length;

    // Win rate uses the same winner list — consistent with winning_trades count
    const winRate = completedTrades.length > 0
      ? (winningTrades / completedTrades.length) * 100 : 0;

    const totalProfit = winningTradesList.reduce((s, t) => s + Math.abs(getTradeProfit(t)), 0);
    const totalLoss   = losingTradesList.reduce( (s, t) => s + Math.abs(getTradeProfit(t)), 0);
    const netProfit   = totalProfit - totalLoss;

    // Average return % across all trades (entry → highest)
    const allPct = trades.map(t => {
      const entry = getEntryPrice(t);
      const high  = getHighestPrice(t, entry);
      return entry > 0 ? ((high - entry) / entry) * 100 : 0;
    });
    const avgProfit    = allPct.length > 0 ? allPct.reduce((s, v) => s + v, 0) / allPct.length : 0;
    const maxProfitPct = allPct.length > 0 ? Math.max(...allPct) : 0;

    const allWins  = winningTradesList.map(t => Math.abs(getTradeProfit(t)));
    const allLoss  = losingTradesList.map(t  => Math.abs(getTradeProfit(t)));
    const bestTrade  = allWins.length  > 0 ? Math.max(...allWins)  : 0;
    const worstTrade = allLoss.length  > 0 ? -Math.max(...allLoss) : 0;

    const avgProfitPerWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const avgLossPerLoss  = losingTrades  > 0 ? totalLoss   / losingTrades  : 0;

    const metrics = {
      total_trades: totalTrades, active_trades: totalActive,
      closed_trades: totalClosed, expired_trades: totalExpired,
      winning_trades: winningTrades, losing_trades: losingTrades,
      win_rate: winRate,
      total_profit: totalProfit, total_loss: totalLoss,
      net_profit: netProfit, total_profit_dollars: netProfit,
      avg_profit_percent: avgProfit, max_profit_percent: maxProfitPct,
      avg_profit_per_winning_trade: avgProfitPerWin,
      avg_loss_per_losing_trade: avgLossPerLoss,
      best_trade: bestTrade, worst_trade: worstTrade,
    };

    const { data: analyzerProfile } = await supabase
      .from('profiles').select('full_name, username, avatar_url')
      .eq('id', analyst_id).single();

    // ── Dry run ─────────────────────────────────────────────────────────────
    if (dry_run) {
      const preview = trades.map(t => {
        const entry  = getEntryPrice(t);
        const high   = getHighestPrice(t, entry);
        const profit = getTradeProfit(t);
        const pct    = entry > 0 ? ((high - entry) / entry) * 100 : 0;
        return { id: t.id, symbol: t.underlying_index_symbol, type: t.option_type,
                 strike: t.strike, entry_price: entry, highest_price: high,
                 current_price: t.current_contract || 0, qty: t.qty || 1,
                 profit, profit_percent: pct, status: t.status,
                 created_at: t.created_at, expiry: t.expiry, is_winner: winnerIds.has(t.id) };
      });
      return new Response(
        JSON.stringify({ success: true, metrics, trades: preview, analyzer: analyzerProfile, dry_run: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Generate HTML ────────────────────────────────────────────────────────
    const html = generateReportHTML({
      date: reportDate, trades, winnerIds, metrics, language_mode,
      analyzer: analyzerProfile, period_type,
      startDate: startOfDay.toISOString().split('T')[0],
      endDate:   endOfDay.toISOString().split('T')[0],
    });

    // ── Storage ─────────────────────────────────────────────────────────────
    const fileName = `${analyst_id}/${reportDate}-${language_mode}.html`;
    const { error: uploadError } = await supabase.storage
      .from('daily-reports')
      .upload(fileName, new Blob([html], { type: 'text/html' }), { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = await supabase.storage
      .from('daily-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7, { download: `report-${reportDate}.html` });

    // ── DB upsert ────────────────────────────────────────────────────────────
    const { data: reportRecord, error: insertError } = await supabase
      .from('daily_trade_reports')
      .upsert({
        report_date: reportDate, author_id: analyst_id,
        telegram_channel_id: telegram_channel_id || null,
        channel_key: telegram_channel_id || '',
        html_content: html, trade_count: totalTrades, summary: metrics,
        language_mode, period_type,
        start_date: startOfDay.toISOString().split('T')[0],
        end_date:   endOfDay.toISOString().split('T')[0],
        file_path: fileName, file_url: urlData?.signedUrl,
        file_size_bytes: html.length, status: 'generated',
      }, {
        onConflict: 'report_date,author_id,language_mode,period_type,channel_key',
        returning: 'representation',
      })
      .select().single();

    if (insertError) throw insertError;

    console.log(`[Report] Generated ${reportRecord.id}`);
    return new Response(
      JSON.stringify({ success: true, report_id: reportRecord.id, file_url: urlData?.signedUrl, metrics }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('[Report] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ─── HTML Template ────────────────────────────────────────────────────────────
// Dark terminal design — visually consistent with generate-report-image PNG.
function generateReportHTML(data: {
  date: string; trades: any[]; winnerIds: Set<string>; metrics: any;
  language_mode: string; analyzer: any; period_type: string;
  startDate: string; endDate: string;
}): string {
  const { date, trades, winnerIds, metrics, language_mode, analyzer, period_type, startDate, endDate } = data;

  const isAr   = language_mode === 'ar';
  const isDual = language_mode === 'dual';
  const dir    = isAr ? 'rtl' : 'ltr';

  function lbl(en: string, ar: string): string {
    return isDual ? `${en} | ${ar}` : isAr ? ar : en;
  }

  const dateFormatted = new Date(date + 'T12:00:00Z').toLocaleDateString(
    isAr ? 'ar-SA' : 'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' },
  );
  const dateRangeStr = period_type !== 'daily'
    ? `${new Date(startDate + 'T12:00:00Z').toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })} – ${new Date(endDate + 'T12:00:00Z').toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : dateFormatted;

  const periodLabel =
    period_type === 'weekly'  ? lbl('Weekly Report',  'تقرير أسبوعي')  :
    period_type === 'monthly' ? lbl('Monthly Report', 'تقرير شهري')    :
                                lbl('Daily Report',   'تقرير يومي');

  const analyzerName = analyzer?.full_name || analyzer?.username || 'Analyst';
  const initials     = analyzerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const avatarHTML   = analyzer?.avatar_url
    ? `<img src="${analyzer.avatar_url}" class="av-img" alt="${analyzerName}">`
    : `<div class="av-ph">${initials}</div>`;

  const netPos = metrics.net_profit >= 0;

  // ── Trade rows ────────────────────────────────────────────────────────────
  const tradesHTML = trades.length === 0
    ? `<div class="empty"><div style="font-size:40px;margin-bottom:12px">📭</div><div>${lbl('No trades in this period', 'لا توجد صفقات في هذه الفترة')}</div></div>`
    : trades.map((t: any) => {
        const entry  = getEntryPrice(t);
        const high   = getHighestPrice(t, entry);
        const profit = getTradeProfit(t);
        const pct    = entry > 0 ? ((high - entry) / entry) * 100 : 0;
        const win    = winnerIds.has(t.id);
        const isCall = (t.option_type ?? '').toLowerCase() === 'call';

        const sClass = t.status === 'active' ? 'sb-active' : win ? 'sb-win' : 'sb-loss';
        const sLabel = t.status === 'active'
          ? lbl('ACTIVE', 'نشطة')
          : t.status === 'closed'
            ? (win ? lbl('CLOSED ✓', 'مغلقة ✓') : lbl('CLOSED', 'مغلقة'))
            : (win ? lbl('EXPIRED ✓', 'منتهية ✓') : lbl('EXPIRED', 'منتهية'));

        const exp = t.expiry
          ? new Date(t.expiry + 'T00:00:00Z').toLocaleDateString(
              isAr ? 'ar-SA' : 'en-US',
              { month: 'short', day: 'numeric', year: '2-digit' },
            )
          : '—';

        const pColor = profit > 0 ? D.call : profit < 0 ? D.put : D.textSub;
        const pLabel = profit !== 0
          ? `${profit >= 0 ? '+' : '-'}$${fmt(Math.abs(profit), 0)} (${pct >= 0 ? '+' : ''}${fmt(pct, 1)}%)`
          : `$0 (0.0%)`;

        return `
<div class="tr">
  <div class="tr-l">
    <div class="tr-sym">
      <span class="sym">${t.underlying_index_symbol ?? '—'}</span>
      <span class="dir-badge ${isCall ? 'dc' : 'dp'}">${isCall ? lbl('CALL','شراء') : lbl('PUT','بيع')}</span>
      <span class="strike">${fmtPlain(t.strike ?? 0, 0)}</span>
    </div>
    <div class="tr-px">
      <span class="px-lbl">${lbl('Entry','الدخول')}</span>
      <span class="px-val">${fmtPlain(entry, 2)}</span>
      <span class="arr">→</span>
      <span class="px-lbl">${lbl('High','الأعلى')}</span>
      <span class="px-val hi">${fmtPlain(high, 2)}</span>
      <span class="exp-s">· ${lbl('Exp','ينتهي')} ${exp}</span>
    </div>
  </div>
  <div class="tr-r">
    <span class="status-badge ${sClass}">${sLabel}</span>
    <span class="pnl" style="color:${pColor}">${pLabel}</span>
  </div>
</div>`;
      }).join('');

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${isAr || isDual ? "'Cairo'," : ''}-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${D.bg};color:${D.text};direction:${dir};padding:28px 16px;min-height:100vh}
a{color:inherit}
.page{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.accent{height:3px;background:${D.blue};border-radius:2px}
/* Header */
.hdr{background:${D.card};border:1px solid ${D.border};border-radius:12px;padding:22px 26px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.hdr-l{display:flex;flex-direction:column;gap:5px}
.brand{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${D.blue}}
.title{font-size:21px;font-weight:800;color:${D.text};line-height:1.2}
.sub{font-size:12px;color:${D.textSub};margin-top:1px}
.hdr-r{display:flex;align-items:center;gap:11px;flex-shrink:0}
.av-img{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${D.border}}
.av-ph{width:48px;height:48px;border-radius:50%;background:${D.blueBg};border:2px solid ${D.blueBorder};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:${D.blue}}
.an-name{font-size:13px;font-weight:700;color:${D.text}}
.an-role{font-size:10px;color:${D.textMuted};margin-top:1px}
/* KPIs */
.kpis{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
.kpi{background:${D.card};border:1px solid ${D.border};border-radius:10px;padding:15px 18px}
.kpi-lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${D.textMuted};margin-bottom:7px}
.kpi-val{font-size:26px;font-weight:900;line-height:1;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.kpi-hint{font-size:11px;color:${D.textSub};margin-top:5px}
.net-pos .kpi-val{color:${D.call}} .net-neg .kpi-val{color:${D.put}}
.wr-good .kpi-val{color:${D.call}} .wr-bad .kpi-val{color:${D.put}}
.avg .kpi-val{color:${D.blue}}
/* Stats strip */
.strip{background:${D.card};border:1px solid ${D.border};border-radius:10px;display:grid;grid-template-columns:repeat(7,1fr);gap:0}
.st{display:flex;flex-direction:column;align-items:center;gap:3px;padding:13px 8px;border-right:1px solid ${D.borderLight};text-align:center}
.st:last-child{border-right:none}
.st-lbl{font-size:9px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:${D.textMuted}}
.st-val{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
/* Section header */
.sh{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${D.textMuted};padding:0 2px}
.sh::after{content:'';flex:1;height:1px;background:${D.borderLight}}
/* Trades */
.trades{background:${D.card};border:1px solid ${D.border};border-radius:10px;overflow:hidden}
.tr{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 18px;border-bottom:1px solid ${D.borderLight}}
.tr:last-child{border-bottom:none}
.tr:hover{background:${D.elevated}}
.tr-l{display:flex;flex-direction:column;gap:5px}
.tr-r{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
.tr-sym{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sym{font-size:16px;font-weight:800;color:${D.text}}
.dir-badge{font-size:10px;font-weight:800;letter-spacing:.06em;padding:2px 6px;border-radius:4px}
.dc{background:${D.callBg};border:1px solid ${D.callBorder};color:${D.call}}
.dp{background:${D.putBg};border:1px solid ${D.putBorder};color:${D.put}}
.strike{font-size:12px;font-weight:600;color:${D.textSub};font-variant-numeric:tabular-nums}
.tr-px{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.px-lbl{font-size:11px;color:${D.textMuted}}
.px-val{font-size:12px;font-weight:700;color:${D.textSub};font-variant-numeric:tabular-nums}
.px-val.hi{color:${D.call}}
.arr{color:${D.textMuted};font-size:11px}
.exp-s{font-size:11px;color:${D.textMuted};margin-${dir==='rtl'?'right':'left'}:4px}
.status-badge{font-size:10px;font-weight:800;letter-spacing:.05em;padding:3px 7px;border-radius:4px;white-space:nowrap}
.sb-active{background:${D.blueBg};border:1px solid ${D.blueBorder};color:${D.blue}}
.sb-win{background:${D.callBg};border:1px solid ${D.callBorder};color:${D.call}}
.sb-loss{background:rgba(110,118,129,.10);border:1px solid rgba(110,118,129,.22);color:${D.textSub}}
.pnl{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
/* Empty / footer */
.empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:44px 24px;color:${D.textMuted};font-size:13px;text-align:center}
.ftr{background:${D.card};border:1px solid ${D.border};border-radius:10px;padding:14px 22px;display:flex;align-items:center;justify-content:space-between}
.ftr-brand{font-size:12px;font-weight:700;color:${D.textSub}}
.ftr-note{font-size:10px;color:${D.textMuted}}
@media(max-width:640px){
  body{padding:10px 8px}
  .hdr{flex-direction:column;align-items:flex-start;padding:16px}
  .kpis{grid-template-columns:1fr 1fr}
  .kpis .kpi:first-child{grid-column:span 2}
  .strip{grid-template-columns:repeat(4,1fr)}
  .st:nth-child(n+5){border-top:1px solid ${D.borderLight}}
  .tr{flex-direction:column;align-items:flex-start}
  .tr-r{flex-direction:row;align-items:center;gap:10px}
}`;

  return `<!DOCTYPE html>
<html lang="${isAr?'ar':'en'}" dir="${dir}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${periodLabel} — ${analyzerName}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div class="page">

<div class="accent"></div>

<div class="hdr">
  <div class="hdr-l">
    <div class="brand">AnalyzingHub</div>
    <div class="title">${periodLabel}</div>
    <div class="sub">${dateRangeStr}</div>
  </div>
  <div class="hdr-r">
    ${avatarHTML}
    <div>
      <div class="an-name">${analyzerName}</div>
      <div class="an-role">${lbl('Analyst','المحلل')}</div>
    </div>
  </div>
</div>

<div class="kpis">
  <div class="kpi ${netPos?'net-pos':'net-neg'}">
    <div class="kpi-lbl">${lbl('Net Profit','صافي الربح')}</div>
    <div class="kpi-val">${fmtUSD(metrics.net_profit,0)}</div>
    <div class="kpi-hint">${lbl('Profit','ربح')} +$${fmt(metrics.total_profit,0)} · ${lbl('Loss','خسارة')} -$${fmt(metrics.total_loss,0)}</div>
  </div>
  <div class="kpi ${metrics.win_rate>=50?'wr-good':'wr-bad'}">
    <div class="kpi-lbl">${lbl('Win Rate','معدل النجاح')}</div>
    <div class="kpi-val">${fmt(metrics.win_rate,1)}%</div>
    <div class="kpi-hint">${metrics.winning_trades}W · ${metrics.losing_trades}L</div>
  </div>
  <div class="kpi avg">
    <div class="kpi-lbl">${lbl('Avg Return','متوسط العائد')}</div>
    <div class="kpi-val">${metrics.avg_profit_percent>=0?'+':''}${fmt(metrics.avg_profit_percent,1)}%</div>
    <div class="kpi-hint">${lbl('Best','أفضل')} +$${fmt(metrics.best_trade,0)}</div>
  </div>
</div>

<div class="strip">
  <div class="st"><div class="st-lbl">${lbl('Total','إجمالي')}</div><div class="st-val" style="color:${D.text}">${metrics.total_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Active','نشطة')}</div><div class="st-val" style="color:${D.blue}">${metrics.active_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Closed','مغلقة')}</div><div class="st-val" style="color:${D.textSub}">${metrics.closed_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Won','رابحة')}</div><div class="st-val" style="color:${D.call}">${metrics.winning_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Lost','خاسرة')}</div><div class="st-val" style="color:${D.put}">${metrics.losing_trades}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Best','أفضل')}</div><div class="st-val" style="color:${D.call}">+$${fmt(metrics.best_trade,0)}</div></div>
  <div class="st"><div class="st-lbl">${lbl('Worst','أسوأ')}</div><div class="st-val" style="color:${D.put}">$${fmt(metrics.worst_trade,0)}</div></div>
</div>

<div class="sh">${lbl('Trades','الصفقات')} (${trades.length})</div>
<div class="trades">${tradesHTML}</div>

<div class="ftr">
  <span class="ftr-brand">AnalyzingHub</span>
  <span class="ftr-note">${lbl('Generated','تم الإنشاء')} ${new Date().toLocaleString(isAr?'ar-SA':'en-US',{timeZone:'UTC'})} UTC</span>
</div>

</div>
</body>
</html>`;
}
