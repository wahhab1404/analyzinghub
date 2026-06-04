'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { calcStockPnL, calcOptionPnL, type TradeFull, type TradeTarget } from '@/lib/types/trades'
import {
  TrendingUp, TrendingDown, Target, ShieldAlert, Clock, TestTube2,
  Lock, LinkIcon, BarChart2, Send, Loader2, Twitter, PauseCircle, PlayCircle
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface TradeCardProps {
  trade: TradeFull
  showAuthor?: boolean
  showActions?: boolean
  isOwner?: boolean
  onPublish?: (id: string) => void
  onBroadcast?: (id: string) => void
  onClose?: (id: string) => void
  className?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function pct(n: number | null | undefined) {
  if (n == null) return null
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function statusConfig(status: string) {
  const map: Record<string, { label: string; labelAr: string; color: string }> = {
    draft:     { label: 'Draft',     labelAr: 'مسودة',    color: 'bg-gray-600 text-gray-100' },
    published: { label: 'Published', labelAr: 'منشورة',   color: 'bg-blue-600 text-white' },
    active:    { label: 'Active',    labelAr: 'نشطة',     color: 'bg-emerald-600 text-white' },
    stopped:   { label: 'Stopped',   labelAr: 'موقوفة',   color: 'bg-red-600 text-white' },
    completed: { label: 'Completed', labelAr: 'مكتملة',   color: 'bg-teal-600 text-white' },
    cancelled: { label: 'Cancelled', labelAr: 'ملغاة',    color: 'bg-gray-500 text-white' },
    expired:   { label: 'Expired',   labelAr: 'منتهية',   color: 'bg-amber-600 text-white' },
    suspended: { label: 'Suspended', labelAr: 'موقوفة',   color: 'bg-orange-600 text-white' },
  }
  return map[status] ?? { label: status, labelAr: status, color: 'bg-gray-600 text-gray-100' }
}

function directionConfig(direction: string) {
  const map: Record<string, { label: string; labelAr: string; icon: React.ReactNode; color: string }> = {
    long:  { label: 'Long',  labelAr: 'شراء',  icon: <TrendingUp className="w-3 h-3" />,  color: 'text-emerald-400' },
    short: { label: 'Short', labelAr: 'بيع',   icon: <TrendingDown className="w-3 h-3" />, color: 'text-red-400' },
    call:  { label: 'Call',  labelAr: 'Call',   icon: <TrendingUp className="w-3 h-3" />,  color: 'text-emerald-400' },
    put:   { label: 'Put',   labelAr: 'Put',    icon: <TrendingDown className="w-3 h-3" />, color: 'text-red-400' },
  }
  return map[direction] ?? { label: direction, labelAr: direction, icon: null, color: 'text-gray-400' }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TradeCard({
  trade, showAuthor = true, showActions = false, isOwner = false,
  onPublish, onBroadcast, onClose, className,
}: TradeCardProps) {
  const [broadcasting, setBroadcasting] = useState(false)
  const [postingX, setPostingX] = useState(false)
  const [suspending, setSuspending] = useState(false)

  const status    = statusConfig(trade.status)
  const direction = directionConfig(trade.direction)
  const isOption  = trade.trade_type === 'option'
  const details   = trade.option_details

  const pnl = isOption && details
    ? calcOptionPnL(details)
    : calcStockPnL(trade)

  const hitCount  = trade.targets.filter((t: TradeTarget) => t.hit).length
  const totalTgts = trade.targets.length

  const isStopped   = trade.status === 'stopped'
  const isCompleted = trade.status === 'completed'
  const isWinning   = pnl.is_winning && (trade.status === 'active' || trade.status === 'published')

  const cardBorderClass = isStopped
    ? 'border-red-800/60'
    : isCompleted && isWinning
    ? 'border-emerald-700/60'
    : isCompleted
    ? 'border-gray-600/60'
    : isWinning
    ? 'border-emerald-700/40'
    : 'border-gray-700/50'

  async function handleBroadcast() {
    setBroadcasting(true)
    try {
      const res = await fetch(`/api/trades/${trade.id}/broadcast`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to broadcast')
      } else {
        toast.success('تم الإرسال عبر تيليجرام / Broadcast sent')
        onBroadcast?.(trade.id)
      }
    } catch {
      toast.error('Network error')
    } finally {
      setBroadcasting(false)
    }
  }

  async function handleSuspend(action: 'suspend' | 'resume') {
    if (action === 'suspend' && !window.confirm('وقف متابعة هذه الصفقة وإرسال تنبيه بالوقف؟\nSuspend tracking for this trade and send a suspension alert?')) {
      return
    }
    setSuspending(true)
    try {
      const res = await fetch(`/api/trades/${trade.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed')
      } else if (action === 'suspend') {
        toast.success('تم وقف الصفقة / Trade suspended')
        onBroadcast?.(trade.id)
      } else {
        toast.success('تم استئناف المتابعة / Tracking resumed')
        onBroadcast?.(trade.id)
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSuspending(false)
    }
  }

  // A trade is announceable on X once it has shown a positive peak gain.
  const canAnnounceX = pnl.highest_pct != null && pnl.highest_pct > 0

  async function handlePostToX() {
    setPostingX(true)
    try {
      const res = await fetch(`/api/trades/${trade.id}/post-to-twitter`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to post to X')
      } else {
        toast.success('تم النشر على X / Posted to X')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setPostingX(false)
    }
  }

  const entryPrice = isOption ? details?.entry_premium : trade.entry_price
  const currentPrice = isOption ? details?.current_premium : trade.current_price
  const highPrice = isOption ? details?.highest_premium_since_entry : trade.highest_price_since_entry

  return (
    <Card className={cn(
      'bg-gray-900 border rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/30',
      cardBorderClass, className
    )}>
      {/* Header */}
      <CardHeader className="p-4 pb-3 space-y-0">
        <div className="flex items-start justify-between gap-2">
          {/* Symbol + badges */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-white text-lg tracking-wider">
                {isOption ? details?.underlying_symbol ?? trade.symbol : trade.symbol}
              </span>
              <span className={cn('flex items-center gap-1 text-xs font-medium', direction.color)}>
                {direction.icon}
                <span>{direction.labelAr} / {direction.label}</span>
              </span>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap gap-1.5">
              <Badge className={cn('text-[10px] px-2 py-0.5 rounded-full', status.color)}>
                {status.labelAr} / {status.label}
              </Badge>

              <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full border-gray-600 text-gray-300">
                {isOption ? '📋 خيارات / Option' : '📈 سهم / Stock'}
              </Badge>

              {trade.analysis_id && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full border-blue-700 text-blue-300">
                  <LinkIcon className="w-2.5 h-2.5 mr-1" />
                  مرتبط / Linked
                </Badge>
              )}

              {!trade.analysis_id && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full border-gray-600 text-gray-400">
                  مستقلة / Standalone
                </Badge>
              )}

              {trade.is_testing && (
                <Badge className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900 text-amber-200">
                  <TestTube2 className="w-2.5 h-2.5 mr-1" />
                  اختبار / Testing
                </Badge>
              )}

              {!trade.is_public && (
                <Badge className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
                  <Lock className="w-2.5 h-2.5 mr-1" />
                  خاص / Private
                </Badge>
              )}

              {trade.plan && (
                <Badge className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900 text-purple-200">
                  {trade.plan.name}
                </Badge>
              )}
            </div>
          </div>

          {/* P/L indicator */}
          {pnl.highest_pct != null && (
            <div className={cn(
              'text-right shrink-0',
              pnl.is_winning ? 'text-emerald-400' : (isStopped ? 'text-red-400' : 'text-gray-400')
            )}>
              <div className="text-sm font-bold">{pct(pnl.highest_pct)}</div>
              <div className="text-[10px] text-gray-500">أعلى / High</div>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Option details extra row */}
      {isOption && details && (
        <div className="mx-4 mb-2 px-3 py-2 bg-gray-800/50 rounded-lg text-xs text-gray-300 grid grid-cols-3 gap-2">
          <div>
            <span className="text-gray-500">Strike</span>
            <div className="font-mono font-medium text-white">${fmt(details.strike_price)}</div>
          </div>
          <div>
            <span className="text-gray-500">Expiry</span>
            <div className="font-mono text-white">{details.expiration_date}</div>
          </div>
          <div>
            <span className="text-gray-500">نوع / Type</span>
            <div className={cn('font-medium', direction.color)}>
              {details.option_type === 'call' ? 'Call 🟢' : 'Put 🔴'}
            </div>
          </div>
        </div>
      )}

      {/* Price grid */}
      <CardContent className="px-4 pb-3 pt-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PriceCell label="دخول / Entry" value={entryPrice} />
          <PriceCell label="حالي / Current" value={currentPrice} highlight />
          <PriceCell label="أعلى / Highest" value={highPrice} positive />
          <PriceCell label="وقف / Stop" value={trade.stop_loss} negative />
        </div>

        {/* Targets row */}
        {totalTgts > 0 && (
          <div className="mt-3">
            <div className="text-[10px] text-gray-500 mb-1.5 flex items-center gap-1">
              <Target className="w-3 h-3" />
              <span>الأهداف / Targets — {hitCount}/{totalTgts}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {trade.targets.map((t: TradeTarget, i: number) => (
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        'text-[10px] font-mono px-2 py-0.5 rounded border',
                        t.hit
                          ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      )}>
                        {t.hit ? '✓ ' : ''}{t.label}: ${fmt(t.price)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-gray-800 text-gray-100 text-xs">
                      {t.hit ? `Hit at ${t.hit_at?.slice(0, 10)}` : 'Not hit yet'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}

        {/* Author + time */}
        {showAuthor && trade.author && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
            <span>👤 {trade.author.full_name}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(trade.created_at).toLocaleDateString('ar-SA')}
            </span>
          </div>
        )}
      </CardContent>

      {/* Actions */}
      {(showActions && isOwner) && (
        <CardFooter className="px-4 py-3 pt-0 flex flex-wrap gap-2">
          <Link href={`/dashboard/trades/${trade.id}`}>
            <Button size="sm" variant="outline" className="h-7 text-xs border-gray-700 text-gray-300 hover:bg-gray-800">
              <BarChart2 className="w-3 h-3 mr-1" />
              عرض / View
            </Button>
          </Link>

          {trade.status === 'draft' && onPublish && (
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-700 hover:bg-blue-600 text-white"
              onClick={() => onPublish(trade.id)}
            >
              نشر / Publish
            </Button>
          )}

          {['published', 'active'].includes(trade.status) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-emerald-700 text-emerald-400 hover:bg-emerald-900/30"
              onClick={handleBroadcast}
              disabled={broadcasting}
            >
              {broadcasting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
              تيليجرام / Telegram
            </Button>
          )}

          {canAnnounceX && ['published', 'active', 'completed'].includes(trade.status) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-sky-700 text-sky-400 hover:bg-sky-900/30"
              onClick={handlePostToX}
              disabled={postingX}
            >
              {postingX ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Twitter className="w-3 h-3 mr-1" />}
              نشر على X
            </Button>
          )}

          {['published', 'active'].includes(trade.status) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-orange-700 text-orange-400 hover:bg-orange-900/30"
              onClick={() => handleSuspend('suspend')}
              disabled={suspending}
            >
              {suspending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <PauseCircle className="w-3 h-3 mr-1" />}
              وقف / Suspend
            </Button>
          )}

          {trade.status === 'suspended' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-emerald-700 text-emerald-400 hover:bg-emerald-900/30"
              onClick={() => handleSuspend('resume')}
              disabled={suspending}
            >
              {suspending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <PlayCircle className="w-3 h-3 mr-1" />}
              استئناف / Resume
            </Button>
          )}

          {['published', 'active'].includes(trade.status) && onClose && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-red-700 text-red-400 hover:bg-red-900/30"
              onClick={() => onClose(trade.id)}
            >
              <ShieldAlert className="w-3 h-3 mr-1" />
              إغلاق / Close
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceCell({
  label, value, highlight = false, positive = false, negative = false,
}: { label: string; value?: number | null; highlight?: boolean; positive?: boolean; negative?: boolean }) {
  const color = positive ? 'text-emerald-400' : negative ? 'text-red-400' : highlight ? 'text-white' : 'text-gray-300'
  return (
    <div className="bg-gray-800/60 rounded-lg px-2 py-1.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={cn('font-mono text-sm font-semibold', color)}>
        {value != null ? `$${fmt(value)}` : '—'}
      </div>
    </div>
  )
}
