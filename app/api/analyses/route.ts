import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { PriceService } from '@/services/price/price.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'global'

    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get following and subscription status
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = new Set(following?.map(f => f.following_id) || [])

    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('analyst_id')
      .eq('subscriber_id', user.id)
      .eq('status', 'active')

    const subscribedToIds = new Set(subscriptions?.map(s => s.analyst_id) || [])

    if (type === 'following') {
      const followingUserIds = Array.from(followingIds)

      if (followingUserIds.length === 0) {
        return NextResponse.json({ analyses: [] })
      }

      const { data: analyses } = await supabase
        .from('analyses')
        .select(`
          *,
          profiles:analyzer_id (id, full_name, avatar_url),
          symbols (symbol),
          analysis_targets (price, expected_time),
          validation_events (event_type, target_number, price_at_hit, hit_at)
        `)
        .in('analyzer_id', followingUserIds)
        .order('created_at', { ascending: false })
        .limit(20)

      // Fetch analysis-plan associations
      const analysisIds = analyses?.map(a => a.id) || []
      const { data: analysisPlanLinks } = analysisIds.length > 0 ? await supabase
        .from('analysis_plans')
        .select('analysis_id, plan_id')
        .in('analysis_id', analysisIds)
        : { data: [] }

      // Get unique plan IDs
      const planIds = [...new Set(analysisPlanLinks?.map(ap => ap.plan_id) || [])]
      const { data: plans } = planIds.length > 0 ? await supabase
        .from('analyzer_plans')
        .select('id, analyst_id, name, is_active')
        .in('id', planIds)
        : { data: [] }

      // Map plans by their ID
      const plansMap = new Map()
      plans?.forEach(plan => {
        plansMap.set(plan.id, plan)
      })

      // Map analysis_id to their plans
      const analysisPlanMap = new Map<string, any[]>()
      analysisPlanLinks?.forEach(link => {
        if (!analysisPlanMap.has(link.analysis_id)) {
          analysisPlanMap.set(link.analysis_id, [])
        }
        const plan = plansMap.get(link.plan_id)
        if (plan) {
          analysisPlanMap.get(link.analysis_id)!.push(plan)
        }
      })

      const analysesWithPlans = analyses?.map(analysis => ({
        ...analysis,
        analyzer_plans: analysisPlanMap.get(analysis.id) || []
      }))

      // Get subscribed plan IDs
      const { data: mySubscriptions } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('subscriber_id', user.id)
        .eq('status', 'active')

      const subscribedPlanIds = new Set(mySubscriptions?.map(s => s.plan_id) || [])

      // Filter analyses based on visibility
      const filteredAnalyses = analysesWithPlans?.filter(analysis => {
        const isOwnPost = analysis.analyzer_id === user.id
        const isFollowing = followingIds.has(analysis.analyzer_id)
        const isSubscribedToAnalyst = subscribedToIds.has(analysis.analyzer_id)

        // Author always sees their own posts
        if (isOwnPost) return true

        // Check visibility
        if (analysis.visibility === 'public') return true
        if (analysis.visibility === 'followers' && isFollowing) return true

        // For subscriber-only content, check plan-specific subscription
        if (analysis.visibility === 'subscribers') {
          // If analysis has specific plans, user must be subscribed to at least one
          if (analysis.analyzer_plans && analysis.analyzer_plans.length > 0) {
            return analysis.analyzer_plans.some((plan: any) => subscribedPlanIds.has(plan.id))
          }
          // No specific plans means any subscription to the analyst works
          return isSubscribedToAnalyst
        }

        if (analysis.visibility === 'private') return false

        return false
      }) || []

      const analysesWithStatus = filteredAnalyses.map(analysis => ({
        ...analysis,
        is_following: true,
        is_own_post: analysis.analyzer_id === user.id,
        is_subscribed: subscribedToIds.has(analysis.analyzer_id)
      }))

      return NextResponse.json({ analyses: analysesWithStatus })
    }

    const { data: analyses } = await supabase
      .from('analyses')
      .select(`
        *,
        profiles:analyzer_id (id, full_name, avatar_url),
        symbols (symbol),
        analysis_targets (price, expected_time),
        validation_events (event_type, target_number, price_at_hit, hit_at)
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    // Fetch analysis-plan associations
    const analysisIds = analyses?.map(a => a.id) || []
    const { data: analysisPlanLinks } = analysisIds.length > 0 ? await supabase
      .from('analysis_plans')
      .select('analysis_id, plan_id')
      .in('analysis_id', analysisIds)
      : { data: [] }

    // Get unique plan IDs
    const planIds = [...new Set(analysisPlanLinks?.map(ap => ap.plan_id) || [])]
    const { data: plans } = planIds.length > 0 ? await supabase
      .from('analyzer_plans')
      .select('id, analyst_id, name, is_active')
      .in('id', planIds)
      : { data: [] }

    // Map plans by their ID
    const plansMap = new Map()
    plans?.forEach(plan => {
      plansMap.set(plan.id, plan)
    })

    // Map analysis_id to their plans
    const analysisPlanMap = new Map<string, any[]>()
    analysisPlanLinks?.forEach(link => {
      if (!analysisPlanMap.has(link.analysis_id)) {
        analysisPlanMap.set(link.analysis_id, [])
      }
      const plan = plansMap.get(link.plan_id)
      if (plan) {
        analysisPlanMap.get(link.analysis_id)!.push(plan)
      }
    })

    const analysesWithPlans = analyses?.map(analysis => ({
      ...analysis,
      analyzer_plans: analysisPlanMap.get(analysis.id) || []
    }))

    // Get subscribed plan IDs
    const { data: mySubscriptions } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('subscriber_id', user.id)
      .eq('status', 'active')

    const subscribedPlanIds = new Set(mySubscriptions?.map(s => s.plan_id) || [])

    // Filter analyses based on visibility
    const filteredAnalyses = analysesWithPlans?.filter(analysis => {
      const isOwnPost = analysis.analyzer_id === user.id
      const isFollowing = followingIds.has(analysis.analyzer_id)
      const isSubscribedToAnalyst = subscribedToIds.has(analysis.analyzer_id)

      // Author always sees their own posts
      if (isOwnPost) return true

      // Check visibility
      if (analysis.visibility === 'public') return true
      if (analysis.visibility === 'followers' && isFollowing) return true

      // For subscriber-only content, check plan-specific subscription
      if (analysis.visibility === 'subscribers') {
        // If analysis has specific plans, user must be subscribed to at least one
        if (analysis.analyzer_plans && analysis.analyzer_plans.length > 0) {
          return analysis.analyzer_plans.some((plan: any) => subscribedPlanIds.has(plan.id))
        }
        // No specific plans means any subscription to the analyst works
        return isSubscribedToAnalyst
      }

      if (analysis.visibility === 'private') return false

      return false
    }) || []

    const analysesWithFollowStatus = filteredAnalyses.map(analysis => ({
      ...analysis,
      is_following: followingIds.has(analysis.analyzer_id),
      is_own_post: analysis.analyzer_id === user.id,
      is_subscribed: subscribedToIds.has(analysis.analyzer_id)
    }))

    return NextResponse.json({ analyses: analysesWithFollowStatus })
  } catch (err: any) {
    console.error('GET_ANALYSES_ERROR:', {
      message: err.message,
      stack: err.stack,
      details: err
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('POST_AUTH_CHECK:', {
      hasUser: !!user,
      userId: user?.id,
      userError: userError?.message,
      cookies: req.cookies.getAll().map(c => c.name)
    })

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const postType = body.post_type || 'analysis'

    console.log('POST_REQUEST_BODY:', {
      postType,
      hasSymbol: !!body.symbol,
      hasDirection: !!body.direction,
      hasStopLoss: !!body.stopLoss,
      hasTelegramChannelId: !!body.telegramChannelId,
      bodyKeys: Object.keys(body)
    })

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, roles(*)')
      .eq('id', user.id)
      .maybeSingle()

    console.log('USER_PROFILE_CHECK:', {
      userId: user.id,
      profile,
      roleName: profile?.roles?.name
    })

    if (!profile || profile.roles?.name !== 'Analyzer') {
      return NextResponse.json({ error: 'Only analyzers can create posts' }, { status: 403 })
    }

    // Validate symbol is required for all post types
    if (!body.symbol || typeof body.symbol !== 'string' || body.symbol.trim() === '') {
      console.error('VALIDATION_ERROR: Missing or invalid symbol')
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    }

    // Validate required fields based on post type
    if (postType === 'analysis') {
      if (!body.direction) {
        console.error('VALIDATION_ERROR: Missing direction for analysis post')
        return NextResponse.json({ error: 'Direction is required for analysis posts' }, { status: 400 })
      }
      if (body.stopLoss === undefined || body.stopLoss === null || body.stopLoss === '') {
        console.error('VALIDATION_ERROR: Missing stopLoss for analysis post')
        return NextResponse.json({ error: 'Stop loss is required for analysis posts' }, { status: 400 })
      }
    } else if (postType === 'news') {
      if (!body.title || !body.summary) {
        console.error('VALIDATION_ERROR: Missing title or summary for news post')
        return NextResponse.json({ error: 'Title and summary are required for news posts' }, { status: 400 })
      }
    } else if (postType === 'article') {
      if (!body.title || !body.content) {
        console.error('VALIDATION_ERROR: Missing title or content for article post')
        return NextResponse.json({ error: 'Title and content are required for article posts' }, { status: 400 })
      }
    }

    let symbolId: string
    const { data: existingSymbol } = await supabase
      .from('symbols')
      .select('id')
      .eq('symbol', body.symbol.toUpperCase().trim())
      .maybeSingle()

    if (existingSymbol) {
      symbolId = existingSymbol.id
    } else {
      const { data: newSymbol, error: symbolError } = await supabase
        .from('symbols')
        .insert({ symbol: body.symbol.toUpperCase().trim() })
        .select('id')
        .single()

      if (symbolError) {
        return NextResponse.json({ error: symbolError.message }, { status: 400 })
      }
      symbolId = newSymbol.id
    }

    // Fetch current price for the symbol
    let currentPrice: number | null = null
    try {
      const priceService = new PriceService()
      const priceData = await priceService.getCurrentPrice(body.symbol.toUpperCase().trim())
      currentPrice = priceData.price
      console.log('FETCHED_CURRENT_PRICE:', {
        symbol: body.symbol,
        price: currentPrice
      })
    } catch (priceError: any) {
      console.warn('Could not fetch current price:', {
        symbol: body.symbol,
        error: priceError.message
      })
      // Continue without price - it's not critical for posting
    }

    const insertData: any = {
      analyzer_id: user.id,
      symbol_id: symbolId,
      post_type: postType,
      chart_image_url: body.chartImageUrl || null,
      description: body.description || null,
      visibility: body.visibility || 'public',
      price_at_post: currentPrice,
    }

    console.log('BEFORE_INSERT:', {
      userId: user.id,
      symbolId,
      postType,
      insertDataKeys: Object.keys(insertData),
      analyzerId: insertData.analyzer_id,
      priceAtPost: currentPrice
    })

    if (postType === 'analysis') {
      insertData.direction = body.direction
      insertData.stop_loss = parseFloat(body.stopLoss)
      insertData.analysis_type = body.analysisType || 'classic'
      insertData.chart_frame = body.chartFrame || null

      // Handle activation conditions
      if (body.activationEnabled) {
        if (!body.activationType || !body.activationPrice || !body.activationTimeframe) {
          return NextResponse.json(
            { error: 'When activation is enabled, activationType, activationPrice, and activationTimeframe are required' },
            { status: 400 }
          )
        }

        insertData.activation_enabled = true
        insertData.activation_type = body.activationType
        insertData.activation_price = parseFloat(body.activationPrice)
        insertData.activation_timeframe = body.activationTimeframe
        insertData.activation_status = 'published_inactive'
        insertData.activation_notes = body.activationNotes || null
      } else {
        insertData.activation_enabled = false
        insertData.activation_status = 'active'
      }
    } else if (postType === 'news') {
      insertData.title = body.title
      insertData.summary = body.summary
      insertData.source_url = body.sourceUrl || null
    } else if (postType === 'article') {
      insertData.title = body.title
      insertData.content = body.content
    }

    // Use service role client for insert since we've already validated the user
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Analyses] Missing Supabase environment variables for service role')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { data: analysis, error } = await supabaseAdmin
      .from('analyses')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('INSERT_ANALYSIS_ERROR:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        userId: user.id,
        insertData
      })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (postType === 'analysis' && body.targets && body.targets.length > 0) {
      const targetsData = body.targets
        .filter((target: any) => target.price && target.price.trim() !== '')
        .map((target: any) => {
          const targetData: any = {
            analysis_id: analysis.id,
            price: parseFloat(target.price),
          }

          // Add expected_time only if provided
          if (target.expectedTime && target.expectedTime.trim() !== '') {
            const expectedDate = new Date(target.expectedTime)
            if (isNaN(expectedDate.getTime())) {
              throw new Error(`Invalid date format for target: ${target.expectedTime}`)
            }
            targetData.expected_time = expectedDate.toISOString()
          }

          return targetData
        })

      if (targetsData.length > 0) {
        const { error: targetsError } = await supabaseAdmin
          .from('analysis_targets')
          .insert(targetsData)

        if (targetsError) {
          console.error('Error inserting targets:', targetsError)
          return NextResponse.json({ error: targetsError.message }, { status: 400 })
        }
      }
    }

    // Insert plan associations if provided
    if (body.planIds && Array.isArray(body.planIds) && body.planIds.length > 0) {
      const planLinks = body.planIds.map((planId: string) => ({
        analysis_id: analysis.id,
        plan_id: planId
      }))

      const { error: planLinksError } = await supabaseAdmin
        .from('analysis_plans')
        .insert(planLinks)

      if (planLinksError) {
        console.error('INSERT_PLAN_LINKS_ERROR:', planLinksError)
      }
    }

    // Broadcast to Telegram channels
    const broadcastChannels = [];

    console.log('TELEGRAM_BROADCAST_PREPARATION:', {
      analysisId: analysis.id,
      visibility: analysis.visibility,
      userId: user.id,
      hasPlanIds: !!(body.planIds && body.planIds.length > 0),
      planIds: body.planIds
    })

    // 1. Get plan-specific channels if plans are selected
    if (body.planIds && Array.isArray(body.planIds) && body.planIds.length > 0) {
      const { data: planChannels, error: planChannelsError } = await supabaseAdmin
        .from('telegram_channels')
        .select('id, channel_id, channel_name, linked_plan_id')
        .eq('user_id', user.id)
        .in('linked_plan_id', body.planIds)
        .eq('enabled', true)
        .not('verified_at', 'is', null)

      console.log('PLAN_SPECIFIC_CHANNELS_QUERY:', {
        found: planChannels?.length || 0,
        channels: planChannels,
        error: planChannelsError
      })

      if (planChannels && planChannels.length > 0) {
        broadcastChannels.push(...planChannels.map(ch => ({
          id: ch.id,
          telegram_channel_id: ch.channel_id,
          plan_id: ch.linked_plan_id,
          type: 'plan-specific'
        })))
      }
    }

    // 2. Always get the platform default channel for the analysis visibility
    const { data: defaultChannel, error: defaultChannelError } = await supabaseAdmin
      .from('telegram_channels')
      .select('id, channel_id, channel_name, audience_type, is_platform_default')
      .eq('user_id', user.id)
      .eq('audience_type', analysis.visibility)
      .eq('is_platform_default', true)
      .eq('enabled', true)
      .not('verified_at', 'is', null)
      .maybeSingle()

    console.log('PLATFORM_DEFAULT_CHANNEL_QUERY:', {
      found: !!defaultChannel,
      channel: defaultChannel,
      error: defaultChannelError,
      searchCriteria: {
        userId: user.id,
        audienceType: analysis.visibility,
        isPlatformDefault: true,
        enabled: true
      }
    })

    if (defaultChannel) {
      // Check if we haven't already added this channel (avoid duplicates)
      const alreadyAdded = broadcastChannels.some(ch => ch.id === defaultChannel.id)
      if (!alreadyAdded) {
        broadcastChannels.push({
          id: defaultChannel.channel_id,
          telegram_channel_id: defaultChannel.channel_id,
          plan_id: null,
          type: 'platform-default'
        })
        console.log('ADDED_PLATFORM_DEFAULT_CHANNEL:', defaultChannel.channel_name)
      } else {
        console.log('SKIPPED_DUPLICATE_PLATFORM_DEFAULT_CHANNEL:', defaultChannel.channel_name)
      }
    }

    // 3. Broadcast to all collected channels
    console.log('FINAL_BROADCAST_CHANNELS:', {
      totalChannels: broadcastChannels.length,
      channels: broadcastChannels.map(ch => ({
        name: ch.telegram_channel_id,
        type: ch.type,
        planId: ch.plan_id
      }))
    })

    if (broadcastChannels.length > 0) {
      for (const channel of broadcastChannels) {
        try {
          console.log('TELEGRAM_BROADCAST_START:', {
            analysisId: analysis.id,
            userId: user.id,
            channelId: channel.id,
            planId: channel.plan_id,
            type: channel.type
          })

          const broadcastResponse = await fetch(`${req.nextUrl.origin}/api/telegram/channel/broadcast-new-analysis`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              analysisId: analysis.id,
              userId: user.id,
              channelId: channel.telegram_channel_id || channel.id,
            }),
          });

          const broadcastResult = await broadcastResponse.json()
          console.log('TELEGRAM_BROADCAST_RESULT:', {
            channelId: channel.id,
            planId: channel.plan_id,
            type: channel.type,
            status: broadcastResponse.status,
            ok: broadcastResponse.ok,
            result: broadcastResult
          })

          if (!broadcastResponse.ok) {
            console.error('Failed to broadcast new post to channel:', {
              channelId: channel.id,
              planId: channel.plan_id,
              type: channel.type,
              status: broadcastResponse.status,
              error: broadcastResult.error,
              details: broadcastResult.details
            });
          }
        } catch (broadcastError: any) {
          console.error('Failed to broadcast new post to channel (exception):', {
            channelId: channel.id,
            message: broadcastError.message,
            stack: broadcastError.stack
          });
        }
      }
    } else {
      console.log('No Telegram channels to broadcast to:', {
        visibility: analysis.visibility,
        userId: user.id,
        analysisId: analysis.id
      })
    }

    return NextResponse.json({ analysis }, { status: 201 })
  } catch (err: any) {
    console.error('CREATE_POST_ERROR:', {
      message: err.message,
      stack: err.stack,
      details: err
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      },
      { status: 500 }
    )
  }
}
