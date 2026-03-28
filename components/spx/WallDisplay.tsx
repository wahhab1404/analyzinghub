'use client'

/**
 * components/spx/WallDisplay.tsx
 *
 * Visualises the SPX wall engine output as a price-level bar chart
 * with call wall (red/resistance) above and put wall (green/support) below.
 */

import { Shield, AlertTriangle, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import type { WallEngineOutput, WallLevel } from '@/services/spx/types'

interface WallDisplayProps {
  walls: WallEngineOutput
  className?: string
}

const STATE_COLORS: Record<string, string> = {
  holding:   'text-slate-400',
  approached:'text-amber-400',
  rejected:  'text-blue-400',
  broken:    'text-red-400',
  unknown:   'text-slate-600',
}

const STATE_LABELS: Record<string, string> = {
  holding:   'Holding',
  approached:'Approached',
  rejected:  'Rejected',
  broken:    'Broken',
  unknown:   '—',
}

function WallRow({
  wall,
  side,
  currentPrice,
}: {
  wall: WallLevel
  side: 'call' | 'put'
  currentPrice: number
}) {
  const isCall = side === 'call'
  const stateColor = STATE_COLORS[wall.state] ?? STATE_COLORS.unknown
  const pctFromPrice = ((wall.strike - currentPrice) / currentPrice * 100)

  return (
    <div className={`rounded-lg border p-3 ${
      isCall
        ? 'border-red-500/20 bg-red-500/5'
        : 'border-emerald-500/20 bg-emerald-500/5'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {isCall ? (
            <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
          ) : (
            <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          )}
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isCall ? 'text-red-400' : 'text-emerald-400'}`}>
            {isCall ? 'Call Wall' : 'Put Wall'}
          </span>
        </div>
        <span className={`text-[9px] font-medium ${stateColor}`}>
          {STATE_LABELS[wall.state]}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-bold text-white tabular-nums">{wall.strike.toFixed(0)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {Math.abs(pctFromPrice).toFixed(2)}% {pctFromPrice > 0 ? 'above' : 'below'} price
            &nbsp;·&nbsp;{wall.distanceFromPrice.toFixed(0)} pts
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold ${isCall ? 'text-red-400' : 'text-emerald-400'}`}>
            {wall.strength.toFixed(0)}
            <span className="text-[10px] font-normal text-slate-500"> /100</span>
          </div>
          <div className="text-[9px] text-slate-600">strength</div>
        </div>
      </div>

      {/* Strength bar */}
      <div className="mt-2 h-1 bg-[#1e293b] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isCall ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${wall.strength}%` }}
        />
      </div>

      {/* Meta row */}
      <div className="mt-2 flex gap-3 text-[9px] text-slate-600">
        <span>OI: <span className="text-slate-400">{wall.openInterest.toLocaleString()}</span></span>
        <span>Vol: <span className="text-slate-400">{wall.volume.toLocaleString()}</span></span>
        <span>Persist: <span className="text-slate-400">{wall.persistenceScore.toFixed(0)}</span></span>
      </div>
    </div>
  )
}

export function WallDisplay({ walls, className = '' }: WallDisplayProps) {
  const hasData = walls.callWall || walls.putWall

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Strike Walls
          </span>
        </div>
        <div className="flex items-center gap-2">
          {walls.wallMigration && (
            <span className="flex items-center gap-1 text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
              <Zap className="w-2.5 h-2.5" />
              Migration {walls.migrationDirection}
            </span>
          )}
          {walls.wallCompression && (
            <span className="text-[9px] text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5">
              Compressed
            </span>
          )}
          <span className="text-[9px] text-slate-600">
            Score: <span className="text-slate-300">{walls.wallScore}</span>
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 py-4">
          <AlertTriangle className="w-4 h-4" />
          Wall data unavailable — options chain may be empty outside market hours
        </div>
      ) : (
        <>
          {/* Nearest wall indicator */}
          {walls.nearestWall && (
            <div className="flex items-center gap-2 text-[10px] px-2 py-1.5 bg-[#0d1726] rounded border border-[#1a2840]">
              <span className="text-slate-600">Nearest wall:</span>
              <span className="text-white font-semibold">{walls.nearestWall.strike}</span>
              <span className={walls.nearestWall.side === 'call' ? 'text-red-400' : 'text-emerald-400'}>
                ({walls.nearestWall.side})
              </span>
              <span className="text-slate-600">
                {walls.nearestWallDistance?.toFixed(0)} pts away
              </span>
              {walls.wallCompression && walls.wallCompressionWidth && (
                <span className="ml-auto text-violet-400">
                  {walls.wallCompressionWidth.toFixed(0)} pt range
                </span>
              )}
            </div>
          )}

          {/* Wall cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {walls.callWall && (
              <WallRow wall={walls.callWall} side="call" currentPrice={walls.underlyingPrice} />
            )}
            {walls.putWall && (
              <WallRow wall={walls.putWall} side="put" currentPrice={walls.underlyingPrice} />
            )}
          </div>

          {/* Secondary walls */}
          {(walls.secondaryCallWalls.length > 0 || walls.secondaryPutWalls.length > 0) && (
            <div>
              <div className="text-[9px] text-slate-700 uppercase tracking-wider mb-1.5">
                Secondary Walls
              </div>
              <div className="flex flex-wrap gap-1.5">
                {walls.secondaryCallWalls.map(w => (
                  <span key={`c-${w.strike}`} className="text-[9px] text-red-400 bg-red-500/5 border border-red-500/20 rounded px-1.5 py-0.5">
                    C {w.strike} ({w.strength.toFixed(0)})
                  </span>
                ))}
                {walls.secondaryPutWalls.map(w => (
                  <span key={`p-${w.strike}`} className="text-[9px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded px-1.5 py-0.5">
                    P {w.strike} ({w.strength.toFixed(0)})
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {walls.warnings.length > 0 && (
        <div className="space-y-1">
          {walls.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px] text-amber-500/70">
              <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
