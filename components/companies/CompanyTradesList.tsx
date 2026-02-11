'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Calendar, DollarSign, Target, Edit, X } from 'lucide-react'
import { formatPnL, formatPercentage, calculatePnLPercentage, getOutcomeColor } from '@/services/trades/canonical-pnl.service'

interface Trade {
  id: string
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

interface CompanyTradesListProps {
  trades: Trade[]
  isOwner: boolean
  onTradeUpdated: () => void
}

export function CompanyTradesList({ trades, isOwner, onTradeUpdated }: CompanyTradesListProps) {
  async function handleCloseTrade(tradeId: string) {
    if (!confirm('Are you sure you want to close this trade?')) return

    try {
      const response = await fetch(`/api/companies/trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'CLOSED',
          close_reason: 'MANUAL'
        })
      })

      if (response.ok) {
        onTradeUpdated()
      }
    } catch (error) {
      console.error('Error closing trade:', error)
    }
  }

  function getOutcomeBadge(trade: Trade) {
    if (trade.status === 'ACTIVE') {
      return <Badge>Active</Badge>
    }

    if (trade.status === 'EXPIRED') {
      return trade.is_win ? (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          Expired (Win)
        </Badge>
      ) : (
        <Badge variant="destructive">Expired (Loss)</Badge>
      )
    }

    return trade.is_win ? (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        Win
      </Badge>
    ) : (
      <Badge variant="destructive">Loss</Badge>
    )
  }

  return (
    <div className="space-y-3">
      {trades.map((trade) => {
        const pnlPercentage = calculatePnLPercentage(trade.pnl_value, trade.entry_cost_total)
        const pnlColor = trade.pnl_value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'

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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCloseTrade(trade.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Entry Cost</div>
                <div className="font-semibold">${trade.entry_cost_total.toFixed(2)}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Max Price</div>
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

            {trade.notes && (
              <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                {trade.notes}
              </div>
            )}

            {trade.status === 'ACTIVE' && (
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                <strong>Win Threshold:</strong> Need ${(100 / (trade.contracts_qty * trade.contract_multiplier) + trade.entry_price).toFixed(2)} contract price to reach $100 profit
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
