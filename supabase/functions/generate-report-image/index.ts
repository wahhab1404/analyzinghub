/**
 * Supabase Edge Function: generate-report-image
 *
 * Generates a professional PNG trade report image using @vercel/og.
 * Dark, premium design inspired by professional trading dashboards.
 * Returns raw PNG bytes (Content-Type: image/png).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ImageResponse } from 'npm:@vercel/og@0.6.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg: '#0D1117',
  card: '#161B22',
  elevated: '#1C2128',
  border: '#30363D',
  text: '#E6EDF3',
  textSub: '#8B949E',
  textMuted: '#6E7681',
  call: '#3FB950',
  put: '#F85149',
  blue: '#58A6FF',
  gold: '#E3B341',
};

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

interface ReportRequest {
  report_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const data: ReportRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[generate-report-image] Fetching report:', data.report_id);

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('*')
      .eq('id', data.report_id)
      .maybeSingle();

    if (reportError || !report) {
      console.error('[generate-report-image] Report not found:', reportError);
      throw new Error('Report not found');
    }

    console.log('[generate-report-image] Report:', report.id, report.report_date, report.period_type);

    // ── Fetch analyzer profile ───────────────────────────────────────────────
    const analystId = report.author_id ?? report.generated_by;
    const { data: analyzerProfile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', analystId)
      .single();
    const analyzerName = analyzerProfile?.full_name || analyzerProfile?.username || 'Analyst';
    const initials = analyzerName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

    // ── Summary metrics ─────────────────────────────────────────────────────
    const summary = report.summary ?? {};
    const totalTrades = safeNum(summary.total_trades);
    const activeTrades = safeNum(summary.active_trades);
    const closedTrades = safeNum(summary.closed_trades);
    const winningTrades = safeNum(summary.winning_trades);
    const losingTrades = safeNum(summary.losing_trades);
    const totalProfit = safeNum(summary.total_profit_dollars ?? summary.total_profit);
    const totalLoss = safeNum(Math.abs(safeNum(summary.total_loss)));
    const netProfit = safeNum(summary.net_profit, totalProfit - totalLoss);
    const winRate =
      winningTrades + losingTrades > 0
        ? (winningTrades / (winningTrades + losingTrades)) * 100
        : 0;
    const wlRatio = losingTrades > 0
      ? (winningTrades / losingTrades).toFixed(1) + '×'
      : winningTrades > 0 ? '∞' : '—';
    const avgWin = safeNum(summary.avg_profit_per_winning_trade);
    const bestTrade = safeNum(summary.best_trade);
    const worstTrade = safeNum(summary.worst_trade);

    // ── Fetch recent trades ──────────────────────────────────────────────────
    const startDate = report.start_date ?? report.report_date;
    const endDate = report.end_date ?? report.report_date;
    const periodStart = new Date(startDate + 'T00:00:00.000Z');
    const periodEnd = new Date(endDate + 'T23:59:59.999Z');

    // Filter to the same channel + exclude test trades so the image matches the HTML report.
    let tradesQuery = supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analystId)
      .eq('is_testing', false);

    if (report.telegram_channel_id) {
      tradesQuery = tradesQuery.eq('telegram_channel_id', report.telegram_channel_id);
    }

    const { data: allTrades } = await tradesQuery;

    const periodTrades = (allTrades ?? [])
      .filter((t: any) => {
        const created = new Date(t.created_at);
        const closed = t.closed_at ? new Date(t.closed_at) : null;
        return (
          (created >= periodStart && created <= periodEnd) ||
          (closed && closed >= periodStart && closed <= periodEnd) ||
          (t.status === 'active' && created <= periodEnd)
        );
      })
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    console.log('[generate-report-image] Period trades:', periodTrades.length);

    const tradesData = periodTrades.map((t: any) => {
      let profit = 0;
      if (t.pnl_usd != null) profit = safeNum(t.pnl_usd);
      else if (t.final_profit != null) profit = safeNum(t.final_profit);
      else if (t.max_profit != null) profit = safeNum(t.max_profit);
      else {
        const ep = safeNum(t.entry_contract_snapshot?.mid ?? t.entry_contract_snapshot?.last);
        const hp = safeNum(t.contract_high_since);
        profit = (hp - ep) * safeNum(t.qty, 1) * safeNum(t.contract_multiplier, 100);
      }

      let sym = t.underlying_index_symbol ?? 'N/A';
      if (t.polygon_option_ticker) {
        const parts = String(t.polygon_option_ticker).split(':');
        if (parts.length > 1) sym = parts[1].replace(/\d{6}[CP]\d{8}$/, '');
      }

      const isActive = t.status === 'active';
      const isWin = t.is_winning_trade || profit >= 100;
      const isLoss = profit < -20;

      const statusColor = isActive ? C.blue : isWin ? C.call : isLoss ? C.put : C.textSub;
      const profitStr = profit !== 0 ? `${profit >= 0 ? '+' : '-'}$${Math.abs(profit).toFixed(0)}` : '—';
      const profitColor = profit > 0 ? C.call : profit < 0 ? C.put : C.textSub;

      const entry = safeNum(t.entry_contract_snapshot?.price ?? t.entry_contract_snapshot?.mid ?? t.entry_contract_snapshot?.last);
      const high = safeNum(t.contract_high_since ?? t.current_contract, entry);
      const strike = safeNum(t.strike);
      const optType = (t.option_type ?? t.direction ?? 'call').toLowerCase();
      const isCall = optType === 'call';
      const dirLabel = isCall ? 'CALL' : 'PUT';
      const dirColor = isCall ? C.call : C.put;
      const dirBg = isCall ? 'rgba(63,185,80,0.10)' : 'rgba(248,81,73,0.10)';
      const dirBorder = isCall ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)';

      return { sym, strike: strike > 0 ? `$${strike.toFixed(0)}` : '—',
               entry: entry > 0 ? `$${entry.toFixed(2)}` : '—',
               high: high > 0 ? `$${high.toFixed(2)}` : '—',
               profitStr, profitColor, statusColor, dirLabel, dirColor, dirBg, dirBorder };
    });

    // ── Period title ─────────────────────────────────────────────────────────
    const periodLabel =
      report.period_type === 'weekly' ? 'Weekly Report' :
      report.period_type === 'monthly' ? 'Monthly Report' : 'Daily Report';

    const dateLabel =
      report.period_type === 'daily' ? report.report_date : `${startDate} – ${endDate}`;

    const netColor = netProfit >= 0 ? C.call : C.put;
    const netSign = netProfit >= 0 ? '+' : '';

    console.log('[generate-report-image] Generating image...');

    // ── vdom (object notation for Deno edge compatibility) ───────────────────
    const imageResponse = new ImageResponse(
      {
        type: 'div',
        props: {
          style: {
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            background: C.bg, fontFamily: 'system-ui, sans-serif',
            position: 'relative', overflow: 'hidden',
          },
          children: [
            // Top accent
            { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: C.blue } } },
            // Main content
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 52px 36px' },
                children: [
                  // Header
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
                      children: [
                        // Left: brand + title + date
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexDirection: 'column', gap: 5 },
                            children: [
                              { type: 'div', props: { style: { background: 'rgba(88,166,255,0.10)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 6, padding: '3px 12px', color: C.blue, fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', width: 'fit-content' }, children: 'ANALYZINGHUB' } },
                              { type: 'div', props: { style: { fontSize: 32, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.15 }, children: periodLabel } },
                              { type: 'div', props: { style: { fontSize: 17, color: C.textSub }, children: dateLabel } },
                            ],
                          },
                        },
                        // Right: analyst avatar + name
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', alignItems: 'center', gap: 12 },
                            children: [
                              analyzerProfile?.avatar_url
                                ? { type: 'img', props: { src: analyzerProfile.avatar_url, style: { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.border}` } } }
                                : { type: 'div', props: { style: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(88,166,255,0.10)', border: '2px solid rgba(88,166,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: C.blue }, children: initials } },
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column', gap: 2 },
                                  children: [
                                    { type: 'div', props: { style: { fontSize: 15, fontWeight: 700, color: C.text }, children: analyzerName } },
                                    { type: 'div', props: { style: { fontSize: 12, color: C.textMuted }, children: 'Index Analyst' } },
                                  ],
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  // KPI row
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', gap: 14, marginBottom: 14 },
                      children: [
                        // Net profit (wide)
                        {
                          type: 'div',
                          props: {
                            style: {
                              flex: 2, background: netProfit >= 0 ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
                              border: `1px solid ${netProfit >= 0 ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)'}`,
                              borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4,
                            },
                            children: [
                              { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }, children: 'Net Profit' } },
                              { type: 'div', props: { style: { fontSize: 46, fontWeight: 900, color: netColor, lineHeight: 1, letterSpacing: '-1px' }, children: `${netSign}$${Math.abs(netProfit).toFixed(0)}` } },
                            ],
                          },
                        },
                        // Win rate
                        {
                          type: 'div',
                          props: {
                            style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
                            children: [
                              { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }, children: 'Win Rate' } },
                              { type: 'div', props: { style: { fontSize: 40, fontWeight: 900, color: winRate >= 50 ? C.call : C.put, lineHeight: 1 }, children: `${winRate.toFixed(0)}%` } },
                              { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, marginTop: 2 }, children: `${winningTrades}W · ${losingTrades}L · W/L ${wlRatio}` } },
                            ],
                          },
                        },
                        // Best trade
                        {
                          type: 'div',
                          props: {
                            style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
                            children: [
                              { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }, children: 'Best Trade' } },
                              { type: 'div', props: { style: { fontSize: 40, fontWeight: 900, color: C.gold, lineHeight: 1 }, children: `+$${bestTrade.toFixed(0)}` } },
                              { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, marginTop: 2 }, children: `Avg win +$${avgWin.toFixed(0)}` } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  // Counts row
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', gap: 10, marginBottom: 14 },
                      children: (
                        [
                          ['Total', String(totalTrades), C.text],
                          ['Active', String(activeTrades), C.blue],
                          ['Closed', String(closedTrades), C.textSub],
                          ['Won', String(winningTrades), C.call],
                          ['Lost', String(losingTrades), C.put],
                          ['Best', `+$${bestTrade.toFixed(0)}`, C.call],
                          ['Worst', `$${worstTrade.toFixed(0)}`, C.put],
                        ] as const
                      ).map(([label, value, color]) => ({
                        type: 'div',
                        props: {
                          style: { flex: 1, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3 },
                          children: [
                            { type: 'div', props: { style: { fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }, children: label } },
                            { type: 'div', props: { style: { fontSize: 20, fontWeight: 800, color }, children: value } },
                          ],
                        },
                      })),
                    },
                  },
                  // Trades table
                  {
                    type: 'div',
                    props: {
                      style: { flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
                      children: [
                        // Table header
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', background: C.elevated, padding: '10px 18px', borderBottom: `1px solid ${C.border}` },
                            children: (
                              [['Symbol', 2], ['Strike', 1], ['Entry', 1], ['High', 1], ['P/L', 1]] as const
                            ).map(([label, flex]) => ({
                              type: 'div',
                              props: { style: { flex, fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }, children: label },
                            })),
                          },
                        },
                        // Rows
                        ...tradesData.map((t: any) => ({
                          type: 'div',
                          props: {
                            style: { display: 'flex', padding: '10px 18px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: { flex: 2, display: 'flex', alignItems: 'center', gap: 8 },
                                  children: [
                                    { type: 'div', props: { style: { fontSize: 16, fontWeight: 800, color: C.text }, children: t.sym } },
                                    { type: 'div', props: { style: { background: t.dirBg, border: `1px solid ${t.dirBorder}`, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 800, color: t.dirColor, letterSpacing: '0.05em' }, children: t.dirLabel } },
                                  ],
                                },
                              },
                              { type: 'div', props: { style: { flex: 1, fontSize: 14, color: C.textSub, fontWeight: 600 }, children: t.strike } },
                              { type: 'div', props: { style: { flex: 1, fontSize: 14, color: C.textSub }, children: t.entry } },
                              { type: 'div', props: { style: { flex: 1, fontSize: 14, color: C.call }, children: t.high } },
                              { type: 'div', props: { style: { flex: 1, fontSize: 15, fontWeight: 800, color: t.profitColor }, children: t.profitStr } },
                            ],
                          },
                        })),
                        ...(tradesData.length === 0 ? [{
                          type: 'div',
                          props: {
                            style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 17, padding: '20px' },
                            children: 'No trades in this period',
                          },
                        }] : []),
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { width: 1200, height: 675 }
    );

    const arrayBuffer = await imageResponse.arrayBuffer();
    const pngBuffer = new Uint8Array(arrayBuffer);

    console.log('[generate-report-image] Done, size:', pngBuffer.length, 'bytes');

    return new Response(pngBuffer, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'image/png' },
    });

  } catch (error: any) {
    console.error('[generate-report-image] Error:', error?.message);
    console.error('[generate-report-image] Stack:', error?.stack);
    return new Response(
      JSON.stringify({ error: error?.message ?? 'Image generation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
