'use client'

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  Plus,
  FileText,
  Target,
  AlertCircle,
  Zap,
  CheckCircle2,
  BarChart2,
} from 'lucide-react'
import { format } from 'date-fns'

/* ── Types (unchanged from original) ───────────────────────────────── */

interface Trade {
  id: string
  status: 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled'
  instrument_type: 'options' | 'futures'
  direction: 'call' | 'put' | 'long' | 'short'
  strike: number | null
  expiry: string | null
  entry_contract_snapshot: { mid: number }
  current_contract: number
  contract_high_since: number
  contract_low_since: number
  targets: Array<{ price: number; percentage: number; hit?: boolean }>
  stoploss: { price: number; percentage: number } | null
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
  trades_count: number
  active_trades_count: number
  targets?: Array<{ level: number; label: string; reached: boolean; reached_at: string | null }>
  invalidation_price?: number
  activation_enabled?: boolean
  activation_type?: 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE'
  activation_price?: number
  activation_timeframe?: 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE'
  activation_status?: 'draft' | 'published_inactive' | 'active' | 'completed_success' | 'completed_fail' | 'cancelled' | 'expired'
  activated_at?: string
  activation_met_at?: string
  preactivation_stop_touched?: boolean
  author?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

interface IndexAnalysisCardProps {
  analysis: IndexAnalysis
  isAnalyzer?: boolean
  onViewDetails: (analysisId: string) => void
  onNewTrade: (analysisId: string, indexSymbol: string) => void
  onFollowUp: (analysisId: string, indexSymbol: string) => void
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
  return { percentage: adjustedPnL, isPositive: adjustedPnL > 0 }
}

function getActivationTypeLabel(type?: string) {
  switch (type) {
    case 'PASSING_PRICE': return 'Passing'
    case 'ABOVE_PRICE': return 'Above'
    case 'UNDER_PRICE': return 'Under'
    default: return 'Unknown'
  }
}

function getActivationStatusLabel(status?: string) {
  switch (status) {
    case 'published_inactive': return 'Waiting'
    case 'active': return 'Active'
    case 'completed_success': return 'Completed'
    case 'completed_fail': return 'Failed'
    default: return status
  }
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function TradeStatusDot({ status }: { status: Trade['status'] }) {
  const colors: Record<Trade['status'], string> = {
    active: 'bg-blue-400 animate-pulse',
    tp_hit: 'bg-emerald-400',
    sl_hit: 'bg-red-400',
    closed: 'bg-slate-500',
    draft: 'bg-slate-600',
    canceled: 'bg-slate-600',
  }
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[status]}`} />
}

function CardTradeRow({
  trade,
  onClick,
}: {
  trade: Trade
  onClick: (e: React.MouseEvent) => void
}) {
  const pnl = calculatePnL(trade)
  const isCall = trade.direction === 'call' || trade.direction === 'long'

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[#141d2e] border border-[#1a2840] hover:border-blue-500/30 transition-all cursor-pointer group/tr"
    >
      <TradeStatusDot status={trade.status} />

      {/* Direction pill */}
      <span
        className={`text-[10px] font-bold font-mono tracking-wider px-1.5 py-0.5 rounded ${
          isCall
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}
      >
        {trade.direction.toUpperCase()}
      </span>

      <span className="text-[10px] text-slate-600">{trade.instrument_type}</span>

      {trade.strike && (
        <>
          <span className="text-[10px] text-slate-700">@</span>
          <span className="text-[10px] font-mono text-slate-400">${trade.strike.toLocaleString()}</span>
        </>
      )}

      <span className="ml-auto">
        {trade.status === 'active' ? (
          <span
            className={`text-[10px] font-bold font-mono tabular-nums ${
              pnl.isPositive ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {pnl.isPositive ? '+' : ''}
            {pnl.percentage.toFixed(1)}%
          </span>
        ) : (
          <span className="text-[9px] text-slate-600 uppercase tracking-wider">{trade.status.replace('_', ' ')}</span>
        )}
      </span>
    </div>
  )
}

/* ── Main Card Component ────────────────────────────────────────────── */

export function IndexAnalysisCard({
  analysis,
  isAnalyzer = false,
  onViewDetails,
  onNewTrade,
  onFollowUp,
  onSelectTrade,
}: IndexAnalysisCardProps) {
  const [imageError, setImageError] = useState(false)

  const isConditionMet =
    analysis.activation_enabled &&
    (analysis.activation_status === 'active' ||
      analysis.activation_status === 'completed_success' ||
      analysis.activation_status === 'completed_fail')

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl bg-[#0b1220] border border-[#1a2840] hover:border-blue-500/40 hover:shadow-2xl hover:shadow-blue-950/40 transition-all duration-300 cursor-pointer"
      onClick={() => onViewDetails(analysis.id)}
    >
      {/* ── CHART ZONE ─────────────────────────────────────────────── */}
      <div className="relative h-[200px] overflow-hidden bg-[#060b14] flex-shrink-0">
        {analysis.chart_image_url && !imageError ? (
          <img
            src={analysis.chart_image_url}
            alt={analysis.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={() => setImageError(true)}
          />
        ) : (
          /* Placeholder with subtle grid pattern */
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <BarChart2 className="w-10 h-10 text-slate-700 mb-2 relative z-10" />
            <span className="text-[10px] text-slate-700 font-mono relative z-10">No chart attached</span>
          </div>
        )}

        {/* Gradient scrim – bottom-heavy for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/40 to-transparent" />

        {/* Top row: symbol badge + status */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between z-10">
          {/* Ticker */}
          <div className="flex items-center gap-1.5 bg-[#060b14]/80 backdrop-blur-sm border border-blue-500/30 rounded-md px-2.5 py-1">
            <span className="text-[11px] font-bold font-mono text-blue-400 tracking-widest">
              {analysis.index_symbol}
            </span>
          </div>

          {/* Status */}
          <div
            className={`text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded border ${
              analysis.status === 'published'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : analysis.status === 'draft'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-slate-500/10 border-slate-500/30 text-slate-500'
            } backdrop-blur-sm`}
          >
            {analysis.status}
          </div>
        </div>

        {/* Bottom row: trade count + time */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#060b14]/70 backdrop-blur-sm rounded px-2 py-1">
              <Activity className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-mono text-slate-400">
                {analysis.trades_count} trade{analysis.trades_count !== 1 ? 's' : ''}
              </span>
            </div>
            {analysis.active_trades_count > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-500/10 backdrop-blur-sm border border-blue-500/30 rounded px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] font-mono text-blue-400">
                  {analysis.active_trades_count} live
                </span>
              </div>
            )}
          </div>

          {analysis.published_at && (
            <div className="flex items-center gap-1 bg-[#060b14]/70 backdrop-blur-sm rounded px-2 py-1">
              <Clock className="w-2.5 h-2.5 text-slate-600" />
              <span className="text-[9px] font-mono text-slate-600">
                {format(new Date(analysis.published_at), 'MMM d · HH:mm')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 p-4 gap-3">

        {/* Title */}
        <h3 className="text-sm font-bold text-slate-200 leading-snug line-clamp-2 group-hover:text-blue-300 transition-colors">
          {analysis.title}
        </h3>

        {/* Summary */}
        {analysis.body && (
          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
            {analysis.body}
          </p>
        )}

        {/* Key levels (targets + invalidation) */}
        {((analysis.targets && analysis.targets.length > 0) || analysis.invalidation_price) && (
          <div className="flex flex-wrap gap-1.5">
            {analysis.targets?.slice(0, 3).map((target, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  target.reached
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}
              >
                <Target className="w-2.5 h-2.5" />
                {target.label}: ${target.level.toFixed(0)}
                {target.reached && ' ✓'}
              </div>
            ))}
            {analysis.invalidation_price && (
              <div className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border bg-red-500/10 border-red-500/20 text-red-400">
                <AlertCircle className="w-2.5 h-2.5" />
                Inv: ${analysis.invalidation_price.toFixed(0)}
              </div>
            )}
          </div>
        )}

        {/* Activation condition badge */}
        {analysis.activation_enabled && (
          <div
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px] ${
              isConditionMet
                ? 'bg-emerald-500/8 border-emerald-500/25 text-emerald-400'
                : analysis.preactivation_stop_touched
                ? 'bg-orange-500/8 border-orange-500/25 text-orange-400'
                : 'bg-amber-500/8 border-amber-500/25 text-amber-400'
            }`}
          >
            {isConditionMet ? (
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
            ) : (
              <Zap className="w-3 h-3 flex-shrink-0" />
            )}
            <span className="font-medium">
              {isConditionMet ? 'Condition Met' : 'Activation Required'}
            </span>
            <span className="text-[9px] opacity-70 ml-auto font-mono">
              {getActivationTypeLabel(analysis.activation_type)} ${analysis.activation_price?.toFixed(0)}
            </span>
          </div>
        )}

        {/* ── TRADES PREVIEW ─────────────────────────────────────── */}
        {analysis.trades.length > 0 && (
          <div className="border-t border-[#1a2840] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold tracking-[0.18em] text-slate-700 uppercase">
                Recent Trades
              </span>
              {analysis.trades.length > 3 && (
                <span className="text-[9px] text-slate-700 font-mono">
                  +{analysis.trades.length - 3} more
                </span>
              )}
            </div>
            <div className="space-y-1">
              {analysis.trades.slice(0, 3).map((trade) => (
                <CardTradeRow
                  key={trade.id}
                  trade={trade}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectTrade(trade.id)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── ACTION FOOTER ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-t border-[#1a2840] bg-[#0d1525] flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {isAnalyzer ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onNewTrade(analysis.id, analysis.index_symbol)
              }}
              className="flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[11px] font-semibold border border-blue-500/30 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              New Trade
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onFollowUp(analysis.id, analysis.index_symbol)
              }}
              className="flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 rounded text-slate-500 hover:text-slate-300 text-[11px] font-medium border border-[#1a2840] hover:border-[#2a3850] transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              Follow-up
            </button>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onViewDetails(analysis.id)
            }}
            className="flex items-center gap-1.5 flex-1 justify-center px-3 py-1.5 rounded text-slate-400 hover:text-slate-200 text-[11px] font-medium border border-[#1a2840] hover:border-blue-500/30 hover:bg-blue-500/5 transition-all"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  )
}
