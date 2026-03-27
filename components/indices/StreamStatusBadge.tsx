'use client'

import { cn } from '@/lib/utils'
import { Activity, AlertTriangle, WifiOff, HelpCircle } from 'lucide-react'

export type FreshnessStatus = 'fresh' | 'degraded' | 'stale' | 'unknown'

interface StreamStatusBadgeProps {
  status: FreshnessStatus
  lastEventAt?: string | null
  /** If true, show only the icon with a tooltip-friendly title attribute */
  compact?: boolean
  className?: string
}

const CONFIG: Record<FreshnessStatus, {
  label: string
  icon: React.ElementType
  className: string
  title: string
}> = {
  fresh: {
    label: 'Live',
    icon: Activity,
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    title: 'Streaming data is live and up-to-date',
  },
  degraded: {
    label: 'Delayed',
    icon: AlertTriangle,
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    title: 'Streaming reconnecting — data may be slightly delayed',
  },
  stale: {
    label: 'Offline',
    icon: WifiOff,
    className: 'text-red-400 bg-red-500/10 border-red-500/20',
    title: 'Streaming disconnected — using REST snapshot fallback',
  },
  unknown: {
    label: 'Pending',
    icon: HelpCircle,
    className: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    title: 'Awaiting first streaming connection',
  },
}

function timeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (seconds < 5)   return 'just now'
  if (seconds < 60)  return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

export function StreamStatusBadge({
  status,
  lastEventAt,
  compact = false,
  className,
}: StreamStatusBadgeProps) {
  const cfg = CONFIG[status] ?? CONFIG.unknown
  const Icon = cfg.icon

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center w-5 h-5 rounded-full border',
          cfg.className,
          className
        )}
        title={cfg.title}
      >
        <Icon className="w-3 h-3" />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium',
        'rounded-full border',
        cfg.className,
        className
      )}
      title={cfg.title}
    >
      <Icon className={cn(
        'w-3 h-3',
        status === 'fresh' && 'animate-pulse'
      )} />
      {cfg.label}
      {lastEventAt && status === 'fresh' && (
        <span className="opacity-60">{timeAgo(lastEventAt)}</span>
      )}
    </span>
  )
}
