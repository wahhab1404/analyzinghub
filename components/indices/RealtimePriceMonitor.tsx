'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, TrendingUp, TrendingDown } from 'lucide-react'

interface PriceUpdate {
  contract_id: string
  price: number
  timestamp: number
  bid: number
  ask: number
  volume: number
  open_interest: number
}

interface RealtimePriceMonitorProps {
  contractId: string
}

export function RealtimePriceMonitor({ contractId }: RealtimePriceMonitorProps) {
  const [priceData, setPriceData] = useState<PriceUpdate | null>(null)
  const [connected, setConnected] = useState(false)
  const [priceHistory, setPriceHistory] = useState<number[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!contractId) return

    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_REALTIME_PRICING_URL || 'http://localhost:3001'}/subscribe?contractId=${contractId}`
    )

    eventSource.onopen = () => {
      setConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setPriceData(data)
        setPriceHistory((prev) => [...prev.slice(-29), data.price])
      } catch (error) {
        console.error('Error parsing price update:', error)
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      eventSource.close()
    }

    eventSourceRef.current = eventSource

    return () => {
      eventSource.close()
    }
  }, [contractId])

  const getPriceChange = () => {
    if (priceHistory.length < 2) return 0
    const previous = priceHistory[priceHistory.length - 2]
    const current = priceHistory[priceHistory.length - 1]
    return ((current - previous) / previous) * 100
  }

  const priceChange = getPriceChange()

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Live Price Monitor</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={connected ? 'default' : 'secondary'}>
                <Activity className={`h-3 w-3 mr-1 ${connected ? 'animate-pulse' : ''}`} />
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {priceData ? (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Current Price</div>
                <div className="text-5xl font-bold flex items-center justify-center gap-2">
                  ${priceData.price.toFixed(2)}
                  {priceChange !== 0 && (
                    <span className={`text-2xl ${priceChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {priceChange > 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
                      {Math.abs(priceChange).toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date(priceData.timestamp).toLocaleTimeString()}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Bid</div>
                  <div className="text-xl font-semibold text-green-500">
                    ${priceData.bid.toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Ask</div>
                  <div className="text-xl font-semibold text-red-500">
                    ${priceData.ask.toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Volume</div>
                  <div className="text-xl font-semibold">
                    {priceData.volume.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Open Interest</div>
                  <div className="text-xl font-semibold">
                    {priceData.open_interest.toLocaleString()}
                  </div>
                </div>
              </div>

              {priceHistory.length > 1 && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Price Movement (Last 30 updates)</div>
                  <div className="h-20 flex items-end gap-1">
                    {priceHistory.map((price, index) => {
                      const maxPrice = Math.max(...priceHistory)
                      const minPrice = Math.min(...priceHistory)
                      const height = ((price - minPrice) / (maxPrice - minPrice)) * 100
                      return (
                        <div
                          key={index}
                          className="flex-1 bg-primary rounded-t"
                          style={{ height: `${height}%` }}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {connected ? 'Waiting for price data...' : 'Connecting to price stream...'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contract Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground break-all">
            {contractId}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
