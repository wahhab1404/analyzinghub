'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ImageViewer } from '@/components/ui/image-viewer'
import { ShareMenu } from '@/components/ui/share-menu'
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Clock, Heart, MessageCircle, Bookmark, Repeat2, Star, Newspaper, FileText, LineChart, ExternalLink, Lock, Users, Zap, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { FollowButton } from '@/components/profile/FollowButton'
import { SubscriptionStatusBadge } from '@/components/subscriptions/SubscriptionStatusBadge'
import { StockPrice } from './StockPrice'
import { toast } from 'sonner'
import { useAnalytics } from '@/hooks/use-analytics'
import { StarRating } from '@/components/ratings/StarRating'
import { downloadImageWithWatermark, generatePostSnapshot } from '@/lib/image-utils'
import { getTextDirection } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/language-context'
import { getAnalysisStatusDisplay } from '@/lib/analysis-status-styles'

interface AnalysisCardProps {
  analysis: {
    id: string
    post_type?: 'analysis' | 'news' | 'article'
    direction?: 'Long' | 'Short' | 'Neutral'
    stop_loss?: number
    price_at_post?: number
    title?: string
    summary?: string
    description?: string
    content?: string
    source_url?: string
    chart_image_url: string | null
    created_at: string
    status?: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
    validated_at?: string | null
    is_following?: boolean
    is_own_post?: boolean
    visibility?: 'public' | 'followers' | 'subscribers' | 'private'
    activation_enabled?: boolean
    activation_type?: 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE'
    activation_price?: number
    activation_timeframe?: 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE'
    activation_status?: 'draft' | 'published_inactive' | 'active' | 'completed_success' | 'completed_fail' | 'cancelled' | 'expired'
    activated_at?: string
    activation_met_at?: string
    preactivation_stop_touched?: boolean
    preactivation_stop_touched_at?: string
    profiles: {
      id: string
      full_name: string
      avatar_url: string | null
    }
    symbols: {
      symbol: string
    }
    analysis_targets?: Array<{
      price: number
      expected_time: string
    }>
    validation_events?: Array<{
      event_type: 'STOP_LOSS_HIT' | 'TARGET_HIT'
      target_number: number | null
      price_at_hit: number
      hit_at: string
    }>
    analyzer_plans?: Array<{
      id: string
      name: string
      is_active: boolean
    }>
  }
  onFollowChange?: () => void
}

