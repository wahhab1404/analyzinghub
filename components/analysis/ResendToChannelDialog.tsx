'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Send, Loader2, Users, Lock, Globe } from 'lucide-react'

interface TelegramChannel {
  id: string
  channel_name: string
  channel_id: string
  audience_type: 'public' | 'followers' | 'subscribers'
  enabled: boolean
}

interface ResendToChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
  analysisTitle?: string
}

export function ResendToChannelDialog({
  open,
  onOpenChange,
  analysisId,
  analysisTitle
}: ResendToChannelDialogProps) {
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) {
      fetchChannels()
    }
  }, [open])

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/telegram/channels/list')
      if (!response.ok) throw new Error('Failed to fetch channels')

      const data = await response.json()
      const enabledChannels = (data.channels || []).filter((ch: TelegramChannel) => ch.enabled)
      setChannels(enabledChannels)

      if (enabledChannels.length > 0) {
        setSelectedChannelId(enabledChannels[0].id)
      }
    } catch (error) {
      console.error('Error fetching channels:', error)
      toast.error('Failed to load Telegram channels')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!selectedChannelId) {
      toast.error('Please select a channel')
      return
    }

    setSending(true)
    try {
      const response = await fetch(`/api/analyses/${analysisId}/resend-to-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannelId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send analysis')
      }

      toast.success(`Analysis sent to ${data.channelName} successfully! 🎉`)
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error resending analysis:', error)
      toast.error(error.message || 'Failed to send analysis to channel')
    } finally {
      setSending(false)
    }
  }

  const getAudienceIcon = (type: string) => {
    switch (type) {
      case 'public':
        return <Globe className="h-4 w-4" />
      case 'followers':
        return <Users className="h-4 w-4" />
      case 'subscribers':
        return <Lock className="h-4 w-4" />
      default:
        return null
    }
  }

  const getAudienceBadgeClass = (type: string) => {
    switch (type) {
      case 'public':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'followers':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'subscribers':
        return 'bg-amber-100 text-amber-800 border-amber-300'
      default:
        return ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send to Telegram Channel
          </DialogTitle>
          <DialogDescription>
            {analysisTitle ? (
              <>Send "{analysisTitle}" to one of your Telegram channels</>
            ) : (
              <>Send this analysis to one of your Telegram channels</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : channels.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No Telegram channels connected
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  window.location.href = '/dashboard/settings?tab=telegram'
                }}
              >
                Connect a Channel
              </Button>
            </div>
          ) : (
            <RadioGroup value={selectedChannelId} onValueChange={setSelectedChannelId}>
              <div className="space-y-3">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => setSelectedChannelId(channel.id)}
                  >
                    <RadioGroupItem value={channel.id} id={channel.id} />
                    <Label
                      htmlFor={channel.id}
                      className="flex-1 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{channel.channel_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {channel.channel_id}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={getAudienceBadgeClass(channel.audience_type)}
                      >
                        <span className="mr-1">{getAudienceIcon(channel.audience_type)}</span>
                        {channel.audience_type}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleResend}
            disabled={!selectedChannelId || sending || loading}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send to Channel
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
