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
   * Format profit with dark-theme color coding
   */
  static formatProfit(profit: number): { text: string, color: string, bgColor: string } {
    const formatted = profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`

    if (profit >= 100) {
      return { text: formatted, color: '#3FB950', bgColor: 'rgba(63,185,80,0.12)' }
    } else if (profit >= 20) {
      return { text: formatted, color: '#3FB950', bgColor: 'rgba(63,185,80,0.08)' }
    } else if (profit >= -20) {
      return { text: formatted, color: '#E3B341', bgColor: 'rgba(227,179,65,0.12)' }
    } else if (profit >= -50) {
      return { text: formatted, color: '#F85149', bgColor: 'rgba(248,81,73,0.10)' }
    } else {
      return { text: formatted, color: '#F85149', bgColor: 'rgba(248,81,73,0.15)' }
    }
  }

  /**
   * Get outcome badge styling (dark theme)
   */
  static getOutcomeBadge(outcome: string): { text: string, color: string, bgColor: string, icon: string } {
    switch (outcome) {
      case 'big_win':
        return { text: 'Big Win', color: '#3FB950', bgColor: 'rgba(63,185,80,0.15)', icon: '🎯' }
      case 'small_win':
        return { text: 'Win', color: '#3FB950', bgColor: 'rgba(63,185,80,0.12)', icon: '✓' }
      case 'breakeven':
        return { text: 'Breakeven', color: '#E3B341', bgColor: 'rgba(227,179,65,0.12)', icon: '—' }
      case 'small_loss':
        return { text: 'Loss', color: '#F85149', bgColor: 'rgba(248,81,73,0.12)', icon: '!' }
      case 'big_loss':
        return { text: 'Big Loss', color: '#F85149', bgColor: 'rgba(248,81,73,0.15)', icon: '✕' }
      default:
        return { text: 'Active', color: '#58A6FF', bgColor: 'rgba(88,166,255,0.12)', icon: '•' }
    }
  }

  /**
   * Generate HTML for daily trade report (dark premium theme)
   */
  static generateHTML(trades: TradeReportData[], date: string, analysisTitle?: string): string {
    const summary = this.generateSummary(trades)
    const profitColor = summary.total_profit >= 0 ? '#3FB950' : '#F85149'
    const profitSign = summary.total_profit >= 0 ? '+' : ''

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Trade Report - ${date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
      background: #0D1117;
      color: #E6EDF3;
      padding: 32px 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: #0D1117;
    }

    /* Top accent bar */
    .accent-bar {
      height: 3px;
      background: linear-gradient(90deg, #58A6FF 0%, #3FB950 50%, #E3B341 100%);
      border-radius: 2px;
      margin-bottom: 28px;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0 0 24px 0;
      border-bottom: 1px solid #21262D;
      margin-bottom: 24px;
    }

    .header-left h1 {
      font-size: 22px;
      font-weight: 700;
      color: #E6EDF3;
      letter-spacing: -0.3px;
    }

    .header-left .subtitle {
      font-size: 13px;
      color: #8B949E;
      margin-top: 4px;
    }

    .brand-badge {
      background: #161B22;
      border: 1px solid #30363D;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      color: #58A6FF;
      letter-spacing: 0.5px;
    }

    /* KPI row */
    .kpi-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }

    .kpi-card {
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 8px;
      padding: 18px 20px;
    }

    .kpi-card.wide {
      border-color: #30363D;
    }

    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      color: #6E7681;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 6px;
    }

    .kpi-value {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -1px;
      line-height: 1;
    }

    .kpi-sub {
      font-size: 12px;
      color: #6E7681;
      margin-top: 4px;
    }

    /* Counts row */
    .counts-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 8px;
      margin-bottom: 24px;
    }

    .count-card {
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 6px;
      padding: 12px 10px;
      text-align: center;
    }

    .count-label {
      font-size: 10px;
      font-weight: 600;
      color: #6E7681;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 4px;
    }

    .count-value {
      font-size: 20px;
      font-weight: 700;
      color: #E6EDF3;
    }

    /* Trades table */
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #8B949E;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 10px;
    }

    .trades-table {
      width: 100%;
      border-collapse: collapse;
    }

    .trades-table thead tr {
      border-bottom: 1px solid #21262D;
    }

    .trades-table th {
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      color: #6E7681;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }

    .trades-table tbody tr {
      border-bottom: 1px solid #161B22;
      transition: background 0.15s;
    }

    .trades-table tbody tr:hover {
      background: #161B22;
    }

    .trades-table td {
      padding: 12px 12px;
      font-size: 13px;
      color: #C9D1D9;
      vertical-align: middle;
    }

    .symbol-cell strong {
      font-size: 14px;
      font-weight: 700;
      color: #E6EDF3;
    }

    .dir-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .dir-call { background: rgba(63,185,80,0.15); color: #3FB950; }
    .dir-put  { background: rgba(248,81,73,0.15);  color: #F85149; }
    .dir-long { background: rgba(63,185,80,0.15);  color: #3FB950; }
    .dir-short{ background: rgba(248,81,73,0.15);  color: #F85149; }

    .profit-pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 13px;
    }

    .outcome-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .sub-text {
      font-size: 11px;
      color: #6E7681;
      margin-top: 2px;
    }

    .time-text {
      font-size: 12px;
      color: #6E7681;
      font-variant-numeric: tabular-nums;
    }

    /* Footer */
    .footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #21262D;
      text-align: center;
      font-size: 12px;
      color: #6E7681;
    }

    .no-trades {
      text-align: center;
      padding: 60px 40px;
      color: #6E7681;
      font-size: 16px;
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="accent-bar"></div>

    <div class="header">
      <div class="header-left">
        <h1>Daily Trading Report</h1>
        <div class="subtitle">${date}${analysisTitle ? ` &bull; ${analysisTitle}` : ''}</div>
      </div>
      <div class="brand-badge">ANALYZINGHUB</div>
    </div>

    <!-- KPI row -->
    <div class="kpi-grid">
      <div class="kpi-card wide">
        <div class="kpi-label">Net Profit / Loss</div>
        <div class="kpi-value" style="color: ${profitColor};">${profitSign}$${summary.total_profit.toFixed(2)}</div>
        <div class="kpi-sub">Across ${summary.total_trades} trade${summary.total_trades !== 1 ? 's' : ''}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Win Rate</div>
        <div class="kpi-value" style="color: #58A6FF;">${formatPercent(summary.win_rate, 'rounded')}</div>
        <div class="kpi-sub">${summary.winning_trades}W / ${summary.losing_trades}L</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Best Trade</div>
        <div class="kpi-value" style="color: #3FB950;">+$${summary.biggest_win.toFixed(2)}</div>
        <div class="kpi-sub">Biggest win</div>
      </div>
    </div>

    <!-- Counts row -->
    <div class="counts-grid">
      <div class="count-card">
        <div class="count-label">Total</div>
        <div class="count-value">${summary.total_trades}</div>
      </div>
      <div class="count-card">
        <div class="count-label">Won</div>
        <div class="count-value" style="color: #3FB950;">${summary.winning_trades}</div>
      </div>
      <div class="count-card">
        <div class="count-label">Lost</div>
        <div class="count-value" style="color: #F85149;">${summary.losing_trades}</div>
      </div>
      <div class="count-card">
        <div class="count-label">Even</div>
        <div class="count-value" style="color: #E3B341;">${summary.breakeven_trades}</div>
      </div>
      <div class="count-card">
        <div class="count-label">Active</div>
        <div class="count-value" style="color: #58A6FF;">${trades.filter(t => t.status === 'active' || t.trade_outcome === 'pending').length}</div>
      </div>
      <div class="count-card">
        <div class="count-label">Best</div>
        <div class="count-value" style="color: #3FB950; font-size: 14px;">+$${summary.biggest_win.toFixed(0)}</div>
      </div>
      <div class="count-card">
        <div class="count-label">Worst</div>
        <div class="count-value" style="color: #F85149; font-size: 14px;">${summary.biggest_loss < 0 ? '-' : ''}$${Math.abs(summary.biggest_loss).toFixed(0)}</div>
      </div>
    </div>

    <!-- Trades table -->
    ${trades.length === 0 ? `
      <div class="no-trades">No trades recorded for this date</div>
    ` : `
      <div class="section-title">Trade Details</div>
      <table class="trades-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Direction</th>
            <th>Strike / Expiry</th>
            <th>Entry</th>
            <th>High</th>
            <th>Max P/L</th>
            <th>Outcome</th>
            <th>Time (ET)</th>
          </tr>
        </thead>
        <tbody>
          ${trades.map(trade => {
            const maxProfitStyle = this.formatProfit(trade.max_profit)
            const outcome = this.getOutcomeBadge(trade.trade_outcome)
            const isCall = trade.option_type?.toUpperCase().includes('CALL') || trade.direction === 'LONG'
            const dirClass = trade.option_type?.toUpperCase().includes('CALL') ? 'dir-call'
              : trade.option_type?.toUpperCase().includes('PUT') ? 'dir-put'
              : trade.direction === 'LONG' ? 'dir-long' : 'dir-short'
            const dirLabel = trade.option_type?.toUpperCase().includes('CALL') ? 'CALL'
              : trade.option_type?.toUpperCase().includes('PUT') ? 'PUT'
              : trade.direction
            const entryTime = new Date(trade.entry_time).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York'
            })

            return `
              <tr>
                <td class="symbol-cell">
                  <strong>${trade.underlying_symbol}</strong>
                </td>
                <td>
                  <span class="dir-badge ${dirClass}">${dirLabel}</span>
                </td>
                <td>
                  <div style="font-weight:600;">$${trade.strike}</div>
                  <div class="sub-text">${new Date(trade.expiry).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'2-digit' })}</div>
                </td>
                <td style="font-variant-numeric: tabular-nums;">${trade.entry_contract_price != null ? '$' + trade.entry_contract_price.toFixed(2) : '—'}</td>
                <td style="font-variant-numeric: tabular-nums;">${trade.max_contract_price != null ? '$' + trade.max_contract_price.toFixed(2) : '—'}</td>
                <td>
                  <span class="profit-pill" style="color:${maxProfitStyle.color}; background:${maxProfitStyle.bgColor};">
                    ${maxProfitStyle.text}
                  </span>
                </td>
                <td>
                  <span class="outcome-pill" style="color:${outcome.color}; background:${outcome.bgColor};">
                    ${outcome.text}
                  </span>
                </td>
                <td class="time-text">${entryTime}</td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    `}

    <div class="footer">
      Win = max profit &ge; $100 &bull; All times ET &bull; Auto-generated end of session
    </div>
  </div>
</body>
</html>
    `
  }
}
