'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Clock, Radio } from 'lucide-react'

interface MarketStatus {
  isOpen: boolean
  session?: string
  nextOpen?: string
}

export function GlobalMarketBar({ language }: { language: string }) {
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/indices/market-status')
        if (res.ok) {
          const data = await res.json()
          setMarketStatus(data)
        }
      } catch {}
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const etTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime)

  const etDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(currentTime)

  return (
    <div className="flex items-center justify-between px-4 py-0 h-9 bg-[#060b14] border-b border-[#1a2840] text-xs font-mono flex-shrink-0 select-none">
      {/* Left: Branding + Index Labels */}
      <div className="flex items-center gap-5 h-full">
        {/* Logo mark */}
        <div className="flex items-center gap-2 pr-4 border-r border-[#1a2840] h-full">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-blue-400 uppercase">Indices Hub</span>
        </div>

        {/* Index tickers – static labels, live values would plug in here */}
        <TickerChip label="S&P 500" symbol="SPX" />
        <TickerChip label="NASDAQ" symbol="NDX" />
        <TickerChip label="VOLATILITY" symbol="VIX" dim />
        <TickerChip label="DOW" symbol="DJI" />
      </div>

      {/* Right: Market Status + Clock */}
      <div className="flex items-center gap-5">
        {/* Market status indicator */}
        {marketStatus ? (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                marketStatus.isOpen
                  ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
                  : 'bg-red-900/30 text-red-400 border border-red-800/40'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  marketStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                }`}
              />
              {marketStatus.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Radio className="w-3 h-3 animate-pulse" />
            <span className="text-[10px]">Connecting...</span>
          </div>
        )}

        {/* Clock */}
        <div className="flex items-center gap-1.5 text-slate-500 pl-4 border-l border-[#1a2840]">
          <Clock className="w-3 h-3" />
          <span className="text-[10px]">{etDate}</span>
          <span className="text-[10px] text-slate-300 tabular-nums">{etTime}</span>
          <span className="text-[9px] text-slate-600">ET</span>
        </div>
      </div>
    </div>
  )
}

function TickerChip({
  label,
  symbol,
  dim,
}: {
  label: string
  symbol: string
  dim?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[9px] tracking-widest font-semibold ${dim ? 'text-slate-600' : 'text-slate-600'}`}>
        {symbol}
      </span>
      <span className={`text-[10px] font-semibold tabular-nums ${dim ? 'text-amber-400' : 'text-slate-400'}`}>
        —
      </span>
    </div>
  )
}
