'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { StockPrice } from '@/components/analysis/StockPrice'
import { TrendingUp, Building2, FileText, Clock, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

interface Analysis {
  id: string
  direction: 'Long' | 'Short' | 'Neutral'
  stop_loss: number
  chart_image_url: string | null
  created_at: string
  status?: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
  validated_at?: string | null
  is_following?: boolean
  is_own_post?: boolean
  profiles: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  symbols: {
    symbol: string
  }
  analysis_targets: Array<{
    price: number
    expected_time: string
  }>
  validation_events?: Array<{
    event_type: 'STOP_LOSS_HIT' | 'TARGET_HIT'
    target_number: number | null
    price_at_hit: number
    hit_at: string
  }>
}

interface CompanyProfile {
  name: string
  description: string
  market_cap?: number
  sector?: string
  industry?: string
  employees?: number
  homepage_url?: string
  logo_url?: string
}

interface NewsItem {
  id: string
  title: string
  publisher: string
  published_at: string
  article_url: string
  image_url?: string
  description?: string
}

export default function SymbolPage() {
  const params = useParams()
  const symbol = params.symbol as string
  const [latestAnalyses, setLatestAnalyses] = useState<Analysis[]>([])
  const [topAnalyses, setTopAnalyses] = useState<Analysis[]>([])
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSymbolData()
  }, [symbol])

  const fetchSymbolData = async () => {
    setIsLoading(true)
    try {
      const [analysesRes, profileRes, newsRes] = await Promise.all([
        fetch(`/api/symbols/${symbol}/analyses`),
        fetch(`/api/symbols/${symbol}/profile`),
        fetch(`/api/symbols/${symbol}/news`),
      ])

      if (analysesRes.ok) {
        const data = await analysesRes.json()
        setLatestAnalyses(data.latest || [])
        setTopAnalyses(data.top || [])
      }

      if (profileRes.ok) {
        const data = await profileRes.json()
        setCompanyProfile(data)
      }

      if (newsRes.ok) {
        const data = await newsRes.json()
        setNews(data.news || [])
      }
    } catch (error) {
      console.error('Error fetching symbol data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatMarketCap = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    return `$${value.toLocaleString()}`
  }

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">{symbol}</h1>
          {companyProfile && (
            <p className="text-lg text-muted-foreground mt-1">{companyProfile.name}</p>
          )}
        </div>
      </div>

      <StockPrice symbol={symbol} size="lg" />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Analyses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="latest">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="latest">Latest</TabsTrigger>
                    <TabsTrigger value="top">Top Rated</TabsTrigger>
                  </TabsList>
                  <TabsContent value="latest" className="space-y-4 mt-4">
                    {latestAnalyses.length > 0 ? (
                      latestAnalyses.map((analysis) => (
                        <AnalysisCard
                          key={analysis.id}
                          analysis={analysis}
                          onFollowChange={fetchSymbolData}
                        />
                      ))
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No analyses yet for {symbol}</p>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="top" className="space-y-4 mt-4">
                    {topAnalyses.length > 0 ? (
                      topAnalyses.map((analysis) => (
                        <AnalysisCard
                          key={analysis.id}
                          analysis={analysis}
                          onFollowChange={fetchSymbolData}
                        />
                      ))
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No rated analyses yet for {symbol}</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {companyProfile && (
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {companyProfile.logo_url && (
                    <div className="flex justify-center p-4 bg-muted rounded-lg">
                      <img
                        src={companyProfile.logo_url}
                        alt={companyProfile.name}
                        className="h-16 w-auto object-contain"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    {companyProfile.sector && (
                      <div>
                        <p className="text-sm text-muted-foreground">Sector</p>
                        <Badge variant="secondary" className="mt-1">
                          {companyProfile.sector}
                        </Badge>
                      </div>
                    )}

                    {companyProfile.industry && (
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{companyProfile.industry}</p>
                      </div>
                    )}

                    {companyProfile.market_cap && (
                      <div>
                        <p className="text-sm text-muted-foreground">Market Cap</p>
                        <p className="font-medium text-lg">
                          {formatMarketCap(companyProfile.market_cap)}
                        </p>
                      </div>
                    )}

                    {companyProfile.employees && (
                      <div>
                        <p className="text-sm text-muted-foreground">Employees</p>
                        <p className="font-medium">
                          {companyProfile.employees.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {companyProfile.description && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-muted-foreground mb-2">About</p>
                      <p className="text-sm leading-relaxed">
                        {companyProfile.description}
                      </p>
                    </div>
                  )}

                  {companyProfile.homepage_url && (
                    <Link
                      href={companyProfile.homepage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 pt-2"
                    >
                      Visit Website
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Latest News
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {news.length > 0 ? (
                  news.map((item) => (
                    <Link
                      key={item.id}
                      href={item.article_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <div className="space-y-2 p-3 rounded-lg hover:bg-muted transition-colors">
                        {item.image_url && (
                          <div className="rounded-md overflow-hidden">
                            <img
                              src={item.image_url}
                              alt={item.title}
                              className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                        )}
                        <div>
                          <h4 className="font-medium text-sm leading-snug group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </h4>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{item.publisher}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(item.published_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No news available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
