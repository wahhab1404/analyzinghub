'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  User,
  X,
  Zap,
  CheckCircle2,
  BarChart2,
  ExternalLink,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

/* ── Types (unchanged) ──────────────────────────────────────────────── */

interface Trade {
  id: string
  status: 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled'
  instrument_type: 'options' | 'futures'
  direction: 'call' | 'put' | 'long' | 'short'
  strike: number | null
  expiry: string | null
  option_type: string | null
  entry_contract_snapshot: { mid: number; bid?: number; ask?: number }
  current_contract: number
  contract_high_since: number
  contract_low_since: number
  targets: Array<{ price: number; percentage: number; hit?: boolean }>
  stoploss: { price: number; percentage: number } | null
  notes: string | null
  published_at: string
}

interface IndexAnalysis {
  id: string
  index_symbol: string
  title: string
  body: string
  chart_image_url?: string
  chart_embed_url?: string
  status: 'draft' | 'published' | 'archived'
  visibility: string
  created_at: string
  published_at: string
  trades: Trade[]
  activation_enabled?: boolean
  activation_type?: 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE'
  activation_price?: number
  activation_timeframe?: 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE'
  activation_status?: 'draft' | 'published_inactive' | 'active' | 'completed_success' | 'completed_fail' | 'cancelled' | 'expired'
  activated_at?: string
  activation_met_at?: string
  preactivation_stop_touched?: boolean
  preactivation_stop_touched_at?: string
  author?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

interface IndexAnalysisDetailDialogProps {
  analysisId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTrade: (tradeId: string) => void
}

/* ── Logic helpers (preserved exactly) ─────────────────────────────── */

function calculatePnL(trade: Trade) {
  const entryPrice = trade.entry_contract_snapshot.mid
  const bestPrice =
    trade.direction === 'call' || trade.direction === 'long'
      ? trade.contract_high_since
      : trade.contract_low_since
  const pnlPercentage = ((bestPrice - entryPrice) / entryPrice) * 100
  const multiplier = trade.direction === 'call' || trade.direction === 'long' ? 1 : -1
  const adjustedPnL = pnlPercentage * multiplier
  return { percentage: adjustedPnL, isPositive: adjustedPnL > 0, value: bestPrice - entryPrice }
}

function getActivationTypeLabel(type?: string) {
  switch (type) {
    case 'PASSING_PRICE': return 'Passing Price'
    case 'ABOVE_PRICE': return 'Price Above'
    case 'UNDER_PRICE': return 'Price Under'
    default: return 'Unknown'
  }
}

function getActivationStatusLabel(status?: string) {
  switch (status) {
    case 'published_inactive': return 'Waiting for Activation'
    case 'active': return 'Active'
    case 'completed_success': return 'Completed Successfully'
    case 'completed_fail': return 'Failed'
    case 'cancelled': return 'Cancelled'
    case 'expired': return 'Expired'
    default: return status
  }
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[9px] font-bold tracking-[0.2em] text-slate-700 uppercase">{children}</span>
      <div className="flex-1 h-px bg-[#1a2840]" />
    </div>
  )
}

function MetricCell({
  label,
  value,
  color = 'text-slate-300',
}: {
  label: string
  value: string | number | null | undefined
  color?: string
}) {
  return (
    <div className="flex flex-col items-center py-2 px-1">
      <span className="text-[9px] text-slate-700 uppercase tracking-wider mb-1">{label}</span>
      <span className={`text-[11px] font-bold font-mono tabular-nums ${color}`}>
        {value != null && value !== '' ? value : '—'}
      </span>
    </div>
  )
}

