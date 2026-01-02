import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoringService } from '@/services/scoring/scoring.service'

export async function POST(request: NextRequest) {
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

    const apiKey = request.headers.get('X-API-Key')
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { eventType, userId, entityId, metadata } = body

    if (!eventType || !userId || !entityId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    let result

    switch (eventType) {
      case 'analysis_created':
        result = await scoringService.awardAnalysisCreationPoints(userId, entityId)
        break

      case 'target_hit':
        if (!metadata?.targetIndex) {
          return NextResponse.json({ error: 'Target index required' }, { status: 400 })
        }
        result = await scoringService.awardTargetHitPoints(
          userId,
          entityId,
          metadata.targetIndex
        )
        break

      case 'stop_hit':
        result = await scoringService.deductStopLossPoints(userId, entityId)
        break

      case 'like':
        result = await scoringService.awardLikePoints(userId, entityId)
        break

      case 'bookmark':
        result = await scoringService.awardBookmarkPoints(userId, entityId)
        break

      case 'repost':
        result = await scoringService.awardRepostPoints(userId, entityId)
        break

      case 'comment':
        if (!metadata?.content) {
          return NextResponse.json({ error: 'Comment content required' }, { status: 400 })
        }
        result = await scoringService.awardCommentPoints(userId, entityId, metadata.content)
        break

      default:
        return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Scoring award error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
