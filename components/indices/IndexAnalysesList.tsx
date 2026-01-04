'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface IndexAnalysis {
  id: string
  index_symbol: string
  title: string
  body: string
  status: 'draft' | 'published' | 'archived'
  visibility: string
  created_at: string
  published_at: string
  trades_count: number
  active_trades_count: number
}

interface IndexAnalysesListProps {
  status: 'active' | 'closed'
  onSelectContract: (contractId: string) => void
}

export function IndexAnalysesList({ status, onSelectContract }: IndexAnalysesListProps) {
  const [analyses, setAnalyses] = useState<IndexAnalysis[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalyses()
  }, [status])

  const fetchAnalyses = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/indices/analyses?status=published`)
      if (response.ok) {
        const data = await response.json()
        setAnalyses(data.analyses || [])
      }
    } catch (error) {
      toast.error('Failed to load analyses')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">
              No indices analyses available yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Subscribe to analyzers to see their indices analyses here.
            </p>
            <Button
              variant="default"
              onClick={() => window.location.href = '/dashboard/subscriptions'}
            >
              Browse Analyzers
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {analyses.map((analysis) => (
        <Card key={analysis.id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{analysis.index_symbol}</CardTitle>
                <p className="text-sm text-muted-foreground">{analysis.title}</p>
              </div>
              <Badge variant={analysis.status === 'published' ? 'default' : 'secondary'}>
                {analysis.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Total Trades:
                </span>
                <span className="font-medium">{analysis.trades_count}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  Active Trades:
                </span>
                <span className="font-medium">{analysis.active_trades_count}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Published:
                </span>
                <span className="text-xs">
                  {analysis.published_at ? new Date(analysis.published_at).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-sm text-muted-foreground line-clamp-3">{analysis.body}</p>
            </div>

            {status === 'active' && analysis.active_trades_count > 0 && (
              <Button
                className="w-full"
                variant="outline"
                onClick={() => onSelectContract(analysis.id)}
              >
                View Analysis Details
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
