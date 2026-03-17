'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react'

interface TickerData {
  sym: string
  val: string
  chg: string
  up: boolean
}

interface MarketStatus {
  isOpen: boolean
  label: string
  status: string
}

interface BarData {
  indices_bar: TickerData[]
  marketStatus: MarketStatus
}

const LABELS: Record<string, string> = {
  SPX: 'S&P 500',
  NDX: 'NASDAQ',
  VIX: 'VIX',
  DJI: 'DOW',
}

export function GlobalMarketBar({ language }: { language: string }) {
  const [data, setData] = useState<BarData | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/market-ticker', { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json.indices_bar) {
            setData({ indices_bar: json.indices_bar, marketStatus: json.marketStatus })
            setLastUpdated(new Date())
          }
        }
      } catch {}
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
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

  const ms = data?.marketStatus
  const isOpen = ms?.isOpen ?? false
  const statusLabel = ms?.label ?? '...'

  return (
    <div className="flex items-center justify-between px-3 sm:px-5 h-9 bg-[#060b14] border-b border-[#1a2840] text-xs font-mono flex-shrink-0 select-none overflow-hidden">

      {/* LEFT: Brand + tickers */}
      <div className="flex items-center gap-0 h-full min-w-0">

        {/* Brand */}
        <div className="flex items-center gap-2 pr-4 border-r border-[#1a2840] h-full flex-shrink-0">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-2.5 h-2.5 rounded-full bg-blue-500/30 animate-ping" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          </div>
          <span className="text-[10px] font-bold tracking-[0.2em] text-blue-400 uppercase hidden sm:block">
            Indices Hub
          </span>
          <span className="text-[10px] font-bold tracking-[0.15em] text-blue-400 uppercase sm:hidden">
            IDX
          </span>
        </div>

        {/* Tickers */}
        <div className="hidden md:flex items-center h-full divide-x divide-[#1a2840]">
          {data
            ? data.indices_bar.map((t) => (
                <TickerChip key={t.sym} ticker={t} label={LABELS[t.sym] ?? t.sym} />
              ))
            : ['SPX', 'NDX', 'VIX', 'DJI'].map((sym) => (
                <SkeletonChip key={sym} sym={sym} />
              ))}
        </div>
      </div>

      {/* RIGHT: status + clock */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">

        {/* Live pulse */}
        {lastUpdated && (
          <div className="hidden sm:flex items-center gap-1.5 text-slate-600">
            <Activity className="w-3 h-3 text-blue-600" />
            <span className="text-[9px] tabular-nums text-slate-600">
              {lastUpdated.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}

        {/* Separator */}
        <div className="hidden sm:block w-px h-4 bg-[#1a2840]" />

        {/* Market status */}
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold tracking-wider border ${
            isOpen
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
              : statusLabel === 'PRE-MKT' || statusLabel === 'AFTER-HRS'
              ? 'bg-amber-950/50 text-amber-400 border-amber-800/40'
              : 'bg-red-950/40 text-red-400 border-red-900/40'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isOpen
                ? 'bg-emerald-400 animate-pulse'
                : statusLabel === 'PRE-MKT' || statusLabel === 'AFTER-HRS'
                ? 'bg-amber-400'
                : 'bg-red-500'
            }`}
          />
          <span className="hidden sm:inline">{statusLabel}</span>
          <span className="sm:hidden">{isOpen ? 'OPEN' : 'CLOSED'}</span>
        </span>

        {/* Clock */}
        <div className="flex items-center gap-1.5 pl-2 sm:pl-3 border-l border-[#1a2840] text-slate-500">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span className="hidden sm:inline text-[9px]">{etDate}</span>
          <span className="text-[9px] sm:text-[10px] text-slate-300 tabular-nums">
            {etTime.slice(0, 5)}
            <span className="hidden sm:inline">{etTime.slice(5)}</span>
          </span>
          <span className="text-[9px] text-slate-600">ET</span>
        </div>
      </div>
    </div>
  )
}

function TickerChip({ ticker, label }: { ticker: TickerData; label: string }) {
  const isVix = ticker.sym === 'VIX'
  // For VIX: rising is bad (amber), falling is good (emerald) — flip colour logic
  const up = isVix ? !ticker.up : ticker.up
  const priceColor = up ? 'text-emerald-400' : 'text-red-400'
  const changeColor = up ? 'text-emerald-500' : 'text-red-500'
  const Icon = ticker.up ? TrendingUp : TrendingDown

  return (
    <div className="flex items-center gap-2 px-4 h-full hover:bg-white/[0.02] transition-colors">
      {/* Symbol + label */}
      <div className="flex flex-col items-start leading-none gap-0.5">
        <span className="text-[9px] font-bold tracking-widest text-slate-400">{ticker.sym}</span>
        <span className="text-[8px] text-slate-600 tracking-wide hidden lg:block">{label}</span>
      </div>

      {/* Price */}
      <span className={`text-[11px] font-bold tabular-nums ${priceColor}`}>
        {ticker.val === '—' ? <span className="text-slate-600">—</span> : ticker.val}
      </span>

      {/* Change */}
      {ticker.chg !== '—' && (
        <div className={`flex items-center gap-0.5 ${changeColor}`}>
          <Icon className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="text-[9px] font-semibold tabular-nums">{ticker.chg}</span>
        </div>
      )}
    </div>
  )
}

function SkeletonChip({ sym }: { sym: string }) {
  return (
    <div className="flex items-center gap-2 px-4 h-full">
      <span className="text-[9px] font-bold tracking-widest text-slate-600">{sym}</span>
      <span className="w-14 h-2.5 rounded bg-slate-800 animate-pulse" />
    </div>
  )
}
