'use client'

/**
 * components/spx/SignalCard.tsx
 *
 * Terminal-style signal card displaying the current or historical signal output.
 * Used in both the Live Engine panel and the Signal Feed.
 */

import { TrendingUp, TrendingDown, Minus, AlertTriangle, Eye, Zap, Shield, RefreshCw, Clock } from 'lucide-react'
import type { SignalOutput, SignalType, ConfidenceClass } from '@/services/spx/types'
import { ScoreGauge, SubScoreBar } from './ScoreGauge'
import { formatDistanceToNow } from 'date-fns'

interface SignalCardProps {
  signal: SignalOutput
  compact?: boolean
  className?: string
}

const SIGNAL_CONFIG: Record<SignalType, {
  label: string
  color: string
  bg: string
  border: string
  icon: React.ElementType
  pulse?: boolean
}> = {
  BUY_CALL:           { label: 'BUY CALL',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', icon: TrendingUp, pulse: true },
  BUY_PUT:            { label: 'BUY PUT',      color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/40',     icon: TrendingDown, pulse: true },
  WATCH_CALL:         { label: 'WATCH CALL',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: Eye },
  WATCH_PUT:          { label: 'WATCH PUT',    color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: Eye },
  NO_TRADE:           { label: 'NO TRADE',     color: 'text-slate-500',   bg: 'bg-slate-500/5',    border: 'border-slate-500/20',   icon: Minus },
  MARKET_UNCLEAR:     { label: 'UNCLEAR',      color: 'text-slate-400',   bg: 'bg-slate-500/5',    border: 'border-slate-500/20',   icon: Minus },
  WALL_SHIFT_WARNING: { label: 'WALL SHIFT',   color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Shield, pulse: true },
  FLOW_SURGE_WARNING: { label: 'FLOW SURGE',   color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  icon: Zap, pulse: true },
  SHOCK_WARNING:      { label: 'SHOCK',        color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/40',  icon: AlertTriangle, pulse: true },
  REVERSAL_WATCH:     { label: 'REVERSAL',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: RefreshCw },
}

const MODE_LABELS: Record<string, string> = {
  Trend:                    'Trend',
  Trend_Acceleration:       'Trend Accel',
  Breakout:                 'Breakout',
  Breakdown:                'Breakdown',
  Reversal:                 'Reversal',
  Mean_Reversion:           'Mean Rev',
  Momentum_Shock:           'Momentum Shock',
  Flow_Expansion:           'Flow Exp',
  Liquidity_Sweep_Recovery: 'Sweep Recovery',
  Wall_Rejection:           'Wall Rejection',
  Wall_Break_Continuation:  'Wall Break',
}

export function SignalCard({ signal, compact = false, className = '' }: SignalCardProps) {
  const cfg = SIGNAL_CONFIG[signal.signalType] ?? SIGNAL_CONFIG.NO_TRADE
  const Icon = cfg.icon

  const isExpired = signal.expiresAt ? new Date(signal.expiresAt) < new Date() : false
  const ageText = formatDistanceToNow(new Date(signal.generatedAt), { addSuffix: true })

  if (compact) {
    return (
      <div className={`flex items-center gap-3 px-3 py-2 rounded border ${cfg.border} ${cfg.bg} ${className}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`w-3 h-3 flex-shrink-0 ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[11px] font-bold ${cfg.color}`}>{cfg.label}</span>
          <span className="text-[9px] text-slate-600">{MODE_LABELS[signal.signalMode] ?? signal.signalMode}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <span className="text-[10px] text-white tabular-nums">{signal.underlyingPrice.toFixed(2)}</span>
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
            {signal.compositeScore}
          </span>
          <span className="text-[9px] text-slate-600">{ageText}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border ${cfg.border} overflow-hidden ${className}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${cfg.bg}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-bold tracking-wide ${cfg.color}`}>{cfg.label}</span>
          <span className="text-[10px] text-slate-500 bg-[#0b1220]/50 px-1.5 py-0.5 rounded">
            {MODE_LABELS[signal.signalMode] ?? signal.signalMode}
          </span>
          {isExpired && (
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              Expired
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{signal.marketMode}</span>
          <span className="text-[10px] text-slate-600">{ageText}</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 bg-[#070e1a]">
        {/* Score + direction */}
        <div className="flex items-center gap-6">
          <ScoreGauge
            score={signal.compositeScore}
            label="Signal"
            size="md"
            confidenceClass={signal.confidenceClass}
            showClass
          />
          <div className="flex-1 space-y-3">
            {/* SPX price + recommendation */}
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <div className="text-[9px] text-slate-600 uppercase tracking-widest">SPX</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {signal.underlyingPrice.toFixed(2)}
                </div>
              </div>
              {signal.recommendedStrike && (
                <div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest">Strike</div>
                  <div className={`text-lg font-bold tabular-nums ${cfg.color}`}>
                    {signal.recommendedStrike}
                  </div>
                </div>
              )}
              {signal.recommendedExpiry && (
                <div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest">Expiry</div>
                  <div className="text-sm font-semibold text-slate-300">
                    {signal.recommendedExpiry}
                  </div>
                </div>
              )}
              {signal.targetPremium && (
                <div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest">Premium</div>
                  <div className="text-sm font-semibold text-slate-200 tabular-nums">
                    ${signal.targetPremium.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Direction bias */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-slate-600 uppercase">Bias</span>
              <span className={`text-[10px] font-semibold uppercase ${
                signal.directionBias === 'bullish' ? 'text-emerald-400' :
                signal.directionBias === 'bearish' ? 'text-red-400' :
                'text-slate-500'
              }`}>
                {signal.directionBias}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-scores */}
        <div className="space-y-1.5 border-t border-[#1a2840] pt-3">
          <div className="text-[9px] text-slate-700 uppercase tracking-widest mb-2">Sub-scores</div>
          <SubScoreBar label="Structure"  score={signal.subScores.structure} />
          <SubScoreBar label="Flow"       score={signal.subScores.flow} />
          <SubScoreBar label="Gamma"      score={signal.subScores.gamma} />
          <SubScoreBar label="Wall"       score={signal.subScores.wall} />
          <SubScoreBar label="IV"         score={signal.subScores.iv} />
          <SubScoreBar label="Execution"  score={signal.subScores.execution} />
          <SubScoreBar label="Time"       score={signal.subScores.timeContext} />
          <SubScoreBar label="Contract"   score={signal.subScores.contractFit} />
        </div>

        {/* Key factors */}
        {signal.keyFactors.length > 0 && (
          <div className="border-t border-[#1a2840] pt-3">
            <div className="text-[9px] text-slate-700 uppercase tracking-widest mb-1.5">Key factors</div>
            <ul className="space-y-1">
              {signal.keyFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-400">
                  <span className="text-emerald-500/60 mt-0.5">▸</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risks */}
        {signal.risks.length > 0 && (
          <div className="border-t border-[#1a2840] pt-3">
            <div className="text-[9px] text-slate-700 uppercase tracking-widest mb-1.5">Risks</div>
            <ul className="space-y-1">
              {signal.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-amber-500/70">
                  <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
