'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CloseTradeDialog } from '@/components/trades/CloseTradeDialog'
import { CreateTradeDialog } from '@/components/trades/CreateTradeDialog'
import {
  ArrowLeft, TrendingUp, TrendingDown, Target, ShieldAlert, Send,
  Loader2, Edit, ExternalLink, TestTube2, RefreshCw, LinkIcon, Unlink,
  PauseCircle, PlayCircle,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { TradeFull, TradeTarget, TradeAlert } from '@/lib/types/trades'
import { calcEffectivePnL } from '@/lib/types/trades'

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function pct(n: number | null | undefined) {
  if (n == null) return null
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

const statusColors: Record<string, string> = {
  draft:     'bg-gray-700 text-gray-200',
  published: 'bg-blue-700 text-white',
  active:    'bg-emerald-700 text-white',
  stopped:   'bg-red-700 text-white',
  completed: 'bg-teal-700 text-white',
  cancelled: 'bg-gray-600 text-white',
  expired:   'bg-amber-700 text-white',
  suspended: 'bg-orange-700 text-white',
}

export default function TradeDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [trade, setTrade]             = useState<TradeFull | null>(null)
  const [loading, setLoading]         = useState(true)
  const [userRole, setUserRole]       = useState('')
  const [isOwner, setIsOwner]         = useState(false)
  const [closeOpen, setCloseOpen]     = useState(false)
  const [broadcasting, setBroadcasting] = useState(false)
  const [sendingUpdate, setSendingUpdate] = useState(false)
  const [unlinking, setUnlinking]     = useState(false)
  const [suspending, setSuspending]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [tradeRes, meRes] = await Promise.all([
        fetch(`/api/trades/${id}`),
        fetch('/api/me'),
      ])
      const tradeJson = await tradeRes.json()
      const meJson    = await meRes.json()
      if (!tradeRes.ok) { toast.error(tradeJson.error ?? 'Not found'); router.push('/dashboard/trades'); return }
      setTrade(tradeJson.trade)
      const role = meJson?.profile?.role?.name ?? ''
      setUserRole(role)
      setIsOwner(
        ['SuperAdmin', 'Analyzer'].includes(role) &&
        (role === 'SuperAdmin' || tradeJson.trade.user_id === meJson?.profile?.id)
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleBroadcast() {
    setBroadcasting(true)
    try {
      const res  = await fetch(`/api/trades/${id}/broadcast`, { method: 'POST' })
      const json = await res.json()
      if (json.duplicate) { toast.info('Already broadcast'); return }
      if (!res.ok) { toast.error(json.error); return }
      toast.success('تم الإرسال عبر تيليجرام / Broadcast sent')
      load()
    } finally {
      setBroadcasting(false)
    }
  }

  async function handlePublish() {
    const res = await fetch(`/api/trades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    })
    if (res.ok) { toast.success('تم النشر / Published'); load() }
    else toast.error('Failed')
  }

  async function handleSuspend(action: 'suspend' | 'resume') {
    if (action === 'suspend' &&
        !window.confirm('وقف متابعة هذا العقد؟ سيُحتسب خسارة كاملة ويُرسَل تنبيه بالوقف ما لم تستأنفه.\nSuspend this contract? It will count as a full loss and a suspension alert will be sent, until you resume it.')) {
      return
    }
    setSuspending(true)
    try {
      const res = await fetch(`/api/trades/${id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed'); return }
      toast.success(action === 'suspend' ? 'تم وقف العقد / Suspended' : 'تم استئناف المتابعة / Resumed')
      load()
    } finally {
      setSuspending(false)
    }
  }

  async function handleUnlink() {
    setUnlinking(true)
    try {
      const res = await fetch(`/api/trades/${id}/link-analysis`, { method: 'DELETE' })
      if (res.ok) { toast.success('تم فك الارتباط / Unlinked'); load() }
      else toast.error('Failed to unlink')
    } finally { setUnlinking(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!trade) return null

  const isOption = trade.trade_type === 'option'
  const details  = trade.option_details
  const isSuspended = trade.status === 'suspended'
  // Effective P/L treats a SUSPENDED contract as a full loss until resumed.
  const pnl      = calcEffectivePnL(trade)

  const entryPrice   = isOption ? details?.entry_premium   : trade.entry_price
  const currentPrice = isOption ? details?.current_premium : trade.current_price
  const highPrice    = isOption ? details?.highest_premium_since_entry : trade.highest_price_since_entry
  const lowPrice     = isOption ? details?.lowest_premium_since_entry  : trade.lowest_price_since_entry

  const hitCount  = trade.targets.filter((t: TradeTarget) => t.hit).length
  const totalTgts = trade.targets.length

  const isBroadcast = trade.alerts?.some((a: TradeAlert) => a.alert_type === 'published' && a.status === 'sent')

  return (
    <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon" variant="ghost"
              onClick={() => router.push('/dashboard/trades')}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xl text-white">
                  {isOption ? (details?.underlying_symbol ?? trade.symbol) : trade.symbol}
                </span>
                <Badge className={cn('text-xs', statusColors[trade.status] ?? 'bg-gray-700 text-gray-200')}>
                  {trade.status}
                </Badge>
                {trade.is_testing && (
                  <Badge className="text-xs bg-amber-900 text-amber-200">
                    <TestTube2 className="w-3 h-3 mr-1" />Test
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {isOption ? '📋 خيارات / Options' : '📈 سهم / Stock'} •&nbsp;
                {trade.direction === 'long' || trade.direction === 'call' ? (
                  <span className="text-emerald-400">{trade.direction === 'call' ? 'Call 🟢' : 'شراء / Long 📈'}</span>
                ) : (
                  <span className="text-red-400">{trade.direction === 'put' ? 'Put 🔴' : 'بيع / Short 📉'}</span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          {isOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm" variant="outline"
                onClick={() => load()}
                className="h-8 border-gray-700 text-gray-400 hover:bg-gray-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>

              {trade.status === 'draft' && (
                <Button size="sm" onClick={handlePublish} className="h-8 bg-blue-700 hover:bg-blue-600">
                  🚀 نشر / Publish
                </Button>
              )}

              {['published', 'active'].includes(trade.status) && (
                <>
                  <Button
                    size="sm" variant="outline"
                    onClick={handleBroadcast}
                    disabled={broadcasting || isBroadcast}
                    className={cn(
                      'h-8 border-emerald-700 text-emerald-400 hover:bg-emerald-900/30',
                      isBroadcast && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {broadcasting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                    {isBroadcast ? '✅ أُرسل / Sent' : 'تيليجرام / Telegram'}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleSuspend('suspend')}
                    disabled={suspending}
                    className="h-8 border-orange-700 text-orange-400 hover:bg-orange-900/30"
                  >
                    {suspending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PauseCircle className="w-3.5 h-3.5 mr-1" />}
                    وقف / Suspend
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setCloseOpen(true)}
                    className="h-8 border-red-700 text-red-400 hover:bg-red-900/30"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                    إغلاق / Close
                  </Button>
                </>
              )}

              {trade.status === 'suspended' && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => handleSuspend('resume')}
                  disabled={suspending}
                  className="h-8 border-emerald-700 text-emerald-400 hover:bg-emerald-900/30"
                >
                  {suspending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PlayCircle className="w-3.5 h-3.5 mr-1" />}
                  استئناف / Resume
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Price Stats Grid */}
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="سعر الدخول / Entry" value={entryPrice} />
              <StatBox label="السعر الحالي / Current" value={currentPrice} highlight />
              <StatBox label="أعلى سعر / Highest" value={highPrice} positive />
              <StatBox label="أدنى سعر / Lowest" value={lowPrice} />
            </div>

            {trade.stop_loss != null && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-gray-400">وقف الخسارة / Stop Loss:</span>
                <span className="font-mono text-red-400 font-medium">${fmt(trade.stop_loss)}</span>
                <Badge className="text-xs bg-gray-800 text-gray-400">
                  {trade.stop_status}
                </Badge>
              </div>
            )}

            {/* P/L summary — suspended contracts count as a full loss until resumed */}
            {isSuspended ? (
              <div className="mt-3 rounded-lg px-3 py-2 text-sm font-medium bg-red-900/20 border border-red-800/30 text-red-300">
                ⛔️ موقوف — خسارة كاملة / Suspended — Full Loss:&nbsp;
                <span className="font-mono">-100%</span>
                {pnl.highest_pnl != null && <span className="ml-2 text-xs opacity-75">(${fmt(pnl.highest_pnl)})</span>}
                <div className="text-xs opacity-75 mt-1">يُحتسب خسارة كاملة ما لم تُستأنف المتابعة / Counts as a full loss unless tracking is resumed</div>
              </div>
            ) : pnl.highest_pct != null && (
              <div className={cn(
                'mt-3 rounded-lg px-3 py-2 text-sm font-medium',
                pnl.is_winning ? 'bg-emerald-900/30 border border-emerald-800/50 text-emerald-300'
                               : 'bg-red-900/20 border border-red-800/30 text-red-300'
              )}>
                {pnl.is_winning ? '✅' : '❌'}&nbsp;
                أعلى عائد / Best Return: <span className="font-mono">{pct(pnl.highest_pct)}</span>
                {pnl.highest_pnl != null && <span className="ml-2 text-xs opacity-75">(${fmt(pnl.highest_pnl)})</span>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Option Details Card */}
        {isOption && details && (
          <Card className="bg-gray-900 border-purple-800/40">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm text-purple-300">تفاصيل العقد / Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <DetailRow label="نوع الخيار / Type" value={details.option_type === 'call' ? 'Call 🟢' : 'Put 🔴'} />
                <DetailRow label="الإضراب / Strike" value={`$${fmt(details.strike_price)}`} mono />
                <DetailRow label="الانتهاء / Expiry" value={details.expiration_date} mono />
                <DetailRow label="القسط / Premium" value={`$${fmt(details.entry_premium)}`} mono />
                <DetailRow label="الكمية / Qty" value={String(details.quantity ?? 1)} />
                {details.contract_symbol && (
                  <DetailRow label="رمز العقد / Ticker" value={details.contract_symbol} mono />
                )}
                {details.win_threshold_met_at && (
                  <DetailRow label="🎯 هدف $100 / Win ✅" value={details.win_threshold_met_at.slice(0, 10)} />
                )}
                {details.stop_premium && (
                  <DetailRow label="وقف القسط / Stop Prem." value={`$${fmt(details.stop_premium)}`} negative mono />
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Targets */}
        {totalTgts > 0 && (
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                الأهداف / Targets — {hitCount}/{totalTgts} محققة
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-2">
                {trade.targets.map((t: TradeTarget, i: number) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
                      t.hit ? 'bg-emerald-900/30 border border-emerald-800/50' : 'bg-gray-800 border border-gray-700'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium', t.hit ? 'text-emerald-300' : 'text-gray-300')}>{t.label}</span>
                      {t.hit && <span className="text-xs text-emerald-400">✓ محقق / Hit</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-white">${fmt(t.price)}</span>
                      {t.hit_at && <span className="text-xs text-gray-500">{t.hit_at.slice(0, 10)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Linked Analysis */}
        {trade.analysis ? (
          <Card className="bg-gray-900 border-blue-800/40">
            <CardContent className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-gray-300">مرتبط بتحليل / Linked Analysis:</span>
                <span className="text-blue-300 text-sm font-medium">{trade.analysis.title ?? 'Untitled'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/dashboard/analysis/${trade.analysis.id}`} target="_blank">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-blue-700 text-blue-400 hover:bg-blue-900/30">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    عرض التحليل / View
                  </Button>
                </Link>
                {isOwner && (
                  <Button
                    size="sm" variant="ghost"
                    onClick={handleUnlink}
                    disabled={unlinking}
                    className="h-7 text-xs text-red-400 hover:bg-red-900/20"
                  >
                    {unlinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
              <span>🔓 صفقة مستقلة / Standalone Trade — غير مرتبطة بتحليل</span>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {trade.timeframe && <DetailRow label="الإطار / Timeframe" value={trade.timeframe} />}
              {trade.expected_duration && <DetailRow label="المدة / Duration" value={trade.expected_duration} />}
              {trade.risk_level && <DetailRow label="المخاطرة / Risk" value={trade.risk_level} />}
              {trade.plan && <DetailRow label="الخطة / Plan" value={trade.plan.name} />}
              <DetailRow label="النشر / Published" value={trade.published_at ? trade.published_at.slice(0, 10) : '—'} />
              <DetailRow label="التحديث / Updated" value={trade.updated_at.slice(0, 10)} />
            </div>
            {trade.notes && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <div className="text-xs text-gray-500 mb-1">ملاحظات / Notes</div>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{trade.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram Alerts log */}
        {isOwner && trade.alerts && trade.alerts.length > 0 && (
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-gray-400">سجل التنبيهات / Alert Log</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-1.5">
              {trade.alerts.map((a: TradeAlert) => (
                <div key={a.id} className="flex items-center justify-between text-xs text-gray-500 py-1 border-b border-gray-800 last:border-0">
                  <span className="font-medium text-gray-300">{a.alert_type}</span>
                  <span>{a.status === 'sent' ? '✅ sent' : '❌ failed'}</span>
                  <span>{new Date(a.created_at).toLocaleString('ar-SA')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      {closeOpen && (
        <CloseTradeDialog
          open={closeOpen}
          onOpenChange={setCloseOpen}
          trade={trade}
          onClosed={() => { setCloseOpen(false); load() }}
        />
      )}
    </div>
  )
}

function StatBox({ label, value, highlight, positive, negative }: {
  label: string; value?: number | null; highlight?: boolean; positive?: boolean; negative?: boolean
}) {
  const color = positive ? 'text-emerald-400' : negative ? 'text-red-400' : highlight ? 'text-white' : 'text-gray-200'
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={cn('font-mono text-base font-semibold', color)}>
        {value != null ? `$${fmt(value)}` : '—'}
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono, negative }: { label: string; value: string; mono?: boolean; negative?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={cn('text-sm font-medium text-gray-200', mono && 'font-mono', negative && 'text-red-400')}>
        {value}
      </div>
    </div>
  )
}
