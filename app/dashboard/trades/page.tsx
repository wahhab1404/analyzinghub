'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { TradeCard } from '@/components/trades/TradeCard'
import { CreateTradeDialog } from '@/components/trades/CreateTradeDialog'
import { CloseTradeDialog } from '@/components/trades/CloseTradeDialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Search, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { TradeFull, TradeFilters, TradeSortBy } from '@/lib/types/trades'
import { cn } from '@/lib/utils'

const STATUS_FILTERS = [
  { value: '',          label: 'الكل / All' },
  { value: 'active',    label: 'نشطة / Active' },
  { value: 'published', label: 'منشورة / Published' },
  { value: 'completed', label: 'مكتملة / Completed' },
  { value: 'stopped',   label: 'موقوفة / Stopped' },
  { value: 'draft',     label: 'مسودة / Draft' },
  { value: 'expired',   label: 'منتهية / Expired' },
]

const TYPE_FILTERS = [
  { value: '',       label: 'الكل / All' },
  { value: 'stock',  label: '📈 سهم / Stock' },
  { value: 'option', label: '📋 خيارات / Options' },
]

const SORT_OPTIONS: { value: TradeSortBy; label: string }[] = [
  { value: 'newest',    label: 'الأحدث / Newest' },
  { value: 'active',    label: 'النشطة / Active' },
  { value: 'completed', label: 'المكتملة / Completed' },
  { value: 'stopped',   label: 'الموقوفة / Stopped' },
]

export default function TradesPage() {
  const [trades, setTrades]               = useState<TradeFull[]>([])
  const [total, setTotal]                 = useState(0)
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)
  const [createOpen, setCreateOpen]       = useState(false)
  const [closingTrade, setClosingTrade]   = useState<TradeFull | null>(null)
  const [showFilters, setShowFilters]     = useState(false)
  const [isOwner, setIsOwner]             = useState(false)
  const [userRole, setUserRole]           = useState<string>('')

  const [filters, setFilters]             = useState<TradeFilters>({ status: '', trade_type: '', direction: '', linked: '' })
  const [symbolSearch, setSymbolSearch]   = useState('')
  const [sortBy, setSortBy]               = useState<TradeSortBy>('newest')
  const [showMine, setShowMine]           = useState(false)
  const [offset, setOffset]               = useState(0)
  const LIMIT = 20

  const fetchTrades = useCallback(async (reset = false) => {
    if (reset) setLoading(true); else setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (symbolSearch)              params.set('symbol', symbolSearch)
      if (filters.status)            params.set('status', filters.status)
      if (filters.trade_type)        params.set('trade_type', filters.trade_type)
      if (filters.direction)         params.set('direction', filters.direction)
      if (filters.linked)            params.set('linked', filters.linked)
      if (showMine)                  params.set('mine', 'true')
      params.set('sort_by', sortBy)
      params.set('limit',   String(LIMIT))
      params.set('offset',  String(reset ? 0 : offset))

      const res  = await fetch(`/api/trades?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }

      if (reset) {
        setTrades(json.trades)
        setOffset(LIMIT)
      } else {
        setTrades(prev => [...prev, ...json.trades])
        setOffset(prev => prev + LIMIT)
      }
      setTotal(json.total ?? 0)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [symbolSearch, filters, sortBy, showMine, offset])

  // Fetch user role
  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(data => {
      const role = data?.profile?.role?.name ?? ''
      setUserRole(role)
      setIsOwner(['SuperAdmin', 'Analyzer'].includes(role))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchTrades(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolSearch, filters, sortBy, showMine])

  async function handlePublish(id: string) {
    const res  = await fetch(`/api/trades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    })
    if (res.ok) {
      toast.success('تم النشر / Published')
      fetchTrades(true)
    } else {
      toast.error('Failed to publish')
    }
  }

  const hitTargetsCount = trades.filter(t => t.status === 'active' || t.status === 'published').length
  const completedCount  = trades.filter(t => t.status === 'completed').length

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      {/* Page header */}
      <div className="border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">
                الصفقات <span className="text-gray-400 text-base font-normal">/ Trades</span>
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                {total} صفقة إجمالاً • {hitTargetsCount} نشطة • {completedCount} مكتملة
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => fetchTrades(true)}
                disabled={refreshing}
                className="h-8 border-gray-700 text-gray-400 hover:bg-gray-800"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={cn('h-8 border-gray-700', showFilters ? 'text-blue-400 border-blue-700' : 'text-gray-400')}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                فلترة / Filter
              </Button>
              {isOwner && (
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="h-8 bg-blue-700 hover:bg-blue-600 text-white"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  صفقة جديدة / New Trade
                </Button>
              )}
            </div>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              {/* Symbol search */}
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <Input
                  value={symbolSearch}
                  onChange={e => setSymbolSearch(e.target.value.toUpperCase())}
                  placeholder="رمز / Symbol"
                  className="h-8 bg-gray-800 border-gray-600 text-white text-xs pr-7 w-28 uppercase font-mono"
                />
              </div>

              <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v as any }))}>
                <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-white text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {STATUS_FILTERS.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-gray-200 text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.trade_type} onValueChange={v => setFilters(f => ({ ...f, trade_type: v as any }))}>
                <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-white text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {TYPE_FILTERS.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-gray-200 text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.linked} onValueChange={v => setFilters(f => ({ ...f, linked: v as any }))}>
                <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-white text-xs w-36">
                  <SelectValue placeholder="مرتبط / Linked" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="" className="text-gray-400 text-xs">الكل / All</SelectItem>
                  <SelectItem value="linked" className="text-gray-200 text-xs">🔗 مرتبطة / Linked</SelectItem>
                  <SelectItem value="standalone" className="text-gray-200 text-xs">🔓 مستقلة / Standalone</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={v => setSortBy(v as TradeSortBy)}>
                <SelectTrigger className="h-8 bg-gray-800 border-gray-600 text-white text-xs w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {SORT_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-gray-200 text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isOwner && (
                <button
                  onClick={() => setShowMine(!showMine)}
                  className={cn(
                    'h-8 px-3 rounded-md text-xs border transition-colors',
                    showMine
                      ? 'bg-blue-800 border-blue-600 text-blue-200'
                      : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-200'
                  )}
                >
                  صفقاتي / My Trades
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-4xl mb-3">📊</div>
            <div className="text-lg font-medium text-gray-400">لا توجد صفقات / No Trades Found</div>
            <div className="text-sm mt-1">جرب تغيير الفلاتر أو أنشئ صفقة جديدة</div>
            {isOwner && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="mt-4 bg-blue-700 hover:bg-blue-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                إنشاء أول صفقة / Create First Trade
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {trades.map(trade => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  showAuthor
                  showActions={isOwner}
                  isOwner={isOwner && trade.user_id === undefined}
                  onPublish={handlePublish}
                  onClose={(id) => setClosingTrade(trades.find(t => t.id === id) ?? null)}
                />
              ))}
            </div>

            {trades.length < total && (
              <div className="text-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => fetchTrades(false)}
                  disabled={refreshing}
                  className="border-gray-700 text-gray-400 hover:bg-gray-800"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  تحميل المزيد / Load More ({total - trades.length} متبقية)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <CreateTradeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => fetchTrades(true)}
      />

      {closingTrade && (
        <CloseTradeDialog
          open={!!closingTrade}
          onOpenChange={open => { if (!open) setClosingTrade(null) }}
          trade={closingTrade}
          onClosed={() => { setClosingTrade(null); fetchTrades(true) }}
        />
      )}
    </div>
  )
}
