import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const planId = id

    const { data: existingPlan } = await supabase
      .from('analyzer_plans')
      .select('analyst_id')
      .eq('id', planId)
      .single()

    if (!existingPlan || existingPlan.analyst_id !== user.id) {
      return NextResponse.json(
        { error: 'Plan not found or unauthorized' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const {
      name,
      description,
      price_cents,
      billing_interval,
      features,
      telegram_channel_id,
      max_subscribers,
      is_active,
    } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (price_cents !== undefined) updateData.price_cents = price_cents
    if (billing_interval !== undefined) updateData.billing_interval = billing_interval
    if (features !== undefined) updateData.features = features
    if (telegram_channel_id !== undefined) updateData.telegram_channel_id = telegram_channel_id
    if (max_subscribers !== undefined) updateData.max_subscribers = max_subscribers
    if (is_active !== undefined) updateData.is_active = is_active

    const { data: plan, error: updateError } = await supabase
      .from('analyzer_plans')
      .update(updateData)
      .eq('id', planId)
      .select('*')
      .single()

    if (updateError) {
      console.error('Error updating plan:', updateError)
      return NextResponse.json(
        { error: `Failed to update plan: ${updateError.message || updateError.code || 'Unknown error'}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('Error updating plan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const planId = id

    const { data: existingPlan } = await supabase
      .from('analyzer_plans')
      .select('analyst_id')
      .eq('id', planId)
      .single()

    if (!existingPlan || existingPlan.analyst_id !== user.id) {
      return NextResponse.json(
        { error: 'Plan not found or unauthorized' },
        { status: 404 }
      )
    }

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

    if (activeCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete plan with active subscriptions' },
        { status: 400 }
      )
    }

    const { error: deleteError } = await supabase
      .from('analyzer_plans')
      .delete()
      .eq('id', planId)

    if (deleteError) {
      console.error('Error deleting plan:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete plan' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting plan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
