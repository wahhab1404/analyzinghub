'use client'

/**
 * components/spx/ScoreGauge.tsx
 *
 * Premium terminal-style radial score gauge with confidence class badge.
 * Used for composite score and sub-scores in the SPX Intelligence Hub.
 */

import type { ConfidenceClass } from '@/services/spx/types'

interface ScoreGaugeProps {
  score: number          // 0-100
  label: string
  size?: 'sm' | 'md' | 'lg'
  confidenceClass?: ConfidenceClass
  showClass?: boolean
  color?: string         // tailwind color class for the arc
  className?: string
}

const CONFIDENCE_COLORS: Record<ConfidenceClass, string> = {
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  E: 'text-red-400',
}

const CONFIDENCE_BG: Record<ConfidenceClass, string> = {
  A: 'bg-emerald-500/10 border-emerald-500/30',
  B: 'bg-blue-500/10 border-blue-500/30',
  C: 'bg-amber-500/10 border-amber-500/30',
  D: 'bg-orange-500/10 border-orange-500/30',
  E: 'bg-red-500/10 border-red-500/30',
}

function scoreColor(score: number): string {
  if (score >= 75) return '#10b981' // emerald-500
  if (score >= 60) return '#3b82f6' // blue-500
  if (score >= 45) return '#f59e0b' // amber-500
  if (score >= 30) return '#f97316' // orange-500
  return '#ef4444'                  // red-500
}

export function ScoreGauge({
  score,
  label,
  size = 'md',
  confidenceClass,
  showClass = false,
  className = '',
}: ScoreGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, score))

  const dimensions = { sm: 72, md: 96, lg: 128 }
  const strokeWidths = { sm: 6, md: 8, lg: 10 }
  const dim = dimensions[size]
  const sw = strokeWidths[size]
  const radius = (dim - sw * 2) / 2
  const cx = dim / 2
  const cy = dim / 2

  // Arc spans 270° (starting at 135°, ending at 405° = 45°)
  const totalArcDegrees = 270
  const startAngle = 135  // degrees from positive x-axis
  const progressDegrees = (clampedScore / 100) * totalArcDegrees

  function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
    const rad = (deg - 90) * (Math.PI / 180)
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const start = polarToCartesian(cx, cy, r, startDeg)
    const end = polarToCartesian(cx, cy, r, endDeg)
    const largeArc = endDeg - startDeg > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  const trackPath = arcPath(cx, cy, radius, startAngle, startAngle + totalArcDegrees)
  const progressPath = clampedScore > 0
    ? arcPath(cx, cy, radius, startAngle, startAngle + progressDegrees)
    : null

  const color = scoreColor(clampedScore)

  const textSizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }
  const labelSizes = { sm: 'text-[9px]', md: 'text-[10px]', lg: 'text-xs' }
  const pathLen = 2 * Math.PI * radius * (totalArcDegrees / 360)

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div style={{ width: dim, height: dim }} className="relative flex-shrink-0">
        <svg width={dim} height={dim} className="overflow-visible">
          {/* Track */}
          <path
            d={trackPath}
            fill="none"
            stroke="#1e293b"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          {progressPath && (
            <path
              d={progressPath}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 4px ${color}88)`,
                transition: 'stroke-dashoffset 0.5s ease',
              }}
            />
          )}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-bold tabular-nums ${textSizes[size]}`}
            style={{ color }}
          >
            {clampedScore}
          </span>
          {showClass && confidenceClass && (
            <span
              className={`text-[9px] font-bold mt-0.5 ${CONFIDENCE_COLORS[confidenceClass]}`}
            >
              {confidenceClass}
            </span>
          )}
        </div>
      </div>

      {/* Label */}
      <span className={`${labelSizes[size]} text-slate-400 font-medium uppercase tracking-widest text-center`}>
        {label}
      </span>

      {/* Confidence badge */}
      {showClass && confidenceClass && (
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${CONFIDENCE_BG[confidenceClass]} ${CONFIDENCE_COLORS[confidenceClass]} uppercase tracking-wider`}
        >
          Class {confidenceClass}
        </span>
      )}
    </div>
  )
}

/** Mini horizontal bar gauge for sub-scores */
export function SubScoreBar({
  label,
  score,
  className = '',
}: {
  label: string
  score: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, score))
  const color = scoreColor(pct)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[10px] text-slate-500 w-24 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] tabular-nums w-7 text-right flex-shrink-0" style={{ color }}>
        {pct}
      </span>
    </div>
  )
}
