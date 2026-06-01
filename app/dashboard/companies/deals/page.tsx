'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/language-context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, RefreshCw, Search, Filter,
  Calendar, BarChart3, Activity, Target, X, Plus, Image as ImageIcon,
  Loader2, Trophy, Send, ChevronRight, Minus, DollarSign
} from 'lucide-react'
import Link from 'next/link'
import { CreateCompanyTradeDialog } from '@/components/companies/CreateCompanyTradeDialog'

interface Trade {
  id: string
  symbol: string
  direction: string
  strike: number
  expiry_date: string
  entry_price: number
  contracts_qty: number
  contract_multiplier: number
  status: string
  max_price_since_entry: number
  current_price?: number
  pnl_value: number
  is_win: boolean
  entry_cost_total: number
  max_profit_value: number
  created_at: string
  notes?: string
  close_reason?: string
  avg_adjustments_count?: number
  analysis_id?: string
  image_url?: string
  polygon_option_ticker?: string
  telegram_channel_id?: string | null
  targets?: Array<{ level?: number; price?: number }> | null
  stoploss?: { level?: number; price?: number } | null
}

interface TradeStats {
  total: number
  active: number
  wins: number
  losses: number
  winRate: number
}

/* ── Helpers ─────────────────────────────────── */

const n2 = (v: number) => v.toFixed(2)
const n1 = (v: number) => v.toFixed(1)

