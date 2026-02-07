'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ImageViewer } from '@/components/ui/image-viewer'
import { ShareMenu } from '@/components/ui/share-menu'
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Clock, Heart, MessageCircle, Bookmark, Repeat2, ArrowLeft, Newspaper, FileText, LineChart, ExternalLink, Send, Lock, Users, Repeat } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FollowButton } from '@/components/profile/FollowButton'
import { StockPrice } from './StockPrice'
import { CommentSection } from './CommentSection'
import { ResendToChannelDialog } from './ResendToChannelDialog'
import { toast } from 'sonner'
import { useAnalytics } from '@/hooks/use-analytics'
import { downloadImageWithWatermark, generatePostSnapshot } from '@/lib/image-utils'
import { getTextDirection } from '@/lib/utils'

interface AnalysisDetailViewProps {
  analysis: {
    id: string
    post_type?: 'analysis' | 'news' | 'article' | 'indices'
    direction?: 'Long' | 'Short' | 'Neutral'
    stop_loss?: number
    analysis_type?: 'classic' | 'elliott_wave' | 'harmonics' | 'ict' | 'other'
    chart_frame?: string | null
    title?: string
    summary?: string
    description?: string
    content?: string
    body?: string
    source_url?: string
    chart_image_url?: string | null
    created_at: string
    status?: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
    validated_at?: string | null
    is_following?: boolean
    is_own_post?: boolean
    is_index_analysis?: boolean
    visibility?: 'public' | 'followers' | 'subscribers' | 'private'
    // Index analysis specific fields
    index_symbol?: string
    timeframe?: string
    schools_used?: string[]
    invalidation_price?: number
    // Regular analysis fields
    profiles?: {
      id: string
      full_name: string
      avatar_url: string | null
    }
    symbols?: {
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
}

export function AnalysisDetailView({ analysis }: AnalysisDetailViewProps) {
  const router = useRouter()
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isReposted, setIsReposted] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [commentsCount, setCommentsCount] = useState(0)
  const [repostsCount, setRepostsCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [showResendDialog, setShowResendDialog] = useState(false)
  const analytics = useAnalytics()

  // Handle both regular analyses and index analyses
  const isIndexAnalysis = analysis.is_index_analysis || analysis.post_type === 'indices'
  const symbol = isIndexAnalysis ? analysis.index_symbol : analysis.symbols?.symbol
  const authorName = analysis.profiles?.full_name || 'Unknown'
  const authorAvatar = analysis.profiles?.avatar_url || null
  const authorId = analysis.profiles?.id || ''
  const analysisContent = analysis.content || analysis.body || analysis.description || ''

  const postType = analysis.post_type || 'analysis'

  useEffect(() => {
    fetchSocialData()
    analytics.trackAnalysisView(analysis.id)
  }, [analysis.id])

  const fetchSocialData = async () => {
    try {
      const [likesRes, commentsRes, repostsRes, userLikeRes, userSaveRes, userRepostRes] = await Promise.all([
        fetch(`/api/analyses/${analysis.id}/stats/likes`),
        fetch(`/api/analyses/${analysis.id}/stats/comments`),
        fetch(`/api/analyses/${analysis.id}/stats/reposts`),
        fetch(`/api/analyses/${analysis.id}/user-like`),
        fetch(`/api/analyses/${analysis.id}/user-save`),
        fetch(`/api/analyses/${analysis.id}/user-repost`),
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
      toast.error('Failed to update like')
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
          toast.success('Removed from saved')
          analytics.trackAnalysisUnbookmark(analysis.id)
        }
      } else {
        const response = await fetch(`/api/analyses/${analysis.id}/save`, {
          method: 'POST',
        })
        if (response.ok) {
          setIsSaved(true)
          toast.success('Saved successfully')
          analytics.trackAnalysisBookmark(analysis.id)
        }
      }
    } catch (error) {
      console.error('Error toggling save:', error)
      toast.error('Failed to update save')
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
          toast.success('Repost removed')
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
          toast.success('Reposted successfully')
        }
      }
    } catch (error) {
      console.error('Error toggling repost:', error)
      toast.error('Failed to update repost')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadImage = async () => {
    if (!analysis.chart_image_url) return

    try {
      const filename = `${symbol}_${analysis.id.substring(0, 8)}.png`
      await downloadImageWithWatermark(
        analysis.chart_image_url,
        authorName,
        symbol || 'analysis',
        filename
      )
      toast.success('Image downloaded successfully')
    } catch (error) {
      toast.error('Failed to download image')
    }
  }

  const handleDownloadSnapshot = async () => {
    try {
      const sortedTargets = analysis.analysis_targets ? [...analysis.analysis_targets].sort((a, b) => a.price - b.price) : []
      const dataUrl = await generatePostSnapshot(
        analysis.id,
        authorName,
        symbol || 'analysis',
        postType,
        {
          title: analysis.title,
          summary: analysis.summary,
          direction: analysis.direction,
          stopLoss: analysis.stop_loss,
          targets: sortedTargets,
          analysisType: analysis.analysis_type,
          chartFrame: analysis.chart_frame,
        }
      )

      const link = document.createElement('a')
      link.download = `${symbol || 'analysis'}_snapshot_${analysis.id.substring(0, 8)}.png`
      link.href = dataUrl
      link.click()
      toast.success('Snapshot downloaded successfully')
    } catch (error) {
      toast.error('Failed to download snapshot')
    }
  }

  const handleBroadcastToTelegram = async () => {
    setIsBroadcasting(true)
    try {
      const meResponse = await fetch('/api/me')
      if (!meResponse.ok) {
        toast.error('Please log in to broadcast to Telegram')
        return
      }

      const { user } = await meResponse.json()

      const response = await fetch('/api/telegram/channel/broadcast-new-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisId: analysis.id,
          userId: user.id,
        }),
      })

      const result = await response.json()

      if (result.ok) {
        toast.success('Successfully sent to Telegram channel')
      } else {
        toast.error(result.error || 'Failed to send to Telegram channel')
      }
    } catch (error) {
      console.error('Error broadcasting to Telegram:', error)
      toast.error('Failed to send to Telegram channel')
    } finally {
      setIsBroadcasting(false)
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
    if (postType === 'news') return 'News'
    if (postType === 'article') return 'Article'
    return 'Analysis'
  }

