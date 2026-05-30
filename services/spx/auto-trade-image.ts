/**
 * services/spx/auto-trade-image.ts
 *
 * Generates a 1000×560 PNG card for an automated SPX trade alert.
 * Mirrors the design tokens of supabase/functions/.../trade-image.ts but
 * adds an "AUTO" gold badge so subscribers can tell automated picks apart
 * from the analyst-published trades.
 *
 * Runs server-side in Next.js using @vercel/og (already in deps).
 */

import { ImageResponse } from '@vercel/og';
import type { SPXTrade } from './trade-engine';

export const runtime = 'nodejs';

const C = {
  bg: '#0A0E13',
  card: '#111720',
  border: '#1E2A38',
  divider: '#1A2332',
  text: '#E8EFF7',
  textSub: '#8DA0B8',
  textMuted: '#4D6278',
  call: '#27C76F',
  put: '#F03E3E',
  gold: '#F5A623',
  callBg: 'rgba(39,199,111,0.10)',
  putBg: 'rgba(240,62,62,0.10)',
  callBd: 'rgba(39,199,111,0.25)',
  putBd: 'rgba(240,62,62,0.25)',
  goldBg: 'rgba(245,166,35,0.14)',
  goldBd: 'rgba(245,166,35,0.32)',
} as const;

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function statCard(label: string, value: string, valueColor: string, bg: string, bd: string) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: bg, borderRadius: 10, padding: '14px 18px', border: `1px solid ${bd}`,
      },
      children: [
        { type: 'div', props: { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }, children: label } },
        { type: 'div', props: { style: { fontSize: 28, fontWeight: 800, color: valueColor }, children: value } },
      ],
    },
  };
}

export async function generateAutoTradeImage(trade: SPXTrade): Promise<Response> {
  const isCall = (trade.optionType ?? 'call') === 'call';
  const accent = isCall ? C.call : C.put;
  const accentBg = isCall ? C.callBg : C.putBg;
  const accentBd = isCall ? C.callBd : C.putBd;

  const entry = trade.entryPremium ?? trade.currentPremium ?? 0;
  const high  = trade.highestPremium ?? entry;
  const current = trade.currentPremium ?? entry;
  const pnlPct = entry > 0 ? ((current - entry) / entry) * 100 : 0;
  const pnlColor = pnlPct >= 0 ? C.call : C.put;

  const expiry = trade.expiry
    ? new Date(trade.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '';
  const strikePill = `$${(trade.strike ?? 0).toLocaleString()} ${isCall ? 'CALL' : 'PUT'}`;
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
  });

  const vdom = {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'system-ui, sans-serif', position: 'relative',
      },
      children: [
        { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: accent } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '40px 52px 32px' },
            children: [
              // Header
              {
                type: 'div',
                props: {
                  style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', gap: 10, alignItems: 'center' },
                        children: [
                          { type: 'div', props: { style: { background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 6, padding: '5px 14px', color: C.gold, fontSize: 14, fontWeight: 800, letterSpacing: '0.12em' }, children: '⚡ AUTO · ANALYZINGHUB' } },
                          { type: 'div', props: { style: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 14px', color: C.textSub, fontSize: 14, fontWeight: 600 }, children: `SPX${expiry ? ' · ' + expiry : ''}` } },
                          { type: 'div', props: { style: { background: accentBg, border: `1px solid ${accentBd}`, borderRadius: 6, padding: '5px 14px', color: accent, fontSize: 17, fontWeight: 800 }, children: strikePill } },
                        ],
                      },
                    },
                    { type: 'div', props: { style: { background: accentBg, border: `1px solid ${accentBd}`, borderRadius: 7, padding: '7px 18px', color: accent, fontSize: 16, fontWeight: 800, letterSpacing: '0.06em' }, children: 'NEW AUTO TRADE' } },
                  ],
                },
              },
              // Main
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', width: 320 },
                        children: [
                          { type: 'div', props: { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }, children: 'Entry Premium' } },
                          { type: 'div', props: { style: { fontSize: 92, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-3px' }, children: `$${fmt(entry)}` } },
                          { type: 'div', props: { style: { fontSize: 22, fontWeight: 700, color: pnlColor, marginTop: 8 }, children: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%  ·  ${trade.signalMode ?? ''}` } },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 10, marginTop: 6 },
                        children: [
                          statCard('Stop', `$${fmt(trade.stopPremium)}`, C.put, C.putBg, C.putBd),
                          statCard('Target 1', `$${fmt(trade.target1Premium)}`, C.call, C.callBg, C.callBd),
                          statCard('Target 2', `$${fmt(trade.target2Premium)}`, C.call, C.callBg, C.callBd),
                          statCard('Liquidity', `${Math.round((trade.metadata?.contractLiquidityScore ?? 0))}/100`, C.gold, C.goldBg, C.goldBd),
                        ],
                      },
                    },
                  ],
                },
              },
              // Footer
              {
                type: 'div',
                props: {
                  style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 16, borderTop: `1px solid ${C.divider}` },
                  children: [
                    { type: 'div', props: { style: { display: 'flex', gap: 10, alignItems: 'center' }, children: [
                      { type: 'div', props: { style: { fontSize: 15, fontWeight: 700, color: C.textSub }, children: 'SPX' } },
                      { type: 'div', props: { style: { fontSize: 15, fontWeight: 600, color: C.textMuted }, children: `$${fmt(trade.entrySpxPrice)}` } },
                    ] } },
                    { type: 'div', props: { style: { fontSize: 14, color: C.textMuted }, children: `Score ${Math.round(trade.compositeScore ?? 0)} · ${trade.confidenceClass ?? '?'} · ${time} ET` } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  } as any;

  return new ImageResponse(vdom, { width: 1000, height: 560 });
}

export async function generateAutoTradeImageBytes(trade: SPXTrade): Promise<Uint8Array | null> {
  try {
    const resp = await generateAutoTradeImage(trade);
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength < 1024) return null;
    return buf;
  } catch (err: any) {
    console.error('[auto-trade-image] generation failed:', err?.message);
    return null;
  }
}