function fmtExpiry(expiry: string | null | undefined): string {
  if (!expiry) return '—'
  const d = new Date(expiry + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function daysToExpiry(expiry: string | null | undefined): number | null {
  if (!expiry) return null
  const ms = new Date(expiry + 'T12:00:00Z').getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

function statusBorderColor(highPct: number, status: string): string {
  if (status === 'ACTIVE') {
    if (highPct > 5) return 'border-l-emerald-500'
    if (highPct < -5) return 'border-l-red-500'
    return 'border-l-amber-500'
  }
  if (status === 'CLOSED' || status === 'EXPIRED') {
    const isWinStatus = highPct >= 0
    return isWinStatus ? 'border-l-emerald-500' : 'border-l-red-500'
  }
  return 'border-l-border'
}

function PnLBar({ pct }: { pct: number }) {
  const clamped = Math.min(Math.abs(pct), 200)
  const w = (clamped / 200) * 100
  return (
    <div className="h-1 bg-muted/50 overflow-hidden w-full">
      <div className={cn('h-full transition-all', pct >= 0 ? 'bg-emerald-500' : 'bg-red-500')} style={{ width: `${w}%` }} />
    </div>
  )
}

/* ── Trade Card ────────────────────────────────────────────────────── */

interface TradeCardProps {
  trade: Trade
  isOwner: boolean
  channels: Array<{ id: string; channelName: string }>
  onClose: (id: string) => void
  onGenerateImage: (id: string) => void
  onPublish: (id: string, channelId: string) => void
  onPreviewImage: (url: string) => void
  generatingImage: string | null
  publishing: string | null
}

function TradeCard({
  trade, isOwner, channels,
  onClose, onGenerateImage, onPublish, onPreviewImage,
  generatingImage, publishing,
}: TradeCardProps) {
  const [publishChannelId, setPublishChannelId] = useState<string>('')
  const [showPublish, setShowPublish] = useState(false)

  const entry = trade.entry_price
  const current = trade.current_price ?? entry
  const high = trade.max_price_since_entry ?? entry
  const qty = trade.contracts_qty ?? 1
  const mult = trade.contract_multiplier ?? 100

  const highPct = entry > 0 ? ((high - entry) / entry) * 100 : 0
  const openPct = entry > 0 ? ((current - entry) / entry) * 100 : 0
  const highUsd = (high - entry) * qty * mult
  const openUsd = (current - entry) * qty * mult

  const isCall = trade.direction === 'CALL'
  const isActive = trade.status === 'ACTIVE'
  const dte = daysToExpiry(trade.expiry_date)
  const borderClass = statusBorderColor(highPct, trade.status)

  const targetPrice = trade.targets?.[0]?.level ?? trade.targets?.[0]?.price
  const stopPrice = trade.stoploss?.level ?? trade.stoploss?.price

  return (
    <div className={cn('opt-card border-l-2 opt-card-hover', borderClass)}>
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={cn('opt-dir-badge', isCall ? 'opt-dir-call' : 'opt-dir-put')}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span className="text-base font-black text-foreground tracking-tight">{trade.symbol}</span>
          <span className="text-sm font-black num text-foreground/90">${trade.strike.toLocaleString()}</span>
          {isActive && <span className="opt-status-badge opt-status-active">LIVE</span>}
          {!isActive && trade.close_reason === 'TARGET_WIN' && (
            <span className="opt-status-badge opt-status-win">TARGET ✓</span>
          )}
          {!isActive && trade.close_reason === 'STOPLOSS' && (
            <span className="opt-status-badge opt-status-loss">STOPPED</span>
          )}
          {!isActive && !trade.close_reason && (
            <span className="opt-status-badge opt-status-neutral">CLOSED</span>
          )}
          {trade.avg_adjustments_count > 0 && (
            <span className="text-[9px] text-muted-foreground border border-border/60 px-1.5 py-0.5">
              AVG×{trade.avg_adjustments_count}
            </span>
          )}
        </div>

        {/* Best P&L (high watermark) */}
        <div className="text-right flex-shrink-0">
          {Math.abs(highPct) >= 1 ? (
            <div className={cn('flex items-center gap-1 justify-end', highPct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {highPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span className="text-xl font-black num leading-none">
                {highPct >= 0 ? '+' : ''}{n1(highPct)}%
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 justify-end text-muted-foreground">
              <Minus className="h-3 w-3" />
              <span className="text-xl font-black num leading-none">FLAT</span>
            </div>
          )}
          <div className={cn('text-xs font-semibold num mt-0.5', highUsd >= 0 ? 'text-emerald-500/80' : 'text-red-500/80')}>
            {highUsd >= 0 ? '+' : ''}${Math.abs(highUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* P&L bar */}
      <PnLBar pct={highPct} />

      {/* Polygon ticker */}
      {trade.polygon_option_ticker && (
        <div className="px-4 pt-1.5 pb-0">
          <span className="opt-ticker-text">{trade.polygon_option_ticker}</span>
        </div>
      )}

      {/* ── Price metrics ────────────────────── */}
      <div className="grid grid-cols-4 gap-0 px-4 py-2.5 border-t border-border/60 mt-2">
        <div>
          <p className="opt-metric-label">ENTRY $</p>
          <p className="opt-metric-value text-muted-foreground">{n2(entry)}</p>
        </div>
        <div>
          <p className="opt-metric-label">CURRENT $</p>
          <p className={cn('opt-metric-value', current > entry ? 'text-emerald-500' : current < entry ? 'text-red-500' : 'text-foreground')}>
            {n2(current)}
          </p>
          {isActive && Math.abs(openPct) >= 0.5 && (
            <p className={cn('text-[9px] num', openPct >= 0 ? 'text-emerald-500/60' : 'text-red-500/60')}>
              {openPct >= 0 ? '+' : ''}{n1(openPct)}%
            </p>
          )}
        </div>
        <div>
          <p className="opt-metric-label flex items-center gap-0.5"><Trophy className="h-2 w-2 text-amber-500" /> HIGH $</p>
          <p className="opt-metric-value text-emerald-500/90">{n2(high)}</p>
          {highPct > 0 && <p className="text-[9px] text-emerald-500/60 num">+{n1(highPct)}%</p>}
        </div>
        <div>
          <p className="opt-metric-label">EXPIRY</p>
          <p className="opt-metric-value text-foreground">{fmtExpiry(trade.expiry_date)}</p>
          {dte != null && (
            <p className={cn('text-[9px] num', dte <= 5 ? 'text-red-500' : dte <= 14 ? 'text-amber-500' : 'text-muted-foreground')}>
              {dte > 0 ? `${dte}d left` : dte === 0 ? 'EXP TODAY' : 'EXPIRED'}
            </p>
          )}
        </div>
      </div>

      {/* ── Targets + Stop ───────────────────── */}
      {(targetPrice != null || stopPrice != null) && (
        <div className="px-4 py-2 border-t border-border/60 flex items-center gap-2 flex-wrap">
          {targetPrice != null && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 border font-bold num',
              current >= targetPrice
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
                : 'bg-muted/40 text-muted-foreground border-border/60'
            )}>
              TP ${targetPrice.toFixed(2)}{current >= targetPrice ? ' ✓' : ''}
            </span>
          )}
          {stopPrice != null && (
            <span className="text-[10px] px-1.5 py-0.5 border font-bold num bg-red-500/10 text-red-500 border-red-500/25">
              SL ${stopPrice.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* ── Footer actions ───────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/5 gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {trade.contracts_qty > 1 && (
            <span className="num">{trade.contracts_qty} contracts</span>
          )}
          {trade.analysis_id && (
            <Link href={`/dashboard/analysis/${trade.analysis_id}`} className="flex items-center gap-0.5 text-primary hover:underline font-semibold">
              Analysis <ChevronRight className="h-2.5 w-2.5" />
            </Link>
          )}
        </div>

        {isOwner && (
          <div className="flex items-center gap-1">
            {/* Generate image */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="Generate image"
              onClick={() => onGenerateImage(trade.id)}
              disabled={generatingImage === trade.id}
            >
              {generatingImage === trade.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ImageIcon className="h-3.5 w-3.5" />}
            </Button>

            {/* Preview image */}
            {trade.image_url && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title="Preview image"
                onClick={() => onPreviewImage(trade.image_url!)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Publish to Telegram */}
            {channels.length > 0 && (
              <>
                {showPublish ? (
                  <div className="flex items-center gap-1">
                    <Select value={publishChannelId} onValueChange={setPublishChannelId}>
                      <SelectTrigger className="h-7 text-[10px] w-36">
                        <SelectValue placeholder="Channel..." />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map(ch => (
                          <SelectItem key={ch.id} value={ch.id} className="text-[11px]">
                            {ch.channelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      disabled={!publishChannelId || publishing === trade.id}
                      onClick={() => {
                        onPublish(trade.id, publishChannelId)
                        setShowPublish(false)
                        setPublishChannelId('')
                      }}
                    >
                      {publishing === trade.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowPublish(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Publish to Telegram"
                    onClick={() => setShowPublish(true)}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}

            {/* Close trade */}
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                title="Close trade"
                onClick={() => onClose(trade.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      {trade.notes && (
        <div className="px-4 pb-3 pt-1 text-xs text-muted-foreground border-t border-border/40">
          {trade.notes}
        </div>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function CompanyDealsPage() {
  const router = useRouter()
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<string>('all')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [generatingImage, setGeneratingImage] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [channels, setChannels] = useState<Array<{ id: string; channelName: string }>>([])
  const supabaseRef = useRef(createClient())

  useEffect(() => { loadTrades() }, [refreshKey])

  useEffect(() => {
    fetch('/api/telegram/channels/list')
      .then(r => r.json())
      .then(d => { if (d.ok && d.channels) setChannels(d.channels) })
      .catch(() => undefined)
  }, [])

  // Realtime updates
  useEffect(() => {
    const supabase = supabaseRef.current
    const channel = supabase
      .channel('company-contract-deals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_trades' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string })?.id
          if (oldId) setTrades(prev => prev.filter(t => t.id !== oldId))
          return
        }
        const updated = payload.new as Trade & { scope?: string }
        if (updated.scope && updated.scope !== 'company') return
        setTrades(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadTrades() {
    setLoading(true)
    try {
      const response = await fetch('/api/companies/contract-trades')
      if (response.status === 401) { router.push('/login'); return }
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true)
    try {
      await fetch('/api/companies/contract-trades/update-prices', { method: 'POST' })
      await loadTrades()
    } catch { /* ignore */ }
    setRefreshingPrices(false)
  }

  async function handleGenerateImage(tradeId: string) {
    setGeneratingImage(tradeId)
    try {
      const response = await fetch(`/api/companies/contract-trades/${tradeId}/generate-image`, { method: 'POST' })
      if (response.ok) {
        const data = await response.json()
        if (data.image_url) {
          setTrades(prev => prev.map(t => (t.id === tradeId ? { ...t, image_url: data.image_url } : t)))
          setPreviewImage(data.image_url)
        }
      }
    } catch { /* ignore */ }
    setGeneratingImage(null)
  }

  async function handlePublish(tradeId: string, channelId: string) {
    setPublishing(tradeId)
    try {
      await fetch(`/api/companies/contract-trades/${tradeId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      })
    } catch { /* ignore */ }
    setPublishing(null)
  }

  async function handleCloseTrade(tradeId: string) {
    if (!confirm(ar ? 'هل أنت متأكد من إغلاق هذه الصفقة؟' : 'Are you sure you want to close this trade?')) return
    try {
      const response = await fetch(`/api/companies/contract-trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', close_reason: 'MANUAL' })
      })
      if (response.ok) setRefreshKey(prev => prev + 1)
    } catch { /* ignore */ }
  }

  const filteredTrades = trades.filter(trade => {
    if (statusFilter !== 'all' && trade.status !== statusFilter) return false
    if (directionFilter !== 'all' && trade.direction !== directionFilter) return false
    if (!searchQuery) return true
    return trade.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const stats: TradeStats = {
    total: trades.length,
    active: trades.filter(t => t.status === 'ACTIVE').length,
    wins: trades.filter(t => t.is_win && t.status !== 'ACTIVE').length,
    losses: trades.filter(t => !t.is_win && t.status !== 'ACTIVE').length,
    winRate: 0,
  }
  const closedCount = stats.wins + stats.losses
  stats.winRate = closedCount > 0 ? (stats.wins / closedCount) * 100 : 0
  const totalHighUsd = trades.reduce((sum, t) => {
    const e = t.entry_price, h = t.max_price_since_entry ?? e
    return sum + (h - e) * (t.contracts_qty ?? 1) * (t.contract_multiplier ?? 100)
  }, 0)

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BarChart3 className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-black">{ar ? 'صفقات الأسهم والعقود' : 'Stock Deals & Contracts'}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{ar ? 'جميع عقود الأوبشن عبر تحليلات الأسهم' : 'All options contract trades across stock analyses'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {ar ? 'صفقة جديدة' : 'New Trade'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefreshPrices} disabled={refreshingPrices}>
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshingPrices && 'animate-spin')} />
            {ar ? 'تحديث الأسعار' : 'Update Prices'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Activity, label: ar ? 'نشطة' : 'Active', value: stats.active, color: 'text-blue-500' },
          { icon: Target, label: ar ? 'معدل الفوز' : 'Win Rate', value: `${stats.winRate.toFixed(0)}%`, color: 'text-emerald-500' },
          { icon: Trophy, label: ar ? 'فوز / خسارة' : 'W / L', value: `${stats.wins}W ${stats.losses}L`, color: 'text-amber-500' },
          { icon: DollarSign, label: ar ? 'أفضل ربح' : 'Best P&L', value: `${totalHighUsd >= 0 ? '+' : ''}$${Math.abs(totalHighUsd).toFixed(0)}`, color: totalHighUsd >= 0 ? 'text-emerald-500' : 'text-red-500' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', color)} />
                <div>
                  <div className={cn('text-xl font-black num', color)}>{value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={ar ? 'رمز السهم...' : 'Symbol (e.g. TSLA)'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ar ? 'كل الحالات' : 'All Statuses'}</SelectItem>
                <SelectItem value="ACTIVE">{ar ? 'نشطة' : 'Active'}</SelectItem>
                <SelectItem value="CLOSED">{ar ? 'مغلقة' : 'Closed'}</SelectItem>
                <SelectItem value="EXPIRED">{ar ? 'منتهية' : 'Expired'}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All directions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ar ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="CALL">Call</SelectItem>
                <SelectItem value="PUT">Put</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Trades */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{ar ? 'جاري التحميل...' : 'Loading trades...'}</p>
        </div>
      ) : filteredTrades.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{ar ? 'لا توجد صفقات' : 'No Trades Found'}</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              {trades.length === 0
                ? (ar ? 'لم تقم بإنشاء أي صفقة بعد.' : 'No stock contract trades yet.')
                : (ar ? 'لا توجد صفقات تطابق الفلاتر.' : 'No trades match the current filters.')}
            </p>
            {trades.length === 0 && (
              <div className="flex items-center justify-center gap-2">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {ar ? 'صفقة جديدة' : 'New Trade'}
                </Button>
                <Link href="/dashboard/companies/analyses">
                  <Button variant="outline">{ar ? 'تصفح التحليلات' : 'Browse Analyses'}</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground mb-1">
            {filteredTrades.length} / {trades.length} {ar ? 'صفقة' : 'trade(s)'}
          </p>
          {filteredTrades.map(trade => (
            <TradeCard
              key={trade.id}
              trade={trade}
              isOwner
              channels={channels}
              onClose={handleCloseTrade}
              onGenerateImage={handleGenerateImage}
              onPublish={handlePublish}
              onPreviewImage={setPreviewImage}
              generatingImage={generatingImage}
              publishing={publishing}
            />
          ))}
        </div>
      )}

      <CreateCompanyTradeDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTradeCreated={() => { setShowCreateDialog(false); setRefreshKey(k => k + 1) }}
      />

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Contract deal" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
