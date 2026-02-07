'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { RecommendedFeed } from '@/components/recommendations/RecommendedFeed'
import { RecommendedAnalyzers } from '@/components/recommendations/RecommendedAnalyzers'
import { RecommendedSymbols } from '@/components/recommendations/RecommendedSymbols'
import { RefreshCw, FileText, UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/language-context'

export default function FeedPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [globalAnalyses, setGlobalAnalyses] = useState<any[]>([])
  const [followingAnalyses, setFollowingAnalyses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('following')
  const [tabsLoaded, setTabsLoaded] = useState(false)

  const fetchAnalyses = () => {
    Promise.all([
      fetch('/api/analyses?type=global').then(r => r.json()),
      fetch('/api/analyses?type=following').then(r => r.json()),
    ])
      .then(([globalData, followingData]) => {
        if (globalData.error || followingData.error) {
          router.push('/login')
          return
        }
        setGlobalAnalyses(globalData.analyses || [])
        setFollowingAnalyses(followingData.analyses || [])
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const loadFeedPreference = async () => {
    try {
      const response = await fetch('/api/me')
      if (response.ok) {
        const data = await response.json()
        if (data.user?.feed_tab_preference) {
          setActiveTab(data.user.feed_tab_preference)
        }
      }
    } catch (error) {
      console.error('Failed to load feed preference:', error)
    } finally {
      setTabsLoaded(true)
    }
  }

  const saveFeedPreference = async (tab: string) => {
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_tab_preference: tab })
      })
    } catch (error) {
      console.error('Failed to save feed preference:', error)
    }
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    saveFeedPreference(tab)
  }

  const handleValidatePrices = async () => {
    setValidating(true)
    try {
      const response = await fetch('/api/validate-prices', {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`${t.dashboard.feed.validation.complete} ${data.results.checked}, ${t.dashboard.feed.validation.validated} ${data.results.validated}`)
        fetchAnalyses()
      } else {
        toast.error(data.error || t.dashboard.feed.validation.failed)
      }
    } catch (error) {
      toast.error(t.dashboard.feed.validation.failedToValidate)
    } finally {
      setValidating(false)
    }
  }

  useEffect(() => {
    loadFeedPreference()
    fetchAnalyses()
  }, [router])

  if (loading || !tabsLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{t.dashboard.feed.loadingAnalyses}</p>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t.dashboard.feed.pageTitle}</h1>
            <p className="text-muted-foreground">{t.dashboard.feed.pageSubtitle}</p>
          </div>
          <Button
            onClick={handleValidatePrices}
            disabled={validating}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${validating ? 'animate-spin' : ''}`} />
            {validating ? t.dashboard.feed.validating : t.dashboard.feed.checkPrices}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              <TabsList>
                <TabsTrigger value="recommended">{t.dashboard.feed.recommended}</TabsTrigger>
                <TabsTrigger value="global">{t.dashboard.feed.globalFeed}</TabsTrigger>
                <TabsTrigger value="following">{t.dashboard.feed.following}</TabsTrigger>
              </TabsList>

              <TabsContent value="recommended" className="space-y-4">
                <RecommendedFeed />
              </TabsContent>

              <TabsContent value="global" className="space-y-4">
                {globalAnalyses && globalAnalyses.length > 0 ? (
                  globalAnalyses.map((analysis: any) => (
                    <AnalysisCard key={analysis.id} analysis={analysis} onFollowChange={fetchAnalyses} />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg">
                    <FileText className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">{t.dashboard.feed.emptyStates.noAnalysesYet}</h3>
                    <p className="text-muted-foreground text-center max-w-md mb-6">
                      {t.dashboard.feed.emptyStates.beFirstToShare}
                    </p>
                    <Link href="/dashboard/create-analysis">
                      <Button>
                        <FileText className="h-4 w-4 mr-2" />
                        {t.dashboard.feed.emptyStates.createFirstAnalysis}
                      </Button>
                    </Link>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="following" className="space-y-4">
                {followingAnalyses && followingAnalyses.length > 0 ? (
                  followingAnalyses.map((analysis: any) => (
                    <AnalysisCard key={analysis.id} analysis={analysis} onFollowChange={fetchAnalyses} />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg">
                    <UserPlus className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">{t.dashboard.feed.emptyStates.noFollowedAnalyzers}</h3>
                    <p className="text-muted-foreground text-center max-w-md mb-6">
                      {t.dashboard.feed.emptyStates.startFollowingExperts}
                    </p>
                    <Link href="/dashboard/search">
                      <Button>
                        <UserPlus className="h-4 w-4 mr-2" />
                        {t.dashboard.feed.emptyStates.findAnalyzersToFollow}
                      </Button>
                    </Link>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <RecommendedAnalyzers />
            <RecommendedSymbols />
          </div>
        </div>
      </div>
    </div>
  )
}
