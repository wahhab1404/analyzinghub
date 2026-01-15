import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)

    const { data: report, error } = await supabase
      .from('daily_trade_reports')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !report) {
      return new NextResponse('Report not found', { status: 404 })
    }

    const summary = report.summary || {}
    const totalTrades = summary.total_trades || 0
    const activeTrades = summary.active_trades || 0
    const closedTrades = summary.closed_trades || 0
    const expiredTrades = summary.expired_trades || 0
    const avgProfit = summary.avg_profit_percent || 0
    const maxProfit = summary.max_profit_percent || 0
    const winRate = summary.win_rate || 0

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px;
      width: 1280px;
      height: 720px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 50px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 1200px;
    }
    .header {
      text-align: center;
      border-bottom: 4px solid #667eea;
      padding-bottom: 25px;
      margin-bottom: 40px;
    }
    .header h1 {
      font-size: 48px;
      color: #1a202c;
      margin-bottom: 15px;
    }
    .date {
      font-size: 24px;
      color: #718096;
      font-weight: 600;
    }
    .section {
      margin: 40px 0;
    }
    .section-title {
      font-size: 32px;
      color: #2d3748;
      margin-bottom: 25px;
      font-weight: bold;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }
    .stat-card {
      background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
      padding: 25px;
      border-radius: 15px;
      border-left: 5px solid #667eea;
      text-align: center;
    }
    .stat-label {
      font-size: 16px;
      color: #718096;
      margin-bottom: 10px;
      font-weight: 600;
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #1a202c;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .metric {
      background: white;
      padding: 30px;
      border-radius: 15px;
      border: 3px solid #e2e8f0;
      text-align: center;
    }
    .metric-label {
      font-size: 16px;
      color: #a0aec0;
      margin-bottom: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .metric-value {
      font-size: 40px;
      font-weight: bold;
      color: #2d3748;
    }
    .metric-value.positive { color: #48bb78; }
    .metric-value.negative { color: #f56565; }
    .footer {
      margin-top: 40px;
      padding-top: 25px;
      border-top: 3px solid #e2e8f0;
      text-align: center;
      color: #a0aec0;
      font-size: 18px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Daily Trading Report</h1>
      <div class="date">📅 ${report.report_date}</div>
    </div>

    <div class="section">
      <div class="section-title">📈 Trade Overview</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">📌 Total</div>
          <div class="stat-value">${totalTrades}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">🔵 Active</div>
          <div class="stat-value">${activeTrades}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">✅ Closed</div>
          <div class="stat-value">${closedTrades}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">⏰ Expired</div>
          <div class="stat-value">${expiredTrades}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">💰 Performance Metrics</div>
      <div class="metrics">
        <div class="metric">
          <div class="metric-label">${avgProfit >= 0 ? '📈' : '📉'} AVG PROFIT</div>
          <div class="metric-value ${avgProfit >= 0 ? 'positive' : 'negative'}">
            ${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(1)}%
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">🚀 MAX PROFIT</div>
          <div class="metric-value positive">+${maxProfit.toFixed(1)}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">🎯 WIN RATE</div>
          <div class="metric-value">${winRate.toFixed(1)}%</div>
        </div>
      </div>
    </div>

    <div class="footer">
      ✨ Generated by AnalyzingHub
    </div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    })

  } catch (error) {
    console.error('Error generating preview:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
