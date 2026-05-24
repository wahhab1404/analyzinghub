'use client'

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
  headerBg: string
  icon: React.ElementType
  pulse?: boolean
}> = {
  BUY_CALL:           { label: 'BUY CALL',   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', headerBg: 'bg-emerald-500/10', icon: TrendingUp,    pulse: true },
  BUY_PUT:            { label: 'BUY PUT',    color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/40',     headerBg: 'bg-red-500/10',     icon: TrendingDown,  pulse: true },
  WATCH_CALL:         { label: 'WATCH CALL', color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    headerBg: 'bg-blue-500/8',     icon: Eye },
  WATCH_PUT:          { label: 'WATCH PUT',  color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    headerBg: 'bg-blue-500/8',     icon: Eye },
  NO_TRADE:           { label: 'NO TRADE',   color: 'text-slate-500',   bg: 'bg-slate-500/5',    border: 'border-slate-500/20',   headerBg: 'bg-white/[0.03]',   icon: Minus },
  MARKET_UNCLEAR:     { label: 'UNCLEAR',    color: 'text-slate-400',   bg: 'bg-slate-500/5',    border: 'border-slate-500/20',   headerBg: 'bg-white/[0.03]',   icon: Minus },
  WALL_SHIFT_WARNING: { label: 'WALL SHIFT', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   headerBg: 'bg-amber-500/8',    icon: Shield,        pulse: true },
  FLOW_SURGE_WARNING: { label: 'FLOW SURGE', color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  headerBg: 'bg-violet-500/8',   icon: Zap,           pulse: true },
  SHOCK_WARNING:      { label: 'SHOCK',      color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/40',  headerBg: 'bg-orange-500/8',   icon: AlertTriangle, pulse: true },
  REVERSAL_WATCH:     { label: 'REVERSAL',   color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   headerBg: 'bg-amber-500/8',    icon: RefreshCw },
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
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${cfg.border} ${cfg.bg} ${className}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
          <span className="text-xs text-slate-500">{MODE_LABELS[signal.signalMode] ?? signal.signalMode}</span>
        </div>
        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
          <span className="text-sm text-white tabular-nums font-semibold">{signal.underlyingPrice.toFixed(2)}</span>
          <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
            {signal.compositeScore}
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">{ageText}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border ${cfg.border} overflow-hidden ${className}`}>
      {/* ── Header ── */}
      <div className={`flex items-center justify-between px-5 py-4 ${cfg.headerBg} border-b ${cfg.border}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className={`text-base font-bold tracking-wide ${cfg.color}`}>{cfg.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {MODE_LABELS[signal.signalMode] ?? signal.signalMode}
            </div>
          </div>
          {isExpired && (
            <span className="flex items-center gap-1 text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" />
              Expired
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-slate-400">{signal.marketMode}</span>
          <span className="text-xs text-slate-600">{ageText}</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-5 space-y-5 bg-[#080f1e]">

        {/* Score + key data */}
        <div className="flex items-start gap-5">
          <ScoreGauge
            score={signal.compositeScore}
            label="Signal"
            size="md"
            confidenceClass={signal.confidenceClass}
            showClass
          />
          <div className="flex-1 min-w-0 space-y-4">
            {/* Price / Strike / Expiry / Premium */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">SPX</div>
                <div className="text-lg font-bold text-white tabular-nums">{signal.underlyingPrice.toFixed(2)}</div>
              </div>
              {signal.recommendedStrike && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Strike</div>
                  <div className={`text-lg font-bold tabular-nums ${cfg.color}`}>{signal.recommendedStrike}</div>
                </div>
              )}
              {signal.recommendedExpiry && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Expiry</div>
                  <div className="text-sm font-bold text-slate-300">{signal.recommendedExpiry}</div>
                </div>
              )}
              {signal.targetPremium && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">Premium</div>
                  <div className="text-sm font-bold text-slate-200 tabular-nums">${signal.targetPremium.toFixed(2)}</div>
                </div>
              )}
            </div>

            {/* Direction bias */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">Bias</span>
              <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-lg ${
                signal.directionBias === 'bullish' ? 'text-emerald-400 bg-emerald-500/10' :
                signal.directionBias === 'bearish' ? 'text-red-400     bg-red-500/10'     :
                'text-slate-500 bg-white/5'
              }`}>
                {signal.directionBias}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-scores */}
        <div className="space-y-2 border-t border-white/[0.06] pt-4">
          <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-3">Sub-scores</div>
          <SubScoreBar label="Structure" score={signal.subScores.structure} />
          <SubScoreBar label="Flow"      score={signal.subScores.flow} />
          <SubScoreBar label="Gamma"     score={signal.subScores.gamma} />
          <SubScoreBar label="Wall"      score={signal.subScores.wall} />
          <SubScoreBar label="IV"        score={signal.subScores.iv} />
          <SubScoreBar label="Execution" score={signal.subScores.execution} />
          <SubScoreBar label="Time"      score={signal.subScores.timeContext} />
          <SubScoreBar label="Contract"  score={signal.subScores.contractFit} />
        </div>

        {/* Key factors */}
        {signal.keyFactors.length > 0 && (
          <div className="border-t border-white/[0.06] pt-4">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-3">Key Factors</div>
            <ul className="space-y-1.5">
              {signal.keyFactors.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-snug">
                  <span className="text-emerald-500/60 mt-0.5 flex-shrink-0">▸</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risks */}
        {signal.risks.length > 0 && (
          <div className="border-t border-white/[0.06] pt-4">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-3">Risks</div>
            <ul className="space-y-1.5">
              {signal.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-500/70 leading-snug">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
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