export function AnalysisCard({ analysis, onFollowChange }: AnalysisCardProps) {
  const { t } = useTranslation()
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isReposted, setIsReposted] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [commentsCount, setCommentsCount] = useState(0)
  const [repostsCount, setRepostsCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [averageRating, setAverageRating] = useState<number>(0)
  const [totalRatings, setTotalRatings] = useState<number>(0)
  const [userRating, setUserRating] = useState<number>(0)
  const [showRatingDialog, setShowRatingDialog] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const analytics = useAnalytics()

  const postType = analysis.post_type || 'analysis'

  useEffect(() => {
    fetchSocialData()
    analytics.trackAnalysisView(analysis.id)
  }, [analysis.id])

  const fetchSocialData = async () => {
    try {
      const [likesRes, commentsRes, repostsRes, userLikeRes, userSaveRes, userRepostRes, ratingsRes] = await Promise.all([
        fetch(`/api/analyses/${analysis.id}/stats/likes`),
        fetch(`/api/analyses/${analysis.id}/stats/comments`),
        fetch(`/api/analyses/${analysis.id}/stats/reposts`),
        fetch(`/api/analyses/${analysis.id}/user-like`),
        fetch(`/api/analyses/${analysis.id}/user-save`),
        fetch(`/api/analyses/${analysis.id}/user-repost`),
        fetch(`/api/analyses/${analysis.id}/ratings`),
      ])

      if (likesRes.ok) {
        const data = await likesRes.json()
        setLikesCount(data.count || 0)
      }
      if (commentsRes.ok) {
        const data = await commentsRes.json()
        setCommentsCount(data.count || 0)
      }
      if (repostsRes.ok) {
        const data = await repostsRes.json()
        setRepostsCount(data.count || 0)
      }
      if (userLikeRes.ok) {
        const data = await userLikeRes.json()
        setIsLiked(data.isLiked || false)
      }
      if (userSaveRes.ok) {
        const data = await userSaveRes.json()
        setIsSaved(data.isSaved || false)
      }
      if (userRepostRes.ok) {
        const data = await userRepostRes.json()
        setIsReposted(data.isReposted || false)
      }
      if (ratingsRes.ok) {
        const data = await ratingsRes.json()
        setAverageRating(data.averageRating || 0)
        setTotalRatings(data.totalRatings || 0)
        setUserRating(data.userRating || 0)
      }
    } catch (error) {
      console.error('Error fetching social data:', error)
    }
  }

  const handleLike = async () => {
    if (isLoading) return
    setIsLoading(true)

    try {
      if (isLiked) {
        const response = await fetch(`/api/analyses/${analysis.id}/like`, {
          method: 'DELETE',
        })
        if (response.ok) {
          setIsLiked(false)
          setLikesCount(prev => Math.max(0, prev - 1))
          analytics.trackAnalysisUnlike(analysis.id)
        }
      } else {
        const response = await fetch(`/api/analyses/${analysis.id}/like`, {
          method: 'POST',
        })
        if (response.ok) {
          setIsLiked(true)
          setLikesCount(prev => prev + 1)
          analytics.trackAnalysisLike(analysis.id)
        }
      }
    } catch (error) {
      console.error('Error toggling like:', error)
      toast.error(t.analysisCard.failedToUpdateLike)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (isLoading) return
    setIsLoading(true)

    try {
      if (isSaved) {
        const response = await fetch(`/api/analyses/${analysis.id}/save`, {
          method: 'DELETE',
        })
        if (response.ok) {
          setIsSaved(false)
          toast.success(t.analysisCard.removedFromSaved)
          analytics.trackAnalysisUnbookmark(analysis.id)
        }
      } else {
        const response = await fetch(`/api/analyses/${analysis.id}/save`, {
          method: 'POST',
        })
        if (response.ok) {
          setIsSaved(true)
          toast.success(t.analysisCard.savedSuccessfully)
          analytics.trackAnalysisBookmark(analysis.id)
        }
      }
    } catch (error) {
      console.error('Error toggling save:', error)
      toast.error(t.analysisCard.failedToUpdateSave)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRepost = async () => {
    if (isLoading) return
    setIsLoading(true)

    try {
      if (isReposted) {
        const response = await fetch(`/api/analyses/${analysis.id}/repost`, {
          method: 'DELETE',
        })
        if (response.ok) {
          setIsReposted(false)
          setRepostsCount(prev => Math.max(0, prev - 1))
          toast.success(t.analysisCard.repostRemoved)
        }
      } else {
        const response = await fetch(`/api/analyses/${analysis.id}/repost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: null }),
        })
        if (response.ok) {
          setIsReposted(true)
          setRepostsCount(prev => prev + 1)
          toast.success(t.analysisCard.repostedSuccessfully)
        }
      }
    } catch (error) {
      console.error('Error toggling repost:', error)
      toast.error(t.analysisCard.failedToUpdateRepost)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRate = async (rating: number) => {
    if (isLoading) return
    setIsLoading(true)

    try {
      const response = await fetch(`/api/analyses/${analysis.id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })

      if (response.ok) {
        const data = await response.json()
        setUserRating(rating)
        setAverageRating(data.averageRating || averageRating)
        setTotalRatings(data.totalRatings || totalRatings)
        setShowRatingDialog(false)
        toast.success(t.analysisCard.ratingSubmittedSuccessfully)
      } else {
        const error = await response.json()
        toast.error(error.error || t.analysisCard.failedToSubmitRating)
      }
    } catch (error) {
      console.error('Error submitting rating:', error)
      toast.error(t.analysisCard.failedToSubmitRating)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadImage = async () => {
    if (!analysis.chart_image_url) return

    try {
      const filename = `${analysis.symbols.symbol}_${analysis.id.substring(0, 8)}.png`
      await downloadImageWithWatermark(
        analysis.chart_image_url,
        analysis.profiles.full_name,
        analysis.symbols.symbol,
        filename
      )
      toast.success(t.analysisCard.imageDownloadedSuccessfully)
    } catch (error) {
      toast.error(t.analysisCard.failedToDownloadImage)
    }
  }

  const handleDownloadSnapshot = async () => {
    try {
      const dataUrl = await generatePostSnapshot(
        analysis.id,
        analysis.profiles.full_name,
        analysis.symbols.symbol,
        postType,
        {
          title: analysis.title,
          summary: analysis.summary,
          direction: analysis.direction,
          stopLoss: analysis.stop_loss,
          targets: sortedTargets,
        }
      )

      const link = document.createElement('a')
      link.download = `${analysis.symbols.symbol}_snapshot_${analysis.id.substring(0, 8)}.png`
      link.href = dataUrl
      link.click()
      toast.success(t.analysisCard.snapshotDownloadedSuccessfully)
    } catch (error) {
      toast.error(t.analysisCard.failedToDownloadSnapshot)
    }
  }

  const getPostTypeIcon = () => {
    if (postType === 'news') return <Newspaper className="h-4 w-4" />
    if (postType === 'article') return <FileText className="h-4 w-4" />
    return <LineChart className="h-4 w-4" />
  }

  const getPostTypeColor = () => {
    if (postType === 'news') return 'bg-orange-100 text-orange-800 border-orange-300'
    if (postType === 'article') return 'bg-green-100 text-green-800 border-green-300'
    return 'bg-blue-100 text-blue-800 border-blue-300'
  }

  const getPostTypeLabel = () => {
    if (postType === 'news') return t.analysisCard.news
    if (postType === 'article') return t.analysisCard.article
    return t.analysisCard.analysis
  }

  const directionIcons = {
    Long: <TrendingUp className="h-4 w-4" />,
    Short: <TrendingDown className="h-4 w-4" />,
    Neutral: <Minus className="h-4 w-4" />,
  }

  const directionColors = {
    Long: 'bg-green-100 text-green-800 border-green-300',
    Short: 'bg-red-100 text-red-800 border-red-300',
    Neutral: 'bg-gray-100 text-gray-800 border-gray-300',
  }

  const statusConfig = {
    IN_PROGRESS: {
      label: t.analysisCard.inProgress,
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    SUCCESS: {
      label: t.analysisCard.success,
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-green-100 text-green-800 border-green-300',
    },
    FAILED: {
      label: t.analysisCard.failed,
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-red-100 text-red-800 border-red-300',
    },
  }

  const status = analysis.status || 'IN_PROGRESS'
  const sortedTargets = analysis.analysis_targets ? [...analysis.analysis_targets].sort((a, b) => a.price - b.price) : []

  const getActivationTypeLabel = (type?: string) => {
    switch (type) {
      case 'PASSING_PRICE': return 'Passing'
      case 'ABOVE_PRICE': return 'Above'
      case 'UNDER_PRICE': return 'Under'
      default: return 'Unknown'
    }
  }

  const isConditionMet = analysis.activation_enabled &&
    (analysis.activation_status === 'active' ||
     analysis.activation_status === 'completed_success' ||
     analysis.activation_status === 'completed_fail')

  const validationEvent = analysis.validation_events?.[0]
  const hitTargetNumber = validationEvent?.event_type === 'TARGET_HIT' ? validationEvent.target_number : null
  const stopLossHit = validationEvent?.event_type === 'STOP_LOSS_HIT'

  const statusDisplay = getAnalysisStatusDisplay(analysis.status)

  return (
    <Card className={`relative overflow-hidden ${statusDisplay.borderClass}`}>
      {(analysis.visibility === 'subscribers' || analysis.visibility === 'followers') && (
        <div className={`absolute top-0 left-0 right-0 h-1.5 shadow-sm ${
          analysis.visibility === 'subscribers'
            ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400'
            : 'bg-gradient-to-r from-blue-500 via-sky-500 to-blue-500'
        }`} />
      )}
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href={`/dashboard/profile/${analysis.profiles.id}`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Avatar>
              <AvatarImage src={analysis.profiles.avatar_url || undefined} />
              <AvatarFallback>
                {analysis.profiles.full_name
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{analysis.profiles.full_name}</p>
                {!analysis.is_own_post && (
                  <SubscriptionStatusBadge
                    analyzerId={analysis.profiles.id}
                    analyzerName={analysis.profiles.full_name}
                    isFollowing={analysis.is_following || false}
                    showButton={false}
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
              </p>
            </div>
          </Link>

          {!analysis.is_own_post && (
            <FollowButton
              profileId={analysis.profiles.id}
              initialIsFollowing={analysis.is_following || false}
              onFollowChange={onFollowChange}
            />
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link href={`/dashboard/symbol/${analysis.symbols.symbol}`}>
            <h3 className="text-2xl font-bold hover:text-blue-600 transition-colors cursor-pointer">
              {analysis.symbols.symbol}
            </h3>
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={getPostTypeColor()}>
              <span className="mr-1">{getPostTypeIcon()}</span>
              {getPostTypeLabel()}
            </Badge>
            {analysis.visibility === 'subscribers' && (
              <Badge variant="outline" className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 text-amber-900 border-amber-400 dark:from-amber-950/50 dark:via-yellow-950/50 dark:to-amber-950/50 dark:text-amber-200 dark:border-amber-600 font-bold shadow-md ring-1 ring-amber-200/50 dark:ring-amber-800/50">
                <Lock className="h-3.5 w-3.5 mr-1.5 stroke-[2.5]" />
                {analysis.analyzer_plans && analysis.analyzer_plans.length > 0
                  ? `${analysis.analyzer_plans.filter(p => p.is_active).map(p => p.name).join(', ')}`
                  : t.analysisCard.subscribersOnly}
              </Badge>
            )}
            {analysis.visibility === 'followers' && (
              <Badge variant="outline" className="bg-gradient-to-r from-blue-50 via-sky-50 to-blue-50 text-blue-900 border-blue-400 dark:from-blue-950/50 dark:via-sky-950/50 dark:to-blue-950/50 dark:text-blue-200 dark:border-blue-600 font-bold shadow-md ring-1 ring-blue-200/50 dark:ring-blue-800/50">
                <Users className="h-3.5 w-3.5 mr-1.5 stroke-[2.5]" />
                {t.analysisCard.followersOnly}
              </Badge>
            )}
            {postType === 'analysis' && analysis.direction && (
              <>
                {analysis.activation_enabled ? (
                  <Badge variant="outline" className={
                    isConditionMet
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : analysis.preactivation_stop_touched
                      ? 'bg-orange-100 text-orange-800 border-orange-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }>
                    <span className="mr-1">
                      {isConditionMet ? <CheckCircle2 className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                    </span>
                    {isConditionMet ? 'Active' : 'Waiting Activation'}
                  </Badge>
                ) : (
                  <Badge variant={statusDisplay.badgeVariant}>
                    <span className="mr-1">
                      {status === 'SUCCESS' && <CheckCircle2 className="h-3 w-3" />}
                      {status === 'FAILED' && <XCircle className="h-3 w-3" />}
                      {status === 'IN_PROGRESS' && <Clock className="h-3 w-3" />}
                    </span>
                    {statusDisplay.badgeText}
                  </Badge>
                )}
                <Badge variant="outline" className={directionColors[analysis.direction]}>
                  <span className="mr-1">{directionIcons[analysis.direction]}</span>
                  {analysis.direction}
                </Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Link href={`/dashboard/analysis/${analysis.id}`} className="block space-y-4">
          {postType === 'news' && (
            <div className="space-y-3">
              <h4
                className="text-xl font-semibold leading-tight"
                dir={getTextDirection(analysis.title)}
              >
                {analysis.title}
              </h4>
              <p
                className="text-muted-foreground"
                dir={getTextDirection(analysis.summary)}
              >
                {analysis.summary}
              </p>
              {analysis.source_url && (
                <a
                  href={analysis.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {postType === 'article' && (
            <div className="space-y-3">
              <h4
                className="text-xl font-semibold leading-tight"
                dir={getTextDirection(analysis.title)}
              >
                {analysis.title}
              </h4>
              <p
                className="text-muted-foreground line-clamp-3"
                dir={getTextDirection(analysis.content)}
              >
                {analysis.content}
              </p>
              <p className="text-sm text-blue-600 hover:underline">{t.analysisCard.readMore}</p>
            </div>
          )}

          {analysis.description && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
              <p
                className="text-sm text-amber-900 dark:text-amber-100 line-clamp-3"
                dir={getTextDirection(analysis.description)}
              >
                {analysis.description}
              </p>
            </div>
          )}

          {analysis.chart_image_url && (
            <div
              className="rounded-lg overflow-hidden border hover:border-primary transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault()
                setShowImageViewer(true)
              }}
            >
              <img
                src={analysis.chart_image_url}
                alt={postType === 'news' ? t.analysisCard.newsImage : postType === 'article' ? t.analysisCard.articleImage : t.analysis.chart}
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {postType === 'analysis' && analysis.activation_enabled && analysis.activation_price && (
            <div className={`p-3 rounded-lg border ${
              isConditionMet
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : analysis.preactivation_stop_touched
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 mt-0.5">
                  {isConditionMet ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Zap className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <p className={`text-sm font-semibold ${
                    isConditionMet
                      ? 'text-green-800 dark:text-green-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }`}>
                    {isConditionMet ? 'Condition Met - Analysis Active' : 'Activation Required'}
                  </p>
                  <p className={`text-xs ${
                    isConditionMet
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    Price must be {getActivationTypeLabel(analysis.activation_type).toLowerCase()} ${analysis.activation_price.toFixed(2)}
                    {analysis.activation_timeframe && analysis.activation_timeframe !== 'INTRABAR' &&
                      ` (${analysis.activation_timeframe.replace('_', ' ')})`}
                  </p>
                  {analysis.preactivation_stop_touched && !isConditionMet && (
                    <p className="text-xs text-orange-700 dark:text-orange-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Stop touched before activation
                    </p>
                  )}
                  {isConditionMet && analysis.activated_at && (
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Activated {formatDistanceToNow(new Date(analysis.activated_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {postType === 'analysis' && analysis.price_at_post !== undefined && analysis.price_at_post !== null && (
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">{t.analysisCard.priceAtPost || 'Price at Post'}</p>
              <p className="text-base font-semibold text-primary">${analysis.price_at_post.toFixed(2)}</p>
            </div>
          )}

          {postType === 'analysis' && analysis.stop_loss !== undefined && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t.analysisCard.stopLoss}</p>
                <div className="flex items-center gap-2">
                  <p className={`text-lg font-semibold ${stopLossHit ? 'text-red-600 line-through' : 'text-red-600'}`}>
                    ${analysis.stop_loss.toFixed(2)}
                  </p>
                  {stopLossHit && (
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                      <XCircle className="h-3 w-3 mr-1" />
                      {t.analysisCard.hit}
                    </Badge>
                  )}
                </div>
                {stopLossHit && validationEvent && (
                  <p className="text-xs text-muted-foreground">
                    Hit at ${validationEvent.price_at_hit.toFixed(2)} • {formatDistanceToNow(new Date(validationEvent.hit_at), { addSuffix: true })}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t.analysisCard.targets}</p>
                <div className="space-y-1">
                  {sortedTargets.map((target, index) => {
                    const targetNum = index + 1
                    const isHit = hitTargetNumber === targetNum
                    return (
                      <div key={index} className="space-y-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-muted-foreground">TP{targetNum}:</span>
                          <span className={`text-sm font-semibold ${isHit ? 'text-green-600 line-through' : 'text-green-600'}`}>
                            ${target.price.toFixed(2)}
                          </span>
                          {isHit && (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {t.analysisCard.hit}
                            </Badge>
                          )}
                          {!isHit && (
                            <span className="text-xs text-muted-foreground">
                              ({formatDistanceToNow(new Date(target.expected_time))})
                            </span>
                          )}
                        </div>
                        {isHit && validationEvent && (
                          <p className="text-xs text-muted-foreground ml-10">
                            Hit at ${validationEvent.price_at_hit.toFixed(2)} • {formatDistanceToNow(new Date(validationEvent.hit_at), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </Link>

        <StockPrice symbol={analysis.symbols.symbol} />

        <Separator />

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              disabled={isLoading}
              className={isLiked ? 'text-red-600 hover:text-red-700' : ''}
            >
              <Heart className={`h-4 w-4 mr-1 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm">{likesCount}</span>
            </Button>

            <Link href={`/dashboard/analysis/${analysis.id}`}>
              <Button
                variant="ghost"
                size="sm"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                <span className="text-sm">{commentsCount}</span>
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRepost}
              disabled={isLoading}
              className={isReposted ? 'text-green-600 hover:text-green-700' : ''}
            >
              <Repeat2 className="h-4 w-4 mr-1" />
              <span className="text-sm">{repostsCount}</span>
            </Button>

            {!analysis.is_own_post && postType === 'analysis' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRatingDialog(!showRatingDialog)}
                disabled={isLoading}
                className={userRating > 0 ? 'text-amber-600 hover:text-amber-700' : ''}
              >
                <Star className={`h-4 w-4 mr-1 ${userRating > 0 ? 'fill-current' : ''}`} />
                <span className="text-sm">
                  {averageRating > 0 ? averageRating.toFixed(1) : 'Rate'}
                  {totalRatings > 0 && ` (${totalRatings})`}
                </span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <ShareMenu
              url={`/share/${analysis.id}`}
              title={`${analysis.symbols.symbol} - ${getPostTypeLabel()} by ${analysis.profiles.full_name}`}
              description={analysis.title || analysis.summary || `${analysis.direction} position on ${analysis.symbols.symbol}`}
              onDownloadImage={analysis.chart_image_url ? handleDownloadImage : undefined}
              onDownloadSnapshot={handleDownloadSnapshot}
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={isLoading}
              className={isSaved ? 'text-blue-600 hover:text-blue-700' : ''}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
            </Button>
          </div>
        </div>

        {showRatingDialog && !analysis.is_own_post && postType === 'analysis' && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">Rate this analysis</p>
            <StarRating
              rating={userRating}
              onChange={handleRate}
              size="lg"
              interactive={true}
              showValue={false}
            />
            {userRating > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                You rated this analysis {userRating}/10
              </p>
            )}
          </div>
        )}
      </CardContent>

      {analysis.chart_image_url && (
        <ImageViewer
          src={analysis.chart_image_url}
          alt={`${analysis.symbols.symbol} chart`}
          open={showImageViewer}
          onOpenChange={setShowImageViewer}
          onDownload={handleDownloadImage}
        />
      )}
    </Card>
  )
}
