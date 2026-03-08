'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import {
  TrendingUp, TrendingDown, Activity, Building2, FileText, Clock,
  ExternalLink, BarChart3, Target, Users, Zap, Filter, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Star, Globe, Briefcase,
  RefreshCw, Eye, BookOpen, Layers
} from 'lucide-react'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { CandleChart } from '@/components/charts/CandleChart'

// ────────────────────────────────────────────────────────────────────────────
// Design tokens
// ────────────────────────────────────────────────────────────────────────────
const G = '#3FB950'  // green
const R = '#F85149'  // red
const B = '#58A6FF'  // blue
const GOLD = '#E3B341'
const PURPLE = '#A371F7'

// ────────────────────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────────────────────
interface PriceData {
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  volume: number
  marketStatus: 'open' | 'closed' | 'pre-market' | 'after-hours'
  isDelayed?: boolean
}

interface CompanyProfile {
  name: string
  description: string
  market_cap?: number
  sector?: string
  industry?: string
  employees?: number
  homepage_url?: string
  logo_url?: string
  list_date?: string
  ticker_root?: string
  exchange?: string
}

interface Analysis {
  id: string
  direction: 'Long' | 'Short' | 'Neutral'
  stop_loss: number
  chart_image_url: string | null
  created_at: string
  status?: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
  validated_at?: string | null
  is_following?: boolean
  is_own_post?: boolean
  profiles: { id: string; full_name: string; avatar_url: string | null }
  symbols: { symbol: string }
  analysis_targets: Array<{ price: number; expected_time: string }>
  validation_events?: Array<{
    event_type: 'STOP_LOSS_HIT' | 'TARGET_HIT'
    target_number: number | null
    price_at_hit: number
    hit_at: string
  }>
}

interface Trade {
  id: string
  symbol: string
  direction: string
  strike: number
  expiry_date: string
  entry_price: number
  contracts_qty: number
  contract_multiplier: number
  entry_cost_total: number
  max_price_since_entry: number
  max_profit_value: number
  pnl_value: number
  is_win: boolean | null
  status: string
  close_reason?: string
  created_at: string
  closed_at?: string | null
  analysis_id?: string
  profiles: { id: string; full_name: string; avatar_url: string | null }
}

interface SentimentData {
  bullish: number
  bearish: number
  neutral: number
  total: number
}

interface TopAnalyst {
  id: string
  profile: { id: string; full_name: string; avatar_url: string | null }
  analyses: number
  wins: number
  losses: number
  win_rate: number | null
}

interface NewsItem {
  id: string
  title: string
  publisher: string
  published_at: string
  article_url: string
  image_url?: string
  description?: string
}

// ────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ────────────────────────────────────────────────────────────────────────────
const fmtCap = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}
const fmtVol = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return v.toString()
}
const usd = (v: number, sig = 2) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: sig, maximumFractionDigits: sig })

