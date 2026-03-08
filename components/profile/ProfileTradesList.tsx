'use client'

import { useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, Calendar, DollarSign,
  Target, Activity, Clock, BarChart3, Lock, Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Trade {
  id: string
  underlying_index_symbol: string
  strike: string
  option_type: string
  direction: string
  status: string
  expiry: string
  created_at: string
  closed_at: string | null
  computed_profit_usd: number | null
  is_win: boolean | null
  peak_price_after_entry: number | null
  entry_contract_snapshot: any
  current_contract: number
  contract_high_since: number | null
  contract_low_since: number | null
  analysis_id: string | null
  qty: number
  contract_multiplier: number
}

interface ProfileTradesListProps {
  profileId: string
  isOwnProfile: boolean
  hasSubscription: boolean
}

const usd = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ProfileTradesList({ profileId, isOwnProfile, hasSubscription }: ProfileTradesListProps) {
  const [trades, setTrades]   = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats]     = useState<any>(null)
  const [showLocked, setShowLocked] = useState(false)

  useEffect(() => { fetchTrades() }, [profileId])

  const fetchTrades = async () => {
    try {
      const response = await fetch(`/api/profiles/${profileId}/trades`, {
        credentials: 'include',
        cache: 'no-store'
      })
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
        setStats(data.stats || null)
        setShowLocked(!isOwnProfile && !hasSubscription && data.hasActiveTrades)
      } else if (response.status === 401) {
        console.error('Unauthorized - user not logged in')
      }
    } catch (error) {
      console.error('Failed to fetch trades:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateProfit = (trade: Trade) => {
    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0
    const multiplier = trade.contract_multiplier || 100
    const qty = trade.qty || 1
    const entryCost = entryPrice * multiplier * qty

    if (trade.status === 'closed') {
      if (trade.computed_profit_usd != null) return parseFloat(trade.computed_profit_usd.toString())
      if (trade.is_win === false) return -entryCost
      return 0
    } else {
      const peakPrice = trade.peak_price_after_entry || trade.contract_high_since || entryPrice
      return (peakPrice - entryPrice) * multiplier * qty
    }
  }

  const calculatePct = (trade: Trade) => {
    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last
    if (!entryPrice || entryPrice === 0) return null
    const multiplier = trade.contract_multiplier || 100
    const qty = trade.qty || 1
    const entryCost = entryPrice * multiplier * qty
    return (calculateProfit(trade) / entryCost) * 100
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Locked ───────────────────────────────────────────────────────────────────
  if (showLocked) {
    return (
      <div className="bg-card border border-border rounded-sm p-10 text-center">
        <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Active Trades Locked</h3>
        <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">
          Subscribe to this analyst to view live trades and real-time alerts.
        </p>
        <Button asChild size="sm" className="rounded-sm text-xs">
          <Link href="#subscription-plans">View Plans</Link>
        </Button>
      </div>
    )
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-sm p-10 text-center">
        <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground opacity-40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {isOwnProfile ? "You haven't created any trades yet." : 'No trades available.'}
        </p>
      </div>
    )
  }

  // ── Stats bar ────────────────────────────────────────────────────────────────
  const statItems = stats ? [
    { icon: BarChart3, label: 'Total Trades', value: stats.total_trades,     color: '#58A6FF' },
    { icon: Target,    label: 'Win Rate',     value: `${stats.win_rate}%`,   color: stats.win_rate >= 50 ? '#3FB950' : '#F85149' },
    { icon: DollarSign,label: 'Total P/L',
      value: `${stats.total_pnl >= 0 ? '+' : ''}${usd(stats.total_pnl)}`,
      color: stats.total_pnl >= 0 ? '#3FB950' : '#F85149' },
    { icon: Activity,  label: 'Active',       value: stats.active_trades,    color: '#E3B341' },
  ] : []

  return (
    <div className="space-y-4">

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statItems.map(s => {
            const Icon = s.icon
            return (
              <div key={s.label}
                className="bg-card border border-border rounded-sm px-3 py-2.5 flex items-center gap-2.5">
                <div className="h-7 w-7 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: `${s.color}15` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{s.label}</div>
                  <div className="text-sm font-black num leading-tight" style={{ color: s.color }}>{s.value}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Trades table */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-border bg-muted/10">
          {['Contract', 'Details', 'Entry', 'High', 'P/L $', 'P/L %', 'Status'].map(h => (
            <div key={h} className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{h}</div>
          ))}
        </div>

        <div className="divide-y divide-border">
          {trades.map(trade => {
            const pnl     = calculateProfit(trade)
            const pct     = calculatePct(trade)
            const isActive = trade.status === 'active'
            const isCall  = trade.option_type?.toUpperCase() === 'C'
            const pnlColor = isActive
              ? (pnl >= 0 ? '#58A6FF' : '#E3B341')
              : (pnl >= 0 ? '#3FB950' : '#F85149')

            const entryPrice  = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0
            const highPrice   = trade.peak_price_after_entry || trade.contract_high_since || trade.current_contract || 0

            const statusConfig: Record<string, { color: string; label: string }> = {
              active:  { color: '#58A6FF', label: 'Active'  },
              closed:  { color: '#8B949E', label: 'Closed'  },
              expired: { color: '#E3B341', label: 'Expired' },
            }
            const sc = statusConfig[trade.status] || statusConfig.closed

            const outcomeColor = trade.is_win === true ? '#3FB950' : trade.is_win === false ? '#F85149' : '#E3B341'
            const outcomeLabel = trade.is_win === true ? 'WIN' : trade.is_win === false ? 'LOSS' : 'Open'

            return (
              <div key={trade.id}
                className="px-4 py-3 hover:bg-muted/10 transition-colors">

                {/* Mobile layout */}
                <div className="sm:hidden">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-black text-foreground">
                          {trade.underlying_index_symbol}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">
                          {trade.strike}{trade.option_type?.toUpperCase()}
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: isCall ? '#3FB950' : '#F85149',
                            background: isCall ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)'
                          }}>
                          {isCall ? 'CALL' : 'PUT'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Calendar className="h-2.5 w-2.5" />
                        {format(new Date(trade.expiry), 'MMM dd, yy')}
                        {trade.closed_at && (
                          <span>· Closed {format(new Date(trade.closed_at), 'MMM dd')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black num" style={{ color: pnlColor }}>
                        {pnl >= 0 ? '+' : ''}{usd(pnl)}
                      </div>
                      {pct !== null && (
                        <div className="text-[10px] font-bold num" style={{ color: pnlColor }}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                      style={{ color: sc.color, background: `${sc.color}12`, borderColor: `${sc.color}30` }}>
                      {sc.label}
                    </span>
                    {trade.status === 'closed' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                        style={{ color: outcomeColor, background: `${outcomeColor}12`, borderColor: `${outcomeColor}30` }}>
                        {outcomeLabel}
                      </span>
                    )}
                    {trade.analysis_id && (
                      <Link href={`/dashboard/analysis/${trade.analysis_id}`}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5 ml-auto">
                        <Target className="h-2.5 w-2.5" />
                        Analysis
                      </Link>
                    )}
                  </div>
                </div>

                {/* Desktop table row */}
                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-x-4 items-center">
                  {/* Contract */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-foreground">{trade.underlying_index_symbol}</span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: isCall ? '#3FB950' : '#F85149',
                        background: isCall ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)'
                      }}>
                      {isCall ? 'CALL' : 'PUT'}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">
                      {trade.strike}{trade.option_type?.toUpperCase()} · Exp {format(new Date(trade.expiry), 'MMM dd, yy')}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {format(new Date(trade.created_at), 'MMM dd, yy')}
                      {trade.analysis_id && (
                        <Link href={`/dashboard/analysis/${trade.analysis_id}`}
                          className="text-primary hover:underline ml-1">· Analysis</Link>
                      )}
                    </div>
                  </div>

                  {/* Entry */}
                  <div className="text-xs font-bold num text-foreground text-right">
                    ${entryPrice.toFixed(2)}
                  </div>

                  {/* High */}
                  <div className="text-xs font-bold num text-right" style={{ color: '#3FB950' }}>
                    ${highPrice.toFixed(2)}
                  </div>

                  {/* P/L $ */}
                  <div className="text-sm font-black num text-right" style={{ color: pnlColor }}>
                    {pnl >= 0 ? '+' : ''}{usd(pnl)}
                  </div>

                  {/* P/L % */}
                  <div className="text-xs font-bold num text-right" style={{ color: pnlColor }}>
                    {pct !== null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                  </div>

                  {/* Status */}
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                      style={{ color: sc.color, background: `${sc.color}12`, borderColor: `${sc.color}30` }}>
                      {sc.label}
                    </span>
                    {trade.status === 'closed' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                        style={{ color: outcomeColor, background: `${outcomeColor}12`, borderColor: `${outcomeColor}30` }}>
                        {outcomeLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
