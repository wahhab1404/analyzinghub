'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TradeCard } from './TradeCard'
import { CreateTradeDialog } from './CreateTradeDialog'
import { Plus, TrendingUp, Loader2 } from 'lucide-react'
import type { TradeFull } from '@/lib/types/trades'

interface RelatedTradesProps {
  analysisId: string
  isOwner?: boolean
  symbol?: string
}

export function RelatedTrades({ analysisId, isOwner = false, symbol }: RelatedTradesProps) {
  const [trades, setTrades]       = useState<TradeFull[]>([])
  const [loading, setLoading]     = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch(`/api/trades?linked=linked&sort_by=newest&limit=20`)
      const json = await res.json()
      // Filter by analysis_id client-side (or server-side would be ideal)
      const filtered = (json.trades ?? []).filter((t: TradeFull) => t.analysis_id === analysisId)
      setTrades(filtered)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [analysisId])

  if (loading) {
    return (
      <Card className="border-gray-200 dark:border-gray-700">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <span>الصفقات المرتبطة</span>
            <span className="text-gray-400 font-normal text-sm">/ Related Trades</span>
            {trades.length > 0 && (
              <span className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full">
                {trades.length}
              </span>
            )}
          </CardTitle>

          {isOwner && (
            <Button
              size="sm" variant="outline"
              onClick={() => setCreateOpen(true)}
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              صفقة / Add Trade
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {trades.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <div className="text-2xl mb-2">📊</div>
            <div>لا توجد صفقات مرتبطة / No related trades yet</div>
            {isOwner && (
              <Button
                size="sm" variant="outline"
                onClick={() => setCreateOpen(true)}
                className="mt-3 h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                أضف صفقة / Add Trade
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {trades.map(trade => (
              <TradeCard
                key={trade.id}
                trade={trade}
                showAuthor={false}
                showActions={isOwner}
                isOwner={isOwner}
              />
            ))}
          </div>
        )}
      </CardContent>

      <CreateTradeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultAnalysisId={analysisId}
        defaultSymbol={symbol}
        onCreated={() => { setCreateOpen(false); load() }}
      />
    </Card>
  )
}
