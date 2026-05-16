'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// ─── Zod schema ──────────────────────────────────────────────────────────────

const targetSchema = z.object({
  label: z.string().min(1),
  price: z.coerce.number().positive('Must be positive'),
})

const baseSchema = z.object({
  symbol:            z.string().min(1).max(20),
  trade_type:        z.enum(['stock', 'option']),
  direction:         z.enum(['long', 'short', 'call', 'put']),
  entry_price:       z.coerce.number().positive().optional().or(z.literal('')),
  stop_loss:         z.coerce.number().positive().optional().or(z.literal('')),
  targets:           z.array(targetSchema),
  timeframe:         z.string().optional(),
  expected_duration: z.string().optional(),
  risk_level:        z.enum(['low', 'medium', 'high', 'very_high', '']).optional(),
  notes:             z.string().max(2000).optional(),
  analysis_id:       z.string().optional(),
  visibility:        z.enum(['public', 'followers', 'subscribers', 'plan_only', 'private']),
  plan_id:           z.string().optional(),
  telegram_channel_id: z.string().optional(),
  is_public:         z.boolean(),
  is_testing:        z.boolean(),
  publish_now:       z.boolean(),
  // Option-specific
  underlying_symbol: z.string().optional(),
  option_type:       z.enum(['call', 'put', '']).optional(),
  strike_price:      z.coerce.number().positive().optional().or(z.literal('')),
  expiration_date:   z.string().optional(),
  contract_symbol:   z.string().optional(),
  entry_premium:     z.coerce.number().positive().optional().or(z.literal('')),
  stop_premium:      z.coerce.number().positive().optional().or(z.literal('')),
  stop_rule:         z.string().optional(),
  quantity:          z.coerce.number().int().positive().optional().or(z.literal('')),
})

type FormValues = z.infer<typeof baseSchema>

// ─── Props ───────────────────────────────────────────────────────────────────

interface CreateTradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAnalysisId?: string | null
  defaultSymbol?: string
  onCreated?: (trade: any) => void
}

interface TelegramChannel {
  id: string
  channel_name: string
}

interface Plan {
  id: string
  name: string
}

