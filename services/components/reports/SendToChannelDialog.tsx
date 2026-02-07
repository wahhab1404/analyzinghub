'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Send, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLanguage } from '@/lib/i18n/language-context'

interface TelegramChannel {
  channel_id: string
  channel_name: string
  channel_username?: string
  enabled: boolean
  audience_type?: 'subscribers' | 'advertisement'
}

interface SendToChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend: (channelIds: string[]) => Promise<void>
  reportId: string
}

export function SendToChannelDialog({ open, onOpenChange, onSend, reportId }: SendToChannelDialogProps) {
  const { t } = useLanguage()
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadChannels()
    }
  }, [open])

  const loadChannels = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/telegram/channels/list')
      if (!response.ok) throw new Error('Failed to load channels')
      const data = await response.json()

      const enabledChannels = data.channels?.filter((ch: TelegramChannel) => ch.enabled) || []
      setChannels(enabledChannels)

      if (enabledChannels.length > 0) {
        setSelectedChannels([enabledChannels[0].channel_id])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleChannel = (channelId: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId)
      } else {
        return [...prev, channelId]
      }
    })
  }

  const handleSend = async () => {
    if (selectedChannels.length === 0) {
      setError('Please select at least one channel')
      return
    }

    setSending(true)
    setError(null)

    try {
      await onSend(selectedChannels)
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || 'Failed to send report')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t?.reports?.selectChannels || 'Select Telegram Channels'}
          </DialogTitle>
          <DialogDescription>
            {t?.reports?.selectChannelsDesc || 'Choose which Telegram channels to send this report to'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : channels.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t?.reports?.noChannelsConfigured || 'No Telegram channels configured. Please add channels in Settings.'}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t?.reports?.selectAtLeastOne || 'Select at least one channel to send the report'}
              </p>
              <div className="space-y-3">
                {channels.map((channel) => (
                  <div key={channel.channel_id} className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={channel.channel_id}
                      checked={selectedChannels.includes(channel.channel_id)}
                      onCheckedChange={() => handleToggleChannel(channel.channel_id)}
                    />
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor={channel.channel_id}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {channel.channel_name}
                      </Label>
                      {channel.channel_username && (
                        <p className="text-xs text-muted-foreground">
                          @{channel.channel_username}
                        </p>
                      )}
                      {channel.audience_type && (
                        <p className="text-xs text-muted-foreground capitalize">
                          {channel.audience_type === 'subscribers' ? 'Subscriber Channel' : 'Advertisement Channel'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            {t?.common?.cancel || 'Cancel'}
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || selectedChannels.length === 0 || loading}
          >
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {sending ? (t?.reports?.sending || 'Sending...') : (t?.reports?.sendToTelegram || 'Send to Telegram')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
