'use client'

/**
 * components/spx/ReplayPanel.tsx
 *
 * Historical session replay panel for reviewing past SPX trading days.
 * Loads session data, renders an SVG price chart with event markers,
 * and plays through events with configurable speed.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  CalendarDays, TrendingUp, TrendingDown, Minus, Zap, Target,
  Activity, BarChart2, ChevronDown, Code2, AlertTriangle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplayBar {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

interface ReplayEvent {
  id: string
  type: 'signal' | 'trade_open' | 'trade_close' | 'wall_snapshot' | 'score_snapshot'
  ts: string
  barIndex: number
  spxPriceAtEvent: number | null
  data: any
  summary: string
}

interface ReplaySession {
  date: string
  bars: ReplayBar[]
  events: ReplayEvent[]
  tradingDayOpen: number | null
  tradingDayClose: number | null
  tradingDayHigh: number | null
  tradingDayLow: number | null
  sessionRange: number | null
  totalEvents: number
  signalCount: number
  tradeCount: number
}

interface ReplayStats {
  openToClose: number | null
  maxDrawdown: number | null
  volatilityProxy: number | null
  signalCount: number
  actionableSignals: number
  tradesOpened: number
  tradesClosed: number
  wins: number
  losses: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEEDS = [0.5, 1, 2, 5, 10]

const EVENT_COLORS: Record<ReplayEvent['type'], string> = {
  signal:         '#3b82f6', // blue
  trade_open:     '#10b981', // emerald
  trade_close:    '#f59e0b', // amber (win); will be overridden for loss
  wall_snapshot:  '#8b5cf6', // violet
  score_snapshot: '#64748b', // slate
}

const EVENT_BORDER_COLORS: Record<ReplayEvent['type'], string> = {
  signal:         'border-blue-500/40',
  trade_open:     'border-emerald-500/40',
  trade_close:    'border-amber-500/40',
  wall_snapshot:  'border-violet-500/40',
  score_snapshot: 'border-slate-500/30',
}

const EVENT_BG_COLORS: Record<ReplayEvent['type'], string> = {
  signal:         'bg-blue-500/8',
  trade_open:     'bg-emerald-500/8',
  trade_close:    'bg-amber-500/8',
  wall_snapshot:  'bg-violet-500/8',
  score_snapshot: 'bg-slate-500/5',
}

const EVENT_LABEL_COLORS: Record<ReplayEvent['type'], string> = {
  signal:         'text-blue-400',
  trade_open:     'text-emerald-400',
  trade_close:    'text-amber-400',
  wall_snapshot:  'text-violet-400',
  score_snapshot: 'text-slate-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(p: number | null, decimals = 2): string {
  if (p == null) return '—'
  return p.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtPct(p: number | null): string {
  if (p == null) return '—'
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(2)}%`
}

function fmtTs(ts: string): string {
  try { return format(parseISO(ts), 'HH:mm:ss') } catch { return ts }
}

function fmtDate(dateStr: string): string {
  try { return format(parseISO(dateStr), 'EEE MMM d, yyyy') } catch { return dateStr }
}

function tradeCloseColor(data: any): string {
  const outcome = data?.final_score_outcome ?? data?.outcome ?? data?.result ?? ''
  if (typeof outcome === 'string') {
    const lower = outcome.toLowerCase()
    if (lower === 'win' || lower === 'profit') return '#10b981'
    if (lower === 'loss' || lower === 'stop') return '#ef4444'
  }
  if (typeof data?.pnl === 'number') return data.pnl >= 0 ? '#10b981' : '#ef4444'
  return EVENT_COLORS.trade_close
}

function getEventDotColor(event: ReplayEvent): string {
  if (event.type === 'trade_close') return tradeCloseColor(event.data)
  return EVENT_COLORS[event.type]
}

// ─── SVG Price Chart ──────────────────────────────────────────────────────────

interface PriceChartProps {
  bars: ReplayBar[]
  events: ReplayEvent[]
  activeEventIndex: number
}

function PriceChart({ bars, events, activeEventIndex }: PriceChartProps) {
  if (!bars.length) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-slate-500 text-sm">
        <div className="text-center space-y-2">
          <BarChart2 className="h-8 w-8 mx-auto opacity-30" />
          <p>No price data available</p>
          <p className="text-xs text-slate-600">Market may have been closed on this date</p>
        </div>
      </div>
    )
  }

  const W = 800
  const H = 200
  const PAD = { top: 12, right: 48, bottom: 28, left: 56 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const closes = bars.map(b => b.c)
  const minPrice = Math.min(...closes)
  const maxPrice = Math.max(...closes)
  const priceRange = maxPrice - minPrice || 1

  // Scale helpers
  const xScale = (i: number) => PAD.left + (i / Math.max(bars.length - 1, 1)) * chartW
  const yScale = (p: number) => PAD.top + chartH - ((p - minPrice) / priceRange) * chartH

  // Polyline points
  const points = bars.map((b, i) => `${xScale(i)},${yScale(b.c)}`).join(' ')

  // Y-axis labels (5 levels)
  const yLevels = 5
  const yLabels = Array.from({ length: yLevels }, (_, i) => {
    const pct = i / (yLevels - 1)
    const price = minPrice + pct * priceRange
    const y = PAD.top + chartH - pct * chartH
    return { price, y }
  })

  // X-axis: label every ~30 bars (roughly 30 minutes for 1-min bars)
  const tickInterval = Math.max(1, Math.floor(bars.length / 8))
  const xLabels: { i: number; x: number; label: string }[] = []
  for (let i = 0; i < bars.length; i += tickInterval) {
    const b = bars[i]
    const d = new Date(b.t)
    const label = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
    xLabels.push({ i, x: xScale(i), label })
  }

  // Active event bar index
  const activeEvent = events[activeEventIndex] ?? null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      style={{ minHeight: '200px' }}
    >
      {/* Grid lines */}
      {yLabels.map(({ y }, idx) => (
        <line
          key={idx}
          x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
          stroke="#1a2840" strokeWidth="1"
        />
      ))}

      {/* Area fill under the price line */}
      <defs>
        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
        </linearGradient>
        <clipPath id="chartClip">
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
        </clipPath>
      </defs>

      {/* Area polygon */}
      <polygon
        points={`${PAD.left},${PAD.top + chartH} ${points} ${W - PAD.right},${PAD.top + chartH}`}
        fill="url(#priceGrad)"
        clipPath="url(#chartClip)"
      />

      {/* Price polyline */}
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        clipPath="url(#chartClip)"
      />

      {/* Active bar vertical line */}
      {activeEvent && activeEvent.barIndex >= 0 && activeEvent.barIndex < bars.length && (
        <line
          x1={xScale(activeEvent.barIndex)}
          y1={PAD.top}
          x2={xScale(activeEvent.barIndex)}
          y2={PAD.top + chartH}
          stroke="#60a5fa"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      )}

      {/* Event markers — all events */}
      {events.map((evt, idx) => {
        if (evt.barIndex < 0 || evt.barIndex >= bars.length) return null
        const cx = xScale(evt.barIndex)
        const bar = bars[evt.barIndex]
        if (!bar) return null
        const cy = yScale(bar.c)
        const isActive = idx === activeEventIndex
        const color = getEventDotColor(evt)
        return (
          <g key={evt.id}>
            {isActive && (
              <circle cx={cx} cy={cy} r={10} fill={color} opacity={0.15} />
            )}
            <circle
              cx={cx} cy={cy}
              r={isActive ? 5 : 3.5}
              fill={color}
              stroke={isActive ? '#ffffff' : 'transparent'}
              strokeWidth={isActive ? 1.5 : 0}
              opacity={isActive ? 1 : 0.75}
            />
          </g>
        )
      })}

      {/* Y-axis labels */}
      {yLabels.map(({ price, y }, idx) => (
        <text
          key={idx}
          x={PAD.left - 6} y={y + 4}
          textAnchor="end"
          fontSize="9"
          fill="#475569"
        >
          {fmtPrice(price, 0)}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ x, label }, idx) => (
        <text
          key={idx}
          x={x} y={H - 6}
          textAnchor="middle"
          fontSize="9"
          fill="#475569"
        >
          {label}
        </text>
      ))}
    </svg>
  )
}

