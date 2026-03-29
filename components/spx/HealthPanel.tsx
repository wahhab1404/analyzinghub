'use client'

/**
 * components/spx/HealthPanel.tsx
 *
 * Operational health and monitoring panel for the SPX Intelligence Engine.
 * Auto-refreshes every 30 seconds, displays engine status, data feed health,
 * storage, Telegram, data quality, run history, and metric buckets.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Database, Radio, Send, ShieldCheck, Clock, TrendingUp,
  Zap, BarChart2, Minus, Wifi, WifiOff,
} from 'lucide-react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineHealth {
  isRunning: boolean
  lastRunAt: string | null
  runsLast24h: number
  errorCount24h: number
  successRate24h: number
  lastError: string | null
  marketMode: string | null
  underlyingPrice: number | null
  updatedAt: string | null
}

interface PolygonHealth {
  configured: boolean
  lastPriceAt: string | null
  isStale: boolean
  staleThresholdS: number
}

interface SupabaseHealth {
  connected: boolean
  priceHistoryCount: number
  lastPriceAt: string | null
  openTrades: number
}

interface TelegramHealth {
  configured: boolean
  channelCount: number
  alertsToday: number
  lastAlertAt: string | null
}

interface DataQualityHealth {
  grade: 'high' | 'medium' | 'low' | 'offline'
  lastSignalAt: string | null
  signalsToday: number
  warnings: string[]
}

interface EngineRun {
  runAt: string
  durationMs: number | null
  status: 'success' | 'error' | 'timeout'
  signal: string | null
  marketMode: string | null
  price: number | null
  error?: string | null
}

interface HealthData {
  success: boolean
  checkedAt: string
  status: 'healthy' | 'degraded' | 'error' | 'offline'
  engine: EngineHealth
  polygon: PolygonHealth
  supabase: SupabaseHealth
  telegram: TelegramHealth
  dataQuality: DataQualityHealth
  recentRuns?: EngineRun[]
  hourlyBuckets?: { hour: string; successRate: number; runs: number }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: string | null): string {
  if (!ts) return '—'
  try { return formatDistanceToNow(parseISO(ts), { addSuffix: true }) } catch { return ts }
}

function fmtPrice(p: number | null): string {
  if (p == null) return '—'
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  try { return format(parseISO(ts), 'HH:mm:ss') } catch { return ts }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

type OverallStatus = 'healthy' | 'degraded' | 'error' | 'offline'

const STATUS_STYLES: Record<OverallStatus, { badge: string; dot: string; label: string }> = {
  healthy:  { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400', label: 'HEALTHY' },
  degraded: { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       dot: 'bg-amber-400',   label: 'DEGRADED' },
  error:    { badge: 'bg-red-500/10 text-red-400 border-red-500/20',             dot: 'bg-red-400',     label: 'ERROR' },
  offline:  { badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',       dot: 'bg-slate-500',   label: 'OFFLINE' },
}

function StatusBadge({ status }: { status: OverallStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === 'healthy' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  )
}

// ─── Bool Badge ───────────────────────────────────────────────────────────────

function BoolBadge({ value, trueLabel = 'YES', falseLabel = 'NO' }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="h-3 w-3" />{trueLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
      <XCircle className="h-3 w-3" />{falseLabel}
    </span>
  )
}

// ─── Data Quality Grade Badge ─────────────────────────────────────────────────

const GRADE_STYLES: Record<DataQualityHealth['grade'], string> = {
  high:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low:     'bg-red-500/10 text-red-400 border-red-500/20',
  offline: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

function GradeBadge({ grade }: { grade: DataQualityHealth['grade'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${GRADE_STYLES[grade]}`}>
      {grade.toUpperCase()}
    </span>
  )
}

// ─── Mini circle indicator ────────────────────────────────────────────────────

function StatusCircle({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? 'bg-emerald-400' : warn ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${ok ? 'shadow-[0_0_6px_1px_rgba(16,185,129,0.5)]' : ''}`} />
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function StatusCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-[#0d1726] border border-[#1a2840] text-slate-400">
          {icon}
        </div>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[11px] text-slate-300 text-right">{children}</span>
    </div>
  )
}

// ─── Hourly bar chart ─────────────────────────────────────────────────────────

function SuccessRateChart({ buckets }: {
  buckets: { hour: string; successRate: number; runs: number }[]
}) {
  if (!buckets.length) {
    return (
      <div className="text-[11px] text-slate-500 text-center py-4">No run data for the past 24h</div>
    )
  }

  return (
    <div className="space-y-1.5">
      {buckets.map((b, i) => {
        const pct = Math.max(0, Math.min(100, b.successRate))
        const barColor = pct >= 95 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-12 text-[10px] text-slate-500 text-right tabular-nums shrink-0">{b.hour}</span>
            <div className="flex-1 h-4 rounded bg-[#0d1726] border border-[#1a2840] overflow-hidden relative">
              <div
                className={`h-full rounded transition-all duration-500 ${barColor} opacity-70`}
                style={{ width: `${pct}%` }}
              />
              <span className="absolute inset-y-0 right-1 flex items-center text-[9px] text-slate-400 font-mono">
                {pct.toFixed(0)}%
              </span>
            </div>
            <span className="w-12 text-[10px] text-slate-600 tabular-nums shrink-0">
              {b.runs} run{b.runs !== 1 ? 's' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Run history table ────────────────────────────────────────────────────────

function RunHistoryTable({ runs }: { runs: EngineRun[] }) {
  if (!runs.length) {
    return <div className="text-[11px] text-slate-500 text-center py-4">No run history available</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-[#1a2840]">
            {['Time','Duration','Status','Signal','Mode','Price'].map(col => (
              <th key={col} className="px-2 py-1.5 text-left text-slate-500 font-medium uppercase tracking-wider whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1a2840]/60">
          {runs.slice(0, 10).map((run, i) => {
            const isErr = run.status === 'error' || run.status === 'timeout'
            return (
              <tr
                key={i}
                className={`transition-colors ${isErr ? 'bg-red-500/5' : 'hover:bg-[#0d1726]/40'}`}
              >
                <td className="px-2 py-1.5 font-mono text-slate-400 whitespace-nowrap">
                  {fmtTs(run.runAt)}
                </td>
                <td className="px-2 py-1.5 font-mono text-slate-400 whitespace-nowrap">
                  {run.durationMs != null ? `${run.durationMs}ms` : '—'}
                </td>
                <td className="px-2 py-1.5">
                  {run.status === 'success' ? (
                    <span className="text-emerald-400 font-medium">OK</span>
                  ) : run.status === 'timeout' ? (
                    <span className="text-amber-400 font-medium">TIMEOUT</span>
                  ) : (
                    <span className="text-red-400 font-medium">ERR</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-blue-400 whitespace-nowrap max-w-[100px] truncate">
                  {run.signal ?? <span className="text-slate-600">—</span>}
                </td>
                <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">
                  {run.marketMode ?? <span className="text-slate-600">—</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-slate-300 whitespace-nowrap">
                  {run.price != null ? fmtPrice(run.price) : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HealthPanel() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [spinRefresh, setSpinRefresh] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async (isManual = false) => {
    if (isManual) { setSpinRefresh(true) }
    setRefreshing(true)
    setError(null)

    try {
      const res = await fetch('/api/spx/health')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const json: HealthData = await res.json()
      setData(json)
      setLastChecked(new Date())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
      if (isManual) setTimeout(() => setSpinRefresh(false), 600)
    }
  }, [])

  // Initial load
  useEffect(() => {
    setLoading(true)
    fetchHealth()
  }, [fetchHealth])

  // Auto-refresh every 30s
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchHealth(), 30_000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchHealth])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
        <Activity className="h-8 w-8 animate-pulse" />
        <p className="text-[12px]">Loading health data…</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-red-400">Failed to load health data</p>
          <p className="text-[11px] text-red-400/70">{error}</p>
          <button
            onClick={() => fetchHealth(true)}
            className="mt-2 text-[11px] text-red-400 hover:text-red-300 underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Guard: data not yet loaded (initial render before useEffect fires)
  if (!data) return null

  const d = data

  // Build synthetic buckets from recentRuns if hourlyBuckets not provided
  const buckets: { hour: string; successRate: number; runs: number }[] = d.hourlyBuckets ?? (() => {
    const runs = d.recentRuns ?? []
    const bucketMap: Record<string, { ok: number; total: number }> = {}
    runs.forEach(r => {
      try {
        const dt = parseISO(r.runAt)
        const h = Math.floor(dt.getHours() / 4) * 4
        const key = `${h.toString().padStart(2,'0')}:00`
        if (!bucketMap[key]) bucketMap[key] = { ok: 0, total: 0 }
        bucketMap[key].total++
        if (r.status === 'success') bucketMap[key].ok++
      } catch {}
    })
    return Object.entries(bucketMap)
      .map(([hour, { ok, total }]) => ({ hour, successRate: total ? (ok / total) * 100 : 0, runs: total }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
  })()

  const recentRuns: EngineRun[] = d.recentRuns ?? []

  const successRatePct = d.engine.successRate24h
  const successRateColor = successRatePct >= 98
    ? 'text-emerald-400' : successRatePct >= 85 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-slate-200 leading-none">Engine Health</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">System diagnostics and operational monitoring</p>
          </div>
        </div>

        {/* Status badge */}
        {d && <StatusBadge status={d.status} />}

        {/* Last checked */}
        {lastChecked && (
          <span className="text-[10px] text-slate-500 tabular-nums">
            {refreshing ? (
              <span className="text-blue-400 animate-pulse">Refreshing…</span>
            ) : (
              `Checked ${formatDistanceToNow(lastChecked, { addSuffix: true })}`
            )}
          </span>
        )}

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(a => !a)}
          className={`h-7 px-2.5 rounded-lg border text-[10px] font-medium transition-all flex items-center gap-1.5 ${
            autoRefresh
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-[#1a2840] bg-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          {autoRefresh ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          Auto 30s
        </button>

        {/* Manual refresh */}
        <button
          onClick={() => fetchHealth(true)}
          disabled={refreshing}
          className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#1a2840] bg-[#0d1726] text-slate-400 hover:text-slate-200 hover:border-slate-500/30 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${spinRefresh ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-center gap-2 text-amber-400 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Last refresh failed: {error} — showing cached data
        </div>
      )}

      {/* ── Status Cards Row ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

        {/* 1. Intelligence Engine */}
        <StatusCard title="Intelligence Engine" icon={<Zap className="h-3.5 w-3.5" />}>
          {/* Big status circle */}
          <div className="flex items-center gap-2.5">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
              d.engine.isRunning
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : d.engine.errorCount24h > 5
                  ? 'border-red-500/50 bg-red-500/10'
                  : 'border-amber-500/50 bg-amber-500/10'
            }`}>
              <StatusCircle
                ok={d.engine.isRunning}
                warn={!d.engine.isRunning && d.engine.errorCount24h <= 5}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-200">
                {d.engine.isRunning ? 'Running' : 'Idle'}
              </p>
              <p className="text-[10px] text-slate-500">
                Last run: {relativeTime(d.engine.lastRunAt)}
              </p>
            </div>
          </div>

          <MetaRow label="Runs (24h)">
            <span className="font-mono text-slate-200">{d.engine.runsLast24h}</span>
          </MetaRow>
          <MetaRow label="Errors (24h)">
            <span className={`font-mono ${d.engine.errorCount24h > 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {d.engine.errorCount24h}
            </span>
          </MetaRow>
          <MetaRow label="Success Rate">
            <span className={`font-mono font-semibold ${successRateColor}`}>
              {successRatePct.toFixed(1)}%
            </span>
          </MetaRow>
          {d.engine.marketMode && (
            <MetaRow label="Market Mode">
              <span className="text-blue-400">{d.engine.marketMode}</span>
            </MetaRow>
          )}
          {d.engine.underlyingPrice != null && (
            <MetaRow label="SPX Price">
              <span className="font-mono text-slate-200">{fmtPrice(d.engine.underlyingPrice)}</span>
            </MetaRow>
          )}
          {d.engine.lastError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5 mt-1">
              <p className="text-[10px] text-red-400/80 leading-snug truncate" title={d.engine.lastError}>
                {d.engine.lastError}
              </p>
            </div>
          )}
        </StatusCard>

        {/* 2. Polygon Data Feed */}
        <StatusCard title="Polygon Data Feed" icon={<Radio className="h-3.5 w-3.5" />}>
          <MetaRow label="Configured">
            <BoolBadge value={d.polygon.configured} />
          </MetaRow>
          <MetaRow label="Last Price">
            <span className="text-slate-300">{relativeTime(d.polygon.lastPriceAt)}</span>
          </MetaRow>
          <MetaRow label="Feed Status">
            {d.polygon.isStale ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="h-3 w-3" />STALE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />LIVE
              </span>
            )}
          </MetaRow>
          <MetaRow label="Stale Threshold">
            <span className="font-mono text-slate-400">{d.polygon.staleThresholdS}s</span>
          </MetaRow>
        </StatusCard>

        {/* 3. Supabase / Storage */}
        <StatusCard title="Supabase / Storage" icon={<Database className="h-3.5 w-3.5" />}>
          <MetaRow label="Connected">
            <BoolBadge value={d.supabase.connected} />
          </MetaRow>
          <MetaRow label="Price History">
            <span className="font-mono text-slate-300">
              {d.supabase.priceHistoryCount.toLocaleString()} rows
            </span>
          </MetaRow>
          <MetaRow label="Last Write">
            <span className="text-slate-300">{relativeTime(d.supabase.lastPriceAt)}</span>
          </MetaRow>
          <MetaRow label="Open Trades">
            <span className={`font-mono font-semibold ${d.supabase.openTrades > 0 ? 'text-blue-400' : 'text-slate-400'}`}>
              {d.supabase.openTrades}
            </span>
          </MetaRow>
        </StatusCard>

        {/* 4. Telegram Alerts */}
        <StatusCard title="Telegram Alerts" icon={<Send className="h-3.5 w-3.5" />}>
          <MetaRow label="Configured">
            <BoolBadge value={d.telegram.configured} />
          </MetaRow>
          <MetaRow label="Channels">
            <span className="font-mono text-slate-300">{d.telegram.channelCount} active</span>
          </MetaRow>
          <MetaRow label="Alerts Today">
            <span className={`font-mono font-semibold ${d.telegram.alertsToday > 0 ? 'text-blue-400' : 'text-slate-400'}`}>
              {d.telegram.alertsToday}
            </span>
          </MetaRow>
          <MetaRow label="Last Alert">
            <span className="text-slate-300">{relativeTime(d.telegram.lastAlertAt)}</span>
          </MetaRow>
        </StatusCard>

      </div>

      {/* ── Data Quality Section ── */}
      <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Data Quality</span>
          </div>
          <GradeBadge grade={d.dataQuality.grade} />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span>
            <span className="text-slate-500 text-[10px] mr-1.5">Signals Today</span>
            <span className="text-blue-400 font-mono font-semibold">{d.dataQuality.signalsToday}</span>
          </span>
          <span>
            <span className="text-slate-500 text-[10px] mr-1.5">Last Signal</span>
            <span className="text-slate-300">{relativeTime(d.dataQuality.lastSignalAt)}</span>
          </span>
        </div>

        {d.dataQuality.warnings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.dataQuality.warnings.map((w, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {w}
              </span>
            ))}
          </div>
        )}
        {d.dataQuality.warnings.length === 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
            <CheckCircle2 className="h-3 w-3" />
            No warnings
          </div>
        )}
      </div>

      {/* ── Run History + Metrics (2 cols) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Engine Run History */}
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Engine Run History
            </span>
            <span className="text-[10px] text-slate-600 ml-auto">Last {Math.min(10, recentRuns.length)} runs</span>
          </div>
          <RunHistoryTable runs={recentRuns} />
        </div>

        {/* Operational Metrics */}
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Success Rate (24h)
            </span>
            <span className="text-[10px] text-slate-600 ml-auto">by 4-hour bucket</span>
          </div>

          {buckets.length > 0 ? (
            <SuccessRateChart buckets={buckets} />
          ) : (
            <div className="space-y-3">
              {/* Fallback: synthesize 6 equal buckets from aggregate stats */}
              {Array.from({ length: 6 }, (_, i) => {
                const h = (i * 4).toString().padStart(2,'0')
                const label = `${h}:00`
                const pct = d.engine.successRate24h
                const approxRuns = Math.floor(d.engine.runsLast24h / 6)
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-12 text-[10px] text-slate-500 text-right tabular-nums shrink-0">{label}</span>
                    <div className="flex-1 h-4 rounded bg-[#0d1726] border border-[#1a2840] overflow-hidden relative">
                      <div
                        className={`h-full rounded transition-all duration-500 ${
                          pct >= 95 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
                        } opacity-70`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-y-0 right-1 flex items-center text-[9px] text-slate-400 font-mono">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <span className="w-12 text-[10px] text-slate-600 tabular-nums shrink-0">
                      ~{approxRuns} runs
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Summary row */}
          <div className="rounded-lg border border-[#1a2840] bg-[#0d1726]/60 px-3 py-2 flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-500">24h aggregate</span>
            <div className="flex items-center gap-4 text-[11px]">
              <span>
                <span className="text-slate-500 text-[10px] mr-1">Runs</span>
                <span className="font-mono text-slate-300 font-semibold">{d.engine.runsLast24h}</span>
              </span>
              <span>
                <span className="text-slate-500 text-[10px] mr-1">Errors</span>
                <span className={`font-mono font-semibold ${d.engine.errorCount24h > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {d.engine.errorCount24h}
                </span>
              </span>
              <span>
                <span className="text-slate-500 text-[10px] mr-1">Rate</span>
                <span className={`font-mono font-semibold ${successRateColor}`}>
                  {d.engine.successRate24h.toFixed(1)}%
                </span>
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
