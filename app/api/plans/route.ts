import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseSSRClient, createSupabaseServiceClient } from '@/lib/supabase/ssr'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const analystId = searchParams.get('analystId')
    const showAll = searchParams.get('showAll')

    if (!analystId) {
      return NextResponse.json({ plans: [] })
    }

    const supabase = createSupabaseSSRClient()
    let query = supabase
      .from('analyzer_plans')
      .select('*')
      .eq('analyst_id', analystId)

    if (showAll === 'true') {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required to view all plans' },
          { status: 401 }
        )
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id, roles!inner(name)')
        .eq('id', user.id)
        .single()

      const isOwner = user.id === analystId
      const isAdmin = (profile?.roles as any)?.name === 'Admin'

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden: You can only view all plans for your own account' },
          { status: 403 }
        )
      }
    } else {
      query = query.eq('is_active', true)
    }

    const { data: plans, error } = await query.order('price_cents', { ascending: true })

    if (error) {
      console.error('[/api/plans GET] Error fetching plans:', error)
      return NextResponse.json(
        { error: 'Failed to fetch plans', details: error.message },
        { status: 500 }
      )
    }

    const plansWithCounts = (plans || []).map(plan => ({
      ...plan,
      subscriberCount: 0
    }))

    return NextResponse.json({ plans: plansWithCounts })
  } catch (error: any) {
    console.error('[/api/plans GET] Unhandled error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseSSRClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[/api/plans POST] Profile fetch error:', profileError)
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      )
    }

    if ((profile.roles as any)?.name !== 'Analyzer') {
      return NextResponse.json(
        { error: 'Only analyzers can create plans' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      name,
      description,
      price_cents = 0,
      billing_interval = 'month',
      features = {},
      telegram_channel_id,
      max_subscribers,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Plan name is required' },
        { status: 400 }
      )
    }

    if (!['month', 'year'].includes(billing_interval)) {
      return NextResponse.json(
        { error: 'Invalid billing interval' },
        { status: 400 }
      )
    }

    const { data: plan, error: planError } = await supabase
      .from('analyzer_plans')
      .insert({
        analyst_id: user.id,
        name,
        description,
        price_cents,
        billing_interval,
        features,
        telegram_channel_id,
        max_subscribers,
        is_active: true,
      })
      .select('*')
      .single()

    if (planError) {
      console.error('[/api/plans POST] Error creating plan:', planError)
      return NextResponse.json(
        { error: 'Failed to create plan', details: planError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ plan })
  } catch (error: any) {
    console.error('[/api/plans POST] Unhandled error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
