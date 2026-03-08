'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { FollowButton } from '@/components/profile/FollowButton'
import { RateAnalyzer } from '@/components/ratings/RateAnalyzer'
import { AnalyzerRatings } from '@/components/ratings/AnalyzerRatings'
import { StarRating } from '@/components/ratings/StarRating'
import { SubscriptionPlans } from '@/components/subscriptions/SubscriptionPlans'
import { SubscriptionStatusBadge } from '@/components/subscriptions/SubscriptionStatusBadge'
import { PlanManagement } from '@/components/settings/PlanManagement'
import { ProfileTradesList } from '@/components/profile/ProfileTradesList'
import { FollowersList } from '@/components/profile/FollowersList'
import { ProfileStats } from '@/components/rankings/ProfileStats'
import {
  Loader as Loader2,
  TrendingUp, Target, Activity, Users, UserPlus,
  FileText, MessageCircle, Repeat2, Package,
  Settings2, BarChart3, CalendarDays, CheckCircle2,
  Settings, CreditCard, Shield, Award
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/language-context'

interface ProfilePageProps {
  params: { id: string }
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const [profileData, setProfileData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userRating, setUserRating] = useState<any>(null)
  const [ratingStats, setRatingStats] = useState<any>(null)
  const [reposts, setReposts] = useState<any[]>([])
  const [replies, setReplies] = useState<any[]>([])
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [hasSubscriptionPlans, setHasSubscriptionPlans] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)

  // ── Data fetching (unchanged) ────────────────────────────────────────────
  const fetchProfile = () => {
    fetch(`/api/profiles/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          router.push(data.error === 'Unauthorized' ? '/login' : '/dashboard')
          return
        }
        setProfileData(data)
      })
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false))
  }

  const fetchUserRating = async () => {
    try {
      const r = await fetch(`/api/ratings/user/${params.id}`)
      if (r.ok) { const d = await r.json(); setUserRating(d.rating) }
    } catch {}
  }

  const fetchRatingStats = async () => {
    try {
      const r = await fetch(`/api/ratings/${params.id}`)
      if (r.ok) { const d = await r.json(); setRatingStats(d.stats) }
    } catch {}
  }

  const checkSubscriptionPlans = async () => {
    try {
      const r = await fetch(`/api/plans?analystId=${params.id}`)
      if (r.ok) { const d = await r.json(); setHasSubscriptionPlans(d.plans?.length > 0) }
    } catch {}
  }

  const checkSubscriptionStatus = async () => {
    try {
      const r = await fetch(`/api/subscriptions/check?analystId=${params.id}`)
      if (r.ok) { const d = await r.json(); setHasSubscription(d.isSubscribed || false) }
    } catch {}
  }

  const fetchReposts = async () => {
    setLoadingTabs(true)
    try {
      const r = await fetch(`/api/profiles/${params.id}/reposts`)
      if (r.ok) { const d = await r.json(); setReposts(d.reposts || []) }
    } catch {} finally { setLoadingTabs(false) }
  }

  const fetchReplies = async () => {
    setLoadingTabs(true)
    try {
      const r = await fetch(`/api/profiles/${params.id}/replies`)
      if (r.ok) { const d = await r.json(); setReplies(d.comments || []) }
    } catch {} finally { setLoadingTabs(false) }
  }

  useEffect(() => {
    fetchProfile()
    fetchUserRating()
    fetchRatingStats()
    checkSubscriptionPlans()
    checkSubscriptionStatus()
  }, [params.id])

  // ── Loading / empty ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">{t.profile.loadingProfile}</p>
      </div>
    )
  }
  if (!profileData) return null

  const { profile, analyses, stats, isFollowing, isOwnProfile } = profileData

  const isAnalyzer = profile.roles?.name === 'Analyzer'
  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  const successColor =
    (stats.success_rate || 0) >= 70 ? '#3FB950'
    : (stats.success_rate || 0) >= 50 ? '#E3B341'
    : '#F85149'

  const performanceSummary =
    stats.completed_analyses > 0
      ? `${stats.successful_analyses} successful out of ${stats.completed_analyses} completed`
      : null

  const QUICK_STATS = [
    { label: t.profile.total,        value: stats.total_analyses   || 0, icon: FileText,  color: '#58A6FF' },
    { label: t.profile.active,       value: stats.active_analyses  || 0, icon: Activity,  color: '#E3B341' },
    { label: t.profile.successful,   value: stats.successful_analyses || 0, icon: Target, color: '#3FB950' },
    { label: t.profile.completed,    value: stats.completed_analyses  || 0, icon: CheckCircle2, color: '#A371F7' },
    { label: t.profile.successRate,  value: `${stats.success_rate || 0}%`, icon: TrendingUp, color: successColor },
    { label: t.profile.followers,    value: stats.followers_count  || 0, icon: Users,     color: '#F78166' },
    { label: t.profile.following,    value: stats.following_count  || 0, icon: UserPlus,  color: '#79C0FF' },
  ]

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto pb-12 px-4 sm:px-6 lg:px-8">

      {/* ── COVER BAND ───────────────────────────────────────────────────── */}
      <div
        className="relative h-32 sm:h-40 rounded-b-none rounded-t-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0D1117 0%, #1C2128 40%, #0D2137 100%)',
        }}
      >
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(88,166,255,0.3) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(88,166,255,0.3) 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />
        {/* Decorative chart line */}
        <svg className="absolute bottom-0 left-0 right-0 opacity-20" viewBox="0 0 1200 80" preserveAspectRatio="none">
          <path
            d="M0,60 L80,52 L160,45 L240,50 L320,38 L400,30 L480,34 L560,22 L640,18 L720,24 L800,14 L880,10 L960,16 L1040,8 L1120,12 L1200,6"
            fill="none" stroke="#3FB950" strokeWidth="2"
          />
          <path
            d="M0,60 L80,52 L160,45 L240,50 L320,38 L400,30 L480,34 L560,22 L640,18 L720,24 L800,14 L880,10 L960,16 L1040,8 L1120,12 L1200,6 L1200,80 L0,80 Z"
            fill="url(#coverGrad)" opacity="0.3"
          />
          <defs>
            <linearGradient id="coverGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3FB950" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3FB950" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ── PROFILE HEADER CARD ───────────────────────────────────────────── */}
      <div className="bg-card border border-border border-t-0 px-6 pb-5">

        {/* Avatar row — overlapping cover */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-10 sm:-mt-12 mb-4">
          <div className="flex items-end gap-4">
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-card ring-2 ring-border flex-shrink-0 shadow-xl">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl font-black bg-gradient-to-br from-primary/20 to-primary/5">
                {profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            {/* Name + badges (visible at sm+) */}
            <div className="hidden sm:block pb-1">
              <div className="flex items-center flex-wrap gap-2 mb-1.5">
                <h1 className="text-xl font-black text-foreground leading-tight">{profile.full_name}</h1>

                {/* Role badge */}
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded border"
                  style={isAnalyzer
                    ? { color: '#58A6FF', background: 'rgba(88,166,255,0.10)', borderColor: 'rgba(88,166,255,0.25)' }
                    : { color: '#8B949E', background: 'rgba(139,148,158,0.10)', borderColor: 'rgba(139,148,158,0.25)' }}
                >
                  {isAnalyzer ? '◆ ANALYZER' : '● TRADER'}
                </span>

                {hasSubscriptionPlans && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border"
                    style={{ color: '#A371F7', background: 'rgba(163,113,247,0.10)', borderColor: 'rgba(163,113,247,0.25)' }}>
                    <Package className="inline h-2.5 w-2.5 mr-0.5" />
                    SUBSCRIPTIONS
                  </span>
                )}

                {ratingStats?.total_ratings > 0 && (
                  <StarRating rating={ratingStats.average_rating} size="sm" showValue />
                )}
              </div>

              {joinDate && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  Joined {joinDate}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:pb-1">
            {!isOwnProfile ? (
              <>
                <FollowButton
                  profileId={params.id}
                  initialIsFollowing={isFollowing}
                  onFollowChange={fetchProfile}
                />
                {isAnalyzer && (
                  <SubscriptionStatusBadge
                    analyzerId={params.id}
                    analyzerName={profile.full_name}
                    isFollowing={isFollowing}
                    showButton
                    onSubscriptionChange={fetchProfile}
                  />
                )}
                <RateAnalyzer
                  analyzerId={params.id}
                  analyzerName={profile.full_name}
                  currentRating={userRating}
                  onRatingSubmit={() => { fetchUserRating(); fetchRatingStats() }}
                />
              </>
            ) : (
              <>
                <Link href="/dashboard/settings">
                  <Button variant="outline" size="sm" className="h-8 rounded-sm text-xs border-border gap-1.5">
                    <Settings className="h-3.5 w-3.5" />
                    {t.profile.editProfile}
                  </Button>
                </Link>
                {isAnalyzer && (
                  <Link href="#plans">
                    <Button variant="outline" size="sm" className="h-8 rounded-sm text-xs border-border gap-1.5"
                      style={{ borderColor: 'rgba(163,113,247,0.40)', color: '#A371F7' }}>
                      <CreditCard className="h-3.5 w-3.5" />
                      {t.profile.myPlans}
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile: name + badges below avatar */}
        <div className="sm:hidden mb-3">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <h1 className="text-lg font-black text-foreground">{profile.full_name}</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border"
              style={isAnalyzer
                ? { color: '#58A6FF', background: 'rgba(88,166,255,0.10)', borderColor: 'rgba(88,166,255,0.25)' }
                : { color: '#8B949E', background: 'rgba(139,148,158,0.10)', borderColor: 'rgba(139,148,158,0.25)' }}>
              {isAnalyzer ? '◆ ANALYZER' : '● TRADER'}
            </span>
            {hasSubscriptionPlans && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border"
                style={{ color: '#A371F7', background: 'rgba(163,113,247,0.10)', borderColor: 'rgba(163,113,247,0.25)' }}>
                SUBSCRIPTIONS
              </span>
            )}
          </div>
          {joinDate && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3" />Joined {joinDate}
            </div>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-4 border-l-2 border-primary/30 pl-3">
            {profile.bio}
          </p>
        )}

        {/* ── QUICK STATS STRIP ────────────────────────────────────────── */}
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {QUICK_STATS.map((s) => {
              const Icon = s.icon
              return (
                <div
                  key={s.label}
                  className="flex flex-col items-center py-2.5 px-1.5 rounded-sm bg-card border border-border hover:border-primary/30 transition-colors"
                >
                  <Icon className="h-3 w-3 mb-1.5 flex-shrink-0" style={{ color: s.color }} />
                  <span className="text-base sm:text-lg font-black num leading-none" style={{ color: s.color }}>
                    {s.value}
                  </span>
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mt-1 text-center leading-tight">
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Performance summary bar */}
          {performanceSummary && (
            <div
              className="mt-3 flex items-center gap-2.5 px-3 py-2 rounded-sm border text-xs"
              style={{
                background: `${successColor}0D`,
                borderColor: `${successColor}30`,
                color: successColor,
              }}
            >
              <Shield className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                <strong>Performance:</strong> {performanceSummary}
                {(stats.success_rate || 0) >= 70 && ' — Excellent track record'}
                {(stats.success_rate || 0) >= 50 && (stats.success_rate || 0) < 70 && ' — Good performance'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── LEFT: Tabs ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="posts" className="space-y-3">

            {/* Tab nav */}
            <TabsList className="h-9 w-full justify-start rounded-sm border border-border bg-card p-0 gap-0 overflow-x-auto">
              {[
                { value: 'posts',     icon: FileText,      label: t.profile.posts,     count: analyses?.length },
                ...(isAnalyzer ? [{ value: 'trades', icon: BarChart3, label: t.profile.trades, count: undefined }] : []),
                { value: 'reposts',   icon: Repeat2,       label: t.profile.reposts,   count: reposts.length || undefined,
                  onClick: () => reposts.length === 0 && fetchReposts() },
                { value: 'replies',   icon: MessageCircle, label: t.profile.replies,   count: replies.length || undefined,
                  onClick: () => replies.length === 0 && fetchReplies() },
                { value: 'followers', icon: Users,         label: 'Followers',          count: stats.followers_count || undefined },
                ...(isOwnProfile && isAnalyzer
                  ? [{ value: 'plans', icon: Settings2, label: t.profile.myPlans, count: undefined }]
                  : []),
              ].map(tab => {
                const Icon = tab.icon
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    onClick={(tab as any).onClick}
                    className="flex-shrink-0 h-9 px-3 sm:px-4 rounded-none text-xs font-semibold gap-1.5 border-r border-border last:border-r-0 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-b-primary"
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {tab.count}
                      </span>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {/* Posts */}
            <TabsContent value="posts" className="space-y-3 mt-0">
              {analyses?.length > 0
                ? analyses.map((a: any) => <AnalysisCard key={a.id} analysis={a} onFollowChange={fetchProfile} />)
                : (
                  <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-sm">
                    <FileText className="h-10 w-10 text-muted-foreground opacity-30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {isOwnProfile ? t.profile.haventCreatedAnalyses : t.profile.noAnalysesYet}
                    </p>
                  </div>
                )}
            </TabsContent>

            {/* Trades */}
            {isAnalyzer && (
              <TabsContent value="trades" className="mt-0">
                <ProfileTradesList profileId={params.id} isOwnProfile={isOwnProfile} hasSubscription={hasSubscription} />
              </TabsContent>
            )}

            {/* Reposts */}
            <TabsContent value="reposts" className="space-y-3 mt-0">
              {loadingTabs
                ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
                : reposts.length > 0
                  ? reposts.map((r: any) => (
                    <div key={r.id} className="space-y-2">
                      {r.comment && (
                        <div className="bg-muted/30 border border-border rounded-sm p-3 text-sm text-muted-foreground">
                          {r.comment}
                        </div>
                      )}
                      <AnalysisCard analysis={r.analysis} onFollowChange={fetchProfile} />
                    </div>
                  ))
                  : (
                    <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-sm">
                      <Repeat2 className="h-10 w-10 text-muted-foreground opacity-30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {isOwnProfile ? t.profile.haventReposted : t.profile.noRepostsYet}
                      </p>
                    </div>
                  )
              }
            </TabsContent>

            {/* Replies */}
            <TabsContent value="replies" className="space-y-3 mt-0">
              {loadingTabs
                ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
                : replies.length > 0
                  ? replies.map((c: any) => (
                    <div key={c.id} className="bg-card border border-border rounded-sm p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={c.profiles.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{c.profiles.full_name[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <Link href={`/dashboard/profile/${c.profiles.id}`} className="text-sm font-semibold hover:underline">
                          {c.profiles.full_name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {c.parent_comment_id && (
                        <p className="text-[11px] text-muted-foreground mb-1">
                          {t.profile.replyingTo} @{c.parent_comment?.profiles?.full_name}
                        </p>
                      )}
                      <p className="text-sm text-foreground">{c.content}</p>
                      {c.analyses && (
                        <Link href={`/dashboard/analysis/${c.analyses.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                          <FileText className="h-3 w-3" />
                          On {c.analyses.profiles.full_name}'s {c.analyses.direction} analysis for ${c.analyses.symbols.symbol}
                        </Link>
                      )}
                    </div>
                  ))
                  : (
                    <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-sm">
                      <MessageCircle className="h-10 w-10 text-muted-foreground opacity-30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {isOwnProfile ? t.profile.haventCommented : t.profile.noCommentsYet}
                      </p>
                    </div>
                  )
              }
            </TabsContent>

            {/* Followers */}
            <TabsContent value="followers" className="mt-0">
              <FollowersList profileId={params.id} isOwnProfile={isOwnProfile} />
            </TabsContent>

            {/* My Plans (own profile only) */}
            {isOwnProfile && isAnalyzer && (
              <TabsContent value="plans" id="plans" className="mt-0">
                <div className="bg-card border border-border rounded-sm p-6">
                  <PlanManagement />
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Analyst type card */}
          <div className="bg-card border border-border rounded-sm p-4">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Analyst Status</div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-semibold"
                style={isAnalyzer
                  ? { color: '#58A6FF', background: 'rgba(88,166,255,0.10)', borderColor: 'rgba(88,166,255,0.25)' }
                  : { color: '#8B949E', background: 'rgba(139,148,158,0.10)', borderColor: 'rgba(139,148,158,0.25)' }}>
                <Award className="h-3.5 w-3.5" />
                {profile.roles?.name || 'Member'}
              </div>
              {hasSubscriptionPlans && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-semibold"
                  style={{ color: '#A371F7', background: 'rgba(163,113,247,0.10)', borderColor: 'rgba(163,113,247,0.25)' }}>
                  <Package className="h-3.5 w-3.5" />
                  {t.profile.offersSubscriptions}
                </div>
              )}
              {ratingStats?.total_ratings > 0 && (
                <StarRating rating={ratingStats.average_rating} size="sm" showValue />
              )}
            </div>
          </div>

          {/* Performance + ranking + engagement stats */}
          <ProfileStats userId={params.id} />

          {/* Ratings (Analyzer only) */}
          {isAnalyzer && <AnalyzerRatings analyzerId={params.id} />}

          {/* Subscription plans (public view, Analyzer only) */}
          {isAnalyzer && !isOwnProfile && hasSubscriptionPlans && (
            <div id="subscription-plans" className="bg-card border border-border rounded-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Subscription Plans</div>
              </div>
              <div className="p-4">
                <SubscriptionPlans analystId={params.id} analystName={profile.full_name} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
