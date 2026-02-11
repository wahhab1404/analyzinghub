'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface CreateStockTradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
  symbol: string
  onTradeCreated: () => void
}

export function CreateCompanyTradeDialog({
  open,
  onOpenChange,
  analysisId,
  symbol,
  onTradeCreated
}: CreateStockTradeDialogProps) {
  const [loading, setLoading] = useState(false)
  const [showAveragePrompt, setShowAveragePrompt] = useState(false)
  const [existingTrade, setExistingTrade] = useState<any>(null)

  const [formData, setFormData] = useState({
    direction: 'CALL',
    strike: '',
    expiry_date: '',
    entry_price: '',
    contracts_qty: '1',
    targets: '',
    stoploss: '',
    notes: ''
  })

  async function checkForExistingTrade() {
    if (!formData.strike || !formData.expiry_date) return null

    try {
      const response = await fetch(
        `/api/companies/trades/check-existing?` +
        `symbol=${symbol}&strike=${formData.strike}&expiry=${formData.expiry_date}&direction=${formData.direction}`
      )

      if (response.ok) {
        const data = await response.json()
        return data.existing_trade || null
      }
    } catch (error) {
      console.error('Error checking existing trade:', error)
    }

    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.strike || !formData.expiry_date || !formData.entry_price) {
      toast.error('Please fill all required fields')
      return
    }

    const existing = await checkForExistingTrade()

    if (existing) {
      setExistingTrade(existing)
      setShowAveragePrompt(true)
      return
    }

    await createTrade(false)
  }

  async function createTrade(isAverageEntry: boolean) {
    setLoading(true)

    try {
      const targets = formData.targets
        ? formData.targets.split(',').map(t => parseFloat(t.trim())).filter(t => !isNaN(t))
        : []

      const payload = {
        scope: 'company',
        analysis_id: analysisId,
        symbol,
        direction: formData.direction,
        strike: parseFloat(formData.strike),
        expiry_date: formData.expiry_date,
        entry_price: parseFloat(formData.entry_price),
        contracts_qty: parseInt(formData.contracts_qty),
        targets: targets.map(price => ({ target_price: price })),
        stoploss: formData.stoploss ? { price: parseFloat(formData.stoploss) } : null,
        notes: formData.notes,
        is_average_entry: isAverageEntry,
        existing_trade_id: isAverageEntry ? existingTrade?.id : null
      }

      const response = await fetch('/api/companies/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('Failed to create trade')
      }

      const result = await response.json()

      if (isAverageEntry) {
        toast.success('Entry averaged successfully')
      } else {
        toast.success('Trade created successfully')
      }

      onTradeCreated()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating trade:', error)
      toast.error('Failed to create trade')
    } finally {
      setLoading(false)
      setShowAveragePrompt(false)
      setExistingTrade(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Contract Trade</DialogTitle>
            <DialogDescription>
              Create a new options trade for {symbol}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="direction">Direction *</Label>
                <Select value={formData.direction} onValueChange={(val) => setFormData({...formData, direction: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CALL">Call</SelectItem>
                    <SelectItem value="PUT">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="strike">Strike Price *</Label>
                <Input
                  id="strike"
                  type="number"
                  step="0.01"
                  value={formData.strike}
                  onChange={(e) => setFormData({...formData, strike: e.target.value})}
                  placeholder="150.00"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expiry">Expiry Date *</Label>
                <Input
                  id="expiry"
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({...formData, expiry_date: e.target.value})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="qty">Contracts Quantity *</Label>
                <Input
                  id="qty"
                  type="number"
                  min="1"
                  value={formData.contracts_qty}
                  onChange={(e) => setFormData({...formData, contracts_qty: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="entry_price">Entry Price *</Label>
                <Input
                  id="entry_price"
                  type="number"
                  step="0.01"
                  value={formData.entry_price}
                  onChange={(e) => setFormData({...formData, entry_price: e.target.value})}
                  placeholder="5.00"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Contract premium per share
                </p>
              </div>

              <div>
                <Label htmlFor="stoploss">Stop Loss (Optional)</Label>
                <Input
                  id="stoploss"
                  type="number"
                  step="0.01"
                  value={formData.stoploss}
                  onChange={(e) => setFormData({...formData, stoploss: e.target.value})}
                  placeholder="2.50"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="targets">Target Prices (Optional)</Label>
              <Input
                id="targets"
                type="text"
                value={formData.targets}
                onChange={(e) => setFormData({...formData, targets: e.target.value})}
                placeholder="7.00, 10.00, 15.00"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comma-separated target prices
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Trade rationale, technical levels, etc."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Trade'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showAveragePrompt} onOpenChange={setShowAveragePrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existing Active Trade Found</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active {existingTrade?.direction} trade for {symbol} at strike ${existingTrade?.strike} expiring {existingTrade?.expiry_date}.
              <br /><br />
              Would you like to:
              <ul className="list-disc ml-6 mt-2">
                <li><strong>Average Entry:</strong> Adjust your entry price using a weighted average and combine quantities</li>
                <li><strong>New Trade:</strong> Close the existing trade at current max price and open a new separate trade</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowAveragePrompt(false)
              setExistingTrade(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => createTrade(false)}
            >
              New Trade
            </Button>
            <AlertDialogAction onClick={() => createTrade(true)}>
              Average Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
