'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { FollowButton } from '@/components/profile/FollowButton'
import { RateAnalyzer } from '@/components/ratings/RateAnalyzer'
import { AnalyzerRatings } from '@/components/ratings/AnalyzerRatings'
import { StarRating } from '@/components/ratings/StarRating'
import { SubscriptionPlans } from '@/components/subscriptions/SubscriptionPlans'
import { SubscriptionStatusBadge } from '@/components/subscriptions/SubscriptionStatusBadge'
import { PlanManagement } from '@/components/settings/PlanManagement'
import { Loader as Loader2, TrendingUp, Target, Activity, Users, UserPlus, FileText, MessageCircle, Repeat2, Package, Settings2 } from 'lucide-react'

interface ProfilePageProps {
  params: {
    id: string
  }
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const router = useRouter()
  const [profileData, setProfileData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userRating, setUserRating] = useState<any>(null)
  const [ratingStats, setRatingStats] = useState<any>(null)
  const [reposts, setReposts] = useState<any[]>([])
  const [replies, setReplies] = useState<any[]>([])
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [hasSubscriptionPlans, setHasSubscriptionPlans] = useState(false)

  const fetchProfile = () => {
    fetch(`/api/profiles/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          if (data.error === 'Unauthorized') {
            router.push('/login')
          } else {
            router.push('/dashboard')
          }
          return
        }
        setProfileData(data)
      })
      .catch(() => {
        router.push('/dashboard')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const fetchUserRating = async () => {
    try {
      const response = await fetch(`/api/ratings/user/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setUserRating(data.rating)
      }
    } catch (error) {
      console.error('Failed to fetch user rating:', error)
    }
  }

  const fetchRatingStats = async () => {
    try {
      const response = await fetch(`/api/ratings/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setRatingStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch rating stats:', error)
    }
  }

  const checkSubscriptionPlans = async () => {
    try {
      const response = await fetch(`/api/plans?analystId=${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setHasSubscriptionPlans(data.plans && data.plans.length > 0)
      }
    } catch (error) {
      console.error('Failed to check subscription plans:', error)
    }
  }

  const fetchReposts = async () => {
    setLoadingTabs(true)
    try {
      const response = await fetch(`/api/profiles/${params.id}/reposts`)
      if (response.ok) {
        const data = await response.json()
        setReposts(data.reposts || [])
      }
    } catch (error) {
      console.error('Failed to fetch reposts:', error)
    } finally {
      setLoadingTabs(false)
    }
  }

  const fetchReplies = async () => {
    setLoadingTabs(true)
    try {
      const response = await fetch(`/api/profiles/${params.id}/replies`)
      if (response.ok) {
        const data = await response.json()
        setReplies(data.comments || [])
      }
    } catch (error) {
      console.error('Failed to fetch replies:', error)
    } finally {
      setLoadingTabs(false)
    }
  }

  useEffect(() => {
    fetchProfile()
    fetchUserRating()
    fetchRatingStats()
    checkSubscriptionPlans()
  }, [params.id, router])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    )
  }

  if (!profileData) {
    return null
  }

  const { profile, analyses, stats, isFollowing, isOwnProfile } = profileData

  const getSuccessRateBadgeColor = (rate: number) => {
    if (rate >= 70) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    if (rate >= 50) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-24 w-24 border-4 border-slate-100 dark:border-slate-800">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.full_name
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div>
                <h1 className="text-3xl font-bold">{profile.full_name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <Badge variant="outline">{profile.roles?.name}</Badge>
                  {hasSubscriptionPlans && (
                    <Badge variant="default" className="gap-1 bg-gradient-to-r from-blue-600 to-purple-600">
                      <Package className="h-3 w-3" />
                      Offers Subscriptions
                    </Badge>
                  )}
                  {ratingStats && ratingStats.total_ratings > 0 && (
                    <StarRating
                      rating={ratingStats.average_rating}
                      size="sm"
                      showValue={true}
                    />
                  )}
                </div>
                {profile.bio && (
                  <p className="mt-3 text-sm text-muted-foreground max-w-md">{profile.bio}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {!isOwnProfile && (
                <>
                  <div className="flex items-center gap-2">
                    <FollowButton
                      profileId={params.id}
                      initialIsFollowing={isFollowing}
                      onFollowChange={fetchProfile}
                    />
                    {profile.roles?.name === 'Analyzer' && (
                      <SubscriptionStatusBadge
                        analyzerId={params.id}
                        analyzerName={profile.full_name}
                        isFollowing={isFollowing}
                        showButton={true}
                        onSubscriptionChange={fetchProfile}
                      />
                    )}
                  </div>
                  <RateAnalyzer
                    analyzerId={params.id}
                    analyzerName={profile.full_name}
                    currentRating={userRating}
                    onRatingSubmit={() => {
                      fetchUserRating()
                      fetchRatingStats()
                    }}
                  />
                </>
              )}
              {isOwnProfile && (
                <Link href="/dashboard/settings">
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                    Edit Profile
                  </Badge>
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mt-8 pt-6 border-t">
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-2xl font-bold">{stats.total_analyses || 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <Activity className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-2xl font-bold">{stats.active_analyses || 0}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-2xl font-bold">{stats.successful_analyses || 0}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className={`text-2xl font-bold px-2 py-1 rounded ${getSuccessRateBadgeColor(stats.success_rate || 0)}`}>
                {stats.success_rate || 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">Success Rate</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <Users className="h-4 w-4 text-pink-600 dark:text-pink-400" />
              </div>
              <p className="text-2xl font-bold">{stats.followers_count || 0}</p>
              <p className="text-xs text-muted-foreground">Followers</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <UserPlus className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </div>
              <p className="text-2xl font-bold">{stats.following_count || 0}</p>
              <p className="text-xs text-muted-foreground">Following</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-center mb-1">
                <FileText className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <p className="text-2xl font-bold">{stats.completed_analyses || 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>

          {stats.completed_analyses > 0 && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-100 dark:border-blue-900">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Performance:</strong> {stats.successful_analyses} successful out of {stats.completed_analyses} completed analyses
                {stats.success_rate >= 70 && ' - Excellent track record!'}
                {stats.success_rate >= 50 && stats.success_rate < 70 && ' - Good performance'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="posts" className="space-y-4">
            <TabsList>
              <TabsTrigger value="posts" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Posts
                {analyses && analyses.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{analyses.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="reposts"
                className="flex items-center gap-2"
                onClick={() => reposts.length === 0 && fetchReposts()}
              >
                <Repeat2 className="h-4 w-4" />
                Reposts
                {reposts.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{reposts.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="replies"
                className="flex items-center gap-2"
                onClick={() => replies.length === 0 && fetchReplies()}
              >
                <MessageCircle className="h-4 w-4" />
                Replies
                {replies.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{replies.length}</Badge>
                )}
              </TabsTrigger>
              {isOwnProfile && profile.roles?.name === 'Analyzer' && (
                <TabsTrigger value="plans" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  My Plans
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="posts" className="space-y-4">
              {analyses && analyses.length > 0 ? (
                analyses.map((analysis: any) => (
                  <AnalysisCard
                    key={analysis.id}
                    analysis={analysis}
                    onFollowChange={fetchProfile}
                  />
                ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                    <p className="text-muted-foreground">
                      {isOwnProfile ? "You haven't created any analyses yet" : "No analyses yet"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="reposts" className="space-y-4">
              {loadingTabs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : reposts.length > 0 ? (
                reposts.map((repost: any) => (
                  <div key={repost.id} className="space-y-2">
                    {repost.comment && (
                      <Card className="bg-slate-50 dark:bg-slate-900 p-3">
                        <p className="text-sm text-muted-foreground">{repost.comment}</p>
                      </Card>
                    )}
                    <AnalysisCard
                      analysis={repost.analysis}
                      onFollowChange={fetchProfile}
                    />
                  </div>
                ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Repeat2 className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                    <p className="text-muted-foreground">
                      {isOwnProfile ? "You haven't reposted anything yet" : "No reposts yet"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="replies" className="space-y-4">
              {loadingTabs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : replies.length > 0 ? (
                replies.map((comment: any) => (
                  <Card key={comment.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3 mb-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={comment.profiles.avatar_url || undefined} />
                          <AvatarFallback>
                            {comment.profiles.full_name[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/profile/${comment.profiles.id}`} className="font-semibold hover:underline">
                              {comment.profiles.full_name}
                            </Link>
                            <span className="text-sm text-muted-foreground">
                              {new Date(comment.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {comment.parent_comment_id && (
                            <p className="text-xs text-muted-foreground">
                              Replying to @{comment.parent_comment?.profiles?.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-sm mb-3">{comment.content}</p>
                      {comment.analyses && (
                        <Link
                          href={`/dashboard/analysis/${comment.analyses.id}`}
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" />
                          On {comment.analyses.profiles.full_name}'s {comment.analyses.direction} analysis for ${comment.analyses.symbols.symbol}
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                    <p className="text-muted-foreground">
                      {isOwnProfile ? "You haven't commented or replied yet" : "No comments or replies yet"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {isOwnProfile && profile.roles?.name === 'Analyzer' && (
              <TabsContent value="plans" className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <PlanManagement />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="lg:col-span-1 space-y-6">
          {profile.roles?.name === 'Analyzer' && (
            <AnalyzerRatings analyzerId={params.id} />
          )}
        </div>
      </div>

      {profile.roles?.name === 'Analyzer' && !isOwnProfile && (
        <div id="subscription-plans">
          <SubscriptionPlans
            analystId={params.id}
            analystName={profile.full_name}
          />
        </div>
      )}
    </div>
  )
}
