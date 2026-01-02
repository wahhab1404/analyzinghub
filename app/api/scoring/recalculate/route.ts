import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { badgeService } from '@/services/scoring/badge.service'

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

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const envError = validateSupabaseEnvVariables(supabaseUrl, supabaseServiceKey)
    if (envError) return envError

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

    const apiKey = request.headers.get('X-API-Key')
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting nightly recalculation...')

    await supabase.rpc('update_points_balance')

    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .limit(1000)

    if (!users) {
      return NextResponse.json({ error: 'No users found' }, { status: 500 })
    }

    let statsUpdated = 0
    let badgesAwarded = 0
    let badgesRevoked = 0

    for (const user of users) {
      try {
        await supabase.rpc('calculate_user_stats', { p_user_id: user.id })
        statsUpdated++

        const badgeResult = await badgeService.evaluateAndAwardBadges(user.id)
        badgesAwarded += badgeResult.awarded.length
        badgesRevoked += badgeResult.revoked.length
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error)
      }
    }

    const scopes = ['weekly', 'monthly', 'all_time']
    const types = ['analyst', 'trader']
    let leaderboardsGenerated = 0

    for (const scope of scopes) {
      for (const type of types) {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/leaderboards?type=${type}&scope=${scope}`,
            {
              headers: {
                'X-API-Key': process.env.INTERNAL_API_KEY || '',
              },
            }
          )

          if (response.ok) {
            leaderboardsGenerated++
          }
        } catch (error) {
          console.error(`Error generating ${type} ${scope} leaderboard:`, error)
        }
      }
    }

    await supabase
      .from('daily_points_cap')
      .delete()
      .lt('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

    console.log('Nightly recalculation complete', {
      statsUpdated,
      badgesAwarded,
      badgesRevoked,
      leaderboardsGenerated,
    })

    return NextResponse.json({
      ok: true,
      statsUpdated,
      badgesAwarded,
      badgesRevoked,
      leaderboardsGenerated,
    })
  } catch (error) {
    console.error('Recalculation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
