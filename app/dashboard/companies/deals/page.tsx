'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/language-context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  TrendingUp, TrendingDown, RefreshCw, Search, Filter,
  Calendar, DollarSign, BarChart3, Activity, Target, X, Plus, Image as ImageIcon, Loader2, Trophy
} from 'lucide-react'
import Link from 'next/link'
import { formatPnL, formatPercentage, calculatePnLPercentage } from '@/services/trades/canonical-pnl.service'
import { CreateCompanyContractDealDialog } from '@/components/companies/CreateCompanyContractDealDialog'

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
}

interface TradeStats {
  total: number
  active: number
  closed: number
  wins: number
  losses: number
  totalPnL: number
  winRate: number
}

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
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    loadTrades()
  }, [refreshKey])

  // Live updates: realtime price/peak changes on contract_trades (via Fly.io)
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
      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
      }
    } catch (error) {
      console.error('Failed to load trades:', error)
    }
    setLoading(false)
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true)
    try {
      await fetch('/api/companies/contract-trades/update-prices', { method: 'POST' })
      await loadTrades()
    } catch (error) {
      console.error('Error refreshing prices:', error)
    } finally {
      setRefreshingPrices(false)
    }
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
    } catch (error) {
      console.error('Error generating image:', error)
    } finally {
      setGeneratingImage(null)
    }
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
    } catch (error) {
      console.error('Error closing trade:', error)
    }
  }

  const filteredTrades = trades.filter(trade => {
    if (statusFilter !== 'all' && trade.status !== statusFilter) return false
    if (directionFilter !== 'all' && trade.direction !== directionFilter) return false
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return trade.symbol.toLowerCase().includes(q)
  })

  const stats: TradeStats = {
    total: trades.length,
    active: trades.filter(t => t.status === 'ACTIVE').length,
    closed: trades.filter(t => t.status !== 'ACTIVE').length,
    wins: trades.filter(t => t.is_win && t.status !== 'ACTIVE').length,
    losses: trades.filter(t => !t.is_win && t.status !== 'ACTIVE').length,
    totalPnL: trades.reduce((sum, t) => sum + (t.pnl_value || 0), 0),
    winRate: 0,
  }
  const closedCount = stats.wins + stats.losses
  stats.winRate = closedCount > 0 ? (stats.wins / closedCount) * 100 : 0

  function getStatusBadge(trade: Trade) {
    if (trade.status === 'ACTIVE') return <Badge>Active</Badge>
    if (trade.status === 'EXPIRED') {
      return trade.is_win
        ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Expired (Win)</Badge>
        : <Badge variant="destructive">Expired (Loss)</Badge>
    }
    return trade.is_win
      ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Win</Badge>
      : <Badge variant="destructive">Loss</Badge>
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Stock Deals & Contracts</h1>
          </div>
          <p className="text-muted-foreground">
            All your options contract trades across stock analyses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {ar ? 'صفقة عقد جديدة' : 'New Contract Deal'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshPrices}
            disabled={refreshingPrices}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshingPrices ? 'animate-spin' : ''}`} />
            {ar ? 'تحديث الأسعار' : 'Update Prices'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey(prev => prev + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.active}</div>
                <div className="text-sm text-muted-foreground">Active Trades</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.winRate.toFixed(0)}%</div>
                <div className="text-sm text-muted-foreground">Win Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.wins}W / {stats.losses}L</div>
                <div className="text-sm text-muted-foreground">Wins / Losses</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                stats.totalPnL >= 0
                  ? 'bg-green-100 dark:bg-green-900'
                  : 'bg-red-100 dark:bg-red-900'
              }`}>
                <DollarSign className={`h-5 w-5 ${
                  stats.totalPnL >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${
                  stats.totalPnL >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatPnL(stats.totalPnL)}
                </div>
                <div className="text-sm text-muted-foreground">Total P/L</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Search Symbol</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="e.g. AAPL, TSLA..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Direction</label>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All directions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="CALL">Call</SelectItem>
                  <SelectItem value="PUT">Put</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trades List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Loading trades...</p>
        </div>
      ) : filteredTrades.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Trades Found</h3>
            <p className="text-muted-foreground mb-6">
              {trades.length === 0
                ? 'You have not created any stock contract trades yet.'
                : 'No trades match the current filters.'}
            </p>
            {trades.length === 0 && (
              <div className="flex items-center justify-center gap-2">
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {ar ? 'صفقة عقد جديدة' : 'New Contract Deal'}
                </Button>
                <Link href="/dashboard/companies/analyses">
                  <Button variant="outline">{ar ? 'تصفح التحليلات' : 'Browse Stock Analyses'}</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground mb-2">
            Showing {filteredTrades.length} of {trades.length} trade{trades.length !== 1 ? 's' : ''}
          </div>
          {filteredTrades.map((trade) => {
            const pnlPercentage = calculatePnLPercentage(trade.pnl_value, trade.entry_cost_total)
            const pnlColor = trade.pnl_value >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'

            return (
              <Card key={trade.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {trade.direction === 'CALL' ? (
                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
                          <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-lg">
                          {trade.symbol}
                          {' '}
                          <span className={trade.direction === 'CALL' ? 'text-green-600' : 'text-red-600'}>
                            {trade.direction}
                          </span>
                          {' '}
                          <span className="text-muted-foreground font-normal text-base">
                            ${trade.strike}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {trade.contracts_qty} contract{trade.contracts_qty > 1 ? 's' : ''} @ ${trade.entry_price.toFixed(2)}
                          {trade.avg_adjustments_count > 0 && (
                            <span className="ml-2 text-xs">(Averaged {trade.avg_adjustments_count}x)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(trade)}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGenerateImage(trade.id)}
                        disabled={generatingImage === trade.id}
                        className="h-8 w-8 p-0"
                        title={ar ? 'إنشاء صورة' : 'Generate image'}
                      >
                        {generatingImage === trade.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ImageIcon className="h-4 w-4" />}
                      </Button>
                      {trade.image_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewImage(trade.image_url!)}
                          className="h-8 w-8 p-0"
                          title={ar ? 'عرض الصورة' : 'View image'}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      )}
                      {trade.status === 'ACTIVE' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCloseTrade(trade.id)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Entry Cost</div>
                      <div className="font-semibold">${trade.entry_cost_total.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{ar ? 'السعر الحالي' : 'Current'}</div>
                      <div className="font-semibold">{trade.current_price != null ? `$${trade.current_price.toFixed(2)}` : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Trophy className="h-3 w-3 text-amber-500" /> {ar ? 'القمة' : 'Peak'}
                      </div>
                      <div className="font-semibold text-amber-600">${trade.max_price_since_entry.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Max Profit</div>
                      <div className="font-semibold">${trade.max_profit_value.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">P/L</div>
                      <div className={`font-bold ${pnlColor}`}>
                        {formatPnL(trade.pnl_value)} ({formatPercentage(pnlPercentage)})
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Exp: {new Date(trade.expiry_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Opened: {new Date(trade.created_at).toLocaleDateString()}</span>
                      </div>
                      {trade.close_reason && (
                        <span>Closed: {trade.close_reason.replace(/_/g, ' ')}</span>
                      )}
                    </div>

                    {trade.analysis_id && (
                      <Link
                        href={`/dashboard/analysis/${trade.analysis_id}`}
                        className="text-primary hover:underline"
                      >
                        View Analysis →
                      </Link>
                    )}
                  </div>

                  {trade.status === 'ACTIVE' && (
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                      <strong>Win Threshold:</strong> Need ${(100 / (trade.contracts_qty * trade.contract_multiplier) + trade.entry_price).toFixed(2)} contract price to reach $100 profit
                    </div>
                  )}

                  {trade.notes && (
                    <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                      {trade.notes}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateCompanyContractDealDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTradeCreated={() => {
          setShowCreateDialog(false)
          setRefreshKey(prev => prev + 1)
        }}
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
