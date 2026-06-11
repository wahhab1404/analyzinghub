'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Loader2, TrendingUp, TrendingDown, Clock, DollarSign, Activity,
  Target, CircleDot, Info, Edit, Trash2, Send, Plus, RefreshCw,
  AlertTriangle, Eye, BarChart2, ChevronDown, ChevronUp, Twitter,
  PauseCircle, PlayCircle
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
  author_id?: string
  status: 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled' | 'suspended' | 'monitoring'
  monitor_status?: 'watching' | 'in_zone' | 'executed' | 'expired' | 'cancelled' | null
  exec_range_min?: number | null
  exec_range_max?: number | null
  monitor_best_price?: number | null
  monitor_last_price?: number | null
  monitor_expires_at?: string | null
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
    implied_volatility?: number
    delta?: number
    gamma?: number
    theta?: number
    vega?: number
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
  suspended:{ label: 'Suspended',   className: 'badge-loss' },
  monitoring:{ label: 'Monitoring', className: 'badge-draft' },
}

function StatusBadge({ status }: { status: Trade['status'] }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return null
  return <span className={cfg.className}>{cfg.label}</span>
}

function TradeCard({
  trade,
  isAdmin,
  canManage,
  onSelectTrade,
  onManualUpdate,
  onEditHigh,
  onSendAd,
  onDeleteRequest,
  onChanged,
}: {
  trade: Trade
  isAdmin: boolean
  canManage: boolean
  onSelectTrade: (id: string) => void
  onManualUpdate: (t: Trade) => void
  onEditHigh: (t: Trade) => void
  onSendAd: (t: Trade) => void
  onDeleteRequest: (t: Trade) => void
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [postingX, setPostingX] = useState(false)
  const [suspending, setSuspending] = useState(false)

  async function handleSuspend(action: 'suspend' | 'resume') {
    if (action === 'suspend' &&
        !window.confirm('وقف متابعة هذا العقد؟ سيُحتسب خسارة كاملة ويُرسَل تنبيه بالوقف ما لم تستأنفه.\nSuspend this contract? It will count as a full loss and a suspension alert will be sent, until you resume it.')) {
      return
    }
    setSuspending(true)
    try {
      const res = await fetch(`/api/indices/trades/${trade.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed')
      } else {
        toast.success(action === 'suspend' ? 'تم وقف العقد / Suspended' : 'تم استئناف المتابعة / Resumed')
        onChanged()
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSuspending(false)
    }
  }

  async function handlePostToX() {
    setPostingX(true)
    try {
      const res = await fetch(`/api/indices/trades/${trade.id}/post-to-twitter`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to post to X')
      } else {
        toast.success('تم النشر على X / Posted to X')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setPostingX(false)
    }
  }

  // Entry price — use nullish coalescing (fixes the || bug)
  const entryPrice = trade.entry_contract_snapshot.price ?? trade.entry_contract_snapshot.mid ?? 0

  const qty = trade.qty ?? 1
  const multiplier = trade.contract_multiplier ?? 100
  const isCall = trade.direction === 'call' || trade.direction === 'long'

  // P&L calculation: options always use contract_high_since (contract price rises when profitable
  // for both CALL and PUT). Only futures shorts use contract_low_since.
  const isOptions = trade.instrument_type === 'options'
  const bestPrice = (isOptions || isCall)
    ? trade.contract_high_since
    : trade.contract_low_since
  const pnlPct = isOptions
    ? (entryPrice > 0 ? ((bestPrice - entryPrice) / entryPrice) * 100 : 0)
    : (entryPrice > 0 ? ((bestPrice - entryPrice) / entryPrice) * 100 * (isCall ? 1 : -1) : 0)
  const pnlDollarsRaw = isOptions
    ? (bestPrice - entryPrice) * qty * multiplier
    : (bestPrice - entryPrice) * qty * multiplier * (isCall ? 1 : -1)

  // A suspended contract counts as a FULL LOSS (entire entry cost / -100%) until resumed.
  const isSuspended = trade.status === 'suspended'
  const pnlDollars = isSuspended ? -(entryPrice * qty * multiplier) : pnlDollarsRaw
  const effectivePnlPct = isSuspended ? -100 : pnlPct
  const isPositive = !isSuspended && pnlPct > 0

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
    suspended: 'loss',
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
              {effectivePnlPct > 0 ? '+' : ''}{formatNumber(effectivePnlPct, 2)}%
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              {isSuspended ? 'خسارة كاملة / Full Loss' : 'Best P&L'}
            </p>
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

      {/* ── Options Greeks ────────────────────────────── */}
      {trade.instrument_type === 'options' && (() => {
        const snap = trade.entry_contract_snapshot
        const iv = snap?.implied_volatility
        const delta = snap?.delta
        const gamma = snap?.gamma
        const theta = snap?.theta
        const vega = snap?.vega
        if (!iv && !delta && !gamma && !theta && !vega) return null
        return (
          <div className="border-t border-[hsl(var(--border)/0.6)] px-4 py-2.5 bg-muted/5">
            <p className="stat-label mb-2 flex items-center gap-1.5">
              <span className="text-[8px] text-primary/60">◆</span>
              OPTIONS GREEKS
            </p>
            <div className="grid grid-cols-5 gap-1 text-center">
              {iv != null && (
                <div className="space-y-0.5">
                  <p className="opt-greek-label">IV</p>
                  <p className={cn('opt-greek-value',
                    iv > 0.6 ? 'text-red-500' : iv > 0.4 ? 'text-amber-500' : iv > 0.25 ? 'text-foreground' : 'text-emerald-500/80'
                  )}>
                    {(iv * 100).toFixed(1)}%
                  </p>
                </div>
              )}
              {delta != null && (
                <div className="space-y-0.5">
                  <p className="opt-greek-label">Δ DELTA</p>
                  <p className={cn('opt-greek-value',
                    Math.abs(delta) >= 0.5 ? 'text-blue-400' : Math.abs(delta) >= 0.3 ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {delta.toFixed(2)}
                  </p>
                </div>
              )}
              {gamma != null && (
                <div className="space-y-0.5">
                  <p className="opt-greek-label">Γ GAMMA</p>
                  <p className="opt-greek-value text-purple-400/80">{gamma.toFixed(4)}</p>
                </div>
              )}
              {theta != null && (
                <div className="space-y-0.5">
                  <p className="opt-greek-label">Θ THETA</p>
                  <p className={cn('opt-greek-value',
                    theta < -5 ? 'text-red-500' : theta < -2 ? 'text-amber-500' : 'text-muted-foreground'
                  )}>
                    {theta.toFixed(2)}
                  </p>
                </div>
              )}
              {vega != null && (
                <div className="space-y-0.5">
                  <p className="opt-greek-label">V VEGA</p>
                  <p className="opt-greek-value text-cyan-400/80">{vega.toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>
        )
      })()}

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

          {canManage && trade.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1 border-orange-500/40 text-orange-500 hover:text-orange-400"
              onClick={() => handleSuspend('suspend')}
              disabled={suspending}
              title="وقف متابعة العقد / Suspend tracking"
            >
              {suspending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PauseCircle className="h-3 w-3" />}
              وقف
            </Button>
          )}

          {canManage && trade.status === 'suspended' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1 border-emerald-500/40 text-emerald-500 hover:text-emerald-400"
              onClick={() => handleSuspend('resume')}
              disabled={suspending}
              title="استئناف المتابعة / Resume tracking"
            >
              {suspending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
              استئناف
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

          {isPositive && pnlPct > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-sky-500 hover:text-sky-400"
              onClick={handlePostToX}
              disabled={postingX}
              title="نشر على X / Post to X"
            >
              {postingX ? <Loader2 className="h-3 w-3 animate-spin" /> : <Twitter className="h-3 w-3" />}
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

// ── Monitoring contract card (مراقبة وتجهيز عقد) ────────────────────────────────
// A contract being watched but NOT yet counted as a trade. It auto-executes at
// the best price once the live price reaches the execution range.
function MonitoringCard({
  trade,
  canManage,
  onChanged,
}: {
  trade: Trade
  canManage: boolean
  onChanged: () => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const inZone = trade.monitor_status === 'in_zone'
  const current = trade.monitor_last_price ?? trade.current_contract ?? null
  const best = trade.monitor_best_price ?? null

  async function handleCancel() {
    if (!window.confirm('إلغاء مراقبة هذا العقد؟ / Cancel monitoring this contract?')) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/indices/trades/${trade.id}/monitor`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('تم إلغاء المراقبة / Monitoring cancelled')
        onChanged()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d?.error || 'Failed to cancel monitoring')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className={cn(
      'rounded-lg border p-3 sm:p-4 space-y-2',
      inZone
        ? 'border-violet-500/40 bg-violet-500/5'
        : 'border-slate-500/20 bg-slate-500/5'
    )}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Eye className={cn('h-4 w-4', inZone ? 'text-violet-500' : 'text-slate-400')} />
          <span className="font-semibold text-sm">
            {trade.underlying_index_symbol} {(trade.option_type || trade.direction || '').toUpperCase()}
            {trade.strike ? ` $${Number(trade.strike).toFixed(0)}` : ''}
          </span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium',
            inZone ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300'
                   : 'bg-slate-500/20 text-slate-500'
          )}>
            {inZone ? 'في الرينج / In Zone' : 'مراقبة / Watching'}
          </span>
        </div>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-red-500 hover:text-red-600"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            <span className="ml-1">إلغاء</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">السعر الحالي / Current</p>
          <p className="font-semibold">{current != null ? `$${Number(current).toFixed(2)}` : '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">رينج التنفيذ / Range</p>
          <p className="font-semibold">
            ${Number(trade.exec_range_min ?? 0).toFixed(2)} – ${Number(trade.exec_range_max ?? 0).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">أفضل سعر / Best</p>
          <p className="font-semibold text-violet-600 dark:text-violet-300">
            {best != null ? `$${Number(best).toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      {trade.monitor_expires_at && (
        <p className="text-[10px] text-muted-foreground">
          ينتهي / Expires: {new Date(trade.monitor_expires_at).toLocaleString()}
        </p>
      )}
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
  const [myUserId, setMyUserId] = useState<string>('')
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
    fetch('/api/me')
      .then(r => r.json())
      .then(data => setMyUserId(data?.profile?.id ?? ''))
      .catch(() => {})
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

  // ── Split monitoring contracts from real trades ──────
  // Monitoring contracts (مراقبة وتجهيز عقد) are NOT counted as trades — they
  // are shown in their own section and excluded from trade stats until they
  // execute (at which point their status becomes 'active').
  const monitoringContracts = trades.filter(
    t => t.status === 'monitoring' && (t.monitor_status === 'watching' || t.monitor_status === 'in_zone')
  )
  const realTrades = trades.filter(t => t.status !== 'monitoring')

  // ── Summary stats (real trades only) ─────────────────
  const activeTrades = realTrades.filter(t => t.status === 'active').length
  const winTrades = realTrades.filter(t => t.status === 'tp_hit').length
  const lossTrades = realTrades.filter(t => t.status === 'sl_hit').length

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

      {/* Monitoring contracts (مراقبة وتجهيز عقد) — not counted as trades */}
      {monitoringContracts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-violet-500" />
            <h4 className="text-sm font-semibold">مراقبة وتجهيز العقود / Monitoring</h4>
            <span className="text-xs text-muted-foreground">{monitoringContracts.length}</span>
          </div>
          <div className="space-y-2">
            {monitoringContracts.map((trade) => (
              <MonitoringCard
                key={trade.id}
                trade={trade}
                canManage={isAdmin || (!!myUserId && trade.author_id === myUserId)}
                onChanged={fetchTrades}
              />
            ))}
          </div>
        </div>
      )}

      {/* Trade cards */}
      <div className="space-y-3">
        {realTrades.map((trade) => (
          <TradeCard
            key={trade.id}
            trade={trade}
            isAdmin={isAdmin}
            canManage={isAdmin || (!!myUserId && trade.author_id === myUserId)}
            onSelectTrade={onSelectTrade}
            onManualUpdate={(t) => { setSelectedTradeForUpdate(t); setManualUpdateDialogOpen(true) }}
            onEditHigh={(t) => { setTradeToEditHigh(t); setEditHighDialogOpen(true) }}
            onSendAd={(t) => { setTradeToSendAd(t); setSendAdDialogOpen(true) }}
            onDeleteRequest={(t) => { setTradeToDelete(t); setDeleteDialogOpen(true) }}
            onChanged={fetchTrades}
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
