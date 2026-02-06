/**
 * Daily Trade Report Generator
 * Creates beautifully styled HTML reports for daily options trades
 */

import { formatPercent } from '@/lib/format-utils';

export interface TradeReportData {
  trade_id: string
  underlying_symbol: string
  direction: string
  strike: number
  expiry: string
  option_type: string
  entry_contract_price: number
  current_contract_price: number
  max_contract_price: number
  profit_from_entry: number
  max_profit: number
  is_winning_trade: boolean
  trade_outcome: 'big_win' | 'small_win' | 'breakeven' | 'small_loss' | 'big_loss' | 'pending'
  status: string
  entry_time: string
  win_condition?: string
  loss_condition?: string
}

export interface DailyReportSummary {
  total_trades: number
  winning_trades: number
  losing_trades: number
  breakeven_trades: number
  total_profit: number
  biggest_win: number
  biggest_loss: number
  win_rate: number
}

export class DailyReportGenerator {

  /**
   * Generate a summary from trade data
   */
  static generateSummary(trades: TradeReportData[]): DailyReportSummary {
    const winningTrades = trades.filter(t => t.is_winning_trade || (t.max_profit || 0) >= 100)
    const losingTrades = trades.filter(t => (t.max_profit || 0) < -20)
    const breakevenTrades = trades.filter(t => {
      const profit = t.max_profit || 0;
      return profit >= -20 && profit < 100 && !t.is_winning_trade;
    })

    const totalProfit = trades.reduce((sum, t) => sum + (t.max_profit || 0), 0)
    const biggestWin = Math.max(...trades.map(t => t.max_profit || 0), 0)
    const biggestLoss = Math.min(...trades.map(t => t.max_profit || 0), 0)
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0

    return {
      total_trades: trades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      breakeven_trades: breakevenTrades.length,
      total_profit: totalProfit,
      biggest_win: biggestWin,
      biggest_loss: biggestLoss,
      win_rate: winRate
    }
  }

