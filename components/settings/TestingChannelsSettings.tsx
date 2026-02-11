'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { FlaskConical, AlertCircle, Plus, Edit2, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { apiFetch, apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api-client'

interface TestingChannel {
  id: string
  name: string
  telegram_channel_id: string
  telegram_channel_username?: string
  is_enabled: boolean
  created_at: string
}

export function TestingChannelsSettings() {
  const [channels, setChannels] = useState<TestingChannel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<TestingChannel | null>(null)
  const [channelToDelete, setChannelToDelete] = useState<TestingChannel | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    telegram_channel_id: '',
    telegram_channel_username: '',
  })

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      const data = await apiGet<{ channels: TestingChannel[] }>('/api/testing/channels')
      setChannels(data.channels || [])
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        console.log('Not authenticated')
        return
      }
      console.error('Failed to load testing channels:', error)
      toast.error('Failed to load testing channels')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyChannel = async () => {
    if (!formData.telegram_channel_id) {
      toast.error('Please enter a Telegram Channel ID')
      return
    }

    setVerifying(true)
    try {
      const data = await apiPost<{ channel: { title: string; username?: string } }>(
        '/api/testing/channels/verify',
        { telegram_channel_id: formData.telegram_channel_id }
      )

      toast.success(`Channel verified: ${data.channel.title}`)
      setFormData(prev => ({
        ...prev,
        name: prev.name || data.channel.title,
        telegram_channel_username: data.channel.username || ''
      }))
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error('You must be logged in to verify channels')
        } else {
          toast.error(error.message || 'Verification failed')
        }
      } else {
        console.error('Verification error:', error)
        toast.error('Failed to verify channel')
      }
    } finally {
      setVerifying(false)
    }
  }

  const handleAddChannel = async () => {
    if (!formData.name || !formData.telegram_channel_id) {
      toast.error('Please fill in all required fields')
      return
    }

    if (channels.filter(c => c.is_enabled).length >= 2) {
      toast.error('Maximum 2 testing channels allowed')
      return
    }

    setSaving(true)
    try {
      await apiPost('/api/testing/channels', formData)

      toast.success('Testing channel added successfully')
      setAddDialogOpen(false)
      setFormData({ name: '', telegram_channel_id: '', telegram_channel_username: '' })
      loadChannels()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error('You must be logged in')
        } else {
          toast.error(error.message || 'Failed to add channel')
        }
      } else {
        console.error('Add channel error:', error)
        toast.error('Failed to add channel')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEditChannel = async () => {
    if (!selectedChannel) return

    setSaving(true)
    try {
      await apiPatch(`/api/testing/channels/${selectedChannel.id}`, {
        name: formData.name,
        telegram_channel_username: formData.telegram_channel_username
      })

      toast.success('Channel updated successfully')
      setEditDialogOpen(false)
      setSelectedChannel(null)
      setFormData({ name: '', telegram_channel_id: '', telegram_channel_username: '' })
      loadChannels()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error('You must be logged in')
        } else {
          toast.error(error.message || 'Failed to update channel')
        }
      } else {
        console.error('Update channel error:', error)
        toast.error('Failed to update channel')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleToggleChannel = async (channel: TestingChannel) => {
    const newEnabledState = !channel.is_enabled

    if (newEnabledState && channels.filter(c => c.is_enabled).length >= 2) {
      toast.error('Maximum 2 testing channels can be enabled')
      return
    }

    try {
      await apiPatch(`/api/testing/channels/${channel.id}`, { is_enabled: newEnabledState })

      toast.success(`Channel ${newEnabledState ? 'enabled' : 'disabled'}`)
      loadChannels()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error('You must be logged in')
        } else {
          toast.error(error.message || 'Failed to update channel')
        }
      } else {
        console.error('Toggle channel error:', error)
        toast.error('Failed to update channel')
      }
    }
  }

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return

    try {
      await apiDelete(`/api/testing/channels/${channelToDelete.id}`)

      toast.success('Channel deleted successfully')
      setDeleteDialogOpen(false)
      setChannelToDelete(null)
      loadChannels()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          toast.error('You must be logged in')
        } else {
          toast.error(error.message || 'Failed to delete channel')
        }
      } else {
        console.error('Delete channel error:', error)
        toast.error('Failed to delete channel')
      }
    }
  }

  const openEditDialog = (channel: TestingChannel) => {
    setSelectedChannel(channel)
    setFormData({
      name: channel.name,
      telegram_channel_id: channel.telegram_channel_id,
      telegram_channel_username: channel.telegram_channel_username || ''
    })
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (channel: TestingChannel) => {
    setChannelToDelete(channel)
    setDeleteDialogOpen(true)
  }

  const canAddMore = channels.filter(c => c.is_enabled).length < 2

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <CardTitle>Testing Environment</CardTitle>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!canAddMore}>
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Testing Channel</DialogTitle>
                <DialogDescription>
                  Connect a private Telegram channel for testing. Maximum 2 channels allowed.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="channel_id">Telegram Channel ID *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="channel_id"
                      placeholder="-1001234567890"
                      value={formData.telegram_channel_id}
                      onChange={(e) => setFormData({ ...formData, telegram_channel_id: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleVerifyChannel}
                      disabled={verifying || !formData.telegram_channel_id}
                    >
                      {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The bot must be added as an administrator to your channel
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Channel Name *</Label>
                  <Input
                    id="name"
                    placeholder="Test Channel 1"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Channel Username (optional)</Label>
                  <Input
                    id="username"
                    placeholder="@my_test_channel"
                    value={formData.telegram_channel_username}
                    onChange={(e) => setFormData({ ...formData, telegram_channel_username: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddChannel} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Add Channel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          Manage up to 2 private testing channels for test-posting analyses and trades.
          Testing items are excluded from stats, rankings, and reports.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-8">
            <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No testing channels configured</p>
            <p className="text-xs text-muted-foreground mb-4">
              Add your first testing channel to start experimenting
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{channel.name}</h4>
                    <Badge variant={channel.is_enabled ? "default" : "secondary"}>
                      {channel.is_enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ID: {channel.telegram_channel_id}
                  </p>
                  {channel.telegram_channel_username && (
                    <p className="text-xs text-muted-foreground">
                      @{channel.telegram_channel_username}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={channel.is_enabled}
                    onCheckedChange={() => handleToggleChannel(channel)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditDialog(channel)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openDeleteDialog(channel)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Testing Mode Rules:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Testing analyses/trades are visible only to you</li>
                <li>Excluded from all statistics and rankings</li>
                <li>Not included in any reports or profit calculations</li>
                <li>Telegram alerts sent only to testing channels with 🧪 prefix</li>
                <li>Never visible to subscribers or in public feeds</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Testing Channel</DialogTitle>
            <DialogDescription>
              Update the channel name and username
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_name">Channel Name *</Label>
              <Input
                id="edit_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_username">Channel Username (optional)</Label>
              <Input
                id="edit_username"
                placeholder="@my_test_channel"
                value={formData.telegram_channel_username}
                onChange={(e) => setFormData({ ...formData, telegram_channel_username: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditChannel} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testing Channel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{channelToDelete?.name}". This action cannot be undone.
              Any analyses or trades linked to this testing channel will lose their testing status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChannel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
