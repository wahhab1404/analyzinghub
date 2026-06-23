'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader as Loader2, X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/language-context'

const TIMEFRAMES = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' },
]

const ANALYSIS_SCHOOLS = [
  'Classic Technical Analysis',
  'Elliott Wave',
  'ICT (Inner Circle Trader)',
  'Harmonics',
  'Supply & Demand',
  'Price Action',
  'Smart Money Concepts',
  'Market Structure',
  'Volume Profile',
  'Order Flow',
]

interface TelegramChannel {
  id: string
  channel_name: string
  channel_id: string
  source: 'analyst' | 'plan'
  plan_name?: string
}

export function CreateIndexAnalysisForm({ onComplete }: { onComplete: () => void }) {
  const { language } = useLanguage()
  const isAr = language === 'ar'
  const [loading, setLoading] = useState(false)
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [formData, setFormData] = useState({
    index_symbol: 'SPX' as 'SPX' | 'NDX' | 'DJI',
    title: '',
    body: '',
    chart_image: null as File | null,
    timeframe: '1h',
    schools_used: [] as string[],
    invalidation_price: '',
    targets: [] as { level: string; label: string }[],
    activation_enabled: false,
    activation_type: 'PASSING_PRICE' as 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE',
    activation_price: '',
    activation_timeframe: 'INTRABAR' as 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE',
    telegram_channel_id: 'none',
    auto_publish_telegram: false,
    visibility: 'public' as 'public' | 'subscribers' | 'admin_only',
    status: 'published' as 'draft' | 'published',
  })

  useEffect(() => {
    fetchTelegramChannels()
  }, [])

  const fetchTelegramChannels = async () => {
    try {
      const allChannels: TelegramChannel[] = []

      // Fetch channels via API to avoid CORS issues
      const response = await fetch('/api/telegram/channels/list')
      if (response.ok) {
        const data = await response.json()
        if (data.ok && data.channels) {
          // Convert API format to component format
          allChannels.push(...data.channels.map((ch: any) => ({
            id: ch.id,
            channel_name: ch.linkedPlanName ? `${ch.channelName} (${ch.linkedPlanName})` : ch.channelName,
            channel_id: ch.channelId,
            source: ch.linkedPlanId ? 'plan' as const : 'analyst' as const,
            plan_name: ch.linkedPlanName
          })))
        }
      }

      setChannels(allChannels)
    } catch (error) {
      console.error('Error fetching channels:', error)
    } finally {
      setLoadingChannels(false)
    }
  }

  const toggleSchool = (school: string) => {
    const current = formData.schools_used
    if (current.includes(school)) {
      setFormData({
        ...formData,
        schools_used: current.filter(s => s !== school)
      })
    } else {
      setFormData({
        ...formData,
        schools_used: [...current, school]
      })
    }
  }

  const addTarget = () => {
    setFormData({
      ...formData,
      targets: [...formData.targets, { level: '', label: `Target ${formData.targets.length + 1}` }]
    })
  }

  const updateTarget = (index: number, field: 'level' | 'label', value: string) => {
    const newTargets = [...formData.targets]
    newTargets[index] = { ...newTargets[index], [field]: value }
    setFormData({ ...formData, targets: newTargets })
  }

  const removeTarget = (index: number) => {
    setFormData({
      ...formData,
      targets: formData.targets.filter((_, i) => i !== index)
    })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(isAr ? 'يجب أن يكون حجم الصورة أقل من 5 ميجابايت' : 'Image must be less than 5MB')
        return
      }
      if (!file.type.startsWith('image/')) {
        toast.error(isAr ? 'يجب أن يكون الملف صورة' : 'File must be an image')
        return
      }
      setFormData({ ...formData, chart_image: file })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let chartImageUrl = null

      if (formData.chart_image) {
        const formDataUpload = new FormData()
        formDataUpload.append('file', formData.chart_image)

        const uploadResponse = await fetch('/api/upload-chart', {
          method: 'POST',
          body: formDataUpload,
        })

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json()
          chartImageUrl = uploadData.url
        } else {
          toast.error(isAr ? 'فشل رفع صورة الشارت' : 'Failed to upload chart image')
          setLoading(false)
          return
        }
      }

      const response = await fetch('/api/indices/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index_symbol: formData.index_symbol,
          title: formData.title,
          body: formData.body,
          chart_image_url: chartImageUrl,
          timeframe: formData.timeframe,
          schools_used: formData.schools_used,
          invalidation_price: formData.invalidation_price ? parseFloat(formData.invalidation_price) : null,
          targets: formData.targets
            .filter(t => t.level)
            .map(t => ({
              level: parseFloat(t.level),
              label: t.label,
              reached: false,
              reached_at: null
            })),
          activation_enabled: formData.activation_enabled,
          activation_type: formData.activation_enabled ? formData.activation_type : null,
          activation_price: formData.activation_enabled && formData.activation_price ? parseFloat(formData.activation_price) : null,
          activation_timeframe: formData.activation_enabled ? formData.activation_timeframe : null,
          activation_status: formData.activation_enabled ? 'published_inactive' : 'active',
          telegram_channel_id: formData.telegram_channel_id && formData.telegram_channel_id !== 'none' ? formData.telegram_channel_id : null,
          auto_publish_telegram: formData.auto_publish_telegram,
          visibility: formData.visibility,
          status: formData.status,
        }),
      })

      if (response.ok) {
        const { analysis } = await response.json()
        toast.success(isAr ? 'تم إنشاء التحليل بنجاح!' : 'Analysis created successfully!')
        if (formData.auto_publish_telegram && formData.telegram_channel_id && formData.telegram_channel_id !== 'none') {
          toast.success(isAr ? 'تم النشر على تيليجرام!' : 'Published to Telegram!')
        }
        onComplete()
      } else {
        const error = await response.json()
        toast.error(error.error || (isAr ? 'فشل إنشاء التحليل' : 'Failed to create analysis'))
      }
    } catch (error) {
      console.error('Error creating analysis:', error)
      toast.error(isAr ? 'فشل إنشاء التحليل' : 'Failed to create analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">{isAr ? 'المعلومات الأساسية' : 'Basic Information'}</h3>

        <div className="space-y-2">
          <Label htmlFor="index_symbol">{isAr ? 'رمز المؤشر' : 'Index Symbol'} *</Label>
          <Select
            value={formData.index_symbol}
            onValueChange={(value: any) => setFormData({ ...formData, index_symbol: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SPX">SPX (S&P 500)</SelectItem>
              <SelectItem value="NDX">NDX (Nasdaq 100)</SelectItem>
              <SelectItem value="DJI">DJI (Dow Jones)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">{isAr ? 'عنوان التحليل' : 'Analysis Title'} *</Label>
          <Input
            id="title"
            placeholder={isAr ? 'مثال: إعداد صعودي على SPX - الدعم الرئيسي صامد' : 'e.g., SPX Bullish Setup - Key Support Holding'}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">{isAr ? 'نص التحليل' : 'Analysis Description'} *</Label>
          <Textarea
            id="body"
            dir={isAr ? 'rtl' : 'ltr'}
            placeholder={isAr ? 'اشرح تحليلك بالتفصيل...' : 'Explain your analysis in detail...'}
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            rows={5}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="chart">{isAr ? 'صورة الشارت' : 'Chart Image'} *</Label>
          <Input
            id="chart"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            required
          />
          {formData.chart_image && (
            <p className="text-sm text-muted-foreground">
              {isAr ? 'المحدد:' : 'Selected:'} {formData.chart_image.name}
            </p>
          )}
        </div>
      </div>

      {/* Technical Details */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">{isAr ? 'التفاصيل الفنية' : 'Technical Details'}</h3>

        <div className="space-y-2">
          <Label htmlFor="timeframe">{isAr ? 'الإطار الزمني' : 'Timeframe'} *</Label>
          <Select
            value={formData.timeframe}
            onValueChange={(value) => setFormData({ ...formData, timeframe: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map(tf => (
                <SelectItem key={tf.value} value={tf.value}>
                  {tf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{isAr ? 'الأدوات / المدارس المستخدمة' : 'Analysis Methods / Schools Used'}</Label>
          <div className="grid grid-cols-2 gap-2 border rounded-lg p-4 max-h-60 overflow-y-auto">
            {ANALYSIS_SCHOOLS.map(school => (
              <div key={school} className="flex items-center space-x-2">
                <Checkbox
                  id={school}
                  checked={formData.schools_used.includes(school)}
                  onCheckedChange={() => toggleSchool(school)}
                />
                <label
                  htmlFor={school}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {school}
                </label>
              </div>
            ))}
          </div>
          {formData.schools_used.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.schools_used.map(school => (
                <span
                  key={school}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs"
                >
                  {school}
                  <button
                    type="button"
                    onClick={() => toggleSchool(school)}
                    className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="invalidation_price">{isAr ? 'سعر الإبطال (اختياري)' : 'Invalidation Price (Optional)'}</Label>
          <Input
            id="invalidation_price"
            type="number"
            step="0.01"
            placeholder={isAr ? 'مثال: 5800.00' : 'e.g., 5800.00'}
            value={formData.invalidation_price}
            onChange={(e) => setFormData({ ...formData, invalidation_price: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {isAr ? 'مستوى السعر الذي يُبطل هذا التحليل' : 'Price level that would invalidate this analysis'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{isAr ? 'الأهداف السعرية (اختياري)' : 'Price Targets (Optional)'}</Label>
            <Button type="button" variant="outline" size="sm" onClick={addTarget}>
              <Plus className="h-3 w-3 mr-1" />
              {isAr ? 'إضافة هدف' : 'Add Target'}
            </Button>
          </div>
          {formData.targets.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3">
              {formData.targets.map((target, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={isAr ? 'التسمية' : 'Label'}
                    value={target.label}
                    onChange={(e) => updateTarget(index, 'label', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={isAr ? 'السعر' : 'Price'}
                    value={target.level}
                    onChange={(e) => updateTarget(index, 'level', e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTarget(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {isAr ? 'حدد أهدافاً سعرية لتصلك إشعارات عند الوصول إليها' : "Set price targets to get notifications when they're reached"}
          </p>
        </div>
      </div>

      {/* Activation Condition */}
      <div className="space-y-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{isAr ? 'شرط التفعيل' : 'Activation Condition'}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isAr ? 'اشترط تحقق شرط سعري قبل أن يصبح التحليل فعّالاً' : 'Require a price condition to be met before the analysis becomes active'}
            </p>
          </div>
          <Checkbox
            id="activation_enabled"
            checked={formData.activation_enabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, activation_enabled: checked as boolean })
            }
          />
        </div>

        {formData.activation_enabled && (
          <div className="space-y-4 pl-4 border-l-2 border-primary/20">
            <div className="space-y-2">
              <Label htmlFor="activation_type">{isAr ? 'نوع الشرط' : 'Condition Type'} *</Label>
              <Select
                value={formData.activation_type}
                onValueChange={(value: any) => setFormData({ ...formData, activation_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PASSING_PRICE">{isAr ? 'تجاوز السعر (اختراق)' : 'Passing Price (crosses)'}</SelectItem>
                  <SelectItem value="ABOVE_PRICE">{isAr ? 'فوق السعر' : 'Above Price'}</SelectItem>
                  <SelectItem value="UNDER_PRICE">{isAr ? 'تحت السعر' : 'Under Price'}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.activation_type === 'PASSING_PRICE' && (isAr ? 'يُفعّل عندما يخترق السعر المستوى المحدد' : 'Activates when price crosses the specified level')}
                {formData.activation_type === 'ABOVE_PRICE' && (isAr ? 'يُفعّل عندما يكون السعر فوق المستوى المحدد' : 'Activates when price is above the specified level')}
                {formData.activation_type === 'UNDER_PRICE' && (isAr ? 'يُفعّل عندما يكون السعر تحت المستوى المحدد' : 'Activates when price is under the specified level')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activation_price">{isAr ? 'سعر التفعيل' : 'Activation Price'} *</Label>
              <Input
                id="activation_price"
                type="number"
                step="0.01"
                placeholder={isAr ? 'مثال: 5950.00' : 'e.g., 5950.00'}
                value={formData.activation_price}
                onChange={(e) => setFormData({ ...formData, activation_price: e.target.value })}
                required={formData.activation_enabled}
              />
              <p className="text-xs text-muted-foreground">
                {isAr ? 'سينتظر التحليل حتى يتحقق هذا الشرط قبل أن يصبح فعّالاً' : 'Analysis will wait until this condition is met before becoming active'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activation_timeframe">{isAr ? 'إطار الفحص الزمني' : 'Timeframe Check'}</Label>
              <Select
                value={formData.activation_timeframe}
                onValueChange={(value: any) => setFormData({ ...formData, activation_timeframe: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTRABAR">{isAr ? 'داخل الشمعة (فوري)' : 'Intrabar (Real-time)'}</SelectItem>
                  <SelectItem value="1H_CLOSE">{isAr ? 'إغلاق شمعة الساعة' : '1H Candle Close'}</SelectItem>
                  <SelectItem value="4H_CLOSE">{isAr ? 'إغلاق شمعة 4 ساعات' : '4H Candle Close'}</SelectItem>
                  <SelectItem value="DAILY_CLOSE">{isAr ? 'إغلاق الشمعة اليومية' : 'Daily Candle Close'}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isAr ? 'متى يتم التحقق من تحقق الشرط' : 'When to check if the condition has been met'}
              </p>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {isAr ? (
                  <><strong>ملاحظة:</strong> سيتم نشر التحليل ولكن مع وضع علامة "بانتظار التفعيل". لن يصبح فعّالاً إلا عند تحقق الشرط. سيتم إشعار المشتركين عند حدوث التفعيل.</>
                ) : (
                  <><strong>Note:</strong> The analysis will be published but marked as "Waiting for Activation". It will become active only when the condition is met. Subscribers will be notified when activation occurs.</>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Telegram Publishing */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">{isAr ? 'النشر على تيليجرام' : 'Telegram Publishing'}</h3>

        {loadingChannels ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {isAr ? 'جارٍ تحميل القنوات...' : 'Loading channels...'}
          </div>
        ) : channels.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
            {isAr ? 'لا توجد قنوات تيليجرام مهيأة. اذهب إلى الإعدادات ← تيليجرام لإضافة قناة.' : 'No Telegram channels configured. Go to Settings → Telegram to add a channel.'}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="telegram_channel">{isAr ? 'قناة تيليجرام (اختياري)' : 'Telegram Channel (Optional)'}</Label>
              <Select
                value={formData.telegram_channel_id}
                onValueChange={(value) => setFormData({ ...formData, telegram_channel_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isAr ? 'اختر قناة' : 'Select a channel'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isAr ? 'بدون' : 'None'}</SelectItem>
                  {channels.filter(ch => ch.source === 'analyst').length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {isAr ? 'قنوات المحلل' : 'Analyst Channels'}
                    </div>
                  )}
                  {channels.filter(ch => ch.source === 'analyst').map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.channel_name}
                    </SelectItem>
                  ))}
                  {channels.filter(ch => ch.source === 'plan').length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                      {isAr ? 'قنوات الباقات' : 'Plan Channels'}
                    </div>
                  )}
                  {channels.filter(ch => ch.source === 'plan').map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.channel_name} ({channel.plan_name})
                    </SelectItem>
                  ))}
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
                  {isAr ? 'النشر تلقائياً على تيليجرام عند الإنشاء' : 'Auto-publish to Telegram when created'}
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {/* Publishing Options */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">{isAr ? 'خيارات النشر' : 'Publishing Options'}</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="visibility">{isAr ? 'الظهور' : 'Visibility'} *</Label>
            <Select
              value={formData.visibility}
              onValueChange={(value: any) => setFormData({ ...formData, visibility: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{isAr ? 'عام (للجميع)' : 'Public (Everyone)'}</SelectItem>
                <SelectItem value="subscribers">{isAr ? 'المشتركون فقط' : 'Subscribers Only'}</SelectItem>
                <SelectItem value="admin_only">{isAr ? 'المشرف فقط' : 'Admin Only'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">{isAr ? 'الحالة' : 'Status'} *</Label>
            <Select
              value={formData.status}
              onValueChange={(value: any) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{isAr ? 'مسودة' : 'Draft'}</SelectItem>
                <SelectItem value="published">{isAr ? 'منشور' : 'Published'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-2 justify-end border-t pt-4">
        <Button type="button" variant="outline" onClick={onComplete}>
          {isAr ? 'إلغاء' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isAr ? 'إنشاء التحليل' : 'Create Analysis'}
        </Button>
      </div>
    </form>
  )
}
