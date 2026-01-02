  import { NextRequest, NextResponse } from 'next/server'
  
  export async function GET(request: NextRequest) {
    try {
      // Check environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
      const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://analyzhub.com'
  
      // Debug info (remove in production)
      const envCheck = {
        hasSupabaseUrl: !!supabaseUrl,
        hasBotToken: !!botToken,
        hasWebhookSecret: !!webhookSecret,
        appBaseUrl
      }
  
      console.log('Environment check:', envCheck)
  
      if (!botToken) {
        return NextResponse.json({
          error: 'Bot token not configured',
          message: 'TELEGRAM_BOT_TOKEN environment variable is missing',
          envCheck
        }, { status: 400 })
      }
  
      if (botToken === 'YOUR_BOT_TOKEN_HERE') {
        return NextResponse.json({
          error: 'Bot token not configured properly',
          message: 'Please set a valid TELEGRAM_BOT_TOKEN',
          envCheck
        }, { status: 400 })
      }
  
      const webhookUrl = `${appBaseUrl}/api/telegram/webhook`
  
      console.log('Setting up webhook:', webhookUrl)
  
      // Set webhook with Telegram
      const webhookData: any = {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      }
  
      if (webhookSecret) {
        webhookData.secret_token = webhookSecret
      }
  
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookData),
        }
      )
  
      const result = await response.json()
  
      if (!result.ok) {
        return NextResponse.json({
          error: 'Failed to set webhook',
          details: result,
          envCheck
        }, { status: 500 })
      }
  
      // Get webhook info to confirm
      const infoResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getWebhookInfo`
      )
      const webhookInfo = await infoResponse.json()
  
      return NextResponse.json({
        success: true,
        message: 'Webhook configured successfully!',
        webhook: webhookInfo.result,
        envCheck
      })
    } catch (error: any) {
      console.error('Error setting up webhook:', error)
      return NextResponse.json({
        error: 'Internal server error',
        details: error.message,
        stack: error.stack
      }, { status: 500 })
    }
  }
