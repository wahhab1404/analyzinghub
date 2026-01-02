import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // Environment variable validation
  const requiredEnvVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
  }

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missingVars.length > 0) {
    console.error(`Missing environment variables: ${missingVars.join(', ')}`)
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  try {
    const supabase = createClient(
      requiredEnvVars.NEXT_PUBLIC_SUPABASE_URL!,
      requiredEnvVars.SUPABASE_SERVICE_ROLE_KEY!
    )

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { planId } = body

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      )
    }

    const { data: plan, error: planError } = await supabase
      .from('analyzer_plans')
      .select('*, analyst_id, max_subscribers')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Plan not found or inactive' },
        { status: 404 }
      )
    }

    if (plan.analyst_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot subscribe to your own plan' },
        { status: 400 }
      )
    }

    const { data: existingSub, error: existingError } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('subscriber_id', user.id)
      .eq('plan_id', planId)
      .maybeSingle()

    if (existingSub && existingSub.status === 'active') {
      return NextResponse.json(
        { error: 'Already subscribed to this plan' },
        { status: 400 }
      )
    }

    if (plan.max_subscribers) {
      let activeCount = 0
      try {
        const { data: count } = await supabase
          .rpc('get_plan_subscriber_count', { p_plan_id: planId })
        activeCount = count || 0
      } catch (rpcError) {
        console.warn('RPC function not available, falling back to direct query:', rpcError)
        const { count } = await supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('plan_id', planId)
          .in('status', ['active', 'trialing'])
        activeCount = count || 0
      }

      if (activeCount >= plan.max_subscribers) {
        return NextResponse.json(
          { error: 'Plan has reached maximum subscribers' },
          { status: 400 }
        )
      }
    }

    const startAt = new Date()
    const periodEnd = new Date()
    periodEnd.setDate(periodEnd.getDate() + (plan.billing_interval === 'year' ? 365 : 30))

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        subscriber_id: user.id,
        analyst_id: plan.analyst_id,
        plan_id: planId,
        status: 'active',
        start_at: startAt.toISOString(),
        current_period_end: periodEnd.toISOString(),
        provider: 'manual',
        cancel_at_period_end: false,
      })
      .select('*')
      .single()

    if (subError) {
      console.error('Subscription creation error:', subError)
      return NextResponse.json(
        { error: 'Failed to create subscription' },
        { status: 500 }
      )
    }

    let inviteLink = null

    if (plan.telegram_channel_id) {
      const { data: channel } = await supabase
        .from('telegram_channels')
        .select('channel_id')
        .eq('user_id', plan.analyst_id)
        .eq('channel_id', plan.telegram_channel_id)
        .maybeSingle()

      if (channel) {
        const { data: membership, error: membershipError } = await supabase
          .from('telegram_memberships')
          .insert({
            subscription_id: subscription.id,
            channel_id: plan.telegram_channel_id,
            status: 'pending',
          })
          .select('*')
          .single()

        if (!membershipError) {
          try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN
            if (botToken) {
              const telegramResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: plan.telegram_channel_id,
                    member_limit: 1,
                    expire_date: Math.floor(Date.now() / 1000) + 86400,
                  }),
                }
              )

              if (telegramResponse.ok) {
                const telegramData = await telegramResponse.json()
                if (telegramData.ok && telegramData.result?.invite_link) {
                  inviteLink = telegramData.result.invite_link

                  await supabase
                    .from('telegram_memberships')
                    .update({
                      invite_link: inviteLink,
                      status: 'invited',
                    })
                    .eq('id', membership.id)
                }
              }
            }
          } catch (error) {
            console.error('Telegram invite link creation failed:', error)
          }
        }
      }
    }

    await supabase.from('notifications').insert({
      user_id: plan.analyst_id,
      type: 'new_subscription',
      title: 'New Subscriber',
      message: `You have a new subscriber to your ${plan.name} plan!`,
      is_read: false,
    })

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      periodEnd: subscription.current_period_end,
      inviteLink,
    })
  } catch (error) {
    console.error('Subscription creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
