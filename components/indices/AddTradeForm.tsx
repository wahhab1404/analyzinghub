'use client'

import { useState, useEffect, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader as Loader2, Plus, Trash2, Search, Calendar, TrendingUp, CheckCircle2, XCircle, Clock, Moon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { TradeReentryDialog } from './TradeReentryDialog'

interface AddTradeFormProps {
  analysisId?: string | null
  indexSymbol?: string
  onComplete: () => void
  onCancel: () => void
  standalone?: boolean
}

interface OptionContract {
  ticker: string
  strike: number
  expiry: string
  type: 'call' | 'put'
  bid?: number
  ask?: number
  mid?: number
  last?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
}

interface ExpirationGroup {
  expirationDate: string
  dte: number
  strikes: OptionContract[]
}

interface StrikeRow {
  strike: number
  call?: OptionContract
  put?: OptionContract
}

interface Target {
  price: number
  percentage: number
}

type DatePreset = 'today' | 'tomorrow' | 'week' | 'month' | 'custom'

interface TelegramChannel {
  id: string
  channel_name: string
  channel_id: string
  source: 'analyst' | 'plan' | 'analysis'
  plan_name?: string
}

type BulkQuote = { bid: number; ask: number; mid: number; last: number; volume: number; openInterest: number }

/**
 * Merge freshly fetched live quotes into existing expiration groups in place,
 * matched by ticker. A non-positive fresh value keeps the previous one so a
 * transient empty snapshot doesn't blank out a displayed price.
 */
function mergeQuotesIntoGroups(groups: ExpirationGroup[], quotes: Record<string, BulkQuote>): ExpirationGroup[] {
  return groups.map(group => ({
    ...group,
    strikes: group.strikes.map(strike => {
      const q = strike.ticker ? quotes[strike.ticker] : undefined
      if (!q) return strike
      return {
        ...strike,
        bid: q.bid > 0 ? q.bid : strike.bid,
        ask: q.ask > 0 ? q.ask : strike.ask,
        mid: q.mid > 0 ? q.mid : strike.mid,
        last: q.last > 0 ? q.last : strike.last,
        volume: q.volume > 0 ? q.volume : strike.volume,
        openInterest: q.openInterest > 0 ? q.openInterest : strike.openInterest,
      }
    }),
  }))
}

export function AddTradeForm({ analysisId, indexSymbol: initialIndexSymbol, onComplete, onCancel, standalone = false }: AddTradeFormProps) {
  const [loading, setLoading] = useState(false)
  const [searchingContracts, setSearchingContracts] = useState(false)
  const [expirationGroups, setExpirationGroups] = useState<ExpirationGroup[]>([])
  const [callsData, setCallsData] = useState<ExpirationGroup[]>([])
  const [putsData, setPutsData] = useState<ExpirationGroup[]>([])
  const [selectedContract, setSelectedContract] = useState<OptionContract | null>(null)
  const [showBothSides, setShowBothSides] = useState(true)
  // Exclude in-the-money strikes so the chain shows more out-of-the-money
  // contracts (sends includeOneITM=false to the contracts API → OTM-only).
  const [otmOnly, setOtmOnly] = useState(false)
  const [datePreset, setDatePreset] = useState<DatePreset>('week')
  const [customDate, setCustomDate] = useState('')
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [visibleStrikesPerExpiration, setVisibleStrikesPerExpiration] = useState<Record<string, number>>({})
  const [marketStatus, setMarketStatus] = useState<{
    isOpen: boolean
    status: string
    canSetManualPrice: boolean
    message: string
  } | null>(null)
  const [indexPrice, setIndexPrice] = useState<number | null>(null)
  // Underlying price reported by the options-chain API. Used as a fallback
  // anchor for ATM-centering when the live index price is unavailable (e.g.
  // pre-market / market closed), so the ladder still centers correctly.
  const [chainPrice, setChainPrice] = useState<number | null>(null)
  const [loadingIndexPrice, setLoadingIndexPrice] = useState(false)
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null)
  const [reentryDialogOpen, setReentryDialogOpen] = useState(false)
  const [reentryData, setReentryData] = useState<{
    existing_trade: any
    new_trade: any
    idempotency_key: string
  } | null>(null)
  const [pendingPayload, setPendingPayload] = useState<any>(null)
  const [formData, setFormData] = useState({
    instrument_type: 'options' as 'options' | 'futures',
    direction: 'call' as 'call' | 'put' | 'long' | 'short',
    underlying_index_symbol: initialIndexSymbol || 'SPX',
    polygon_option_ticker: '',
    strike: '',
    expiry: '',
    option_type: 'call' as 'call' | 'put',
    current_price: '',
    entry_price: '',
    entry_override: '',
    entry_override_reason: '',
    targets: [{ price: '', percentage: '' }] as Array<{ price: string, percentage: string }>,
    stoploss: { price: '', percentage: '' },
    notes: '',
    telegram_channel_id: 'analysis' as string,
    auto_publish_telegram: false,
    is_testing: false,
    testing_channel_ids: [] as string[],
    // Buy range alert
    buy_range_min: '',
    buy_range_max: '',
    buy_range_expires_at: '',
    buy_range_telegram_channel_id: '',
    // Contract monitoring & preparation (مراقبة وتجهيز العقد). When enabled, the
    // buy_range_* fields above act as the EXECUTION range: the contract is only
    // monitored (not counted as a trade) until the price reaches the range, at
    // which point it auto-executes at the best price as a new trade.
    monitoring_mode: false,
  })
  const [testingChannels, setTestingChannels] = useState<Array<{id: string, name: string, telegram_channel_id: string}>>([])
  const [loadingTestingChannels, setLoadingTestingChannels] = useState(false)

  useEffect(() => {
    fetchTelegramChannels()
    fetchTestingChannels()
    fetchMarketStatus()
    if (formData.underlying_index_symbol) {
      fetchIndexPrice(formData.underlying_index_symbol)
    }

    // Refresh market status every 30 seconds
    const marketStatusInterval = setInterval(() => {
      fetchMarketStatus()
    }, 30000)

    return () => clearInterval(marketStatusInterval)
  }, [analysisId])

  // Fast price refresh (every 3s): re-quotes ONLY the displayed contracts via a
  // single bulk snapshot call so the picker prices stay near-live.
  useEffect(() => {
    if ((callsData.length > 0 || putsData.length > 0 || expirationGroups.length > 0) && !searchingContracts) {
      const quoteInterval = setInterval(() => {
        refreshVisibleQuotes()
      }, 3000)

      return () => clearInterval(quoteInterval)
    }
  }, [callsData.length, putsData.length, expirationGroups.length, searchingContracts])

  // Slow structural refresh (every 30s): re-fetches the full chain to pick up
  // new/expired strikes and expirations. Prices in between are kept live by the
  // fast bulk-quote refresh above, so this no longer needs to run every 10s.
  useEffect(() => {
    if ((callsData.length > 0 || putsData.length > 0 || expirationGroups.length > 0) && !searchingContracts) {
      const refreshInterval = setInterval(() => {
        refreshContractPrices()
      }, 30000)

      return () => clearInterval(refreshInterval)
    }
  }, [callsData.length, putsData.length, expirationGroups.length, searchingContracts, datePreset, showBothSides, otmOnly])

  useEffect(() => {
    if (formData.underlying_index_symbol) {
      fetchIndexPrice(formData.underlying_index_symbol)

      // Auto-refresh index price every 10 seconds for live updates
      const priceInterval = setInterval(() => {
        fetchIndexPrice(formData.underlying_index_symbol)
      }, 10000)

      return () => clearInterval(priceInterval)
    }
  }, [formData.underlying_index_symbol])

  const fetchTelegramChannels = async () => {
    try {
      const channels: TelegramChannel[] = []

      // Fetch channels via API to avoid CORS issues
      const response = await fetch('/api/telegram/channels/list')
      if (response.ok) {
        const data = await response.json()
        if (data.ok && data.channels) {
          // Convert API format to component format
          channels.push(...data.channels.map((ch: any) => ({
            id: ch.id,
            channel_name: ch.linkedPlanName ? `${ch.channelName} (${ch.linkedPlanName})` : ch.channelName,
            channel_id: ch.channelId,
            source: ch.linkedPlanId ? 'plan' as const : 'analyst' as const,
            plan_name: ch.linkedPlanName
          })))
        }
      }

      // If there's an analysisId, fetch the analysis default channel
      if (analysisId) {
        const analysisResponse = await fetch(`/api/indices/analyses/${analysisId}`)
        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json()
          if (analysisData.telegram_channel_id && analysisData.telegram_channels) {
            channels.unshift({
              id: 'analysis',
              channel_name: `Analysis Default: ${analysisData.telegram_channels.channel_name}`,
              channel_id: analysisData.telegram_channels.channel_id,
              source: 'analysis' as const
            })
          }
        }
      }

      setChannels(channels)
    } catch (error) {
      console.error('Error fetching channels:', error)
    } finally {
      setLoadingChannels(false)
    }
  }

  const fetchTestingChannels = async () => {
    setLoadingTestingChannels(true)
    try {
      const response = await fetch('/api/testing/channels')
      if (response.ok) {
        const data = await response.json()
        const enabledChannels = (data.channels || []).filter((ch: any) => ch.is_enabled)
        setTestingChannels(enabledChannels)
      }
    } catch (error) {
      console.error('Error fetching testing channels:', error)
    } finally {
      setLoadingTestingChannels(false)
    }
  }

  const fetchMarketStatus = async () => {
    try {
      const timestamp = Date.now()
      const response = await fetch(`/api/indices/market-status?_t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        }
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Market Status Response:', data)
        setMarketStatus(data)
      }
    } catch (error) {
      console.error('Error fetching market status:', error)
    }
  }

  const fetchIndexPrice = async (symbol: string) => {
    setLoadingIndexPrice(true)
    try {
      const timestamp = Date.now()
      const response = await fetch(
        `/api/indices/index-price?symbol=${symbol}&_t=${timestamp}`,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setIndexPrice(data.price)
        setLastPriceUpdate(new Date())
      } else {
        setIndexPrice(null)
      }
    } catch (error) {
      console.error('Error fetching index price:', error)
      setIndexPrice(null)
    } finally {
      setLoadingIndexPrice(false)
    }
  }

  const getDTERange = (preset: DatePreset): { minDTE: number; maxDTE: number } => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    switch (preset) {
      case 'today':
        return { minDTE: 0, maxDTE: 1 }
      case 'tomorrow':
        return { minDTE: 1, maxDTE: 3 }
      case 'week':
        return { minDTE: 0, maxDTE: 7 }
      case 'month':
        return { minDTE: 0, maxDTE: 30 }
      case 'custom':
        if (customDate) {
          const targetDate = new Date(customDate)
          targetDate.setHours(0, 0, 0, 0)
          const dte = Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          return { minDTE: Math.max(0, dte - 1), maxDTE: Math.max(0, dte + 1) }
        }
        return { minDTE: 0, maxDTE: 45 }
      default:
        return { minDTE: 0, maxDTE: 7 }
    }
  }

  const refreshContractPrices = async () => {
    // Silently refresh prices in background without showing loading UI
    try {
      const { minDTE, maxDTE } = getDTERange(datePreset)

      if (showBothSides && callsData.length > 0) {
        const timestamp = Date.now()
        const callParams = new URLSearchParams({
          underlying: formData.underlying_index_symbol,
          direction: 'call',
          minDTE: minDTE.toString(),
          maxDTE: maxDTE.toString(),
          maxExpirations: '5',
          strikesPerExpiration: '50',
          percentBand: '0.20',
          includeOneITM: otmOnly ? 'false' : 'true',
          bypassCache: 'true',
          _t: timestamp.toString(),
        })

        const putParams = new URLSearchParams({
          underlying: formData.underlying_index_symbol,
          direction: 'put',
          minDTE: minDTE.toString(),
          maxDTE: maxDTE.toString(),
          maxExpirations: '5',
          strikesPerExpiration: '50',
          percentBand: '0.20',
          includeOneITM: otmOnly ? 'false' : 'true',
          bypassCache: 'true',
          _t: timestamp.toString(),
        })

        const [callResponse, putResponse] = await Promise.all([
          fetch(`/api/indices/contracts?${callParams}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          }),
          fetch(`/api/indices/contracts?${putParams}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          })
        ])

        if (callResponse.ok && putResponse.ok) {
          const callData = await callResponse.json()
          const putData = await putResponse.json()

          if (callData.expirations && callData.expirations.length > 0) {
            const transformedCalls = callData.expirations.map((group: any) => ({
              expirationDate: group.expirationDate,
              dte: group.dte,
              strikes: group.strikes.map((strike: any) => ({
                ...strike,
                expiry: group.expirationDate,
                type: 'call' as const,
              })),
            }))
            setCallsData(transformedCalls)

            const transformedPuts = putData.expirations.map((group: any) => ({
              expirationDate: group.expirationDate,
              dte: group.dte,
              strikes: group.strikes.map((strike: any) => ({
                ...strike,
                expiry: group.expirationDate,
                type: 'put' as const,
              })),
            }))
            setPutsData(transformedPuts)
            setChainPrice(callData.underlyingPrice ?? putData.underlyingPrice ?? null)
            setLastPriceUpdate(new Date())
          }
        }
      } else if (!showBothSides && expirationGroups.length > 0) {
        const timestamp = Date.now()
        const params = new URLSearchParams({
          underlying: formData.underlying_index_symbol,
          direction: formData.option_type,
          minDTE: minDTE.toString(),
          maxDTE: maxDTE.toString(),
          maxExpirations: '5',
          strikesPerExpiration: '50',
          percentBand: '0.20',
          includeOneITM: otmOnly ? 'false' : 'true',
          bypassCache: 'true',
          _t: timestamp.toString(),
        })

        const response = await fetch(`/api/indices/contracts?${params}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        })
        if (response.ok) {
          const data = await response.json()

          if (data.expirations && data.expirations.length > 0) {
            const transformedGroups = data.expirations.map((group: any) => ({
              expirationDate: group.expirationDate,
              dte: group.dte,
              strikes: group.strikes.map((strike: any) => ({
                ...strike,
                expiry: group.expirationDate,
                type: data.contractType || formData.direction,
              })),
            }))
            setExpirationGroups(transformedGroups)
            setChainPrice(data.underlyingPrice ?? null)
            setLastPriceUpdate(new Date())
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing contract prices:', error)
      // Silent fail - don't show error to user
    }
  }

  /**
   * Lightweight, fast price refresh: re-quotes ONLY the contracts currently on
   * screen via a single bulk snapshot call, instead of re-fetching the whole
   * option chain. This is what keeps the picker prices near-live (runs every
   * few seconds) without the heavy full-chain round-trips. Silent on failure.
   */
  const refreshVisibleQuotes = async () => {
    try {
      const tickers = new Set<string>()
      const collect = (groups: ExpirationGroup[]) =>
        groups.forEach(g => g.strikes.forEach(s => { if (s.ticker) tickers.add(s.ticker) }))
      collect(callsData)
      collect(putsData)
      collect(expirationGroups)
      if (selectedContract?.ticker) tickers.add(selectedContract.ticker)

      if (tickers.size === 0) return

      const res = await fetch('/api/indices/contracts/quotes', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: Array.from(tickers) }),
      })
      if (!res.ok) return

      const data = await res.json()
      const quotes: Record<string, BulkQuote> = data?.quotes ?? {}
      if (Object.keys(quotes).length === 0) return

      setCallsData(prev => mergeQuotesIntoGroups(prev, quotes))
      setPutsData(prev => mergeQuotesIntoGroups(prev, quotes))
      setExpirationGroups(prev => mergeQuotesIntoGroups(prev, quotes))
      setSelectedContract(prev => {
        if (!prev?.ticker) return prev
        const q = quotes[prev.ticker]
        if (!q) return prev
        return {
          ...prev,
          bid: q.bid > 0 ? q.bid : prev.bid,
          ask: q.ask > 0 ? q.ask : prev.ask,
          mid: q.mid > 0 ? q.mid : prev.mid,
          last: q.last > 0 ? q.last : prev.last,
          volume: q.volume > 0 ? q.volume : prev.volume,
          openInterest: q.openInterest > 0 ? q.openInterest : prev.openInterest,
        }
      })
      setLastPriceUpdate(new Date())
    } catch {
      // Silent — keep last known prices until the next cycle.
    }
  }

  const searchContracts = async () => {
    if (!showBothSides && !formData.option_type) {
      toast.error('Please select option type to search')
      return
    }

    setSearchingContracts(true)
    try {
      const { minDTE, maxDTE } = getDTERange(datePreset)

      if (showBothSides) {
        // Fetch both calls and puts
        const timestamp = Date.now()
        const callParams = new URLSearchParams({
          underlying: formData.underlying_index_symbol,
          direction: 'call',
          minDTE: minDTE.toString(),
          maxDTE: maxDTE.toString(),
          maxExpirations: '5',
          strikesPerExpiration: '50',
          percentBand: '0.20',
          includeOneITM: otmOnly ? 'false' : 'true',
          cacheTTL: '5',
          _t: timestamp.toString(),
        })

        const putParams = new URLSearchParams({
          underlying: formData.underlying_index_symbol,
          direction: 'put',
          minDTE: minDTE.toString(),
          maxDTE: maxDTE.toString(),
          maxExpirations: '5',
          strikesPerExpiration: '50',
          percentBand: '0.20',
          includeOneITM: otmOnly ? 'false' : 'true',
          cacheTTL: '5',
          _t: timestamp.toString(),
        })

        const [callResponse, putResponse] = await Promise.all([
          fetch(`/api/indices/contracts?${callParams}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          }),
          fetch(`/api/indices/contracts?${putParams}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          })
        ])

        if (callResponse.ok && putResponse.ok) {
          const callData = await callResponse.json()
          const putData = await putResponse.json()

          if (callData.expirations && callData.expirations.length > 0) {
            const transformedCalls = callData.expirations.map((group: any) => ({
              expirationDate: group.expirationDate,
              dte: group.dte,
              strikes: group.strikes.map((strike: any) => ({
                ...strike,
                expiry: group.expirationDate,
                type: 'call' as const,
              })),
            }))
            setCallsData(transformedCalls)

            const transformedPuts = putData.expirations.map((group: any) => ({
              expirationDate: group.expirationDate,
              dte: group.dte,
              strikes: group.strikes.map((strike: any) => ({
                ...strike,
                expiry: group.expirationDate,
                type: 'put' as const,
              })),
            }))
            setPutsData(transformedPuts)
            setChainPrice(callData.underlyingPrice ?? putData.underlyingPrice ?? null)

            // Initialize visible strikes to 12 for each expiration
            const initialVisible: Record<string, number> = {}
            transformedCalls.forEach((group: ExpirationGroup) => {
              initialVisible[group.expirationDate] = 12
            })
            setVisibleStrikesPerExpiration(initialVisible)

            const totalContracts = transformedCalls.reduce(
              (sum: number, exp: ExpirationGroup) => sum + exp.strikes.length,
              0
            ) + transformedPuts.reduce(
              (sum: number, exp: ExpirationGroup) => sum + exp.strikes.length,
              0
            )
            setLastPriceUpdate(new Date())
            toast.success(`Found ${totalContracts} contracts (calls + puts) across ${transformedCalls.length} expiration(s)`)
          } else {
            toast.error('No contracts found for selected criteria')
            setCallsData([])
            setPutsData([])
            setLastPriceUpdate(null)
          }
        } else {
          toast.error('Failed to fetch contracts')
        }
      } else {
        // Original single-side fetch
        const timestamp = Date.now()
        const params = new URLSearchParams({
          underlying: formData.underlying_index_symbol,
          direction: formData.option_type,
          minDTE: minDTE.toString(),
          maxDTE: maxDTE.toString(),
          maxExpirations: '5',
          strikesPerExpiration: '50',
          percentBand: '0.20',
          includeOneITM: otmOnly ? 'false' : 'true',
          cacheTTL: '5',
          _t: timestamp.toString(),
        })

        const response = await fetch(`/api/indices/contracts?${params}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        })
        if (response.ok) {
          const data = await response.json()

          if (data.expirations && data.expirations.length > 0) {
            const transformedGroups = data.expirations.map((group: any) => ({
              expirationDate: group.expirationDate,
              dte: group.dte,
              strikes: group.strikes.map((strike: any) => ({
                ...strike,
                expiry: group.expirationDate,
                type: data.contractType || formData.direction,
              })),
            }))
            setExpirationGroups(transformedGroups)
            setChainPrice(data.underlyingPrice ?? null)

            // Initialize visible strikes to 12 for each expiration
            const initialVisible: Record<string, number> = {}
            transformedGroups.forEach((group: ExpirationGroup) => {
              initialVisible[group.expirationDate] = 12
            })
            setVisibleStrikesPerExpiration(initialVisible)

            const totalContracts = transformedGroups.reduce(
              (sum: number, exp: ExpirationGroup) => sum + exp.strikes.length,
              0
            )
            setLastPriceUpdate(new Date())
            toast.success(`Found ${totalContracts} contracts across ${transformedGroups.length} expiration(s)`)
          } else {
            toast.error('No contracts found for selected criteria')
            setExpirationGroups([])
            setLastPriceUpdate(null)
          }
        } else {
          const error = await response.json()
          toast.error(error.error || 'Failed to search contracts')
        }
      }
    } catch (error) {
      console.error('Error searching contracts:', error)
      toast.error('Failed to search contracts')
    } finally {
      setSearchingContracts(false)
    }
  }

  const selectContract = (contract: OptionContract) => {
    setSelectedContract(contract)
    // Auto-fill entry_override with the contract's current mid price so the
    // analyst sees the live price and can edit it before publishing.
    // The analyst's edits to entry_override are preserved until they select a
    // different contract, at which point the new contract's price is filled in.
    const midPrice = contract.mid ?? 0
    const midStr = midPrice > 0 ? midPrice.toFixed(2) : ''
    setFormData({
      ...formData,
      polygon_option_ticker: contract.ticker,
      strike: contract.strike.toString(),
      expiry: contract.expiry,
      option_type: contract.type,
      direction: contract.type,
      entry_override: midStr,
    })
  }

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset)
    setExpirationGroups([])
    setCallsData([])
    setPutsData([])
    setSelectedContract(null)
    setVisibleStrikesPerExpiration({})
  }

  const mergeStrikesForDisplay = (callsExp: ExpirationGroup, putsExp: ExpirationGroup): StrikeRow[] => {
    const strikeMap = new Map<number, StrikeRow>()

    callsExp.strikes.forEach(contract => {
      strikeMap.set(contract.strike, { strike: contract.strike, call: contract })
    })

    putsExp.strikes.forEach(contract => {
      const existing = strikeMap.get(contract.strike)
      if (existing) {
        existing.put = contract
      } else {
        strikeMap.set(contract.strike, { strike: contract.strike, put: contract })
      }
    })

    return Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike)
  }

  // Return a window of `count` items centered on the strike nearest the live
  // underlying price, so the ATM strike sits in the middle (ITM on one side,
  // OTM on the other) instead of the list starting at the farthest strike.
  const centerWindow = <T extends { strike: number }>(
    items: T[],
    price: number | null,
    count: number
  ): T[] => {
    if (items.length <= count) return items
    if (!price) return items.slice(0, count)

    let atmIdx = 0
    let best = Infinity
    items.forEach((it, i) => {
      const d = Math.abs(it.strike - price)
      if (d < best) { best = d; atmIdx = i }
    })

    const half = Math.floor(count / 2)
    let start = atmIdx - half
    let end = start + count
    if (start < 0) { end -= start; start = 0 }
    if (end > items.length) { start = Math.max(0, start - (end - items.length)); end = items.length }
    return items.slice(start, end)
  }

  // Strike nearest the underlying price within a list (used to anchor the ATM
  // divider and highlight).
  const nearestStrike = (items: { strike: number }[], price: number | null): number | null => {
    if (!price || items.length === 0) return null
    return items.reduce(
      (best, it) => (Math.abs(it.strike - price) < Math.abs(best - price) ? it.strike : best),
      items[0].strike
    )
  }

  // In-the-money test for a strike given the contract type and live price.
  const isITM = (strike: number, type: 'call' | 'put', price: number | null): boolean => {
    if (!price) return false
    return type === 'call' ? strike < price : strike > price
  }

  const loadMoreStrikes = (expirationDate: string) => {
    setVisibleStrikesPerExpiration(prev => ({
      ...prev,
      [expirationDate]: (prev[expirationDate] || 12) + 15
    }))
  }

  const addTarget = () => {
    setFormData({
      ...formData,
      targets: [...formData.targets, { price: '', percentage: '' }],
    })
  }

  const removeTarget = (index: number) => {
    setFormData({
      ...formData,
      targets: formData.targets.filter((_, i) => i !== index),
    })
  }

  const updateTarget = (index: number, field: 'price' | 'percentage', value: string) => {
    const newTargets = [...formData.targets]
    newTargets[index][field] = value
    setFormData({ ...formData, targets: newTargets })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const targets: Array<{ level: number; percentage: number }> = formData.targets
        .filter(t => t.price && t.percentage)
        .map(t => ({
          level: parseFloat(t.price),
          percentage: parseFloat(t.percentage),
        }))

      const stoploss = formData.stoploss.price && formData.stoploss.percentage
        ? {
            level: parseFloat(formData.stoploss.price),
            percentage: parseFloat(formData.stoploss.percentage),
          }
        : null

      const telegramChannelId = formData.telegram_channel_id && formData.telegram_channel_id !== 'none'
        ? (formData.telegram_channel_id === 'analysis' ? null : formData.telegram_channel_id)
        : null

      if (formData.instrument_type === 'options' && !formData.polygon_option_ticker) {
        toast.error('Select an option contract from the chain before saving (strike, expiry & type are filled in automatically)')
        setLoading(false)
        return
      }

      // ── MONITORING MODE (تجهيز ومراقبة عقد) ──────────────────────────────────
      // Prepare a contract to watch with an execution range. It is NOT counted
      // as a trade until the price reaches the range and auto-executes at the
      // best price. Reuses the range fields as the execution range.
      if (formData.monitoring_mode) {
        const rangeMin = parseFloat(formData.buy_range_min)
        const rangeMax = parseFloat(formData.buy_range_max)
        if (!(rangeMin > 0) || !(rangeMax > rangeMin)) {
          toast.error('حدد رينج التنفيذ (الحد الأدنى < الأعلى) / Set a valid execution range (min < max)')
          setLoading(false)
          return
        }

        const monitorPayload: any = {
          mode: 'monitoring',
          is_monitoring: true,
          analysis_id: analysisId || null,
          instrument_type: formData.instrument_type,
          direction: formData.direction,
          underlying_index_symbol: formData.underlying_index_symbol,
          polygon_option_ticker: formData.polygon_option_ticker || null,
          strike: formData.strike ? parseFloat(formData.strike) : null,
          expiry: formData.expiry || null,
          option_type: formData.option_type || null,
          exec_range_min: rangeMin,
          exec_range_max: rangeMax,
          notes: formData.notes || null,
          telegram_channel_id: telegramChannelId,
          qty: 1,
          is_testing: formData.is_testing,
        }
        if (formData.current_price && parseFloat(formData.current_price) > 0) {
          monitorPayload.current_price = parseFloat(formData.current_price)
        }
        if (formData.buy_range_expires_at) {
          monitorPayload.monitor_expires_at = new Date(formData.buy_range_expires_at).toISOString()
        }
        if (formData.buy_range_telegram_channel_id && formData.buy_range_telegram_channel_id !== 'none') {
          monitorPayload.monitor_telegram_channel_id = formData.buy_range_telegram_channel_id
        }

        // Monitoring always goes through the standalone trades endpoint (it
        // accepts analysis_id in the body), since the analysis-scoped route
        // does not handle monitoring mode.
        const monitorRes = await fetch('/api/indices/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(monitorPayload),
        })
        if (monitorRes.ok) {
          toast.success('👁️ تم تجهيز العقد للمراقبة — سيصلك تنبيه بالتنفيذ عند دخول الرينج / Contract set for monitoring')
          onComplete()
        } else {
          const err = await monitorRes.json().catch(() => ({}))
          toast.error(err.error || 'Failed to set up monitoring')
        }
        setLoading(false)
        return
      }

      if (marketStatus && !marketStatus.isOpen && !formData.current_price) {
        toast.error('Current price is required when markets are closed')
        setLoading(false)
        return
      }

      const payload: any = {
        instrument_type: formData.instrument_type,
        direction: formData.direction,
        underlying_index_symbol: formData.underlying_index_symbol,
        polygon_option_ticker: formData.polygon_option_ticker || null,
        strike: formData.strike ? parseFloat(formData.strike) : null,
        expiry: formData.expiry || null,
        option_type: formData.option_type || null,
        targets,
        stoploss,
        notes: formData.notes || null,
        telegram_channel_id: telegramChannelId,
        auto_publish_telegram: formData.is_testing ? (formData.testing_channel_ids.length > 0) : formData.auto_publish_telegram,
        is_testing: formData.is_testing,
        testing_channel_ids: formData.is_testing ? formData.testing_channel_ids : [],
      }

      // Entry price override: send when analyst has manually set / confirmed the price
      if (formData.entry_override && parseFloat(formData.entry_override) > 0) {
        payload.entry_override = parseFloat(formData.entry_override)
        payload.entry_override_reason = formData.entry_override_reason || 'Analyst-confirmed entry price'
      }

      if (marketStatus && !marketStatus.isOpen) {
        payload.current_price = parseFloat(formData.current_price)
        payload.entry_price = formData.entry_price ? parseFloat(formData.entry_price) : parseFloat(formData.current_price)
      }

      // Buy range alert (optional)
      if (formData.buy_range_min && formData.buy_range_max) {
        const rangeMin = parseFloat(formData.buy_range_min)
        const rangeMax = parseFloat(formData.buy_range_max)
        if (rangeMin > 0 && rangeMax > rangeMin) {
          payload.buy_range_min = rangeMin
          payload.buy_range_max = rangeMax
          if (formData.buy_range_expires_at) {
            payload.buy_range_expires_at = new Date(formData.buy_range_expires_at).toISOString()
          }
          if (formData.buy_range_telegram_channel_id && formData.buy_range_telegram_channel_id !== 'none') {
            payload.buy_range_telegram_channel_id = formData.buy_range_telegram_channel_id
          }
        }
      }

      const apiUrl = standalone || !analysisId
        ? '/api/indices/trades'
        : `/api/indices/analyses/${analysisId}/trades`

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        if (formData.is_testing) {
          toast.success('🧪 Test trade created successfully!')
          if (formData.testing_channel_ids.length > 0) {
            toast.success(`Published to ${formData.testing_channel_ids.length} testing channel${formData.testing_channel_ids.length > 1 ? 's' : ''}!`)
          }
        } else {
          toast.success('Trade added successfully!')
          if (formData.auto_publish_telegram) {
            toast.success('Published to Telegram!')
          }
        }
        onComplete()
      } else if (response.status === 409) {
        const errorData = await response.json()

        if (errorData.action_required === 'REENTRY_DECISION') {
          setPendingPayload(payload)
          setReentryData({
            existing_trade: errorData.existing_trade,
            new_trade: errorData.new_trade,
            idempotency_key: errorData.idempotency_key,
          })
          setReentryDialogOpen(true)
        } else {
          toast.error(errorData.error || 'Failed to add trade')
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to add trade')
      }
    } catch (error) {
      console.error('Error adding trade:', error)
      toast.error('Failed to add trade')
    } finally {
      setLoading(false)
    }
  }

  const handleReentryDecision = async (decision: 'NEW_ENTRY' | 'AVERAGE_ADJUSTMENT') => {
    if (!reentryData || !pendingPayload) {
      toast.error('Missing reentry data')
      return
    }

    setLoading(true)
    setReentryDialogOpen(false)

    try {
      const apiUrl = standalone || !analysisId
        ? '/api/indices/trades'
        : `/api/indices/analyses/${analysisId}/trades`

      const payload = {
        ...pendingPayload,
        reentry_decision: decision,
        existing_trade_id: reentryData.existing_trade.trade_id,
        idempotency_key: reentryData.idempotency_key,
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const result = await response.json()

        if (decision === 'NEW_ENTRY') {
          toast.success('Previous trade closed and new trade created!')
        } else {
          toast.success('Entry averaged into existing position!')
        }

        if (formData.is_testing) {
          if (formData.testing_channel_ids.length > 0) {
            toast.success(`Published to ${formData.testing_channel_ids.length} testing channel${formData.testing_channel_ids.length > 1 ? 's' : ''}!`)
          }
        } else if (formData.auto_publish_telegram) {
          toast.success('Published to Telegram!')
        }

        onComplete()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to process reentry')
      }
    } catch (error) {
      console.error('Error processing reentry:', error)
      toast.error('Failed to process reentry')
    } finally {
      setLoading(false)
      setReentryData(null)
      setPendingPayload(null)
    }
  }

  const marketStatusConfig = (() => {
    if (!marketStatus) return { label: 'Live', icon: CheckCircle2, color: 'text-green-600', border: 'border-green-500', bg: 'bg-green-50 dark:bg-green-950/20' }
    if (marketStatus.isOpen)                         return { label: 'Open',        icon: CheckCircle2, color: 'text-green-600',  border: 'border-green-500',  bg: 'bg-green-50 dark:bg-green-950/20' }
    if (marketStatus.status === 'pre-market')         return { label: 'Pre-Market',  icon: Clock,        color: 'text-blue-500',   border: 'border-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/20' }
    if (marketStatus.status === 'after-hours')        return { label: 'After-Hours', icon: Moon,         color: 'text-purple-500', border: 'border-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/20' }
    return { label: 'Closed', icon: XCircle, color: 'text-red-500', border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-950/20' }
  })()

  // Effective ATM anchor: prefer the live index price, fall back to the
  // underlying price reported by the options-chain API (works pre-market).
  const atmPrice = indexPrice ?? chainPrice

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Trade Details</h3>

        <div className="grid md:grid-cols-2 gap-4">
          {standalone && (
            <div className="space-y-2">
              <Label htmlFor="underlying_index_symbol">Index Symbol *</Label>
              <Select
                value={formData.underlying_index_symbol}
                onValueChange={(value) => setFormData({ ...formData, underlying_index_symbol: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPX">SPX (S&P 500)</SelectItem>
                  <SelectItem value="NDX">NDX (Nasdaq 100)</SelectItem>
                  <SelectItem value="DJI">DJI (Dow Jones)</SelectItem>
                  <SelectItem value="RUT">RUT (Russell 2000)</SelectItem>
                  <SelectItem value="VIX">VIX (Volatility Index)</SelectItem>
                </SelectContent>
              </Select>
              {loadingIndexPrice ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading price...</span>
                </div>
              ) : indexPrice !== null ? (
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className={`h-4 w-4 ${marketStatusConfig.color}`} />
                  <span className={`font-semibold ${marketStatusConfig.color}`}>
                    ${indexPrice.toFixed(2)}
                  </span>
                  <Badge variant="outline" className={`text-xs flex items-center gap-1 ${marketStatusConfig.border} ${marketStatusConfig.color}`}>
                    <marketStatusConfig.icon className="h-3 w-3" />
                    {marketStatusConfig.label}
                  </Badge>
                </div>
              ) : null}
            </div>
          )}
          {!standalone && formData.underlying_index_symbol && (
            <div className="col-span-2 space-y-2">
              <Label>Current Index Value</Label>
              {loadingIndexPrice ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading {formData.underlying_index_symbol} price...</span>
                </div>
              ) : indexPrice !== null ? (
                <div className={`flex items-center gap-2 p-3 border rounded-lg ${marketStatusConfig.bg}`}>
                  <TrendingUp className={`h-5 w-5 ${marketStatusConfig.color}`} />
                  <div>
                    <div className={`font-semibold text-lg ${marketStatusConfig.color}`}>
                      {formData.underlying_index_symbol}: ${indexPrice.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {marketStatus?.isOpen ? 'Live Market Price' : marketStatus?.message || 'Last Known Price'}
                    </div>
                  </div>
                  <Badge variant="outline" className={`ml-auto flex items-center gap-1 ${marketStatusConfig.border} ${marketStatusConfig.color}`}>
                    <marketStatusConfig.icon className="h-3 w-3" />
                    {marketStatusConfig.label}
                  </Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground p-3 border rounded-lg">
                  Unable to fetch live price for {formData.underlying_index_symbol}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="instrument_type">Instrument Type *</Label>
            <Select
              value={formData.instrument_type}
              onValueChange={(value: any) => setFormData({ ...formData, instrument_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="options">Options</SelectItem>
                <SelectItem value="futures">Futures</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="direction">Direction *</Label>
            <Select
              value={formData.direction}
              onValueChange={(value: any) => setFormData({ ...formData, direction: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formData.instrument_type === 'options' ? (
                  <>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="put">Put</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {formData.instrument_type === 'options' && (
          <>
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium">Contract Search</h4>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="option_type">Option Type *</Label>
                  <Select
                    value={formData.option_type}
                    onValueChange={(value: any) => setFormData({ ...formData, option_type: value, direction: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="put">Put</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Expiration Date Range</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    <Button
                      type="button"
                      variant={datePreset === 'today' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDatePresetChange('today')}
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      Today
                    </Button>
                    <Button
                      type="button"
                      variant={datePreset === 'tomorrow' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDatePresetChange('tomorrow')}
                    >
                      Tomorrow
                    </Button>
                    <Button
                      type="button"
                      variant={datePreset === 'week' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDatePresetChange('week')}
                    >
                      This Week
                    </Button>
                    <Button
                      type="button"
                      variant={datePreset === 'month' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDatePresetChange('month')}
                    >
                      This Month
                    </Button>
                    <Button
                      type="button"
                      variant={datePreset === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDatePresetChange('custom')}
                    >
                      Custom
                    </Button>
                  </div>
                </div>

                {datePreset === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="customDate">Custom Expiration Date</Label>
                    <Input
                      id="customDate"
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Contract View</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={showBothSides ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setShowBothSides(true)
                      setExpirationGroups([])
                      setCallsData([])
                      setPutsData([])
                      setSelectedContract(null)
                    }}
                  >
                    Both Calls & Puts
                  </Button>
                  <Button
                    type="button"
                    variant={!showBothSides ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setShowBothSides(false)
                      setExpirationGroups([])
                      setCallsData([])
                      setPutsData([])
                      setSelectedContract(null)
                    }}
                  >
                    Single Type
                  </Button>
                </div>
              </div>

              {/* Moneyness filter — exclude ITM so more OTM contracts show */}
              <label className="flex items-start gap-2 cursor-pointer rounded-md border p-2.5 bg-muted/30">
                <Checkbox
                  checked={otmOnly}
                  onCheckedChange={(checked) => {
                    setOtmOnly(checked === true)
                    // Clear current results so the next search reflects the filter.
                    setExpirationGroups([])
                    setCallsData([])
                    setPutsData([])
                    setSelectedContract(null)
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium flex items-center gap-2">
                    استثناء عقود ITM <span className="text-muted-foreground">/ OTM only</span>
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    إظهار عقود خارج السعر فقط (استبعاد العقود داخل السعر) لعرض عدد أكبر من عقود OTM.
                  </span>
                </span>
              </label>

              <Button
                type="button"
                onClick={searchContracts}
                disabled={searchingContracts}
                className="w-full"
              >
                {searchingContracts ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching Contracts...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search {showBothSides ? 'Calls & Puts' : 'Contracts'}
                  </>
                )}
              </Button>

              {showBothSides && callsData.length > 0 && putsData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Calls & Puts - Centered on ${indexPrice ? indexPrice.toFixed(2) : 'Current Price'}
                    </Label>
                    <div className="flex items-center gap-2">
                      {lastPriceUpdate && (
                        <Badge variant="outline" className="text-xs animate-pulse">
                          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                          Live - Updated {new Date().getTime() - lastPriceUpdate.getTime() < 2000 ? 'now' : 'recently'}
                        </Badge>
                      )}
                      {indexPrice && (
                        <Badge variant="secondary" className="text-xs">
                          {formData.underlying_index_symbol} Index: ${indexPrice.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Tabs defaultValue={callsData[0]?.expirationDate} className="w-full">
                    <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${Math.min(callsData.length, 5)}, 1fr)` }}>
                      {callsData.slice(0, 5).map((group) => (
                        <TabsTrigger key={group.expirationDate} value={group.expirationDate} className="text-xs">
                          <div className="flex flex-col items-center">
                            <span>{new Date(group.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <span className="text-[10px] text-muted-foreground">{group.dte}d</span>
                          </div>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {callsData.map((callGroup, idx) => {
                      const putGroup = putsData[idx]
                      const visibleCount = visibleStrikesPerExpiration[callGroup.expirationDate] || 12
                      const strikeRows = mergeStrikesForDisplay(callGroup, putGroup)
                      const visibleRows = centerWindow(strikeRows, atmPrice, visibleCount)
                      const hasMore = visibleRows.length < strikeRows.length
                      const atmRowStrike = nearestStrike(strikeRows, atmPrice)

                      return (
                        <TabsContent key={callGroup.expirationDate} value={callGroup.expirationDate} className="space-y-2">
                          <div className="text-xs text-muted-foreground mb-2">
                            {strikeRows.length} strike levels • Expires in {callGroup.dte} day{callGroup.dte !== 1 ? 's' : ''}
                            {hasMore && <span className="ml-2">(ATM-centered · {visibleRows.length} shown)</span>}
                          </div>
                          <div className="max-h-[500px] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs font-semibold text-center sticky top-0 bg-background z-10 pb-2">
                              <div className="text-green-600 dark:text-green-400">CALLS</div>
                              <div className="text-red-600 dark:text-red-400">PUTS</div>
                            </div>
                            {visibleRows.map((row, i) => {
                              const callItm = isITM(row.strike, 'call', atmPrice)
                              const putItm = isITM(row.strike, 'put', atmPrice)
                              const isAtm = atmRowStrike != null && row.strike === atmRowStrike
                              const prev = visibleRows[i - 1]
                              const showDivider =
                                atmPrice != null &&
                                row.strike >= atmPrice &&
                                (i === 0 || (prev && prev.strike < atmPrice))
                              return (
                              <Fragment key={row.strike}>
                                {showDivider && (
                                  <div className="flex items-center gap-2 py-1 my-1">
                                    <div className="flex-1 h-px bg-primary/40" />
                                    <span className="text-[11px] font-semibold text-primary whitespace-nowrap">
                                      {formData.underlying_index_symbol} ${atmPrice.toFixed(2)} · ATM
                                    </span>
                                    <div className="flex-1 h-px bg-primary/40" />
                                  </div>
                                )}
                              <div className={`grid grid-cols-2 gap-2 mb-2 ${isAtm ? 'rounded-lg ring-1 ring-primary/40 p-0.5' : ''}`}>
                                {row.call ? (
                                  <Card
                                    className={`cursor-pointer transition-colors ${
                                      selectedContract?.ticker === row.call.ticker
                                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20 ring-2 ring-green-500'
                                        : callItm
                                        ? 'bg-green-50/40 dark:bg-green-950/20 border-green-300/60 dark:border-green-900 hover:bg-green-100/50'
                                        : 'hover:bg-muted/50 border-green-200 dark:border-green-900'
                                    }`}
                                    onClick={() => selectContract(row.call!)}
                                  >
                                    <CardContent className="p-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold text-green-600 dark:text-green-400">${row.call.strike}</span>
                                        <span className="text-[8px] text-muted-foreground">{callItm ? 'ITM' : 'OTM'}</span>
                                      </div>
                                      <div className="text-lg font-bold">${(row.call.mid || 0).toFixed(2)}</div>
                                      <div className="text-[10px] text-muted-foreground">{row.call.delta ? `Δ ${row.call.delta.toFixed(3)}` : ''}</div>
                                    </CardContent>
                                  </Card>
                                ) : (
                                  <div className="border border-dashed border-muted-foreground/20 rounded-lg p-2 flex items-center justify-center text-xs text-muted-foreground">
                                    No Call
                                  </div>
                                )}
                                {row.put ? (
                                  <Card
                                    className={`cursor-pointer transition-colors ${
                                      selectedContract?.ticker === row.put.ticker
                                        ? 'border-red-500 bg-red-50 dark:bg-red-950/20 ring-2 ring-red-500'
                                        : putItm
                                        ? 'bg-red-50/40 dark:bg-red-950/20 border-red-300/60 dark:border-red-900 hover:bg-red-100/50'
                                        : 'hover:bg-muted/50 border-red-200 dark:border-red-900'
                                    }`}
                                    onClick={() => selectContract(row.put!)}
                                  >
                                    <CardContent className="p-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold text-red-600 dark:text-red-400">${row.put.strike}</span>
                                        <span className="text-[8px] text-muted-foreground">{putItm ? 'ITM' : 'OTM'}</span>
                                      </div>
                                      <div className="text-lg font-bold">${(row.put.mid || 0).toFixed(2)}</div>
                                      <div className="text-[10px] text-muted-foreground">{row.put.delta ? `Δ ${row.put.delta.toFixed(3)}` : ''}</div>
                                    </CardContent>
                                  </Card>
                                ) : (
                                  <div className="border border-dashed border-muted-foreground/20 rounded-lg p-2 flex items-center justify-center text-xs text-muted-foreground">
                                    No Put
                                  </div>
                                )}
                              </div>
                              </Fragment>
                              )
                            })}
                          </div>
                          {hasMore && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => loadMoreStrikes(callGroup.expirationDate)}
                              className="w-full"
                            >
                              Show More Strikes ({strikeRows.length - visibleRows.length} remaining)
                            </Button>
                          )}
                        </TabsContent>
                      )
                    })}
                  </Tabs>
                </div>
              )}

              {!showBothSides && expirationGroups.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Available Contracts by Expiration
                    </Label>
                    {lastPriceUpdate && (
                      <Badge variant="outline" className="text-xs animate-pulse">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                        Live - Updated {new Date().getTime() - lastPriceUpdate.getTime() < 2000 ? 'now' : 'recently'}
                      </Badge>
                    )}
                  </div>
                  <Tabs defaultValue={expirationGroups[0]?.expirationDate} className="w-full">
                    <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${Math.min(expirationGroups.length, 5)}, 1fr)` }}>
                      {expirationGroups.slice(0, 5).map((group) => (
                        <TabsTrigger key={group.expirationDate} value={group.expirationDate} className="text-xs">
                          <div className="flex flex-col items-center">
                            <span>{new Date(group.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <span className="text-[10px] text-muted-foreground">{group.dte}d</span>
                          </div>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {expirationGroups.map((group) => {
                      const visibleCount = visibleStrikesPerExpiration[group.expirationDate] || 12
                      const visibleStrikes = centerWindow(group.strikes, atmPrice, visibleCount)
                      const hasMore = visibleStrikes.length < group.strikes.length
                      const optType = (group.strikes[0]?.type || formData.option_type || 'call') as 'call' | 'put'
                      const atmStrike = nearestStrike(group.strikes, atmPrice)

                      return (
                      <TabsContent key={group.expirationDate} value={group.expirationDate} className="space-y-2">
                        <div className="text-xs text-muted-foreground mb-2">
                          {group.strikes.length} contract{group.strikes.length !== 1 ? 's' : ''} • Expires in {group.dte} day{group.dte !== 1 ? 's' : ''}
                          {hasMore && <span className="ml-2">(ATM-centered · {visibleStrikes.length} shown)</span>}
                        </div>
                        <div className="space-y-2">
                          <div className="grid gap-2 max-h-80 overflow-y-auto pb-2">
                          {visibleStrikes.map((contract, i) => {
                            const itm = isITM(contract.strike, optType, atmPrice)
                            const isAtm = atmStrike != null && contract.strike === atmStrike
                            const prev = visibleStrikes[i - 1]
                            const showDivider =
                              atmPrice != null &&
                              contract.strike >= atmPrice &&
                              (i === 0 || (prev && prev.strike < atmPrice))
                            return (
                            <Fragment key={contract.ticker}>
                              {showDivider && (
                                <div className="flex items-center gap-2 py-1 my-1">
                                  <div className="flex-1 h-px bg-primary/40" />
                                  <span className="text-[11px] font-semibold text-primary whitespace-nowrap">
                                    {formData.underlying_index_symbol} ${atmPrice.toFixed(2)} · ATM
                                  </span>
                                  <div className="flex-1 h-px bg-primary/40" />
                                </div>
                              )}
                            <Card
                              className={`cursor-pointer transition-colors ${
                                selectedContract?.ticker === contract.ticker
                                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                                  : isAtm
                                  ? 'border-primary/60 ring-1 ring-primary/40 hover:bg-muted/50'
                                  : itm
                                  ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-900/50 hover:bg-blue-100/60 dark:hover:bg-blue-950/50'
                                  : 'hover:bg-muted/50'
                              }`}
                              onClick={() => selectContract(contract)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm flex items-center gap-1.5">
                                      {formData.underlying_index_symbol} ${contract.strike}
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] px-1 py-0 ${itm ? 'text-blue-600 dark:text-blue-400 border-blue-400/50' : 'text-muted-foreground'}`}
                                      >
                                        {itm ? 'ITM' : 'OTM'}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                      {contract.ticker}
                                    </div>
                                    {(contract.delta || contract.impliedVolatility) && (
                                      <div className="flex gap-2 mt-1">
                                        {contract.delta && (
                                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                                            Δ {contract.delta.toFixed(3)}
                                          </Badge>
                                        )}
                                        {contract.impliedVolatility && (
                                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                                            IV {(contract.impliedVolatility * 100).toFixed(1)}%
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right ml-3">
                                    <div className="text-lg font-bold">${(contract.mid || 0).toFixed(2)}</div>
                                    <div className="text-[10px]">
                                      <span className="text-green-600 dark:text-green-400">${(contract.bid || 0).toFixed(2)}</span>
                                      <span className="text-muted-foreground"> × </span>
                                      <span className="text-red-600 dark:text-red-400">${(contract.ask || 0).toFixed(2)}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      Vol: {(contract.volume || 0).toLocaleString()} OI: {(contract.openInterest || 0).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                            </Fragment>
                            )
                          })}
                          </div>

                          {hasMore && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                loadMoreStrikes(group.expirationDate)
                              }}
                              className="w-full"
                            >
                              Show More Strikes ({group.strikes.length - visibleStrikes.length} remaining)
                            </Button>
                          )}
                        </div>
                      </TabsContent>
                    )})}

                  </Tabs>
                </div>
              )}
            </div>

            {selectedContract && (
              <Card className="border-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                    Selected Contract
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Ticker</div>
                      <div className="font-mono font-medium">{selectedContract.ticker}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Strike</div>
                      <div className="font-medium">${selectedContract.strike}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Expiry</div>
                      <div className="font-medium">{new Date(selectedContract.expiry).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Live Mid Price</div>
                      <div className="font-semibold text-green-600 dark:text-green-400">${(selectedContract.mid ?? 0).toFixed(2)}</div>
                    </div>
                    {selectedContract.bid !== undefined && selectedContract.ask !== undefined && (
                      <div className="col-span-2">
                        <div className="text-muted-foreground text-xs">Bid / Ask</div>
                        <div className="font-medium">${(selectedContract.bid ?? 0).toFixed(2)} × ${(selectedContract.ask ?? 0).toFixed(2)}</div>
                      </div>
                    )}
                  </div>

                  {/* Entry price — auto-filled from mid, analyst can edit */}
                  <div className="space-y-1 border-t pt-3">
                    <Label htmlFor="entry_override" className="flex items-center gap-1">
                      Entry Price
                      <span className="text-xs text-muted-foreground ml-1">(auto-filled from mid price — you can edit)</span>
                    </Label>
                    <Input
                      id="entry_override"
                      type="number"
                      step="0.0001"
                      value={formData.entry_override}
                      onChange={(e) => setFormData({ ...formData, entry_override: e.target.value })}
                      placeholder={`${(selectedContract.mid ?? 0).toFixed(2)}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      This will be stored as the official entry price for P/L calculations.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Buy Price Range Alert / Contract Monitoring — only shown when a contract is selected */}
            {selectedContract && (
              <div className={cn(
                "space-y-3 p-4 border rounded-lg",
                formData.monitoring_mode
                  ? "bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800"
                  : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
              )}>
                {/* Monitoring mode toggle */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.monitoring_mode}
                    onCheckedChange={(checked) => setFormData({ ...formData, monitoring_mode: checked === true })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-sm flex items-center gap-2">
                      👁️ تجهيز ومراقبة العقد <span className="text-muted-foreground">/ Prepare &amp; Monitor</span>
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      راقب العقد دون احتسابه كصفقة. عند دخوله رينج التنفيذ يُدرَج تلقائياً بأفضل سعر مع تنبيه بالتنفيذ.
                    </span>
                  </span>
                </label>

                <div>
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    {formData.monitoring_mode ? '🎯 رينج التنفيذ / Execution Range' : '🔔 Buy Price Range Alert'}
                    <Badge variant="outline" className="text-xs">{formData.monitoring_mode ? 'Monitoring' : 'Optional'}</Badge>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.monitoring_mode
                      ? 'لا تُحتسب كصفقة حتى دخول السعر هذا الرينج. عندها يُرسَل تنبيه ويُدرَج العقد بأفضل سعر كصفقة جديدة.'
                      : <>If the contract price enters this range, the system will automatically send a <b>Price Hits</b> alert to Telegram.</>}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="buy_range_min" className="text-xs">Min Price</Label>
                    <Input
                      id="buy_range_min"
                      type="number"
                      step="0.0001"
                      value={formData.buy_range_min}
                      onChange={(e) => setFormData({ ...formData, buy_range_min: e.target.value })}
                      placeholder="e.g. 1.20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="buy_range_max" className="text-xs">Max Price</Label>
                    <Input
                      id="buy_range_max"
                      type="number"
                      step="0.0001"
                      value={formData.buy_range_max}
                      onChange={(e) => setFormData({ ...formData, buy_range_max: e.target.value })}
                      placeholder="e.g. 1.30"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="buy_range_expires_at" className="text-xs">Alert Expiry (Optional)</Label>
                  <Input
                    id="buy_range_expires_at"
                    type="datetime-local"
                    value={formData.buy_range_expires_at}
                    onChange={(e) => setFormData({ ...formData, buy_range_expires_at: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for no expiry.</p>
                </div>

                {channels.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor="buy_range_channel" className="text-xs">Alert Channel (Optional)</Label>
                    <Select
                      value={formData.buy_range_telegram_channel_id}
                      onValueChange={(v) => setFormData({ ...formData, buy_range_telegram_channel_id: v })}
                    >
                      <SelectTrigger id="buy_range_channel">
                        <SelectValue placeholder="Same as main channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Same as main channel</SelectItem>
                        {channels.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>{ch.channel_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {marketStatus && !marketStatus.isOpen ? (
          <div className="space-y-4 p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700">
                Market Closed
              </Badge>
              <h4 className="font-medium">Manual Price Entry</h4>
              {(marketStatus as any)?.debug && (
                <span className="text-xs text-muted-foreground ml-auto">
                  ET: {(marketStatus as any).debug.etTime}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Markets are closed ({marketStatus.status}). Set current and entry prices manually. During RTH, live prices will be used automatically.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current_price" className="flex items-center gap-2">
                  Current Price
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="current_price"
                  type="number"
                  step="0.0001"
                  value={formData.current_price}
                  onChange={(e) => setFormData({ ...formData, current_price: e.target.value })}
                  placeholder="Current contract price"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Current market price for this contract
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry_price">
                  Entry Price (Optional)
                </Label>
                <Input
                  id="entry_price"
                  type="number"
                  step="0.0001"
                  value={formData.entry_price}
                  onChange={(e) => setFormData({ ...formData, entry_price: e.target.value })}
                  placeholder="Leave empty for same as current"
                />
                <p className="text-xs text-muted-foreground">
                  If empty, will use current price as entry
                </p>
              </div>
            </div>
          </div>
        ) : marketStatus?.isOpen ? (
          <div className="space-y-4 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100 border-green-300 dark:border-green-700">
                Market Open
              </Badge>
              <h4 className="font-medium">Live Price Tracking</h4>
              {(marketStatus as any)?.debug && (
                <span className="text-xs text-muted-foreground ml-auto">
                  ET: {(marketStatus as any).debug.etTime}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Markets are currently open. Entry prices will be automatically fetched from Polygon API when you create the trade.
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Checking market status...</span>
            </div>
          </div>
        )}

        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Targets</h4>
            <Button type="button" size="sm" onClick={addTarget}>
              <Plus className="h-4 w-4 mr-1" />
              Add Target
            </Button>
          </div>

          {formData.targets.map((target, index) => (
            <div key={index} className="grid md:grid-cols-3 gap-2 items-end">
              <div className="space-y-2">
                <Label>Target Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={target.price}
                  onChange={(e) => updateTarget(index, 'price', e.target.value)}
                  placeholder="Price"
                />
              </div>
              <div className="space-y-2">
                <Label>Target %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={target.percentage}
                  onChange={(e) => updateTarget(index, 'percentage', e.target.value)}
                  placeholder="Percentage"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => removeTarget(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Stop Loss (Optional)</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stop Loss Price</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.stoploss.price}
                onChange={(e) => setFormData({
                  ...formData,
                  stoploss: { ...formData.stoploss, price: e.target.value }
                })}
                placeholder="Price"
              />
            </div>
            <div className="space-y-2">
              <Label>Stop Loss %</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.stoploss.percentage}
                onChange={(e) => setFormData({
                  ...formData,
                  stoploss: { ...formData.stoploss, percentage: e.target.value }
                })}
                placeholder="Percentage"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes about this trade..."
            rows={3}
          />
        </div>

        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium">Testing &amp; Publishing</h4>

          <div className="space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="is_testing"
                checked={formData.is_testing}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_testing: checked as boolean })
                }
              />
              <div className="space-y-1">
                <label
                  htmlFor="is_testing"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Test Trade (Not Counted in Reports)
                </label>
                <p className="text-xs text-muted-foreground">
                  Mark this trade as a test. It will only be visible to you and excluded from all statistics, reports, and public views.
                </p>
              </div>
            </div>
          </div>

          {!formData.is_testing && (
            <>
              {loadingChannels ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading channels...
                </div>
              ) : channels.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
                  No Telegram channels available. Set up channels in Settings or on the parent analysis.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="telegram_channel">Telegram Channel</Label>
                    <Select
                      value={formData.telegram_channel_id}
                      onValueChange={(value) => setFormData({ ...formData, telegram_channel_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.filter(ch => ch.source === 'analysis').length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                              Analysis Default
                            </div>
                            {channels.filter(ch => ch.source === 'analysis').map(channel => (
                              <SelectItem key={channel.id} value={channel.id}>
                                {channel.channel_name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {channels.filter(ch => ch.source === 'analyst').length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                              Analyst Channels
                            </div>
                            {channels.filter(ch => ch.source === 'analyst').map(channel => (
                              <SelectItem key={channel.id} value={channel.id}>
                                {channel.channel_name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {channels.filter(ch => ch.source === 'plan').length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                              Plan Channels
                            </div>
                            {channels.filter(ch => ch.source === 'plan').map(channel => (
                              <SelectItem key={channel.id} value={channel.id}>
                                {channel.channel_name} ({channel.plan_name})
                              </SelectItem>
                            ))}
                          </>
                        )}
                        <SelectItem value="none">None (Don't publish)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.telegram_channel_id && formData.telegram_channel_id !== 'none' && !formData.is_testing && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="auto_publish"
                        checked={formData.auto_publish_telegram}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, auto_publish_telegram: checked as boolean })
                        }
                      />
                      <label
                        htmlFor="auto_publish"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        Auto-publish to Telegram when trade is created
                      </label>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox
                id="is_testing"
                checked={formData.is_testing}
                onCheckedChange={(checked) => {
                  const isTest = checked as boolean
                  setFormData({
                    ...formData,
                    is_testing: isTest,
                    testing_channel_ids: isTest ? formData.testing_channel_ids : [],
                  })
                }}
              />
              <label
                htmlFor="is_testing"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                🧪 Test Trade (Not Counted in Reports)
              </label>
            </div>

            {formData.is_testing && (
              <div className="ml-6 space-y-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Test trades are visible only to you and excluded from statistics and reports.
                </p>

                {testingChannels.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Send to Testing Channels (Optional)</Label>
                    {testingChannels.map((channel) => (
                      <div key={channel.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`testing_channel_${channel.id}`}
                          checked={formData.testing_channel_ids.includes(channel.telegram_channel_id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({
                                ...formData,
                                testing_channel_ids: [...formData.testing_channel_ids, channel.telegram_channel_id]
                              })
                            } else {
                              setFormData({
                                ...formData,
                                testing_channel_ids: formData.testing_channel_ids.filter(id => id !== channel.telegram_channel_id)
                              })
                            }
                          }}
                        />
                        <label
                          htmlFor={`testing_channel_${channel.id}`}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {channel.name}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No testing channels configured. Visit Settings to add testing channels.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adding Trade...
            </>
          ) : (
            'Add Trade'
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>

      {/* Re-Entry Decision Dialog */}
      {reentryData && (
        <TradeReentryDialog
          open={reentryDialogOpen}
          onOpenChange={setReentryDialogOpen}
          existingTrade={reentryData.existing_trade}
          newTrade={reentryData.new_trade}
          onDecision={handleReentryDecision}
          isProcessing={loading}
        />
      )}
    </>
  )
}
