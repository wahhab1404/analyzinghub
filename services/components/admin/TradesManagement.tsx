'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { formatNumber, formatCurrencySimple } from '@/lib/format-utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'

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
  published_at: string
  analysis_id: string | null
  author: {
    id: string
    full_name: string
  }
  analysis: {
    id: string
    title: string
  } | null
  max_profit: number
  final_profit: number
  qty: number
  original_entry_price: number
}

export default function TradesManagement() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchTrades()
  }, [])

  const fetchTrades = async () => {
    try {
      const response = await fetch('/api/indices/trades?all=true')
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
      }
    } catch (error) {
      console.error('Error fetching trades:', error)
      toast.error('Failed to load trades')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTrade = async () => {
    if (!tradeToDelete) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/indices/trades/${tradeToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json().catch(() => null)

      if (response.ok) {
        toast.success('Trade deleted successfully')
        setDeleteDialogOpen(false)
        setTradeToDelete(null)
        await fetchTrades()
      } else {
        console.error('Delete failed:', {
          status: response.status,
          statusText: response.statusText,
          data
        })
        toast.error(data?.error || data?.message || 'Failed to delete trade')
      }
    } catch (error) {
      console.error('Error deleting trade:', error)
      toast.error('Network error: Failed to delete trade')
    } finally {
      setDeleting(false)
    }
  }

  const calculatePnL = (trade: Trade) => {
    const entryPrice = trade.original_entry_price || trade.entry_contract_snapshot.mid
    const profitPercentage = trade.status === 'active' ? (trade.max_profit || 0) : (trade.final_profit || 0)

    const dollarProfit = (profitPercentage / 100) * entryPrice * (trade.qty || 1) * 100

    return {
      percentage: profitPercentage,
      isPositive: profitPercentage > 0,
      dollarAmount: dollarProfit,
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

  const filteredTrades = trades.filter(trade => {
    const searchLower = searchTerm.toLowerCase()
    return (
      trade.underlying_index_symbol.toLowerCase().includes(searchLower) ||
      trade.polygon_option_ticker?.toLowerCase().includes(searchLower) ||
      trade.author.full_name.toLowerCase().includes(searchLower) ||
      (trade.analysis?.title?.toLowerCase().includes(searchLower) ?? false)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">All Trades</h3>
          <p className="text-sm text-muted-foreground">
            Manage all trades across the platform ({filteredTrades.length} trades)
          </p>
        </div>
        <Button variant="outline" onClick={fetchTrades}>
          Refresh
        </Button>
      </div>

      <Input
        placeholder="Search by symbol, ticker, author, or analysis..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-md"
      />

      {filteredTrades.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              {searchTerm ? 'No trades found matching your search.' : 'No trades found.'}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTrades.map((trade) => {
            const pnl = calculatePnL(trade)

            return (
              <Card key={trade.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>By {trade.author.full_name}</span>
                        <span>•</span>
                        <span>{trade.analysis?.title || 'Standalone Trade'}</span>
                      </div>
                    </div>
                    <div className={`text-right ${pnl.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      <div className="text-xl font-bold flex items-center gap-1">
                        {pnl.isPositive ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {pnl.percentage > 0 ? '+' : ''}{formatNumber(pnl.percentage, 2)}%
                      </div>
                      {pnl.dollarAmount !== 0 && (
                        <div className="text-sm font-medium">
                          {pnl.dollarAmount > 0 ? '+' : ''}{formatCurrencySimple(pnl.dollarAmount, 0)}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {trade.status === 'active' ? 'Max P&L' : 'Final P&L'}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-sm flex-wrap">
                      <div>
                        <span className="text-muted-foreground">Entry: </span>
                        <span className="font-medium">{formatCurrencySimple(trade.original_entry_price || trade.entry_contract_snapshot.mid, 4)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Current: </span>
                        <span className="font-medium">{formatCurrencySimple(trade.current_contract, 4)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">High: </span>
                        <span className="font-medium text-green-600">{formatCurrencySimple(trade.contract_high_since, 4)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Qty: </span>
                        <span className="font-medium">{trade.qty || 1}</span>
                      </div>
                      {trade.expiry && (
                        <div>
                          <span className="text-muted-foreground">Expiry: </span>
                          <span className="font-medium">{new Date(trade.expiry).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/dashboard/indices`, '_blank')}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setTradeToDelete(trade)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trade</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trade? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {tradeToDelete && (
            <div className="mt-2 p-3 bg-muted rounded-md">
              <div className="font-medium">
                {tradeToDelete.instrument_type === 'options' ? (
                  <>
                    {tradeToDelete.underlying_index_symbol} ${tradeToDelete.strike} {tradeToDelete.option_type?.toUpperCase()}
                  </>
                ) : (
                  <>
                    {tradeToDelete.underlying_index_symbol} {tradeToDelete.direction.toUpperCase()}
                  </>
                )}
              </div>
              {tradeToDelete.polygon_option_ticker && (
                <div className="text-xs text-muted-foreground mt-1">
                  {tradeToDelete.polygon_option_ticker}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Analysis: {tradeToDelete.analysis?.title || 'Standalone Trade'}
              </div>
              <div className="text-xs text-muted-foreground">
                Author: {tradeToDelete.author.full_name}
              </div>
              {tradeToDelete.expiry && (
                <div className="text-xs text-muted-foreground">
                  Expiry: {new Date(tradeToDelete.expiry).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTrade}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Trade'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
