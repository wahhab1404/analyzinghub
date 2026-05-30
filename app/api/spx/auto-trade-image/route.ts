/**
 * GET /api/spx/auto-trade-image?tradeId=<uuid>
 *
 * Generates a PNG card for an SPX auto-trade alert using @vercel/og.
 * Called internally by spx-telegram.ts when sending auto-trade Telegram alerts.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { ImageResponse } from '@vercel/og';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const C = {
  bg:        '#0A0E13',
  card:      '#111720',
  border:    '#1E2A38',
  divider:   '#1A2332',
  text:      '#E8EFF7',
  textSub:   '#8DA0B8',
  textMuted: '#4D6278',
  call:      '#27C76F',
  put:       '#F03E3E',
  auto:      '#A78BFA',     // purple badge for AUTO
  autoBg:    'rgba(167,139,250,0.12)',
  autoBd:    'rgba(167,139,250,0.30)',
  callBg:    'rgba(39,199,111,0.10)',
  callBd:    'rgba(39,199,111,0.25)',
  putBg:     'rgba(240,62,62,0.10)',
  putBd:     'rgba(240,62,62,0.25)',
} as const;

function fmt(n: number) { return n.toFixed(2); }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tradeId = searchParams.get('tradeId');
    if (!tradeId) {
      return NextResponse.json({ error: 'tradeId required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'No Supabase config' }, { status: 500 });

    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: trade } = await supabase
      .from('spx_trades')
      .select('ticker, strike, option_type, dte, current_premium, stop_premium, target_1_premium, target_2_premium, target_3_premium, composite_score, confidence_class, signal_mode, direction_bias, suggested_entry_low, suggested_entry_high, metadata')
      .eq('id', tradeId)
      .single();

    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const isCall    = (trade.option_type ?? 'call') === 'call';
    const accent    = isCall ? C.call : C.put;
    const accentBg  = isCall ? C.callBg : C.putBg;
    const accentBd  = isCall ? C.callBd : C.putBd;
    const typeLabel = isCall ? 'CALL' : 'PUT';
    const dirEmoji  = isCall ? '▲' : '▼';
    const entryMid  = Number(trade.current_premium ?? 0);
    const strike    = Number(trade.strike ?? 0);
    const dte       = Number(trade.dte ?? 0);

    const statRow = (label: string, value: string, valColor: string, bg: string, bd: string) => ({
      type: 'div',
      props: {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bg, borderRadius: 10, padding: '13px 18px', border: `1px solid ${bd}` },
        children: [
          { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }, children: label } },
          { type: 'div', props: { style: { fontSize: 22, fontWeight: 800, color: valColor }, children: value } },
        ],
      },
    });

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });

    const vdom = {
      type: 'div',
      props: {
        style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'system-ui, sans-serif', position: 'relative', overflow: 'hidden' },
        children: [
          // top accent bar
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: C.auto } } },

          { type: 'div', props: {
            style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '38px 50px 30px' },
            children: [
              // Header row
              { type: 'div', props: {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
                children: [
                  { type: 'div', props: {
                    style: { display: 'flex', gap: 10, alignItems: 'center' },
                    children: [
                      { type: 'div', props: { style: { background: C.autoBg, border: `1px solid ${C.autoBd}`, borderRadius: 6, padding: '5px 14px', color: C.auto, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }, children: 'ANALYZINGHUB' } },
                      { type: 'div', props: { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 14px', color: C.textSub, fontSize: 13, fontWeight: 600 }, children: `SPX · ${dte}DTE` } },
                      { type: 'div', props: { style: { background: accentBg, border: `1px solid ${accentBd}`, borderRadius: 6, padding: '5px 14px', color: accent, fontSize: 16, fontWeight: 800 }, children: `$${strike.toLocaleString()} ${typeLabel}` } },
                    ],
                  }},
                  { type: 'div', props: { style: { background: C.autoBg, border: `1px solid ${C.autoBd}`, borderRadius: 7, padding: '7px 18px', color: C.auto, fontSize: 15, fontWeight: 800, letterSpacing: '0.08em' }, children: '🤖 AUTO TRADE' } },
                ],
              }},

              // Main
              { type: 'div', props: {
                style: { display: 'flex', flex: 1, gap: 36, alignItems: 'flex-start' },
                children: [
                  // Left big metric
                  { type: 'div', props: {
                    style: { display: 'flex', flexDirection: 'column', width: 300 },
                    children: [
                      { type: 'div', props: { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }, children: 'Entry Price' } },
                      { type: 'div', props: { style: { fontSize: 88, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-3px' }, children: `$${fmt(entryMid)}` } },
                      { type: 'div', props: { style: { fontSize: 18, fontWeight: 700, color: accent, marginTop: 8 }, children: `${dirEmoji} ${typeLabel} · Score ${Math.round(Number(trade.composite_score ?? 0))}/100 · ${trade.confidence_class ?? '?'}` } },
                    ],
                  }},
                  // Right stats
                  { type: 'div', props: {
                    style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 9, marginTop: 4 },
                    children: [
                      statRow('Stop', `$${fmt(Number(trade.stop_premium ?? 0))}`, C.put, C.card, C.border),
                      statRow('Target 1', `$${fmt(Number(trade.target_1_premium ?? 0))}`, C.call, C.callBg, C.callBd),
                      statRow('Target 2', `$${fmt(Number(trade.target_2_premium ?? 0))}`, C.call, C.callBg, C.callBd),
                      statRow('Target 3', `$${fmt(Number(trade.target_3_premium ?? 0))}`, C.call, C.callBg, C.callBd),
                    ],
                  }},
                ],
              }},

              // Footer
              { type: 'div', props: {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 14, borderTop: `1px solid ${C.divider}` },
                children: [
                  { type: 'div', props: { style: { fontSize: 14, fontWeight: 700, color: C.textSub }, children: trade.signal_mode ?? '' } },
                  { type: 'div', props: { style: { fontSize: 13, color: C.textMuted }, children: `Auto · ${timeStr} ET` } },
                ],
              }},
            ],
          }},
        ],
      },
    };

    const imgResp = new ImageResponse(vdom as any, { width: 1000, height: 520 });
    return new NextResponse(imgResp.body, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('[auto-trade-image]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
