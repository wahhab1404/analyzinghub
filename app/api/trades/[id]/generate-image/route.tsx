/**
 * GET /api/trades/[id]/generate-image
 *
 * Renders a professional PNG alert card for a trade from the `trades` table.
 * Supports both stock and option trades.
 * Called by broadcast/send-update routes to attach an inline photo to Telegram.
 *
 * Query params:
 *   event=new        — "New Trade" card  (default)
 *   event=new_high   — "New High" update card
 *   event=target_hit — "Target Hit" card
 *   event=stop_hit   — "Stop Loss Hit" card
 *   price=12.50      — current/high price to display
 *   target_index=0   — which target was hit (0-based)
 *
 * Canvas: 1000×560 — optimal for Telegram inline photo preview.
 */

import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Design tokens ────────────────────────────────────────────────────────────
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
  long:     '#27C76F',
  short:    '#F03E3E',
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

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
function fmt(n: number, d = 2): string { return n.toFixed(d); }

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tradeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const event      = searchParams.get('event') ?? 'new';
    const priceParam = searchParams.get('price');
    const tgtIdx     = safeNum(searchParams.get('target_index') ?? '0');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return new Response('Missing env vars', { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch trade + option details + author
    const { data: trade, error } = await supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name),
        analysis:analyses!analysis_id(id, title),
        option_details:option_trade_details(*)
      `)
      .eq('id', tradeId)
      .single();

    if (error || !trade) {
      return new Response('Trade not found', { status: 404 });
    }

    const isOption  = trade.trade_type === 'option';
    const od        = trade.option_details as any;
    const direction = (trade.direction as string).toLowerCase();
    const isCall    = direction === 'call';
    const isBull    = direction === 'long' || direction === 'call';

    const accent   = isBull ? C.call  : C.put;
    const accentBg = isBull ? C.callBg : C.putBg;
    const accentBd = isBull ? C.callBd : C.putBd;

    const symbol       = isOption ? (od?.underlying_symbol ?? trade.symbol) : trade.symbol;
    const entryPrice   = isOption ? safeNum(od?.entry_premium)   : safeNum(trade.entry_price);
    const stopLoss     = safeNum(trade.stop_loss);
    const targets: any[] = Array.isArray(trade.targets) ? trade.targets : [];
    const analystName  = (trade.author as any)?.full_name ?? 'Analyst';

    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });

    // Current price: from query param (live), or stored value
    const currentPrice = priceParam
      ? safeNum(priceParam)
      : safeNum(isOption ? od?.current_premium : trade.current_price, entryPrice);

    const highPrice = isOption
      ? safeNum(od?.highest_premium_since_entry, currentPrice)
      : safeNum(trade.highest_price_since_entry, currentPrice);

    const dispHigh = event === 'new_high' ? (priceParam ? safeNum(priceParam) : highPrice) : highPrice;
    const gainPct  = entryPrice > 0 ? ((dispHigh - entryPrice) / entryPrice) * 100 : 0;
    const gainUsd  = isOption
      ? (dispHigh - entryPrice) * safeNum(od?.quantity, 1) * safeNum(od?.contract_multiplier, 100)
      : (dispHigh - entryPrice);

    // Targets row for display
    const t1 = targets[0]?.price ? safeNum(targets[0].price) : null;
    const t2 = targets[1]?.price ? safeNum(targets[1].price) : null;

    // Option extra info
    const strike   = safeNum(od?.strike_price);
    const expiry   = od?.expiration_date
      ? new Date(od.expiration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
      : '';

    // ── NEW HIGH card ──────────────────────────────────────────────────────────
    if (event === 'new_high') {
      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'system-ui,-apple-system,Helvetica,Arial,sans-serif', position: 'relative', overflow: 'hidden' }}>
            {/* Gold accent bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg,${C.gold} 0%,#FFD26F 50%,${C.gold} 100%)` }} />
            <div style={{ position: 'absolute', top: -120, left: -80, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,166,35,0.08) 0%,transparent 70%)' }} />

            <div style={{ display: 'flex', flex: 1, padding: '36px 52px 32px', flexDirection: 'column' }}>
              {/* Top row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 6, padding: '5px 14px', color: C.gold, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em' }}>ANALYZINGHUB</div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 14px', color: C.textSub, fontSize: 14, fontWeight: 600 }}>
                    {symbol}{isOption && strike > 0 ? ` $${strike.toLocaleString()} ${isCall ? 'C' : 'P'}${expiry ? ' ' + expiry : ''}` : ''}
                  </div>
                  <div style={{ background: accentBg, border: `1px solid ${accentBd}`, borderRadius: 6, padding: '5px 14px', color: accent, fontSize: 14, fontWeight: 700 }}>
                    {isBull ? '▲' : '▼'} {direction.toUpperCase()}
                  </div>
                </div>
                <div style={{ background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 7, padding: '7px 18px', color: C.gold, fontSize: 16, fontWeight: 800, letterSpacing: '0.06em' }}>
                  🚀 قمة جديدة | NEW HIGH
                </div>
              </div>

              {/* Main row */}
              <div style={{ display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' }}>
                {/* Left: big price */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 280 }}>
                  <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {isOption ? 'أعلى قسط | Contract High' : 'أعلى سعر | Price High'}
                  </div>
                  <div style={{ fontSize: 96, fontWeight: 900, color: C.gold, lineHeight: 1, letterSpacing: '-3px' }}>${fmt(dispHigh)}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: C.call, marginTop: 6, letterSpacing: '-0.5px' }}>+{gainPct.toFixed(1)}%</div>
                  <div style={{ fontSize: 18, color: C.textMuted, marginTop: 4 }}>
                    {isOption ? `+$${gainUsd.toFixed(0)} per lot` : `+$${gainUsd.toFixed(2)} gain`}
                  </div>
                </div>

                {/* Right: metrics */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 10, marginTop: 8 }}>
                  <MetricBox label={isOption ? 'الدخول | Entry Premium' : 'الدخول | Entry'} value={`$${fmt(entryPrice)}`} />
                  <MetricBox label="أعلى مكسب | Max Gain" value={`+${gainPct.toFixed(2)}%`} highlight color={C.gold} />
                  <MetricBox label={`ربح ${isOption ? '(1 lot)' : ''} | P/L`} value={`+$${gainUsd.toFixed(isOption ? 0 : 2)}`} highlight color={C.call} />
                  {t1 !== null && <MetricBox label="الهدف الأول | Target 1" value={`$${fmt(t1)}`} />}
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginTop: 16, borderTop: `1px solid ${C.divider}` }}>
                <div style={{ fontSize: 14, color: C.textSub, fontWeight: 600 }}>{analystName}</div>
                <div style={{ fontSize: 13, color: C.textMuted }}>{timeStr} ET</div>
              </div>
            </div>
          </div>
        ),
        { width: 1000, height: 560 }
      );
    }

    // ── TARGET HIT card ────────────────────────────────────────────────────────
    if (event === 'target_hit') {
      const target = targets[tgtIdx];
      const tPrice = target ? safeNum(target.price) : currentPrice;
      const tLabel = target?.label ?? `TP${tgtIdx + 1}`;
      const tPct   = entryPrice > 0 ? ((tPrice - entryPrice) / entryPrice) * 100 : 0;
      const hitCount = targets.filter((t: any) => t.hit).length;

      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'system-ui,-apple-system,Helvetica,Arial,sans-serif', position: 'relative', overflow: 'hidden' }}>
            {/* Green accent bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg,${C.call} 0%,#5EEAA8 50%,${C.call} 100%)` }} />
            <div style={{ position: 'absolute', top: -100, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(39,199,111,0.08) 0%,transparent 70%)' }} />

            <div style={{ display: 'flex', flex: 1, padding: '32px 52px', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 6, padding: '5px 14px', color: C.gold, fontSize: 14, fontWeight: 700 }}>ANALYZINGHUB</div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 14px', color: C.textSub, fontSize: 14, fontWeight: 600 }}>
                    {symbol}{isOption && strike > 0 ? ` $${strike.toLocaleString()} ${isCall ? 'C' : 'P'}` : ''}
                  </div>
                </div>
                <div style={{ background: C.callBg, border: `1px solid ${C.callBd}`, borderRadius: 7, padding: '7px 20px', color: C.call, fontSize: 16, fontWeight: 800 }}>
                  🎯 تحقق الهدف | TARGET HIT
                </div>
              </div>

              <div style={{ display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' }}>
                {/* Left: hit target */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 300 }}>
                  <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>✅ {tLabel}</div>
                  <div style={{ fontSize: 88, fontWeight: 900, color: C.call, lineHeight: 1, letterSpacing: '-2px' }}>${fmt(tPrice)}</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: C.call, marginTop: 8 }}>+{tPct.toFixed(1)}%</div>
                  <div style={{ fontSize: 16, color: C.textSub, marginTop: 6 }}>
                    أهداف محققة | Targets Hit: {hitCount}/{targets.length}
                  </div>
                </div>

                {/* Right: stats */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 10, marginTop: 8 }}>
                  <MetricBox label={isOption ? 'الدخول | Entry Premium' : 'الدخول | Entry'} value={`$${fmt(entryPrice)}`} />
                  <MetricBox label="الحالي | Current" value={`$${fmt(currentPrice)}`} highlight color={C.call} />
                  <MetricBox label="أعلى سعر | High" value={`$${fmt(highPrice)}`} highlight color={C.gold} />
                  {stopLoss > 0 && <MetricBox label="الوقف | Stop" value={`$${fmt(stopLoss)}`} color={C.put} />}
                  {/* Remaining targets */}
                  {targets.filter((t: any) => !t.hit).slice(0, 2).map((t: any, i: number) => (
                    <MetricBox key={i} label={`${t.label} (قادم)`} value={`$${fmt(safeNum(t.price))}`} />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 14, borderTop: `1px solid ${C.divider}` }}>
                <div style={{ fontSize: 14, color: C.textSub, fontWeight: 600 }}>{analystName}</div>
                <div style={{ fontSize: 13, color: C.textMuted }}>{timeStr} ET</div>
              </div>
            </div>
          </div>
        ),
        { width: 1000, height: 560 }
      );
    }

    // ── STOP HIT card ──────────────────────────────────────────────────────────
    if (event === 'stop_hit') {
      const stopPrice = currentPrice;
      const lossPct   = entryPrice > 0 ? ((stopPrice - entryPrice) / entryPrice) * 100 : 0;
      const hitCount  = targets.filter((t: any) => t.hit).length;

      return new ImageResponse(
        (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'system-ui,-apple-system,Helvetica,Arial,sans-serif', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg,${C.put} 0%,#FF7070 50%,${C.put} 100%)` }} />
            <div style={{ position: 'absolute', top: -100, left: -60, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(240,62,62,0.08) 0%,transparent 70%)' }} />

            <div style={{ display: 'flex', flex: 1, padding: '32px 52px', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 6, padding: '5px 14px', color: C.gold, fontSize: 14, fontWeight: 700 }}>ANALYZINGHUB</div>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 14px', color: C.textSub, fontSize: 14, fontWeight: 600 }}>{symbol}</div>
                </div>
                <div style={{ background: C.putBg, border: `1px solid ${C.putBd}`, borderRadius: 7, padding: '7px 20px', color: C.put, fontSize: 16, fontWeight: 800 }}>
                  🛑 وقف الخسارة | STOP LOSS
                </div>
              </div>

              <div style={{ display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 280 }}>
                  <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>سعر الإغلاق | Close Price</div>
                  <div style={{ fontSize: 88, fontWeight: 900, color: C.put, lineHeight: 1, letterSpacing: '-2px' }}>${fmt(stopPrice)}</div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: C.put, marginTop: 8 }}>{lossPct.toFixed(1)}%</div>
                  {hitCount > 0 && (
                    <div style={{ fontSize: 16, color: C.call, marginTop: 6 }}>✅ أهداف محققة | {hitCount}/{targets.length} Targets Hit</div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 10, marginTop: 8 }}>
                  <MetricBox label={isOption ? 'الدخول | Entry Premium' : 'الدخول | Entry'} value={`$${fmt(entryPrice)}`} />
                  <MetricBox label="أعلى سعر | Highest" value={`$${fmt(highPrice)}`} color={C.gold} />
                  {stopLoss > 0 && <MetricBox label="الوقف | Stop Level" value={`$${fmt(stopLoss)}`} highlight color={C.put} />}
                  <MetricBox label="الحالة | Status" value="STOPPED 🛑" highlight color={C.put} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 14, borderTop: `1px solid ${C.divider}` }}>
                <div style={{ fontSize: 14, color: C.textSub, fontWeight: 600 }}>{analystName}</div>
                <div style={{ fontSize: 13, color: C.textMuted }}>{timeStr} ET</div>
              </div>
            </div>
          </div>
        ),
        { width: 1000, height: 560 }
      );
    }

    // ── NEW TRADE card (default) ───────────────────────────────────────────────
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'system-ui,-apple-system,Helvetica,Arial,sans-serif', position: 'relative', overflow: 'hidden' }}>
          {/* Accent bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: accent }} />
          <div style={{ position: 'absolute', top: -100, left: -60, width: 420, height: 420, borderRadius: '50%', background: isBull ? 'radial-gradient(circle,rgba(39,199,111,0.07) 0%,transparent 70%)' : 'radial-gradient(circle,rgba(240,62,62,0.07) 0%,transparent 70%)' }} />

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 48px 14px', marginTop: 5 }}>
            <div style={{ background: accentBg, border: `1px solid ${accentBd}`, borderRadius: 6, padding: '5px 13px', color: accent, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>ANALYZINGHUB</div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>{symbol}</div>
                {isOption && strike > 0 && <div style={{ fontSize: 26, fontWeight: 800, color: accent }}>${strike.toLocaleString()}</div>}
                <div style={{ background: accentBg, border: `1px solid ${accentBd}`, borderRadius: 6, padding: '3px 10px', color: accent, fontSize: 14, fontWeight: 800 }}>
                  {isBull ? '▲' : '▼'} {direction.toUpperCase()}
                </div>
              </div>
              {isOption && expiry && <div style={{ fontSize: 13, color: C.textMuted }}>Expires {expiry}</div>}
            </div>

            <div style={{ background: C.blueBg, border: `1px solid ${C.blueBd}`, borderRadius: 7, padding: '6px 16px', color: C.blue, fontSize: 13, fontWeight: 700 }}>
              ● صفقة جديدة | NEW TRADE
            </div>
          </div>

          <div style={{ height: 1, background: C.divider, margin: '0 48px' }} />

          {/* Body */}
          <div style={{ display: 'flex', flex: 1 }}>
            {/* Left panel */}
            <div style={{ display: 'flex', flexDirection: 'column', width: 460, padding: '20px 32px 28px 48px', borderRight: `1px solid ${C.divider}` }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>
                  {isOption ? 'الدخول | Entry Premium' : 'الدخول | Entry Price'}
                </div>
                <div style={{ fontSize: 82, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-2.5px' }}>${fmt(entryPrice)}</div>
                {isOption && od && (
                  <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                    {safeNum(od.quantity, 1)} contract{safeNum(od.quantity, 1) !== 1 ? 's' : ''} · ${(entryPrice * safeNum(od.quantity, 1) * safeNum(od.contract_multiplier, 100)).toFixed(0)} total
                  </div>
                )}
              </div>

              {/* Stop loss */}
              {stopLoss > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.putBg, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.putBd}`, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    وقف الخسارة | Stop Loss
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: C.put }}>${fmt(stopLoss)}</div>
                </div>
              )}

              {/* Option: strike / expiry boxes */}
              {isOption && strike > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>الإضراب | Strike</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.textSub }}>${strike.toLocaleString()}</div>
                  </div>
                  {expiry && (
                    <div style={{ flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>الانتهاء | Expiry</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.textSub }}>{expiry}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right panel: targets + stop */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 44px 28px 32px' }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                الأهداف | Targets
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {targets.slice(0, 4).map((t: any, i: number) => {
                  const tprice = safeNum(t.price);
                  return (
                    <div key={i} style={{ background: t.hit ? C.callBg : C.card, borderRadius: 10, padding: '12px 18px', border: `1px solid ${t.hit ? C.callBd : C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: t.hit ? C.call : C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        {t.hit ? '✅ ' : ''}{t.label ?? `TP${i + 1}`}
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: t.hit ? C.call : accent }}>${fmt(tprice)}</div>
                    </div>
                  );
                })}
                {targets.length === 0 && (
                  <div style={{ background: C.card, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 14, color: C.textMuted }}>No targets set</div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>المحلل | Analyst</div>
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

  } catch (err: any) {
    console.error('[generate-image/trades]', err?.message);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}

// ─── JSX helper (inline, avoids import) ──────────────────────────────────────
function MetricBox({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: highlight ? 'rgba(59,158,255,0.07)' : '#111720', borderRadius: 10, padding: '12px 18px', border: `1px solid ${highlight ? 'rgba(59,158,255,0.2)' : '#1E2A38'}` }}>
      <div style={{ fontSize: 11, color: '#4D6278', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? '#E8EFF7' }}>{value}</div>
    </div>
  );
}
