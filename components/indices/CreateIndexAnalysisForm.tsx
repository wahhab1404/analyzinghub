'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface Contract {
  contract_id: string
  ticker: string
  contract_type: 'call' | 'put'
  strike_price: number
  expiration_date: string
}

export function CreateIndexAnalysisForm({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [formData, setFormData] = useState({
    underlying_symbol: '',
    contract_id: '',
    analysis_type: 'day_trade' as 'day_trade' | 'swing' | 'long_term',
    thesis: '',
    entry_min: '',
    entry_max: '',
    target_1: '',
    target_2: '',
    stop_loss: '',
    risk_per_contract: '',
  })

  const fetchContracts = async (symbol: string) => {
    if (!symbol || symbol.length < 2) return

    setLoadingContracts(true)
    try {
      const response = await fetch(`/api/indices/contracts?symbol=${symbol}`)
      if (response.ok) {
        const data = await response.json()
        setContracts(data.contracts || [])
      }
    } catch (error) {
      console.error('Error fetching contracts:', error)
    } finally {
      setLoadingContracts(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.underlying_symbol) {
        fetchContracts(formData.underlying_symbol)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [formData.underlying_symbol])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/indices/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          underlying_symbol: formData.underlying_symbol,
          contract_id: formData.contract_id,
          analysis_type: formData.analysis_type,
          thesis: formData.thesis,
          entry_range_min: parseFloat(formData.entry_min),
          entry_range_max: parseFloat(formData.entry_max),
          target_1: parseFloat(formData.target_1),
          target_2: formData.target_2 ? parseFloat(formData.target_2) : null,
          stop_loss: parseFloat(formData.stop_loss),
          risk_per_contract: parseFloat(formData.risk_per_contract),
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
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="symbol">Underlying Symbol</Label>
          <Input
            id="symbol"
            placeholder="SPX, NDX, etc."
            value={formData.underlying_symbol}
            onChange={(e) => setFormData({ ...formData, underlying_symbol: e.target.value.toUpperCase() })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contract">Options Contract</Label>
          <Select
            value={formData.contract_id}
            onValueChange={(value) => setFormData({ ...formData, contract_id: value })}
            disabled={loadingContracts || contracts.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingContracts ? "Loading contracts..." : "Select contract"} />
            </SelectTrigger>
            <SelectContent>
              {contracts.map((contract) => (
                <SelectItem key={contract.contract_id} value={contract.contract_id}>
                  {contract.ticker} - ${contract.strike_price} {contract.contract_type.toUpperCase()} - {contract.expiration_date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="target1">Target 1 ($)</Label>
          <Input
            id="target1"
            type="number"
            step="0.01"
            placeholder="3.00"
            value={formData.target_1}
            onChange={(e) => setFormData({ ...formData, target_1: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target2">Target 2 ($) - Optional</Label>
          <Input
            id="target2"
            type="number"
            step="0.01"
            placeholder="4.00"
            value={formData.target_2}
            onChange={(e) => setFormData({ ...formData, target_2: e.target.value })}
          />
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
