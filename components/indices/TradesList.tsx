'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Loader2, TrendingUp, TrendingDown, Clock, DollarSign, Activity,
  Target, CircleDot, Info, Edit, Trash2, Send, Plus, RefreshCw,
  AlertTriangle, Eye, BarChart2, ChevronDown, ChevronUp
} from 'lucide-react'
import { toast } from 'sonner'
import { getMarketStatus, formatMarketTime } from '@/lib/market-hours'
import { ManualHighUpdateDialog } from './ManualHighUpdateDialog'
import { SendTradeAdDialog } from './SendTradeAdDialog'
import { QuickManualTradeDialog } from './QuickManualTradeDialog'
import { EditHighWatermarkDialog } from './EditHighWatermarkDialog'
import { formatNumber, formatCurrency, formatCurrencySimple } from '@/lib/format-utils'
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
import { cn } from '@/lib/utils'

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
  qty?: number
  contract_multiplier?: number
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
  targets: Array<{ price: number; percentage: number; hit?: boolean }>
  stoploss: { price: number; percentage: number } | null
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

type StatusConfig = {
  label: string
  className: string
}

const STATUS_CONFIG: Record<Trade['status'], StatusConfig> = {
  draft:    { label: 'Draft',       className: 'badge-draft' },
  active:   { label: 'Active',      className: 'badge-active' },
  tp_hit:   { label: 'Target Hit',  className: 'badge-win' },
  sl_hit:   { label: 'Stop Loss',   className: 'badge-loss' },
  closed:   { label: 'Closed',      className: 'badge-closed' },
  canceled: { label: 'Canceled',    className: 'badge-canceled' },
}

