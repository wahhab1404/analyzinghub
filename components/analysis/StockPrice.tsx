'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface StockPriceProps {
  symbol: string
  size?: 'md' | 'lg'
  language?: 'en' | 'ar'
}

const translations = {
  en: {
    livePrice: 'Live Price',
    lastPrice: 'Last Price',
    marketOpen: 'Market Open',
    marketClosed: 'Market Closed',
    preMarket: 'Pre-Market',
    afterHours: 'After Hours',
    high: 'High',
    low: 'Low',
    volume: 'Volume',
    change: 'Change',
    pricesNotAvailable: 'Prices not available',
    priceServiceUnavailable: 'Price service is currently unavailable. Please check back later.',
  },
  ar: {
    livePrice: 'السعر الحالي',
    lastPrice: 'آخر سعر',
    marketOpen: 'السوق مفتوح',
    marketClosed: 'السوق مغلق',
    preMarket: 'ما قبل السوق',
    afterHours: 'بعد السوق',
    high: 'الأعلى',
    low: 'الأدنى',
    volume: 'الحجم',
    change: 'التغير',
    pricesNotAvailable: 'الأسعار غير متاحة',
    priceServiceUnavailable: 'خدمة الأسعار غير متاحة حالياً. يرجى المحاولة لاحقاً.',
  },
}

export function StockPrice({ symbol, size = 'md', language = 'en' }: StockPriceProps) {
  const [price, setPrice] = useState<number | null>(null)
  const [change, setChange] = useState<number | null>(null)
  const [changePercent, setChangePercent] = useState<number | null>(null)
  const [high, setHigh] = useState<number | null>(null)
  const [low, setLow] = useState<number | null>(null)
  const [volume, setVolume] = useState<number | null>(null)
  const [marketStatus, setMarketStatus] = useState<'open' | 'closed' | 'pre-market' | 'after-hours'>('open')
  const [isDelayed, setIsDelayed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const t = translations[language]
  const isRTL = language === 'ar'

  useEffect(() => {
    fetchStockPrice()
    const interval = setInterval(fetchStockPrice, 60000)
    return () => clearInterval(interval)
  }, [symbol])

  const fetchStockPrice = async () => {
    try {
      const response = await fetch(`/api/stock-price?symbol=${encodeURIComponent(symbol)}`)
      if (response.ok) {
        const data = await response.json()

        if (data.price) {
          setPrice(data.price)
          setError(null)

          if (data.change !== undefined && data.changePercent !== undefined) {
            setChange(data.change)
            setChangePercent(data.changePercent)
          }

          if (data.high !== undefined) setHigh(data.high)
          if (data.low !== undefined) setLow(data.low)
          if (data.volume !== undefined) setVolume(data.volume)
          if (data.marketStatus) setMarketStatus(data.marketStatus)
          if (data.isDelayed !== undefined) setIsDelayed(data.isDelayed)
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Prices not available')
      }
    } catch (error) {
      console.error('Error fetching stock price:', error)
      setError('Prices not available')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border animate-pulse">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-red-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">{t.pricesNotAvailable}</p>
            <p className="text-xs text-red-600 dark:text-red-500">{t.priceServiceUnavailable}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!price) {
    return null
  }

  const isPositive = (change || 0) >= 0

  const formatVolume = (vol: number) => {
    if (vol >= 1000000000) return `${(vol / 1000000000).toFixed(2)}B`
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`
    if (vol >= 1000) return `${(vol / 1000).toFixed(2)}K`
    return vol.toString()
  }

  const getMarketStatusLabel = () => {
    switch (marketStatus) {
      case 'open':
        return t.marketOpen
      case 'closed':
        return t.marketClosed
      case 'pre-market':
        return t.preMarket
      case 'after-hours':
        return t.afterHours
      default:
        return t.marketClosed
    }
  }

  const getMarketStatusColor = () => {
    switch (marketStatus) {
      case 'open':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30'
      case 'pre-market':
      case 'after-hours':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30'
      default:
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
    }
  }

  const getPriceLabel = () => {
    return marketStatus === 'open' ? t.livePrice : t.lastPrice
  }

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-10 w-10 rounded-full ${
            isPositive
              ? 'bg-green-500'
              : 'bg-red-500'
          }`}>
            {isPositive ? (
              <TrendingUp className="h-5 w-5 text-white" />
            ) : (
              <TrendingDown className="h-5 w-5 text-white" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {getPriceLabel()}
              </p>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${getMarketStatusColor()}`}>
                {getMarketStatusLabel()}
              </span>
            </div>
            <p className="text-xl font-bold">${price.toFixed(2)}</p>
          </div>
        </div>

        {change !== null && changePercent !== null && (
          <div className={`px-3 py-1.5 rounded-lg ${
            isPositive
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            <p className={`text-sm font-bold ${
              isPositive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
            }`}>
              {isPositive ? '+' : ''}{change.toFixed(2)}
            </p>
            <p className={`text-xs ${
              isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
            }`}>
              {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
            </p>
          </div>
        )}
      </div>

      {(high !== null || low !== null || volume !== null) && (
        <div className="grid grid-cols-3 gap-2">
          {high !== null && (
            <div className="px-2 py-1.5 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-900">
              <p className="text-xs text-muted-foreground">{t.high}</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400">${high.toFixed(2)}</p>
            </div>
          )}
          {low !== null && (
            <div className="px-2 py-1.5 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-900">
              <p className="text-xs text-muted-foreground">{t.low}</p>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">${low.toFixed(2)}</p>
            </div>
          )}
          {volume !== null && (
            <div className="px-2 py-1.5 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-900">
              <p className="text-xs text-muted-foreground">{t.volume}</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatVolume(volume)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