function DetailTradeCard({
  trade,
  onClick,
}: {
  trade: Trade
  onClick: () => void
}) {
  const pnl = calculatePnL(trade)
  const isCall = trade.direction === 'call' || trade.direction === 'long'

  const statusConfig: Record<Trade['status'], { label: string; color: string; bg: string; border: string }> = {
    active:   { label: 'ACTIVE',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
    tp_hit:   { label: 'TP HIT',   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    sl_hit:   { label: 'SL HIT',   color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
    closed:   { label: 'CLOSED',   color: 'text-slate-500',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20' },
    draft:    { label: 'DRAFT',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
    canceled: { label: 'CANCELED', color: 'text-slate-600',   bg: 'bg-slate-500/8',    border: 'border-slate-500/15' },
  }
  const sc = statusConfig[trade.status]

  return (
    <div
      onClick={onClick}
      className="rounded-lg overflow-hidden bg-[#141d2e] border border-[#1a2840] hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-950/30 transition-all duration-200 cursor-pointer group/tc"
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0d1525] border-b border-[#1a2840]">
        {/* Direction badge */}
        <span
          className={`text-[11px] font-bold font-mono tracking-widest px-2 py-0.5 rounded border ${
            isCall
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : 'bg-red-500/10 border-red-500/25 text-red-400'
          }`}
        >
          {isCall ? '▲' : '▼'} {trade.direction.toUpperCase()}
        </span>

        {/* Instrument */}
        <span className="text-[10px] text-slate-600 font-mono">{trade.instrument_type}</span>

        {/* Strike */}
        {trade.strike && (
          <>
            <span className="text-slate-700">@</span>
            <span className="text-[11px] font-mono font-semibold text-slate-300">
              ${trade.strike.toLocaleString()}
            </span>
          </>
        )}

        {/* Expiry */}
        {trade.expiry && (
          <span className="text-[10px] text-slate-600 font-mono ml-1">
            {format(new Date(trade.expiry), 'MMM d')}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Status */}
          <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${sc.bg} ${sc.border} ${sc.color}`}>
            {sc.label}
          </span>

          {/* P&L */}
          {(trade.status === 'active' || trade.status === 'tp_hit') && (
            <span
              className={`text-[12px] font-bold font-mono tabular-nums ${
                pnl.isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {pnl.isPositive ? '+' : ''}
              {pnl.percentage.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 divide-x divide-[#1a2840] border-b border-[#1a2840]">
        <MetricCell
          label="Entry"
          value={`$${trade.entry_contract_snapshot.mid.toFixed(2)}`}
        />
        <MetricCell
          label="High"
          value={`$${trade.contract_high_since.toFixed(2)}`}
          color="text-emerald-400"
        />
        <MetricCell
          label="Low"
          value={`$${trade.contract_low_since.toFixed(2)}`}
          color="text-red-400"
        />
        <MetricCell
          label="Current"
          value={`$${trade.current_contract.toFixed(2)}`}
          color={trade.status === 'active' ? 'text-blue-400' : 'text-slate-500'}
        />
      </div>

      {/* Targets + Stop Loss strip */}
      {(trade.targets.length > 0 || trade.stoploss) && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2">
          {trade.targets.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Target className="w-2.5 h-2.5 text-emerald-600 flex-shrink-0" />
              {trade.targets.map((target, idx) => (
                <span
                  key={idx}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                    target.hit
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-[#1a2840] border-[#2a3850] text-slate-500'
                  }`}
                >
                  ${target.price} {target.hit ? '✓' : `(${target.percentage}%)`}
                </span>
              ))}
            </div>
          )}
          {trade.stoploss && (
            <div className="flex items-center gap-1.5 ml-auto">
              <AlertCircle className="w-2.5 h-2.5 text-red-600 flex-shrink-0" />
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border bg-red-500/8 border-red-500/20 text-red-400">
                SL ${trade.stoploss.price}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {trade.notes && (
        <div className="px-3 py-2 border-t border-[#1a2840]">
          <p className="text-[10px] text-slate-600 italic leading-relaxed">{trade.notes}</p>
        </div>
      )}
    </div>
  )
}

/* ── Main Dialog ────────────────────────────────────────────────────── */

export function IndexAnalysisDetailDialog({
  analysisId,
  open,
  onOpenChange,
  onSelectTrade,
}: IndexAnalysisDetailDialogProps) {
  const [analysis, setAnalysis] = useState<IndexAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (analysisId && open) {
      fetchAnalysisDetails()
    }
  }, [analysisId, open])

  const fetchAnalysisDetails = async () => {
    if (!analysisId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/indices/analyses/${analysisId}`)
      if (response.ok) {
        const data = await response.json()
        setAnalysis({ ...data.analysis, trades: data.trades || [] })
      } else {
        toast.error('Failed to load analysis details')
      }
    } catch {
      toast.error('Failed to load analysis details')
    } finally {
      setLoading(false)
    }
  }

  const isConditionMet =
    analysis?.activation_enabled &&
    (analysis.activation_status === 'active' ||
      analysis.activation_status === 'completed_success' ||
      analysis.activation_status === 'completed_fail')

  /* Loading state */
  if (loading || !analysis) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl bg-[#080d16] border-[#1a2840] p-0">
          <div className="flex items-center justify-center h-[70vh]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <span className="text-xs text-slate-600 font-mono">Loading analysis…</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const activeTrades = analysis.trades.filter((t) => t.status === 'active').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        max-w-[92vw] so it breathes on large screens;
        h-[90vh] for fixed height split workspace
      */}
      <DialogContent className="max-w-[96vw] sm:max-w-[92vw] w-full p-0 gap-0 bg-[#080d16] border-[#1a2840] overflow-hidden rounded-xl"
        style={{ height: '92vh' }}
      >
        <div className="flex flex-col md:flex-row h-full overflow-hidden">

          {/* ── LEFT PANEL: Chart — 45vh on mobile, 65% wide on md+ ── */}
          <div className="flex flex-col border-b md:border-b-0 md:border-r border-[#1a2840] overflow-hidden h-[45%] md:h-full md:w-[65%] flex-shrink-0">

            {/* Header strip */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-[#1a2840] bg-[#0b1220] flex-shrink-0 overflow-hidden">
              {/* Symbol */}
              <span className="text-[13px] font-bold font-mono text-blue-400 tracking-widest bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded">
                {analysis.index_symbol}
              </span>

              {/* Status dot */}
              <span
                className={`text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded border ${
                  analysis.status === 'published'
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                }`}
              >
                {analysis.status}
              </span>

              <div className="w-px h-4 bg-[#1a2840]" />

              {/* Title */}
              <h2 className="text-sm font-semibold text-slate-300 truncate flex-1 leading-tight">
                {analysis.title}
              </h2>

              {/* Active trades indicator */}
              {activeTrades > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 px-2 py-1 rounded flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] font-mono text-blue-400">{activeTrades} live</span>
                </div>
              )}

              {/* Close */}
              <button
                onClick={() => onOpenChange(false)}
                className="ml-1 p-1.5 rounded text-slate-600 hover:text-slate-300 hover:bg-[#1a2840] transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chart area */}
            <div className="flex-1 relative bg-[#060b14] overflow-hidden">
              {analysis.chart_image_url ? (
                <img
                  src={analysis.chart_image_url}
                  alt={analysis.title}
                  className="w-full h-full object-contain"
                />
              ) : analysis.chart_embed_url ? (
                <iframe
                  src={analysis.chart_embed_url}
                  className="w-full h-full border-0"
                  title="Chart"
                />
              ) : (
                /* Placeholder */
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                      backgroundImage:
                        'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
                      backgroundSize: '32px 32px',
                    }}
                  />
                  <BarChart2 className="w-16 h-16 text-slate-700 mb-3 relative z-10" />
                  <span className="text-sm text-slate-600 font-mono relative z-10">No chart attached</span>
                  <span className="text-[11px] text-slate-700 mt-1 relative z-10">Chart image or embed URL not set</span>
                </div>
              )}

              {/* Embed link */}
              {analysis.chart_embed_url && (
                <a
                  href={analysis.chart_embed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#060b14]/80 backdrop-blur-sm border border-[#1a2840] hover:border-blue-500/30 text-slate-500 hover:text-blue-400 text-[10px] px-2.5 py-1.5 rounded transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open in TradingView
                </a>
              )}
            </div>

            {/* Chart footer: author + time */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-t border-[#1a2840] bg-[#0b1220] flex-shrink-0">
              {analysis.author && (
                <div className="flex items-center gap-2">
                  {analysis.author.avatar_url ? (
                    <img
                      src={analysis.author.avatar_url}
                      alt={analysis.author.full_name}
                      className="w-5 h-5 rounded-full object-cover border border-[#1a2840]"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[#1a2840] flex items-center justify-center">
                      <User className="w-2.5 h-2.5 text-slate-600" />
                    </div>
                  )}
                  <span className="text-[11px] text-slate-500">{analysis.author.full_name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 ml-auto text-[10px] text-slate-700 font-mono">
                <Clock className="w-3 h-3" />
                {analysis.published_at
                  ? format(new Date(analysis.published_at), 'PPP · HH:mm')
                  : 'Not published'}
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL: Analysis + Trades — flex-1 on mobile, 35% on md+ ── */}
          <div className="flex flex-col bg-[#0b1220] overflow-hidden flex-1 md:w-[35%] md:flex-none">

            {/* Right panel header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1a2840] flex-shrink-0">
              <Activity className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-[10px] font-bold tracking-[0.18em] text-slate-600 uppercase">Research Note</span>
              <span className="ml-auto text-[10px] font-mono text-slate-700">
                {analysis.trades.length} trade{analysis.trades.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Scrollable content */}
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-6">

                {/* ── Analysis text ── */}
                <div>
                  <SectionLabel>Analysis</SectionLabel>
                  <p className="text-[12px] text-slate-400 leading-relaxed whitespace-pre-wrap">
                    {analysis.body}
                  </p>
                </div>

                {/* ── Activation condition ── */}
                {analysis.activation_enabled && (
                  <div>
                    <SectionLabel>Activation Condition</SectionLabel>
                    <div
                      className={`rounded-lg border p-3 ${
                        isConditionMet
                          ? 'bg-emerald-500/8 border-emerald-500/25'
                          : analysis.preactivation_stop_touched
                          ? 'bg-orange-500/8 border-orange-500/25'
                          : 'bg-amber-500/8 border-amber-500/25'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {isConditionMet ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-300 mb-1">
                            {isConditionMet ? 'Condition Met ✓' : 'Activation Required'}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {getActivationTypeLabel(analysis.activation_type)} ${analysis.activation_price?.toFixed(2)}
                            {analysis.activation_timeframe && analysis.activation_timeframe !== 'INTRABAR' && (
                              <span className="ml-1 opacity-70">
                                ({analysis.activation_timeframe.replace('_', ' ')})
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1a2840] border border-[#2a3850] text-slate-500">
                              {getActivationStatusLabel(analysis.activation_status)}
                            </span>
                          </div>
                          {analysis.preactivation_stop_touched && !isConditionMet && (
                            <p className="text-[10px] text-orange-400 mt-2 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Stop touched before activation
                            </p>
                          )}
                          {isConditionMet && analysis.activated_at && (
                            <p className="text-[10px] text-emerald-400 mt-2 font-mono">
                              Activated: {format(new Date(analysis.activated_at), 'MMM d, HH:mm')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Trades ── */}
                <div>
                  <SectionLabel>
                    Trades · {analysis.trades.length}
                  </SectionLabel>

                  {analysis.trades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Activity className="w-8 h-8 text-slate-700 mb-3" />
                      <p className="text-[11px] text-slate-600">No trades added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {analysis.trades.map((trade) => (
                        <DetailTradeCard
                          key={trade.id}
                          trade={trade}
                          onClick={() => {
                            onSelectTrade(trade.id)
                            onOpenChange(false)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </ScrollArea>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
