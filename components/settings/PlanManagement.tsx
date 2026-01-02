'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Users, Edit, Send, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Plan {
  id: string
  name: string
  description: string | null
  price_cents: number
  billing_interval: string
  features: Record<string, any>
  telegram_channel_id: string | null
  max_subscribers: number | null
  is_active: boolean
  subscriberCount: number
}

interface TelegramChannel {
  id: string
  channelId: string
  channelName: string
  audienceType: 'public' | 'subscription'
  verified: boolean
}

export function PlanManagement() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_cents: '0',
    billing_interval: 'month',
    features: '',
    telegram_channel_id: '',
    max_subscribers: '',
  })

  useEffect(() => {
    loadPlans()
    loadTelegramChannels()
  }, [])

  const loadTelegramChannels = async () => {
    try {
      setLoadingChannels(true)
      const response = await fetch('/api/telegram/channels/list')
      if (response.ok) {
        const data = await response.json()
        const channels = Array.isArray(data.channels) ? data.channels : []
        setTelegramChannels(channels.filter((ch: TelegramChannel) => ch.audienceType === 'subscription'))
      }
    } catch (error) {
      console.error('Failed to load telegram channels:', error)
    } finally {
      setLoadingChannels(false)
    }
  }

  const loadPlans = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      const response = await fetch(`/api/plans?analystId=${user.id}&showAll=true`)
      if (response.ok) {
        const data = await response.json()
        const plansData = Array.isArray(data.plans) ? data.plans : []
        setPlans(plansData)
      } else {
        const errorText = await response.text()
        console.error('Failed to load plans - HTTP', response.status, ':', errorText)
        try {
          const errorJson = JSON.parse(errorText)
          console.error('Error details:', errorJson)
        } catch (e) {
          console.error('Could not parse error response as JSON')
        }
      }
    } catch (error) {
      console.error('Failed to load plans - Exception:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      setCreating(true)

      if (!formData.name.trim()) {
        toast.error('Plan name is required')
        return
      }

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Please log in')
        return
      }

      const features: Record<string, string> = {}
      if (formData.features) {
        formData.features.split('\n').forEach((line, index) => {
          const trimmed = line.trim()
          if (trimmed) {
            features[`feature_${index + 1}`] = trimmed
          }
        })
      }

      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price_cents: parseInt(formData.price_cents) || 0,
          billing_interval: formData.billing_interval,
          features,
          telegram_channel_id: formData.telegram_channel_id || null,
          max_subscribers: formData.max_subscribers
            ? parseInt(formData.max_subscribers)
            : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to create plan')
        return
      }

      toast.success('Plan created successfully!')
      setShowCreateDialog(false)
      setFormData({
        name: '',
        description: '',
        price_cents: '0',
        billing_interval: 'month',
        features: '',
        telegram_channel_id: '',
        max_subscribers: '',
      })
      await loadPlans()
    } catch (error) {
      console.error('Create plan error:', error)
      toast.error('Failed to create plan')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (planId: string) => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Please log in')
        return
      }

      const response = await fetch(`/api/plans/${planId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to delete plan')
        return
      }

      toast.success('Plan deleted successfully!')
      await loadPlans()
    } catch (error) {
      console.error('Delete plan error:', error)
      toast.error('Failed to delete plan')
    }
  }

  const toggleActive = async (planId: string, currentState: boolean) => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Please log in')
        return
      }

      const response = await fetch(`/api/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          is_active: !currentState,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to update plan')
        return
      }

      toast.success(`Plan ${!currentState ? 'activated' : 'deactivated'}!`)
      await loadPlans()
    } catch (error) {
      console.error('Toggle plan error:', error)
      toast.error('Failed to update plan')
    }
  }

  const openEditDialog = (plan: Plan) => {
    setEditingPlan(plan)

    const featuresText = Object.values(plan.features || {}).join('\n')

    setFormData({
      name: plan.name,
      description: plan.description || '',
      price_cents: plan.price_cents.toString(),
      billing_interval: plan.billing_interval,
      features: featuresText,
      telegram_channel_id: plan.telegram_channel_id || '',
      max_subscribers: plan.max_subscribers?.toString() || '',
    })
    setShowEditDialog(true)
  }

  const handleUpdate = async () => {
    if (!editingPlan) return

    try {
      setUpdating(true)

      if (!formData.name.trim()) {
        toast.error('Plan name is required')
        return
      }

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Please log in')
        return
      }

      const features: Record<string, string> = {}
      if (formData.features) {
        formData.features.split('\n').forEach((line, index) => {
          const trimmed = line.trim()
          if (trimmed) {
            features[`feature_${index + 1}`] = trimmed
          }
        })
      }

      const response = await fetch(`/api/plans/${editingPlan.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price_cents: parseInt(formData.price_cents) || 0,
          billing_interval: formData.billing_interval,
          features,
          telegram_channel_id: formData.telegram_channel_id || null,
          max_subscribers: formData.max_subscribers
            ? parseInt(formData.max_subscribers)
            : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to update plan')
        return
      }

      toast.success('Plan updated successfully!')
      setShowEditDialog(false)
      setEditingPlan(null)
      setFormData({
        name: '',
        description: '',
        price_cents: '0',
        billing_interval: 'month',
        features: '',
        telegram_channel_id: '',
        max_subscribers: '',
      })
      await loadPlans()
    } catch (error) {
      console.error('Update plan error:', error)
      toast.error('Failed to update plan')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return <div className="h-32 bg-muted animate-pulse rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Subscription Plans</h3>
          <p className="text-muted-foreground">
            Create and manage subscription plans for your followers
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Subscription Plan</DialogTitle>
              <DialogDescription>
                Create a new subscription plan for your followers
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Plan Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Pro, Lite"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what subscribers get"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (cents)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="0"
                    value={formData.price_cents}
                    onChange={(e) =>
                      setFormData({ ...formData, price_cents: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = Free (for testing)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interval">Billing Interval</Label>
                  <Select
                    value={formData.billing_interval}
                    onValueChange={(value) =>
                      setFormData({ ...formData, billing_interval: value })
                    }
                  >
                    <SelectTrigger id="interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Monthly</SelectItem>
                      <SelectItem value="year">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="features">Features (one per line)</Label>
                <Textarea
                  id="features"
                  placeholder="Access to exclusive analyses&#10;Priority support&#10;Telegram channel access"
                  value={formData.features}
                  onChange={(e) =>
                    setFormData({ ...formData, features: e.target.value })
                  }
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_subscribers">Max Subscribers (optional)</Label>
                <Input
                  id="max_subscribers"
                  type="number"
                  placeholder="Leave empty for unlimited"
                  value={formData.max_subscribers}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_subscribers: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegram_channel">
                  Telegram Channel (optional)
                </Label>
                <Select
                  value={formData.telegram_channel_id}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      telegram_channel_id: value,
                    })
                  }
                >
                  <SelectTrigger id="telegram_channel">
                    <SelectValue placeholder="Select a Telegram channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Channel</SelectItem>
                    {telegramChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.channelId}>
                        {channel.channelName} {channel.verified ? '✓' : '⚠️'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Analysis will be broadcast to this channel. Set up channels in Telegram Settings.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Plan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Plan Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Subscription Plan</DialogTitle>
            <DialogDescription>
              Update your subscription plan details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Plan Name *</Label>
              <Input
                id="edit-name"
                placeholder="e.g., Pro, Lite"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Describe what subscribers get"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price (cents)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  placeholder="0"
                  value={formData.price_cents}
                  onChange={(e) =>
                    setFormData({ ...formData, price_cents: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  0 = Free (for testing)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-interval">Billing Interval</Label>
                <Select
                  value={formData.billing_interval}
                  onValueChange={(value) =>
                    setFormData({ ...formData, billing_interval: value })
                  }
                >
                  <SelectTrigger id="edit-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-features">Features (one per line)</Label>
              <Textarea
                id="edit-features"
                placeholder="Access to exclusive analyses&#10;Priority support&#10;Telegram channel access"
                value={formData.features}
                onChange={(e) =>
                  setFormData({ ...formData, features: e.target.value })
                }
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-max-subscribers">Max Subscribers (optional)</Label>
              <Input
                id="edit-max-subscribers"
                type="number"
                placeholder="Leave empty for unlimited"
                value={formData.max_subscribers}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_subscribers: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-telegram-channel">
                Telegram Channel (optional)
              </Label>
              <Select
                value={formData.telegram_channel_id}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    telegram_channel_id: value,
                  })
                }
              >
                <SelectTrigger id="edit-telegram-channel">
                  <SelectValue placeholder="Select a Telegram channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Channel</SelectItem>
                  {telegramChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.channelId}>
                      {channel.channelName} {channel.verified ? '✓' : '⚠️'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Analysis will be broadcast to this channel. Set up channels in Telegram Settings.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false)
                setEditingPlan(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating ? 'Updating...' : 'Update Plan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No subscription plans yet. Create your first plan to start accepting
              subscribers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                  <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      ${(plan.price_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      per {plan.billing_interval}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>
                      {plan.subscriberCount}
                      {plan.max_subscribers && ` / ${plan.max_subscribers}`}{' '}
                      subscribers
                    </span>
                  </div>
                </div>

                {plan.telegram_channel_id && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Send className="h-4 w-4 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Telegram Channel Connected</p>
                      <p className="text-xs text-muted-foreground">
                        {telegramChannels.find(ch => ch.channelId === plan.telegram_channel_id)?.channelName || plan.telegram_channel_id}
                      </p>
                    </div>
                  </div>
                )}
                {!plan.telegram_channel_id && (
                  <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <p className="text-sm text-orange-600">No Telegram channel connected</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(plan)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(plan.id, plan.is_active)}
                  >
                    {plan.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                    disabled={plan.subscriberCount > 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
                {plan.subscriberCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Cannot delete plan with active subscribers
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
