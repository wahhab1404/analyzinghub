import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const envError = validateSupabaseEnvVariables(supabaseUrl, supabaseServiceKey)
    if (envError) return envError

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

    const { data: plans, error: plansError } = await supabase
      .from('analyzer_plans')
      .select('analyst_id')
      .eq('is_active', true)

    if (plansError) {
      console.error('Error fetching plans:', plansError)
      return NextResponse.json(
        { error: 'Failed to fetch plans' },
        { status: 500 }
      )
    }

    const analystIds = Array.from(new Set(plans?.map((p) => p.analyst_id) || []))

    if (analystIds.length === 0) {
      return NextResponse.json({ analyzers: [] })
    }

    const analyzersWithPlans = await Promise.all(
      analystIds.map(async (analystId) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, bio, roles!inner(name)')
          .eq('id', analystId)
          .single()

        if (!profile || (profile.roles as any)?.name !== 'Analyzer') {
          return null
        }

        const { count: planCount } = await supabase
          .from('analyzer_plans')
          .select('id', { count: 'exact', head: true })
          .eq('analyst_id', analystId)
          .eq('is_active', true)

        const { data: statsData, error: statsError } = await supabase.rpc('get_analyzer_stats', {
          analyzer_user_id: analystId,
        })

        if (statsError) {
          console.error('Error fetching analyzer stats:', statsError)
        }

        const stats = Array.isArray(statsData) && statsData.length > 0 ? statsData[0] : null

        return {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          stats: stats ? {
            success_rate: Math.round(parseFloat(stats.success_rate || '0')),
            total_analyses: Number(stats.total_analyses || 0),
            successful_analyses: Number(stats.successful_analyses || 0),
          } : {
            success_rate: 0,
            total_analyses: 0,
            successful_analyses: 0,
          },
          planCount: planCount || 0,
        }
      })
    )

    const filteredAnalyzers = analyzersWithPlans
      .filter((a) => a !== null)
      .sort((a, b) => (b?.stats?.success_rate || 0) - (a?.stats?.success_rate || 0))

    return NextResponse.json({ analyzers: filteredAnalyzers })
  } catch (error) {
    console.error('Error fetching marketplace:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
