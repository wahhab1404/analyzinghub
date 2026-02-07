import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.role as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: userGrowthData } = await supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    const userGrowth = processTimeSeriesData(userGrowthData || [], 'created_at')

    const { data: contentData } = await supabase
      .from('analyses')
      .select('direction')

    const contentStats = [
      { name: 'Bullish', value: contentData?.filter(a => a.direction === 'BULLISH').length || 0 },
      { name: 'Bearish', value: contentData?.filter(a => a.direction === 'BEARISH').length || 0 },
      { name: 'Neutral', value: contentData?.filter(a => a.direction === 'NEUTRAL').length || 0 },
    ]

    const { data: engagementData } = await supabase
      .from('engagement_events')
      .select('event_type, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())

    const engagementByDate = processEngagementData(engagementData || [])

    return NextResponse.json({
      userGrowth,
      contentStats,
      engagementData: engagementByDate,
    })
  } catch (error) {
    console.error('Admin analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function processTimeSeriesData(data: any[], dateField: string) {
  const grouped = data.reduce((acc, item) => {
    const date = new Date(item[dateField]).toLocaleDateString()
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return Object.entries(grouped).map(([date, users]) => ({ date, users }))
}

function processEngagementData(data: any[]) {
  const grouped = data.reduce((acc, item) => {
    const date = new Date(item.created_at).toLocaleDateString()
    if (!acc[date]) {
      acc[date] = { date, likes: 0, comments: 0, reposts: 0 }
    }
    if (item.event_type === 'like') acc[date].likes++
    if (item.event_type === 'comment') acc[date].comments++
    if (item.event_type === 'repost') acc[date].reposts++
    return acc
  }, {} as Record<string, any>)

  return Object.values(grouped)
}
