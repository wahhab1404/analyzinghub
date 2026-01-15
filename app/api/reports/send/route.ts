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
    const supabase = createRouteHandlerClient(request)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SendReportRequest = await request.json()
    const { report_id, channel_ids, send_as_image = false } = body

    if (!report_id) {
      return NextResponse.json({ error: 'report_id is required' }, { status: 400 })
    }

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('*')
      .eq('id', report_id)
      .single()

    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.author_id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role:roles(name)')
        .eq('id', user.id)
        .single()

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
        .single()

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
      return NextResponse.json({ error: 'No channels configured' }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
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

    console.log('[Reports] Generating image via ApiFlash...')
    try {
      const imageResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-report-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            report_id: report.id
          })
        }
      )

      if (imageResponse.ok) {
        const arrayBuffer = await imageResponse.arrayBuffer()
        imageBuffer = Buffer.from(arrayBuffer)
        console.log('[Reports] Image generated successfully, size:', imageBuffer.length)
      } else {
        const errorText = await imageResponse.text()
        console.error('[Reports] Failed to generate image:', errorText)
        throw new Error(`Image generation failed: ${errorText}`)
      }
    } catch (err) {
      console.error('[Reports] Error generating image:', err)
      throw new Error(`Failed to generate report image: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }

    if (!imageBuffer) {
      throw new Error('Failed to generate report image')
    }

    const results = []

    for (const channelId of targetChannels) {
      try {
        const { data: channelInfo } = await supabase
          .from('telegram_channels')
          .select('channel_name')
          .eq('channel_id', channelId)
          .single()

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
          .single()

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
      results
    })

  } catch (error) {
    console.error('Error sending report:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
