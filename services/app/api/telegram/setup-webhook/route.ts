import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey
      })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single()

    const roleName = (profile?.roles as any)?.name
    if (!profile || roleName !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    const { data: settings } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'telegram_bot_token')
      .maybeSingle()

    const botToken = settings?.setting_value || process.env.TELEGRAM_BOT_TOKEN

    if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
      return NextResponse.json({
        error: 'Bot token not configured',
        message: 'Please set TELEGRAM_BOT_TOKEN in environment variables or admin settings'
      }, { status: 400 })
    }

    const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://analyzhub.com'
    const webhookUrl = `${appUrl}/api/telegram/webhook`

    console.log('Setting up webhook:', webhookUrl)

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message'],
          drop_pending_updates: true,
        }),
      }
    )

    const result = await response.json()

    if (!result.ok) {
      return NextResponse.json({
        error: 'Failed to set webhook',
        details: result,
      }, { status: 500 })
    }

    const infoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    )
    const webhookInfo = await infoResponse.json()

    return NextResponse.json({
      success: true,
      webhook: webhookInfo.result,
      message: 'Webhook configured successfully'
    })
  } catch (error: any) {
    console.error('Error setting up webhook:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message,
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey
      })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single()

    const roleName = (profile?.roles as any)?.name
    if (!profile || roleName !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    const { data: settings } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'telegram_bot_token')
      .maybeSingle()

    const botToken = settings?.setting_value || process.env.TELEGRAM_BOT_TOKEN

    if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
      return NextResponse.json({
        error: 'Bot token not configured',
        configured: false,
      })
    }

    const infoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    )
    const webhookInfo = await infoResponse.json()

    return NextResponse.json({
      configured: true,
      webhook: webhookInfo.result,
    })
  } catch (error: any) {
    console.error('Error getting webhook info:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message,
    }, { status: 500 })
  }
}
