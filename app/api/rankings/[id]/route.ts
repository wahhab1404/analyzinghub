import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
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
    const userId = params.id

    const { data: balance } = await supabase
      .from('user_points_balance')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const { data: stats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const { data: badges } = await supabase
      .from('user_badges')
      .select('badge_key, badge_name, badge_tier, awarded_at, metadata')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('awarded_at', { ascending: false })

    const { data: engagementStats } = await supabase
      .from('user_points_ledger')
      .select('event_type, points_delta')
      .eq('user_id', userId)
      .eq('role', 'trader')

    const engagementBreakdown = {
      likes: engagementStats?.filter((e) => e.event_type === 'like').length || 0,
      bookmarks: engagementStats?.filter((e) => e.event_type === 'bookmark').length || 0,
      reposts: engagementStats?.filter((e) => e.event_type === 'repost').length || 0,
      comments: engagementStats?.filter((e) => e.event_type === 'comment').length || 0,
      ratings: engagementStats?.filter((e) => e.event_type === 'rating').length || 0,
    }

    const analystRanking = {
      points: balance?.analyst_points_all_time || 0,
      weeklyPoints: balance?.analyst_points_weekly || 0,
      monthlyPoints: balance?.analyst_points_monthly || 0,
      winRate: stats?.win_rate || 0,
      wins: stats?.successful_analyses || 0,
      losses: stats?.failed_analyses || 0,
      closedAnalyses: stats?.closed_analyses || 0,
      targetHitsLast30Days: stats?.target_hits_last_30_days || 0,
      consecutiveStops: stats?.consecutive_stops || 0,
      badgeKeys: badges?.map((b) => b.badge_key) || [],
      badges: badges || [],
    }

    const traderRanking = {
      points: balance?.trader_points_all_time || 0,
      weeklyPoints: balance?.trader_points_weekly || 0,
      monthlyPoints: balance?.trader_points_monthly || 0,
      ...engagementBreakdown,
      totalRatings: stats?.total_ratings_given || 0,
      ratingAccuracy: stats?.rating_accuracy || 0,
      totalReposts: stats?.total_reposts || 0,
      successfulReposts: stats?.successful_reposts || 0,
      uniqueAnalystsFollowed: stats?.unique_analysts_followed || 0,
      uniqueSymbolsInteracted: stats?.unique_symbols_interacted || 0,
      badgeKeys: badges?.map((b) => b.badge_key) || [],
      badges: badges || [],
    }

    const { data: analystRank } = await supabase
      .from('leaderboard_cache')
      .select('rank')
      .eq('user_id', userId)
      .eq('type', 'analyst')
      .eq('scope', 'all_time')
      .maybeSingle()

    const { data: traderRank } = await supabase
      .from('leaderboard_cache')
      .select('rank')
      .eq('user_id', userId)
      .eq('type', 'trader')
      .eq('scope', 'all_time')
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      userId,
      analyst: {
        ...analystRanking,
        rank: analystRank?.rank || null,
      },
      trader: {
        ...traderRanking,
        rank: traderRank?.rank || null,
      },
    })
  } catch (error) {
    console.error('Rankings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
