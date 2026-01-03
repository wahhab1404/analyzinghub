'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface IndexAnalysis {
  id: string
  underlying_symbol: string
  contract_id: string
  status: 'open' | 'closed'
  analysis_type: string
  thesis: string
  entry_range_min: number
  entry_range_max: number
  target_1: number
  target_2: number | null
  stop_loss: number
  created_at: string
  trades_count: number
  total_pnl: number
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
      const response = await fetch(`/api/indices/analyses?status=${status === 'active' ? 'open' : 'closed'}`)
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
          <div className="text-center text-muted-foreground">
            {status === 'active' ? 'No active analyses yet. Create one to get started!' : 'No closed analyses yet.'}
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
                <CardTitle className="text-lg">{analysis.underlying_symbol}</CardTitle>
                <p className="text-sm text-muted-foreground">{analysis.contract_id}</p>
              </div>
              <Badge variant={analysis.status === 'open' ? 'default' : 'secondary'}>
                {analysis.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Entry Range:</span>
                <span className="font-medium">
                  ${analysis.entry_range_min.toFixed(2)} - ${analysis.entry_range_max.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Targets:</span>
                <span className="font-medium">
                  ${analysis.target_1.toFixed(2)}
                  {analysis.target_2 && ` / $${analysis.target_2.toFixed(2)}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stop Loss:</span>
                <span className="font-medium text-red-500">
                  ${analysis.stop_loss.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Type:
                </span>
                <Badge variant="outline">{analysis.analysis_type.replace('_', ' ')}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Trades:
                </span>
                <span className="font-medium">{analysis.trades_count}</span>
              </div>
              {analysis.total_pnl !== 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    P&L:
                  </span>
                  <span className={`font-medium ${analysis.total_pnl > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {analysis.total_pnl > 0 ? '+' : ''}${analysis.total_pnl.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <p className="text-sm text-muted-foreground line-clamp-2">{analysis.thesis}</p>
            </div>

            {status === 'active' && (
              <Button
                className="w-full"
                variant="outline"
                onClick={() => onSelectContract(analysis.contract_id)}
              >
                Monitor Live Prices
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