// ────────────────────────────────────────────────────────────────────────────
// Mini sparkline SVG
// ────────────────────────────────────────────────────────────────────────────
function Sparkline({ positive, w = 64, h = 24 }: { positive: boolean; w?: number; h?: number }) {
  const id = `sp-${Math.random().toString(36).slice(2)}`
  const pts = positive
    ? [22,18, 26,14, 30,16, 34,10, 38,12, 42,6, 46,9, 50,4, 54,7, 58,2]
    : [22,4, 26,7, 30,5, 34,11, 38,9, 42,15, 46,12, 50,17, 54,14, 58,20]
  const d = `M${pts[0]},${pts[1]} ` + pts.slice(2).reduce((s, v, i) => i % 2 === 0 ? `${s} L${v},` : `${s}${v}`, '')
  const fill = `M${pts[0]},${h} ${d.slice(1)} L${pts[pts.length - 2]},${h} Z`
  const color = positive ? G : R
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sentiment bar component
// ────────────────────────────────────────────────────────────────────────────
function SentimentBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-xs font-black num" style={{ color }}>{pct}% <span className="text-muted-foreground font-normal">({count})</span></span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Panel wrapper
// ────────────────────────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, color = B, action, children }: {
  title: string; icon: any; color?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded flex items-center justify-center" style={{ background: `${color}18` }}>
            <Icon className="h-3.5 w-3.5" style={{ color }} />
          </div>
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// PriceChart removed — replaced by CandleChart component

// ────────────────────────────────────────────────────────────────────────────
// Avatar helper
// ────────────────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = 6 }: { src?: string | null; name: string; size?: number }) {
  const cl = `h-${size} w-${size} rounded-full bg-muted flex items-center justify-center text-[10px] font-bold overflow-hidden flex-shrink-0`
  return src
    ? <img src={src} alt={name} className={cl} />
    : <div className={cl} style={{ background: B + '20', color: B }}>{name.slice(0, 1).toUpperCase()}</div>
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────
export default function SymbolPage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()

  const [priceData, setPriceData]         = useState<PriceData | null>(null)
  const [profile, setProfile]             = useState<CompanyProfile | null>(null)
  const [latestAnalyses, setLatest]       = useState<Analysis[]>([])
  const [topAnalyses, setTop]             = useState<Analysis[]>([])
  const [trades, setTrades]               = useState<Trade[]>([])
  const [sentiment, setSentiment]         = useState<SentimentData | null>(null)
  const [topAnalysts, setTopAnalysts]     = useState<TopAnalyst[]>([])
  const [news, setNews]                   = useState<NewsItem[]>([])
  const [isLoading, setIsLoading]         = useState(true)
  const [activeTab, setActiveTab]         = useState<'analyses' | 'trades' | 'options' | 'feed'>('analyses')
  const [feedFilter, setFeedFilter]       = useState<'all' | 'analyses' | 'trades'>('all')
  const [tradeStatusFilter, setTradeStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL')
  const [analysisTab, setAnalysisTab]     = useState<'latest' | 'top'>('latest')

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [priceRes, profileRes, analysesRes, statsRes, tradesRes, newsRes] = await Promise.all([
        fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/symbols/${symbol}/profile`),
        fetch(`/api/symbols/${symbol}/analyses`),
        fetch(`/api/symbols/${symbol}/stats`),
        fetch(`/api/symbols/${symbol}/trades?limit=20`),
        fetch(`/api/symbols/${symbol}/news`),
      ])

      if (priceRes.ok) {
        const d = await priceRes.json()
        if (d.price) setPriceData(d as PriceData)
      }
      if (profileRes.ok) setProfile(await profileRes.json())
      if (analysesRes.ok) {
        const d = await analysesRes.json()
        setLatest(d.latest || [])
        setTop(d.top || [])
      }
      if (statsRes.ok) {
        const d = await statsRes.json()
        setSentiment(d.sentiment)
        setTopAnalysts(d.topAnalysts || [])
      }
      if (tradesRes.ok) {
        const d = await tradesRes.json()
        setTrades(d.trades || [])
      }
      if (newsRes.ok) {
        const d = await newsRes.json()
        setNews(d.news || [])
      }
    } catch (e) {
      console.error('Symbol page fetch error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [symbol])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Auto-refresh price every 60s
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol)}`)
        if (r.ok) { const d = await r.json(); if (d.price) setPriceData(d) }
      } catch {}
    }, 60000)
    return () => clearInterval(iv)
  }, [symbol])

  const isPositive = (priceData?.changePercent ?? 0) >= 0
  const pnlColor   = isPositive ? G : R

  const marketStatusLabel = {
    open: 'Market Open', closed: 'Market Closed',
    'pre-market': 'Pre-Market', 'after-hours': 'After Hours'
  }[priceData?.marketStatus ?? 'closed']

  const marketStatusColor = {
    open: G, 'pre-market': GOLD, 'after-hours': GOLD, closed: R
  }[priceData?.marketStatus ?? 'closed']

  // Filtered trades
  const visibleTrades = tradeStatusFilter === 'ALL'
    ? trades
    : trades.filter(t => t.status === tradeStatusFilter)

  // Options = only CALL/PUT company trades
  const optionsTrades = trades.filter(t => ['CALL', 'PUT'].includes(t.direction.toUpperCase()))

  // Activity feed items
  const feedItems = [
    ...latestAnalyses.map(a => ({ type: 'analysis' as const, id: a.id, item: a, ts: a.created_at })),
    ...trades.map(t => ({ type: 'trade' as const, id: t.id, item: t, ts: t.created_at })),
  ].filter(x => feedFilter === 'all' || x.type === feedFilter)
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 20)

  if (isLoading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Header skeleton */}
        <div className="bg-card border border-border rounded-sm p-5 animate-pulse">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-full bg-muted" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-48 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
            <div className="h-8 w-28 bg-muted rounded" />
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-card border border-border rounded-sm animate-pulse" />)}
          </div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-card border border-border rounded-sm animate-pulse" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 sm:p-6 space-y-4">

      {/* ── SECTION 1: COMPANY HEADER ────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {/* Top accent bar */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${pnlColor}80, ${B}40, transparent)` }} />

        <div className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

            {/* Left: Logo + identity */}
            <div className="flex items-center gap-4">
              {profile?.logo_url ? (
                <div className="h-12 w-12 rounded-sm bg-muted/20 flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                  <img src={profile.logo_url} alt={symbol} className="h-10 w-10 object-contain" />
                </div>
              ) : (
                <div className="h-12 w-12 rounded-sm flex items-center justify-center flex-shrink-0 border border-border"
                  style={{ background: `${B}12` }}>
                  <span className="text-lg font-black" style={{ color: B }}>{symbol.slice(0, 2)}</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-black text-foreground">{symbol}</h1>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                    style={{ color: marketStatusColor, background: `${marketStatusColor}12`, borderColor: `${marketStatusColor}30` }}>
                    {marketStatusLabel}
                  </span>
                  {priceData?.isDelayed && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-muted-foreground border border-border">
                      15-min delay
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile?.name || symbol}
                  {profile?.sector && <span className="ml-2 opacity-60">· {profile.sector}</span>}
                </p>
              </div>
            </div>

            {/* Right: Price + sparkline */}
            <div className="flex items-center gap-4">
              {priceData && (
                <div className="flex items-center gap-3">
                  <Sparkline positive={isPositive} w={72} h={28} />
                  <div>
                    <div className="text-2xl font-black num text-foreground">
                      ${priceData.price.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isPositive
                        ? <ArrowUpRight className="h-3 w-3" style={{ color: pnlColor }} />
                        : <ArrowDownRight className="h-3 w-3" style={{ color: pnlColor }} />}
                      <span className="text-xs font-bold num" style={{ color: pnlColor }}>
                        {isPositive ? '+' : ''}{priceData.change.toFixed(2)}
                        {' '}({isPositive ? '+' : ''}{priceData.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button className="text-xs font-bold px-3 py-1.5 rounded-sm border border-border hover:border-primary/50 transition-colors">
              Follow
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className="text-xs font-bold px-3 py-1.5 rounded-sm border border-border hover:border-primary/50 transition-colors">
              View Trades
            </button>
            <button
              onClick={() => setActiveTab('analyses')}
              className="text-xs font-bold px-3 py-1.5 rounded-sm border border-border hover:border-primary/50 transition-colors">
              View Analyses
            </button>
            <Link
              href={`/dashboard/companies/analyses?symbol=${symbol}`}
              className="text-xs font-bold px-3 py-1.5 rounded-sm border border-border hover:border-primary/50 transition-colors flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              All Analyses
            </Link>
            {profile?.homepage_url && (
              <Link href={profile.homepage_url} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold px-3 py-1.5 rounded-sm border border-border hover:border-primary/50 transition-colors flex items-center gap-1 ml-auto">
                <Globe className="h-3 w-3" />
                Website
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            )}
            <button onClick={fetchAll}
              className="text-xs font-bold px-3 py-1.5 rounded-sm border border-border hover:border-primary/50 transition-colors flex items-center gap-1 ml-auto">
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: QUICK COMPANY INFO ────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Market Cap',   value: profile?.market_cap ? fmtCap(profile.market_cap) : '—',  color: PURPLE },
          { label: 'Sector',       value: profile?.sector     || '—',                               color: B },
          { label: 'Industry',     value: profile?.industry   || '—',                               color: B },
          { label: '52W High',     value: priceData?.high     ? `$${priceData.high.toFixed(2)}` : '—', color: G },
          { label: '52W Low',      value: priceData?.low      ? `$${priceData.low.toFixed(2)}`  : '—', color: R },
          { label: 'Avg Volume',   value: priceData?.volume   ? fmtVol(priceData.volume)       : '—', color: GOLD },
        ].map(item => (
          <div key={item.label}
            className="bg-card border border-border rounded-sm px-3 py-2.5">
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{item.label}</div>
            <div className="text-sm font-black num truncate" style={{ color: item.color }}
              title={item.value}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── MAIN LAYOUT ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ══ MAIN COLUMN (2/3) ══════════════════════════════════════════ */}
        <div className="lg:col-span-2 space-y-4">

          {/* SECTION 3: Chart */}
          <CandleChart symbol={symbol} />

          {/* Tab navigation */}
          <div className="flex border-b border-border">
            {[
              { key: 'analyses', label: 'Analyses',  icon: FileText, count: latestAnalyses.length },
              { key: 'trades',   label: 'Trades',    icon: BarChart3, count: trades.length },
              { key: 'options',  label: 'Options',   icon: Layers,   count: optionsTrades.length },
              { key: 'feed',     label: 'Activity',  icon: Activity, count: undefined },
            ].map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-colors relative"
                  style={{ color: active ? B : 'var(--muted-foreground)' }}>
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-[9px] font-black px-1 rounded"
                      style={{ background: active ? `${B}20` : 'var(--muted)/30', color: active ? B : 'var(--muted-foreground)' }}>
                      {tab.count}
                    </span>
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                      style={{ background: B }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* ── SECTION 5: ANALYSES ─────────────────────────────────────── */}
          {activeTab === 'analyses' && (
            <div className="space-y-4">
              {/* Sub-tabs */}
              <div className="flex gap-1">
                {(['latest', 'top'] as const).map(t => (
                  <button key={t} onClick={() => setAnalysisTab(t)}
                    className="text-[10px] font-bold px-3 py-1 rounded-sm border transition-colors"
                    style={{
                      background: analysisTab === t ? `${B}18` : 'transparent',
                      color: analysisTab === t ? B : 'var(--muted-foreground)',
                      borderColor: analysisTab === t ? `${B}40` : 'var(--border)',
                    }}>
                    {t === 'latest' ? 'Latest' : 'Top Rated'}
                  </button>
                ))}
              </div>

              {(analysisTab === 'latest' ? latestAnalyses : topAnalyses).length > 0 ? (
                (analysisTab === 'latest' ? latestAnalyses : topAnalyses).map(a => (
                  <AnalysisCard key={a.id} analysis={a} onFollowChange={fetchAll} />
                ))
              ) : (
                <div className="bg-card border border-border rounded-sm p-10 text-center">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground opacity-40 mb-3" />
                  <p className="text-sm text-muted-foreground">No analyses yet for {symbol}</p>
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 6: TRADES TABLE ─────────────────────────────────── */}
          {activeTab === 'trades' && (
            <div className="space-y-3">
              {/* Filter strip */}
              <div className="flex gap-1">
                {(['ALL', 'ACTIVE', 'CLOSED'] as const).map(s => (
                  <button key={s} onClick={() => setTradeStatusFilter(s)}
                    className="text-[10px] font-bold px-3 py-1 rounded-sm border transition-colors"
                    style={{
                      background: tradeStatusFilter === s ? `${B}18` : 'transparent',
                      color: tradeStatusFilter === s ? B : 'var(--muted-foreground)',
                      borderColor: tradeStatusFilter === s ? `${B}40` : 'var(--border)',
                    }}>
                    {s}
                  </button>
                ))}
              </div>

              {visibleTrades.length === 0 ? (
                <div className="bg-card border border-border rounded-sm p-10 text-center">
                  <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground opacity-40 mb-3" />
                  <p className="text-sm text-muted-foreground">No trades found for {symbol}</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-sm overflow-hidden">
                  {/* Table header */}
                  <div className="hidden sm:grid grid-cols-[80px_80px_80px_80px_90px_70px_80px_1fr] gap-x-3 px-4 py-2 border-b border-border bg-muted/10">
                    {['Type', 'Strike', 'Entry', 'High', 'P/L $', 'P/L %', 'Status', 'Analyst'].map(h => (
                      <div key={h} className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-border">
                    {visibleTrades.map(t => {
                      const isCall = t.direction.toUpperCase() === 'CALL'
                      const pnl  = t.pnl_value ?? 0
                      const pct  = t.entry_cost_total > 0 ? (pnl / t.entry_cost_total) * 100 : 0
                      const pnlC = t.status === 'ACTIVE'
                        ? (pnl >= 0 ? B : GOLD)
                        : (t.is_win ? G : R)
                      const sc   = { ACTIVE: { color: B, label: 'Active' }, CLOSED: { color: '#8B949E', label: 'Closed' }, EXPIRED: { color: GOLD, label: 'Expired' } }[t.status] || { color: '#8B949E', label: t.status }
                      return (
                        <div key={t.id} className="px-4 py-3 hover:bg-muted/10 transition-colors">
                          {/* Mobile */}
                          <div className="sm:hidden">
                            <div className="flex items-start justify-between mb-1.5">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-black text-foreground">${t.strike}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ color: isCall ? G : R, background: isCall ? `${G}12` : `${R}12` }}>
                                    {t.direction}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Exp {format(new Date(t.expiry_date), 'MMM dd, yy')} · {t.profiles?.full_name}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-black num" style={{ color: pnlC }}>
                                  {pnl >= 0 ? '+' : ''}{usd(pnl)}
                                </div>
                                <div className="text-[10px] font-bold num" style={{ color: pnlC }}>
                                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Desktop row */}
                          <div className="hidden sm:grid grid-cols-[80px_80px_80px_80px_90px_70px_80px_1fr] gap-x-3 items-center">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit"
                              style={{ color: isCall ? G : R, background: isCall ? `${G}12` : `${R}12` }}>
                              {t.direction}
                            </span>
                            <span className="text-xs font-bold num text-foreground">${t.strike}</span>
                            <span className="text-xs num text-muted-foreground">${t.entry_price.toFixed(2)}</span>
                            <span className="text-xs num" style={{ color: G }}>${t.max_price_since_entry?.toFixed(2) ?? '—'}</span>
                            <span className="text-xs font-black num" style={{ color: pnlC }}>
                              {pnl >= 0 ? '+' : ''}{usd(pnl)}
                            </span>
                            <span className="text-xs font-bold num" style={{ color: pnlC }}>
                              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit"
                              style={{ color: sc.color, background: `${sc.color}12`, borderColor: `${sc.color}30` }}>
                              {sc.label}
                            </span>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Avatar src={t.profiles?.avatar_url} name={t.profiles?.full_name || '?'} size={5} />
                              <Link href={`/dashboard/profile/${t.profiles?.id}`}
                                className="text-[10px] text-muted-foreground hover:text-primary truncate">
                                {t.profiles?.full_name}
                              </Link>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 7: OPTIONS CONTRACTS ────────────────────────────── */}
          {activeTab === 'options' && (
            <div>
              {optionsTrades.length === 0 ? (
                <div className="bg-card border border-border rounded-sm p-10 text-center">
                  <Layers className="h-8 w-8 mx-auto text-muted-foreground opacity-40 mb-3" />
                  <p className="text-sm text-muted-foreground">No options contracts for {symbol}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {optionsTrades.map(t => {
                    const isCall = t.direction.toUpperCase() === 'CALL'
                    const pnl   = t.pnl_value ?? 0
                    const pct   = t.entry_cost_total > 0 ? (pnl / t.entry_cost_total) * 100 : 0
                    const accentColor = isCall ? G : R
                    const pnlC  = t.status === 'ACTIVE'
                      ? (pnl >= 0 ? B : GOLD)
                      : (t.is_win ? G : R)
                    return (
                      <div key={t.id} className="bg-card border border-border rounded-sm overflow-hidden hover:border-primary/30 transition-colors">
                        {/* Top accent */}
                        <div className="h-0.5 w-full" style={{ background: accentColor }} />
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-base font-black text-foreground num">${t.strike}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ color: accentColor, background: `${accentColor}12` }}>
                                  {t.direction}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Exp {format(new Date(t.expiry_date), 'MMM dd, yyyy')}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-black num" style={{ color: pnlC }}>
                                {pnl >= 0 ? '+' : ''}{usd(pnl)}
                              </div>
                              <div className="text-[10px] num" style={{ color: pnlC }}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'Entry', value: `$${t.entry_price.toFixed(2)}` },
                              { label: 'High',  value: `$${t.max_price_since_entry?.toFixed(2) ?? '—'}`, color: G },
                              { label: 'Qty',   value: `${t.contracts_qty}x` },
                            ].map(s => (
                              <div key={s.label} className="bg-muted/10 rounded px-2 py-1.5">
                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                                <div className="text-xs font-bold num mt-0.5" style={{ color: s.color || 'var(--foreground)' }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
                            <Avatar src={t.profiles?.avatar_url} name={t.profiles?.full_name || '?'} size={5} />
                            <Link href={`/dashboard/profile/${t.profiles?.id}`}
                              className="text-[10px] text-muted-foreground hover:text-primary">
                              {t.profiles?.full_name}
                            </Link>
                            <span className="text-[9px] text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 8: ACTIVITY FEED ─────────────────────────────────── */}
          {activeTab === 'feed' && (
            <div className="space-y-3">
              {/* Filter */}
              <div className="flex gap-1">
                {(['all', 'analyses', 'trades'] as const).map(f => (
                  <button key={f} onClick={() => setFeedFilter(f)}
                    className="text-[10px] font-bold px-3 py-1 rounded-sm border capitalize transition-colors"
                    style={{
                      background: feedFilter === f ? `${B}18` : 'transparent',
                      color: feedFilter === f ? B : 'var(--muted-foreground)',
                      borderColor: feedFilter === f ? `${B}40` : 'var(--border)',
                    }}>
                    {f}
                  </button>
                ))}
              </div>

              {feedItems.length === 0 ? (
                <div className="bg-card border border-border rounded-sm p-10 text-center">
                  <Activity className="h-8 w-8 mx-auto text-muted-foreground opacity-40 mb-3" />
                  <p className="text-sm text-muted-foreground">No activity yet for {symbol}</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-sm divide-y divide-border overflow-hidden">
                  {feedItems.map(item => {
                    if (item.type === 'analysis') {
                      const a = item.item as Analysis
                      const sentColor = a.direction === 'Long' ? G : a.direction === 'Short' ? R : GOLD
                      const sentLabel = a.direction === 'Long' ? 'Bullish' : a.direction === 'Short' ? 'Bearish' : 'Neutral'
                      const SentIcon  = a.direction === 'Long' ? TrendingUp : a.direction === 'Short' ? TrendingDown : Minus
                      return (
                        <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
                          <div className="h-8 w-8 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: `${sentColor}12` }}>
                            <SentIcon className="h-4 w-4" style={{ color: sentColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold px-1 rounded"
                                style={{ color: sentColor, background: `${sentColor}12` }}>{sentLabel}</span>
                              <span className="text-xs font-bold text-foreground truncate">Analysis</span>
                              <span className="text-[10px] text-muted-foreground">by {a.profiles?.full_name}</span>
                            </div>
                            {a.analysis_targets?.[0] && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Target: ${a.analysis_targets[0].price} · Stop: ${a.stop_loss}
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatDistanceToNow(new Date(item.ts), { addSuffix: true })}
                          </div>
                          <Link href={`/dashboard/analysis/${item.id}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                          </Link>
                        </div>
                      )
                    } else {
                      const t = item.item as Trade
                      const isCall = t.direction.toUpperCase() === 'CALL'
                      const tc = isCall ? G : R
                      return (
                        <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
                          <div className="h-8 w-8 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: `${tc}12` }}>
                            <Zap className="h-4 w-4" style={{ color: tc }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold px-1 rounded"
                                style={{ color: tc, background: `${tc}12` }}>{t.direction}</span>
                              <span className="text-xs font-bold num text-foreground">${t.strike}</span>
                              <span className="text-[10px] text-muted-foreground">by {t.profiles?.full_name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Exp {format(new Date(t.expiry_date), 'MMM dd, yy')} · Status: {t.status}
                            </div>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatDistanceToNow(new Date(item.ts), { addSuffix: true })}
                          </div>
                        </div>
                      )
                    }
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT SIDEBAR (1/3) ════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* SECTION 2-extra: Company Info card */}
          {profile && (
            <Panel title="Company Info" icon={Building2} color={B}>
              <div className="space-y-3">
                {profile.description && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">
                    {profile.description}
                  </p>
                )}
                <div className="space-y-2 pt-1">
                  {[
                    { label: 'Market Cap',  value: profile.market_cap ? fmtCap(profile.market_cap) : null,         color: PURPLE },
                    { label: 'Sector',      value: profile.sector     || null,                                      color: B },
                    { label: 'Industry',    value: profile.industry   || null,                                      color: B },
                    { label: 'Employees',   value: profile.employees  ? profile.employees.toLocaleString() : null,  color: GOLD },
                  ].filter(x => x.value).map(x => (
                    <div key={x.label} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">{x.label}</span>
                      <span className="text-[11px] font-bold num truncate max-w-[60%] text-right" style={{ color: x.color }}>{x.value}</span>
                    </div>
                  ))}
                </div>
                {profile.homepage_url && (
                  <Link href={profile.homepage_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] hover:text-primary transition-colors mt-2 pt-2 border-t border-border"
                    style={{ color: B }}>
                    <Globe className="h-3 w-3" />
                    {profile.homepage_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    <ExternalLink className="h-2.5 w-2.5 ml-auto" />
                  </Link>
                )}
              </div>
            </Panel>
          )}

          {/* SECTION 4: Analyst Sentiment */}
          {sentiment && sentiment.total > 0 && (
            <Panel title="Analyst Sentiment" icon={BarChart3} color={GOLD}>
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground">{sentiment.total} total analyses</span>
                  <span className="text-[10px] font-bold"
                    style={{ color: sentiment.bullish > sentiment.bearish ? G : R }}>
                    {sentiment.bullish > sentiment.bearish ? 'Mostly Bullish' :
                     sentiment.bearish > sentiment.bullish ? 'Mostly Bearish' : 'Mixed'}
                  </span>
                </div>
                <SentimentBar label="Bullish" count={sentiment.bullish} total={sentiment.total} color={G} />
                <SentimentBar label="Bearish" count={sentiment.bearish} total={sentiment.total} color={R} />
                <SentimentBar label="Neutral" count={sentiment.neutral} total={sentiment.total} color={GOLD} />

                {/* Consensus gauge */}
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="h-2 rounded-full overflow-hidden flex">
                    <div style={{ width: `${sentiment.total > 0 ? (sentiment.bullish / sentiment.total) * 100 : 0}%`, background: G }} />
                    <div style={{ width: `${sentiment.total > 0 ? (sentiment.neutral / sentiment.total) * 100 : 0}%`, background: GOLD }} />
                    <div style={{ width: `${sentiment.total > 0 ? (sentiment.bearish / sentiment.total) * 100 : 0}%`, background: R }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                    <span style={{ color: G }}>Bull</span>
                    <span style={{ color: GOLD }}>Neutral</span>
                    <span style={{ color: R }}>Bear</span>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* SECTION 9: Top Analysts */}
          {topAnalysts.length > 0 && (
            <Panel title={`Top Analysts for ${symbol}`} icon={Users} color={PURPLE}>
              <div className="space-y-2">
                {topAnalysts.map((a, i) => (
                  <Link key={a.id} href={`/dashboard/profile/${a.id}`}
                    className="flex items-center gap-2.5 p-2 rounded hover:bg-muted/10 transition-colors group">
                    <span className="text-[10px] font-black w-4 flex-shrink-0 text-muted-foreground">#{i + 1}</span>
                    <Avatar src={a.profile?.avatar_url} name={a.profile?.full_name || '?'} size={7} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {a.profile?.full_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {a.analyses} {a.analyses === 1 ? 'analysis' : 'analyses'}
                      </div>
                    </div>
                    {a.win_rate !== null && (
                      <div className="text-[10px] font-black num flex-shrink-0"
                        style={{ color: a.win_rate >= 50 ? G : R }}>
                        {a.win_rate}%
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          {/* News */}
          {news.length > 0 && (
            <Panel title="Latest News" icon={FileText} color={B}>
              <div className="space-y-3">
                {news.slice(0, 5).map(item => (
                  <Link key={item.id} href={item.article_url} target="_blank" rel="noopener noreferrer"
                    className="block group">
                    <div className="space-y-1">
                      <h4 className="text-[11px] font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{item.publisher}</span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}</span>
                        <ExternalLink className="h-2.5 w-2.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
