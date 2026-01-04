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
import { Loader2, Plus, Trash2, Search, Calendar, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface AddTradeFormProps {
  analysisId: string
  indexSymbol: string
  onComplete: () => void
  onCancel: () => void
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

export function AddTradeForm({ analysisId, indexSymbol, onComplete, onCancel }: AddTradeFormProps) {
  const [loading, setLoading] = useState(false)
  const [searchingContracts, setSearchingContracts] = useState(false)
  const [expirationGroups, setExpirationGroups] = useState<ExpirationGroup[]>([])
  const [selectedContract, setSelectedContract] = useState<OptionContract | null>(null)
  const [datePreset, setDatePreset] = useState<DatePreset>('week')
  const [customDate, setCustomDate] = useState('')
  const [formData, setFormData] = useState({
    instrument_type: 'options' as 'options' | 'futures',
    direction: 'call' as 'call' | 'put' | 'long' | 'short',
    underlying_index_symbol: indexSymbol,
    polygon_option_ticker: '',
    strike: '',
    expiry: '',
    option_type: 'call' as 'call' | 'put',
    entry_override: '',
    entry_override_reason: '',
    targets: [{ price: '', percentage: '' }] as Array<{ price: string, percentage: string }>,
    stoploss: { price: '', percentage: '' },
    notes: '',
    auto_publish_telegram: false,
  })

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
        underlying: indexSymbol,
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

      const payload = {
        instrument_type: formData.instrument_type,
        direction: formData.direction,
        underlying_index_symbol: formData.underlying_index_symbol,
        polygon_option_ticker: formData.polygon_option_ticker || null,
        strike: formData.strike ? parseFloat(formData.strike) : null,
        expiry: formData.expiry || null,
        option_type: formData.option_type || null,
        entry_override: formData.entry_override ? parseFloat(formData.entry_override) : null,
        entry_override_reason: formData.entry_override_reason || null,
        targets,
        stoploss,
        notes: formData.notes || null,
        auto_publish_telegram: formData.auto_publish_telegram,
      }

      const response = await fetch(`/api/indices/analyses/${analysisId}/trades`, {
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
                    {expirationGroups.map((group) => (
                      <TabsContent key={group.expirationDate} value={group.expirationDate} className="space-y-2">
                        <div className="text-xs text-muted-foreground mb-2">
                          {group.strikes.length} contract{group.strikes.length !== 1 ? 's' : ''} • Expires in {group.dte} day{group.dte !== 1 ? 's' : ''}
                        </div>
                        <div className="grid gap-2 max-h-80 overflow-y-auto">
                          {group.strikes.map((contract) => (
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
                                    <div className="font-medium text-sm">{indexSymbol} ${contract.strike}</div>
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
                      </TabsContent>
                    ))}
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

        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Entry Override (Optional)</h4>
          <p className="text-sm text-muted-foreground">
            By default, entry price is fetched from Polygon. Override if needed.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry_override">Entry Price Override</Label>
              <Input
                id="entry_override"
                type="number"
                step="0.0001"
                value={formData.entry_override}
                onChange={(e) => setFormData({ ...formData, entry_override: e.target.value })}
                placeholder="Leave empty to use Polygon price"
              />
            </div>

            {formData.entry_override && (
              <div className="space-y-2">
                <Label htmlFor="entry_override_reason">Override Reason</Label>
                <Input
                  id="entry_override_reason"
                  value={formData.entry_override_reason}
                  onChange={(e) => setFormData({ ...formData, entry_override_reason: e.target.value })}
                  placeholder="Reason for manual entry"
                />
              </div>
            )}
          </div>
        </div>

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
            Auto-publish to Telegram
          </label>
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