// ─── Event Row ────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: ReplayEvent
  isActive: boolean
  index: number
  onClick: () => void
}

function EventTypeIcon({ type }: { type: ReplayEvent['type'] }) {
  const cls = 'h-3.5 w-3.5'
  switch (type) {
    case 'signal':         return <Zap className={cls} />
    case 'trade_open':     return <TrendingUp className={cls} />
    case 'trade_close':    return <Target className={cls} />
    case 'wall_snapshot':  return <BarChart2 className={cls} />
    case 'score_snapshot': return <Activity className={cls} />
  }
}

function EventRow({ event, isActive, index, onClick }: EventRowProps) {
  const [expanded, setExpanded] = useState(false)

  const borderCls = isActive
    ? 'border-blue-400/60 bg-blue-500/5'
    : `${EVENT_BORDER_COLORS[event.type]} ${EVENT_BG_COLORS[event.type]}`

  const labelColor = event.type === 'trade_close'
    ? (tradeCloseColor(event.data) === '#10b981' ? 'text-emerald-400' : tradeCloseColor(event.data) === '#ef4444' ? 'text-red-400' : 'text-amber-400')
    : EVENT_LABEL_COLORS[event.type]

  return (
    <div
      className={`rounded-lg border transition-all duration-150 ${borderCls} ${isActive ? 'ring-1 ring-blue-400/30' : ''}`}
    >
      <button
        className="w-full text-left px-3 py-2 flex items-start gap-2.5"
        onClick={() => { onClick(); setExpanded(e => !e) }}
      >
        {/* Index badge */}
        <span className="mt-0.5 min-w-[1.5rem] text-right text-[10px] text-slate-600 font-mono tabular-nums">
          {index + 1}
        </span>

        {/* Time */}
        <span className="mt-0.5 shrink-0 font-mono text-[10px] text-slate-500 tabular-nums w-[52px]">
          {fmtTs(event.ts)}
        </span>

        {/* Type icon + label */}
        <span className={`mt-0.5 shrink-0 ${labelColor}`}>
          <EventTypeIcon type={event.type} />
        </span>

        {/* Summary */}
        <span className="flex-1 text-[11px] text-slate-300 leading-snug text-left">
          {event.summary}
          {event.spxPriceAtEvent != null && (
            <span className="ml-1.5 text-slate-500 font-mono text-[10px]">
              @ {fmtPrice(event.spxPriceAtEvent)}
            </span>
          )}
        </span>

        {/* Expand chevron */}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="rounded-lg bg-[#0d1726] border border-[#1a2840] p-2.5 overflow-x-auto">
            <div className="flex items-center gap-1.5 mb-2">
              <Code2 className="h-3 w-3 text-slate-500" />
              <span className="text-[10px] text-slate-500 font-medium">Event Data</span>
            </div>
            <pre className="text-[10px] text-slate-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReplayPanel() {
  // Date selection
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [datesLoading, setDatesLoading] = useState(true)
  const [datesError, setDatesError] = useState<string | null>(null)

  // Session data
  const [session, setSession] = useState<ReplaySession | null>(null)
  const [stats, setStats] = useState<ReplayStats | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  // Playback state
  const [currentEventIndex, setCurrentEventIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)

  // Refs
  const playIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const activeEventRef = useRef<HTMLDivElement>(null)

  // ── Load available dates ────────────────────────────────────────────────────

  useEffect(() => {
    async function loadDates() {
      setDatesLoading(true)
      setDatesError(null)
      try {
        const res = await fetch('/api/spx/replay?action=dates')
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'Failed to load dates')
        const dates: string[] = data.dates ?? []
        setAvailableDates(dates)
        if (dates.length > 0) setSelectedDate(dates[0])
      } catch (err: any) {
        setDatesError(err.message)
      } finally {
        setDatesLoading(false)
      }
    }
    loadDates()
  }, [])

  // ── Scroll active event into view ───────────────────────────────────────────

  useEffect(() => {
    if (activeEventRef.current) {
      activeEventRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentEventIndex])

  // ── Playback ticker ─────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current != null) {
      clearTimeout(playIntervalRef.current)
      playIntervalRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const scheduleNext = useCallback((fromIndex: number, totalEvents: number, speedVal: number) => {
    if (fromIndex >= totalEvents - 1) {
      setIsPlaying(false)
      return
    }
    playIntervalRef.current = setTimeout(() => {
      setCurrentEventIndex(prev => {
        const next = prev + 1
        if (next >= totalEvents - 1) {
          setIsPlaying(false)
          return Math.min(next, totalEvents - 1)
        }
        scheduleNext(next, totalEvents, speedVal)
        return next
      })
    }, Math.round(1000 / speedVal))
  }, [])

  useEffect(() => {
    if (!isPlaying || !session) return
    const total = session.events.length
    scheduleNext(currentEventIndex, total, speed)
    return () => {
      if (playIntervalRef.current != null) clearTimeout(playIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  // ── Load session ────────────────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    if (!selectedDate) return
    stopPlayback()
    setSessionLoading(true)
    setSessionError(null)
    setSession(null)
    setStats(null)
    setCurrentEventIndex(-1)

    try {
      const res = await fetch(`/api/spx/replay?action=session&date=${selectedDate}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load session')
      setSession(data.session)
      setStats(data.stats)
      setCurrentEventIndex(data.session.events.length > 0 ? 0 : -1)
    } catch (err: any) {
      setSessionError(err.message)
    } finally {
      setSessionLoading(false)
    }
  }, [selectedDate, stopPlayback])

  // ── Playback controls ────────────────────────────────────────────────────────

  function handleReset() {
    stopPlayback()
    setCurrentEventIndex(session && session.events.length > 0 ? 0 : -1)
  }

  function handleStepBack() {
    stopPlayback()
    setCurrentEventIndex(i => Math.max(0, i - 1))
  }

  function handlePlayPause() {
    if (!session || session.events.length === 0) return
    if (isPlaying) {
      stopPlayback()
      return
    }
    // If at end, restart from beginning
    let startIndex = currentEventIndex
    if (startIndex >= session.events.length - 1) {
      startIndex = 0
      setCurrentEventIndex(0)
    }
    setIsPlaying(true)
  }

  function handleStepForward() {
    stopPlayback()
    if (!session) return
    setCurrentEventIndex(i => Math.min(session.events.length - 1, i + 1))
  }

  function handleJumpEnd() {
    stopPlayback()
    if (!session) return
    setCurrentEventIndex(session.events.length - 1)
  }

  function handleSpeedChange(s: number) {
    setSpeed(s)
    if (isPlaying) {
      // restart playback loop with new speed
      if (playIntervalRef.current != null) clearTimeout(playIntervalRef.current)
      if (session) scheduleNext(currentEventIndex, session.events.length, s)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const openToClose = stats?.openToClose ?? null
  const ocPositive = openToClose != null && openToClose >= 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Play className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-slate-200 leading-none">Session Replay</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Review historical trading sessions event by event</p>
          </div>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              disabled={datesLoading || availableDates.length === 0}
              className="appearance-none h-8 pl-3 pr-8 rounded-lg bg-[#0d1726] border border-[#1a2840] text-slate-300 text-[11px] font-medium focus:outline-none focus:border-blue-500/40 disabled:opacity-50 cursor-pointer"
            >
              {datesLoading && <option>Loading dates…</option>}
              {!datesLoading && availableDates.length === 0 && <option>No dates available</option>}
              {availableDates.map(d => (
                <option key={d} value={d}>{fmtDate(d)}</option>
              ))}
            </select>
            <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          </div>

          <button
            onClick={loadSession}
            disabled={!selectedDate || sessionLoading}
            className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {sessionLoading ? (
              <>
                <Activity className="h-3.5 w-3.5 animate-pulse" />
                Loading…
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Load Session
              </>
            )}
          </button>
        </div>
      </div>

      {/* Errors */}
      {datesError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 flex items-center gap-2 text-red-400 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {datesError}
        </div>
      )}
      {sessionError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 flex items-center gap-2 text-red-400 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {sessionError}
        </div>
      )}

      {/* ── Session Summary Bar ── */}
      {session && (
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">

            {/* Open → Close */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SPX</span>
              <span className="text-[12px] font-mono text-slate-200">
                {fmtPrice(session.tradingDayOpen)} → {fmtPrice(session.tradingDayClose)}
              </span>
              {openToClose != null && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  ocPositive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {ocPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {fmtPct(openToClose)}
                </span>
              )}
            </div>

            <div className="h-4 w-px bg-[#1a2840]" />

            {/* High / Low / Range */}
            <div className="flex items-center gap-4 text-[11px]">
              <span>
                <span className="text-slate-500 text-[10px] mr-1">H</span>
                <span className="text-emerald-400 font-mono">{fmtPrice(session.tradingDayHigh)}</span>
              </span>
              <span>
                <span className="text-slate-500 text-[10px] mr-1">L</span>
                <span className="text-red-400 font-mono">{fmtPrice(session.tradingDayLow)}</span>
              </span>
              <span>
                <span className="text-slate-500 text-[10px] mr-1">Range</span>
                <span className="text-slate-300 font-mono">{fmtPrice(session.sessionRange)}</span>
              </span>
            </div>

            <div className="h-4 w-px bg-[#1a2840]" />

            {/* Signals / Trades / W-L */}
            <div className="flex items-center gap-4 text-[11px]">
              <span>
                <span className="text-slate-500 text-[10px] mr-1">Signals</span>
                <span className="text-blue-400 font-mono font-semibold">{session.signalCount}</span>
              </span>
              <span>
                <span className="text-slate-500 text-[10px] mr-1">Trades</span>
                <span className="text-slate-300 font-mono font-semibold">{session.tradeCount}</span>
              </span>
              {stats && (
                <span>
                  <span className="text-emerald-400 font-mono font-semibold">{stats.wins}W</span>
                  <span className="text-slate-500 mx-0.5">/</span>
                  <span className="text-red-400 font-mono font-semibold">{stats.losses}L</span>
                </span>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Replay Controls ── */}
      {session && (
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] px-4 py-3 flex flex-wrap items-center gap-3">

          {/* Transport buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              title="Reset to start"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#1a2840] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleStepBack}
              title="Step back"
              disabled={currentEventIndex <= 0}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#1a2840] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handlePlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25 text-blue-400 transition-all"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={handleStepForward}
              title="Step forward"
              disabled={!session || currentEventIndex >= session.events.length - 1}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#1a2840] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={handleJumpEnd}
              title="Jump to end"
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#1a2840] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-[#1a2840]" />

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500 mr-1">Speed</span>
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`h-6 px-2 rounded text-[10px] font-medium transition-all ${
                  speed === s
                    ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400'
                    : 'bg-transparent border border-[#1a2840] text-slate-500 hover:text-slate-300 hover:border-slate-500/30'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium tabular-nums">
              Event{' '}
              <span className="text-slate-200 font-semibold">{currentEventIndex + 1}</span>
              <span className="text-slate-600"> / </span>
              <span className="text-slate-400">{session.events.length}</span>
            </span>
            {isPlaying && (
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            )}
          </div>

        </div>
      )}

      {/* ── Main Content: Chart + Timeline ── */}
      {session && (
        <div className="grid grid-cols-5 gap-4">

          {/* Left: Price Chart (60%) */}
          <div className="col-span-3 rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Price Chart
              </span>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                {(['signal','trade_open','trade_close','wall_snapshot'] as const).map(type => (
                  <span key={type} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: EVENT_COLORS[type] }}
                    />
                    {type.replace('_',' ')}
                  </span>
                ))}
              </div>
            </div>

            <div className="w-full overflow-hidden">
              <PriceChart
                bars={session.bars}
                events={session.events}
                activeEventIndex={currentEventIndex}
              />
            </div>

            {/* Progress bar */}
            {session.events.length > 0 && (
              <div className="relative h-1 rounded-full bg-[#1a2840] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60 transition-all duration-300"
                  style={{
                    width: `${((currentEventIndex + 1) / session.events.length) * 100}%`
                  }}
                />
              </div>
            )}
          </div>

          {/* Right: Event Timeline (40%) */}
          <div className="col-span-2 rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Event Timeline
              </span>
              <span className="text-[10px] text-slate-500">{session.totalEvents} events</span>
            </div>

            {session.events.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-[11px]">
                No events recorded for this session
              </div>
            ) : (
              <div
                ref={timelineRef}
                className="flex-1 overflow-y-auto space-y-1.5 pr-1"
                style={{ maxHeight: '400px' }}
              >
                {session.events.map((evt, idx) => (
                  <div
                    key={evt.id}
                    ref={idx === currentEventIndex ? activeEventRef : undefined}
                  >
                    <EventRow
                      event={evt}
                      isActive={idx === currentEventIndex}
                      index={idx}
                      onClick={() => { stopPlayback(); setCurrentEventIndex(idx) }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stats Section ── */}
      {session && stats && (
        <div className="grid grid-cols-2 gap-4">

          {/* Day Stats */}
          <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Day Statistics</span>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 p-2.5 space-y-1">
                <p className="text-[10px] text-slate-500">Open→Close</p>
                <p className={`text-[13px] font-semibold font-mono ${
                  openToClose == null ? 'text-slate-500' : openToClose >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {fmtPct(openToClose)}
                </p>
              </div>
              <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 p-2.5 space-y-1">
                <p className="text-[10px] text-slate-500">Max Drawdown</p>
                <p className="text-[13px] font-semibold font-mono text-red-400">
                  {stats.maxDrawdown != null ? fmtPct(stats.maxDrawdown) : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 p-2.5 space-y-1">
                <p className="text-[10px] text-slate-500">Volatility</p>
                <p className="text-[13px] font-semibold font-mono text-amber-400">
                  {stats.volatilityProxy != null ? stats.volatilityProxy.toFixed(3) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Session Stats */}
          <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Session Statistics</span>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 p-2.5 space-y-1">
                <p className="text-[10px] text-slate-500">Signals</p>
                <p className="text-[13px] font-semibold font-mono text-blue-400">{stats.signalCount}</p>
                <p className="text-[10px] text-slate-600">{stats.actionableSignals} actionable</p>
              </div>
              <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 p-2.5 space-y-1">
                <p className="text-[10px] text-slate-500">Trades</p>
                <p className="text-[13px] font-semibold font-mono text-slate-200">
                  {stats.tradesOpened} <span className="text-slate-500 text-[10px]">opened</span>
                </p>
                <p className="text-[10px] text-slate-600">{stats.tradesClosed} closed</p>
              </div>
              <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 p-2.5 space-y-1">
                <p className="text-[10px] text-slate-500">Outcome</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[13px] font-semibold font-mono text-emerald-400">{stats.wins}W</span>
                  <span className="text-slate-600 text-[11px]">/</span>
                  <span className="text-[13px] font-semibold font-mono text-red-400">{stats.losses}L</span>
                </div>
                {(stats.wins + stats.losses) > 0 && (
                  <p className="text-[10px] text-slate-600">
                    {((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(0)}% win rate
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Empty state – no session loaded yet */}
      {!session && !sessionLoading && !sessionError && (
        <div className="rounded-xl border border-dashed border-[#1a2840] bg-[#070e1a] p-12 flex flex-col items-center justify-center gap-3 text-center">
          <div className="h-12 w-12 rounded-xl bg-[#0d1726] border border-[#1a2840] flex items-center justify-center">
            <Play className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            {availableDates.length === 0 && !datesLoading ? (
              <>
                <p className="text-[13px] text-slate-400 font-medium">No replay sessions available yet</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Sessions are built from stored signals. Run the Live Engine to generate signals,<br />
                  then return here to replay past trading days.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-slate-400 font-medium">No session loaded</p>
                <p className="text-[11px] text-slate-600 mt-1">Select a date and click "Load Session" to begin replay</p>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
