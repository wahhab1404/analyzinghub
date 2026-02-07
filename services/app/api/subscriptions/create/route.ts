import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('[Subscription Create] Starting subscription creation request')

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
    console.error(`[Subscription Create] Missing environment variables: ${missingVars.join(', ')}`)
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  console.log('[Subscription Create] Environment variables validated')

  try {
    const supabase = createClient(
      requiredEnvVars.NEXT_PUBLIC_SUPABASE_URL!,
      requiredEnvVars.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
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
      console.error('[Subscription Create] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Subscription Create] User authenticated:', user.id)

    const body = await request.json()
    const { planId, telegramUsername } = body

    console.log('[Subscription Create] Request body:', { planId, telegramUsername: telegramUsername ? 'provided' : 'not provided' })

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      )
    }

    // Check user's profile for telegram_username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_username')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      )
    }

    // If no telegram_username in profile and not provided in request, require it
    if (!profile.telegram_username && !telegramUsername) {
      return NextResponse.json(
        {
          error: 'Telegram username required',
          requiresTelegramUsername: true,
          message: 'Please provide your Telegram username to receive channel access'
        },
        { status: 400 }
      )
    }

    // If telegram username provided in request, update profile
    if (telegramUsername && telegramUsername !== profile.telegram_username) {
      const cleanUsername = telegramUsername.replace('@', '').trim()

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ telegram_username: cleanUsername })
        .eq('id', user.id)

      if (updateError) {
        console.error('Failed to update telegram username:', updateError)

        // Check if it's a unique constraint violation
        if (updateError.code === '23505' || updateError.message?.includes('duplicate key') || updateError.message?.includes('unique constraint')) {
          return NextResponse.json(
            {
              error: 'Telegram username already taken',
              requiresTelegramUsername: true,
              message: 'This Telegram username is already in use. Please try a different username.'
            },
            { status: 400 }
          )
        }

        return NextResponse.json(
          {
            error: 'Failed to save Telegram username',
            details: updateError.message
          },
          { status: 500 }
        )
      }
    }

    const finalUsername = telegramUsername ? telegramUsername.replace('@', '').trim() : profile.telegram_username

    console.log('[Subscription Create] Fetching plan:', planId)

    const { data: plan, error: planError } = await supabase
      .from('analyzer_plans')
      .select('*, analyst_id, max_subscribers, telegram_channel_id')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      console.error('[Subscription Create] Plan fetch error:', planError)
      return NextResponse.json(
        { error: 'Plan not found or inactive', details: planError?.message },
        { status: 404 }
      )
    }

    console.log('[Subscription Create] Plan found:', {
      planId: plan.id,
      analystId: plan.analyst_id,
      maxSubscribers: plan.max_subscribers,
      hasTelegramChannel: !!plan.telegram_channel_id
    })

    if (plan.analyst_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot subscribe to your own plan' },
        { status: 400 }
      )
    }

    console.log('[Subscription Create] Checking for existing subscriptions')

    const { data: existingSub, error: existingError } = await supabase
      .from('subscriptions')
      .select('id, status, current_period_end')
      .eq('subscriber_id', user.id)
      .eq('plan_id', planId)
      .maybeSingle()

    console.log('[Subscription Create] Existing subscription check:', {
      found: !!existingSub,
      status: existingSub?.status,
      id: existingSub?.id
    })

    if (existingSub) {
      if (existingSub.status === 'active') {
        const periodEnd = new Date(existingSub.current_period_end)
        const daysRemaining = Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

        return NextResponse.json(
          {
            error: 'Already subscribed to this plan',
            message: `You already have an active subscription to this plan. It expires in ${daysRemaining} days.`,
            daysRemaining
          },
          { status: 400 }
        )
      }

      // If subscription exists but is not active (canceled, expired, etc.), reactivate it
      console.log('[Subscription Create] Reactivating existing subscription')

      const startAt = new Date()
      const periodEnd = new Date()
      periodEnd.setDate(periodEnd.getDate() + (plan.billing_interval === 'year' ? 365 : 30))

      const { data: reactivatedSub, error: reactivateError } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          start_at: startAt.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          metadata: {
            telegram_username: finalUsername,
            reactivated_at: startAt.toISOString()
          }
        })
        .eq('id', existingSub.id)
        .select('*')
        .single()

      if (reactivateError) {
        console.error('[Subscription Create] Reactivation error:', reactivateError)
        return NextResponse.json(
          {
            error: 'Failed to reactivate subscription',
            details: reactivateError.message
          },
          { status: 500 }
        )
      }

      console.log('[Subscription Create] Subscription reactivated successfully')

      // Continue with the same Telegram invite logic
      let inviteLink = null
      let channelName = null
      let inviteSent = false

      if (plan.telegram_channel_id) {
        try {
          const botToken = requiredEnvVars.TELEGRAM_BOT_TOKEN

          // Get channel info
          const channelInfoResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/getChat?chat_id=${plan.telegram_channel_id}`
          )
          const channelInfo = await channelInfoResponse.json()

          if (channelInfo.ok) {
            channelName = channelInfo.result.title || channelInfo.result.username

            // If user provided username, send invite link
            if (finalUsername) {
              const inviteLinkResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: plan.telegram_channel_id,
                    member_limit: 1,
                    name: `Invite for @${finalUsername}`
                  })
                }
              )

              const inviteLinkData = await inviteLinkResponse.json()

              if (inviteLinkData.ok) {
                inviteLink = inviteLinkData.result.invite_link

                // Try to send the invite link via DM
                try {
                  const sendMessageResponse = await fetch(
                    `https://api.telegram.org/bot${botToken}/sendMessage`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: `@${finalUsername}`,
                        text: `🎉 Welcome! You've been subscribed to ${channelName}!\n\nClick here to join: ${inviteLink}`,
                        parse_mode: 'Markdown'
                      })
                    }
                  )
                  const sendResult = await sendMessageResponse.json()
                  inviteSent = sendResult.ok
                } catch (dmError) {
                  console.error('Failed to send DM:', dmError)
                }
              }
            }
          }
        } catch (telegramError) {
          console.error('Telegram integration error:', telegramError)
        }
      }

      return NextResponse.json({
        success: true,
        subscription: reactivatedSub,
        inviteLink,
        channelName,
        inviteSent,
        telegramUsername: finalUsername,
        message: 'Subscription reactivated successfully!'
      })
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

    const subscriptionData = {
      subscriber_id: user.id,
      analyst_id: plan.analyst_id,
      plan_id: planId,
      status: 'active' as const,
      start_at: startAt.toISOString(),
      current_period_end: periodEnd.toISOString(),
      provider: 'manual',
      cancel_at_period_end: false,
      metadata: {
        telegram_username: finalUsername
      }
    }

    console.log('[Subscription Create] Creating subscription with data:', subscriptionData)

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .insert(subscriptionData)
      .select('*')
      .single()

    if (subError) {
      console.error('[Subscription Create] Subscription creation error:', {
        error: subError,
        message: subError.message,
        details: subError.details,
        hint: subError.hint,
        code: subError.code
      })
      return NextResponse.json(
        {
          error: 'Failed to create subscription',
          details: subError.message,
          hint: subError.hint
        },
        { status: 500 }
      )
    }

    console.log('[Subscription Create] Subscription created successfully:', subscription.id)

    let inviteLink = null
    let channelName = null
    let inviteSent = false

    if (plan.telegram_channel_id) {
      const { data: channel } = await supabase
        .from('telegram_channels')
        .select('channel_id, channel_name')
        .eq('user_id', plan.analyst_id)
        .eq('id', plan.telegram_channel_id)
        .maybeSingle()

      if (channel) {
        channelName = channel.channel_name

        const { data: membership, error: membershipError } = await supabase
          .from('telegram_memberships')
          .insert({
            subscription_id: subscription.id,
            channel_id: channel.channel_id,
            status: 'pending',
          })
          .select('*')
          .single()

        if (!membershipError) {
          try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN
            if (botToken && finalUsername) {
              const telegramResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: channel.channel_id,
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

                  // Check if user has a chat_id (has started chat with bot)
                  const { data: telegramAccount } = await supabase
                    .from('telegram_accounts')
                    .select('chat_id')
                    .eq('user_id', user.id)
                    .is('revoked_at', null)
                    .maybeSingle()

                  const message = `🎉 Welcome to ${channelName}!\n\nYou have successfully subscribed. Click the link below to join the private channel:\n\n${inviteLink}\n\n⏰ This link expires in 24 hours.\n\nEnjoy exclusive content and analysis!`

                  if (telegramAccount?.chat_id) {
                    // User has chatted with bot, send DM directly
                    const sendResponse = await fetch(
                      `https://api.telegram.org/bot${botToken}/sendMessage`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          chat_id: telegramAccount.chat_id,
                          text: message,
                          parse_mode: 'HTML',
                        }),
                      }
                    )

                    if (sendResponse.ok) {
                      inviteSent = true
                    } else {
                      console.warn('Failed to send DM, will show link in UI')
                    }
                  } else {
                    // User hasn't started chat with bot yet
                    // Queue message in outbox for when they do
                    await supabase.from('telegram_outbox').insert({
                      message_type: 'channel_invite',
                      channel_id: telegramAccount?.chat_id || finalUsername,
                      payload: {
                        inviteLink,
                        channelName,
                        subscriptionId: subscription.id,
                        message
                      },
                      status: 'pending',
                      priority: 10
                    })

                    console.log('User has not started chat with bot, invite link queued in outbox and will be shown in UI')
                  }
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
      channelName,
      hasTelegramChannel: !!plan.telegram_channel_id,
      inviteSent,
      telegramUsername: finalUsername,
      message: inviteSent
        ? `Subscription activated! Channel invite sent to your Telegram (@${finalUsername})`
        : inviteLink
        ? `Subscription activated! Click the invite link below to join ${channelName || 'the channel'}.`
        : 'Subscription activated successfully!'
    })
  } catch (error: any) {
    console.error('Subscription creation error:', {
      error,
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error?.message,
        type: error?.name
      },
      { status: 500 }
    )
  }
}
