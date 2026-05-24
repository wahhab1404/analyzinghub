'use client'

import { Shield, AlertTriangle, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import type { WallEngineOutput, WallLevel } from '@/services/spx/types'

interface WallDisplayProps {
  walls: WallEngineOutput
  className?: string
}

const STATE_COLORS: Record<string, string> = {
  holding:    'text-slate-400',
  approached: 'text-amber-400',
  rejected:   'text-blue-400',
  broken:     'text-red-400',
  unknown:    'text-slate-600',
}

const STATE_LABELS: Record<string, string> = {
  holding:    'Holding',
  approached: 'Approached',
  rejected:   'Rejected',
  broken:     'Broken',
  unknown:    '—',
}

const STATE_BADGES: Record<string, string> = {
  holding:    'text-slate-400 bg-slate-500/10 border-slate-500/20',
  approached: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  rejected:   'text-blue-400  bg-blue-500/10  border-blue-500/20',
  broken:     'text-red-400   bg-red-500/10   border-red-500/20',
  unknown:    'text-slate-600 bg-white/5      border-white/10',
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
  const pctFromPrice = ((wall.strike - currentPrice) / currentPrice * 100)
  const stateKey = wall.state in STATE_BADGES ? wall.state : 'unknown'

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isCall
        ? 'border-red-500/20 bg-red-500/[0.04]'
        : 'border-emerald-500/20 bg-emerald-500/[0.04]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            isCall ? 'bg-red-500/15' : 'bg-emerald-500/15'
          }`}>
            {isCall
              ? <TrendingDown className="w-4 h-4 text-red-400" />
              : <TrendingUp className="w-4 h-4 text-emerald-400" />
            }
          </div>
          <span className={`text-xs font-bold uppercase tracking-widest ${isCall ? 'text-red-400' : 'text-emerald-400'}`}>
            {isCall ? 'Call Wall' : 'Put Wall'}
          </span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATE_BADGES[stateKey]}`}>
          {STATE_LABELS[stateKey]}
        </span>
      </div>

      {/* Strike + distance */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-white tabular-nums tracking-tight">{wall.strike.toFixed(0)}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.abs(pctFromPrice).toFixed(2)}% {pctFromPrice > 0 ? 'above' : 'below'} · {wall.distanceFromPrice.toFixed(0)} pts
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-bold tabular-nums ${isCall ? 'text-red-400' : 'text-emerald-400'}`}>
            {wall.strength.toFixed(0)}
            <span className="text-xs font-normal text-slate-500"> /100</span>
          </div>
          <div className="text-[10px] text-slate-600 uppercase tracking-widest">strength</div>
        </div>
      </div>

      {/* Strength bar */}
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isCall ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${wall.strength}%` }}
        />
      </div>

      {/* Meta */}
      <div className="flex gap-4 text-xs text-slate-600">
        <span>OI: <span className="text-slate-400 font-medium">{wall.openInterest.toLocaleString()}</span></span>
        <span>Vol: <span className="text-slate-400 font-medium">{wall.volume.toLocaleString()}</span></span>
        <span>Persist: <span className="text-slate-400 font-medium">{wall.persistenceScore.toFixed(0)}</span></span>
      </div>
    </div>
  )
}

export function WallDisplay({ walls, className = '' }: WallDisplayProps) {
  const hasData = walls.callWall || walls.putWall

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-bold text-white">Strike Walls</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {walls.wallMigration && (
            <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
              <Zap className="w-3 h-3" />
              Migration {walls.migrationDirection}
            </span>
          )}
          {walls.wallCompression && (
            <span className="text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2.5 py-1">
              Compressed
            </span>
          )}
          <span className="text-xs text-slate-500">
            Wall score: <span className="text-slate-300 font-semibold">{walls.wallScore}</span>
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 bg-white/[0.02] rounded-xl px-4 border border-white/[0.06]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Wall data unavailable — options chain may be empty outside market hours
        </div>
      ) : (
        <>
          {/* Nearest wall banner */}
          {walls.nearestWall && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm flex-wrap gap-y-1">
              <span className="text-slate-500 text-xs">Nearest wall</span>
              <span className="text-white font-bold">{walls.nearestWall.strike}</span>
              <span className={`font-semibold ${walls.nearestWall.side === 'call' ? 'text-red-400' : 'text-emerald-400'}`}>
                ({walls.nearestWall.side})
              </span>
              <span className="text-slate-500 text-xs">{walls.nearestWallDistance?.toFixed(0)} pts away</span>
              {walls.wallCompression && walls.wallCompressionWidth && (
                <span className="ml-auto text-violet-400 text-xs">
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
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Secondary Walls</div>
              <div className="flex flex-wrap gap-1.5">
                {walls.secondaryCallWalls.map(w => (
                  <span key={`c-${w.strike}`} className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-2.5 py-1">
                    C {w.strike} <span className="opacity-60">({w.strength.toFixed(0)})</span>
                  </span>
                ))}
                {walls.secondaryPutWalls.map(w => (
                  <span key={`p-${w.strike}`} className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2.5 py-1">
                    P {w.strike} <span className="opacity-60">({w.strength.toFixed(0)})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {walls.warnings.length > 0 && (
        <div className="space-y-2">
          {walls.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-500/70">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
