'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, TrendingDown, Clock, DollarSign, Activity, Target, CircleDot, Info, Edit, Trash2, Send, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getMarketStatus, formatMarketTime } from '@/lib/market-hours'
import { ManualHighUpdateDialog } from './ManualHighUpdateDialog'
import { SendTradeAdDialog } from './SendTradeAdDialog'
import { QuickManualTradeDialog } from './QuickManualTradeDialog'
import { EditHighWatermarkDialog } from './EditHighWatermarkDialog'
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
    price?: number
    mid?: number
    bid?: number
    ask?: number
    timestamp?: string
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
  analysisId?: string
  onSelectTrade: (tradeId: string) => void
  standalone?: boolean
  refreshKey?: number
}

export function TradesList({ analysisId, onSelectTrade, standalone = false, refreshKey }: TradesListProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [marketStatus, setMarketStatus] = useState(getMarketStatus())
  const [manualUpdateDialogOpen, setManualUpdateDialogOpen] = useState(false)
  const [selectedTradeForUpdate, setSelectedTradeForUpdate] = useState<Trade | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sendAdDialogOpen, setSendAdDialogOpen] = useState(false)
  const [tradeToSendAd, setTradeToSendAd] = useState<Trade | null>(null)
  const [quickManualTradeOpen, setQuickManualTradeOpen] = useState(false)
  const [editHighDialogOpen, setEditHighDialogOpen] = useState(false)
  const [tradeToEditHigh, setTradeToEditHigh] = useState<Trade | null>(null)

  useEffect(() => {
    fetchTrades()
    const interval = setInterval(fetchTrades, 30000)
    return () => clearInterval(interval)
  }, [analysisId, standalone, refreshKey])

  useEffect(() => {
    const updateMarketStatus = () => {
      setMarketStatus(getMarketStatus())
    }
    updateMarketStatus()
    const interval = setInterval(updateMarketStatus, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const response = await fetch('/api/admin/check-auth')
      if (response.ok) {
        const data = await response.json()
        setIsAdmin(data.isAdmin)
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
    }
  }

  const fetchTrades = async () => {
    try {
      const apiUrl = standalone
        ? '/api/indices/trades'
        : `/api/indices/analyses/${analysisId}/trades`

      const response = await fetch(apiUrl)
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
    const entryPrice = trade.entry_contract_snapshot.price || trade.entry_contract_snapshot.mid || 0

    // For CALL/LONG: best profit is at highest price
    // For PUT/SHORT: best profit is at lowest price
    const bestPrice = (trade.direction === 'call' || trade.direction === 'long')
      ? trade.contract_high_since
      : trade.contract_low_since

    const pnlPercentage = ((bestPrice - entryPrice) / entryPrice) * 100

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Active Trades</h3>
          <p className="text-sm text-muted-foreground">
            {trades.length} {trades.length === 1 ? 'trade' : 'trades'} total
          </p>
        </div>
        <Button
          onClick={() => setQuickManualTradeOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Quick Manual Trade
        </Button>
      </div>

      {!marketStatus.isOpen && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="border-yellow-500 text-yellow-700"
              >
                <CircleDot className="h-3 w-3 mr-1" />
                {marketStatus.message}
              </Badge>
              <span className="text-sm">
                Options prices update during Regular Trading Hours (9:30 AM - 4:00 PM ET).
                Current prices reflect the last available quote from the most recent trading session.
                Current time: {formatMarketTime()}
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
                    {pnl.percentage > 0 ? '+' : ''}{formatNumber(pnl.percentage, 2)}%
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
                    {formatCurrencySimple(trade.entry_contract_snapshot.price || trade.entry_contract_snapshot.mid || 0, 4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Current
                  </div>
                  <div className="text-lg font-semibold">
                    {formatCurrencySimple(trade.current_contract, 4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    High
                  </div>
                  <div className="text-lg font-semibold text-green-600">
                    {formatCurrencySimple(trade.contract_high_since, 4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    Low
                  </div>
                  <div className="text-lg font-semibold text-red-600">
                    {formatCurrencySimple(trade.contract_low_since, 4)}
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
                        TP{index + 1}: {formatCurrencySimple(target.price, 2)} ({target.percentage}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {trade.stoploss && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Stop Loss</div>
                  <Badge variant="destructive">
                    SL: {formatCurrencySimple(trade.stoploss.price, 2)} ({trade.stoploss.percentage}%)
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

              <div className="flex gap-2">
                {trade.status === 'active' && (
                  <>
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => onSelectTrade(trade.id)}
                    >
                      View Live Monitoring
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        setSelectedTradeForUpdate(trade)
                        setManualUpdateDialogOpen(true)
                      }}
                      title="Manual Price Update"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setTradeToEditHigh(trade)
                    setEditHighDialogOpen(true)
                  }}
                  title="Edit High Watermark"
                >
                  <TrendingUp className="h-4 w-4" />
                </Button>
                {pnl.isPositive && pnl.percentage > 0 && (
                  <Button
                    variant="default"
                    size="icon"
                    onClick={() => {
                      setTradeToSendAd(trade)
                      setSendAdDialogOpen(true)
                    }}
                    title="Send as Advertisement"
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      setTradeToDelete(trade)
                      setDeleteDialogOpen(true)
                    }}
                    title="Delete Trade (Admin)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {selectedTradeForUpdate && (
        <ManualHighUpdateDialog
          open={manualUpdateDialogOpen}
          onOpenChange={setManualUpdateDialogOpen}
          trade={selectedTradeForUpdate}
          onSuccess={() => {
            toast.success('Prices updated successfully')
            fetchTrades()
          }}
        />
      )}

      {tradeToEditHigh && (
        <EditHighWatermarkDialog
          open={editHighDialogOpen}
          onOpenChange={setEditHighDialogOpen}
          trade={tradeToEditHigh}
          onSuccess={() => {
            fetchTrades()
          }}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trade</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trade? This action cannot be undone.
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
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
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

      {tradeToSendAd && (
        <SendTradeAdDialog
          tradeId={tradeToSendAd.id}
          open={sendAdDialogOpen}
          onOpenChange={setSendAdDialogOpen}
        />
      )}

      <QuickManualTradeDialog
        open={quickManualTradeOpen}
        onOpenChange={setQuickManualTradeOpen}
        onSuccess={() => {
          toast.success('Manual trade created successfully')
          fetchTrades()
        }}
      />
    </div>
  )
}
