'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLanguage } from '@/lib/i18n/language-context'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, TrendingUp, TrendingDown, FileText } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTradeCreated: () => void
}

interface SymbolResult { symbol: string; name: string }
interface Strike {
  strike: number
  ticker: string
  bid?: number
  ask?: number
  mid?: number
  last?: number
}
interface ExpGroup { expirationDate: string; dte: number; strikes: Strike[] }

type Step = 'search' | 'chain' | 'confirm'

export function CreateCompanyContractDealDialog({ open, onOpenChange, onTradeCreated }: Props) {
  const { language } = useLanguage()
  const ar = language === 'ar'

  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SymbolResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolResult | null>(null)

  const [direction, setDirection] = useState<'CALL' | 'PUT'>('CALL')
  const [stockPrice, setStockPrice] = useState<number | null>(null)
  const [expirations, setExpirations] = useState<ExpGroup[]>([])
  const [selectedExp, setSelectedExp] = useState('')
  const [loadingChain, setLoadingChain] = useState(false)
  const [chainError, setChainError] = useState<string | null>(null)
  const [selectedStrike, setSelectedStrike] = useState<Strike | null>(null)

  const [entryPrice, setEntryPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [target, setTarget] = useState('')
  const [stop, setStop] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep('search'); setQuery(''); setResults([]); setSelectedSymbol(null)
    setDirection('CALL'); setStockPrice(null); setExpirations([]); setSelectedExp('')
    setSelectedStrike(null); setEntryPrice(''); setQty('1'); setTarget(''); setStop('')
    setNotes(''); setError(null); setChainError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query || query.length < 1) { setResults([]); return }
      setSearching(true)
      try {
        const res = await fetch(`/api/search-symbols?q=${encodeURIComponent(query)}&market=stocks`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.results || data.symbols || [])
        }
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const loadChain = useCallback(async (symbol: string, dir: 'CALL' | 'PUT') => {
    setLoadingChain(true); setChainError(null); setSelectedStrike(null)
    try {
      const res = await fetch(`/api/companies/options-chain?symbol=${encodeURIComponent(symbol)}&direction=${dir.toLowerCase()}&maxDTE=60&percentBand=0.12`)
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to import contracts')
      }
      const data = await res.json()
      setStockPrice(data.stockPrice ?? null)
      setExpirations(data.expirations || [])
      setSelectedExp(data.expirations?.[0]?.expirationDate || '')
    } catch (e) {
      setChainError(e instanceof Error ? e.message : 'Failed to import contracts')
    } finally {
      setLoadingChain(false)
    }
  }, [])

  const selectSymbol = (s: SymbolResult) => {
    setSelectedSymbol(s)
    setStep('chain')
    loadChain(s.symbol, direction)
  }

  const changeDirection = (dir: 'CALL' | 'PUT') => {
    setDirection(dir)
    if (selectedSymbol) loadChain(selectedSymbol.symbol, dir)
  }

  const selectStrike = (s: Strike) => {
    setSelectedStrike(s)
    const price = s.mid || s.ask || s.last || s.bid
    if (price) setEntryPrice(price.toFixed(2))
    setStep('confirm')
  }

  const handleSubmit = async () => {
    if (!selectedSymbol || !selectedStrike || !entryPrice) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/companies/contract-trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol.symbol,
          direction,
          strike: selectedStrike.strike,
          expiry_date: selectedExp,
          polygon_option_ticker: selectedStrike.ticker,
          entry_price: parseFloat(entryPrice),
          contracts_qty: qty ? parseInt(qty) : 1,
          targets: target ? [{ level: parseFloat(target) }] : [],
          stoploss: stop ? { level: parseFloat(stop) } : null,
          notes: notes || null,
          underlying_price: stockPrice,
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to create deal')
      }
      onTradeCreated()
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create deal')
    } finally {
      setSubmitting(false)
    }
  }

  const strikes = expirations.find((g) => g.expirationDate === selectedExp)?.strikes || []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {ar ? 'صفقة عقد شركة جديدة' : 'New Company Contract Deal'}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? 'ابحث عن شركة، استورد عقود الخيارات من الـ API، واختر العقد لتتبعه لحظياً'
              : 'Search a company, import its options contracts from the API, and pick one to track live'}
          </DialogDescription>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-10"
                placeholder={ar ? 'ابحث عن شركة (مثال: AAPL)' : 'Search company (e.g. AAPL)'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {searching && (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            )}
            {!searching && results.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.map((r) => (
                  <button key={r.symbol} onClick={() => selectSymbol(r)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-left">
                    <div>
                      <div className="font-semibold">{r.symbol}</div>
                      <div className="text-sm text-muted-foreground">{r.name}</div>
                    </div>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'chain' && selectedSymbol && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-accent">
              <div className="font-semibold">
                {selectedSymbol.symbol}
                {stockPrice ? <span className="text-muted-foreground font-normal"> @ ${stockPrice.toFixed(2)}</span> : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={direction === 'CALL' ? 'default' : 'outline'} onClick={() => changeDirection('CALL')}>
                  <TrendingUp className="h-4 w-4 mr-1" /> CALL
                </Button>
                <Button size="sm" variant={direction === 'PUT' ? 'destructive' : 'outline'} onClick={() => changeDirection('PUT')}>
                  <TrendingDown className="h-4 w-4 mr-1" /> PUT
                </Button>
              </div>
            </div>

            {loadingChain ? (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{ar ? 'جاري استيراد العقود...' : 'Importing contracts...'}</p>
              </div>
            ) : chainError ? (
              <div className="text-center py-8">
                <p className="text-destructive text-sm mb-3">{chainError}</p>
                <Button variant="outline" size="sm" onClick={() => loadChain(selectedSymbol.symbol, direction)}>
                  {ar ? 'إعادة المحاولة' : 'Try Again'}
                </Button>
              </div>
            ) : strikes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{ar ? 'لا توجد عقود متاحة' : 'No contracts available'}</div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{ar ? 'تاريخ الانتهاء' : 'Expiration'}</Label>
                  <Select value={selectedExp} onValueChange={setSelectedExp}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {expirations.map((g) => (
                        <SelectItem key={g.expirationDate} value={g.expirationDate}>
                          {g.expirationDate} ({g.dte}d)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {strikes.map((s) => (
                    <button key={s.ticker} onClick={() => selectStrike(s)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-left">
                      <div className="font-semibold">${s.strike}</div>
                      <div className="text-sm text-muted-foreground">
                        {ar ? 'العلاوة' : 'Premium'}: ${(s.mid || s.ask || s.last || s.bid || 0).toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div>
              <Button variant="outline" onClick={() => setStep('search')}>{ar ? 'رجوع' : 'Back'}</Button>
            </div>
          </div>
        )}

        {step === 'confirm' && selectedStrike && selectedSymbol && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-accent">
              <div>
                <div className="font-semibold text-lg flex items-center gap-2">
                  {selectedSymbol.symbol} ${selectedStrike.strike}
                  <Badge variant={direction === 'CALL' ? 'default' : 'destructive'}>{direction}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{selectedStrike.ticker} · {selectedExp}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{ar ? 'سعر الدخول (العلاوة)' : 'Entry (Premium)'}</Label>
                <Input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{ar ? 'عدد العقود' : 'Contracts'}</Label>
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{ar ? 'الهدف' : 'Target'}</Label>
                <Input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{ar ? 'وقف الخسارة' : 'Stop Loss'}</Label>
                <Input type="number" step="0.01" value={stop} onChange={(e) => setStop(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{ar ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={ar ? 'ملاحظات اختيارية' : 'Optional notes'} />
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep('chain')}>{ar ? 'رجوع' : 'Back'}</Button>
              <Button onClick={handleSubmit} disabled={submitting || !entryPrice}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {ar ? 'إنشاء الصفقة' : 'Create Deal'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default CreateCompanyContractDealDialog
