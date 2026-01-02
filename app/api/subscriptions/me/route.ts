import { NextResponse } from 'next/server'
import { createSupabaseSSRClient } from '@/lib/supabase/ssr'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createSupabaseSSRClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: subscriptions, error: subsError } = await supabase
      .from('subscriptions')
      .select(`
        *,
        analyzer_plans (
          id,
          name,
          description,
          price_cents,
          billing_interval,
          features,
          telegram_channel_id
        ),
        analyst:profiles!subscriptions_analyst_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('subscriber_id', user.id)
      .order('created_at', { ascending: false })

    if (subsError) {
      console.error('[/api/subscriptions/me GET] Error fetching subscriptions:', {
        code: subsError.code,
        message: subsError.message,
        details: subsError.details,
        hint: subsError.hint
      })
      if (subsError.code === '42P01' || subsError.message?.includes('does not exist')) {
        return NextResponse.json({ subscriptions: [] })
      }
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions', details: subsError.message },
        { status: 500 }
      )
    }

    const subscriptionsWithLinks = await Promise.all(
      (subscriptions || []).map(async (sub) => {
        let inviteLink = null

        if (sub.analyzer_plans?.telegram_channel_id) {
          try {
            const { data: membership } = await supabase
              .from('telegram_memberships')
              .select('invite_link, status')
              .eq('subscription_id', sub.id)
              .eq('channel_id', sub.analyzer_plans.telegram_channel_id)
              .maybeSingle()

            if (membership && membership.status === 'invited' && membership.invite_link) {
              inviteLink = membership.invite_link
            }
          } catch (membershipError) {
            console.warn('telegram_memberships table not available, skipping invite link:', membershipError)
          }
        }

        return {
          ...sub,
          inviteLink,
        }
      })
    )

    return NextResponse.json({
      subscriptions: subscriptionsWithLinks,
    })
  } catch (error: any) {
    console.error('[/api/subscriptions/me GET] Unhandled error:', {
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
