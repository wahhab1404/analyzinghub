import { useCallback } from 'react'
import {
  trackAnalysisView,
  trackAnalysisLike,
  trackAnalysisUnlike,
  trackAnalysisBookmark,
  trackAnalysisUnbookmark,
  trackAnalysisComment,
  trackAnalysisShare,
  trackAnalyzerFollow,
  trackAnalyzerUnfollow,
  trackAnalyzerView,
  trackSymbolFollow,
  trackSymbolUnfollow,
  trackSymbolView
} from '@/lib/analytics/tracking'

export function useAnalytics() {
  const trackAnalysisViewEvent = useCallback((analysisId: string, metadata?: Record<string, any>) => {
    trackAnalysisView(analysisId, metadata)
  }, [])

  const trackAnalysisLikeEvent = useCallback((analysisId: string) => {
    trackAnalysisLike(analysisId)
  }, [])

  const trackAnalysisUnlikeEvent = useCallback((analysisId: string) => {
    trackAnalysisUnlike(analysisId)
  }, [])

  const trackAnalysisBookmarkEvent = useCallback((analysisId: string) => {
    trackAnalysisBookmark(analysisId)
  }, [])

  const trackAnalysisUnbookmarkEvent = useCallback((analysisId: string) => {
    trackAnalysisUnbookmark(analysisId)
  }, [])

  const trackAnalysisCommentEvent = useCallback((analysisId: string) => {
    trackAnalysisComment(analysisId)
  }, [])

  const trackAnalysisShareEvent = useCallback((analysisId: string) => {
    trackAnalysisShare(analysisId)
  }, [])

  const trackAnalyzerFollowEvent = useCallback((analyzerId: string) => {
    trackAnalyzerFollow(analyzerId)
  }, [])

  const trackAnalyzerUnfollowEvent = useCallback((analyzerId: string) => {
    trackAnalyzerUnfollow(analyzerId)
  }, [])

  const trackAnalyzerViewEvent = useCallback((analyzerId: string) => {
    trackAnalyzerView(analyzerId)
  }, [])

  const trackSymbolFollowEvent = useCallback((symbolId: string) => {
    trackSymbolFollow(symbolId)
  }, [])

  const trackSymbolUnfollowEvent = useCallback((symbolId: string) => {
    trackSymbolUnfollow(symbolId)
  }, [])

  const trackSymbolViewEvent = useCallback((symbolId: string) => {
    trackSymbolView(symbolId)
  }, [])

  return {
    trackAnalysisView: trackAnalysisViewEvent,
    trackAnalysisLike: trackAnalysisLikeEvent,
    trackAnalysisUnlike: trackAnalysisUnlikeEvent,
    trackAnalysisBookmark: trackAnalysisBookmarkEvent,
    trackAnalysisUnbookmark: trackAnalysisUnbookmarkEvent,
    trackAnalysisComment: trackAnalysisCommentEvent,
    trackAnalysisShare: trackAnalysisShareEvent,
    trackAnalyzerFollow: trackAnalyzerFollowEvent,
    trackAnalyzerUnfollow: trackAnalyzerUnfollowEvent,
    trackAnalyzerView: trackAnalyzerViewEvent,
    trackSymbolFollow: trackSymbolFollowEvent,
    trackSymbolUnfollow: trackSymbolUnfollowEvent,
    trackSymbolView: trackSymbolViewEvent
  }
}
