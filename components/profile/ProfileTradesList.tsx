'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Target,
  Activity,
  Clock,
  BarChart3,
  Lock,
  Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

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

export function ProfileTradesList({ profileId, isOwnProfile, hasSubscription }: ProfileTradesListProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [showLocked, setShowLocked] = useState(false)

  useEffect(() => {
    fetchTrades()
  }, [profileId])

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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string; icon: any }> = {
      active: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Active', icon: Activity },
      closed: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', label: 'Closed', icon: Clock },
      expired: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', label: 'Expired', icon: Calendar }
    }
    const variant = variants[status] || variants.closed
    const Icon = variant.icon
    return (
      <Badge className={`${variant.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {variant.label}
      </Badge>
    )
  }

  const getOutcomeBadge = (isWin?: boolean | null) => {
    if (isWin === true) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1">
          <TrendingUp className="h-3 w-3" />
          WIN
        </Badge>
      )
    } else if (isWin === false) {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 gap-1">
          <TrendingDown className="h-3 w-3" />
          LOSS
        </Badge>
      )
    }
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    )
  }

  const formatCurrency = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}$${value.toFixed(2)}`
  }

  const calculateProfit = (trade: Trade) => {
    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0
    const multiplier = trade.contract_multiplier || 100
    const qty = trade.qty || 1
    const entryCost = entryPrice * multiplier * qty

    if (trade.status === 'closed') {
      if (trade.computed_profit_usd != null) {
        return parseFloat(trade.computed_profit_usd.toString())
      } else if (trade.is_win === false) {
        return -entryCost
      }
      return 0
    } else {
      const peakPrice = trade.peak_price_after_entry || trade.contract_high_since || entryPrice
      return (peakPrice - entryPrice) * multiplier * qty
    }
  }

  const calculatePercentageReturn = (trade: Trade) => {
    if (!trade.entry_contract_snapshot?.mid && !trade.entry_contract_snapshot?.last) return null
    const entryPrice = trade.entry_contract_snapshot.mid || trade.entry_contract_snapshot.last
    if (entryPrice === 0) return null

    const multiplier = trade.contract_multiplier || 100
    const qty = trade.qty || 1
    const entryCost = entryPrice * multiplier * qty

    const profitValue = calculateProfit(trade)
    const percentReturn = (profitValue / entryCost) * 100
    return percentReturn
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (showLocked) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="py-12 text-center">
          <Lock className="h-16 w-16 mx-auto text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-xl font-semibold mb-2">Active Trades Locked</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Subscribe to this analyst to view their active trades and receive real-time updates
          </p>
          <Button asChild>
            <Link href="#subscription-plans">
              View Subscription Plans
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
          <p className="text-muted-foreground">
            {isOwnProfile ? "You haven't created any trades yet" : "No trades available"}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Trades</p>
                  <p className="text-2xl font-bold">{stats.total_trades}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-blue-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className={`text-2xl font-bold ${stats.win_rate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.win_rate}%
                  </p>
                </div>
                <Target className="h-8 w-8 text-green-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total P/L</p>
                  <p className={`text-2xl font-bold ${stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(stats.total_pnl)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-purple-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold">{stats.active_trades}</p>
                </div>
                <Activity className="h-8 w-8 text-orange-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        {trades.map((trade) => {
          const percentReturn = calculatePercentageReturn(trade)
          const profitValue = calculateProfit(trade)
          const isActive = trade.status === 'active'

          return (
            <Card key={trade.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold">
                        {trade.underlying_index_symbol} {trade.strike}{trade.option_type?.toUpperCase()}
                      </h3>
                      {getStatusBadge(trade.status)}
                      {trade.status === 'closed' && getOutcomeBadge(trade.is_win)}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">Direction</p>
                        <Badge variant={trade.option_type?.toUpperCase() === 'C' ? 'default' : 'destructive'}>
                          {trade.option_type?.toUpperCase() === 'C' ? '📈 CALL' : '📉 PUT'}
                        </Badge>
                      </div>

                      <div>
                        <p className="text-muted-foreground mb-1">Expiry</p>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span className="font-medium">{format(new Date(trade.expiry), 'MMM dd, yyyy')}</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-muted-foreground mb-1">Entry Price</p>
                        <span className="font-medium">
                          ${(trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0).toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <p className="text-muted-foreground mb-1">Highest Price</p>
                        <span className="font-medium">
                          ${(trade.peak_price_after_entry || trade.contract_high_since || trade.current_contract || 0).toFixed(2)}
                        </span>
                        {trade.peak_price_after_entry && trade.entry_contract_snapshot && (
                          <span className={`text-xs ml-1 ${
                            trade.peak_price_after_entry >= (trade.entry_contract_snapshot.mid || trade.entry_contract_snapshot.last)
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            {trade.peak_price_after_entry >= (trade.entry_contract_snapshot.mid || trade.entry_contract_snapshot.last) ? '+' : ''}
                            ${(trade.peak_price_after_entry - (trade.entry_contract_snapshot.mid || trade.entry_contract_snapshot.last)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      isActive
                        ? profitValue >= 0 ? 'text-blue-600' : 'text-orange-600'
                        : profitValue >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(profitValue)}
                    </div>
                    {percentReturn !== null && (
                      <p className={`text-sm ${percentReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({percentReturn >= 0 ? '+' : ''}{percentReturn.toFixed(1)}%)
                      </p>
                    )}
                    {trade.closed_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Closed {format(new Date(trade.closed_at), 'MMM dd')}
                      </p>
                    )}
                  </div>
                </div>

                {trade.analysis_id && (
                  <div className="mt-4 pt-4 border-t">
                    <Link
                      href={`/dashboard/analysis/${trade.analysis_id}`}
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Target className="h-3 w-3" />
                      View related analysis
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
