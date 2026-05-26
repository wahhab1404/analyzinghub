'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, XCircle, Info, ChevronRight,
  BarChart3, Activity, Zap, Clock, Database, ArrowUpRight,
  ArrowDownRight, Loader2, BookOpen, Search, Building2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, Cell, LineChart, Line, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { STATES, STATE_CONFIG, type MarketState, type NeuralAnalysisResult, type AdaptiveThresholds } from '@/lib/neural-analysis/computations'
import { useTranslation, useLanguage } from '@/lib/i18n/language-context'

function stateLabel(state: MarketState, language: string) {
  const cfg = STATE_CONFIG[state]
  return language === 'ar' ? cfg.labelAr : cfg.label
}

function adaptiveThresholdLabel(state: MarketState, t: AdaptiveThresholds): string {
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`
  switch (state) {
    case 'Strong_Up':   return `> ${fmt(t.upStrong)}`
    case 'Up':          return `${fmt(t.up)} → ${fmt(t.upStrong)}`
    case 'Sideways':    return `${fmt(t.down)} → ${fmt(t.up)}`
    case 'Down':        return `${fmt(t.downStrong)} → ${fmt(t.down)}`
    case 'Strong_Down': return `< ${fmt(t.downStrong)}`
  }
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface SearchResult {
  symbol: string
  name: string
  type: string
  exchange: string
}

interface QuoteData {
  symbol: string
  price: number
  change?: number
  changePercent?: number
  high?: number
  low?: number
  volume?: number
  marketStatus?: string
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEFAULT_SYMBOLS = [
  { key: 'SPX', label: 'S&P 500', sublabel: 'SPX500' },
  { key: 'NDX', label: 'NASDAQ', sublabel: 'NDX100' },
  { key: 'DJI', label: 'Dow Jones', sublabel: 'DJI30' },
  { key: 'VIX', label: 'VIX', sublabel: 'Volatility' },
]

const TIMEFRAME_KEYS = [
  { key: '1d', sublabel: '1D', tfKey: 'daily' as const, descKey: 'dailyDesc' as const },
  { key: '4h', sublabel: '4H', tfKey: 'fourHour' as const, descKey: 'fourHourDesc' as const },
  { key: '1h', sublabel: '1H', tfKey: 'oneHour' as const, descKey: 'oneHourDesc' as const },
]

const FEATURE_META: Record<string, { label: string; labelAr: string; description: string; descriptionAr: string; icon: string }> = {
  return_1d:     { label: '1-Day Return',           labelAr: 'العائد اليومي',          description: 'Daily percentage return — stationary by construction', descriptionAr: 'العائد اليومي المئوي — ثابت بالتصميم', icon: '📈' },
  return_5d:     { label: '5-Day Return',            labelAr: 'عائد 5 أيام',            description: '5-day cumulative return', descriptionAr: 'العائد التراكمي لـ 5 أيام', icon: '📊' },
  return_20d:    { label: '20-Day Return',           labelAr: 'عائد 20 يوم',            description: '20-day cumulative return', descriptionAr: 'العائد التراكمي لـ 20 يومًا', icon: '📉' },
  vol_ratio:     { label: 'Volatility Ratio (5/20)', labelAr: 'نسبة التقلب',            description: 'Short-term vol vs long-term vol — regime indicator', descriptionAr: 'التقلب قصير الأمد مقابل طويل الأمد — مؤشر النظام', icon: '⚡' },
  momentum_norm: { label: 'Normalized Momentum',     labelAr: 'الزخم المُعدَّل',        description: 'Return scaled by realized volatility σ — risk-adjusted signal', descriptionAr: 'العائد مقسومًا على التقلب المحقق σ — إشارة معدّلة بالمخاطر', icon: '🚀' },
  volume_zscore: { label: 'Volume Z-Score',          labelAr: 'انحراف الحجم المعياري',  description: '(Volume − 20d mean) / 20d std — unusual volume detector', descriptionAr: '(الحجم − متوسط 20 يومًا) / انحراف 20 يومًا — كاشف حجم غير عادي', icon: '🔊' },
  sma_ratio:     { label: 'SMA Ratio (5/20)',        labelAr: 'نسبة المتوسطات',         description: 'SMA5/SMA20 - 1 — trend direction indicator', descriptionAr: 'SMA5/SMA20 - 1 — مؤشر اتجاه الترند', icon: '〰️' },
  range_norm:    { label: 'Normalized Range',        labelAr: 'النطاق المُعيَّر',       description: 'Daily H-L range relative to 20d average', descriptionAr: 'النطاق اليومي H-L نسبة إلى متوسط 20 يومًا', icon: '↕️' },
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StateIcon({ state }: { state: MarketState }) {
  if (state === 'Strong_Up' || state === 'Up') return <TrendingUp className="h-4 w-4" style={{ color: STATE_CONFIG[state].color }} />
  if (state === 'Strong_Down' || state === 'Down') return <TrendingDown className="h-4 w-4" style={{ color: STATE_CONFIG[state].color }} />
  return <Minus className="h-4 w-4" style={{ color: STATE_CONFIG[state].color }} />
}

function StateBadge({ state, size = 'md' }: { state: MarketState; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = STATE_CONFIG[state]
  const { language } = useLanguage()
  const sizes = { sm: 'text-[10px] px-1.5 py-0.5', md: 'text-xs px-2 py-1', lg: 'text-sm px-3 py-1.5' }
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full font-semibold border', sizes[size])}
      style={{ color: cfg.color, borderColor: cfg.color + '40', backgroundColor: cfg.bgColor }}
    >
      <StateIcon state={state} />
      {stateLabel(state, language)}
    </span>
  )
}

function ProbBar({ value, state, highlight = false }: { value: number; state: MarketState; highlight?: boolean }) {
  const cfg = STATE_CONFIG[state]
  const { language } = useLanguage()
  const pct = Math.round(value * 100)
  return (
    <div className={cn('group flex items-center gap-3 p-2.5 rounded-lg transition-all', highlight && 'bg-white/5')}>
      <div className="w-24 text-right">
        <span className="text-xs font-medium" style={{ color: cfg.color }}>{stateLabel(state, language)}</span>
      </div>
      <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: cfg.color, opacity: 0.85 }}
        />
      </div>
      <div className="w-12 text-right">
        <span className="text-sm font-bold tabular-nums text-foreground/80">{pct}%</span>
      </div>
    </div>
  )
}

function TransitionMatrix({ matrix }: { matrix: number[][] }) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const na = t.neuralAnalysis
  const maxVal = Math.max(...matrix.flat())

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-muted-foreground font-normal text-left">{na.matrix.fromTo}</th>
            {STATES.map(s => (
              <th key={s} className="p-2 text-center font-semibold" style={{ color: STATE_CONFIG[s].color }}>
                {stateLabel(s, language)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATES.map((fromState, i) => (
            <tr key={fromState} className="border-t border-white/5">
              <td className="p-2 font-semibold whitespace-nowrap" style={{ color: STATE_CONFIG[fromState].color }}>
                {stateLabel(fromState, language)}
              </td>
              {STATES.map((toState, j) => {
                const val = matrix[i]?.[j] ?? 0
                const intensity = maxVal > 0 ? val / maxVal : 0
                const isDiagonal = i === j
                return (
                  <td
                    key={toState}
                    className="p-2 text-center font-mono font-semibold rounded"
                    style={{
                      backgroundColor: `${STATE_CONFIG[toState].color}${Math.round(intensity * 55).toString(16).padStart(2, '0')}`,
                      color: intensity > 0.5 ? '#fff' : STATE_CONFIG[toState].color,
                      border: isDiagonal ? `1px solid ${STATE_CONFIG[fromState].color}60` : 'none',
                    }}
                  >
                    {(val * 100).toFixed(0)}%
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted-foreground">{na.matrix.rowsSum}</p>
    </div>
  )
}

function FeatureCard({ featureKey, result }: { featureKey: string; result: { value: number | null; stationary: boolean; adfStatistic: number; pValue: number } }) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const na = t.neuralAnalysis
  const isAr = language === 'ar'

  const meta = FEATURE_META[featureKey]
  const { value, stationary, adfStatistic, pValue } = result
  const displayVal = value !== null ? (Math.abs(value) < 0.01 ? value.toFixed(4) : value.toFixed(3)) : '—'
  const isPositive = value !== null && value > 0
  const isNegative = value !== null && value < 0

  const primaryLabel = isAr ? (meta?.labelAr ?? featureKey) : (meta?.label ?? featureKey)
  const secondaryLabel = isAr ? (meta?.label ?? featureKey) : (meta?.labelAr ?? featureKey)
  const desc = isAr ? (meta?.descriptionAr ?? meta?.description ?? '') : (meta?.description ?? '')

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="group flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-card hover:bg-white/3 transition-all cursor-default">
            <span className="text-lg">{meta?.icon ?? '📊'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground/80 truncate">{primaryLabel}</p>
              <p className="text-[10px] text-muted-foreground truncate">{secondaryLabel}</p>
            </div>
            <div className="text-right">
              <p className={cn(
                'text-sm font-bold tabular-nums',
                isPositive && 'text-emerald-400',
                isNegative && 'text-red-400',
                !isPositive && !isNegative && 'text-foreground/60',
              )}>
                {isPositive && '+'}{displayVal}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {stationary ? (
                <div className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">{na.features.stationaryLabel}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-semibold">{na.features.nonStatLabel}</span>
                </div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="font-semibold">{primaryLabel}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
            <div className="pt-1 border-t border-border space-y-0.5">
              <p className="text-xs">{na.features.adfStatistic} <span className="font-mono">{adfStatistic.toFixed(3)}</span></p>
              <p className="text-xs">{na.features.pValue} <span className="font-mono">{pValue.toFixed(3)}</span></p>
              <p className="text-xs text-muted-foreground">
                {stationary ? na.features.stationaryConfirm : na.features.nonStationaryWarn}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function HistoricalTimeline({ points }: { points: NeuralAnalysisResult['historicalStates'] }) {
  const { language } = useLanguage()
  const recent = points.slice(-120)
  if (recent.length === 0) return null

  const chartData = recent.map(p => ({
    date: p.date,
    close: p.close,
    return: p.return * 100,
    stateIndex: p.stateIndex,
    state: p.state,
  }))

  const stateColors = STATES.map(s => STATE_CONFIG[s].color)

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props
    const color = stateColors[payload.stateIndex] ?? '#94a3b8'
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />
  }

  return (
    <div className="space-y-3">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} interval={Math.floor(recent.length / 6)} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} width={50} tickFormatter={v => v.toLocaleString()} />
            <RechartTooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(val: any) => [`${Number(val).toFixed(2)}`, 'Price']}
            />
            <Line type="monotone" dataKey="close" strokeWidth={1.5} stroke="#6366f1" dot={<CustomDot />} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-0.5 h-4 rounded overflow-hidden">
        {recent.map((p, i) => (
          <div
            key={i}
            className="flex-1 transition-colors"
            style={{ backgroundColor: STATE_CONFIG[p.state].color, opacity: 0.7 }}
            title={`${p.date}: ${STATE_CONFIG[p.state].label} (${(p.return * 100).toFixed(2)}%)`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {STATES.map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATE_CONFIG[s].color }} />
            <span className="text-[10px] text-muted-foreground">{stateLabel(s, language)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TheoryPanel() {
  const { t } = useTranslation()
  const na = t.neuralAnalysis

  return (
    <div className="space-y-4 text-sm">
      {na.theory.items.map(item => (
        <div key={item.title} className="p-3.5 rounded-xl bg-white/3 border border-white/8 hover:bg-white/5 transition-colors">
          <div className="flex items-start gap-2.5">
            <span className="text-base mt-0.5">{item.icon}</span>
            <div>
              <p className="font-semibold text-foreground/90 mb-1">{item.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.content}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SymbolInfoCard({ info, quote }: { info: SearchResult; quote: QuoteData | null }) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const na = t.neuralAnalysis
  const sc = na.symbolCard
  const isAr = language === 'ar'

  const typeLabel: Record<string, string> = {
    Stock: sc.typeStock,
    ETF: sc.typeETF,
    Crypto: sc.typeCrypto,
    Forex: sc.typeForex,
    Index: sc.typeIndex,
  }

  const typeColors: Record<string, string> = {
    Stock: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    ETF: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    Crypto: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    Forex: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    Index: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  }

  const marketStatusLabel: Record<string, string> = {
    open: sc.marketOpen,
    closed: sc.marketClosed,
    'pre-market': sc.preMarket,
    'after-hours': sc.afterHours,
  }

  const typeClass = typeColors[info.type] ?? 'text-muted-foreground bg-white/5 border-white/10'
  const isPositive = (quote?.changePercent ?? 0) >= 0

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-white/8 bg-white/2">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 flex-shrink-0">
          <Building2 className="h-5 w-5 text-violet-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-black text-foreground">{info.symbol}</span>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', typeClass)}>
              {typeLabel[info.type] ?? info.type}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{info.name}</p>
          {info.exchange && info.exchange !== info.type && (
            <p className="text-[10px] text-muted-foreground/60">{info.exchange}</p>
          )}
        </div>
      </div>

      {quote && (
        <div className={cn('flex items-center gap-4 flex-shrink-0', isAr && 'flex-row-reverse')}>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{sc.price}</p>
            <p className="text-base font-black text-foreground tabular-nums">
              {quote.price.toLocaleString(isAr ? 'ar-SA' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          {quote.changePercent !== undefined && (
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{sc.change}</p>
              <p className={cn('text-base font-black tabular-nums flex items-center gap-0.5', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {isPositive ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </p>
            </div>
          )}
          {quote.high !== undefined && (
            <div className="text-center hidden sm:block">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{sc.high}</p>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">{quote.high.toLocaleString()}</p>
            </div>
          )}
          {quote.low !== undefined && (
            <div className="text-center hidden sm:block">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{sc.low}</p>
              <p className="text-sm font-bold text-red-400 tabular-nums">{quote.low.toLocaleString()}</p>
            </div>
          )}
          {quote.marketStatus && (
            <div className={cn(
              'text-[10px] font-semibold px-2 py-1 rounded-full border',
              quote.marketStatus === 'open' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-muted-foreground bg-white/5 border-white/10'
            )}>
              {marketStatusLabel[quote.marketStatus] ?? quote.marketStatus}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function NeuralAnalysisPage() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const na = t.neuralAnalysis

  const [selectedSymbol, setSelectedSymbol] = useState('SPX')
  const [customSymbol, setCustomSymbol] = useState('')
  const [timeframe, setTimeframe] = useState('1d')
  const [result, setResult] = useState<NeuralAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState('prediction')
  const inputRef = useRef<HTMLInputElement>(null)

  // Autocomplete state
  const [autocompleteResults, setAutocompleteResults] = useState<SearchResult[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteLoading, setAutocompleteLoading] = useState(false)
  const [selectedInfo, setSelectedInfo] = useState<SearchResult | null>(null)
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  const runAnalysis = useCallback(async (sym?: string, tf?: string) => {
    const symbol = (sym ?? (customSymbol.trim() || selectedSymbol)).toUpperCase()
    const frame = tf ?? timeframe

    setLoading(true)
    setError(null)

    try {
      const resp = await fetch(`/api/neural-analysis?symbol=${symbol}&timeframe=${frame}`)

      if (!resp.ok) {
        let msg = `Request failed (${resp.status})`
        try { const d = await resp.json(); msg = d.error || msg } catch {}
        throw new Error(msg)
      }

      const data = await resp.json()
      if (data.error) throw new Error(data.error)

      setResult(data)
      setLastUpdated(new Date())
    } catch (err: any) {
      setError(err.message || 'Failed to run analysis')
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol, customSymbol, timeframe])

  const fetchQuote = useCallback(async (sym: string) => {
    try {
      const res = await fetch(`/api/stock-price?symbol=${encodeURIComponent(sym)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.price) setQuote(data)
      }
    } catch {}
  }, [])

  const searchSymbols = useCallback(async (q: string) => {
    if (q.length < 1) {
      setAutocompleteResults([])
      setShowAutocomplete(false)
      return
    }
    setAutocompleteLoading(true)
    try {
      const res = await fetch(`/api/search-symbols?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setAutocompleteResults(data.results?.slice(0, 8) || [])
        setShowAutocomplete(true)
      }
    } catch {}
    setAutocompleteLoading(false)
  }, [])

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (customSymbol.trim().length > 0) {
      searchDebounceRef.current = setTimeout(() => searchSymbols(customSymbol.trim()), 300)
    } else {
      setAutocompleteResults([])
      setShowAutocomplete(false)
    }
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [customSymbol, searchSymbols])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    runAnalysis('SPX', '1d')
  }, [])

  const handleSymbolClick = (sym: string) => {
    setSelectedSymbol(sym)
    setCustomSymbol('')
    setSelectedInfo(null)
    setQuote(null)
    setShowAutocomplete(false)
    runAnalysis(sym, timeframe)
  }

  const handleTimeframeClick = (tf: string) => {
    setTimeframe(tf)
    const sym = customSymbol.trim() || selectedSymbol
    runAnalysis(sym, tf)
  }

  const handleAutocompleteSelect = (item: SearchResult) => {
    setCustomSymbol(item.symbol)
    setSelectedSymbol('')
    setSelectedInfo(item)
    setShowAutocomplete(false)
    setQuote(null)
    fetchQuote(item.symbol)
    runAnalysis(item.symbol, timeframe)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customSymbol.trim()) return
    setSelectedSymbol('')
    setShowAutocomplete(false)
    if (!selectedInfo || selectedInfo.symbol !== customSymbol.trim().toUpperCase()) {
      setSelectedInfo(null)
      setQuote(null)
    }
    runAnalysis(customSymbol.trim(), timeframe)
  }

  const statInfo = result ? STATE_CONFIG[result.currentState] : null
  const stationaryCount = result
    ? Object.values(result.features).filter(f => f.stationary).length
    : 0
  const totalFeatures = result ? Object.keys(result.features).length : 0

  const steadyStateData = result
    ? STATES.map((s, i) => ({
        name: stateLabel(s, language),
        value: Math.round((result.steadyState[i] ?? 0) * 100),
        color: STATE_CONFIG[s].color,
      }))
    : []

  const nextStateData = result
    ? STATES.map((s, i) => ({
        name: stateLabel(s, language),
        prediction: Math.round((result.nextStateProbabilities[i] ?? 0) * 100),
        monteCarlo: Math.round((result.monteCarloDistribution[i] ?? 0) * 100),
        color: STATE_CONFIG[s].color,
      }))
    : []

  return (
    <TooltipProvider>
      <div className="space-y-5 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Brain className="h-6 w-6 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{na.pageTitle}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{na.pageSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                {na.updated} {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => runAnalysis()}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {loading ? na.analyzing : na.refresh}
            </Button>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2">
            {DEFAULT_SYMBOLS.map(sym => (
              <button
                key={sym.key}
                onClick={() => handleSymbolClick(sym.key)}
                className={cn(
                  'flex flex-col items-start px-3.5 py-2 rounded-xl border text-left transition-all',
                  selectedSymbol === sym.key && !customSymbol
                    ? 'bg-violet-500/15 border-violet-500/40 text-white'
                    : 'bg-card border-border text-muted-foreground hover:border-violet-500/30 hover:text-foreground',
                )}
              >
                <span className="text-sm font-bold">{sym.label}</span>
                <span className="text-[10px] opacity-60">{sym.sublabel}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleCustomSubmit} className="flex gap-2 flex-1">
            <div ref={autocompleteRef} className="relative flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  ref={inputRef}
                  value={customSymbol}
                  onChange={e => {
                    setCustomSymbol(e.target.value.toUpperCase())
                    if (selectedInfo && selectedInfo.symbol !== e.target.value.toUpperCase()) {
                      setSelectedInfo(null)
                      setQuote(null)
                    }
                  }}
                  onFocus={() => { if (autocompleteResults.length > 0) setShowAutocomplete(true) }}
                  placeholder={na.customSymbolPlaceholder}
                  className="text-sm h-full min-h-[56px] bg-card border-border placeholder:text-muted-foreground/50 pl-9"
                  autoComplete="off"
                />
                {autocompleteLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {showAutocomplete && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                  {autocompleteResults.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground text-center">{na.noResults}</div>
                  ) : (
                    <ul className="py-1 max-h-64 overflow-y-auto">
                      {autocompleteResults.map((item, idx) => {
                        const typeColors: Record<string, string> = {
                          Stock: 'text-blue-400 bg-blue-400/10',
                          ETF: 'text-purple-400 bg-purple-400/10',
                          Crypto: 'text-amber-400 bg-amber-400/10',
                          Forex: 'text-cyan-400 bg-cyan-400/10',
                          Index: 'text-violet-400 bg-violet-400/10',
                        }
                        const typeLabel: Record<string, string> = {
                          Stock: na.symbolCard.typeStock,
                          ETF: na.symbolCard.typeETF,
                          Crypto: na.symbolCard.typeCrypto,
                          Forex: na.symbolCard.typeForex,
                          Index: na.symbolCard.typeIndex,
                        }
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                              onClick={() => handleAutocompleteSelect(item)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-foreground">{item.symbol}</span>
                                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', typeColors[item.type] ?? 'text-muted-foreground bg-white/5')}>
                                    {typeLabel[item.type] ?? item.type}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{item.name}</p>
                              </div>
                              {item.exchange && (
                                <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{item.exchange}</span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <Button type="submit" variant="outline" className="h-full min-h-[56px] px-4 whitespace-nowrap" disabled={!customSymbol.trim() || loading}>
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              {na.analyze}
            </Button>
          </form>

          <div className="flex gap-1.5 items-start">
            {TIMEFRAME_KEYS.map(tf => (
              <Tooltip key={tf.key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleTimeframeClick(tf.key)}
                    className={cn(
                      'flex flex-col items-center px-3.5 py-2 rounded-xl border text-center transition-all min-w-[52px]',
                      timeframe === tf.key
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-white'
                        : 'bg-card border-border text-muted-foreground hover:border-indigo-500/30',
                    )}
                  >
                    <span className="text-sm font-bold">{tf.sublabel}</span>
                    <span className="text-[9px] opacity-50">{na.timeframes[tf.tfKey]}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">{na.timeframes[tf.descKey]}</p></TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* ── Error State ── */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            <XCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">{na.analysisFailed}</p>
              <p className="text-xs mt-0.5 opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* ── Symbol Info Card ── */}
        {selectedInfo && (
          <SymbolInfoCard info={selectedInfo} quote={quote} />
        )}

        {/* ── Loading skeleton ── */}
        {loading && !result && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-xl bg-white/3 border border-white/8 animate-pulse" />
            ))}
          </div>
        )}

        {result && (
          <>
            {/* ── Current State Banner ── */}
            <div
              className="relative overflow-hidden p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-4"
              style={{
                borderColor: statInfo!.color + '40',
                background: `linear-gradient(135deg, ${statInfo!.color}12, ${statInfo!.color}05)`,
              }}
            >
              <div
                className="absolute inset-0 opacity-5"
                style={{ background: `radial-gradient(circle at 20% 50%, ${statInfo!.color}, transparent 60%)` }}
              />

              <div className="flex items-center gap-3 relative z-10">
                <div className="p-3 rounded-xl" style={{ backgroundColor: statInfo!.color + '20' }}>
                  <StateIcon state={result.currentState} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">{na.banner.currentState}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xl font-black" style={{ color: statInfo!.color }}>
                      {stateLabel(result.currentState, language)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full border font-mono" style={{ color: statInfo!.color, borderColor: statInfo!.color + '40' }}>
                      {adaptiveThresholdLabel(result.currentState, result.adaptiveThresholds)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-6 flex-wrap relative z-10 sm:ml-auto">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{na.banner.symbol}</p>
                  <p className="text-lg font-black text-foreground">{result.symbol}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{na.banner.lastReturn}</p>
                  <p className={cn('text-lg font-black', result.currentReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {result.currentReturn >= 0 ? '+' : ''}{(result.currentReturn * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{na.banner.dataPoints}</p>
                  <p className="text-lg font-black text-foreground">{result.dataPoints.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{na.banner.timeframe}</p>
                  <p className="text-lg font-black text-foreground uppercase">{result.timeframe}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{na.banner.stationary}</p>
                  <p className={cn('text-lg font-black', stationaryCount === totalFeatures ? 'text-emerald-400' : 'text-amber-400')}>
                    {stationaryCount}/{totalFeatures}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Main Tabs ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-card border border-border h-auto p-1 gap-1">
                {[
                  { key: 'prediction', label: na.tabs.prediction,  icon: <Zap className="h-3.5 w-3.5" /> },
                  { key: 'matrix',     label: na.tabs.matrix,      icon: <BarChart3 className="h-3.5 w-3.5" /> },
                  { key: 'features',   label: na.tabs.features,    icon: <Activity className="h-3.5 w-3.5" /> },
                  { key: 'history',    label: na.tabs.history,     icon: <Clock className="h-3.5 w-3.5" /> },
                  { key: 'theory',     label: na.tabs.theory,      icon: <BookOpen className="h-3.5 w-3.5" /> },
                ].map(tab => (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="flex items-center gap-1.5 text-xs data-[state=active]:bg-violet-500/20 data-[state=active]:text-white"
                  >
                    {tab.icon}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* ── TAB: Prediction ── */}
              <TabsContent value="prediction" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-violet-400" />
                        {na.prediction.nextState}
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {na.prediction.nextStateTooltip}
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {na.prediction.fromCurrent} <StateBadge state={result.currentState} size="sm" />
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {STATES.map((s, i) => (
                        <ProbBar
                          key={s}
                          value={result.nextStateProbabilities[i] ?? 0}
                          state={s}
                          highlight={s === result.currentState}
                        />
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Database className="h-4 w-4 text-indigo-400" />
                        {na.prediction.monteCarlo}
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {na.prediction.monteCarloTooltip}
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{na.prediction.simulationVerification}</p>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {STATES.map((s, i) => (
                        <ProbBar key={s} value={result.monteCarloDistribution[i] ?? 0} state={s} />
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-400" />
                        {na.prediction.steadyState}
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {na.prediction.steadyStateTooltip}
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{na.prediction.longRunEquilibrium}</p>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {STATES.map((s, i) => (
                        <ProbBar key={s} value={result.steadyState[i] ?? 0} state={s} />
                      ))}
                    </CardContent>
                  </Card>

                </div>

                <Card className="mt-4 bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{na.prediction.distributionComparison}</CardTitle>
                    <p className="text-xs text-muted-foreground">{na.prediction.distributionComparisonDesc}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={nextStateData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" />
                          <RechartTooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                            formatter={(val, name) => [`${val}%`, name]}
                          />
                          <Bar dataKey="prediction" name={na.prediction.nextStateLabel} radius={[3, 3, 0, 0]}>
                            {nextStateData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} opacity={0.9} />
                            ))}
                          </Bar>
                          <Bar dataKey="monteCarlo" name={na.prediction.monteCarloLabel} radius={[3, 3, 0, 0]}>
                            {nextStateData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} opacity={0.4} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 mt-2 justify-center">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-violet-400 opacity-90" />
                        <span className="text-[10px] text-muted-foreground">{na.prediction.nextStateLabel}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-violet-400 opacity-40" />
                        <span className="text-[10px] text-muted-foreground">{na.prediction.monteCarloLabel}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── TAB: Transition Matrix ── */}
              <TabsContent value="matrix" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-violet-400" />
                        {na.matrix.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {na.matrix.builtFrom} {result.dataPoints.toLocaleString()} {na.matrix.candles} ·{' '}
                        {result.dateRange.start} → {result.dateRange.end}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <TransitionMatrix matrix={result.transitionMatrix} />
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{na.matrix.steadyStateTitle}</CardTitle>
                        <p className="text-xs text-muted-foreground">{na.matrix.steadyStatePi}</p>
                      </CardHeader>
                      <CardContent>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={steadyStateData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" />
                              <RechartTooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                                formatter={(v: any) => [`${v}%`, na.matrix.steadyStateTitle]}
                              />
                              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {steadyStateData.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{na.matrix.historicalTitle}</CardTitle>
                        <p className="text-xs text-muted-foreground">{na.matrix.actualFrequency}</p>
                      </CardHeader>
                      <CardContent className="space-y-1.5">
                        {STATES.map((s, i) => (
                          <div key={s} className="flex items-center gap-2">
                            <span className="text-xs w-24" style={{ color: STATE_CONFIG[s].color }}>{stateLabel(s, language)}</span>
                            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.round((result.stateDistribution[i] ?? 0) * 100)}%`, backgroundColor: STATE_CONFIG[s].color }}
                              />
                            </div>
                            <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                              {Math.round((result.stateDistribution[i] ?? 0) * 100)}%
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB: Features ── */}
              <TabsContent value="features" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground/80">{na.features.title}</h3>
                      <Badge variant="outline" className={cn(
                        'text-xs',
                        stationaryCount === totalFeatures ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400'
                      )}>
                        {stationaryCount}/{totalFeatures} {na.features.stationaryBadge}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(result.features).map(([key, feat]) => (
                        <FeatureCard key={key} featureKey={key} result={feat} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground/80">{na.features.overviewTitle}</h3>
                    <Card className="bg-card border-border">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-emerald-400">{stationaryCount} {na.features.stationaryFeatures}</p>
                            <p className="text-[10px] text-muted-foreground">{na.features.adfPValue}</p>
                          </div>
                        </div>
                        {totalFeatures - stationaryCount > 0 && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-amber-400">{totalFeatures - stationaryCount} {na.features.nonStationary}</p>
                              <p className="text-[10px] text-muted-foreground">{na.features.considerDifferencing}</p>
                            </div>
                          </div>
                        )}
                        <div className="pt-2 text-[10px] text-muted-foreground leading-relaxed border-t border-border">
                          <p className="font-semibold text-foreground/60 mb-1">{na.features.adfTestTitle}</p>
                          <p>{na.features.h0}</p>
                          <p>{na.features.h1}</p>
                          <p className="mt-1">{na.features.rejectH0}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardContent className="pt-4">
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-foreground/60 block mb-1">{na.features.whyTitle}</span>
                          {na.features.whyDesc}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB: History ── */}
              <TabsContent value="history" className="mt-4">
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-violet-400" />
                      {na.history.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{na.history.desc}</p>
                  </CardHeader>
                  <CardContent>
                    <HistoricalTimeline points={result.historicalStates} />
                  </CardContent>
                </Card>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {STATES.map((s, i) => {
                    const cfg = STATE_CONFIG[s]
                    const pct = Math.round((result.stateDistribution[i] ?? 0) * 100)
                    const count = Math.round((result.stateDistribution[i] ?? 0) * (result.dataPoints - 1))
                    return (
                      <Card key={s} className="bg-card border-border" style={{ borderColor: cfg.color + '30' }}>
                        <CardContent className="pt-3 pb-3 text-center">
                          <StateBadge state={s} size="sm" />
                          <p className="text-2xl font-black mt-2" style={{ color: cfg.color }}>{pct}%</p>
                          <p className="text-[10px] text-muted-foreground">{count} {na.history.sessions}</p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </TabsContent>

              {/* ── TAB: Theory ── */}
              <TabsContent value="theory" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-violet-400" />
                      {na.theory.mathTitle}
                    </h3>
                    <TheoryPanel />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                      <Brain className="h-4 w-4 text-indigo-400" />
                      {na.theory.implTitle}
                    </h3>
                    <div className="p-4 rounded-xl bg-black/20 border border-white/8 font-mono text-xs space-y-3">
                      {[
                        {
                          label: na.theory.codeStatesLabel,
                          lines: [
                            { text: 'Strong_Up   → return > +2.0%',  color: 'text-green-400' },
                            { text: 'Up          → return +0.8% to +2.0%', color: 'text-emerald-400' },
                            { text: 'Sideways    → return -0.8% to +0.8%', color: 'text-slate-400' },
                            { text: 'Down        → return -0.8% to -2.0%', color: 'text-orange-400' },
                            { text: 'Strong_Down → return < -2.0%',  color: 'text-red-400' },
                          ],
                        },
                        {
                          label: na.theory.codeSteadyLabel,
                          lines: [
                            { text: 'pi_0 = [0.2, 0.2, 0.2, 0.2, 0.2]', color: 'text-slate-300' },
                            { text: 'pi_(n+1) = pi_n × P', color: 'text-slate-300' },
                            { text: 'repeat until |pi_(n+1) - pi_n| < 1e-10', color: 'text-slate-300' },
                          ],
                        },
                        {
                          label: na.theory.codeAdfLabel,
                          lines: [
                            { text: 'delta_y(t) = alpha + beta * y(t-1) + eps', color: 'text-slate-300' },
                            { text: 't-stat = beta_hat / SE(beta_hat)', color: 'text-slate-300' },
                            { text: 'stationary if t-stat < -2.86 (5% level)', color: 'text-slate-300' },
                          ],
                        },
                      ].map(section => (
                        <div key={section.label}>
                          <p className="text-violet-400 mb-1">{section.label}</p>
                          {section.lines.map(line => (
                            <p key={line.text} className={line.color}>{line.text}</p>
                          ))}
                        </div>
                      ))}
                    </div>

                    <Card className="bg-card border-border">
                      <CardContent className="pt-4 space-y-2">
                        <p className="text-xs font-semibold text-foreground/80">{na.theory.perfTitle}</p>
                        {[
                          { label: na.theory.perfAccuracy, value: '52–57%', note: na.theory.perfAccuracyNote },
                          { label: na.theory.perfSharpe,   value: '> 1.0',  note: na.theory.perfSharpeNote },
                          { label: na.theory.perfKelly,    value: 'f* = (pb − q) / b', note: na.theory.perfKellyNote },
                          { label: na.theory.perfMaxRisk,  value: '≤ 2% capital', note: na.theory.perfMaxRiskNote },
                          { label: na.theory.perfRetrain,  value: '> 0.1',  note: na.theory.perfRetrainNote },
                        ].map(item => (
                          <div key={item.label} className="flex items-start justify-between gap-2 text-xs py-1.5 border-t border-white/5">
                            <span className="text-muted-foreground">{item.label}</span>
                            <div className="text-right">
                              <span className="font-semibold text-foreground/80 font-mono">{item.value}</span>
                              <p className="text-[10px] text-muted-foreground">{item.note}</p>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

            </Tabs>
          </>
        )}

        {/* Footer disclaimer */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-300/70">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed">{na.disclaimer}</p>
        </div>

      </div>
    </TooltipProvider>
  )
}
