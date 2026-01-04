'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown, Clock, DollarSign, Activity, Target } from 'lucide-react'
import { toast } from 'sonner'

interface Trade {
  id: string
  status: 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled'
  instrument_type: 'options' | 'futures'
  direction: 'call' | 'put' | 'long' | 'short'
  underlying_index_symbol: string
  polygon_option_ticker: string | null
  strike: number | null
  expiry: string | null
  option_type: 'call' | 'put' | null
  entry_contract_snapshot: {
    mid: number
    bid?: number
    ask?: number
    timestamp: string
  }
  current_contract: number
  contract_high_since: number
  contract_low_since: number
  targets: Array<{ price: number, percentage: number, hit?: boolean }>
  stoploss: { price: number, percentage: number } | null
  notes: string | null
  published_at: string
  last_quote_at: string
}

interface TradesListProps {
  analysisId: string
  onSelectTrade: (tradeId: string) => void
}

export function TradesList({ analysisId, onSelectTrade }: TradesListProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTrades()
    const interval = setInterval(fetchTrades, 30000)
    return () => clearInterval(interval)
  }, [analysisId])

  const fetchTrades = async () => {
    try {
      const response = await fetch(`/api/indices/analyses/${analysisId}/trades`)
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
      }
    } catch (error) {
      console.error('Error fetching trades:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculatePnL = (trade: Trade) => {
    const entryPrice = trade.entry_contract_snapshot.mid
    const currentPrice = trade.current_contract
    const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100

    const multiplier = trade.direction === 'call' || trade.direction === 'long' ? 1 : -1
    const adjustedPnL = pnlPercentage * multiplier

    return {
      percentage: adjustedPnL,
      isPositive: adjustedPnL > 0,
    }
  }

  const getStatusBadge = (status: Trade['status']) => {
    const variants: Record<Trade['status'], { variant: any, label: string }> = {
      draft: { variant: 'secondary', label: 'Draft' },
      active: { variant: 'default', label: 'Active' },
      tp_hit: { variant: 'default', label: 'Target Hit' },
      sl_hit: { variant: 'destructive', label: 'Stop Loss Hit' },
      closed: { variant: 'outline', label: 'Closed' },
      canceled: { variant: 'secondary', label: 'Canceled' },
    }
    const config = variants[status]
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            No trades added to this analysis yet.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {trades.map((trade) => {
        const pnl = calculatePnL(trade)
        const hitsTarget = trade.targets.filter(t => t.hit).length

        return (
          <Card key={trade.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">
                      {trade.instrument_type === 'options' ? (
                        <>
                          {trade.underlying_index_symbol} ${trade.strike} {trade.option_type?.toUpperCase()}
                        </>
                      ) : (
                        <>
                          {trade.underlying_index_symbol} {trade.direction.toUpperCase()}
                        </>
                      )}
                    </CardTitle>
                    {getStatusBadge(trade.status)}
                  </div>
                  {trade.polygon_option_ticker && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {trade.polygon_option_ticker}
                    </p>
                  )}
                  {trade.expiry && (
                    <p className="text-xs text-muted-foreground">
                      Expires: {new Date(trade.expiry).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className={`text-right ${pnl.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  <div className="text-2xl font-bold flex items-center gap-1">
                    {pnl.isPositive ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : (
                      <TrendingDown className="h-5 w-5" />
                    )}
                    {pnl.percentage > 0 ? '+' : ''}{pnl.percentage.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">P&L</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Entry
                  </div>
                  <div className="text-lg font-semibold">
                    ${trade.entry_contract_snapshot.mid.toFixed(4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Current
                  </div>
                  <div className="text-lg font-semibold">
                    ${trade.current_contract.toFixed(4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    High
                  </div>
                  <div className="text-lg font-semibold text-green-600">
                    ${trade.contract_high_since.toFixed(4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    Low
                  </div>
                  <div className="text-lg font-semibold text-red-600">
                    ${trade.contract_low_since.toFixed(4)}
                  </div>
                </div>
              </div>

              {trade.targets.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Targets ({hitsTarget}/{trade.targets.length} hit)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {trade.targets.map((target, index) => (
                      <Badge
                        key={index}
                        variant={target.hit ? 'default' : 'outline'}
                        className={target.hit ? 'bg-green-500' : ''}
                      >
                        TP{index + 1}: ${target.price.toFixed(2)} ({target.percentage}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {trade.stoploss && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Stop Loss</div>
                  <Badge variant="destructive">
                    SL: ${trade.stoploss.price.toFixed(2)} ({trade.stoploss.percentage}%)
                  </Badge>
                </div>
              )}

              {trade.notes && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Notes</div>
                  <p className="text-sm text-muted-foreground">{trade.notes}</p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Published: {new Date(trade.published_at).toLocaleString()}
                </div>
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Updated: {new Date(trade.last_quote_at).toLocaleString()}
                </div>
              </div>

              {trade.status === 'active' && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => onSelectTrade(trade.id)}
                >
                  View Live Monitoring
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
