/**
 * generate-report-image -- mobile-portrait PNG via @vercel/og.
 * Compact single-line rows + bounded canvas (width 900) so all trades show
 * without exceeding the renderer's memory/CPU limit (a too-large PNG -> 546).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ImageResponse } from 'npm:@vercel/og@0.6.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const C = {
  bg: '#0B0F17', card: '#141A24', elevated: '#1A2230', border: '#243042',
  text: '#EEF2F9', textSub: '#9AA6B8', textMuted: '#66738A',
  green: '#22C55E', greenBg: 'rgba(34,197,94,0.10)', greenBorder: 'rgba(34,197,94,0.30)',
  red: '#EF4444', redBg: 'rgba(239,68,68,0.10)', redBorder: 'rgba(239,68,68,0.30)',
  blue: '#3B82F6', blueBg: 'rgba(59,130,246,0.12)', blueBorder: 'rgba(59,130,246,0.30)',
  cyan: '#22D3EE', gold: '#F59E0B',
};

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

const NON_REPORTABLE_STATUSES = new Set(['draft', 'canceled', 'cancelled']);
const isTestTrade = (t: any) => t.is_testing === true || t.is_test === true;
function tradeSignature(t: any): string {
  const s = t.entry_contract_snapshot ?? {};
  const entry = s.price ?? s.mid ?? s.last ?? '';
  return [t.underlying_index_symbol ?? '', t.option_type ?? '', t.strike ?? '', t.expiry ?? '', entry, t.contract_high_since ?? '', t.pnl_usd ?? '', t.status ?? ''].join('|');
}
function dedupeTrades(list: any[]): any[] {
  const seen = new Set<string>();
  return list.filter(t => { const k = tradeSignature(t); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function avatarToDataUri(url?: string | null): Promise<string> {
  if (!url) return '';
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('png') && !ct.includes('jpeg') && !ct.includes('jpg')) return '';
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > 3_000_000) return '';
    let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:${ct.includes('png') ? 'image/png' : 'image/jpeg'};base64,${btoa(bin)}`;
  } catch { return ''; }
}

async function loadFonts() {
  const want = [[400, 'inter-latin-400-normal.woff'], [700, 'inter-latin-700-normal.woff'], [900, 'inter-latin-900-normal.woff']] as const;
  const fonts: any[] = [];
  for (const [weight, file] of want) {
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/${file}`);
      if (r.ok) fonts.push({ name: 'Inter', data: await r.arrayBuffer(), weight, style: 'normal' });
    } catch { /* fall back to default */ }
  }
  return fonts;
}

interface ReportRequest { report_id: string; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const data: ReportRequest = await req.json();

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports').select('*').eq('id', data.report_id).maybeSingle();
    if (reportError || !report) throw new Error('Report not found');

    const analystId = report.author_id ?? report.generated_by;
    const { data: analyzerProfile } = await supabase
      .from('profiles').select('full_name, telegram_username, avatar_url').eq('id', analystId).single();
    const analyzerName = analyzerProfile?.full_name || analyzerProfile?.telegram_username || 'Analyst';
    const initials = analyzerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarDataUri = await avatarToDataUri(analyzerProfile?.avatar_url);

    const fonts = await loadFonts();
    const FF = fonts.length ? 'Inter' : 'sans-serif';

    const summary = report.summary ?? {};
    const totalTrades = safeNum(summary.total_trades);
    const winningTrades = safeNum(summary.winning_trades);
    const losingTrades = safeNum(summary.losing_trades);
    const totalProfit = safeNum(summary.total_profit_dollars ?? summary.total_profit);
    const totalLoss = Math.abs(safeNum(summary.total_loss));
    const netProfit = safeNum(summary.net_profit, totalProfit - totalLoss);
    const winRate = winningTrades + losingTrades > 0 ? (winningTrades / (winningTrades + losingTrades)) * 100 : 0;
    const wlRatio = losingTrades > 0 ? (winningTrades / losingTrades).toFixed(1) + 'x' : winningTrades > 0 ? 'inf' : '-';
    const avgWin = safeNum(summary.avg_profit_per_winning_trade);
    const bestTrade = safeNum(summary.best_trade);
    const worstTrade = safeNum(summary.worst_trade);

