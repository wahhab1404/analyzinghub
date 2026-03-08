/**
 * GET /api/indices/trades/[id]/snapshot-html
 *
 * Returns a standalone HTML page rendering the trade alert card.
 * Used as a web preview and by screenshot services.
 * Dark, Webull-inspired professional design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[snapshot-html] Missing environment variables');
      return new NextResponse('Configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { id: tradeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const isNewHigh = searchParams.get('isNewHigh') === 'true';
    const rawHP = searchParams.get('newHighPrice');
    const newHighPrice = rawHP ? safeNum(rawHP) : null;

    console.log('[snapshot-html] Trade:', tradeId, { isNewHigh, newHighPrice });

    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select('*, author:profiles!author_id(id, full_name)')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return new NextResponse('Trade not found', { status: 404 });
    }

    let analysis: { id: string; title: string; index_symbol: string } | null = null;
    if (trade.analysis_id) {
      const { data } = await supabase
        .from('index_analyses')
        .select('id, title, index_symbol')
        .eq('id', trade.analysis_id)
        .maybeSingle();
      analysis = data;
    }

    // ── Derived values ────────────────────────────────────────────────────────
    const snap = trade.entry_contract_snapshot ?? {};
    const entryPrice = safeNum(snap.price ?? snap.mid ?? snap.last);
    const currentPrice = safeNum(trade.current_contract, entryPrice);
    const highSince = safeNum(trade.contract_high_since, currentPrice);
    const lowSince = safeNum(trade.contract_low_since, currentPrice);
    const priceChange = currentPrice - entryPrice;
    const priceChangePct = entryPrice > 0 ? (priceChange / entryPrice) * 100 : 0;

    const qty = safeNum(trade.qty, 1) || 1;
    const multiplier = safeNum(trade.contract_multiplier, 100) || 100;
    const netPnl = priceChange * multiplier * qty;

    const underlyingSymbol = analysis?.index_symbol ?? trade.underlying_index_symbol ?? 'SPX';
    const underlyingPrice = safeNum(trade.current_underlying ?? trade.entry_underlying_snapshot?.price);
    const underlyingEntry = safeNum(trade.entry_underlying_snapshot?.price, underlyingPrice);
    const underlyingChangePct = underlyingEntry > 0
      ? ((underlyingPrice - underlyingEntry) / underlyingEntry) * 100 : 0;

    const currentSnap = trade.current_contract_snapshot ?? trade.entry_contract_snapshot ?? {};
    const bid = safeNum(currentSnap.bid);
    const ask = safeNum(currentSnap.ask);
    const openInterest = safeNum(currentSnap.open_interest);
    const volume = safeNum(currentSnap.volume);

    const strike = safeNum(trade.strike);
    const optionType = (trade.option_type ?? trade.direction ?? 'call').toLowerCase();
    const isCall = optionType === 'call';
    const expiry = trade.expiry ?? new Date().toISOString();

    const targets: any[] = Array.isArray(trade.targets) ? trade.targets : [];
    const t1: number | null = safeNum(targets[0]?.level ?? targets[0]?.price) || null;
    const t2: number | null = safeNum(targets[1]?.level ?? targets[1]?.price) || null;
    const stop: number | null = safeNum(trade.stoploss?.level ?? trade.stoploss?.price) || null;

    const analystName: string = (trade.author as any)?.full_name ?? 'Analyst';
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });

    let sym = underlyingSymbol;
    if (trade.polygon_option_ticker) {
      const parts = (trade.polygon_option_ticker as string).split(':');
      if (parts.length > 1) sym = parts[1].replace(/\d{6}[CP]\d{8}$/, '');
    }

    const fmtExpiry = (d: string) => new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: '2-digit',
    });

    const accent = isCall ? '#3FB950' : '#F85149';
    const accentBg = isCall ? 'rgba(63,185,80,0.10)' : 'rgba(248,81,73,0.10)';
    const accentBd = isCall ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)';
    const priceColor = priceChange > 0 ? '#3FB950' : priceChange < 0 ? '#F85149' : '#8B949E';
    const pnlColor = netPnl >= 0 ? '#3FB950' : '#F85149';

    // ── NEW HIGH template ─────────────────────────────────────────────────────
    if (isNewHigh) {
      const dispHigh = newHighPrice ?? highSince;
      const gainPct = entryPrice > 0 ? ((dispHigh - entryPrice) / entryPrice) * 100 : 0;
      const gainUsd = (dispHigh - entryPrice) * qty * multiplier;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica',sans-serif;
      background:#0D1117;
      width:1200px;height:675px;overflow:hidden;position:relative;
      display:flex;flex-direction:column;
    }
    .accent-bar{position:absolute;top:0;left:0;right:0;height:5px;background:#E3B341}
    .inner{display:flex;flex-direction:column;flex:1;padding:52px 64px 44px}
    .row{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}
    .badge{background:rgba(227,179,65,0.12);border:1px solid rgba(227,179,65,0.30);border-radius:7px;
           padding:6px 16px;color:#E3B341;font-size:19px;font-weight:700;letter-spacing:.06em}
    .alert-badge{background:rgba(227,179,65,0.12);border:1px solid rgba(227,179,65,0.30);border-radius:7px;
                 padding:8px 20px;color:#E3B341;font-size:20px;font-weight:800;letter-spacing:.05em}
    .sym{font-size:80px;font-weight:900;color:#E6EDF3;line-height:1;letter-spacing:-2px}
    .contract{font-size:26px;color:#8B949E;margin-top:8px;font-weight:500}
    .label{font-size:12px;color:#6E7681;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
    .high-price{font-size:100px;font-weight:900;color:#E3B341;line-height:1;letter-spacing:-3px;margin-bottom:32px}
    .stat-grid{display:flex;gap:18px;margin-bottom:auto}
    .stat-box{flex:1;border-radius:14px;padding:20px 22px;display:flex;flex-direction:column}
    .stat-box.neutral{background:#1C2128;border:1px solid #30363D}
    .stat-box.gold{background:rgba(227,179,65,0.12);border:1px solid rgba(227,179,65,0.30)}
    .stat-val{font-size:30px;font-weight:700}
    .stat-val.muted{color:#8B949E}
    .stat-val.gold{color:#E3B341;font-weight:800}
    .footer{display:flex;justify-content:space-between;align-items:center;
            padding-top:20px;margin-top:24px;border-top:1px solid #30363D}
    .underlying{display:flex;gap:10px;align-items:center;font-size:18px;font-weight:700;color:#8B949E}
    .underlying .up{color:#3FB950;font-weight:600}
    .underlying .dn{color:#F85149;font-weight:600}
    .meta{font-size:17px;color:#6E7681}
  </style>
</head>
<body>
  <div class="accent-bar"></div>
  <div class="inner">
    <div class="row">
      <span class="badge">AnalyzingHub</span>
      <span class="alert-badge">🚀 NEW HIGH ALERT</span>
    </div>
    <div class="sym">${sym}</div>
    ${strike > 0 ? `<div class="contract">$${strike.toLocaleString()} ${isCall ? 'Call' : 'Put'}${expiry ? ` · ${fmtExpiry(expiry)}` : ''}</div>` : ''}
    <div style="margin-top:20px">
      <div class="label">New High Price</div>
      <div class="high-price">$${dispHigh.toFixed(2)}</div>
    </div>
    <div class="stat-grid">
      <div class="stat-box neutral">
        <div class="label">Entry</div>
        <div class="stat-val muted">$${entryPrice.toFixed(2)}</div>
      </div>
      <div class="stat-box gold">
        <div class="label">Gain</div>
        <div class="stat-val gold">+${gainPct.toFixed(2)}%</div>
      </div>
      <div class="stat-box gold">
        <div class="label">P/L (1 lot)</div>
        <div class="stat-val gold">+$${gainUsd.toFixed(0)}</div>
      </div>
    </div>
    <div class="footer">
      <div class="underlying">
        <span>${underlyingSymbol}</span>
        <span class="${underlyingChangePct >= 0 ? 'up' : 'dn'}">
          $${underlyingPrice.toFixed(2)} ${underlyingChangePct >= 0 ? '▲' : '▼'}${Math.abs(underlyingChangePct).toFixed(2)}%
        </span>
      </div>
      <div class="meta">${analystName} · ${timeStr} ET</div>
    </div>
  </div>
</body>
</html>`;

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // ── NEW TRADE template ────────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica',sans-serif;
      background:#0D1117;
      width:1200px;height:675px;overflow:hidden;position:relative;
      display:flex;
    }
    .accent-bar{position:absolute;top:0;left:0;right:0;height:5px;background:${accent}}
    /* LEFT */
    .left{width:460px;display:flex;flex-direction:column;padding:52px 36px 40px 56px;
          border-right:1px solid #30363D}
    .hrow{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}
    .brand{background:${accentBg};border:1px solid ${accentBd};border-radius:7px;
           padding:5px 14px;color:${accent};font-size:17px;font-weight:700;letter-spacing:.05em}
    .dir-badge{background:${accentBg};border:1px solid ${accentBd};border-radius:7px;
               padding:7px 16px;color:${accent};font-size:17px;font-weight:800;letter-spacing:.09em}
    .sym{font-size:84px;font-weight:900;color:#E6EDF3;line-height:1;letter-spacing:-2px;margin-bottom:8px}
    .strike{font-size:36px;font-weight:700;color:${accent};margin-bottom:4px}
    .expiry{font-size:20px;color:#8B949E;margin-bottom:22px}
    .entry-box{background:#1C2128;border:1px solid #30363D;border-radius:14px;padding:20px 22px;margin-bottom:16px}
    .label{font-size:12px;color:#6E7681;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}
    .entry-price{font-size:52px;font-weight:800;color:#E6EDF3;line-height:1}
    .qty{font-size:14px;color:#6E7681;margin-top:6px}
    .underlying-row{display:flex;align-items:center;gap:10px;background:#1C2128;
                    border:1px solid #30363D;border-radius:12px;padding:13px 18px;margin-top:auto}
    .u-sym{font-size:16px;font-weight:700;color:#8B949E}
    .u-price{font-size:16px;font-weight:600;color:${underlyingChangePct >= 0 ? '#3FB950' : '#F85149'}}
    /* RIGHT */
    .right{display:flex;flex-direction:column;flex:1;padding:52px 52px 40px 40px}
    .status-row{display:flex;justify-content:flex-end;margin-bottom:26px}
    .status-badge{background:rgba(88,166,255,0.10);border:1px solid rgba(88,166,255,0.28);
                  border-radius:8px;padding:7px 18px;color:#58A6FF;font-size:15px;font-weight:700;letter-spacing:.07em}
    .targets{display:flex;flex-direction:column;gap:12px}
    .target-row{border-radius:14px;padding:16px 22px;display:flex;justify-content:space-between;align-items:center}
    .target-row.t1{background:rgba(63,185,80,0.10);border:1px solid rgba(63,185,80,0.28)}
    .target-row.t2{background:rgba(63,185,80,0.06);border:1px solid rgba(63,185,80,0.18)}
    .target-row.stop{background:rgba(248,81,73,0.10);border:1px solid rgba(248,81,73,0.28)}
    .target-row.current{background:#1C2128;border:1px solid #30363D}
    .target-row.empty{background:#1C2128;border:1px solid #30363D}
    .row-label{font-size:13px;color:#6E7681;letter-spacing:.12em;text-transform:uppercase}
    .row-val{font-size:34px;font-weight:800}
    .row-val.green{color:#3FB950}
    .row-val.red{color:#F85149}
    .row-val.neutral{color:#E6EDF3}
    .row-val .sub{font-size:18px;font-weight:600;margin-left:6px}
    .analyst-row{margin-top:auto;padding-top:18px;border-top:1px solid #30363D;
                 display:flex;justify-content:space-between;align-items:flex-end}
    .analyst-label{font-size:12px;color:#6E7681;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
    .analyst-name{font-size:24px;font-weight:700;color:#E6EDF3}
    .timestamp{font-size:16px;color:#6E7681}
  </style>
</head>
<body>
  <div class="accent-bar"></div>

  <!-- LEFT PANEL -->
  <div class="left">
    <div class="hrow">
      <span class="brand">AnalyzingHub</span>
      <span class="dir-badge">${isCall ? 'CALL' : 'PUT'}</span>
    </div>
    <div class="sym">${sym}</div>
    ${strike > 0 ? `
      <div class="strike">$${strike.toLocaleString()}</div>
      <div class="expiry">${isCall ? 'Call' : 'Put'}${expiry ? ` · Exp ${fmtExpiry(expiry)}` : ''}</div>
    ` : `<div class="expiry" style="margin-bottom:22px">${isCall ? 'Long' : 'Short'} Position</div>`}
    <div class="entry-box">
      <div class="label">Entry Price</div>
      <div class="entry-price">$${entryPrice.toFixed(2)}</div>
      <div class="qty">${qty} contract${qty !== 1 ? 's' : ''}</div>
    </div>
    <div class="underlying-row">
      <span class="u-sym">${underlyingSymbol}</span>
      <span class="u-price">$${underlyingPrice.toFixed(2)} ${underlyingChangePct >= 0 ? '▲' : '▼'}${Math.abs(underlyingChangePct).toFixed(2)}%</span>
    </div>
  </div>

  <!-- RIGHT PANEL -->
  <div class="right">
    <div class="status-row">
      <span class="status-badge">● ${(trade.status ?? 'active').toUpperCase().replace('_', ' ')}</span>
    </div>
    <div class="targets">
      ${t1 !== null ? `
        <div class="target-row t1">
          <span class="row-label">Target 1</span>
          <span class="row-val green">$${t1.toFixed(2)}</span>
        </div>` : ''}
      ${t2 !== null ? `
        <div class="target-row t2">
          <span class="row-label">Target 2</span>
          <span class="row-val green">$${t2.toFixed(2)}</span>
        </div>` : ''}
      ${t1 === null && t2 === null ? `
        <div class="target-row empty">
          <span class="row-label">Targets not yet set</span>
        </div>` : ''}
      ${stop !== null ? `
        <div class="target-row stop">
          <span class="row-label">Stop Loss</span>
          <span class="row-val red">$${stop.toFixed(2)}</span>
        </div>` : ''}
      ${bid > 0 && ask > 0 ? `
        <div class="target-row current">
          <span class="row-label">Bid / Ask</span>
          <span class="row-val neutral" style="font-size:26px">$${bid.toFixed(2)} / $${ask.toFixed(2)}</span>
        </div>` : ''}
      ${Math.abs(priceChangePct) > 0.2 ? `
        <div class="target-row current">
          <span class="row-label">Current</span>
          <div style="display:flex;align-items:baseline;gap:8px">
            <span class="row-val ${priceChangePct >= 0 ? 'green' : 'red'}">$${currentPrice.toFixed(2)}</span>
            <span style="font-size:18px;font-weight:600;color:${priceColor}">(${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%)</span>
          </div>
        </div>` : ''}
    </div>
    <div class="analyst-row">
      <div>
        <div class="analyst-label">Analyst</div>
        <div class="analyst-name">${analystName}</div>
      </div>
      <div class="timestamp">${timeStr} ET</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[snapshot-html] Error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
