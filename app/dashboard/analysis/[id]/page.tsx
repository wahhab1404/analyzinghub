'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnalysisDetailView } from '@/components/analysis/AnalysisDetailView'
import { CompanyContractTradesTab } from '@/components/companies/CompanyContractTradesTab'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart3, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AnalysisDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          setUserId(user.id)
        }

        const response = await fetch(`/api/analyses/${params.id}`)

        if (response.status === 401) {
          router.push('/login')
          return
        }

        if (!response.ok) {
          setError('Analysis not found')
          setLoading(false)
          return
        }

        const data = await response.json()
        setAnalysis(data.analysis)
      } catch (err) {
        setError('Failed to load analysis')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [params.id, router])

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Analysis Not Found</h1>
          <p className="text-muted-foreground">{error || 'The analysis you are looking for does not exist.'}</p>
        </div>
      </div>
    )
  }

  const isCompanyAnalysis = analysis.post_type === 'analysis' && !analysis.is_index_analysis
  const symbol = analysis.symbols?.symbol || ''
  const isOwner = analysis.is_own_post || false

  if (!isCompanyAnalysis) {
    return <AnalysisDetailView analysis={analysis} />
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="trades" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Options Trades
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis">
          <AnalysisDetailView analysis={analysis} />
        </TabsContent>

        <TabsContent value="trades">
          <CompanyContractTradesTab
            analysisId={params.id}
            symbol={symbol}
            userId={userId}
            isOwner={isOwner}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