  /**
   * Format profit with color coding
   */
  static formatProfit(profit: number): { text: string, color: string, bgColor: string } {
    const formatted = profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`

    if (profit >= 100) {
      return { text: formatted, color: '#065f46', bgColor: '#d1fae5' }
    } else if (profit >= 20) {
      return { text: formatted, color: '#047857', bgColor: '#d1fae5' }
    } else if (profit >= -20) {
      return { text: formatted, color: '#92400e', bgColor: '#fef3c7' }
    } else if (profit >= -50) {
      return { text: formatted, color: '#b91c1c', bgColor: '#fee2e2' }
    } else {
      return { text: formatted, color: '#991b1b', bgColor: '#fecaca' }
    }
  }

  /**
   * Get outcome badge styling
   */
  static getOutcomeBadge(outcome: string): { text: string, color: string, bgColor: string, icon: string } {
    switch (outcome) {
      case 'big_win':
        return { text: 'Big Win 🎯', color: '#065f46', bgColor: '#d1fae5', icon: '🎯' }
      case 'small_win':
        return { text: 'Win ✅', color: '#047857', bgColor: '#d1fae5', icon: '✅' }
      case 'breakeven':
        return { text: 'Breakeven ⚪', color: '#92400e', bgColor: '#fef3c7', icon: '⚪' }
      case 'small_loss':
        return { text: 'Loss ⚠️', color: '#b91c1c', bgColor: '#fee2e2', icon: '⚠️' }
      case 'big_loss':
        return { text: 'Big Loss ❌', color: '#991b1b', bgColor: '#fecaca', icon: '❌' }
      default:
        return { text: 'Pending ⏳', color: '#1e40af', bgColor: '#dbeafe', icon: '⏳' }
    }
  }

  /**
   * Generate HTML for daily trade report
   */
  static generateHTML(trades: TradeReportData[], date: string, analysisTitle?: string): string {
    const summary = this.generateSummary(trades)

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Trade Report - ${date}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 10px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }

    .header .date {
      font-size: 18px;
      opacity: 0.9;
      font-weight: 500;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px 40px;
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
    }

    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      text-align: center;
      transition: transform 0.2s;
    }

    .summary-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }

    .summary-card .label {
      font-size: 13px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .summary-card .value {
      font-size: 28px;
      font-weight: 800;
      color: #111827;
    }

    .summary-card.profit .value {
      color: #059669;
    }

    .summary-card.loss .value {
      color: #dc2626;
    }

    .summary-card.win-rate .value {
      color: #667eea;
    }

    .trades-section {
      padding: 40px;
    }

    .section-title {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
    }

    .trades-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      border-radius: 12px;
      overflow: hidden;
    }

    .trades-table thead {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .trades-table th {
      padding: 16px 12px;
      text-align: left;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .trades-table tbody tr {
      background: white;
      transition: all 0.2s;
    }

    .trades-table tbody tr:nth-child(even) {
      background: #f9fafb;
    }

    .trades-table tbody tr:hover {
      background: #f3f4f6;
      transform: scale(1.01);
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .trades-table td {
      padding: 16px 12px;
      font-size: 14px;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
    }

    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }

    .direction-long {
      background: #d1fae5;
      color: #065f46;
    }

    .direction-short {
      background: #fee2e2;
      color: #991b1b;
    }

    .profit-cell {
      padding: 8px 12px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 15px;
    }

    .footer {
      background: #f9fafb;
      padding: 30px 40px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 2px solid #e5e7eb;
    }

    .footer strong {
      color: #111827;
    }

    .no-trades {
      text-align: center;
      padding: 60px 40px;
      color: #6b7280;
      font-size: 18px;
    }

    .contract-details {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }

    .time {
      font-size: 12px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Daily Options Trading Report</h1>
      <div class="date">${date}${analysisTitle ? ` • ${analysisTitle}` : ''}</div>
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="label">Total Trades</div>
        <div class="value">${summary.total_trades}</div>
      </div>
      <div class="summary-card">
        <div class="label">Winning</div>
        <div class="value" style="color: #059669;">${summary.winning_trades}</div>
      </div>
      <div class="summary-card">
        <div class="label">Losing</div>
        <div class="value" style="color: #dc2626;">${summary.losing_trades}</div>
      </div>
      <div class="summary-card win-rate">
        <div class="label">Win Rate</div>
        <div class="value">${formatPercent(summary.win_rate, 'rounded')}</div>
      </div>
      <div class="summary-card ${summary.total_profit >= 0 ? 'profit' : 'loss'}">
        <div class="label">Total P&L</div>
        <div class="value">${summary.total_profit >= 0 ? '+' : ''}$${summary.total_profit.toFixed(2)}</div>
      </div>
      <div class="summary-card profit">
        <div class="label">Biggest Win</div>
        <div class="value">+$${summary.biggest_win.toFixed(2)}</div>
      </div>
    </div>

    <div class="trades-section">
      ${trades.length === 0 ? `
        <div class="no-trades">
          No trades recorded for this date
        </div>
      ` : `
        <h2 class="section-title">Trade Details</h2>
        <table class="trades-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Direction</th>
              <th>Contract</th>
              <th>Entry</th>
              <th>Current</th>
              <th>Max Price</th>
              <th>Profit</th>
              <th>Max Profit</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${trades.map(trade => {
              const profitStyle = this.formatProfit(trade.profit_from_entry)
              const maxProfitStyle = this.formatProfit(trade.max_profit)
              const outcome = this.getOutcomeBadge(trade.trade_outcome)
              const entryTime = new Date(trade.entry_time).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/New_York'
              })

              return `
                <tr>
                  <td><strong>${trade.underlying_symbol}</strong></td>
                  <td>
                    <span class="badge ${trade.direction === 'LONG' ? 'direction-long' : 'direction-short'}">
                      ${trade.direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}
                    </span>
                  </td>
                  <td>
                    <div><strong>$${trade.strike}</strong> ${trade.option_type}</div>
                    <div class="contract-details">${new Date(trade.expiry).toLocaleDateString()}</div>
                  </td>
                  <td>$${trade.entry_contract_price?.toFixed(2) || 'N/A'}</td>
                  <td>$${trade.current_contract_price?.toFixed(2) || 'N/A'}</td>
                  <td>$${trade.max_contract_price?.toFixed(2) || 'N/A'}</td>
                  <td>
                    <div class="profit-cell" style="color: ${profitStyle.color}; background: ${profitStyle.bgColor};">
                      ${profitStyle.text}
                    </div>
                  </td>
                  <td>
                    <div class="profit-cell" style="color: ${maxProfitStyle.color}; background: ${maxProfitStyle.bgColor};">
                      ${maxProfitStyle.text}
                    </div>
                  </td>
                  <td>
                    <span class="badge" style="color: ${outcome.color}; background: ${outcome.bgColor};">
                      ${outcome.text}
                    </span>
                  </td>
                  <td class="time">${entryTime}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="footer">
      <strong>Note:</strong> Winning trades are those with max profit exceeding $100.
      All times in ET. Report generated automatically at end of trading day.
    </div>
  </div>
</body>
</html>
    `
  }
}
