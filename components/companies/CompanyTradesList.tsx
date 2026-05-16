'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Calendar, DollarSign, X, Activity, RefreshCw } from 'lucide-react'
import { formatPnL, formatPercentage, calculatePnLPercentage } from '@/services/trades/canonical-pnl.service'
import { cn } from '@/lib/utils'

interface Trade {
  id: string
  symbol: string
  direction: string
  strike: number
  expiry_date: string
  entry_price: number
  contracts_qty: number
  contract_multiplier: number
  status: string
  max_price_since_entry: number
  pnl_value: number
  is_win: boolean
  entry_cost_total: number
  max_profit_value: number
  created_at: string
  notes?: string
  close_reason?: string
  avg_adjustments_count?: number
}

interface LivePrice {
  bid?: number
  ask?: number
  mid?: number
  last?: number
}

interface CompanyTradesListProps {
  trades: Trade[]
  isOwner: boolean
  onTradeUpdated: () => void
}

// Build Polygon option ticker from trade fields
function buildOptionTicker(symbol: string, expiry: string, direction: string, strike: number): string {
  const d = new Date(expiry + 'T12:00:00Z')
  const yy = String(d.getUTCFullYear()).slice(2)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const cp = direction === 'CALL' ? 'C' : 'P'
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0')
  return `O:${symbol}${yy}${mm}${dd}${cp}${strikeStr}`
}

export function CompanyTradesList({ trades, isOwner, onTradeUpdated }: CompanyTradesListProps) {
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({})
  const [loadingPrices, setLoadingPrices] = useState<Record<string, boolean>>({})
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeTrades = trades.filter(t => t.status === 'ACTIVE')

  const fetchLivePrices = useCallback(async () => {
    if (activeTrades.length === 0) return
    for (const trade of activeTrades) {
      const ticker = buildOptionTicker(trade.symbol, trade.expiry_date, trade.direction, trade.strike)
      setLoadingPrices(prev => ({ ...prev, [trade.id]: true }))
      try {
        const res = await fetch(
          `/api/companies/contract-quote?ticker=${encodeURIComponent(ticker)}&symbol=${trade.symbol}`
        )
        if (res.ok) {
          const data = await res.json()
          if (data.quote) {
            setLivePrices(prev => ({ ...prev, [trade.id]: data.quote }))
          }
        }
      } catch {
        // silently ignore — show stale data
      } finally {
        setLoadingPrices(prev => ({ ...prev, [trade.id]: false }))
      }
    }
  }, [activeTrades.length])

  useEffect(() => {
    if (activeTrades.length === 0) return
    fetchLivePrices()
    intervalRef.current = setInterval(fetchLivePrices, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchLivePrices])

  async function handleCloseTrade(tradeId: string) {
    if (!confirm('Are you sure you want to close this trade?')) return
    try {
      const res = await fetch(`/api/companies/trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', close_reason: 'MANUAL' }),
      })
      if (res.ok) onTradeUpdated()
    } catch {
      console.error('Error closing trade')
    }
  }

  function getOutcomeBadge(trade: Trade) {
    if (trade.status === 'ACTIVE') return <Badge>Active</Badge>
    if (trade.status === 'EXPIRED') {
      return trade.is_win
        ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Expired (Win)</Badge>
        : <Badge variant="destructive">Expired (Loss)</Badge>
    }
    return trade.is_win
      ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Win</Badge>
      : <Badge variant="destructive">Loss</Badge>
  }

  return (
    <div className="space-y-3">
      {trades.map(trade => {
        const pnlPercentage = calculatePnLPercentage(trade.pnl_value, trade.entry_cost_total)
        const pnlColor = trade.pnl_value >= 0
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
        const live = livePrices[trade.id]
        const isLoading = loadingPrices[trade.id]
        const livePrice = live?.mid ?? live?.last

        return (
          <Card key={trade.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {trade.direction === 'CALL' ? (
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-lg">
                    ${trade.strike} {trade.direction}
                    {trade.avg_adjustments_count > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Averaged {trade.avg_adjustments_count}x)
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {trade.contracts_qty} contract{trade.contracts_qty > 1 ? 's' : ''} @ ${trade.entry_price.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {getOutcomeBadge(trade)}
                {isOwner && trade.status === 'ACTIVE' && (
                  <Button variant="ghost" size="sm" onClick={() => handleCloseTrade(trade.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Live price bar for active trades */}
            {trade.status === 'ACTIVE' && (
              <div className={cn(
                'mb-3 p-2.5 rounded-lg border flex items-center justify-between',
                livePrice
                  ? livePrice > trade.entry_price
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                  : 'bg-muted/40 border-border'
              )}>
                <div className="flex items-center gap-2">
                  {isLoading
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    : <Activity className={cn('h-3.5 w-3.5', livePrice ? 'text-green-500' : 'text-muted-foreground')} />
                  }
                  <span className="text-xs font-medium">
                    {livePrice ? 'Live Price' : 'Fetching live price...'}
                  </span>
                </div>
                {livePrice && (
                  <div className="flex items-center gap-3 text-xs">
                    {live?.bid && <span className="text-muted-foreground">Bid: ${live.bid.toFixed(2)}</span>}
                    <span className={cn(
                      'font-bold text-sm',
                      livePrice > trade.entry_price
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}>
                      ${livePrice.toFixed(2)}
                      {' '}
                      <span className="text-xs">
                        ({livePrice > trade.entry_price ? '+' : ''}
                        {(((livePrice - trade.entry_price) / trade.entry_price) * 100).toFixed(1)}%)
                      </span>
                    </span>
                    {live?.ask && <span className="text-muted-foreground">Ask: ${live.ask.toFixed(2)}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Entry Cost</div>
                <div className="font-semibold">${trade.entry_cost_total.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Peak Price</div>
                <div className="font-semibold">${trade.max_price_since_entry.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Max Profit</div>
                <div className="font-semibold">${trade.max_profit_value.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">P/L</div>
                <div className={`font-bold ${pnlColor}`}>
                  {formatPnL(trade.pnl_value)} ({formatPercentage(pnlPercentage)})
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Exp: {new Date(trade.expiry_date).toLocaleDateString()}</span>
              </div>
              {trade.close_reason && (
                <div>Closed: {trade.close_reason.replace(/_/g, ' ')}</div>
              )}
            </div>

            {trade.status === 'ACTIVE' && (
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                <strong>Win Threshold:</strong> Need ${(100 / (trade.contracts_qty * trade.contract_multiplier) + trade.entry_price).toFixed(2)} contract price to reach $100 profit
              </div>
            )}

            {trade.notes && (
              <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                {trade.notes}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
