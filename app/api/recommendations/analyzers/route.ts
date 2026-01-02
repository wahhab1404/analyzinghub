import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { RecommendationService } from '@/services/recommendations/recommendation.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)
    const adminClient = createServiceRoleClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        recommendations: [],
        meta: { limit: 0, offset: 0, total: 0 }
      })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = parseInt(searchParams.get('offset') || '0')

    const recommendationService = new RecommendationService(supabase, adminClient)
    let recommendations: any[] = []
    try {
      recommendations = await recommendationService.recommendAnalyzers(
        user.id,
        limit,
        offset
      )
    } catch (recError: any) {
      console.error('Recommendation service error:', recError)
      recommendations = []
    }

    const analyzerIds = recommendations.map(rec => rec.analyzer.id)
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', analyzerIds)

    const followedAnalyzerIds = new Set(followData?.map(f => f.following_id) || [])

    const transformedRecommendations = recommendations.map(rec => ({
      ...rec,
      analyzer: {
        id: rec.analyzer.id,
        username: rec.analyzer.email?.split('@')[0] || 'user',
        display_name: rec.analyzer.full_name || rec.analyzer.email?.split('@')[0] || 'Unknown',
        avatar_url: rec.analyzer.avatar_url || null,
      },
      is_following: followedAnalyzerIds.has(rec.analyzer.id)
    }))

    return NextResponse.json({
      recommendations: transformedRecommendations,
      meta: {
        limit,
        offset,
        total: transformedRecommendations.length
      }
    })
  } catch (error: any) {
    console.error('Get analyzer recommendations error:', {
      message: error.message,
      stack: error.stack,
      details: error
    })
    return NextResponse.json(
      {
        recommendations: [],
        meta: { limit: 0, offset: 0, total: 0 }
      }
    )
  }
}