  const getAnalysisTypeLabel = (type?: string) => {
    if (!type) return 'Classic'
    const labels: Record<string, string> = {
      classic: 'Classic Technical Analysis',
      elliott_wave: 'Elliott Wave',
      harmonics: 'Harmonics',
      ict: 'ICT (Inner Circle Trader)',
      other: 'Other',
    }
    return labels[type] || type
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
      label: 'In Progress',
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    SUCCESS: {
      label: 'Success',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-green-100 text-green-800 border-green-300',
    },
    FAILED: {
      label: 'Failed',
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-red-100 text-red-800 border-red-300',
    },
  }

  const status = analysis.status || 'IN_PROGRESS'
  const sortedTargets = analysis.analysis_targets ? [...analysis.analysis_targets].sort((a, b) => a.price - b.price) : []

  const validationEvent = analysis.validation_events?.[0]
  const hitTargetNumber = validationEvent?.event_type === 'TARGET_HIT' ? validationEvent.target_number : null
  const stopLossHit = validationEvent?.event_type === 'STOP_LOSS_HIT'

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-2"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <Card className="overflow-hidden relative">
        {(analysis.visibility === 'subscribers' || analysis.visibility === 'followers') && (
          <div className={`absolute top-0 left-0 right-0 h-1.5 z-10 shadow-sm ${
            analysis.visibility === 'subscribers'
              ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400'
              : 'bg-gradient-to-r from-blue-500 via-sky-500 to-blue-500'
          }`} />
        )}
        <CardHeader className="space-y-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <Link
              href={`/dashboard/profile/${analysis.profiles.id}`}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={analysis.profiles.avatar_url || undefined} />
                <AvatarFallback>
                  {authorName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">
                  {authorName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                </p>
              </div>
            </Link>

            {!analysis.is_own_post && (
              <FollowButton
                profileId={analysis.profiles.id}
                initialIsFollowing={analysis.is_following || false}
              />
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-2xl font-bold">{symbol}</h1>
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
                    : 'Subscribers Only'}
                </Badge>
              )}
              {analysis.visibility === 'followers' && (
                <Badge variant="outline" className="bg-gradient-to-r from-blue-50 via-sky-50 to-blue-50 text-blue-900 border-blue-400 dark:from-blue-950/50 dark:via-sky-950/50 dark:to-blue-950/50 dark:text-blue-200 dark:border-blue-600 font-bold shadow-md ring-1 ring-blue-200/50 dark:ring-blue-800/50">
                  <Users className="h-3.5 w-3.5 mr-1.5 stroke-[2.5]" />
                  Followers Only
                </Badge>
              )}
              {postType === 'analysis' && analysis.direction && (
                <>
                  <Badge variant="outline" className={statusConfig[status].className}>
                    <span className="mr-1">{statusConfig[status].icon}</span>
                    {statusConfig[status].label}
                  </Badge>
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
          {postType === 'news' && (
            <div className="space-y-4">
              <h2
                className="text-2xl font-bold leading-tight"
                dir={getTextDirection(analysis.title)}
              >
                {analysis.title}
              </h2>
              <p
                className="text-lg text-muted-foreground"
                dir={getTextDirection(analysis.summary)}
              >
                {analysis.summary}
              </p>
              {analysis.source_url && (
                <a
                  href={analysis.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                >
                  View Original Source <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

          {postType === 'article' && (
            <div className="space-y-4">
              <h2
                className="text-2xl font-bold leading-tight"
                dir={getTextDirection(analysis.title)}
              >
                {analysis.title}
              </h2>
              <div
                className="text-lg leading-relaxed whitespace-pre-wrap"
                dir={getTextDirection(analysis.content)}
              >
                {analysis.content}
              </div>
            </div>
          )}

          {analysis.description && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap text-amber-900 dark:text-amber-100"
                dir={getTextDirection(analysis.description)}
              >
                {analysis.description}
              </p>
            </div>
          )}

          {analysis.chart_image_url && (
            <div
              className="group relative rounded-lg overflow-hidden border hover:border-primary transition-colors cursor-pointer"
              onClick={() => setShowImageViewer(true)}
            >
              <img
                src={analysis.chart_image_url}
                alt={postType === 'news' ? 'News image' : postType === 'article' ? 'Article image' : 'Chart'}
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {postType === 'analysis' && (analysis.analysis_type || analysis.chart_frame) && (
            <div className="flex gap-3 flex-wrap">
              {analysis.analysis_type && (
                <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    {getAnalysisTypeLabel(analysis.analysis_type)}
                  </p>
                </div>
              )}
              {analysis.chart_frame && (
                <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-900">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {analysis.chart_frame}
                  </p>
                </div>
              )}
            </div>
          )}

          {postType === 'analysis' && analysis.stop_loss !== undefined && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/50">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">
                  Stop Loss
                </p>
                <div className="flex items-center gap-2">
                  <p className={`text-xl font-bold ${stopLossHit ? 'text-red-600 line-through dark:text-red-400' : 'text-red-700 dark:text-red-300'}`}>
                    ${analysis.stop_loss.toFixed(2)}
                  </p>
                  {stopLossHit && (
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800 text-xs">
                      <XCircle className="h-3 w-3 mr-1" />
                      Hit
                    </Badge>
                  )}
                </div>
                {stopLossHit && validationEvent && (
                  <p className="text-xs text-red-700/70 dark:text-red-300/70 mt-1">
                    Hit at ${validationEvent.price_at_hit.toFixed(2)}
                  </p>
                )}
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900/50">
                <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-2">
                  Price Targets
                </p>
                <div className="space-y-2">
                  {sortedTargets.map((target, index) => {
                    const targetNum = index + 1
                    const isHit = hitTargetNumber === targetNum
                    return (
                      <div key={index}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-700/70 dark:text-green-300/70">
                            TP{targetNum}
                          </span>
                          <span className={`text-base font-bold ${isHit ? 'text-green-600 line-through dark:text-green-400' : 'text-green-700 dark:text-green-300'}`}>
                            ${target.price.toFixed(2)}
                          </span>
                          {isHit && (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Hit
                            </Badge>
                          )}
                        </div>
                        {isHit && validationEvent && (
                          <p className="text-xs text-green-700/60 dark:text-green-300/60 ml-8">
                            Hit at ${validationEvent.price_at_hit.toFixed(2)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {symbol && <StockPrice symbol={symbol} />}

          <Separator />

          <div className="flex items-center justify-between">
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

              <Button
                variant="ghost"
                size="sm"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                <span className="text-sm">{commentsCount}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRepost}
                disabled={isLoading}
                className={isReposted ? 'text-green-600 hover:text-green-700' : ''}
              >
                <Repeat2 className={`h-4 w-4 mr-1 ${isReposted ? 'fill-current' : ''}`} />
                <span className="text-sm">{repostsCount}</span>
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {analysis.is_own_post && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBroadcastToTelegram}
                    disabled={isBroadcasting}
                    title="Send to default Telegram channel"
                  >
                    {isBroadcasting ? (
                      <Clock className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowResendDialog(true)}
                    title="Resend to another Telegram channel"
                  >
                    <Repeat className="h-4 w-4" />
                  </Button>
                </>
              )}

              <ShareMenu
                url={`/share/${analysis.id}`}
                title={`${symbol} - ${getPostTypeLabel()} by ${authorName}`}
                description={analysis.title || analysis.summary || `${analysis.direction} position on ${symbol}`}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Comments</h2>
        </CardHeader>
        <CardContent>
          <CommentSection
            analysisId={analysis.id}
            onCommentAdded={() => setCommentsCount(prev => prev + 1)}
            showReplies={true}
          />
        </CardContent>
      </Card>

      {analysis.chart_image_url && (
        <ImageViewer
          src={analysis.chart_image_url}
          alt={`${symbol || 'Analysis'} chart`}
          open={showImageViewer}
          onOpenChange={setShowImageViewer}
          onDownload={handleDownloadImage}
        />
      )}

      <ResendToChannelDialog
        open={showResendDialog}
        onOpenChange={setShowResendDialog}
        analysisId={analysis.id}
        analysisTitle={analysis.title || analysis.summary || `${symbol} ${analysis.direction || ''} analysis`}
      />
    </div>
  )
}
