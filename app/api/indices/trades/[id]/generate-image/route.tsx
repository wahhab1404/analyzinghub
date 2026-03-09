/**
 * GET /api/indices/trades/[id]/generate-image
 *
 * Generates a professional PNG alert card for a trade.
 * Called by the `generate-trade-snapshot` Supabase edge function.
 * Returns raw PNG bytes (Content-Type: image/png).
 *
 * Query params:
 *   isNewHigh=true      — render a "new high" alert card
 *   newHighPrice=12.50  — the new high price value
 *
 * Canvas: 1000×560 — optimal for Telegram inline photo preview.
 * Uses `nodejs` runtime for maximum compatibility on Netlify.
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg:       '#0A0E13',
  card:     '#111720',
  elevated: '#161D28',
  border:   '#1E2A38',
  divider:  '#1A2332',
  text:     '#E8EFF7',
  textSub:  '#8DA0B8',
  textMuted:'#4D6278',
  call:     '#27C76F',
  put:      '#F03E3E',
  blue:     '#3B9EFF',
  gold:     '#F5A623',
  callBg:   'rgba(39,199,111,0.10)',
  putBg:    'rgba(240,62,62,0.10)',
  callBd:   'rgba(39,199,111,0.25)',
  putBd:    'rgba(240,62,62,0.25)',
  goldBg:   'rgba(245,166,35,0.12)',
  goldBd:   'rgba(245,166,35,0.28)',
  blueBg:   'rgba(59,158,255,0.10)',
  blueBd:   'rgba(59,158,255,0.25)',
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────
function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ─── Route handler ──────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now();
  console.log('[generate-image] GET request received');

  try {
    const { id: tradeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const isNewHigh = searchParams.get('isNewHigh') === 'true';
    const rawNewHigh = searchParams.get('newHighPrice');
    const newHighPrice: number | null = rawNewHigh ? safeNum(rawNewHigh) : null;

    console.log('[generate-image]', { tradeId, isNewHigh, newHighPrice });

    // Supabase (service-role — no user auth required, called by edge function)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('[generate-image] Missing SUPABASE env vars');
      return new Response('Server configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch trade
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select('*, author:profiles!author_id(id, full_name)')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      console.error('[generate-image] Trade not found:', tradeError?.message);
      return new Response('Trade not found', { status: 404 });
    }

    // Fetch analysis info if linked
    let analysisInfo: { id: string; title: string; index_symbol: string } | null = null;
    if (trade.analysis_id) {
      const { data } = await supabase
        .from('index_analyses')
        .select('id, title, index_symbol')
        .eq('id', trade.analysis_id)
        .maybeSingle();
      analysisInfo = data;
    }

    // ── Derived data ─────────────────────────────────────────────────────────
    const snap = trade.entry_contract_snapshot ?? {};
    const entryPrice = safeNum(snap.price ?? snap.mid ?? snap.last);
    const currentPrice = safeNum(trade.current_contract, entryPrice);
    const highSince = safeNum(trade.contract_high_since, currentPrice);

    const underlyingSymbol: string =
      analysisInfo?.index_symbol ?? trade.underlying_index_symbol ?? 'SPX';
    const underlyingPrice = safeNum(
      trade.current_underlying ?? trade.entry_underlying_snapshot?.price
    );
    const underlyingEntryPrice = safeNum(
      trade.entry_underlying_snapshot?.price,
      underlyingPrice
    );
    const underlyingChangePct =
      underlyingEntryPrice > 0
        ? ((underlyingPrice - underlyingEntryPrice) / underlyingEntryPrice) * 100
        : 0;

    const strike = safeNum(trade.strike);
    const optionType = (trade.option_type ?? trade.direction ?? 'call').toLowerCase();
    const isCall = optionType === 'call';
    const accent  = isCall ? C.call : C.put;
    const accentBg = isCall ? C.callBg : C.putBg;
    const accentBd = isCall ? C.callBd : C.putBd;

    const expiry = trade.expiry
      ? new Date(trade.expiry).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        })
      : '';

    const targets: any[] = Array.isArray(trade.targets) ? trade.targets : [];
    const t1: number | null = safeNum(targets[0]?.level ?? targets[0]?.price) || null;
    const t2: number | null = safeNum(targets[1]?.level ?? targets[1]?.price) || null;
    const stop: number | null = safeNum(trade.stoploss?.level ?? trade.stoploss?.price) || null;

    const qty = safeNum(trade.qty, 1) || 1;
    const oi  = safeNum(snap.open_interest ?? snap.oi);
    const vol = safeNum(snap.volume ?? snap.v);
    const mid = entryPrice; // entry IS the mid at time of trade

    const bid       = safeNum(snap.bid);
    const ask       = safeNum(snap.ask);
    const delta     = safeNum(snap.delta);
    const gamma     = safeNum(snap.gamma);
    const theta     = safeNum(snap.theta);
    const vega      = safeNum(snap.vega);
    const iv        = safeNum(snap.implied_volatility);
    const hasGreeks = delta !== 0 || gamma !== 0 || theta !== 0 || vega !== 0;
    const hasBidAsk = bid > 0 && ask > 0 && bid !== ask;

    const analystName: string = (trade.author as any)?.full_name ?? 'Analyst';
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });

    // Clean symbol from polygon ticker (e.g. "O:SPX251231C05900000" → "SPX")
    let sym = underlyingSymbol;
    if (trade.polygon_option_ticker) {
      const parts = (trade.polygon_option_ticker as string).split(':');
      if (parts.length > 1) sym = parts[1].replace(/\d{6}[CP]\d{8}$/, '');
    }

    const priceDelta = currentPrice - entryPrice;
    const pricePct = entryPrice > 0 ? (priceDelta / entryPrice) * 100 : 0;
    const statusLabel = (trade.status ?? 'active').toUpperCase().replace('_', ' ');

    console.log('[generate-image] Data resolved:', {
      sym, entryPrice, currentPrice, strike, expiry, isCall, t1, t2, stop, analystName,
    });

    // ── NEW HIGH card ────────────────────────────────────────────────────────
    if (isNewHigh) {
      const dispHigh = newHighPrice ?? highSince;
      const gainPct  = entryPrice > 0 ? ((dispHigh - entryPrice) / entryPrice) * 100 : 0;
      const gainUsd  = (dispHigh - entryPrice) * qty * 100;

      console.log('[generate-image] Rendering NEW HIGH card');

      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: C.bg,
              fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Gold top accent bar */}
            <div
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: 5,
                background: `linear-gradient(90deg, ${C.gold} 0%, #FFD26F 50%, ${C.gold} 100%)`,
              }}
            />

            {/* Subtle radial glow */}
            <div
              style={{
                position: 'absolute',
                top: -120, left: -80,
                width: 500, height: 500,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)',
              }}
            />

            <div
              style={{
                display: 'flex',
                flex: 1,
                padding: '36px 52px 32px',
                flexDirection: 'column',
              }}
            >
              {/* Top row: contract tag + alert badge */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 28,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      background: C.goldBg,
                      border: `1px solid ${C.goldBd}`,
                      borderRadius: 6,
                      padding: '5px 14px',
                      color: C.gold,
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}
                  >
                    ANALYZINGHUB
                  </div>
                  {strike > 0 && (
                    <div
                      style={{
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        padding: '5px 14px',
                        color: C.textSub,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {sym} ${strike.toLocaleString()} {isCall ? 'C' : 'P'}
                      {expiry ? ` ${expiry}` : ''}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    background: C.goldBg,
                    border: `1px solid ${C.goldBd}`,
                    borderRadius: 7,
                    padding: '7px 18px',
                    color: C.gold,
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                  }}
                >
                  🚀 NEW HIGH ALERT
                </div>
              </div>

              {/* Main row: left = big price, right = metrics */}
              <div style={{ display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' }}>
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 280 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textMuted,
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Contract High
                  </div>
                  <div
                    style={{
                      fontSize: 96,
                      fontWeight: 900,
                      color: C.gold,
                      lineHeight: 1,
                      letterSpacing: '-3px',
                    }}
                  >
                    ${fmt(dispHigh)}
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: C.call,
                      marginTop: 6,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    +{gainPct.toFixed(1)}%
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      color: C.textMuted,
                      marginTop: 4,
                    }}
                  >
                    +${gainUsd.toFixed(0)} per lot
                  </div>
                </div>

                {/* Right column */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    gap: 10,
                    marginTop: 8,
                  }}
                >
                  {/* Entry */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: C.card,
                      borderRadius: 10,
                      padding: '14px 18px',
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Entry</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: C.textSub }}>${fmt(entryPrice)}</div>
                  </div>

                  {/* Max Gain */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: C.goldBg,
                      borderRadius: 10,
                      padding: '14px 18px',
                      border: `1px solid ${C.goldBd}`,
                    }}
                  >
                    <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Max Gain</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.gold }}>+{gainPct.toFixed(2)}%</div>
                  </div>

                  {/* P/L */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: C.callBg,
                      borderRadius: 10,
                      padding: '14px 18px',
                      border: `1px solid ${C.callBd}`,
                    }}
                  >
                    <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>P/L (1 lot)</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.call }}>+${gainUsd.toFixed(0)}</div>
                  </div>

                  {/* Target if set */}
                  {t1 !== null && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: C.card,
                        borderRadius: 10,
                        padding: '14px 18px',
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Target 1</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: C.call }}>${fmt(t1)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 16,
                  marginTop: 16,
                  borderTop: `1px solid ${C.divider}`,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.textSub }}>{underlyingSymbol}</div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: underlyingChangePct >= 0 ? C.call : C.put,
                    }}
                  >
                    ${fmt(underlyingPrice)} {underlyingChangePct >= 0 ? '▲' : '▼'}{Math.abs(underlyingChangePct).toFixed(2)}%
                  </div>
                </div>
                <div style={{ fontSize: 14, color: C.textMuted }}>
                  {analystName} · {timeStr} ET
                </div>
              </div>
            </div>
          </div>
        ),
        { width: 1000, height: 560 }
      );
    }

    // ── NEW TRADE card (Webull-style) ────────────────────────────────────────
    console.log('[generate-image] Rendering NEW TRADE card, sym:', sym);

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: C.bg,
            fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top accent bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: accent }} />

          {/* Subtle radial glow */}
          <div
            style={{
              position: 'absolute',
              top: -100, left: -60,
              width: 420, height: 420,
              borderRadius: '50%',
              background: isCall
                ? 'radial-gradient(circle, rgba(39,199,111,0.07) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(240,62,62,0.07) 0%, transparent 70%)',
            }}
          />

          {/* ── CONTRACT HEADER ROW ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 48px 14px',
              marginTop: 5,
            }}
          >
            {/* Brand */}
            <div
              style={{
                background: accentBg,
                border: `1px solid ${accentBd}`,
                borderRadius: 6,
                padding: '5px 13px',
                color: accent,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
              }}
            >
              ANALYZINGHUB
            </div>

            {/* Contract label (center) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>
                  {sym}
                </div>
                {strike > 0 && (
                  <div style={{ fontSize: 26, fontWeight: 800, color: accent }}>
                    ${strike.toLocaleString()}
                  </div>
                )}
                <div
                  style={{
                    background: accentBg,
                    border: `1px solid ${accentBd}`,
                    borderRadius: 6,
                    padding: '3px 10px',
                    color: accent,
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                  }}
                >
                  {isCall ? '▲ CALL' : '▼ PUT'}
                </div>
              </div>
              {expiry && (
                <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>
                  Expires {expiry}
                </div>
              )}
            </div>

            {/* Status badge */}
            <div
              style={{
                background: C.blueBg,
                border: `1px solid ${C.blueBd}`,
                borderRadius: 7,
                padding: '6px 16px',
                color: C.blue,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.07em',
              }}
            >
              ● {statusLabel}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.divider, margin: '0 48px' }} />

          {/* ── CONTENT: LEFT + RIGHT PANELS ── */}
          <div style={{ display: 'flex', flex: 1 }}>

            {/* ── LEFT PANEL ── */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: 460,
                padding: '20px 32px 28px 48px',
                borderRight: `1px solid ${C.divider}`,
              }}
            >
              {/* Entry price — dominant */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>
                  Entry Price
                </div>
                <div style={{ fontSize: 82, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-2.5px' }}>
                  ${fmt(entryPrice)}
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                  {qty} contract{qty !== 1 ? 's' : ''} · ${(entryPrice * qty * 100).toFixed(0)} total
                </div>
              </div>

              {/* Bid / Ask / Mid row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div
                  style={{
                    flex: 1,
                    background: C.card,
                    borderRadius: 8,
                    padding: '9px 12px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Bid</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: hasBidAsk ? C.put : C.textSub }}>
                    ${fmt(hasBidAsk ? bid : entryPrice)}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: C.card,
                    borderRadius: 8,
                    padding: '9px 12px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ask</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: hasBidAsk ? C.call : C.textSub }}>
                    ${fmt(hasBidAsk ? ask : entryPrice)}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: C.card,
                    borderRadius: 8,
                    padding: '9px 12px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Mid</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
                    ${fmt(hasBidAsk ? (bid + ask) / 2 : entryPrice)}
                  </div>
                </div>
              </div>

              {/* OI / Volume row */}
              {(oi > 0 || vol > 0) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {oi > 0 && (
                    <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Open Int</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.textSub }}>{compactNum(oi)}</div>
                    </div>
                  )}
                  {vol > 0 && (
                    <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Volume</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.textSub }}>{compactNum(vol)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Underlying index */}
              {underlyingPrice > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: C.card,
                    borderRadius: 8,
                    padding: '10px 14px',
                    border: `1px solid ${C.border}`,
                    marginTop: 'auto',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub }}>{underlyingSymbol}</div>
                  <div style={{ width: 1, height: 13, background: C.border }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: underlyingChangePct >= 0 ? C.call : C.put }}>
                    ${fmt(underlyingPrice)} {underlyingChangePct >= 0 ? '▲' : '▼'}{Math.abs(underlyingChangePct).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT PANEL ── */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '20px 44px 28px 32px',
              }}
            >
              {/* Greeks section */}
              {hasGreeks && (
                <>
                  {/* Header: label + IV badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                      Options Greeks
                    </div>
                    {iv > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: C.goldBg,
                          border: `1px solid ${C.goldBd}`,
                          borderRadius: 6,
                          padding: '4px 12px',
                        }}
                      >
                        <div style={{ fontSize: 10, color: C.gold, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>IV</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.gold }}>{(iv * 100).toFixed(1)}%</div>
                      </div>
                    )}
                  </div>

                  {/* Greeks 2×2 grid */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 7 }}>
                      {/* Delta */}
                      <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.06em' }}>Δ Delta</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: delta >= 0 ? C.call : C.put }}>{delta.toFixed(3)}</div>
                      </div>
                      {/* Gamma */}
                      <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.06em' }}>Γ Gamma</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.blue }}>{gamma.toFixed(4)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 7 }}>
                      {/* Theta */}
                      <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.06em' }}>Θ Theta</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.put }}>{theta.toFixed(3)}</div>
                      </div>
                      {/* Vega */}
                      <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.06em' }}>V Vega</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.blue }}>{vega.toFixed(3)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Divider before targets */}
                  <div style={{ height: 1, background: C.divider, marginBottom: 12 }} />
                </>
              )}

              {/* Targets + Stop */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {t1 !== null && (
                  <div style={{ background: C.callBg, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.callBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Target 1</div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: C.call }}>${fmt(t1)}</div>
                  </div>
                )}
                {t2 !== null && (
                  <div style={{ background: 'rgba(39,199,111,0.06)', borderRadius: 10, padding: '12px 18px', border: '1px solid rgba(39,199,111,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Target 2</div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: C.call }}>${fmt(t2)}</div>
                  </div>
                )}
                {t1 === null && t2 === null && !hasGreeks && (
                  <div style={{ background: C.card, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, color: C.textMuted }}>Targets not yet set</div>
                  </div>
                )}
                {stop !== null && (
                  <div style={{ background: C.putBg, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.putBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Stop Loss</div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: C.put }}>${fmt(stop)}</div>
                  </div>
                )}
              </div>

              {/* Footer: analyst + time */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `1px solid ${C.divider}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Analyst</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{analystName}</div>
                </div>
                <div style={{ fontSize: 13, color: C.textMuted }}>{timeStr} ET</div>
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1000, height: 560 }
    );
  } catch (error: any) {
    console.error('[generate-image] Fatal error:', error?.message);
    console.error('[generate-image] Stack:', error?.stack);
    return new Response(
      JSON.stringify({ error: error?.message ?? 'Image generation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
