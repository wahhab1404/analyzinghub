'use client'

import type { ConfidenceClass } from '@/services/spx/types'

interface ScoreGaugeProps {
  score: number
  label: string
  size?: 'sm' | 'md' | 'lg'
  confidenceClass?: ConfidenceClass
  showClass?: boolean
  className?: string
}

const CONFIDENCE_COLORS: Record<ConfidenceClass, string> = {
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  E: 'text-red-400',
}

const CONFIDENCE_BADGES: Record<ConfidenceClass, string> = {
  A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  B: 'text-blue-400   bg-blue-500/10   border-blue-500/30',
  C: 'text-amber-400  bg-amber-500/10  border-amber-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  E: 'text-red-400    bg-red-500/10    border-red-500/30',
}

function scoreColor(score: number): string {
  if (score >= 75) return '#10b981'
  if (score >= 60) return '#3b82f6'
  if (score >= 45) return '#f59e0b'
  if (score >= 30) return '#f97316'
  return '#ef4444'
}

export function ScoreGauge({
  score,
  label,
  size = 'md',
  confidenceClass,
  showClass = false,
  className = '',
}: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score))

  const dims        = { sm: 76, md: 100, lg: 132 }
  const strokes     = { sm: 7,  md: 9,   lg: 11 }
  const dim         = dims[size]
  const sw          = strokes[size]
  const radius      = (dim - sw * 2) / 2
  const cx          = dim / 2
  const cy          = dim / 2

  const START_DEG   = 135
  const TOTAL_DEG   = 270
  const progressDeg = (clamped / 100) * TOTAL_DEG

  function polar(angleDeg: number) {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  function arc(startDeg: number, endDeg: number) {
    const s = polar(startDeg)
    const e = polar(endDeg)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const trackPath    = arc(START_DEG, START_DEG + TOTAL_DEG)
  const progressPath = clamped > 0 ? arc(START_DEG, START_DEG + progressDeg) : null
  const color        = scoreColor(clamped)

  const textSizes  = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' }
  const labelSizes = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm' }

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div style={{ width: dim, height: dim }} className="relative flex-shrink-0">
        <svg width={dim} height={dim} className="overflow-visible">
          <path d={trackPath}    fill="none" stroke="#1e293b" strokeWidth={sw} strokeLinecap="round" />
          {progressPath && (
            <path
              d={progressPath}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 5px ${color}99)`, transition: 'all 0.5s ease' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold tabular-nums leading-none ${textSizes[size]}`} style={{ color }}>
            {clamped}
          </span>
          {showClass && confidenceClass && (
            <span className={`text-[10px] font-bold mt-1 ${CONFIDENCE_COLORS[confidenceClass]}`}>
              {confidenceClass}
            </span>
          )}
        </div>
      </div>

      <span className={`${labelSizes[size]} text-slate-400 font-semibold uppercase tracking-widest text-center`}>
        {label}
      </span>

      {showClass && confidenceClass && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CONFIDENCE_BADGES[confidenceClass]} uppercase tracking-wide`}>
          Class {confidenceClass}
        </span>
      )}
    </div>
  )
}

export function SubScoreBar({
  label,
  score,
  className = '',
}: {
  label: string
  score: number
  className?: string
}) {
  const pct   = Math.max(0, Math.min(100, score))
  const color = scoreColor(pct)

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-xs text-slate-500 w-[88px] text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs tabular-nums w-7 text-right flex-shrink-0 font-semibold" style={{ color }}>
        {pct}
      </span>
    </div>
  )
}