interface Analysis {
  id: string
  title: string | null
  symbol: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CreateTradeDialog({
  open, onOpenChange, defaultAnalysisId, defaultSymbol, onCreated,
}: CreateTradeDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const { register, handleSubmit, watch, setValue, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      symbol:            defaultSymbol ?? '',
      trade_type:        'stock',
      direction:         'long',
      targets:           [{ label: 'TP1', price: 0 }],
      visibility:        'public',
      is_public:         true,
      is_testing:        false,
      publish_now:       false,
    },
  })

  const { fields: targetFields, append: appendTarget, remove: removeTarget } = useFieldArray({ control, name: 'targets' })

  const tradeType  = watch('trade_type')
  const isOption   = tradeType === 'option'
  const direction  = watch('direction')
  const publishNow = watch('publish_now')
  const isTesting  = watch('is_testing')

  // Load supporting data
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    setLoadingData(true)

    Promise.all([
      supabase.from('telegram_channels')
        .select('id, channel_name')
        .order('channel_name'),
      supabase.from('analyzer_plans')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
      supabase.from('analyses')
        .select('id, title, symbol:symbols(symbol)')
        .order('created_at', { ascending: false })
        .limit(50),
    ]).then(([chRes, planRes, analysisRes]) => {
      setChannels(chRes.data ?? [])
      setPlans(planRes.data ?? [])
      setAnalyses((analysisRes.data ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        symbol: a.symbol?.symbol ?? '',
      })))
    }).finally(() => setLoadingData(false))
  }, [open])

  // Pre-fill analysis
  useEffect(() => {
    if (defaultAnalysisId) setValue('analysis_id', defaultAnalysisId)
  }, [defaultAnalysisId, setValue])

  // Auto-set direction based on type
  useEffect(() => {
    if (isOption) {
      if (direction !== 'call' && direction !== 'put') setValue('direction', 'call')
    } else {
      if (direction !== 'long' && direction !== 'short') setValue('direction', 'long')
    }
  }, [isOption, direction, setValue])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const payload: any = {
        trade_type:        values.trade_type,
        symbol:            values.symbol.toUpperCase().trim(),
        direction:         values.direction,
        targets:           values.targets.map((t, i) => ({ label: t.label || `TP${i + 1}`, price: Number(t.price) })),
        timeframe:         values.timeframe || undefined,
        expected_duration: values.expected_duration || undefined,
        risk_level:        values.risk_level || undefined,
        notes:             values.notes || undefined,
        analysis_id:       values.analysis_id || null,
        visibility:        values.visibility,
        plan_id:           values.plan_id || null,
        telegram_channel_id: values.telegram_channel_id || null,
        is_public:         values.is_public,
        is_testing:        values.is_testing,
        publish_now:       values.publish_now,
      }

      if (values.entry_price !== '' && values.entry_price != null) {
        payload.entry_price = Number(values.entry_price)
      }
      if (values.stop_loss !== '' && values.stop_loss != null) {
        payload.stop_loss = Number(values.stop_loss)
      }

      if (isOption) {
        payload.underlying_symbol = (values.underlying_symbol ?? values.symbol).toUpperCase().trim()
        payload.option_type       = values.option_type || values.direction
        payload.strike_price      = Number(values.strike_price)
        payload.expiration_date   = values.expiration_date
        payload.contract_symbol   = values.contract_symbol || undefined
        payload.entry_premium     = Number(values.entry_premium)
        if (values.stop_premium !== '' && values.stop_premium != null) {
          payload.stop_premium = Number(values.stop_premium)
        }
        payload.stop_rule   = values.stop_rule || undefined
        payload.quantity    = Number(values.quantity) || 1
      }

      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to create trade')
        return
      }

      toast.success('تم إنشاء الصفقة / Trade created')
      onCreated?.(json.trade)
      onOpenChange(false)
      reset()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function addTarget() {
    const nextNum = targetFields.length + 1
    appendTarget({ label: `TP${nextNum}`, price: 0 })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-right">
            <span className="text-gray-100">إنشاء صفقة جديدة</span>
            <span className="text-gray-400 text-sm font-normal ml-2">/ Create New Trade</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-2">

          {/* Trade Type Tabs */}
          <div>
            <Label className="text-gray-300 text-sm mb-2 block">نوع الصفقة / Trade Type</Label>
            <Tabs value={tradeType} onValueChange={v => setValue('trade_type', v as 'stock' | 'option')}>
              <TabsList className="bg-gray-800 w-full">
                <TabsTrigger value="stock" className="flex-1 data-[state=active]:bg-blue-700 data-[state=active]:text-white">
                  📈 سهم / Stock
                </TabsTrigger>
                <TabsTrigger value="option" className="flex-1 data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                  📋 خيارات / Options
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Symbol + Direction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">الرمز / Symbol *</Label>
              <Input
                {...register('symbol')}
                placeholder="AAPL, TSLA, SPX..."
                className="bg-gray-800 border-gray-600 text-white uppercase font-mono"
                style={{ textTransform: 'uppercase' }}
              />
              {errors.symbol && <p className="text-red-400 text-xs mt-1">{errors.symbol.message}</p>}
            </div>

            <div>
              <Label className="text-gray-300 text-xs mb-1 block">الاتجاه / Direction *</Label>
              <Select value={direction} onValueChange={v => setValue('direction', v as any)}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {isOption ? (
                    <>
                      <SelectItem value="call" className="text-emerald-400">📈 Call</SelectItem>
                      <SelectItem value="put" className="text-red-400">📉 Put</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="long" className="text-emerald-400">📈 شراء / Long</SelectItem>
                      <SelectItem value="short" className="text-red-400">📉 بيع / Short</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Option-specific fields */}
          {isOption && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-3 border border-purple-800/30">
              <div className="text-xs text-purple-300 font-medium">تفاصيل العقد / Contract Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">الرمز الأساسي / Underlying *</Label>
                  <Input
                    {...register('underlying_symbol')}
                    placeholder="AAPL, SPX..."
                    className="bg-gray-900 border-gray-600 text-white uppercase font-mono"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">رمز العقد / Contract Symbol</Label>
                  <Input
                    {...register('contract_symbol')}
                    placeholder="AAPL240119C00195000"
                    className="bg-gray-900 border-gray-600 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">سعر الإضراب / Strike *</Label>
                  <Input
                    {...register('strike_price')}
                    type="number" step="0.01" placeholder="200.00"
                    className="bg-gray-900 border-gray-600 text-white font-mono"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">تاريخ الانتهاء / Expiry *</Label>
                  <Input
                    {...register('expiration_date')}
                    type="date"
                    className="bg-gray-900 border-gray-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">سعر دخول القسط / Entry Premium *</Label>
                  <Input
                    {...register('entry_premium')}
                    type="number" step="0.01" placeholder="2.50"
                    className="bg-gray-900 border-gray-600 text-white font-mono"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">وقف القسط / Stop Premium</Label>
                  <Input
                    {...register('stop_premium')}
                    type="number" step="0.01" placeholder="1.00"
                    className="bg-gray-900 border-gray-600 text-white font-mono"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">الكمية / Qty</Label>
                  <Input
                    {...register('quantity')}
                    type="number" step="1" placeholder="1"
                    className="bg-gray-900 border-gray-600 text-white font-mono"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">قاعدة الوقف / Stop Rule</Label>
                  <Input
                    {...register('stop_rule')}
                    placeholder="e.g. Close below $180"
                    className="bg-gray-900 border-gray-600 text-white text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Entry / Stop for stock trades */}
          {!isOption && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">سعر الدخول / Entry *</Label>
                <Input
                  {...register('entry_price')}
                  type="number" step="0.01" placeholder="150.00"
                  className="bg-gray-800 border-gray-600 text-white font-mono"
                />
                {errors.entry_price && <p className="text-red-400 text-xs mt-1">{String(errors.entry_price.message)}</p>}
              </div>
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">وقف الخسارة / Stop Loss *</Label>
                <Input
                  {...register('stop_loss')}
                  type="number" step="0.01" placeholder="140.00"
                  className="bg-gray-800 border-gray-600 text-white font-mono"
                />
              </div>
            </div>
          )}

          {/* Targets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-gray-300 text-xs">الأهداف / Targets *</Label>
              <Button
                type="button" size="sm" variant="outline"
                onClick={addTarget}
                className="h-6 text-[11px] border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <Plus className="w-3 h-3 mr-1" /> هدف / Add
              </Button>
            </div>
            <div className="space-y-2">
              {targetFields.map((field, i) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    {...register(`targets.${i}.label`)}
                    placeholder="TP1"
                    className="bg-gray-800 border-gray-600 text-white w-20 text-xs"
                  />
                  <Input
                    {...register(`targets.${i}.price`)}
                    type="number" step="0.01" placeholder="160.00"
                    className="bg-gray-800 border-gray-600 text-white font-mono flex-1"
                  />
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => removeTarget(i)}
                    className="text-red-500 hover:text-red-400 hover:bg-red-900/20 w-7 h-7"
                    disabled={targetFields.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">الإطار الزمني / Timeframe</Label>
              <Select onValueChange={v => setValue('timeframe', v)}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="اختر / Select" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {['1m', '5m', '15m', '30m', '1h', '4h', 'Daily', 'Weekly', 'Monthly'].map(tf => (
                    <SelectItem key={tf} value={tf} className="text-gray-200">{tf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">مستوى المخاطرة / Risk</Label>
              <Select onValueChange={v => setValue('risk_level', v as any)}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="اختر / Select" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="low"       className="text-emerald-400">🟢 منخفض / Low</SelectItem>
                  <SelectItem value="medium"    className="text-yellow-400">🟡 متوسط / Medium</SelectItem>
                  <SelectItem value="high"      className="text-orange-400">🟠 عالي / High</SelectItem>
                  <SelectItem value="very_high" className="text-red-400">🔴 عالي جداً / Very High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">المدة المتوقعة / Duration</Label>
              <Input
                {...register('expected_duration')}
                placeholder="e.g. 1-2 أسابيع / weeks"
                className="bg-gray-800 border-gray-600 text-white text-xs"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-xs mb-1 block">ربط بتحليل / Link Analysis</Label>
              <Select onValueChange={v => setValue('analysis_id', v === 'none' ? '' : v)}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="اختياري / Optional" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="none" className="text-gray-400">بدون ربط / Standalone</SelectItem>
                  {analyses.map(a => (
                    <SelectItem key={a.id} value={a.id} className="text-gray-200">
                      {a.symbol} — {a.title ?? 'Untitled'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300 text-xs mb-1 block">ملاحظات / Notes</Label>
            <Textarea
              {...register('notes')}
              placeholder="ملاحظات إضافية..."
              rows={3}
              className="bg-gray-800 border-gray-600 text-white text-sm resize-none"
            />
          </div>

          {/* Visibility + Plan + Channel */}
          <div className="bg-gray-800/40 rounded-lg p-3 space-y-3 border border-gray-700/50">
            <div className="text-xs text-gray-400 font-medium">إعدادات النشر / Publishing Settings</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-xs mb-1 block">الظهور / Visibility</Label>
                <Select defaultValue="public" onValueChange={v => setValue('visibility', v as any)}>
                  <SelectTrigger className="bg-gray-900 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="public"      className="text-gray-200">🌍 عام / Public</SelectItem>
                    <SelectItem value="followers"   className="text-gray-200">👥 المتابعين / Followers</SelectItem>
                    <SelectItem value="subscribers" className="text-gray-200">⭐ المشتركين / Subscribers</SelectItem>
                    <SelectItem value="plan_only"   className="text-gray-200">🔒 خطة محددة / Plan Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {plans.length > 0 && (
                <div>
                  <Label className="text-gray-300 text-xs mb-1 block">الخطة / Plan</Label>
                  <Select onValueChange={v => setValue('plan_id', v === 'none' ? '' : v)}>
                    <SelectTrigger className="bg-gray-900 border-gray-600 text-white">
                      <SelectValue placeholder="اختياري / None" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="none" className="text-gray-400">بدون / None</SelectItem>
                      {plans.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-gray-200">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {channels.length > 0 && (
                <div className="col-span-2">
                  <Label className="text-gray-300 text-xs mb-1 block">قناة تيليجرام / Telegram Channel</Label>
                  <Select onValueChange={v => setValue('telegram_channel_id', v === 'none' ? '' : v)}>
                    <SelectTrigger className="bg-gray-900 border-gray-600 text-white">
                      <SelectValue placeholder="اختياري / None" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="none" className="text-gray-400">بدون إرسال / No Telegram</SelectItem>
                      {channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id} className="text-gray-200">{ch.channel_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-4 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={watch('is_testing')}
                  onCheckedChange={v => setValue('is_testing', v)}
                  className="data-[state=checked]:bg-amber-600"
                />
                <Label className="text-gray-300 text-xs cursor-pointer">
                  🧪 اختبارية / Testing
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={watch('publish_now')}
                  onCheckedChange={v => setValue('publish_now', v)}
                  className="data-[state=checked]:bg-blue-600"
                />
                <Label className="text-gray-300 text-xs cursor-pointer">
                  🚀 نشر فوري / Publish Now
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button" variant="outline"
              onClick={() => { onOpenChange(false); reset() }}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              إلغاء / Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className={cn(
                'min-w-[140px]',
                publishNow ? 'bg-blue-700 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              )}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> جاري الإنشاء...</>
              ) : publishNow ? (
                '🚀 نشر / Publish'
              ) : (
                '💾 حفظ مسودة / Save Draft'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
