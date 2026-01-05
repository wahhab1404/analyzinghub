import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[snapshot-html] Request received');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[snapshot-html] Missing environment variables');
      return new NextResponse('Configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const params = await context.params;
    const tradeId = params.id;
    console.log('[snapshot-html] Generating snapshot for trade:', tradeId);

    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses!analysis_id(id, title, index_symbol)
      `)
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return new NextResponse('Trade not found', { status: 404 });
    }

    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
    const currentPrice = trade.current_contract || entryPrice;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = entryPrice > 0 ? (priceChange / entryPrice) * 100 : 0;

    const underlyingPrice = trade.current_underlying || trade.entry_underlying_snapshot?.price || 0;
    const underlyingEntryPrice = trade.entry_underlying_snapshot?.price || underlyingPrice;
    const underlyingChange = underlyingPrice - underlyingEntryPrice;
    const underlyingChangePercent = (underlyingChange / underlyingEntryPrice) * 100;

    const mid = trade.entry_contract_snapshot?.mid || currentPrice;
    const openInterest = trade.entry_contract_snapshot?.open_interest || 0;
    const volume = trade.entry_contract_snapshot?.volume || 0;

    const now = new Date();
    const timestamp = `Open, ${now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })} ${now.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
    })} ET`;

    const isPriceUp = priceChange > 0;
    const priceColor = isPriceUp ? '#10b981' : (priceChange < 0 ? '#ef4444' : '#8e8e93');
    const priceArrow = isPriceUp ? '▲' : (priceChange < 0 ? '▼' : '');
    const priceSign = isPriceUp ? '+' : '';
    const isUnderlyingUp = underlyingChange >= 0;

    const formatExpiry = (expiry: string) => {
      const date = new Date(expiry);
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      });
    };

    const strike = trade.strike || 0;
    const expiry = trade.expiry || new Date().toISOString();
    const optionType = trade.option_type === 'call' ? 'Call' : 'Put';
    const underlyingSymbol = trade.analysis?.index_symbol || 'SPX';

    // Extract clean symbol from polygon ticker (e.g., "O:SPX251231C06090000" -> "SPX")
    let cleanSymbol = underlyingSymbol;
    if (trade.polygon_option_ticker) {
      const parts = trade.polygon_option_ticker.split(':');
      if (parts.length > 1) {
        // Extract just the index name (SPX, NDX, etc.) from the date/strike combo
        const tickerPart = parts[1];
        cleanSymbol = tickerPart.replace(/\d{6}[CP]\d{8}$/, '');
      }
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', sans-serif;
      background: #ffffff;
      width: 1280px;
      height: 720px;
      padding: 48px 60px;
      position: relative;
    }
    .container { height: 100%; display: flex; flex-direction: column; }
    .header { margin-bottom: 48px; }
    .title { font-size: 56px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; letter-spacing: -0.5px; }
    .subtitle { font-size: 28px; color: #8e8e93; font-weight: 400; }
    .content-section { display: flex; justify-content: space-between; margin-bottom: 48px; flex: 1; }
    .left-section { display: flex; flex-direction: column; justify-content: center; }
    .current-price { font-size: 140px; font-weight: 700; color: ${priceColor}; line-height: 1; margin-bottom: 20px; letter-spacing: -2px; }
    .price-change { display: flex; gap: 16px; align-items: center; font-size: 38px; font-weight: 600; color: ${priceColor}; }
    .right-section { display: flex; flex-direction: column; gap: 24px; justify-content: center; min-width: 320px; }
    .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
    .stat-label { font-size: 24px; color: #8e8e93; font-weight: 400; }
    .stat-value { font-size: 32px; color: #1a1a1a; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 24px; border-top: 2px solid #f0f0f0; }
    .underlying-info { display: flex; gap: 28px; align-items: center; }
    .underlying-symbol { font-size: 32px; color: #1a1a1a; font-weight: 600; }
    .underlying-price { font-size: 32px; color: ${isUnderlyingUp ? '#34c759' : '#8e8e93'}; font-weight: 600; }
    .timestamp { font-size: 24px; color: #8e8e93; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">${cleanSymbol} ${strike.toLocaleString()}</div>
      <div class="subtitle">${formatExpiry(expiry)} (W) ${optionType}</div>
    </div>
    <div class="content-section">
      <div class="left-section">
        <div class="current-price">${currentPrice.toFixed(2)}</div>
        <div class="price-change">
          <span>${priceArrow}${priceSign}${Math.abs(priceChange).toFixed(2)}</span>
          <span>${priceSign}${Math.abs(priceChangePercent).toFixed(2)}%</span>
        </div>
      </div>
      <div class="right-section">
        <div class="stat-row">
          <span class="stat-label">Mid</span>
          <span class="stat-value">${mid.toFixed(2)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Open Int.</span>
          <span class="stat-value">${formatNumber(Math.abs(openInterest))}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Vol.</span>
          <span class="stat-value">${formatNumber(Math.abs(volume))}</span>
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="underlying-info">
        <span class="underlying-symbol">${underlyingSymbol}</span>
        <span class="underlying-price">
          ${underlyingPrice.toFixed(2)}
          ${underlyingChangePercent >= 0 ? '+' : ''}${underlyingChangePercent.toFixed(2)}%
        </span>
      </div>
      <div class="timestamp">${timestamp}</div>
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
    console.error('Error generating snapshot HTML:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
