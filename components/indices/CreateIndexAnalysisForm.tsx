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
      const supabase = createClient()

      const { data: user } = await supabase.auth.getUser()
      if (!user?.user?.id) {
        setLoadingChannels(false)
        return
      }

      const analystChannels: TelegramChannel[] = []
      const planChannels: TelegramChannel[] = []

      const { data: analystData, error: analystError } = await supabase
        .from('telegram_channels')
        .select('id, channel_name, channel_id')
        .eq('user_id', user.user.id)
        .eq('enabled', true)

      if (analystData) {
        analystChannels.push(...analystData.map(ch => ({
          ...ch,
          source: 'analyst' as const
        })))
      }

      const { data: planData, error: planError } = await supabase
        .from('analyzer_plans')
        .select('id, name, telegram_channel_id, telegram_channels(id, channel_name, channel_id)')
        .eq('analyst_id', user.user.id)
        .eq('is_active', true)
        .not('telegram_channel_id', 'is', null)

      if (planData) {
        for (const plan of planData) {
          if (plan.telegram_channels) {
            planChannels.push({
              id: plan.telegram_channels.id,
              channel_name: plan.telegram_channels.channel_name,
              channel_id: plan.telegram_channels.channel_id,
              source: 'plan' as const,
              plan_name: plan.name
            })
          }
        }
      }

      setChannels([...analystChannels, ...planChannels])
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
          toast.error('Failed to upload chart image')
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
          telegram_channel_id: formData.telegram_channel_id && formData.telegram_channel_id !== 'none' ? formData.telegram_channel_id : null,
          auto_publish_telegram: formData.auto_publish_telegram,
          visibility: formData.visibility,
          status: formData.status,
        }),
      })

      if (response.ok) {
        const { analysis } = await response.json()
        toast.success('Analysis created successfully!')
        if (formData.auto_publish_telegram && formData.telegram_channel_id && formData.telegram_channel_id !== 'none') {
          toast.success('Published to Telegram!')
        }
        onComplete()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create analysis')
      }
    } catch (error) {
      console.error('Error creating analysis:', error)
      toast.error('Failed to create analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Basic Information</h3>

        <div className="space-y-2">
          <Label htmlFor="index_symbol">Index Symbol *</Label>
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
          <Label htmlFor="title">Analysis Title *</Label>
          <Input
            id="title"
            placeholder="e.g., SPX Bullish Setup - Key Support Holding"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">Analysis Description *</Label>
          <Textarea
            id="body"
            placeholder="Explain your analysis in detail..."
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            rows={5}
            required
          />
        </div>

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
      </div>

      {/* Technical Details */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">Technical Details</h3>

        <div className="space-y-2">
          <Label htmlFor="timeframe">Timeframe *</Label>
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
          <Label>Analysis Methods / Schools Used</Label>
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
          <Label htmlFor="invalidation_price">Invalidation Price (Optional)</Label>
          <Input
            id="invalidation_price"
            type="number"
            step="0.01"
            placeholder="e.g., 5800.00"
            value={formData.invalidation_price}
            onChange={(e) => setFormData({ ...formData, invalidation_price: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Price level that would invalidate this analysis
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Price Targets (Optional)</Label>
            <Button type="button" variant="outline" size="sm" onClick={addTarget}>
              <Plus className="h-3 w-3 mr-1" />
              Add Target
            </Button>
          </div>
          {formData.targets.length > 0 && (
            <div className="space-y-2 border rounded-lg p-3">
              {formData.targets.map((target, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Label"
                    value={target.label}
                    onChange={(e) => updateTarget(index, 'label', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Price"
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
            Set price targets to get notifications when they're reached
          </p>
        </div>
      </div>

      {/* Telegram Publishing */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">Telegram Publishing</h3>

        {loadingChannels ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
            No Telegram channels configured. Go to Settings → Telegram to add a channel.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="telegram_channel">Telegram Channel (Optional)</Label>
              <Select
                value={formData.telegram_channel_id}
                onValueChange={(value) => setFormData({ ...formData, telegram_channel_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {channels.filter(ch => ch.source === 'analyst').length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Analyst Channels
                    </div>
                  )}
                  {channels.filter(ch => ch.source === 'analyst').map(channel => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.channel_name}
                    </SelectItem>
                  ))}
                  {channels.filter(ch => ch.source === 'plan').length > 0 && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                      Plan Channels
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
                  Auto-publish to Telegram when created
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {/* Publishing Options */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-lg">Publishing Options</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility *</Label>
            <Select
              value={formData.visibility}
              onValueChange={(value: any) => setFormData({ ...formData, visibility: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public (Everyone)</SelectItem>
                <SelectItem value="subscribers">Subscribers Only</SelectItem>
                <SelectItem value="admin_only">Admin Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status *</Label>
            <Select
              value={formData.status}
              onValueChange={(value: any) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-2 justify-end border-t pt-4">
        <Button type="button" variant="outline" onClick={onComplete}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Analysis
        </Button>
      </div>
    </form>
  )
}
