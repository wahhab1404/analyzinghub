'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, ChevronDown,
  ChevronUp, DollarSign, Activity, BarChart3, Clock, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StrikeContract {
  strike: number
  ticker: string
  bid?: number
  ask?: number
  mid?: number
  last?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
  delta?: number
  theta?: number
}

interface ExpirationGroup {
  expirationDate: string
  dte: number
  strikes: StrikeContract[]
}

interface OptionsChainData {
  symbol: string
  stockPrice: number
  direction: 'call' | 'put'
  expirations: ExpirationGroup[]
  metadata: { totalContracts: number }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
  symbol: string
  onTradeCreated: () => void
}

type Step = 'direction' | 'chain' | 'confirm'

export function CreateCompanyTradeDialog({ open, onOpenChange, analysisId, symbol, onTradeCreated }: Props) {
  const [step, setStep] = useState<Step>('direction')
  const [direction, setDirection] = useState<'CALL' | 'PUT'>('CALL')
  const [chainData, setChainData] = useState<OptionsChainData | null>(null)
  const [loadingChain, setLoadingChain] = useState(false)
  const [chainError, setChainError] = useState<string | null>(null)

  // Selected contract
  const [selectedContract, setSelectedContract] = useState<StrikeContract | null>(null)
  const [selectedExpiry, setSelectedExpiry] = useState<string>('')
  const [expandedExpiry, setExpandedExpiry] = useState<string | null>(null)

  // Live quote polling
  const [liveQuote, setLiveQuote] = useState<any>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const quoteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Form fields
  const [entryPrice, setEntryPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [stoploss, setStoploss] = useState('')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [showAveragePrompt, setShowAveragePrompt] = useState(false)
  const [existingTrade, setExistingTrade] = useState<any>(null)

  // Price refresh countdown
  const [refreshCountdown, setRefreshCountdown] = useState(10)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('direction')
      setDirection('CALL')
      setChainData(null)
      setChainError(null)
      setSelectedContract(null)
      setSelectedExpiry('')
      setExpandedExpiry(null)
      setEntryPrice('')
      setQty('1')
      setNotes('')
      setStoploss('')
      setLiveQuote(null)
    } else {
      stopQuotePolling()
    }
  }, [open])

  // ── Options Chain ─────────────────────────────────────────────────────────

  const fetchChain = useCallback(async () => {
    if (!symbol) return
    setLoadingChain(true)
    setChainError(null)
    setSelectedContract(null)
    setExpandedExpiry(null)
    try {
      const res = await fetch(
        `/api/companies/options-chain?symbol=${symbol}&direction=${direction.toLowerCase()}&maxDTE=60&percentBand=0.12`
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch options chain')
      }
      const data: OptionsChainData = await res.json()
      setChainData(data)
      // Auto-expand first expiry
      if (data.expirations.length > 0) {
        setExpandedExpiry(data.expirations[0].expirationDate)
      }
    } catch (err: any) {
      setChainError(err.message || 'Failed to load options chain')
    } finally {
      setLoadingChain(false)
    }
  }, [symbol, direction])

  useEffect(() => {
    if (step === 'chain') {
      fetchChain()
    }
  }, [step, fetchChain])

  // ── Live Quote Polling ────────────────────────────────────────────────────

  const fetchLiveQuote = useCallback(async (ticker: string) => {
    if (!ticker || !symbol) return
    setLoadingQuote(true)
    try {
      const res = await fetch(`/api/companies/contract-quote?ticker=${encodeURIComponent(ticker)}&symbol=${symbol}`)
      if (res.ok) {
        const data = await res.json()
        if (data.quote) {
          setLiveQuote(data.quote)
          setLastRefreshed(new Date())
          setRefreshCountdown(10)
          // Auto-fill entry price with mid price
          if (data.quote.mid && !entryPrice) {
            setEntryPrice(data.quote.mid.toFixed(2))
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch live quote:', err)
    } finally {
      setLoadingQuote(false)
    }
  }, [symbol, entryPrice])

  const stopQuotePolling = () => {
    if (quoteIntervalRef.current) {
      clearInterval(quoteIntervalRef.current)
      quoteIntervalRef.current = null
    }
  }

  const startQuotePolling = useCallback((ticker: string) => {
    stopQuotePolling()
    fetchLiveQuote(ticker)
    quoteIntervalRef.current = setInterval(() => {
      fetchLiveQuote(ticker)
    }, 10000)
  }, [fetchLiveQuote])

  // Countdown timer
  useEffect(() => {
    if (!selectedContract || step !== 'confirm') return
    const timer = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) return 10
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [selectedContract, step])

  useEffect(() => {
    return () => stopQuotePolling()
  }, [])

  // ── Contract Selection ────────────────────────────────────────────────────

  function selectContract(contract: StrikeContract, expiry: string) {
    setSelectedContract(contract)
    setSelectedExpiry(expiry)
    // Auto-fill entry price from mid → ask → last
    const price = contract.mid || contract.ask || contract.last
    if (price) setEntryPrice(price.toFixed(2))
    setStep('confirm')
    startQuotePolling(contract.ticker)
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function checkExisting() {
    if (!selectedContract || !selectedExpiry) return null
    try {
      const res = await fetch(
        `/api/companies/trades/check-existing?` +
        `symbol=${symbol}&strike=${selectedContract.strike}&expiry=${selectedExpiry}&direction=${direction}`
      )
      if (res.ok) {
        const data = await res.json()
        return data.existing_trade || null
      }
    } catch { /* ignore */ }
    return null
  }

  async function handleSubmit() {
    if (!selectedContract || !selectedExpiry || !entryPrice) {
      toast.error('Please fill all required fields')
      return
    }
    const existing = await checkExisting()
    if (existing) {
      setExistingTrade(existing)
      setShowAveragePrompt(true)
      return
    }
    await createTrade(false)
  }

  async function createTrade(isAverage: boolean) {
    setSubmitting(true)
    try {
      const payload = {
        scope: 'company',
        analysis_id: analysisId,
        symbol,
        direction,
        strike: selectedContract!.strike,
        expiry_date: selectedExpiry,
        entry_price: parseFloat(entryPrice),
        contracts_qty: parseInt(qty),
        stoploss: stoploss ? { price: parseFloat(stoploss) } : null,
        notes,
        is_average_entry: isAverage,
        existing_trade_id: isAverage ? existingTrade?.id : null,
      }
      const res = await fetch('/api/companies/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create trade')
      toast.success(isAverage ? 'Entry averaged successfully' : 'Trade created successfully')
      onTradeCreated()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to create trade')
    } finally {
      setSubmitting(false)
      setShowAveragePrompt(false)
      setExistingTrade(null)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function formatPrice(v?: number) {
    if (v === undefined || v === null) return '—'
    return `$${v.toFixed(2)}`
  }

  function formatDTE(dte: number) {
    if (dte === 0) return '0DTE'
    if (dte === 1) return '1 day'
    return `${dte}d`
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: '2-digit'
    })
  }

  function getIVColor(iv?: number) {
    if (!iv) return 'text-muted-foreground'
    if (iv > 0.8) return 'text-red-500'
    if (iv > 0.5) return 'text-amber-500'
    return 'text-green-500'
  }

  function isATM(strike: number, stockPrice: number) {
    return Math.abs(strike - stockPrice) / stockPrice < 0.005
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="font-bold text-lg">{symbol}</span>
              <span className="text-muted-foreground font-normal">— Add Contract Trade</span>
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1 mt-2">
              {(['direction', 'chain', 'confirm'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    step === s ? 'bg-primary text-primary-foreground' :
                    ['direction', 'chain', 'confirm'].indexOf(step) > i ? 'bg-green-500 text-white' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {['direction', 'chain', 'confirm'].indexOf(step) > i ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <span className={cn('text-xs', step === s ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                    {s === 'direction' ? 'Direction' : s === 'chain' ? 'Select Contract' : 'Confirm'}
                  </span>
                  {i < 2 && <div className="w-4 h-px bg-border mx-1" />}
                </div>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* ── STEP 1: Direction ── */}
            {step === 'direction' && (
              <div className="space-y-6">
                {chainData?.stockPrice && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    <span>{symbol} current price:</span>
                    <span className="font-bold text-foreground">${chainData.stockPrice.toFixed(2)}</span>
                  </div>
                )}

                <div>
                  <Label className="text-base font-semibold mb-3 block">Select Direction</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDirection('CALL')}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                        direction === 'CALL'
                          ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                          : 'border-border hover:border-green-300'
                      )}
                    >
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        direction === 'CALL' ? 'bg-green-500' : 'bg-muted'
                      )}>
                        <TrendingUp className={cn('h-6 w-6', direction === 'CALL' ? 'text-white' : 'text-muted-foreground')} />
                      </div>
                      <span className={cn('font-bold text-lg', direction === 'CALL' ? 'text-green-600 dark:text-green-400' : '')}>
                        CALL
                      </span>
                      <span className="text-xs text-muted-foreground text-center">
                        Bullish — profit when price goes up
                      </span>
                    </button>

                    <button
                      onClick={() => setDirection('PUT')}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                        direction === 'PUT'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                          : 'border-border hover:border-red-300'
                      )}
                    >
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        direction === 'PUT' ? 'bg-red-500' : 'bg-muted'
                      )}>
                        <TrendingDown className={cn('h-6 w-6', direction === 'PUT' ? 'text-white' : 'text-muted-foreground')} />
                      </div>
                      <span className={cn('font-bold text-lg', direction === 'PUT' ? 'text-red-600 dark:text-red-400' : '')}>
                        PUT
                      </span>
                      <span className="text-xs text-muted-foreground text-center">
                        Bearish — profit when price goes down
                      </span>
                    </button>
                  </div>
                </div>

                <Button className="w-full" onClick={() => setStep('chain')}>
                  View {direction} Contracts →
                </Button>
              </div>
            )}

            {/* ── STEP 2: Options Chain ── */}
            {step === 'chain' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStep('direction')}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ← Back
                    </button>
                    {chainData && (
                      <span className="text-sm text-muted-foreground">
                        {symbol} @ <span className="font-bold text-foreground">${chainData.stockPrice.toFixed(2)}</span>
                        {' '}— {chainData.metadata.totalContracts} contracts
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={direction === 'CALL' ? 'default' : 'destructive'}>
                      {direction === 'CALL' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {direction}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={fetchChain} disabled={loadingChain}>
                      <RefreshCw className={cn('h-3 w-3', loadingChain && 'animate-spin')} />
                    </Button>
                  </div>
                </div>

                {loadingChain && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Fetching live options chain...</p>
                  </div>
                )}

                {chainError && (
                  <div className="text-center py-8">
                    <p className="text-red-500 text-sm mb-3">{chainError}</p>
                    <Button variant="outline" size="sm" onClick={fetchChain}>Try Again</Button>
                  </div>
                )}

                {!loadingChain && !chainError && chainData && (
                  <>
                    {chainData.expirations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No contracts found within 12% of current price.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {chainData.expirations.map(group => (
                          <div key={group.expirationDate} className="border rounded-lg overflow-hidden">
                            {/* Expiry header */}
                            <button
                              onClick={() => setExpandedExpiry(
                                expandedExpiry === group.expirationDate ? null : group.expirationDate
                              )}
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{formatDate(group.expirationDate)}</span>
                                <Badge variant="outline" className="text-xs">
                                  {formatDTE(group.dte)}
                                </Badge>
                                {group.dte === 0 && (
                                  <Badge className="text-xs bg-orange-500">0DTE</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{group.strikes.length} strikes</span>
                                {expandedExpiry === group.expirationDate
                                  ? <ChevronUp className="h-4 w-4" />
                                  : <ChevronDown className="h-4 w-4" />
                                }
                              </div>
                            </button>

                            {/* Strikes table */}
                            {expandedExpiry === group.expirationDate && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-muted/20">
                                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Strike</th>
                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Bid</th>
                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Mid</th>
                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Ask</th>
                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">IV</th>
                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Vol</th>
                                      <th className="px-2 py-1.5"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.strikes.map(contract => {
                                      const atm = chainData.stockPrice
                                        ? isATM(contract.strike, chainData.stockPrice) : false
                                      return (
                                        <tr
                                          key={contract.ticker}
                                          className={cn(
                                            'border-b last:border-0 hover:bg-accent/50 transition-colors cursor-pointer',
                                            atm && 'bg-yellow-50 dark:bg-yellow-950/20'
                                          )}
                                          onClick={() => selectContract(contract, group.expirationDate)}
                                        >
                                          <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-bold">${contract.strike}</span>
                                              {atm && (
                                                <Badge className="text-[10px] py-0 px-1 bg-yellow-500">ATM</Badge>
                                              )}
                                            </div>
                                          </td>
                                          <td className="text-right px-2 py-2 text-muted-foreground">
                                            {contract.bid ? `$${contract.bid.toFixed(2)}` : '—'}
                                          </td>
                                          <td className="text-right px-2 py-2 font-semibold">
                                            {contract.mid ? (
                                              <span className={direction === 'CALL' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                                ${contract.mid.toFixed(2)}
                                              </span>
                                            ) : '—'}
                                          </td>
                                          <td className="text-right px-2 py-2 text-muted-foreground">
                                            {contract.ask ? `$${contract.ask.toFixed(2)}` : '—'}
                                          </td>
                                          <td className={cn('text-right px-2 py-2', getIVColor(contract.impliedVolatility))}>
                                            {contract.impliedVolatility
                                              ? `${(contract.impliedVolatility * 100).toFixed(0)}%`
                                              : '—'
                                            }
                                          </td>
                                          <td className="text-right px-2 py-2 text-muted-foreground">
                                            {contract.volume ? contract.volume.toLocaleString() : '—'}
                                          </td>
                                          <td className="px-2 py-2">
                                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2">
                                              Select
                                            </Button>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: Confirm + Live Quote ── */}
            {step === 'confirm' && selectedContract && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setStep('chain'); stopQuotePolling() }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Back
                  </button>
                </div>

                {/* Contract summary */}
                <div className={cn(
                  'rounded-xl p-4 border-2',
                  direction === 'CALL'
                    ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
                    : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={direction === 'CALL' ? 'default' : 'destructive'} className="text-sm px-3">
                        {direction === 'CALL' ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                        {direction}
                      </Badge>
                      <span className="font-bold text-lg">${selectedContract.strike} Strike</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Exp: {formatDate(selectedExpiry)}</span>
                    </div>
                  </div>

                  {/* Live quote */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Bid', value: liveQuote?.bid ?? selectedContract.bid, color: 'text-muted-foreground' },
                      { label: 'Mid', value: liveQuote?.mid ?? selectedContract.mid, color: direction === 'CALL' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
                      { label: 'Ask', value: liveQuote?.ask ?? selectedContract.ask, color: 'text-muted-foreground' },
                      { label: 'IV', value: selectedContract.impliedVolatility, isIV: true, color: getIVColor(selectedContract.impliedVolatility) },
                    ].map(item => (
                      <div key={item.label} className="text-center">
                        <div className="text-xs text-muted-foreground mb-0.5">{item.label}</div>
                        <div className={cn('font-bold text-sm', item.color)}>
                          {item.isIV
                            ? (item.value ? `${((item.value as number) * 100).toFixed(0)}%` : '—')
                            : formatPrice(item.value as number)
                          }
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Refresh indicator */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {loadingQuote
                        ? <><Loader2 className="h-3 w-3 animate-spin" /><span>Refreshing...</span></>
                        : <><Activity className="h-3 w-3 text-green-500" /><span>Live price · refresh in {refreshCountdown}s</span></>
                      }
                    </div>
                    <button
                      onClick={() => fetchLiveQuote(selectedContract.ticker)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Now
                    </button>
                  </div>
                </div>

                {/* Entry price */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="entry_price" className="text-sm font-medium">
                      Entry Price *
                    </Label>
                    <div className="relative mt-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="entry_price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={entryPrice}
                        onChange={e => setEntryPrice(e.target.value)}
                        className="pl-8"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Premium per share (contract = 100 shares)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="qty" className="text-sm font-medium">
                      Contracts *
                    </Label>
                    <Input
                      id="qty"
                      type="number"
                      min="1"
                      value={qty}
                      onChange={e => setQty(e.target.value)}
                      className="mt-1"
                    />
                    {entryPrice && qty && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Total cost: ${(parseFloat(entryPrice) * parseInt(qty) * 100).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="stoploss" className="text-sm font-medium">
                    Stop Loss (Optional)
                  </Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="stoploss"
                      type="number"
                      step="0.01"
                      value={stoploss}
                      onChange={e => setStoploss(e.target.value)}
                      className="pl-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-sm font-medium">
                    Notes (Optional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Trade rationale..."
                    rows={2}
                    className="mt-1"
                  />
                </div>

                {/* Win threshold preview */}
                {entryPrice && qty && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-xs border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-1.5 mb-1">
                      <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                      <span className="font-semibold text-blue-700 dark:text-blue-300">Win Threshold</span>
                    </div>
                    <span className="text-muted-foreground">
                      Need contract price to reach{' '}
                      <strong className="text-foreground">
                        ${(parseFloat(entryPrice) + 100 / (parseInt(qty || '1') * 100)).toFixed(2)}
                      </strong>{' '}
                      (+${(100 / (parseInt(qty || '1') * 100)).toFixed(2)}) to reach $100 profit
                    </span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitting || !entryPrice || !qty}
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                    ) : (
                      'Create Trade'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Average entry dialog */}
      <AlertDialog open={showAveragePrompt} onOpenChange={setShowAveragePrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existing Active Trade Found</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active {existingTrade?.direction} trade for {symbol} at strike ${existingTrade?.strike} expiring {existingTrade?.expiry_date}.
              <br /><br />
              Would you like to <strong>average your entry</strong> (combine quantities with weighted avg price) or open a <strong>new separate trade</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowAveragePrompt(false); setExistingTrade(null) }}>
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={() => createTrade(false)}>New Trade</Button>
            <AlertDialogAction onClick={() => createTrade(true)}>Average Entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
