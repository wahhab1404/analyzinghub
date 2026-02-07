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
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const recommendationService = new RecommendationService(supabase, adminClient)
    let recommendations: any[] = []
    try {
      recommendations = await recommendationService.recommendAnalyses(
        user.id,
        limit,
        offset
      )
    } catch (recError: any) {
      console.error('Recommendation service error:', recError)
      recommendations = []
    }

    const transformedRecommendations = recommendations.map(rec => ({
      ...rec,
      analysis: {
        ...rec.analysis,
        profiles: {
          ...rec.analysis.profiles,
          username: rec.analysis.profiles?.email || '',
          display_name: rec.analysis.profiles?.full_name || 'Unknown',
        }
      }
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
    console.error('Get feed recommendations error:', {
      message: error.message,
      stack: error.stack,
      details: error
    })
    return NextResponse.json({
      recommendations: [],
      meta: { limit: 0, offset: 0, total: 0 }
    })
  }
}
