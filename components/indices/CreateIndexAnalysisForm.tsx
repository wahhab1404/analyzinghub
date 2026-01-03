'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { Loader2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Contract {
  contract_id: string
  ticker: string
  contract_type: 'call' | 'put'
  strike_price: number
  expiration_date: string
  bid?: number
  ask?: number
  mid?: number
  last?: number
  volume?: number
  open_interest?: number
  implied_volatility?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
}

interface SymbolSearchResult {
  symbol: string
  name: string
  type: string
  exchange: string
}

export function CreateIndexAnalysisForm({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [symbolSearch, setSymbolSearch] = useState('')
  const [symbolResults, setSymbolResults] = useState<SymbolSearchResult[]>([])
  const [symbolOpen, setSymbolOpen] = useState(false)
  const [searchingSymbols, setSearchingSymbols] = useState(false)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [expiryFilter, setExpiryFilter] = useState<string>('today')
  const [strikeRange, setStrikeRange] = useState<string>('5')
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [formData, setFormData] = useState({
    underlying_symbol: '',
    contract_id: '',
    direction: 'call' as 'call' | 'put',
    analysis_type: 'day_trade' as 'day_trade' | 'swing' | 'long_term',
    thesis: '',
    entry_min: '',
    entry_max: '',
    targets: ['', ''],
    stop_loss: '',
    risk_per_contract: '',
    chart_image: null as File | null,
  })

  const searchSymbols = async (query: string) => {
    setSearchingSymbols(true)
    try {
      const url = query ? `/api/indices/search-symbols?q=${encodeURIComponent(query)}` : '/api/indices/search-symbols'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setSymbolResults(data.results || [])
      }
    } catch (error) {
      console.error('Error searching indices:', error)
    } finally {
      setSearchingSymbols(false)
    }
  }

  const fetchCurrentPrice = async (symbol: string) => {
    setLoadingPrice(true)
    try {
      // Use Polygon's index ticker format (I:SPX, I:NDX, etc.)
      const indexTicker = `I:${symbol}`
      const response = await fetch(`/api/stock-price?symbol=${indexTicker}`)

      if (response.ok) {
        const data = await response.json()
        setCurrentPrice(data.price)
      } else {
        console.error('Failed to fetch index price:', await response.text())
        setCurrentPrice(null)
      }
    } catch (error) {
      console.error('Error fetching current price:', error)
      setCurrentPrice(null)
    } finally {
      setLoadingPrice(false)
    }
  }

  const getExpiryDate = () => {
    const today = new Date()
    switch (expiryFilter) {
      case 'today':
        return today.toISOString().split('T')[0]
      case 'this_week':
        const endOfWeek = new Date(today)
        endOfWeek.setDate(today.getDate() + (5 - today.getDay()))
        return endOfWeek.toISOString().split('T')[0]
      case 'next_week':
        const nextWeek = new Date(today)
        nextWeek.setDate(today.getDate() + 7)
        return nextWeek.toISOString().split('T')[0]
      default:
        return undefined
    }
  }

  const fetchContracts = async (symbol: string, direction: 'call' | 'put') => {
    if (!symbol || symbol.length < 2) return

    setLoadingContracts(true)
    try {
      const params = new URLSearchParams({
        underlying: symbol,
        optionType: direction,
        limit: '50'
      })

      const expiry = getExpiryDate()
      if (expiry) {
        params.append('expiry', expiry)
      }

      if (currentPrice && strikeRange) {
        const rangePercent = parseFloat(strikeRange) / 100
        const minStrike = currentPrice * (1 - rangePercent)
        const maxStrike = currentPrice * (1 + rangePercent)
        params.append('minStrike', minStrike.toString())
        params.append('maxStrike', maxStrike.toString())
      }

      const response = await fetch(`/api/indices/contracts?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        const sortedContracts = (data.contracts || []).sort((a: Contract, b: Contract) => {
          // Sort by proximity to current price
          if (currentPrice) {
            const aDiff = Math.abs(a.strike_price - currentPrice)
            const bDiff = Math.abs(b.strike_price - currentPrice)
            return aDiff - bDiff
          }
          return a.strike_price - b.strike_price
        })
        setContracts(sortedContracts)
      } else {
        const error = await response.json()
        console.error('Error fetching contracts:', error)
        toast.error(error.error || 'Failed to load contracts')
      }
    } catch (error) {
      console.error('Error fetching contracts:', error)
      toast.error('Failed to load contracts')
    } finally {
      setLoadingContracts(false)
    }
  }

  const addTarget = () => {
    setFormData({ ...formData, targets: [...formData.targets, ''] })
  }

  const removeTarget = (index: number) => {
    const newTargets = formData.targets.filter((_, i) => i !== index)
    setFormData({ ...formData, targets: newTargets })
  }

  const updateTarget = (index: number, value: string) => {
    const newTargets = [...formData.targets]
    newTargets[index] = value
    setFormData({ ...formData, targets: newTargets })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB')
        return
      }
      if (!file.type.startsWith('image/')) {
        toast.error('File must be an image')
        return
      }
      setFormData({ ...formData, chart_image: file })
    }
  }

  useEffect(() => {
    searchSymbols('')
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (symbolSearch) {
        searchSymbols(symbolSearch)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [symbolSearch])

  useEffect(() => {
    if (formData.underlying_symbol) {
      fetchCurrentPrice(formData.underlying_symbol)
    }
  }, [formData.underlying_symbol])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.underlying_symbol) {
        fetchContracts(formData.underlying_symbol, formData.direction)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [formData.underlying_symbol, formData.direction, expiryFilter, strikeRange, currentPrice])

  const fetchContractQuote = async (contractId: string, underlying: string) => {
    setLoadingQuote(true)
    try {
      const response = await fetch(
        `/api/indices/contract-quote?ticker=${encodeURIComponent(contractId)}&underlying=${underlying}`
      )
      if (response.ok) {
        const data = await response.json()
        return data.quote
      }
    } catch (error) {
      console.error('Error fetching contract quote:', error)
    } finally {
      setLoadingQuote(false)
    }
    return null
  }

  useEffect(() => {
    if (formData.contract_id) {
      const contract = contracts.find(c => c.contract_id === formData.contract_id)
      if (contract) {
        setSelectedContract(contract)
        // Fetch real-time quote data for selected contract
        if (formData.underlying_symbol) {
          fetchContractQuote(contract.contract_id, formData.underlying_symbol).then(quote => {
            if (quote) {
              setSelectedContract({ ...contract, bid: quote.bid, ask: quote.ask, mid: quote.mid, last: quote.last, volume: quote.volume, open_interest: quote.openInterest, implied_volatility: quote.impliedVolatility, delta: quote.delta, gamma: quote.gamma, theta: quote.theta, vega: quote.vega })
            }
          })
        }
      }
    } else {
      setSelectedContract(null)
    }
  }, [formData.contract_id, contracts, formData.underlying_symbol])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let chartImageUrl = null

      if (formData.chart_image) {
        const formDataUpload = new FormData()
        formDataUpload.append('file', formData.chart_image)
        formDataUpload.append('bucket', 'index-charts')

        const uploadResponse = await fetch('/api/upload-chart', {
          method: 'POST',
          body: formDataUpload,
        })

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json()
          chartImageUrl = uploadData.url
        } else {
          toast.error('Failed to upload chart image')
          setLoading(false)
          return
        }
      }

      const response = await fetch('/api/indices/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          underlying_symbol: formData.underlying_symbol,
          contract_id: formData.contract_id,
          direction: formData.direction,
          analysis_type: formData.analysis_type,
          thesis: formData.thesis,
          entry_range_min: parseFloat(formData.entry_min),
          entry_range_max: parseFloat(formData.entry_max),
          targets: formData.targets.filter(t => t).map(t => parseFloat(t)),
          stop_loss: parseFloat(formData.stop_loss),
          risk_per_contract: parseFloat(formData.risk_per_contract),
          chart_image_url: chartImageUrl,
        }),
      })

      if (response.ok) {
        toast.success('Analysis created successfully!')
        onComplete()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create analysis')
      }
    } catch (error) {
      toast.error('Failed to create analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="chart">Chart Image *</Label>
        <Input
          id="chart"
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          required
        />
        {formData.chart_image && (
          <p className="text-sm text-muted-foreground">
            Selected: {formData.chart_image.name}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="symbol">Underlying Symbol</Label>
          <Popover
            open={symbolOpen}
            onOpenChange={(open) => {
              setSymbolOpen(open)
              if (open && symbolResults.length === 0) {
                searchSymbols('')
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={symbolOpen}
                className="w-full justify-between"
              >
                {formData.underlying_symbol || "Search index..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search indices: SPX, NDX, RUT..."
                  value={symbolSearch}
                  onValueChange={setSymbolSearch}
                />
                <CommandList>
                  {searchingSymbols ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </div>
                  ) : symbolResults.length === 0 ? (
                    <CommandEmpty>No indices found.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {symbolResults.map((result) => (
                        <CommandItem
                          key={result.symbol}
                          value={result.symbol}
                          onSelect={(value) => {
                            setFormData({ ...formData, underlying_symbol: value.toUpperCase(), contract_id: '' })
                            setContracts([])
                            setSymbolOpen(false)
                            setSymbolSearch('')
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formData.underlying_symbol === result.symbol ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{result.symbol}</span>
                            <span className="text-xs text-muted-foreground">
                              {result.name} · {result.type}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="direction">Trade Direction</Label>
          <Select
            value={formData.direction}
            onValueChange={(value: any) => setFormData({ ...formData, direction: value, contract_id: '' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Call (Long)</SelectItem>
              <SelectItem value="put">Put (Short)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Current Price Display */}
      {formData.underlying_symbol && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Current Index Price</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {loadingPrice ? (
                  <Loader2 className="h-6 w-6 animate-spin inline" />
                ) : currentPrice ? (
                  `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ) : (
                  'Loading...'
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Previous day close via Polygon
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">Index</p>
              <p className="text-xl font-bold">{formData.underlying_symbol}</p>
              <p className="text-xs text-muted-foreground">
                {formData.underlying_symbol === 'SPX' && 'S&P 500'}
                {formData.underlying_symbol === 'NDX' && 'Nasdaq 100'}
                {formData.underlying_symbol === 'DJI' && 'Dow Jones'}
                {formData.underlying_symbol === 'RUT' && 'Russell 2000'}
                {formData.underlying_symbol === 'VIX' && 'Volatility Index'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contract Filters */}
      {formData.underlying_symbol && (
        <div className="space-y-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Contract Filters</h3>
            <span className="text-xs text-muted-foreground">Narrow down your options</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiry-filter">Expiration</Label>
              <Select
                value={expiryFilter}
                onValueChange={(value) => {
                  setExpiryFilter(value)
                  setFormData({ ...formData, contract_id: '' })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today (0 DTE)</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="next_week">Next Week</SelectItem>
                  <SelectItem value="all">All Dates</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="strike-range">Strike Range (ATM ±)</Label>
              <Select
                value={strikeRange}
                onValueChange={(value) => {
                  setStrikeRange(value)
                  setFormData({ ...formData, contract_id: '' })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">±2% (Very Near Money)</SelectItem>
                  <SelectItem value="5">±5% (Near Money)</SelectItem>
                  <SelectItem value="10">±10% (Moderate Range)</SelectItem>
                  <SelectItem value="20">±20% (Wide Range)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="contract">Options Contract</Label>
        {loadingContracts && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading contracts from Polygon.io...</span>
          </div>
        )}
        <Select
          value={formData.contract_id}
          onValueChange={(value) => setFormData({ ...formData, contract_id: value })}
          disabled={loadingContracts || contracts.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={
              loadingContracts
                ? "Loading contracts..."
                : contracts.length === 0
                ? "No contracts found with filters"
                : "Select contract"
            } />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {contracts.map((contract) => {
              const moneyness = currentPrice
                ? ((contract.strike_price - currentPrice) / currentPrice * 100).toFixed(1)
                : null
              const atmLabel = moneyness
                ? parseFloat(moneyness) === 0
                  ? ' [ATM]'
                  : parseFloat(moneyness) > 0
                  ? ` [+${moneyness}% OTM]`
                  : ` [${moneyness}% ITM]`
                : ''

              return (
                <SelectItem key={contract.contract_id} value={contract.contract_id}>
                  <div className="flex flex-col py-1">
                    <span className="font-medium">
                      ${contract.strike_price} {contract.contract_type.toUpperCase()}{atmLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {contract.expiration_date} · {contract.ticker}
                      {contract.mid && ` · Mid: $${contract.mid.toFixed(2)}`}
                    </span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Selected Contract Details */}
      {selectedContract && (
        <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-2 border-green-200 dark:border-green-800">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Selected Contract</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {selectedContract.ticker}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">Strike</p>
                <p className="text-2xl font-bold">
                  ${selectedContract.strike_price.toLocaleString()}
                </p>
              </div>
            </div>

            {loadingQuote && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading real-time pricing...</span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {selectedContract.bid !== undefined && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Bid</p>
                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    ${selectedContract.bid.toFixed(2)}
                  </p>
                </div>
              )}
              {selectedContract.ask !== undefined && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Ask</p>
                  <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                    ${selectedContract.ask.toFixed(2)}
                  </p>
                </div>
              )}
              {selectedContract.mid !== undefined && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Mid</p>
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                    ${selectedContract.mid.toFixed(2)}
                  </p>
                </div>
              )}
              {selectedContract.last !== undefined && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Last</p>
                  <p className="text-lg font-semibold">
                    ${selectedContract.last.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            {(selectedContract.volume !== undefined || selectedContract.open_interest !== undefined) && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-green-200 dark:border-green-800">
                {selectedContract.volume !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Volume</p>
                    <p className="text-sm font-semibold">
                      {selectedContract.volume.toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedContract.open_interest !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Open Interest</p>
                    <p className="text-sm font-semibold">
                      {selectedContract.open_interest.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {(selectedContract.delta !== undefined || selectedContract.gamma !== undefined ||
              selectedContract.theta !== undefined || selectedContract.vega !== undefined) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-green-200 dark:border-green-800">
                {selectedContract.delta !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Delta</p>
                    <p className="text-sm font-mono font-semibold">
                      {selectedContract.delta.toFixed(3)}
                    </p>
                  </div>
                )}
                {selectedContract.gamma !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Gamma</p>
                    <p className="text-sm font-mono font-semibold">
                      {selectedContract.gamma.toFixed(4)}
                    </p>
                  </div>
                )}
                {selectedContract.theta !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Theta</p>
                    <p className="text-sm font-mono font-semibold">
                      {selectedContract.theta.toFixed(3)}
                    </p>
                  </div>
                )}
                {selectedContract.vega !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Vega</p>
                    <p className="text-sm font-mono font-semibold">
                      {selectedContract.vega.toFixed(3)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {selectedContract.implied_volatility !== undefined && (
              <div className="pt-2 border-t border-green-200 dark:border-green-800">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Implied Volatility</p>
                  <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                    {(selectedContract.implied_volatility * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <Label htmlFor="type">Analysis Type</Label>
        <Select
          value={formData.analysis_type}
          onValueChange={(value: any) => setFormData({ ...formData, analysis_type: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day_trade">Day Trade (0-1 day)</SelectItem>
            <SelectItem value="swing">Swing Trade (2-7 days)</SelectItem>
            <SelectItem value="long_term">Long Term (7+ days)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="thesis">Analysis Thesis</Label>
        <Textarea
          id="thesis"
          placeholder="Explain your reasoning..."
          value={formData.thesis}
          onChange={(e) => setFormData({ ...formData, thesis: e.target.value })}
          rows={3}
          required
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="entry_min">Entry Min ($)</Label>
          <Input
            id="entry_min"
            type="number"
            step="0.01"
            placeholder="1.50"
            value={formData.entry_min}
            onChange={(e) => setFormData({ ...formData, entry_min: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry_max">Entry Max ($)</Label>
          <Input
            id="entry_max"
            type="number"
            step="0.01"
            placeholder="2.00"
            value={formData.entry_max}
            onChange={(e) => setFormData({ ...formData, entry_max: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="risk">Risk per Contract ($)</Label>
          <Input
            id="risk"
            type="number"
            step="0.01"
            placeholder="100"
            value={formData.risk_per_contract}
            onChange={(e) => setFormData({ ...formData, risk_per_contract: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Targets ($)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addTarget}>
            <Plus className="h-4 w-4 mr-1" />
            Add Target
          </Button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {formData.targets.map((target, index) => (
            <div key={index} className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder={`Target ${index + 1}`}
                value={target}
                onChange={(e) => updateTarget(index, e.target.value)}
                required={index === 0}
              />
              {index > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTarget(index)}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stop">Stop Loss ($)</Label>
        <Input
          id="stop"
          type="number"
          step="0.01"
          placeholder="1.00"
          value={formData.stop_loss}
          onChange={(e) => setFormData({ ...formData, stop_loss: e.target.value })}
          required
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onComplete}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !formData.contract_id}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Analysis
        </Button>
      </div>
    </form>
  )
}
