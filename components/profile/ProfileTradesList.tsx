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
  profit_from_entry: number
  max_profit: number
  final_profit: number | null
  is_winning_trade: boolean
  trade_outcome: string
  entry_contract_snapshot: any
  current_contract: number
  max_contract_price: number | null
  analysis_id: string | null
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
      const response = await fetch(`/api/profiles/${profileId}/trades`)
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
        setStats(data.stats || null)
        setShowLocked(!isOwnProfile && !hasSubscription && data.hasActiveTrades)
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

  const getOutcomeBadge = (outcome: string) => {
    const variants: Record<string, { color: string; label: string; icon: any }> = {
      big_win: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Big Win', icon: TrendingUp },
      small_win: { color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300', label: 'Small Win', icon: TrendingUp },
      breakeven: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', label: 'Breakeven', icon: Target },
      small_loss: { color: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300', label: 'Small Loss', icon: TrendingDown },
      big_loss: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Big Loss', icon: TrendingDown },
      pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', label: 'Pending', icon: Clock }
    }
    const variant = variants[outcome] || variants.pending
    const Icon = variant.icon
    return (
      <Badge className={`${variant.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {variant.label}
      </Badge>
    )
  }

  const formatCurrency = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}$${value.toFixed(2)}`
  }

  const calculatePercentageReturn = (trade: Trade) => {
    if (!trade.entry_contract_snapshot?.mid && !trade.entry_contract_snapshot?.last) return null
    const entryPrice = trade.entry_contract_snapshot.mid || trade.entry_contract_snapshot.last
    if (entryPrice === 0) return null

    // Use final_profit for closed trades, max_profit for active trades (best profit achieved)
    const profitValue = trade.status === 'closed'
      ? (trade.final_profit ?? trade.max_profit ?? 0)
      : (trade.max_profit ?? 0)

    const percentReturn = (profitValue / (entryPrice * 100)) * 100
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
          const isWin = trade.is_winning_trade
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
                      {trade.status === 'closed' && getOutcomeBadge(trade.trade_outcome)}
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

                      {isActive ? (
                        <div>
                          <p className="text-muted-foreground mb-1">Current Price</p>
                          <span className="font-medium">${(trade.current_contract || 0).toFixed(2)}</span>
                        </div>
                      ) : (
                        <div>
                          <p className="text-muted-foreground mb-1">Max Price</p>
                          <span className="font-medium">
                            ${(trade.max_contract_price || trade.current_contract || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      isActive
                        ? (trade.max_profit ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600'
                        : (trade.final_profit ?? trade.max_profit ?? 0) >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                    }`}>
                      {formatCurrency(
                        isActive
                          ? (trade.max_profit ?? 0)
                          : (trade.final_profit ?? trade.max_profit ?? 0)
                      )}
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
