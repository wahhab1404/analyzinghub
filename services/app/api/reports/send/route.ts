import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SendReportRequest {
  report_id: string
  channel_ids?: string[]
  send_as_image?: boolean
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Reports Send] Starting send request')
    const supabase = createRouteHandlerClient(request)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('[Reports Send] Unauthorized - no user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Reports Send] User authenticated:', user.id)

    const body: SendReportRequest = await request.json()
    const { report_id, channel_ids, send_as_image = false } = body

    console.log('[Reports Send] Request body:', { report_id, channel_ids, send_as_image })

    if (!report_id) {
      return NextResponse.json({ error: 'report_id is required' }, { status: 400 })
    }

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('*')
      .eq('id', report_id)
      .maybeSingle()

    if (reportError) {
      console.error('Error fetching report:', reportError)
      return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 })
    }

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.author_id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role:roles(name)')
        .eq('id', user.id)
        .maybeSingle()

      const roleName = (profile as any)?.role?.name
      if (roleName !== 'SuperAdmin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    let targetChannels = channel_ids

    if (!targetChannels || targetChannels.length === 0) {
      const { data: settings } = await supabase
        .from('report_settings')
        .select('default_channel_id, extra_channel_ids')
        .eq('analyst_id', report.author_id)
        .maybeSingle()

      if (settings) {
        targetChannels = [
          settings.default_channel_id,
          ...(settings.extra_channel_ids || [])
        ].filter(Boolean)
      }
    }

    if (!targetChannels || targetChannels.length === 0) {
      const { data: plans } = await supabase
        .from('analyzer_plans')
        .select(`
          id,
          telegram_channel_id,
          telegram_channels!telegram_channel_id(channel_id, channel_name)
        `)
        .eq('analyst_id', report.author_id)
        .eq('is_active', true)
        .not('telegram_channel_id', 'is', null)

      if (plans && plans.length > 0) {
        targetChannels = plans
          .map((p: any) => p.telegram_channels?.channel_id)
          .filter(Boolean)
      }
    }

    if (!targetChannels || targetChannels.length === 0) {
      console.error('[Reports Send] No channels configured for report')
      return NextResponse.json({ error: 'No channels configured' }, { status: 400 })
    }

    console.log('[Reports Send] Target channels:', targetChannels)

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      console.error('[Reports Send] Telegram bot token not configured')
      return NextResponse.json({ error: 'Telegram bot not configured' }, { status: 500 })
    }

    const summary = report.summary || {}
    const totalTrades = summary.total_trades || 0
    const activeTrades = summary.active_trades || 0
    const closedTrades = summary.closed_trades || 0
    const expiredTrades = summary.expired_trades || 0
    const avgProfit = summary.avg_profit_percent || 0
    const maxProfit = summary.max_profit_percent || 0
    const winRate = summary.win_rate || 0

    let imageBuffer: Buffer | null = null

    if (send_as_image) {
      console.log('[Reports] Generating image via edge function (internal satori)...')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase configuration')
      }

      const imageResponse = await fetch(
        `${supabaseUrl}/functions/v1/generate-report-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            report_id: report.id
          })
        }
      )

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text()
        console.error('[Reports] Failed to generate image:', imageResponse.status, errorText)
        throw new Error(`Image generation failed (${imageResponse.status}): ${errorText}`)
      }

      const arrayBuffer = await imageResponse.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
      console.log('[Reports] Image generated successfully, size:', imageBuffer.length)

      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Failed to generate report image - empty buffer')
      }
    }

    const results = []

    for (const channelId of targetChannels) {
      try {
        const { data: channelInfo } = await supabase
          .from('telegram_channels')
          .select('channel_name')
          .eq('channel_id', channelId)
          .maybeSingle()

        if (imageBuffer && imageBuffer.length > 0) {
          const caption = `📊 <b>Daily Trading Report</b> - ${report.report_date}\n\n🎯 Summary: ${totalTrades} trades | Avg: ${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(1)}% | Max: +${maxProfit.toFixed(1)}% | Win Rate: ${winRate.toFixed(1)}%`

          const formData = new FormData()
          formData.append('chat_id', channelId)
          formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), `report_${report.report_date}.png`)
          formData.append('caption', caption)
          formData.append('parse_mode', 'HTML')

          console.log(`[Reports] Sending photo to channel ${channelId}...`)
          const sendPhotoResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            body: formData
          })

          if (!sendPhotoResponse.ok) {
            const errorText = await sendPhotoResponse.text()
            console.error(`[Reports] Telegram API error for channel ${channelId}:`, errorText)
            throw new Error(`Telegram API error: ${errorText}`)
          }

          console.log(`[Reports] Photo sent successfully to channel ${channelId}`)
        } else {
          const textMessage = `📊 <b>Daily Trading Report</b>\n📅 ${report.report_date}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📊 <b>Summary</b>\n` +
            `• Total Trades: ${totalTrades}\n` +
            `• Active: ${activeTrades} | Closed: ${closedTrades} | Expired: ${expiredTrades}\n\n` +
            `📈 <b>Performance</b>\n` +
            `• Average Profit: ${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(1)}%\n` +
            `• Max Profit: +${maxProfit.toFixed(1)}%\n` +
            `• Win Rate: ${winRate.toFixed(1)}%\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`

          console.log(`[Reports] Sending text message to channel ${channelId}...`)
          const sendMessageResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: channelId,
              text: textMessage,
              parse_mode: 'HTML'
            })
          })

          if (!sendMessageResponse.ok) {
            const errorText = await sendMessageResponse.text()
            console.error(`[Reports] Telegram API error for channel ${channelId}:`, errorText)
            throw new Error(`Telegram API error: ${errorText}`)
          }

          console.log(`[Reports] Text message sent successfully to channel ${channelId}`)
        }

        const { data: delivery } = await supabase
          .from('report_deliveries')
          .insert({
            report_id: report.id,
            channel_id: channelId,
            channel_name: channelInfo?.channel_name,
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .select()
          .maybeSingle()

        results.push({
          channel_id: channelId,
          channel_name: channelInfo?.channel_name,
          status: 'sent',
          delivery_id: delivery?.id
        })

      } catch (error) {
        console.error(`Error sending to channel ${channelId}:`, error)

        await supabase
          .from('report_deliveries')
          .insert({
            report_id: report.id,
            channel_id: channelId,
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })

        results.push({
          channel_id: channelId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    await supabase
      .from('daily_trade_reports')
      .update({ status: 'sent' })
      .eq('id', report_id)

    return NextResponse.json({
      success: true,
      results,
      sent_as_image: imageBuffer !== null
    })

  } catch (error) {
    console.error('[Reports Send] Fatal error:', error)
    console.error('[Reports Send] Error stack:', error instanceof Error ? error.stack : 'No stack trace')

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorDetails = error instanceof Error ? error.stack : String(error)

    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { status: 500 }
    )
  }
}
