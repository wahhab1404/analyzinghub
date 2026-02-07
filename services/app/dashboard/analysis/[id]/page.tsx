'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnalysisDetailView } from '@/components/analysis/AnalysisDetailView'
import { Skeleton } from '@/components/ui/skeleton'

export default function AnalysisDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAnalysis() {
      try {
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

    fetchAnalysis()
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

  return <AnalysisDetailView analysis={analysis} />
}
