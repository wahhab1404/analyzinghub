import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface TradeData {
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
  trade_outcome: string
  status: string
  entry_time: string
  telegram_channel_id: string
  author_id: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get target date (yesterday by default)
    const { searchParams } = new URL(req.url)
    const targetDateParam = searchParams.get('date')
    const authorIdParam = searchParams.get('author_id')
    
    // Use yesterday's date in ET timezone
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const targetDate = targetDateParam || yesterday.toISOString().split('T')[0]

    console.log(`📊 Generating daily report for ${targetDate}`)

    // Get daily trades
    const { data: trades, error: tradesError } = await supabase.rpc(
      'get_daily_trade_summary',
      {
        target_date: targetDate,
        author_id_param: authorIdParam || null
      }
    )

    if (tradesError) {
      console.error('Error fetching trades:', tradesError)
      throw tradesError
    }

    if (!trades || trades.length === 0) {
      console.log('ℹ️ No trades found for this date')
      return new Response(
        JSON.stringify({ message: 'No trades found', date: targetDate }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Found ${trades.length} trades`)

    // Group trades by channel and author
    const tradesByChannel = new Map<string, TradeData[]>()
    const tradesByAuthor = new Map<string, TradeData[]>()

    for (const trade of trades) {
      // Group by channel
      if (trade.telegram_channel_id) {
        if (!tradesByChannel.has(trade.telegram_channel_id)) {
          tradesByChannel.set(trade.telegram_channel_id, [])
        }
        tradesByChannel.get(trade.telegram_channel_id)!.push(trade)
      }

      // Group by author
      if (!tradesByAuthor.has(trade.author_id)) {
        tradesByAuthor.set(trade.author_id, [])
      }
      tradesByAuthor.get(trade.author_id)!.push(trade)
    }

    const notifications: any[] = []
    let totalNotificationsSent = 0

    // Process each channel
    for (const [channelId, channelTrades] of tradesByChannel) {
      const summary = calculateSummary(channelTrades)
      const winningTrades = channelTrades.filter(t => t.is_winning_trade || t.profit_from_entry > 20)
      const losingTrades = channelTrades.filter(t => t.profit_from_entry < -20)

      // Get channel details (channel_id is the telegram chat ID)
      const { data: channel } = await supabase
        .from('telegram_channels')
        .select('channel_id, channel_name')
        .eq('id', channelId)
        .single()

      if (!channel?.channel_id) {
        console.log(`⚠️ Channel ${channelId} has no chat ID`)
        continue
      }

      console.log(`📤 Sending report to channel: ${channel.channel_name}`)

      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!botToken) {
        console.error('❌ TELEGRAM_BOT_TOKEN not configured')
        continue
      }

      // Generate text summary
      const summaryText = generateSummaryText(summary, targetDate, channel.channel_name)

      // Send winning trades notification
      if (winningTrades.length > 0) {
        const winningText = generateWinningTradesText(winningTrades)
        const message = `🎯 *WINNING TRADES* (${targetDate})\n\n${winningText}`
        
        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
        const response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channel.channel_id,
            text: message,
            parse_mode: 'Markdown'
          })
        })
        
        if (response.ok) {
          totalNotificationsSent++
          console.log(`✅ Sent winning trades notification`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Send losing trades notification
      if (losingTrades.length > 0) {
        const losingText = generateLosingTradesText(losingTrades)
        const message = `⚠️ *LOSING TRADES* (${targetDate})\n\n${losingText}`
        
        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
        const response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channel.channel_id,
            text: message,
            parse_mode: 'Markdown'
          })
        })
        
        if (response.ok) {
          totalNotificationsSent++
          console.log(`✅ Sent losing trades notification`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Send summary
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channel.channel_id,
          text: summaryText,
          parse_mode: 'Markdown'
        })
      })
      
      if (response.ok) {
        totalNotificationsSent++
        console.log(`✅ Sent summary notification`)
      }
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Generate HTML report and store it
      const htmlReport = generateHTMLReport(channelTrades, targetDate, channel.channel_name)

      const { data: reportData, error: reportError } = await supabase
        .from('daily_trade_reports')
        .upsert({
          report_date: targetDate,
          telegram_channel_id: channelId,
          author_id: channelTrades[0].author_id,
          html_content: htmlReport,
          trade_count: channelTrades.length,
          summary: summary
        }, {
          onConflict: 'report_date,telegram_channel_id'
        })
        .select()
        .single()

      if (reportError) {
        console.error('Error storing report:', reportError)
      } else {
        console.log(`✅ Report stored for channel ${channel.channel_name}`)
      }

      // Upload HTML to storage and send as document
      await new Promise(resolve => setTimeout(resolve, 1000))
      await sendReportDocument(
        channelTrades[0].author_id,
        targetDate,
        channel.channel_id,
        htmlReport,
        supabase,
        botToken,
        channel.channel_name
      )
    }

    // Mark trades as notified
    const tradeIds = trades.map((t: any) => t.trade_id)
    if (tradeIds.length > 0) {
      await supabase
        .from('index_trades')
        .update({ daily_notified_at: new Date().toISOString() })
        .in('id', tradeIds)
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        total_trades: trades.length,
        channels: tradesByChannel.size,
        notifications_sent: totalNotificationsSent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function calculateSummary(trades: TradeData[]) {
  const winningTrades = trades.filter(t => t.is_winning_trade || t.profit_from_entry > 20)
  const losingTrades = trades.filter(t => t.profit_from_entry < -20)
  const totalProfit = trades.reduce((sum, t) => sum + (t.profit_from_entry || 0), 0)
  const maxProfit = Math.max(...trades.map(t => t.max_profit || 0), 0)
  const maxLoss = Math.min(...trades.map(t => t.profit_from_entry || 0), 0)
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length * 100) : 0

  return {
    total: trades.length,
    winning: winningTrades.length,
    losing: losingTrades.length,
    total_profit: totalProfit,
    max_profit: maxProfit,
    max_loss: maxLoss,
    win_rate: winRate
  }
}

function generateSummaryText(summary: any, date: string, channelName: string): string {
  const profitEmoji = summary.total_profit >= 0 ? '💰' : '📉'
  const profitText = summary.total_profit >= 0 
    ? `+$${summary.total_profit.toFixed(2)}`
    : `-$${Math.abs(summary.total_profit).toFixed(2)}`

  return `📊 *DAILY TRADING SUMMARY* \u2013 ${date}\n` +
    `${channelName ? `📢 ${channelName}\n\n` : '\n'}` +
    `📈 Total Trades: *${summary.total}*\n` +
    `✅ Winning: *${summary.winning}* trades\n` +
    `❌ Losing: *${summary.losing}* trades\n` +
    `🎯 Win Rate: *${summary.win_rate.toFixed(1)}%*\n\n` +
    `${profitEmoji} Total P&L: *${profitText}*\n` +
    `🏆 Biggest Win: *+$${summary.max_profit.toFixed(2)}*\n` +
    `⚠️ Biggest Loss: *${summary.max_loss.toFixed(2)}*`
}

function generateWinningTradesText(trades: TradeData[]): string {
  return trades.map((t, i) => {
    const emoji = t.max_profit >= 100 ? '🎯' : '✅'
    return `${emoji} *${t.underlying_symbol}* $${t.strike} ${t.option_type}\n` +
      `   Entry: $${t.entry_contract_price?.toFixed(2)} → Max: $${t.max_contract_price?.toFixed(2)}\n` +
      `   Max Profit: *+$${t.max_profit.toFixed(2)}* | Current: +$${t.profit_from_entry.toFixed(2)}`
  }).join('\n\n')
}

function generateLosingTradesText(trades: TradeData[]): string {
  return trades.map((t, i) => {
    const emoji = t.profit_from_entry <= -50 ? '❌' : '⚠️'
    return `${emoji} *${t.underlying_symbol}* $${t.strike} ${t.option_type}\n` +
      `   Entry: $${t.entry_contract_price?.toFixed(2)} → Current: $${t.current_contract_price?.toFixed(2)}\n` +
      `   Loss: *${t.profit_from_entry.toFixed(2)}*`
  }).join('\n\n')
}

async function sendReportDocument(
  authorId: string,
  date: string,
  chatId: string,
  htmlContent: string,
  supabase: any,
  botToken: string,
  channelName: string
) {
  try {
    console.log(`📄 Uploading report document for ${channelName}...`)

    const fileName = `daily-report-${date}.html`
    const filePath = `${authorId}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('daily-reports')
      .upload(filePath, htmlContent, {
        contentType: 'text/html',
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return
    }

    const { data: urlData } = await supabase.storage
      .from('daily-reports')
      .createSignedUrl(filePath, 604800)

    if (!urlData?.signedUrl) {
      console.error('Failed to get signed URL')
      return
    }

    console.log(`📤 Sending document to Telegram...`)

    const fileResponse = await fetch(urlData.signedUrl)
    const fileBlob = await fileResponse.blob()

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', fileBlob, fileName)
    formData.append('caption', `📊 Daily Trading Report - ${date}\n${channelName}`)

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      {
        method: 'POST',
        body: formData
      }
    )

    if (response.ok) {
      console.log(`✅ Report document sent successfully`)
    } else {
      const errorText = await response.text()
      console.error(`Failed to send document:`, errorText)
    }
  } catch (error) {
    console.error('Error sending report document:', error)
  }
}

function generateHTMLReport(trades: TradeData[], date: string, channelName: string): string {
  const summary = calculateSummary(trades)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; margin: 0; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; padding: 20px; background: #f9fafb; }
    .summary-card { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .summary-card .label { font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; }
    .summary-card .value { font-size: 24px; font-weight: 800; color: #111827; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #667eea; color: white; padding: 12px 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 12px 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    tr:nth-child(even) { background: #f9fafb; }
    .profit-pos { color: #059669; font-weight: 700; }
    .profit-neg { color: #dc2626; font-weight: 700; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
    .badge-long { background: #d1fae5; color: #065f46; }
    .badge-short { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Daily Trading Report</h1>
      <div>${date} • ${channelName}</div>
    </div>
    <div class="summary">
      <div class="summary-card"><div class="label">Total</div><div class="value">${summary.total}</div></div>
      <div class="summary-card"><div class="label">Winning</div><div class="value" style="color: #059669;">${summary.winning}</div></div>
      <div class="summary-card"><div class="label">Win Rate</div><div class="value" style="color: #667eea;">${summary.win_rate.toFixed(1)}%</div></div>
      <div class="summary-card"><div class="label">Total P&L</div><div class="value" style="color: ${summary.total_profit >= 0 ? '#059669' : '#dc2626'};">${summary.total_profit >= 0 ? '+' : ''}$${summary.total_profit.toFixed(2)}</div></div>
      <div class="summary-card"><div class="label">Max Win</div><div class="value" style="color: #059669;">+$${summary.max_profit.toFixed(2)}</div></div>
      <div class="summary-card"><div class="label">Max Loss</div><div class="value" style="color: #dc2626;">${summary.max_loss.toFixed(2)}</div></div>
    </div>
    <table>
      <thead><tr><th>Symbol</th><th>Direction</th><th>Contract</th><th>Entry</th><th>Max</th><th>Profit</th><th>Max Profit</th></tr></thead>
      <tbody>
        ${trades.map(t => `
          <tr>
            <td><strong>${t.underlying_symbol}</strong></td>
            <td><span class="badge ${t.direction === 'LONG' ? 'badge-long' : 'badge-short'}">${t.direction}</span></td>
            <td>$${t.strike} ${t.option_type}</td>
            <td>$${t.entry_contract_price?.toFixed(2)}</td>
            <td>$${t.max_contract_price?.toFixed(2) || 'N/A'}</td>
            <td class="${t.profit_from_entry >= 0 ? 'profit-pos' : 'profit-neg'}">${t.profit_from_entry >= 0 ? '+' : ''}$${t.profit_from_entry?.toFixed(2)}</td>
            <td class="${t.max_profit >= 0 ? 'profit-pos' : 'profit-neg'}">+$${t.max_profit?.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`
}
