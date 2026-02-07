import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { RecommendationService } from '@/services/recommendations/recommendation.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let userId: string | undefined
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

    userId = user.id

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = parseInt(searchParams.get('offset') || '0')

    const recommendationService = new RecommendationService(supabase, adminClient)
    let recommendations: any[] = []

    try {
      // Add timeout to prevent long-running queries
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Recommendation timeout')), 3000)
      })

      recommendations = await Promise.race([
        recommendationService.recommendSymbols(user.id, limit, offset),
        timeoutPromise
      ]) as any[]
    } catch (recError: any) {
      console.error('Recommendation service error:', recError)
      recommendations = []
    }

    return NextResponse.json({
      recommendations,
      meta: {
        limit,
        offset,
        total: recommendations.length
      }
    })
  } catch (error: any) {
    console.error('Get symbol recommendations error:', {
      message: error.message,
      stack: error.stack,
      details: error,
      userId
    })
    return NextResponse.json(
      {
        recommendations: [],
        meta: { limit: 0, offset: 0, total: 0 }
      }
    )
  }
}
