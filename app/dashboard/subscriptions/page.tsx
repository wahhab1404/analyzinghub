'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Package, TrendingUp } from 'lucide-react'
import { SubscriptionPlans } from '@/components/subscriptions/SubscriptionPlans'
import { MySubscriptions } from '@/components/subscriptions/MySubscriptions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Link from 'next/link'

interface AnalyzerWithPlans {
  id: string
  full_name: string
  avatar_url: string | null
  bio: string | null
  stats: {
    success_rate: number
    total_analyses: number
    successful_analyses: number
  }
  planCount: number
}

export default function SubscriptionsPage() {
  const [analyzers, setAnalyzers] = useState<AnalyzerWithPlans[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAnalyzer, setSelectedAnalyzer] = useState<AnalyzerWithPlans | null>(null)

  useEffect(() => {
    fetchAnalyzersWithPlans()
  }, [])

  const fetchAnalyzersWithPlans = async () => {
    try {
      const response = await fetch('/api/plans/marketplace')
      if (response.ok) {
        const data = await response.json()
        setAnalyzers(data.analyzers || [])
      }
    } catch (error) {
      console.error('Failed to fetch analyzers:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSuccessRateBadgeColor = (rate: number) => {
    if (rate >= 70) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    if (rate >= 50) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Package className="h-8 w-8" />
          Subscription Marketplace
        </h1>
        <p className="text-muted-foreground mt-2">
          Subscribe to top analyzers and get exclusive access to their analyses
        </p>
      </div>

      <Tabs defaultValue="marketplace" className="space-y-6">
        <TabsList>
          <TabsTrigger value="marketplace">
            <Package className="h-4 w-4 mr-2" />
            Browse Plans
          </TabsTrigger>
          <TabsTrigger value="my-subscriptions">
            <TrendingUp className="h-4 w-4 mr-2" />
            My Subscriptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : analyzers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">
                  No subscription plans available yet
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {selectedAnalyzer ? (
                <div className="space-y-4">
                  <button
                    onClick={() => setSelectedAnalyzer(null)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ← Back to all analyzers
                  </button>
                  <SubscriptionPlans
                    analystId={selectedAnalyzer.id}
                    analystName={selectedAnalyzer.full_name}
                  />
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {analyzers.map((analyzer) => (
                    <Card
                      key={analyzer.id}
                      className="hover:border-primary transition-colors cursor-pointer"
                      onClick={() => setSelectedAnalyzer(analyzer)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <Link
                            href={`/dashboard/profile/${analyzer.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Avatar className="h-16 w-16 border-2 border-slate-100 dark:border-slate-800">
                              <AvatarImage src={analyzer.avatar_url || undefined} />
                              <AvatarFallback className="text-lg">
                                {analyzer.full_name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Link>

                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <Link
                                  href={`/dashboard/profile/${analyzer.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:underline"
                                >
                                  <h3 className="text-xl font-bold">
                                    {analyzer.full_name}
                                  </h3>
                                </Link>
                                {analyzer.bio && (
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {analyzer.bio}
                                  </p>
                                )}
                              </div>
                              <Badge variant="secondary">
                                {analyzer.planCount} {analyzer.planCount === 1 ? 'Plan' : 'Plans'}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-4">
                              <div className="text-center p-2 rounded bg-slate-50 dark:bg-slate-900">
                                <p className="text-lg font-bold">
                                  {analyzer.stats.total_analyses}
                                </p>
                                <p className="text-xs text-muted-foreground">Analyses</p>
                              </div>
                              <div className="text-center p-2 rounded bg-slate-50 dark:bg-slate-900">
                                <p className="text-lg font-bold">
                                  {analyzer.stats.successful_analyses}
                                </p>
                                <p className="text-xs text-muted-foreground">Success</p>
                              </div>
                              <div className="text-center p-2 rounded bg-slate-50 dark:bg-slate-900">
                                <div
                                  className={`text-lg font-bold px-2 py-1 rounded ${getSuccessRateBadgeColor(
                                    analyzer.stats.success_rate
                                  )}`}
                                >
                                  {analyzer.stats.success_rate}%
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Rate</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-subscriptions">
          <MySubscriptions />
        </TabsContent>
      </Tabs>
    </div>
  )
}
