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

    const highSinceEntry = trade.contract_high_since || currentPrice;
    const lowSinceEntry = trade.contract_low_since || currentPrice;

    const qty = trade.qty || 1;
    const multiplier = trade.contract_multiplier || 100;
    const netPnl = priceChange * multiplier * qty;

    const underlyingPrice = trade.current_underlying || trade.entry_underlying_snapshot?.price || 0;
    const underlyingEntryPrice = trade.entry_underlying_snapshot?.price || underlyingPrice;
    const underlyingChange = underlyingPrice - underlyingEntryPrice;
    const underlyingChangePercent = (underlyingChange / underlyingEntryPrice) * 100;

    const mid = trade.entry_contract_snapshot?.mid || currentPrice;
    const bid = trade.entry_contract_snapshot?.bid || 0;
    const ask = trade.entry_contract_snapshot?.ask || 0;
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

    const pnlColor = netPnl >= 0 ? '#10b981' : '#ef4444';
    const pnlSign = netPnl >= 0 ? '+' : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      width: 1280px;
      height: 720px;
      padding: 40px;
      position: relative;
    }
    .card {
      background: white;
      border-radius: 24px;
      padding: 48px;
      height: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 32px;
      border-bottom: 3px solid #f0f0f5;
    }
    .title-section { }
    .title {
      font-size: 52px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 8px;
      letter-spacing: -1px;
    }
    .subtitle {
      font-size: 24px;
      color: #8e8e93;
      font-weight: 500;
    }
    .status-badge {
      background: ${priceColor};
      color: white;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 20px;
      font-weight: 600;
      text-align: center;
    }
    .main-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      flex: 1;
      margin-bottom: 32px;
    }
    .price-section {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .current-price {
      font-size: 120px;
      font-weight: 800;
      color: ${priceColor};
      line-height: 1;
      margin-bottom: 20px;
      letter-spacing: -3px;
    }
    .price-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .price-change {
      display: flex;
      gap: 20px;
      align-items: center;
      font-size: 36px;
      font-weight: 600;
      color: ${priceColor};
    }
    .pnl-display {
      font-size: 32px;
      font-weight: 700;
      color: ${pnlColor};
      margin-top: 8px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .stat-box {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 16px;
      border: 2px solid #e9ecef;
    }
    .stat-label {
      font-size: 18px;
      color: #8e8e93;
      font-weight: 500;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-value {
      font-size: 32px;
      color: #1a1a1a;
      font-weight: 700;
    }
    .stat-value.positive { color: #10b981; }
    .stat-value.negative { color: #ef4444; }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 28px;
      border-top: 3px solid #f0f0f5;
    }
    .underlying-info {
      display: flex;
      gap: 32px;
      align-items: center;
      background: #f8f9fa;
      padding: 16px 28px;
      border-radius: 12px;
    }
    .underlying-symbol {
      font-size: 28px;
      color: #1a1a1a;
      font-weight: 700;
    }
    .underlying-price {
      font-size: 28px;
      color: ${isUnderlyingUp ? '#10b981' : '#ef4444'};
      font-weight: 700;
    }
    .timestamp {
      font-size: 22px;
      color: #8e8e93;
      font-weight: 500;
    }
    .branding {
      position: absolute;
      top: 32px;
      right: 48px;
      font-size: 24px;
      font-weight: 700;
      color: white;
      text-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
  </style>
</head>
<body>
  <div class="branding">AnalyzingHub</div>
  <div class="card">
    <div class="header">
      <div class="title-section">
        <div class="title">${cleanSymbol} $${strike.toLocaleString()}</div>
        <div class="subtitle">${formatExpiry(expiry)} • ${optionType} • ${trade.author.full_name}</div>
      </div>
      <div class="status-badge">
        ${priceArrow} ${priceSign}${Math.abs(priceChangePercent).toFixed(2)}%
      </div>
    </div>

    <div class="main-content">
      <div class="price-section">
        <div class="current-price">$${currentPrice.toFixed(2)}</div>
        <div class="price-details">
          <div class="price-change">
            <span>${priceArrow} ${priceSign}$${Math.abs(priceChange).toFixed(2)}</span>
          </div>
          <div class="pnl-display">
            P/L: ${pnlSign}$${Math.abs(netPnl).toFixed(2)}
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">Entry Price</div>
          <div class="stat-value">$${entryPrice.toFixed(2)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Quantity</div>
          <div class="stat-value">${qty}x</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">High Since Entry</div>
          <div class="stat-value positive">$${highSinceEntry.toFixed(2)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Low Since Entry</div>
          <div class="stat-value negative">$${lowSinceEntry.toFixed(2)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Bid / Ask</div>
          <div class="stat-value">${bid.toFixed(2)} / ${ask.toFixed(2)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Volume</div>
          <div class="stat-value">${formatNumber(Math.abs(volume))}</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="underlying-info">
        <span class="underlying-symbol">${underlyingSymbol}</span>
        <span class="underlying-price">
          $${underlyingPrice.toFixed(2)}
          ${underlyingChangePercent >= 0 ? '▲' : '▼'}${Math.abs(underlyingChangePercent).toFixed(2)}%
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
