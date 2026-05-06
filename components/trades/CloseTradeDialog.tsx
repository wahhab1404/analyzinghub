'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { Trade } from '@/lib/types/trades'

interface CloseTradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trade: Trade
  onClosed?: () => void
}

const CLOSE_REASONS = [
  { value: 'completed',            labelAr: 'اكتمال الأهداف',   labelEn: 'Target Completed' },
  { value: 'manual',               labelAr: 'إغلاق يدوي',       labelEn: 'Manual Close' },
  { value: 'stopped',              labelAr: 'وقف الخسارة',       labelEn: 'Stop Loss' },
  { value: 'time_exit',            labelAr: 'خروج زمني',         labelEn: 'Time Exit' },
  { value: 'contract_expiration',  labelAr: 'انتهاء العقد',      labelEn: 'Contract Expiration' },
  { value: 'invalidated_setup',    labelAr: 'إبطال الإعداد',     labelEn: 'Invalidated Setup' },
]

export function CloseTradeDialog({ open, onOpenChange, trade, onClosed }: CloseTradeDialogProps) {
  const [closePrice, setClosePrice] = useState('')
  const [reason, setReason]         = useState('')
  const [sendTelegram, setSendTelegram] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function handleClose() {
    if (!reason) { toast.error('اختر سبب الإغلاق / Select close reason'); return }

    setSubmitting(true)
    try {
      const isStopped    = reason === 'stopped'
      const isExpired    = reason === 'contract_expiration'
      const newStatus    = isExpired ? 'expired' : isStopped ? 'stopped' : 'completed'
      const finalPrice   = closePrice ? Number(closePrice) : undefined

      // Update trade status
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status:        newStatus,
          current_price: finalPrice,
          close_reason:  reason,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to close trade')
        return
      }

      // Send Telegram summary
      if (sendTelegram) {
        await fetch(`/api/trades/${trade.id}/send-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type:    'summary',
            current_price: finalPrice,
          }),
        })
      }

      toast.success('تم إغلاق الصفقة / Trade closed')
      onClosed?.()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            إغلاق الصفقة / Close Trade
            <span className="text-gray-400 text-sm font-mono ml-2">{trade.symbol}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-gray-300 text-xs mb-1 block">سعر الإغلاق / Close Price (اختياري)</Label>
            <Input
              type="number" step="0.01"
              value={closePrice}
              onChange={e => setClosePrice(e.target.value)}
              placeholder={trade.current_price?.toString() ?? ''}
              className="bg-gray-800 border-gray-600 text-white font-mono"
            />
          </div>

          <div>
            <Label className="text-gray-300 text-xs mb-1 block">سبب الإغلاق / Reason *</Label>
            <Select onValueChange={setReason}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="اختر / Select reason" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {CLOSE_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-gray-200">
                    {r.labelAr} / {r.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Switch
              checked={sendTelegram}
              onCheckedChange={setSendTelegram}
              className="data-[state=checked]:bg-blue-600"
            />
            <Label className="text-gray-300 text-xs cursor-pointer">
              📨 إرسال ملخص عبر تيليجرام / Send Telegram Summary
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-600 text-gray-300">
            إلغاء / Cancel
          </Button>
          <Button
            onClick={handleClose}
            disabled={submitting || !reason}
            className="bg-red-700 hover:bg-red-600 text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            إغلاق الصفقة / Close Trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