function StatusBadge({ status }: { status: Trade['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return <span className={cfg.className}>{cfg.label}</span>
}

function TradeCard({
  trade,
  isAdmin,
  onSelectTrade,
  onManualUpdate,
  onEditHigh,
  onSendAd,
  onDeleteRequest,
}: {
  trade: Trade
  isAdmin: boolean
  onSelectTrade: (id: string) => void
  onManualUpdate: (t: Trade) => void
  onEditHigh: (t: Trade) => void
  onSendAd: (t: Trade) => void
  onDeleteRequest: (t: Trade) => void
}) {
  const [expanded, setExpanded] = useState(false)

  // Entry price — use nullish coalescing (fixes the || bug)
  const entryPrice = trade.entry_contract_snapshot.price ?? trade.entry_contract_snapshot.mid ?? 0

  const qty = trade.qty ?? 1
  const multiplier = trade.contract_multiplier ?? 100
  const isCall = trade.direction === 'call' || trade.direction === 'long'

  // P&L calculation uses best price for direction
  const bestPrice = isCall ? trade.contract_high_since : trade.contract_low_since
  const pnlPct = entryPrice > 0 ? ((bestPrice - entryPrice) / entryPrice) * 100 * (isCall ? 1 : -1) : 0
  const pnlDollars = (bestPrice - entryPrice) * qty * multiplier * (isCall ? 1 : -1)
  const isPositive = pnlPct > 0

  // Current move from entry
  const currentPct = entryPrice > 0 ? ((trade.current_contract - entryPrice) / entryPrice) * 100 * (isCall ? 1 : -1) : 0

  const targetsHit = trade.targets.filter(t => t.hit).length
  const hasNotes = Boolean(trade.notes)

  const statusClass = {
    active: 'active',
    tp_hit: 'win',
    sl_hit: 'loss',
    closed: '',
    draft: '',
    canceled: '',
  }[trade.status] || ''

  return (
    <div className={cn('trade-card', statusClass)}>
      {/* ── Card header ───────────────────────────────── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Left: ticker + contract info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="ticker-chip text-sm font-bold">
                {trade.underlying_index_symbol}
              </span>
              {trade.instrument_type === 'options' && trade.strike != null && (
                <span className="ticker-chip">
                  ${trade.strike} {trade.option_type?.toUpperCase()}
                </span>
              )}
              {trade.instrument_type !== 'options' && (
                <span className="ticker-chip">
                  {trade.direction.toUpperCase()}
                </span>
              )}
              <StatusBadge status={trade.status} />
            </div>

            {trade.polygon_option_ticker && (
              <p className="contract-info mt-1 font-mono">{trade.polygon_option_ticker}</p>
            )}
            {trade.expiry && (
              <p className="contract-info mt-0.5">
                Expires {new Date(trade.expiry).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </p>
            )}
          </div>

          {/* Right: P&L widget */}
          <div className="text-right flex-shrink-0">
            <div className={cn('flex items-center justify-end gap-1.5', isPositive ? 'profit-positive' : 'profit-negative')}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="text-2xl font-bold trade-number leading-none">
                {pnlDollars >= 0 ? '+' : ''}{formatCurrency(pnlDollars, 2)}
              </span>
            </div>
            <p className={cn('text-sm font-semibold trade-number mt-0.5', isPositive ? 'profit-positive' : 'profit-negative')}>
              {pnlPct > 0 ? '+' : ''}{formatNumber(pnlPct, 2)}%
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Best P&L</p>
          </div>
        </div>
      </div>

      {/* ── Price metrics row ─────────────────────────── */}
      <div className="border-t border-[hsl(var(--border)/0.6)] px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          <div>
            <p className="stat-label mb-1">Entry</p>
            <p className="text-sm font-semibold trade-number">{formatNumber(entryPrice, 2)}</p>
          </div>
          <div>
            <p className="stat-label mb-1">Current</p>
            <p className={cn('text-sm font-semibold trade-number', currentPct > 0 ? 'profit-positive' : currentPct < 0 ? 'profit-negative' : '')}>
              {formatNumber(trade.current_contract, 2)}
            </p>
          </div>
          <div>
            <p className="stat-label mb-1 flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />High
            </p>
            <p className="text-sm font-semibold trade-number profit-positive">
              {formatNumber(trade.contract_high_since, 2)}
            </p>
          </div>
          <div>
            <p className="stat-label mb-1 flex items-center gap-1">
              <TrendingDown className="h-2.5 w-2.5 text-red-500" />Low
            </p>
            <p className="text-sm font-semibold trade-number profit-negative">
              {formatNumber(trade.contract_low_since, 2)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Targets + Stop loss ───────────────────────── */}
      {(trade.targets.length > 0 || trade.stoploss) && (
        <div className="border-t border-[hsl(var(--border)/0.6)] px-4 py-3 space-y-2">
          {trade.targets.length > 0 && (
            <div>
              <p className="stat-label mb-2 flex items-center gap-1">
                <Target className="h-2.5 w-2.5" />
                Targets — {targetsHit}/{trade.targets.length} hit
              </p>
              <div className="flex flex-wrap gap-1.5">
                {trade.targets.map((tgt, i) => (
                  <span
                    key={i}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-sm font-semibold trade-number border',
                      tgt.hit
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                        : 'bg-[hsl(var(--muted))] text-muted-foreground border-[hsl(var(--border))]'
                    )}
                  >
                    TP{i + 1}: {formatCurrencySimple(tgt.price, 2)}
                    {tgt.percentage ? ` (${tgt.percentage}%)` : ''}
                    {tgt.hit && ' ✓'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {trade.stoploss && (
            <div className="flex items-center gap-2">
              <p className="stat-label">Stop Loss:</p>
              <span className="text-xs px-2 py-0.5 rounded-sm font-semibold trade-number border bg-red-500/10 text-red-500 border-red-500/30">
                {formatCurrencySimple(trade.stoploss.price, 2)} ({trade.stoploss.percentage}%)
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Expandable notes ──────────────────────────── */}
      {hasNotes && (
        <div className="border-t border-[hsl(var(--border)/0.6)]">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Notes</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <div className="px-4 pb-3">
              <p className="text-xs text-muted-foreground">{trade.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Footer: timestamps + actions ─────────────── */}
      <div className="border-t border-[hsl(var(--border)/0.6)] px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {new Date(trade.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-2.5 w-2.5" />
            {new Date(trade.last_quote_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {trade.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => onSelectTrade(trade.id)}
            >
              <Eye className="h-3 w-3" />
              Monitor
            </Button>
          )}

          {trade.status === 'active' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onManualUpdate(trade)}
              title="Manual price update"
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-blue-500 hover:text-blue-400"
            onClick={() => onEditHigh(trade)}
            title="Edit high watermark"
          >
            <BarChart2 className="h-3 w-3" />
          </Button>

          {isPositive && pnlPct > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-purple-500 hover:text-purple-400"
              onClick={() => onSendAd(trade)}
              title="Send as advertisement"
            >
              <Send className="h-3 w-3" />
            </Button>
          )}

          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDeleteRequest(trade)}
              title="Delete trade (Admin)"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function TradesList({ analysisId, onSelectTrade, standalone = false, refreshKey }: TradesListProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
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
    const tick = () => {
      // Only update market status — skip if tab hidden to save CPU
      if (!document.hidden) setMarketStatus(getMarketStatus())
    }
    tick()
    const interval = setInterval(tick, 60000)
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
    } catch {
      // silently fail — user is not admin
    }
  }

  const fetchTrades = async () => {
    setError(false)
    try {
      const apiUrl = standalone
        ? '/api/indices/trades'
        : `/api/indices/analyses/${analysisId}/trades`
      const response = await fetch(apiUrl)
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
      } else {
        setError(true)
      }
    } catch {
      setError(true)
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
        toast.error(data?.error || data?.message || 'Failed to delete trade')
      }
    } catch {
      toast.error('Network error: Failed to delete trade')
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading state ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Failed to load trades.</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchTrades}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <BarChart2 className="h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No trades added to this analysis yet.</p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setQuickManualTradeOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Create Manual Trade
        </Button>
        <QuickManualTradeDialog
          open={quickManualTradeOpen}
          onOpenChange={setQuickManualTradeOpen}
          onSuccess={() => { toast.success('Trade created'); fetchTrades() }}
        />
      </div>
    )
  }

  // ── Summary stats ────────────────────────────────────
  const activeTrades = trades.filter(t => t.status === 'active').length
  const winTrades = trades.filter(t => t.status === 'tp_hit').length
  const lossTrades = trades.filter(t => t.status === 'sl_hit').length

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Trades</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{trades.length} total</span>
            {activeTrades > 0 && (
              <span className="badge-active">{activeTrades} active</span>
            )}
            {winTrades > 0 && (
              <span className="badge-win">{winTrades} wins</span>
            )}
            {lossTrades > 0 && (
              <span className="badge-loss">{lossTrades} losses</span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2.5 gap-1.5"
          onClick={() => setQuickManualTradeOpen(true)}
        >
          <Plus className="h-3 w-3" />
          Manual Trade
        </Button>
      </div>

      {/* Market status notice */}
      {!marketStatus.isOpen && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 text-xs text-amber-600 dark:text-amber-400">
          <CircleDot className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>{marketStatus.message}</strong> — Prices reflect the last available quote.
            Market hours: 9:30 AM – 4:00 PM ET. Current: {formatMarketTime()}
          </span>
        </div>
      )}

      {/* Trade cards */}
      <div className="space-y-3">
        {trades.map((trade) => (
          <TradeCard
            key={trade.id}
            trade={trade}
            isAdmin={isAdmin}
            onSelectTrade={onSelectTrade}
            onManualUpdate={(t) => { setSelectedTradeForUpdate(t); setManualUpdateDialogOpen(true) }}
            onEditHigh={(t) => { setTradeToEditHigh(t); setEditHighDialogOpen(true) }}
            onSendAd={(t) => { setTradeToSendAd(t); setSendAdDialogOpen(true) }}
            onDeleteRequest={(t) => { setTradeToDelete(t); setDeleteDialogOpen(true) }}
          />
        ))}
      </div>

      {/* Dialogs */}
      {selectedTradeForUpdate && (
        <ManualHighUpdateDialog
          open={manualUpdateDialogOpen}
          onOpenChange={setManualUpdateDialogOpen}
          trade={selectedTradeForUpdate}
          onSuccess={() => { toast.success('Prices updated'); fetchTrades() }}
        />
      )}

      {tradeToEditHigh && (
        <EditHighWatermarkDialog
          open={editHighDialogOpen}
          onOpenChange={setEditHighDialogOpen}
          trade={tradeToEditHigh}
          onSuccess={fetchTrades}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trade</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
              {tradeToDelete && (
                <div className="mt-3 p-3 rounded-md bg-muted text-sm font-medium">
                  {tradeToDelete.instrument_type === 'options'
                    ? `${tradeToDelete.underlying_index_symbol} $${tradeToDelete.strike} ${tradeToDelete.option_type?.toUpperCase()}`
                    : `${tradeToDelete.underlying_index_symbol} ${tradeToDelete.direction.toUpperCase()}`
                  }
                  {tradeToDelete.polygon_option_ticker && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{tradeToDelete.polygon_option_ticker}</p>
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
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : 'Delete Trade'}
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
        onSuccess={() => { toast.success('Manual trade created'); fetchTrades() }}
      />
    </div>
  )
}
