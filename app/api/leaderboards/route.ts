import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function validateSupabaseEnvVariables(url?: string, serviceKey?: string) {
  if (!url || !serviceKey) {
    console.error('Missing environment variables:', {
      hasUrl: !!url,
      hasKey: !!serviceKey
    })
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const envError = validateSupabaseEnvVariables(supabaseUrl, supabaseServiceKey)
    if (envError) return envError

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'analyst'
    const scope = searchParams.get('scope') || 'all_time'

    if (!['analyst', 'trader'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
    }

    if (!['weekly', 'monthly', 'all_time'].includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope parameter' }, { status: 400 })
    }

    const { data: cachedLeaderboard, error: cacheError } = await supabase
      .from('leaderboard_cache')
      .select(
        `
        rank,
        user_id,
        points,
        quality_score,
        metadata,
        generated_at,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `
      )
      .eq('scope', scope)
      .eq('type', type)
      .order('rank', { ascending: true })
      .limit(100)

    if (cacheError) {
      console.error('Leaderboard cache error:', cacheError)
      if (cacheError.code === '42P01' || cacheError.message?.includes('does not exist')) {
        return NextResponse.json({
          ok: true,
          scope,
          type,
          rows: [],
          cached: false,
          generatedAt: new Date().toISOString(),
        })
      }
    }

    if (cachedLeaderboard && cachedLeaderboard.length > 0) {
      const cacheAge = Date.now() - new Date(cachedLeaderboard[0].generated_at).getTime()
      const oneHour = 60 * 60 * 1000

      if (cacheAge < oneHour) {
        return NextResponse.json({
          ok: true,
          scope,
          type,
          rows: cachedLeaderboard.map((row) => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
            return {
              rank: row.rank,
              userId: row.user_id,
              fullName: profile?.full_name,
              avatarUrl: profile?.avatar_url,
              points: row.points,
              qualityScore: row.quality_score,
              ...row.metadata,
            }
          }),
          cached: true,
          generatedAt: cachedLeaderboard[0].generated_at,
        })
      }
    }

    const pointsField =
      scope === 'all_time'
        ? type === 'analyst'
          ? 'analyst_points_all_time'
          : 'trader_points_all_time'
        : scope === 'weekly'
        ? type === 'analyst'
          ? 'analyst_points_weekly'
          : 'trader_points_weekly'
        : type === 'analyst'
        ? 'analyst_points_monthly'
        : 'trader_points_monthly'

    const { data: leaderboard, error } = await supabase
      .from('user_points_balance')
      .select(
        `
        user_id,
        ${pointsField},
        profiles:user_id (
          id,
          full_name,
          avatar_url,
          roles!inner(name)
        )
      `
      )
      .gt(pointsField, 0)
      .order(pointsField, { ascending: false })
      .limit(100)

    if (error) {
      console.error('Leaderboard query error:', error)
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          ok: true,
          scope,
          type,
          rows: [],
          cached: false,
          generatedAt: new Date().toISOString(),
        })
      }
      return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
    }

    const roleName = type === 'analyst' ? 'Analyzer' : 'Trader'
    const filtered = (leaderboard || []).filter(
      (row) => (row.profiles as any)?.roles?.name === roleName
    )

    const userIds = filtered.map((row) => row.user_id)

    const { data: userStats } = await supabase
      .from('user_stats')
      .select('user_id, win_rate, closed_analyses, rating_accuracy')
      .in('user_id', userIds)

    const { data: userBadges } = await supabase
      .from('user_badges')
      .select('user_id, badge_key, badge_name, badge_tier, revoked_at')
      .in('user_id', userIds)
      .is('revoked_at', null)

    const statsMap = new Map(
      (userStats || []).map((stat) => [stat.user_id, stat])
    )

    const badgesMap = new Map<string, any[]>()
    ;(userBadges || []).forEach((badge) => {
      if (!badgesMap.has(badge.user_id)) {
        badgesMap.set(badge.user_id, [])
      }
      badgesMap.get(badge.user_id)?.push(badge)
    })

    const rows = filtered.map((row, index) => {
      const stats = statsMap.get(row.user_id)
      const badges = badgesMap.get(row.user_id) || []

      return {
        rank: index + 1,
        userId: row.user_id,
        fullName: (row.profiles as any)?.full_name,
        avatarUrl: (row.profiles as any)?.avatar_url,
        points: row[pointsField as keyof typeof row] as number,
        qualityScore: 1.0,
        winRate: stats?.win_rate,
        closedAnalyses: stats?.closed_analyses,
        ratingAccuracy: stats?.rating_accuracy,
        badges: badges.map((b: any) => ({
          key: b.badge_key,
          name: b.badge_name,
          tier: b.badge_tier,
        })),
      }
    })

    await supabase.from('leaderboard_cache').delete().eq('scope', scope).eq('type', type)

    const cacheInserts = rows.map((row) => ({
      scope,
      type,
      rank: row.rank,
      user_id: row.userId,
      points: row.points,
      quality_score: row.qualityScore,
      metadata: {
        winRate: row.winRate,
        closedAnalyses: row.closedAnalyses,
        ratingAccuracy: row.ratingAccuracy,
        badges: row.badges,
      },
    }))

    if (cacheInserts.length > 0) {
      await supabase.from('leaderboard_cache').insert(cacheInserts)
    }

    return NextResponse.json({
      ok: true,
      scope,
      type,
      rows,
      cached: false,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
