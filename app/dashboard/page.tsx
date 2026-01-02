'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, TrendingUp, Activity, Target, UserPlus, Loader2 } from 'lucide-react'
import { SessionUser } from '@/lib/auth/types'
import { useLanguage } from '@/lib/i18n/language-context'

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.push('/login')
        } else {
          setUser(d.user)
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [router])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{t.dashboard.loadingDashboard}</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const stats = user.stats || {
    total_analyses: 0,
    active_analyses: 0,
    completed_analyses: 0,
    successful_analyses: 0,
    success_rate: 0,
    followers_count: 0,
    following_count: 0
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 70) return 'text-green-600 dark:text-green-400'
    if (rate >= 50) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const statCards = [
    {
      title: t.dashboard.totalAnalyses,
      value: stats.total_analyses,
      icon: FileText,
      description: t.dashboard.publishedAnalyses,
      color: 'text-blue-600',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.activeAnalyses,
      value: stats.active_analyses,
      icon: Activity,
      description: t.dashboard.currentlyActive,
      color: 'text-orange-600',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.successful,
      value: stats.successful_analyses,
      icon: Target,
      description: t.dashboard.hitTargets,
      color: 'text-green-600',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.successRate,
      value: `${stats.success_rate}%`,
      icon: TrendingUp,
      description: stats.completed_analyses > 0 ? `${stats.completed_analyses} ${t.dashboard.completed}` : t.dashboard.noCompleted,
      color: getSuccessRateColor(stats.success_rate),
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.followers,
      value: stats.followers_count,
      icon: Users,
      description: t.dashboard.usersFollowingYou,
      color: 'text-pink-600',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.following,
      value: stats.following_count,
      icon: UserPlus,
      description: t.dashboard.analyzersYouFollow,
      color: 'text-cyan-600',
      link: `/dashboard/profile/${user.id}`
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
          {t.dashboard.welcomeBack} {user.profile.full_name}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          {t.dashboard.performanceOverview}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.title} href={stat.link}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${stat.title === 'Success Rate' ? stat.color : ''}`}>
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {stats.completed_analyses > 0 && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">{t.dashboard.performanceSummary}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-900 dark:text-blue-100">
              {t.dashboard.completedAnalyses} <strong>{stats.completed_analyses}</strong> {t.dashboard.analysesWith}{' '}
              <strong>{stats.successful_analyses}</strong> {t.dashboard.successfullyHitting}
              {stats.success_rate >= 70 && ` ${t.dashboard.excellentWork}`}
              {stats.success_rate >= 50 && stats.success_rate < 70 && ` ${t.dashboard.goodPerformance}`}
              {stats.success_rate < 50 && ` ${t.dashboard.keepLearning}`}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.gettingStarted}</CardTitle>
          <CardDescription>
            {t.dashboard.welcomePlatform}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {t.dashboard.yourRole} {user.role}
            </h3>
            {user.role === 'SuperAdmin' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.superAdminRole}
              </p>
            )}
            {user.role === 'Analyzer' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.analyzerRole}
              </p>
            )}
            {user.role === 'Trader' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.traderRole}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {t.dashboard.quickActions}
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>
                <Link href="/dashboard/settings" className="text-blue-600 hover:underline">
                  {t.dashboard.completeProfile}
                </Link>
              </li>
              {user.role === 'Analyzer' && (
                <li>
                  <Link href="/dashboard/create-analysis" className="text-blue-600 hover:underline">
                    {t.dashboard.createFirstAnalysis}
                  </Link>
                </li>
              )}
              {user.role === 'Trader' && (
                <li>
                  <Link href="/dashboard/search" className="text-blue-600 hover:underline">
                    {t.dashboard.findAnalyzers}
                  </Link>
                </li>
              )}
              <li>
                <Link href="/dashboard/feed" className="text-blue-600 hover:underline">
                  {t.dashboard.exploreFeed}
                </Link>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
