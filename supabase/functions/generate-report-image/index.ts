/**
 * generate-report-image -- mobile-portrait PNG via @vercel/og.
 * Compact rows + small bounded canvas so all trades render well under the
 * renderer's memory/CPU limit (>~2.0M px is flaky and returns 546).
 * Labels are localized to the report's language_mode (Arabic uses the Cairo
 * font, since Inter has no Arabic glyphs).
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

// Inter for Latin/digits; Cairo (Arabic subset) is added when the report is
// Arabic so satori can fall back to it for Arabic glyphs.
async function loadFonts(needsArabic: boolean) {
  const fonts: any[] = [];
  const inter = [[400, 'inter-latin-400-normal.woff'], [700, 'inter-latin-700-normal.woff'], [900, 'inter-latin-900-normal.woff']] as const;
  for (const [weight, file] of inter) {
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/${file}`);
      if (r.ok) fonts.push({ name: 'Inter', data: await r.arrayBuffer(), weight, style: 'normal' });
    } catch { /* ignore */ }
  }
  if (needsArabic) {
    const cairo = [[400, 'cairo-arabic-400-normal.woff'], [700, 'cairo-arabic-700-normal.woff'], [900, 'cairo-arabic-900-normal.woff']] as const;
    for (const [weight, file] of cairo) {
      try {
        const r = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.0.16/files/${file}`);
        if (r.ok) fonts.push({ name: 'Cairo', data: await r.arrayBuffer(), weight, style: 'normal' });
      } catch { /* ignore */ }
    }
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

    // Localization (mirrors the HTML report): Arabic for ar/dual, English for en.
    const lang = report.language_mode || 'dual';
    const ar = lang === 'ar' || lang === 'dual';
    const lbl = (en: string, arar: string) => (ar ? arar : en);

    const analystId = report.author_id ?? report.generated_by;
    const { data: analyzerProfile } = await supabase
      .from('profiles').select('full_name, telegram_username, avatar_url').eq('id', analystId).single();
    const analyzerName = analyzerProfile?.full_name || analyzerProfile?.telegram_username || (ar ? 'المحلل' : 'Analyst');
    const initials = analyzerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarDataUri = await avatarToDataUri(analyzerProfile?.avatar_url);

    const fonts = await loadFonts(ar);
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
      // Round to whole cents so float dust can't flip the win badge at $100.
      const peak = Math.round(((hp - ep) * qtyN * multN + Number.EPSILON) * 100) / 100;
      const isActive = t.status === 'active';
      const isWin = peak >= 100;
      const profit = (isActive || isWin) ? peak : -(ep * qtyN * multN);
      const pct = (isActive || isWin) ? (ep > 0 ? ((hp - ep) / ep) * 100 : 0) : -100;
      // Clean underlying symbol only (e.g. SPX); strike + type shown separately.
      const sym = String(t.underlying_index_symbol ?? 'N/A').replace(/\s*\d{6}[CP]\d{8}\s*$/i, '').trim() || 'N/A';
      const strike = safeNum(t.strike);
      const isCall = (t.option_type ?? t.direction ?? 'call').toLowerCase() === 'call';
      return {
        sym, strikeStr: strike > 0 ? `$${strike.toFixed(0)}` : '-',
        entryStr: ep > 0 ? `$${ep.toFixed(2)}` : '-', highStr: hp > 0 ? `$${hp.toFixed(2)}` : '-',
        dirLabel: isCall ? lbl('CALL', 'شراء') : lbl('PUT', 'بيع'), dirColor: isCall ? C.green : C.red,
        dirBg: isCall ? C.greenBg : C.redBg, dirBorder: isCall ? C.greenBorder : C.redBorder,
        badge: isActive ? lbl('ACTIVE', 'نشطة') : isWin ? lbl('WIN', 'ربح') : lbl('LOSS', 'خسارة'),
        badgeColor: isActive ? C.blue : isWin ? C.green : C.red,
        badgeBg: isActive ? C.blueBg : isWin ? C.greenBg : C.redBg,
        badgeBorder: isActive ? C.blueBorder : isWin ? C.greenBorder : C.redBorder,
        pnlStr: `${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(0)}`,
        pctStr: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`,
        pColor: profit > 0 ? C.green : profit < 0 ? C.red : C.textSub,
      };
    });

    // Keep total pixels well under the renderer limit (~2.0M is flaky / 546).
    const CANVAS_W = 760;
    const ROW_H = 70;
    const FIXED_TOP = 940;
    const MAX_H = 2350;
    const maxRows = Math.max(1, Math.floor((MAX_H - FIXED_TOP) / ROW_H));
    const shownTrades = tradesData.slice(0, maxRows);
    const hiddenCount = tradesData.length - shownTrades.length;
    const canvasHeight = Math.max(1350, FIXED_TOP + shownTrades.length * ROW_H + (hiddenCount > 0 ? 64 : 0));

    const periodLabel =
      report.period_type === 'weekly' ? lbl('Weekly Report', 'الأسبوعي التقرير')
      : report.period_type === 'monthly' ? lbl('Monthly Report', 'الشهري التقرير')
      : lbl('Daily Report', 'اليومي التقرير');
    const dateLabel = report.period_type === 'daily' ? report.report_date : `${startDate}  -  ${endDate}`;
    const netColor = netProfit >= 0 ? C.green : C.red;
    const netSign = netProfit >= 0 ? '+' : '-';

    const chip = (label: string, value: string, color: string) => ({ type: 'div', props: { style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 18, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 7 }, children: [ { type: 'div', props: { style: { fontSize: 18, color: C.text, fontWeight: 700 }, children: label } }, { type: 'div', props: { style: { fontSize: 44, fontWeight: 900, color, lineHeight: 1 }, children: value } } ] } });
    const miniStat = (label: string, value: string, color: string) => ({ type: 'div', props: { style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '13px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }, children: [ { type: 'div', props: { style: { fontSize: 14, color: C.text, fontWeight: 700 }, children: label } }, { type: 'div', props: { style: { fontSize: 25, fontWeight: 900, color }, children: value } } ] } });
    const tradeRow = (t: any) => ({ type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 22px', borderBottom: `1px solid ${C.border}` }, children: [
      { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 }, children: [
        { type: 'div', props: { style: { fontSize: 25, fontWeight: 900, color: C.text }, children: t.sym } },
        { type: 'div', props: { style: { display: 'flex', background: t.dirBg, border: `1px solid ${t.dirBorder}`, borderRadius: 6, padding: '3px 8px', fontSize: 14, fontWeight: 800, color: t.dirColor }, children: t.dirLabel } },
        { type: 'div', props: { style: { fontSize: 20, fontWeight: 800, color: C.textSub }, children: t.strikeStr } },
        { type: 'div', props: { style: { fontSize: 17, fontWeight: 600, color: C.textMuted, marginLeft: 4 }, children: t.entryStr } },
        { type: 'div', props: { style: { fontSize: 16, color: C.textMuted }, children: '->' } },
        { type: 'div', props: { style: { fontSize: 17, fontWeight: 700, color: C.green }, children: t.highStr } },
      ] } },
      { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [
        { type: 'div', props: { style: { display: 'flex', background: t.badgeBg, border: `1px solid ${t.badgeBorder}`, borderRadius: 6, padding: '3px 9px', fontSize: 14, fontWeight: 800, color: t.badgeColor }, children: t.badge } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }, children: [
          { type: 'div', props: { style: { fontSize: 25, fontWeight: 900, color: t.pColor }, children: t.pnlStr } },
          { type: 'div', props: { style: { fontSize: 14, fontWeight: 700, color: t.pColor }, children: t.pctStr } },
        ] } },
      ] } },
    ] } });

    const avatarNode = avatarDataUri
      ? { type: 'img', props: { src: avatarDataUri, width: 76, height: 76, style: { width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.border}` } } }
      : { type: 'div', props: { style: { display: 'flex', width: 76, height: 76, borderRadius: '50%', background: C.blueBg, border: `2px solid ${C.blueBorder}`, alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: C.blue }, children: initials } };

    const vdom = {
      type: 'div', props: {
        style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: FF, position: 'relative' },
        children: [
          { type: 'div', props: { style: { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, height: 9, background: C.blue } } },
          { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '40px 40px 30px', gap: 18 }, children: [
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: 11 }, children: [
              { type: 'div', props: { style: { display: 'flex', background: C.blueBg, border: `1px solid ${C.blueBorder}`, borderRadius: 8, padding: '5px 13px', color: C.blue, fontSize: 17, fontWeight: 800 }, children: 'ANALYZINGHUB' } },
              { type: 'div', props: { style: { fontSize: 50, fontWeight: 900, color: C.text, lineHeight: 1.15 }, children: periodLabel } },
              { type: 'div', props: { style: { fontSize: 23, color: C.textSub }, children: dateLabel } },
              { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 13, marginTop: 4 }, children: [
                avatarNode,
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: [
                  { type: 'div', props: { style: { fontSize: 23, fontWeight: 800, color: C.text }, children: analyzerName } },
                  { type: 'div', props: { style: { fontSize: 18, color: C.textMuted }, children: lbl('Index Analyst', 'مؤشرات محلل') } },
                ] } },
              ] } },
            ] } },
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', background: netProfit >= 0 ? C.greenBg : C.redBg, border: `1px solid ${netProfit >= 0 ? C.greenBorder : C.redBorder}`, borderRadius: 18, padding: '22px 28px', gap: 6 }, children: [
              { type: 'div', props: { style: { fontSize: 21, color: C.text, fontWeight: 800 }, children: lbl('NET PROFIT', 'الربح صافي') } },
              { type: 'div', props: { style: { fontSize: 76, fontWeight: 900, color: netColor, lineHeight: 1 }, children: `${netSign}$${Math.abs(netProfit).toFixed(0)}` } },
              // Profits/losses line. Satori renders inline text in logical
              // (L->R) order without bidi reordering, so for Arabic we lay the
              // pieces out as discrete atomic nodes in the desired visual order
              // (numbers stay LTR; words read RTL right-to-left).
              { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 21, color: C.textSub, fontWeight: 600 }, children: ar ? [
                { type: 'div', props: { style: { display: 'flex' }, children: `-$${totalLoss.toFixed(0)}` } },
                { type: 'div', props: { style: { display: 'flex' }, children: 'الخسائر' } },
                { type: 'div', props: { style: { display: 'flex', color: C.textMuted }, children: '·' } },
                { type: 'div', props: { style: { display: 'flex' }, children: `+$${totalProfit.toFixed(0)}` } },
                { type: 'div', props: { style: { display: 'flex' }, children: 'الأرباح' } },
              ] : [
                { type: 'div', props: { style: { display: 'flex' }, children: `Profits +$${totalProfit.toFixed(0)}   .   Losses -$${totalLoss.toFixed(0)}` } },
              ] } },
            ] } },
            { type: 'div', props: { style: { display: 'flex', gap: 16 }, children: [
              chip(lbl('WIN RATE', 'النجاح معدل'), `${winRate.toFixed(0)}%`, winRate >= 50 ? C.green : C.red),
              chip(lbl('BEST TRADE', 'صفقة أفضل'), `+$${bestTrade.toFixed(0)}`, C.gold),
            ] } },
            { type: 'div', props: { style: { display: 'flex', gap: 11 }, children: [
              miniStat(lbl('TOTAL', 'الإجمالي'), String(totalTrades), C.text),
              miniStat(lbl('WON', 'رابحة'), String(winningTrades), C.green),
              miniStat(lbl('LOST', 'خاسرة'), String(losingTrades), C.red),
              miniStat(lbl('AVG WIN', 'الربح متوسط'), `+$${avgWin.toFixed(0)}`, C.green),
              miniStat(lbl('WORST', 'أسوأ'), `-$${Math.abs(worstTrade).toFixed(0)}`, C.red),
            ] } },
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }, children: [
              { type: 'div', props: { style: { display: 'flex', padding: '13px 22px', fontSize: 18, fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.border}` }, children: `${lbl('TRADES', 'الصفقات')} (${totalTrades})` } },
              ...shownTrades.map(tradeRow),
              ...(hiddenCount > 0 ? [{ type: 'div', props: { style: { display: 'flex', justifyContent: 'center', padding: '13px', fontSize: 17, fontWeight: 600, color: C.textMuted }, children: lbl(`+ ${hiddenCount} more trades - see full report`, `الكامل التقرير راجع — إضافية صفقة ${hiddenCount}+`) } }] : []),
              ...(tradesData.length === 0 ? [{ type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 24, padding: '36px' }, children: lbl('No trades in this period', 'الفترة هذه في صفقات توجد لا') } }] : []),
            ] } },
            { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 17, color: C.textMuted }, children: [
              { type: 'div', props: { children: lbl('AnalyzingHub  .  Index Trading Report', 'AnalyzingHub  ·  المؤشرات تداول تقرير') } },
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
