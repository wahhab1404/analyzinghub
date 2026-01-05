/**
 * Service to generate trade snapshot images
 * Creates visual snapshots similar to trading apps for Telegram publishing
 */

export interface TradeSnapshotData {
  // Contract info
  symbol: string;
  strike: number;
  expiry: string;
  optionType: 'Call' | 'Put';

  // Prices
  currentPrice: number;
  entryPrice: number;
  priceChange: number;
  priceChangePercent: number;

  // Stats
  mid: number;
  openInterest: number;
  volume: number;

  // Underlying
  underlyingSymbol: string;
  underlyingPrice: number;
  underlyingChange: number;
  underlyingChangePercent: number;

  // Additional
  timestamp: string;
  isNewHigh?: boolean;
}

export class SnapshotGeneratorService {
  /**
   * Generate HTML for trade snapshot
   */
  static generateSnapshotHTML(data: TradeSnapshotData): string {
    const isPriceUp = data.priceChange >= 0;
    const priceColor = isPriceUp ? '#10b981' : '#ef4444';
    const priceArrow = isPriceUp ? '▲' : '▼';

    const isUnderlyingUp = data.underlyingChange >= 0;
    const underlyingColor = isUnderlyingUp ? '#10b981' : '#6b7280';

    const formatExpiry = (expiry: string) => {
      const date = new Date(expiry);
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: '2-digit'
      });
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      width: 800px;
      height: 600px;
      padding: 40px;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
    }

    .title-section h1 {
      font-size: 48px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 8px;
    }

    .contract-details {
      font-size: 24px;
      color: #6b7280;
      font-weight: 400;
    }

    .favorite-icon {
      width: 48px;
      height: 48px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    .main-price-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 40px;
      border-bottom: 1px solid #e5e7eb;
    }

    .price-container {
      flex: 1;
    }

    .current-price {
      font-size: 120px;
      font-weight: 700;
      color: ${priceColor};
      line-height: 1;
      margin-bottom: 16px;
    }

    .price-change {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 32px;
      font-weight: 600;
      color: ${priceColor};
    }

    .stats-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 280px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-label {
      font-size: 20px;
      color: #9ca3af;
      font-weight: 400;
    }

    .stat-value {
      font-size: 24px;
      color: #1f2937;
      font-weight: 600;
      text-align: right;
    }

    .underlying-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 0;
    }

    .underlying-info {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    .underlying-symbol {
      font-size: 28px;
      color: #1f2937;
      font-weight: 600;
    }

    .underlying-price {
      font-size: 28px;
      color: ${underlyingColor};
      font-weight: 600;
    }

    .underlying-time {
      font-size: 20px;
      color: #6b7280;
    }

    ${data.isNewHigh ? `
    .new-high-badge {
      position: absolute;
      top: 40px;
      right: 40px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 16px 32px;
      border-radius: 12px;
      font-size: 24px;
      font-weight: 700;
      box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    ` : ''}
  </style>
</head>
<body>
  ${data.isNewHigh ? '<div class="new-high-badge">🚀 NEW HIGH!</div>' : ''}

  <div class="header">
    <div class="title-section">
      <h1>${data.symbol} $${data.strike.toLocaleString()}</h1>
      <div class="contract-details">${formatExpiry(data.expiry)} (W) ${data.optionType} ${Math.abs(data.openInterest).toLocaleString()}</div>
    </div>
  </div>

  <div class="main-price-section">
    <div class="price-container">
      <div class="current-price">${data.currentPrice.toFixed(2)}</div>
      <div class="price-change">
        <span>${priceArrow}${Math.abs(data.priceChange).toFixed(2)}</span>
        <span>${data.priceChangePercent.toFixed(2)}%</span>
      </div>
    </div>

    <div class="stats-container">
      <div class="stat-row">
        <span class="stat-label">Mid</span>
        <span class="stat-value">${data.mid.toFixed(2)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Open Int.</span>
        <span class="stat-value">${Math.abs(data.openInterest).toLocaleString()}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Vol.</span>
        <span class="stat-value">${Math.abs(data.volume).toLocaleString()}</span>
      </div>
    </div>
  </div>

  <div class="underlying-section">
    <div class="underlying-info">
      <span class="underlying-symbol">${data.underlyingSymbol}</span>
      <span class="underlying-price">
        ${data.underlyingPrice.toFixed(2)}
        ${data.underlyingChangePercent >= 0 ? '+' : ''}${data.underlyingChangePercent.toFixed(2)}%
      </span>
    </div>
    <div class="underlying-time">${data.timestamp}</div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Prepare snapshot data from trade object
   */
  static prepareSnapshotData(trade: any, isNewHigh: boolean = false): TradeSnapshotData {
    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
    const currentPrice = trade.current_contract || entryPrice;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = (priceChange / entryPrice) * 100;

    // Get underlying info from entry snapshot
    const underlyingPrice = trade.entry_contract_snapshot?.underlying_price || 0;
    const underlyingChange = 0; // We don't track this in real-time yet
    const underlyingChangePercent = 0;

    const mid = trade.entry_contract_snapshot?.mid || currentPrice;
    const openInterest = trade.entry_contract_snapshot?.open_interest || 0;
    const volume = trade.entry_contract_snapshot?.volume || 0;

    const now = new Date();
    const timestamp = `Open, ${now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })} ${now.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit'
    })} ET`;

    return {
      symbol: trade.analysis?.index_symbol || 'SPX',
      strike: trade.strike || 0,
      expiry: trade.expiry || new Date().toISOString(),
      optionType: trade.option_type === 'call' ? 'Call' : 'Put',
      currentPrice,
      entryPrice,
      priceChange,
      priceChangePercent,
      mid,
      openInterest,
      volume,
      underlyingSymbol: trade.analysis?.index_symbol || 'SPX',
      underlyingPrice,
      underlyingChange,
      underlyingChangePercent,
      timestamp,
      isNewHigh,
    };
  }
}
