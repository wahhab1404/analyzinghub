'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { LineChart, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'

export interface Candle {
  t: number   // timestamp ms
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
}

type TF = '1D' | '1W' | '1M' | '3M' | '1Y'

interface CandleChartProps {
  symbol: string
}

// ── Design tokens ────────────────────────────────────────────────────────────
const G    = '#3FB950'
const R    = '#F85149'
const BLUE = '#58A6FF'
const MUTED = '#8B949E'

// ── Layout constants ─────────────────────────────────────────────────────────
const W      = 900
const H      = 360
const MT     = 12
const MB     = 42    // time axis
const ML     = 8
const MR     = 72   // price axis
const VOL_H  = 52   // volume strip height
const VOL_GAP = 8   // gap between main chart and volume strip
const CHART_H = H - MT - MB - VOL_H - VOL_GAP
const CHART_W = W - ML - MR

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtPrice = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtVol   = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${v}`

function fmtTime(ts: number, tf: TF) {
  const d = new Date(ts)
  if (tf === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (tf === '1W') return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getHours()}:00`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTooltipTime(ts: number, tf: TF) {
  const d = new Date(ts)
  if (tf === '1D') return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  if (tf === '1W') return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Price axis tick computation ───────────────────────────────────────────────
function niceTicks(min: number, max: number, count = 6) {
  const range = max - min
  const step  = Math.pow(10, Math.floor(Math.log10(range / count)))
  const nice  = [1, 2, 2.5, 5, 10].find(m => (range / (step * m)) <= count) ?? 10
  const tick  = step * nice
  const lo    = Math.ceil(min / tick) * tick
  const ticks: number[] = []
  for (let v = lo; v <= max + tick * 0.01; v += tick) ticks.push(parseFloat(v.toFixed(8)))
  return ticks
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="h-4 w-24 bg-muted/40 rounded animate-pulse" />
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => <div key={i} className="h-5 w-8 bg-muted/30 rounded animate-pulse" />)}
        </div>
      </div>
      <div className="p-4 h-[280px] flex items-center justify-center">
        <div className="w-full h-full bg-muted/10 rounded animate-pulse flex items-end justify-around pb-4 px-2 gap-0.5">
          {[...Array(30)].map((_, i) => (
            <div key={i} className="bg-muted/20 rounded-sm flex-1 animate-pulse"
              style={{ height: `${30 + Math.random() * 60}%`, animationDelay: `${i * 30}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main CandleChart ─────────────────────────────────────────────────────────
export function CandleChart({ symbol }: CandleChartProps) {
  const [tf, setTf]             = useState<TF>('1D')
  const [candles, setCandles]   = useState<Candle[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [hoveredIdx, setHover]  = useState<number | null>(null)
  const [cached, setCached]     = useState(false)
  const svgRef                  = useRef<SVGSVGElement>(null)
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCandles = useCallback(async (timeframe: TF) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/symbols/${symbol}/candles?tf=${timeframe}`)
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      if (data.error && (!data.candles || data.candles.length === 0)) {
        setError(data.error)
        setCandles([])
      } else {
        setCandles(data.candles || [])
        setCached(data.cached ?? false)
      }
    } catch (e: any) {
      setError('Failed to load chart data')
      setCandles([])
    } finally {
      setLoading(false)
    }
  }, [symbol])

  useEffect(() => {
    fetchCandles(tf)
    // Auto-refresh 1D chart every 60s during market hours
    if (tf === '1D') {
      intervalRef.current = setInterval(() => fetchCandles('1D'), 60_000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [tf, fetchCandles])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || candles.length === 0) return
    const rect  = svgRef.current.getBoundingClientRect()
    const svgX  = ((e.clientX - rect.left) / rect.width) * W
    const chartX = svgX - ML
    const idx   = Math.floor((chartX / CHART_W) * candles.length)
    setHover(idx >= 0 && idx < candles.length ? idx : null)
  }, [candles.length])

  // ── Derived values ──────────────────────────────────────────────────────────
  const hovered   = hoveredIdx !== null ? candles[hoveredIdx] : candles[candles.length - 1] ?? null
  const firstClose  = candles[0]?.c ?? 0
  const lastClose   = candles[candles.length - 1]?.c ?? 0
  const dayPositive = lastClose >= firstClose

  if (loading) return <Skeleton />

  // ── Empty / error state ──────────────────────────────────────────────────────
  if (error || candles.length === 0) {
    return (
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <ChartHeader tf={tf} onTfChange={t => { setTf(t); setHover(null) }} onRefresh={() => fetchCandles(tf)} symbol={symbol} cached={cached} />
        <div className="h-56 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <LineChart className="h-8 w-8 opacity-30" />
          <p className="text-sm">{error ?? 'No chart data available'}</p>
          <button onClick={() => fetchCandles(tf)}
            className="text-xs font-bold px-3 py-1 rounded-sm border border-border hover:border-primary/50 mt-1 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Scales ───────────────────────────────────────────────────────────────────
  const allLows  = candles.map(c => c.l)
  const allHighs = candles.map(c => c.h)
  const minP     = Math.min(...allLows)
  const maxP     = Math.max(...allHighs)
  const pad      = (maxP - minP) * 0.05
  const yMin     = minP - pad
  const yMax     = maxP + pad

  const toY   = (p: number) => MT + ((yMax - p) / (yMax - yMin)) * CHART_H
  const maxVol = Math.max(...candles.map(c => c.v))

  // Candle width & spacing — min 1px wide body, max 12px
  const spacing  = CHART_W / candles.length
  const bodyW    = Math.min(12, Math.max(1, spacing * 0.65))

  // Price axis ticks
  const priceTicks = niceTicks(yMin, yMax, 6)

  // Time axis ticks — show ~6 labels
  const timeStep = Math.max(1, Math.floor(candles.length / 6))
  const timeIndices = candles.map((_, i) => i).filter(i => i % timeStep === 0)

  // Volume area Y top
  const volAreaTop = MT + CHART_H + VOL_GAP

  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <ChartHeader tf={tf} onTfChange={t => { setTf(t); setHover(null) }} onRefresh={() => fetchCandles(tf)} symbol={symbol} cached={cached} />

      {/* OHLCV info bar */}
      {hovered && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border text-[11px] font-mono bg-muted/5">
          <span className="text-muted-foreground">{fmtTooltipTime(hovered.t, tf)}</span>
          {[
            { label: 'O', value: fmtPrice(hovered.o), color: 'var(--foreground)' },
            { label: 'H', value: fmtPrice(hovered.h), color: G },
            { label: 'L', value: fmtPrice(hovered.l), color: R },
            { label: 'C', value: fmtPrice(hovered.c), color: hovered.c >= hovered.o ? G : R },
            { label: 'V', value: fmtVol(hovered.v),   color: MUTED },
          ].map(s => (
            <span key={s.label}>
              <span className="text-muted-foreground">{s.label} </span>
              <span className="font-bold" style={{ color: s.color }}>{s.value}</span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1" style={{ color: dayPositive ? G : R }}>
            {dayPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {lastClose > firstClose ? '+' : ''}{((lastClose - firstClose) / firstClose * 100).toFixed(2)}%
          </span>
        </div>
      )}

      {/* SVG chart */}
      <div className="px-2 py-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          style={{ cursor: 'crosshair', display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}>

          {/* ── Background ──────────────────────────────────────────── */}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />

          {/* ── Horizontal grid + price labels ───────────────────────── */}
          {priceTicks.map(price => {
            const y = toY(price)
            if (y < MT - 2 || y > MT + CHART_H + 2) return null
            return (
              <g key={price}>
                <line x1={ML} y1={y} x2={W - MR} y2={y}
                  stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                <text x={W - MR + 5} y={y + 3.5} fontSize={9.5} fill={MUTED} fontFamily="monospace">
                  {fmtPrice(price)}
                </text>
              </g>
            )
          })}

          {/* ── Volume area background line ────────────────────────── */}
          <line x1={ML} y1={volAreaTop} x2={W - MR} y2={volAreaTop}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />

          {/* ── Candles & volume bars ──────────────────────────────── */}
          {candles.map((c, i) => {
            const cx       = ML + i * spacing + spacing / 2
            const isGreen  = c.c >= c.o
            const color    = isGreen ? G : R
            const bodyTop  = toY(Math.max(c.o, c.c))
            const bodyBot  = toY(Math.min(c.o, c.c))
            const bodyH    = Math.max(1, bodyBot - bodyTop)
            const wickTop  = toY(c.h)
            const wickBot  = toY(c.l)
            const isHov    = hoveredIdx === i
            const volH     = maxVol > 0 ? (c.v / maxVol) * VOL_H : 0
            const alpha    = isHov ? 1 : 0.85

            return (
              <g key={c.t} opacity={alpha}>
                {/* Upper wick */}
                <line x1={cx} y1={wickTop} x2={cx} y2={bodyTop}
                  stroke={color} strokeWidth={1} />
                {/* Lower wick */}
                <line x1={cx} y1={bodyBot} x2={cx} y2={wickBot}
                  stroke={color} strokeWidth={1} />
                {/* Body */}
                {isGreen ? (
                  <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
                    fill={color} rx={0.5} />
                ) : (
                  <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
                    fill="transparent" stroke={color} strokeWidth={Math.max(1, bodyW >= 3 ? 1 : 0.8)} rx={0.5} />
                )}
                {/* Volume bar */}
                <rect
                  x={cx - bodyW / 2}
                  y={volAreaTop + VOL_H - volH}
                  width={bodyW}
                  height={volH}
                  fill={color}
                  opacity={0.3}
                  rx={0.5} />
              </g>
            )
          })}

          {/* ── Crosshair (vertical line on hover) ────────────────── */}
          {hoveredIdx !== null && (() => {
            const cx = ML + hoveredIdx * spacing + spacing / 2
            return (
              <g>
                <line x1={cx} y1={MT} x2={cx} y2={MT + CHART_H}
                  stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3,3" />
                {/* Price callout on Y axis */}
                {hovered && (() => {
                  const priceY = toY(hovered.c)
                  return (
                    <g>
                      <rect x={W - MR + 3} y={priceY - 7} width={MR - 5} height={14} rx={2}
                        fill={hovered.c >= hovered.o ? G : R} />
                      <text x={W - MR + 5} y={priceY + 3.5} fontSize={9} fill="#fff" fontFamily="monospace">
                        {fmtPrice(hovered.c)}
                      </text>
                    </g>
                  )
                })()}
              </g>
            )
          })()}

          {/* ── Current price line (last candle close) ────────────── */}
          {!hoveredIdx && candles.length > 0 && (() => {
            const lastC = candles[candles.length - 1]
            const y     = toY(lastC.c)
            const color = lastC.c >= lastC.o ? G : R
            return (
              <g>
                <line x1={ML} y1={y} x2={W - MR} y2={y}
                  stroke={color} strokeWidth={0.75} strokeDasharray="4,4" opacity={0.5} />
                <rect x={W - MR + 3} y={y - 7} width={MR - 5} height={14} rx={2} fill={color} />
                <text x={W - MR + 5} y={y + 3.5} fontSize={9} fill="#fff" fontFamily="monospace">
                  {fmtPrice(lastC.c)}
                </text>
              </g>
            )
          })()}

          {/* ── Time axis labels ──────────────────────────────────── */}
          {timeIndices.map(i => {
            const cx = ML + i * spacing + spacing / 2
            return (
              <text key={i} x={cx} y={MT + CHART_H + VOL_GAP + VOL_H + 14}
                fontSize={9} fill={MUTED} textAnchor="middle" fontFamily="monospace">
                {fmtTime(candles[i].t, tf)}
              </text>
            )
          })}

          {/* ── Vol label ─────────────────────────────────────────── */}
          <text x={ML + 2} y={volAreaTop + 10} fontSize={8} fill={MUTED} opacity={0.6}>VOL</text>
        </svg>
      </div>

      {/* Footer: data info */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: dayPositive ? G : R }} />
          {symbol} · {tf}
        </span>
        <span>·</span>
        <span>{candles.length} bars</span>
        {cached && <span>· cached</span>}
        <span className="ml-auto opacity-70">Polygon.io · ~15-min delay</span>
      </div>
    </div>
  )
}

// ── Chart header sub-component ────────────────────────────────────────────────
function ChartHeader({ tf, onTfChange, onRefresh, symbol, cached }: {
  tf: TF
  onTfChange: (t: TF) => void
  onRefresh: () => void
  symbol: string
  cached: boolean
}) {
  const timeframes: TF[] = ['1D', '1W', '1M', '3M', '1Y']
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded flex items-center justify-center" style={{ background: `${BLUE}18` }}>
          <LineChart className="h-3.5 w-3.5" style={{ color: BLUE }} />
        </div>
        <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
          {symbol} Candles
        </span>
      </div>
      <div className="flex items-center gap-1">
        {timeframes.map(t => (
          <button key={t} onClick={() => onTfChange(t)}
            className="px-2 py-0.5 text-[10px] font-bold rounded transition-colors"
            style={{
              background: tf === t ? `${BLUE}20` : 'transparent',
              color:      tf === t ? BLUE : MUTED,
              border:     `1px solid ${tf === t ? BLUE + '40' : 'transparent'}`,
            }}>
            {t}
          </button>
        ))}
        <button onClick={onRefresh}
          className="ml-1 p-1 rounded hover:bg-muted/20 transition-colors"
          title="Refresh">
          <RefreshCw className="h-3 w-3" style={{ color: MUTED }} />
        </button>
      </div>
    </div>
  )
}
