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
 * Uses `nodejs` runtime for maximum compatibility on Netlify.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Design tokens ─────────────────────────────────────────────────────────
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
  callBg: 'rgba(63,185,80,0.10)',
  putBg: 'rgba(248,81,73,0.10)',
  callBd: 'rgba(63,185,80,0.28)',
  putBd: 'rgba(248,81,73,0.28)',
  goldBg: 'rgba(227,179,65,0.12)',
  goldBd: 'rgba(227,179,65,0.30)',
  blueBg: 'rgba(88,166,255,0.10)',
  blueBd: 'rgba(88,166,255,0.28)',
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────
function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtPrice(n: number): string {
  return n.toFixed(2);
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
    const accent = isCall ? C.call : C.put;
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
      const gainPct = entryPrice > 0 ? ((dispHigh - entryPrice) / entryPrice) * 100 : 0;
      const gainUsd = (dispHigh - entryPrice) * qty * 100;

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
            {/* Top accent bar — gold */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 6,
                background: C.gold,
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '52px 64px 44px',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 40,
                }}
              >
                <div
                  style={{
                    background: C.goldBg,
                    border: `1px solid ${C.goldBd}`,
                    borderRadius: 8,
                    padding: '6px 16px',
                    color: C.gold,
                    fontSize: 19,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  AnalyzingHub
                </div>
                <div
                  style={{
                    background: C.goldBg,
                    border: `1px solid ${C.goldBd}`,
                    borderRadius: 8,
                    padding: '8px 20px',
                    color: C.gold,
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                  }}
                >
                  🚀 NEW HIGH ALERT
                </div>
              </div>

              {/* Symbol + contract */}
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 80,
                    fontWeight: 900,
                    color: C.text,
                    lineHeight: 1,
                    letterSpacing: '-2px',
                  }}
                >
                  {sym}
                </div>
                {strike > 0 && (
                  <div
                    style={{
                      fontSize: 26,
                      color: C.textSub,
                      marginTop: 8,
                      fontWeight: 500,
                    }}
                  >
                    ${strike.toLocaleString()} {isCall ? 'Call' : 'Put'}
                    {expiry ? ` · ${expiry}` : ''}
                  </div>
                )}
              </div>

              {/* Big price */}
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 32 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: C.textMuted,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  New High Price
                </div>
                <div
                  style={{
                    fontSize: 100,
                    fontWeight: 900,
                    color: C.gold,
                    lineHeight: 1,
                    letterSpacing: '-3px',
                  }}
                >
                  ${fmtPrice(dispHigh)}
                </div>
              </div>

              {/* Stat row */}
              <div style={{ display: 'flex', gap: 18 }}>
                <div
                  style={{
                    flex: 1,
                    background: C.elevated,
                    borderRadius: 14,
                    padding: '20px 22px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Entry
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: C.textSub }}>
                    ${fmtPrice(entryPrice)}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: C.goldBg,
                    borderRadius: 14,
                    padding: '20px 22px',
                    border: `1px solid ${C.goldBd}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Gain
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: C.gold }}>
                    +{gainPct.toFixed(2)}%
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: C.goldBg,
                    borderRadius: 14,
                    padding: '20px 22px',
                    border: `1px solid ${C.goldBd}`,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    P/L (1 lot)
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: C.gold }}>
                    +${gainUsd.toFixed(0)}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 20,
                  marginTop: 'auto',
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{ fontSize: 18, fontWeight: 700, color: C.textSub }}
                  >
                    {underlyingSymbol}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: underlyingChangePct >= 0 ? C.call : C.put,
                    }}
                  >
                    ${fmtPrice(underlyingPrice)}{' '}
                    {underlyingChangePct >= 0 ? '▲' : '▼'}
                    {Math.abs(underlyingChangePct).toFixed(2)}%
                  </div>
                </div>
                <div style={{ fontSize: 17, color: C.textMuted }}>
                  {analystName} · {timeStr} ET
                </div>
              </div>
            </div>
          </div>
        ),
        { width: 1200, height: 675 }
      );
    }

    // ── NEW TRADE card ────────────────────────────────────────────────────────
    console.log('[generate-image] Rendering NEW TRADE card, sym:', sym);

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            background: C.bg,
            fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top accent bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 5,
              background: accent,
            }}
          />

          {/* LEFT PANEL */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 460,
              padding: '52px 36px 40px 56px',
              borderRight: `1px solid ${C.border}`,
            }}
          >
            {/* Branding + direction */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 34,
              }}
            >
              <div
                style={{
                  background: accentBg,
                  border: `1px solid ${accentBd}`,
                  borderRadius: 7,
                  padding: '5px 14px',
                  color: accent,
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                AnalyzingHub
              </div>
              <div
                style={{
                  background: accentBg,
                  border: `1px solid ${accentBd}`,
                  borderRadius: 7,
                  padding: '7px 16px',
                  color: accent,
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: '0.09em',
                }}
              >
                {isCall ? 'CALL' : 'PUT'}
              </div>
            </div>

            {/* Symbol */}
            <div
              style={{
                fontSize: 84,
                fontWeight: 900,
                color: C.text,
                lineHeight: 1,
                letterSpacing: '-2px',
                marginBottom: 8,
              }}
            >
              {sym}
            </div>

            {/* Strike + expiry (options) or direction (stock) */}
            {strike > 0 ? (
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: accent,
                    marginBottom: 4,
                  }}
                >
                  ${strike.toLocaleString()}
                </div>
                <div style={{ fontSize: 20, color: C.textSub }}>
                  {isCall ? 'Call' : 'Put'}
                  {expiry ? ` · Exp ${expiry}` : ''}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 28,
                  color: C.textSub,
                  marginBottom: 24,
                }}
              >
                {isCall ? 'Long' : 'Short'} Position
              </div>
            )}

            {/* Entry price */}
            <div
              style={{
                background: C.elevated,
                borderRadius: 14,
                padding: '20px 22px',
                border: `1px solid ${C.border}`,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: C.textMuted,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Entry Price
              </div>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  color: C.text,
                  lineHeight: 1,
                }}
              >
                ${fmtPrice(entryPrice)}
              </div>
              <div style={{ fontSize: 14, color: C.textMuted, marginTop: 6 }}>
                {qty} contract{qty !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Underlying index */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: C.elevated,
                borderRadius: 12,
                padding: '13px 18px',
                border: `1px solid ${C.border}`,
                marginTop: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.textSub,
                }}
              >
                {underlyingSymbol}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: underlyingChangePct >= 0 ? C.call : C.put,
                }}
              >
                ${fmtPrice(underlyingPrice)}{' '}
                {underlyingChangePct >= 0 ? '▲' : '▼'}
                {Math.abs(underlyingChangePct).toFixed(2)}%
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '52px 52px 40px 40px',
            }}
          >
            {/* Status badge */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  background: C.blueBg,
                  border: `1px solid ${C.blueBd}`,
                  borderRadius: 8,
                  padding: '7px 18px',
                  color: C.blue,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                }}
              >
                ● {statusLabel}
              </div>
            </div>

            {/* Targets + Stop */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t1 !== null && (
                <div
                  style={{
                    background: C.callBg,
                    borderRadius: 14,
                    padding: '16px 22px',
                    border: `1px solid ${C.callBd}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Target 1
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: C.call }}>
                    ${fmtPrice(t1)}
                  </div>
                </div>
              )}

              {t2 !== null && (
                <div
                  style={{
                    background: 'rgba(63,185,80,0.06)',
                    borderRadius: 14,
                    padding: '16px 22px',
                    border: 'rgba(63,185,80,0.20) 1px solid',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Target 2
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: C.call }}>
                    ${fmtPrice(t2)}
                  </div>
                </div>
              )}

              {t1 === null && t2 === null && (
                <div
                  style={{
                    background: C.elevated,
                    borderRadius: 14,
                    padding: '16px 22px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: 15, color: C.textMuted }}>
                    Targets not yet set
                  </div>
                </div>
              )}

              {stop !== null && (
                <div
                  style={{
                    background: C.putBg,
                    borderRadius: 14,
                    padding: '16px 22px',
                    border: `1px solid ${C.putBd}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Stop Loss
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: C.put }}>
                    ${fmtPrice(stop)}
                  </div>
                </div>
              )}

              {/* Current price delta (only if meaningful movement since entry) */}
              {Math.abs(pricePct) > 0.2 && (
                <div
                  style={{
                    background: C.elevated,
                    borderRadius: 14,
                    padding: '16px 22px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textMuted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Current
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 800,
                        color: pricePct >= 0 ? C.call : C.put,
                      }}
                    >
                      ${fmtPrice(currentPrice)}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: pricePct >= 0 ? C.call : C.put,
                      }}
                    >
                      ({pricePct >= 0 ? '+' : ''}{pricePct.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Analyst + timestamp */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 18,
                borderTop: `1px solid ${C.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: C.textMuted,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  Analyst
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>
                  {analystName}
                </div>
              </div>
              <div style={{ fontSize: 16, color: C.textMuted }}>
                {timeStr} ET
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 675 }
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
