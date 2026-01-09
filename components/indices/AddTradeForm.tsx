'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader as Loader2, Plus, Trash2, Search, Calendar, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'

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

export function AddTradeForm({ analysisId, indexSymbol: initialIndexSymbol, onComplete, onCancel, standalone = false }: AddTradeFormProps) {
  const [loading, setLoading] = useState(false)
  const [searchingContracts, setSearchingContracts] = useState(false)
  const [expirationGroups, setExpirationGroups] = useState<ExpirationGroup[]>([])
  const [selectedContract, setSelectedContract] = useState<OptionContract | null>(null)
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
  })

  useEffect(() => {
    fetchTelegramChannels()
    fetchMarketStatus()
  }, [analysisId])

  const fetchTelegramChannels = async () => {
    try {
      const supabase = createClient()

      const { data: user } = await supabase.auth.getUser()
      if (!user?.user?.id) {
        setLoadingChannels(false)
        return
      }

      const channels: TelegramChannel[] = []

      if (analysisId) {
        const { data: analysisData } = await supabase
          .from('index_analyses')
          .select('telegram_channel_id, telegram_channels(id, channel_name, channel_id)')
          .eq('id', analysisId)
          .maybeSingle()

        if (analysisData?.telegram_channel_id && analysisData.telegram_channels) {
          channels.push({
            id: 'analysis',
            channel_name: `Analysis Default: ${analysisData.telegram_channels.channel_name}`,
            channel_id: analysisData.telegram_channels.channel_id,
            source: 'analysis' as const
          })
        }
      }

      const { data: analystData } = await supabase
        .from('telegram_channels')
        .select('id, channel_name, channel_id')
        .eq('user_id', user.user.id)
        .eq('enabled', true)

      if (analystData) {
        channels.push(...analystData.map(ch => ({
          ...ch,
          source: 'analyst' as const
        })))
      }

      const { data: planData } = await supabase
        .from('analyzer_plans')
        .select('id, name, telegram_channel_id, telegram_channels(id, channel_name, channel_id)')
        .eq('analyst_id', user.user.id)
        .eq('is_active', true)
        .not('telegram_channel_id', 'is', null)

      if (planData) {
        for (const plan of planData) {
          if (plan.telegram_channels) {
            channels.push({
              id: plan.telegram_channels.id,
              channel_name: plan.telegram_channels.channel_name,
              channel_id: plan.telegram_channels.channel_id,
              source: 'plan' as const,
              plan_name: plan.name
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

  const fetchMarketStatus = async () => {
    try {
      const response = await fetch('/api/indices/market-status')
      if (response.ok) {
        const data = await response.json()
        setMarketStatus(data)
      }
    } catch (error) {
      console.error('Error fetching market status:', error)
    }
  }

  const getDTERange = (preset: DatePreset): { minDTE: number; maxDTE: number } => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    switch (preset) {
      case 'today':
        return { minDTE: 0, maxDTE: 0 }
      case 'tomorrow':
        return { minDTE: 1, maxDTE: 1 }
      case 'week':
        return { minDTE: 0, maxDTE: 7 }
      case 'month':
        return { minDTE: 0, maxDTE: 30 }
      case 'custom':
        if (customDate) {
          const targetDate = new Date(customDate)
          targetDate.setHours(0, 0, 0, 0)
          const dte = Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          return { minDTE: Math.max(0, dte), maxDTE: Math.max(0, dte) }
        }
        return { minDTE: 0, maxDTE: 45 }
      default:
        return { minDTE: 0, maxDTE: 7 }
    }
  }

  const searchContracts = async () => {
    if (!formData.option_type) {
      toast.error('Please select option type to search')
      return
    }

    setSearchingContracts(true)
    try {
      const { minDTE, maxDTE } = getDTERange(datePreset)

      const params = new URLSearchParams({
        underlying: formData.underlying_index_symbol,
        direction: formData.option_type,
        minDTE: minDTE.toString(),
        maxDTE: maxDTE.toString(),
        maxExpirations: '5',
        strikesPerExpiration: '10',
      })

      const response = await fetch(`/api/indices/contracts?${params}`)
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

          // Initialize visible strikes to 5 for each expiration
          const initialVisible: Record<string, number> = {}
          transformedGroups.forEach((group: ExpirationGroup) => {
            initialVisible[group.expirationDate] = 5
          })
          setVisibleStrikesPerExpiration(initialVisible)

          const totalContracts = transformedGroups.reduce(
            (sum: number, exp: ExpirationGroup) => sum + exp.strikes.length,
            0
          )
          toast.success(`Found ${totalContracts} contracts across ${transformedGroups.length} expiration(s)`)
        } else {
          toast.error('No contracts found for selected criteria')
          setExpirationGroups([])
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to search contracts')
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
    setFormData({
      ...formData,
      polygon_option_ticker: contract.ticker,
      strike: contract.strike.toString(),
      expiry: contract.expiry,
      option_type: contract.type,
      direction: contract.type,
    })
  }

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset)
    setExpirationGroups([])
    setSelectedContract(null)
    setVisibleStrikesPerExpiration({})
  }

  const loadMoreStrikes = (expirationDate: string) => {
    setVisibleStrikesPerExpiration(prev => ({
      ...prev,
      [expirationDate]: (prev[expirationDate] || 5) + 5
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
        auto_publish_telegram: formData.auto_publish_telegram,
      }

      if (marketStatus && !marketStatus.isOpen) {
        payload.current_price = parseFloat(formData.current_price)
        payload.entry_price = formData.entry_price ? parseFloat(formData.entry_price) : parseFloat(formData.current_price)
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
        toast.success('Trade added successfully!')
        if (formData.auto_publish_telegram) {
          toast.success('Published to Telegram!')
        }
        onComplete()
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

  return (
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
                    Search Available Contracts
                  </>
                )}
              </Button>

              {expirationGroups.length > 0 && (
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Available Contracts by Expiration
                  </Label>
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
                      const visibleCount = visibleStrikesPerExpiration[group.expirationDate] || 5
                      const visibleStrikes = group.strikes.slice(0, visibleCount)
                      const hasMore = visibleCount < group.strikes.length

                      return (
                      <TabsContent key={group.expirationDate} value={group.expirationDate} className="space-y-2">
                        <div className="text-xs text-muted-foreground mb-2">
                          {group.strikes.length} contract{group.strikes.length !== 1 ? 's' : ''} • Expires in {group.dte} day{group.dte !== 1 ? 's' : ''}
                          {hasMore && <span className="ml-2">(Showing {visibleCount} of {group.strikes.length})</span>}
                        </div>
                        <div className="space-y-2">
                          <div className="grid gap-2 max-h-80 overflow-y-auto pb-2">
                          {visibleStrikes.map((contract) => (
                            <Card
                              key={contract.ticker}
                              className={`cursor-pointer transition-colors ${
                                selectedContract?.ticker === contract.ticker
                                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                                  : 'hover:bg-muted/50'
                              }`}
                              onClick={() => selectContract(contract)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">{formData.underlying_index_symbol} ${contract.strike}</div>
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
                                    <div className="text-[10px] text-muted-foreground">
                                      ${(contract.bid || 0).toFixed(2)} × ${(contract.ask || 0).toFixed(2)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      Vol: {(contract.volume || 0).toLocaleString()} OI: {(contract.openInterest || 0).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
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
                              Load 5 More Contracts ({group.strikes.length - visibleCount} remaining)
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
                <CardContent className="space-y-2">
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
                      <div className="text-muted-foreground text-xs">Mid Price</div>
                      <div className="font-medium">${selectedContract.mid.toFixed(2)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
            </div>
            <p className="text-sm text-muted-foreground">
              Markets are closed. Set current and entry prices manually. During RTH, live prices will be used automatically.
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
          <h4 className="font-medium">Telegram Publishing</h4>

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

              {formData.telegram_channel_id && formData.telegram_channel_id !== 'none' && (
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
  )
}