    const startDate = report.start_date ?? report.report_date;
    const endDate = report.end_date ?? report.report_date;
    const periodStart = new Date(startDate + 'T00:00:00.000Z');
    const periodEnd = new Date(endDate + 'T23:59:59.999Z');

    let tq = supabase.from('index_trades').select('*').eq('author_id', analystId).eq('is_testing', false);
    if (report.telegram_channel_id) tq = tq.eq('telegram_channel_id', report.telegram_channel_id);
    const { data: allTrades } = await tq;

    const reportable = (allTrades ?? []).filter((t: any) => !isTestTrade(t) && !NON_REPORTABLE_STATUSES.has((t.status ?? '').toLowerCase()));
    const periodTrades = dedupeTrades(reportable.filter((t: any) => {
      const created = new Date(t.created_at);
      const closed = t.closed_at ? new Date(t.closed_at) : null;
      return (created >= periodStart && created <= periodEnd) || (closed && closed >= periodStart && closed <= periodEnd) || (t.status === 'active' && created <= periodEnd);
    })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const tradesData = periodTrades.map((t: any) => {
      const ep = safeNum(t.entry_contract_snapshot?.price ?? t.entry_contract_snapshot?.mid ?? t.entry_contract_snapshot?.last);
      const hp = safeNum(t.contract_high_since ?? t.current_contract, ep);
      const qtyN = safeNum(t.qty, 1); const multN = safeNum(t.contract_multiplier, 100);
      const peak = (hp - ep) * qtyN * multN;
      const isActive = t.status === 'active';
      const isWin = peak >= 100;
      const profit = (isActive || isWin) ? peak : -(ep * qtyN * multN);
      const pct = (isActive || isWin) ? (ep > 0 ? ((hp - ep) / ep) * 100 : 0) : -100;
      // Use the clean underlying symbol (e.g. SPX); strike + type are shown
      // separately, giving "SPX 7600 CALL". Do NOT fall back to
      // polygon_option_ticker (the long OCC contract id). Strip any OCC
      // suffix defensively in case the symbol itself carries one.
      const sym = String(t.underlying_index_symbol ?? 'N/A').replace(/\s*\d{6}[CP]\d{8}\s*$/i, '').trim() || 'N/A';
      const strike = safeNum(t.strike);
      const isCall = (t.option_type ?? t.direction ?? 'call').toLowerCase() === 'call';
      return {
        sym, strikeStr: strike > 0 ? `$${strike.toFixed(0)}` : '-',
        entryStr: ep > 0 ? `$${ep.toFixed(2)}` : '-', highStr: hp > 0 ? `$${hp.toFixed(2)}` : '-',
        dirLabel: isCall ? 'CALL' : 'PUT', dirColor: isCall ? C.green : C.red,
        dirBg: isCall ? C.greenBg : C.redBg, dirBorder: isCall ? C.greenBorder : C.redBorder,
        badge: isActive ? 'ACTIVE' : isWin ? 'WIN' : 'LOSS',
        badgeColor: isActive ? C.blue : isWin ? C.green : C.red,
        badgeBg: isActive ? C.blueBg : isWin ? C.greenBg : C.redBg,
        badgeBorder: isActive ? C.blueBorder : isWin ? C.greenBorder : C.redBorder,
        pnlStr: `${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(0)}`,
        pctStr: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`,
        pColor: profit > 0 ? C.green : profit < 0 ? C.red : C.textSub,
      };
    });

    // Bounded canvas so a long report never exceeds the renderer limit (546).
    // Keep total pixels well under the renderer limit (~2.0M is flaky / 546).
    const CANVAS_W = 760;
    const ROW_H = 70;
    const FIXED_TOP = 940;
    const MAX_H = 2350;
    const maxRows = Math.max(1, Math.floor((MAX_H - FIXED_TOP) / ROW_H));
    const shownTrades = tradesData.slice(0, maxRows);
    const hiddenCount = tradesData.length - shownTrades.length;
    const canvasHeight = Math.max(1350, FIXED_TOP + shownTrades.length * ROW_H + (hiddenCount > 0 ? 64 : 0));

    const periodLabel = report.period_type === 'weekly' ? 'Weekly Report' : report.period_type === 'monthly' ? 'Monthly Report' : 'Daily Report';
    const dateLabel = report.period_type === 'daily' ? report.report_date : `${startDate}  -  ${endDate}`;
    const netColor = netProfit >= 0 ? C.green : C.red;
    const netSign = netProfit >= 0 ? '+' : '-';

    const chip = (label: string, value: string, color: string) => ({ type: 'div', props: { style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 18, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 8 }, children: [ { type: 'div', props: { style: { fontSize: 19, color: C.textMuted, fontWeight: 700 }, children: label } }, { type: 'div', props: { style: { fontSize: 48, fontWeight: 900, color, lineHeight: 1 }, children: value } } ] } });
    const miniStat = (label: string, value: string, color: string) => ({ type: 'div', props: { style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }, children: [ { type: 'div', props: { style: { fontSize: 15, color: C.textMuted, fontWeight: 700 }, children: label } }, { type: 'div', props: { style: { fontSize: 27, fontWeight: 900, color }, children: value } } ] } });
    const tradeRow = (t: any) => ({ type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 22px', borderBottom: `1px solid ${C.border}` }, children: [
      { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 }, children: [
        { type: 'div', props: { style: { fontSize: 25, fontWeight: 900, color: C.text }, children: t.sym } },
        { type: 'div', props: { style: { display: 'flex', background: t.dirBg, border: `1px solid ${t.dirBorder}`, borderRadius: 6, padding: '3px 8px', fontSize: 14, fontWeight: 800, color: t.dirColor }, children: t.dirLabel } },
        { type: 'div', props: { style: { fontSize: 21, fontWeight: 800, color: C.textSub }, children: t.strikeStr } },
        { type: 'div', props: { style: { fontSize: 18, fontWeight: 600, color: C.textMuted, marginLeft: 4 }, children: t.entryStr } },
        { type: 'div', props: { style: { fontSize: 17, color: C.textMuted }, children: '->' } },
        { type: 'div', props: { style: { fontSize: 18, fontWeight: 700, color: C.green }, children: t.highStr } },
      ] } },
      { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 11 }, children: [
        { type: 'div', props: { style: { display: 'flex', background: t.badgeBg, border: `1px solid ${t.badgeBorder}`, borderRadius: 6, padding: '3px 9px', fontSize: 14, fontWeight: 800, color: t.badgeColor }, children: t.badge } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }, children: [
          { type: 'div', props: { style: { fontSize: 25, fontWeight: 900, color: t.pColor }, children: t.pnlStr } },
          { type: 'div', props: { style: { fontSize: 14, fontWeight: 700, color: t.pColor }, children: t.pctStr } },
        ] } },
      ] } },
    ] } });

    const avatarNode = avatarDataUri
      ? { type: 'img', props: { src: avatarDataUri, width: 78, height: 78, style: { width: 78, height: 78, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.border}` } } }
      : { type: 'div', props: { style: { display: 'flex', width: 78, height: 78, borderRadius: '50%', background: C.blueBg, border: `2px solid ${C.blueBorder}`, alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 900, color: C.blue }, children: initials } };

    const vdom = {
      type: 'div', props: {
        style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FF, position: 'relative' },
        children: [
          { type: 'div', props: { style: { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, height: 9, background: C.blue } } },
          { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 44px 34px', gap: 20 }, children: [
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: [
              { type: 'div', props: { style: { display: 'flex', background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: 8, padding: '5px 14px', color: C.blue, fontSize: 18, fontWeight: 800 }, children: 'ANALYZINGHUB' } },
              { type: 'div', props: { style: { fontSize: 54, fontWeight: 900, color: C.text, lineHeight: 1.1 }, children: periodLabel } },
              { type: 'div', props: { style: { fontSize: 25, color: C.textSub }, children: dateLabel } },
              { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }, children: [
                avatarNode,
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: [
                  { type: 'div', props: { style: { fontSize: 25, fontWeight: 800, color: C.text }, children: analyzerName } },
                  { type: 'div', props: { style: { fontSize: 19, color: C.textMuted }, children: 'Index Analyst' } },
                ] } },
              ] } },
            ] } },
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', background: netProfit >= 0 ? C.greenBg : C.redBg, border: `1px solid ${netProfit >= 0 ? C.greenBorder : C.redBorder}`, borderRadius: 20, padding: '24px 30px', gap: 6 }, children: [
              { type: 'div', props: { style: { fontSize: 22, color: C.textMuted, fontWeight: 800 }, children: 'NET PROFIT' } },
              { type: 'div', props: { style: { fontSize: 82, fontWeight: 900, color: netColor, lineHeight: 1 }, children: `${netSign}$${Math.abs(netProfit).toFixed(0)}` } },
              { type: 'div', props: { style: { fontSize: 22, color: C.textSub, fontWeight: 600 }, children: `Profits +$${totalProfit.toFixed(0)}   .   Losses -$${totalLoss.toFixed(0)}` } },
            ] } },
            { type: 'div', props: { style: { display: 'flex', gap: 18 }, children: [
              chip('WIN RATE', `${winRate.toFixed(0)}%`, winRate >= 50 ? C.green : C.red),
              chip('BEST TRADE', `+$${bestTrade.toFixed(0)}`, C.gold),
            ] } },
            { type: 'div', props: { style: { display: 'flex', gap: 12 }, children: [
              miniStat('TOTAL', String(totalTrades), C.text),
              miniStat('WON', String(winningTrades), C.green),
              miniStat('LOST', String(losingTrades), C.red),
              miniStat('AVG WIN', `+$${avgWin.toFixed(0)}`, C.green),
              miniStat('WORST', `-$${Math.abs(worstTrade).toFixed(0)}`, C.red),
            ] } },
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }, children: [
              { type: 'div', props: { style: { display: 'flex', padding: '14px 24px', fontSize: 19, fontWeight: 800, color: C.textMuted, borderBottom: `1px solid ${C.border}` }, children: `TRADES (${totalTrades})` } },
              ...shownTrades.map(tradeRow),
              ...(hiddenCount > 0 ? [{ type: 'div', props: { style: { display: 'flex', justifyContent: 'center', padding: '14px', fontSize: 18, fontWeight: 600, color: C.textMuted }, children: `+ ${hiddenCount} more trades - see full report` } }] : []),
              ...(tradesData.length === 0 ? [{ type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 26, padding: '40px' }, children: 'No trades in this period' } }] : []),
            ] } },
            { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 18, color: C.textMuted }, children: [
              { type: 'div', props: { children: 'AnalyzingHub  .  Index Trading Report' } },
              { type: 'div', props: { style: { color: C.cyan, fontWeight: 700 }, children: `W/L ${wlRatio}` } },
            ] } },
          ] } },
        ],
      },
    };

    const opts: any = { width: CANVAS_W, height: canvasHeight };
    if (fonts.length) opts.fonts = fonts;
    const imageResponse = new ImageResponse(vdom as any, opts);
    const arrayBuffer = await imageResponse.arrayBuffer();

    return new Response(new Uint8Array(arrayBuffer), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'image/png' } });
  } catch (error: any) {
    console.error('[generate-report-image] Error:', error?.message, error?.stack);
    return new Response(JSON.stringify({ error: error?.message ?? 'Image generation failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
