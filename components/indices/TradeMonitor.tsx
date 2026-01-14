'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Activity, TrendingUp, TrendingDown, Target, AlertTriangle, DollarSign, Clock, ArrowLeft, CircleDot } from 'lucide-react'
import { toast } from 'sonner'
import { getMarketStatus, formatMarketTime } from '@/lib/market-hours'

interface Trade {
  id: string
  status: string
  instrument_type: string
  direction: string
  underlying_index_symbol: string
  polygon_option_ticker: string | null
  strike: number | null
  expiry: string | null
  option_type: string | null
  entry_contract_snapshot: {
    mid: number
    bid?: number
    ask?: number
    timestamp: string
  }
  entry_underlying_snapshot: {
    price: number
    timestamp: string
  }
  current_contract: number
  current_underlying: number
  contract_high_since: number
  contract_low_since: number
  underlying_high_since: number
  underlying_low_since: number
  targets: Array<{ price: number, percentage: number, hit?: boolean }>
  stoploss: { price: number, percentage: number } | null
  notes: string | null
  published_at: string
  last_quote_at: string
}

interface TradeMonitorProps {
  tradeId: string
  onBack: () => void
}

export function TradeMonitor({ tradeId, onBack }: TradeMonitorProps) {
  const [trade, setTrade] = useState<Trade | null>(null)
  const [loading, setLoading] = useState(true)
  const [priceHistory, setPriceHistory] = useState<number[]>([])
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [refreshSecondsAgo, setRefreshSecondsAgo] = useState(0)
  const [marketStatus, setMarketStatus] = useState(getMarketStatus())

  useEffect(() => {
    fetchTrade()
    const interval = setInterval(fetchTrade, 5000)
    return () => clearInterval(interval)
  }, [tradeId])

  useEffect(() => {
    if (!trade?.last_quote_at) return

    const updateSecondsAgo = () => {
      const lastUpdate = new Date(trade.last_quote_at).getTime()
      const now = Date.now()
      const seconds = Math.floor((now - lastUpdate) / 1000)
      setSecondsAgo(seconds)
    }

    updateSecondsAgo()
    const interval = setInterval(updateSecondsAgo, 1000)
    return () => clearInterval(interval)
  }, [trade?.last_quote_at])

  useEffect(() => {
    if (!lastFetchTime) return

    const updateRefreshTime = () => {
      const seconds = Math.floor((Date.now() - lastFetchTime.getTime()) / 1000)
      setRefreshSecondsAgo(seconds)
    }

    updateRefreshTime()
    const interval = setInterval(updateRefreshTime, 1000)
    return () => clearInterval(interval)
  }, [lastFetchTime])

  useEffect(() => {
    const updateMarketStatus = () => {
      setMarketStatus(getMarketStatus())
    }

    updateMarketStatus()
    const interval = setInterval(updateMarketStatus, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const fetchTrade = async () => {
    try {
      const response = await fetch(`/api/indices/trades/${tradeId}`)
      if (response.ok) {
        const data = await response.json()
        setTrade(data.trade)
        setLastFetchTime(new Date())

        if (data.trade) {
          setPriceHistory(prev => [...prev.slice(-29), data.trade.current_contract])
        }
      } else {
        toast.error('Failed to load trade')
      }
    } catch (error) {
      console.error('Error fetching trade:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculatePnL = () => {
    if (!trade) return { percentage: 0, absolute: 0, isPositive: false }

    const entryPrice = trade.entry_contract_snapshot.mid

    // For CALL/LONG: best profit is at highest price
    // For PUT/SHORT: best profit is at lowest price
    const bestPrice = (trade.direction === 'call' || trade.direction === 'long')
      ? trade.contract_high_since
      : trade.contract_low_since

    const pnlPercentage = ((bestPrice - entryPrice) / entryPrice) * 100
    const pnlAbsolute = bestPrice - entryPrice

    const multiplier = trade.direction === 'call' || trade.direction === 'long' ? 1 : -1

    return {
      percentage: pnlPercentage * multiplier,
      absolute: pnlAbsolute * multiplier,
      isPositive: pnlPercentage * multiplier > 0,
    }
  }

  const calculateUnderlyingChange = () => {
    if (!trade) return { percentage: 0, isPositive: false }

    const entryPrice = trade.entry_underlying_snapshot.price
    const currentPrice = trade.current_underlying
    const changePercentage = ((currentPrice - entryPrice) / entryPrice) * 100

    return {
      percentage: changePercentage,
      isPositive: changePercentage > 0,
    }
  }

  const getPriceChange = () => {
    if (priceHistory.length < 2) return 0
    const previous = priceHistory[priceHistory.length - 2]
    const current = priceHistory[priceHistory.length - 1]
    return ((current - previous) / previous) * 100
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!trade) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Trade not found
          </div>
        </CardContent>
      </Card>
    )
  }

  const pnl = calculatePnL()
  const underlyingChange = calculateUnderlyingChange()
  const priceChange = getPriceChange()
  const hitsTarget = trade.targets.filter(t => t.hit).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Badge variant="default">
            <Activity className="h-3 w-3 mr-1 animate-pulse" />
            Live Monitoring
          </Badge>
          <Badge
            variant={marketStatus.isOpen ? 'default' : 'outline'}
            className={marketStatus.isOpen ? 'bg-green-500' : 'border-yellow-500 text-yellow-700'}
          >
            <CircleDot className="h-3 w-3 mr-1" />
            {marketStatus.message}
          </Badge>
        </div>
        {lastFetchTime && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Refreshed {refreshSecondsAgo}s ago • {formatMarketTime()}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {trade.instrument_type === 'options' ? (
                  <>
                    {trade.underlying_index_symbol} ${trade.strike} {trade.option_type?.toUpperCase()}
                  </>
                ) : (
                  <>
                    {trade.underlying_index_symbol} {trade.direction.toUpperCase()}
                  </>
                )}
              </CardTitle>
              {trade.polygon_option_ticker && (
                <p className="text-sm text-muted-foreground font-mono">
                  {trade.polygon_option_ticker}
                </p>
              )}
              {trade.expiry && (
                <p className="text-sm text-muted-foreground">
                  Expires: {new Date(trade.expiry).toLocaleDateString()}
                </p>
              )}
            </div>
            <Badge variant={trade.status === 'active' ? 'default' : 'secondary'}>
              {trade.status}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Contract Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold flex items-center justify-center gap-2">
                  ${trade.current_contract.toFixed(4)}
                  {priceChange !== 0 && (
                    <span className={`text-xl ${priceChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {priceChange > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>
                    {secondsAgo < 60
                      ? `${secondsAgo}s ago`
                      : secondsAgo < 3600
                      ? `${Math.floor(secondsAgo / 60)}m ago`
                      : new Date(trade.last_quote_at).toLocaleTimeString()
                    }
                  </span>
                  {secondsAgo > 120 && (
                    <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                      Stale
                    </Badge>
                  )}
                  {!marketStatus.isOpen && (
                    <Badge variant="outline" className="text-xs border-gray-400 text-gray-600">
                      Market Closed
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Entry</div>
                  <div className="text-lg font-semibold">
                    ${trade.entry_contract_snapshot.mid.toFixed(4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={`text-sm ${pnl.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    P&L
                  </div>
                  <div className={`text-lg font-semibold ${pnl.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {pnl.percentage > 0 ? '+' : ''}{pnl.percentage.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    High
                  </div>
                  <div className="text-lg font-semibold text-green-600">
                    ${trade.contract_high_since.toFixed(4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    Low
                  </div>
                  <div className="text-lg font-semibold text-red-600">
                    ${trade.contract_low_since.toFixed(4)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Underlying Index
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">
                  {trade.underlying_index_symbol}
                </div>
                <div className="text-4xl font-bold flex items-center justify-center gap-2">
                  ${trade.current_underlying.toFixed(2)}
                  {underlyingChange.percentage !== 0 && (
                    <span className={`text-xl ${underlyingChange.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {underlyingChange.isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </span>
                  )}
                </div>
                <div className={`text-sm mt-1 ${underlyingChange.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {underlyingChange.percentage > 0 ? '+' : ''}{underlyingChange.percentage.toFixed(2)}% since entry
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    High
                  </div>
                  <div className="text-lg font-semibold text-green-600">
                    ${trade.underlying_high_since.toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    Low
                  </div>
                  <div className="text-lg font-semibold text-red-600">
                    ${trade.underlying_low_since.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {priceHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Price Movement (Last 30 updates)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-end gap-1">
              {priceHistory.map((price, index) => {
                const maxPrice = Math.max(...priceHistory)
                const minPrice = Math.min(...priceHistory)
                const height = ((price - minPrice) / (maxPrice - minPrice)) * 100
                return (
                  <div
                    key={index}
                    className="flex-1 bg-primary rounded-t transition-all"
                    style={{ height: `${height}%` }}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {trade.targets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4" />
              Targets ({hitsTarget}/{trade.targets.length} hit)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trade.targets.map((target, index) => {
                const distance = ((target.price - trade.current_contract) / trade.current_contract) * 100
                const multiplier = trade.direction === 'call' || trade.direction === 'long' ? 1 : -1
                const adjustedDistance = distance * multiplier

                return (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={target.hit ? 'default' : 'outline'} className={target.hit ? 'bg-green-500' : ''}>
                        TP{index + 1}
                      </Badge>
                      <div>
                        <div className="font-semibold">${target.price.toFixed(4)}</div>
                        <div className="text-xs text-muted-foreground">
                          Target: {target.percentage}%
                        </div>
                      </div>
                    </div>
                    <div className={`text-right ${adjustedDistance > 0 ? 'text-muted-foreground' : 'text-green-500'}`}>
                      <div className="font-semibold">
                        {adjustedDistance > 0 ? `${adjustedDistance.toFixed(2)}% away` : 'HIT'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {trade.stoploss && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Stop Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50">
              <div>
                <div className="font-semibold text-red-600">${trade.stoploss.price.toFixed(4)}</div>
                <div className="text-xs text-muted-foreground">
                  Stop: {trade.stoploss.percentage}%
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-muted-foreground">
                  {Math.abs(((trade.stoploss.price - trade.current_contract) / trade.current_contract) * 100).toFixed(2)}% away
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {trade.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{trade.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
