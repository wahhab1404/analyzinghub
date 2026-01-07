type EntityType = 'analysis' | 'analyzer' | 'symbol'
type EventType = 'view' | 'like' | 'bookmark' | 'comment' | 'follow' | 'share' | 'unlike' | 'unbookmark' | 'unfollow'

interface TrackEventParams {
  entity_type: EntityType
  entity_id: string
  event_type: EventType
  metadata?: Record<string, any>
}

export async function trackEvent(params: TrackEventParams): Promise<void> {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(params),
    })
  } catch (error) {
    console.error('Failed to track event:', error)
  }
}

export function trackAnalysisView(analysisId: string, metadata?: Record<string, any>) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'view',
    metadata
  })
}

export function trackAnalysisLike(analysisId: string) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'like'
  })
}

export function trackAnalysisUnlike(analysisId: string) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'unlike'
  })
}

export function trackAnalysisBookmark(analysisId: string) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'bookmark'
  })
}

export function trackAnalysisUnbookmark(analysisId: string) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'unbookmark'
  })
}

export function trackAnalysisComment(analysisId: string) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'comment'
  })
}

export function trackAnalysisShare(analysisId: string) {
  return trackEvent({
    entity_type: 'analysis',
    entity_id: analysisId,
    event_type: 'share'
  })
}

export function trackAnalyzerFollow(analyzerId: string) {
  return trackEvent({
    entity_type: 'analyzer',
    entity_id: analyzerId,
    event_type: 'follow'
  })
}

export function trackAnalyzerUnfollow(analyzerId: string) {
  return trackEvent({
    entity_type: 'analyzer',
    entity_id: analyzerId,
    event_type: 'unfollow'
  })
}

export function trackAnalyzerView(analyzerId: string) {
  return trackEvent({
    entity_type: 'analyzer',
    entity_id: analyzerId,
    event_type: 'view'
  })
}

export function trackSymbolFollow(symbolId: string) {
  return trackEvent({
    entity_type: 'symbol',
    entity_id: symbolId,
    event_type: 'follow'
  })
}

export function trackSymbolUnfollow(symbolId: string) {
  return trackEvent({
    entity_type: 'symbol',
    entity_id: symbolId,
    event_type: 'unfollow'
  })
}

export function trackSymbolView(symbolId: string) {
  return trackEvent({
    entity_type: 'symbol',
    entity_id: symbolId,
    event_type: 'view'
  })
}
