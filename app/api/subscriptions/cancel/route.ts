import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // Environment variable validation
  const requiredEnvVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
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
    const { subscriptionId, mode = 'end_of_period' } = body

    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'Subscription ID is required' },
        { status: 400 }
      )
    }

    if (!['end_of_period', 'immediate'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid cancellation mode' },
        { status: 400 }
      )
    }

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .eq('subscriber_id', user.id)
      .single()

    if (subError || !subscription) {
      console.error('Subscription fetch error:', subError)
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      )
    }

    // Fetch plan name separately
    let planName = 'subscription'
    if (subscription.plan_id) {
      const { data: plan } = await supabase
        .from('analyzer_plans')
        .select('name')
        .eq('id', subscription.plan_id)
        .maybeSingle()

      if (plan) {
        planName = plan.name
      }
    }

    if (subscription.status === 'canceled' || subscription.status === 'expired') {
      return NextResponse.json(
        { error: 'Subscription already canceled or expired' },
        { status: 400 }
      )
    }

    let updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (mode === 'end_of_period') {
      updateData.cancel_at_period_end = true
    } else {
      updateData.status = 'canceled'
      updateData.canceled_at = new Date().toISOString()
      updateData.current_period_end = new Date().toISOString()
    }

    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscriptionId)
      .select()
      .single()

    if (updateError) {
      console.error('Subscription cancellation error:', updateError)
      console.error('Update data:', updateData)
      console.error('Subscription ID:', subscriptionId)
      return NextResponse.json(
        { error: 'Failed to cancel subscription', details: updateError.message },
        { status: 500 }
      )
    }

    console.log('Subscription canceled successfully:', {
      subscriptionId,
      mode,
      status: updatedSubscription?.status
    })

    if (mode === 'immediate') {
      const { error: membershipError } = await supabase
        .from('telegram_memberships')
        .update({ status: 'revoked' })
        .eq('subscription_id', subscriptionId)

      if (membershipError) {
        console.warn('Failed to revoke telegram membership:', membershipError)
      }
    }

    const { error: notifError } = await supabase.from('notifications').insert({
      user_id: subscription.analyst_id,
      type: 'subscription_canceled',
      title: 'Subscription Canceled',
      message: `A subscriber canceled their ${planName}`,
      is_read: false,
    })

    if (notifError) {
      console.warn('Failed to create notification:', notifError)
    }

    return NextResponse.json({
      ok: true,
      subscriptionId,
      status: mode === 'immediate' ? 'canceled' : subscription.status,
      cancelAtPeriodEnd: mode === 'end_of_period',
      message:
        mode === 'end_of_period'
          ? 'Subscription will be canceled at the end of the billing period'
          : 'Subscription canceled immediately',
    })
  } catch (error) {
    console.error('Subscription cancellation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
