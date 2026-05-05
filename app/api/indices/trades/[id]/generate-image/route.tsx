/**
 * GET /api/indices/trades/[id]/generate-image
 *
 * Returns a PNG trade-alert card styled like a broker app quote screen.
 *
 * Query params:
 *   isNewHigh=true      — render a "new high" card (gold accent)
 *   newHighPrice=12.50  — the high price to display
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tradeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const isNewHigh = searchParams.get('isNewHigh') === 'true';
    const rawNewHigh = searchParams.get('newHighPrice');
    const newHighPrice: number | null = rawNewHigh ? safeNum(rawNewHigh) : null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return new Response('Server configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select('*, author:profiles!author_id(id, full_name)')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return new Response('Trade not found', { status: 404 });
    }

    let analysisInfo: { id: string; title: string; index_symbol: string } | null = null;
    if (trade.analysis_id) {
      const { data } = await supabase
        .from('index_analyses')
        .select('id, title, index_symbol')
        .eq('id', trade.analysis_id)
        .maybeSingle();
      analysisInfo = data;
    }

    // ── Derived values ────────────────────────────────────────────────────────
    const snap        = trade.entry_contract_snapshot ?? {};
    const entryPrice  = safeNum(snap.price ?? snap.mid ?? snap.last);
    const currentPrice = safeNum(trade.current_contract, entryPrice);
    const highSince   = safeNum(trade.contract_high_since, currentPrice);
    const bid         = safeNum(snap.bid);
    const ask         = safeNum(snap.ask);
    const oi          = safeNum(snap.open_interest ?? snap.oi);
    const vol         = safeNum(snap.volume ?? snap.v);

    const underlyingSymbol: string =
      analysisInfo?.index_symbol ?? trade.underlying_index_symbol ?? 'SPX';
    const underlyingPrice = safeNum(
      trade.current_underlying ?? trade.entry_underlying_snapshot?.price
    );
    const underlyingEntry = safeNum(
      trade.entry_underlying_snapshot?.price, underlyingPrice
    );
    const underlyingChg =
      underlyingEntry > 0
        ? ((underlyingPrice - underlyingEntry) / underlyingEntry) * 100
        : 0;

    const strike    = safeNum(trade.strike);
    const optType   = (trade.option_type ?? trade.direction ?? 'call').toLowerCase();
    const isCall    = optType === 'call';
    const qty       = safeNum(trade.qty, 1) || 1;

    // Clean symbol from polygon ticker e.g. "O:SPXW251231C05900000" → "SPXW"
    let sym = underlyingSymbol;
    if (trade.polygon_option_ticker) {
      const parts = (trade.polygon_option_ticker as string).split(':');
      if (parts.length > 1) sym = parts[1].replace(/\d{6}[CP]\d{8}$/, '');
    }

    const expiry = trade.expiry
      ? new Date(trade.expiry).toLocaleDateString('en-US', {
          month: '2-digit', day: '2-digit',
        })
      : '';

    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/New_York',
    });

    const targets: any[] = Array.isArray(trade.targets) ? trade.targets : [];
    const t1: number | null = safeNum(targets[0]?.level ?? targets[0]?.price) || null;
    const stop: number | null = safeNum(trade.stoploss?.level ?? trade.stoploss?.price) || null;

    // ── Color palette ─────────────────────────────────────────────────────────
    const BG         = '#080C10';
    const CARD       = '#0D1319';
    const DIVIDER    = '#151E28';
    const LABEL      = '#4A6580';
    const MUTED      = '#2A3A4A';
    const WHITE      = '#E8F0F8';
    const TEAL       = '#00D4A8';
    const RED        = '#FF4D4D';
    const GOLD       = '#F5A623';
    const GREEN      = '#27C76F';

    // Per-card accent
    const accentColor = isNewHigh ? GOLD : (isCall ? TEAL : RED);
    const labelText   = isNewHigh
      ? '🚀 NEW HIGH ALERT | قمة جديدة'
      : isCall
        ? '🎯 NEW TRADE | صفقة جديدة — CALL'
        : '🎯 NEW TRADE | صفقة جديدة — PUT';

    // ── Main display price ────────────────────────────────────────────────────
    const dispPrice   = isNewHigh ? (newHighPrice ?? highSince) : entryPrice;
    const gainPct     = entryPrice > 0 ? ((dispPrice - entryPrice) / entryPrice) * 100 : 0;
    const gainUsd     = (dispPrice - entryPrice) * qty * 100;

    // Change line
    const changeSign  = gainPct >= 0 ? '+' : '';
    const changeColor = gainPct >= 0 ? GREEN : RED;
    const changeLine  = isNewHigh
      ? `▲ +${fmt(dispPrice - entryPrice)} +${fmt(gainPct)}%`
      : '⬤ ENTRY';

    // Right-column stats
    type StatRow = { label: string; value: string; valueColor?: string };
    const stats: StatRow[] = isNewHigh
      ? [
          { label: 'Entry',   value: `$${fmt(entryPrice)}` },
          { label: 'High',    value: `$${fmt(dispPrice)}`,   valueColor: GOLD },
          { label: 'Gain',    value: `+$${fmt(gainUsd)}`,    valueColor: GREEN },
          ...(t1 !== null ? [{ label: 'Target', value: `$${fmt(t1)}` }] : []),
          ...(oi > 0       ? [{ label: 'Open Int.', value: compactNum(oi) }] : []),
        ]
      : [
          { label: 'Mid',      value: bid > 0 && ask > 0 ? `$${fmt((bid + ask) / 2)}` : `$${fmt(entryPrice)}` },
          { label: 'Open Int.', value: oi > 0 ? compactNum(oi) : '—' },
          { label: 'Volume',   value: vol > 0 ? compactNum(vol) : '—' },
          ...(t1 !== null    ? [{ label: 'Target 1', value: `$${fmt(t1)}` }] : []),
          ...(stop !== null  ? [{ label: 'Stop',    value: `$${fmt(stop)}` }] : []),
        ];

    // ── Render ────────────────────────────────────────────────────────────────
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            background: BG,
            fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif',
          }}
        >
          {/* Top accent strip */}
          <div style={{ height: 4, background: accentColor, width: '100%', display: 'flex' }} />

          {/* Header */}
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '28px 48px 20px',
            }}
          >
            {/* Left: ticker + contract */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: WHITE, letterSpacing: '-0.5px' }}>
                  {sym}
                </span>
                {strike > 0 && (
                  <span style={{ fontSize: 30, fontWeight: 800, color: accentColor, letterSpacing: '-0.5px' }}>
                    ${strike.toLocaleString()}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 15, color: LABEL, fontWeight: 500 }}>
                {expiry ? `${expiry} (W)` : ''}{expiry && optType ? ' ' : ''}{optType.toUpperCase()}{qty > 1 ? ` × ${qty}` : ''}
              </span>
            </div>

            {/* Right: alert label */}
            <div
              style={{
                background: CARD,
                border: `1px solid ${accentColor}40`,
                borderRadius: 8,
                padding: '8px 18px',
                color: accentColor,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {labelText}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: DIVIDER, margin: '0 48px', display: 'flex' }} />

          {/* Body */}
          <div style={{ display: 'flex', flex: 1, padding: '28px 48px 0' }}>

            {/* Left: big price */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span
                style={{
                  fontSize: 18, fontWeight: 600, color: LABEL,
                  letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6,
                }}
              >
                {isNewHigh ? 'Contract High' : 'Entry Price'}
              </span>

              <span
                style={{
                  fontSize: 100, fontWeight: 900, color: accentColor,
                  lineHeight: 1, letterSpacing: '-3px',
                }}
              >
                {fmt(dispPrice)}
              </span>

              {/* Change line */}
              <span
                style={{
                  fontSize: 28, fontWeight: 700,
                  color: isNewHigh ? changeColor : LABEL,
                  marginTop: 10,
                }}
              >
                {changeLine}
              </span>

              {isNewHigh && (
                <span style={{ fontSize: 16, color: LABEL, marginTop: 6 }}>
                  +${fmt(gainUsd)} per lot · Analyst: {(trade.author as any)?.full_name ?? 'Analyst'}
                </span>
              )}
            </div>

            {/* Vertical separator */}
            <div style={{ width: 1, background: DIVIDER, margin: '0 48px', display: 'flex' }} />

            {/* Right: stats */}
            <div
              style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                minWidth: 220, gap: 0,
              }}
            >
              {stats.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: i < stats.length - 1 ? `1px solid ${MUTED}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 15, color: LABEL, fontWeight: 500 }}>{row.label}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: row.valueColor ?? WHITE }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 48px 28px',
              borderTop: `1px solid ${DIVIDER}`,
              marginTop: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: WHITE }}>{underlyingSymbol}</span>
              {underlyingPrice > 0 && (
                <>
                  <span style={{ fontSize: 16, color: WHITE }}>{fmt(underlyingPrice)}</span>
                  <span
                    style={{
                      fontSize: 15, fontWeight: 600,
                      color: underlyingChg >= 0 ? GREEN : RED,
                    }}
                  >
                    {underlyingChg >= 0 ? '+' : ''}{fmt(underlyingChg)}%
                  </span>
                </>
              )}
            </div>
            <span style={{ fontSize: 14, color: LABEL }}>
              {isNewHigh ? 'Peak Alert' : 'Open'},{timeStr} ET · analyzinghub
            </span>
          </div>
        </div>
      ),
      { width: 900, height: 480 }
    );
  } catch (error: any) {
    console.error('[generate-image] Error:', error?.message);
    return new Response(
      JSON.stringify({ error: error?.message ?? 'Image generation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
