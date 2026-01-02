import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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
    const supabase = createRouteHandlerClient(request)
    const adminClient = createClient(
      requiredEnvVars.NEXT_PUBLIC_SUPABASE_URL!,
      requiredEnvVars.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const analystId = searchParams.get('analystId')

    if (!analystId) {
      return NextResponse.json(
        { error: 'Analyst ID is required' },
        { status: 400 }
      )
    }

    const { data: subscription } = await adminClient
      .from('subscriptions')
      .select('*, analyzer_plans(name, billing_interval)')
      .eq('subscriber_id', user.id)
      .eq('analyst_id', analystId)
      .eq('status', 'active')
      .maybeSingle()

    if (!subscription) {
      return NextResponse.json({
        hasActiveSubscription: false,
        subscription: null,
      })
    }

    const now = new Date()
    const periodEnd = new Date(subscription.current_period_end)

    if (periodEnd < now) {
      return NextResponse.json({
        hasActiveSubscription: false,
        subscription: null,
      })
    }

    return NextResponse.json({
      hasActiveSubscription: true,
      subscription: {
        id: subscription.id,
        planName: subscription.analyzer_plans?.name,
        billingInterval: subscription.analyzer_plans?.billing_interval,
        periodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    })
  } catch (error) {
    console.error('Error checking subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
