'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Bell, Send } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface NotificationPreferences {
  alerts_enabled: boolean
  target_alerts_enabled: boolean
  stop_alerts_enabled: boolean
  telegram_enabled: boolean
  telegram_target_hit: boolean
  telegram_stop_hit: boolean
  telegram_new_analysis: boolean
  quiet_hours_start: number | null
  quiet_hours_end: number | null
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    alerts_enabled: true,
    target_alerts_enabled: true,
    stop_alerts_enabled: true,
    telegram_enabled: false,
    telegram_target_hit: true,
    telegram_stop_hit: true,
    telegram_new_analysis: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/notification-preferences')
      if (response.ok) {
        const data = await response.json()
        setPreferences({
          alerts_enabled: data.preferences.alerts_enabled,
          target_alerts_enabled: data.preferences.target_alerts_enabled,
          stop_alerts_enabled: data.preferences.stop_alerts_enabled,
          telegram_enabled: data.preferences.telegram_enabled || false,
          telegram_target_hit: data.preferences.telegram_target_hit !== false,
          telegram_stop_hit: data.preferences.telegram_stop_hit !== false,
          telegram_new_analysis: data.preferences.telegram_new_analysis || false,
          quiet_hours_start: data.preferences.quiet_hours_start,
          quiet_hours_end: data.preferences.quiet_hours_end,
        })
      }
    } catch (error) {
      console.error('Error fetching preferences:', error)
      toast.error('Failed to load notification preferences')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      })

      if (response.ok) {
        toast.success('Notification preferences updated')
      } else {
        toast.error('Failed to update preferences')
      }
    } catch (error) {
      console.error('Error updating preferences:', error)
      toast.error('Failed to update preferences')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Configure when you want to receive notifications about your analyses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="alerts-enabled" className="text-base font-medium">
                Enable All Alerts
              </Label>
              <p className="text-sm text-muted-foreground">
                Master switch for all price alert notifications
              </p>
            </div>
            <Switch
              id="alerts-enabled"
              checked={preferences.alerts_enabled}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, alerts_enabled: checked })
              }
            />
          </div>

          <div
            className={`space-y-4 ${
              !preferences.alerts_enabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="target-alerts" className="text-base font-medium">
                  Target Price Alerts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when your target price is reached
                </p>
              </div>
              <Switch
                id="target-alerts"
                checked={preferences.target_alerts_enabled}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, target_alerts_enabled: checked })
                }
                disabled={!preferences.alerts_enabled}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="stop-alerts" className="text-base font-medium">
                  Stop Loss Alerts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when your stop loss is triggered
                </p>
              </div>
              <Switch
                id="stop-alerts"
                checked={preferences.stop_alerts_enabled}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, stop_alerts_enabled: checked })
                }
                disabled={!preferences.alerts_enabled}
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Send className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Telegram Notifications</h3>
          </div>

          <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="telegram-enabled" className="text-base font-medium">
                Enable Telegram Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via Telegram (requires linked account)
              </p>
            </div>
            <Switch
              id="telegram-enabled"
              checked={preferences.telegram_enabled}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, telegram_enabled: checked })
              }
            />
          </div>

          <div
            className={`space-y-4 ${
              !preferences.telegram_enabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="telegram-target" className="text-base font-medium">
                  Target Hit Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when a target price is reached
                </p>
              </div>
              <Switch
                id="telegram-target"
                checked={preferences.telegram_target_hit}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, telegram_target_hit: checked })
                }
                disabled={!preferences.telegram_enabled}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="telegram-stop" className="text-base font-medium">
                  Stop Loss Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when a stop loss is triggered
                </p>
              </div>
              <Switch
                id="telegram-stop"
                checked={preferences.telegram_stop_hit}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, telegram_stop_hit: checked })
                }
                disabled={!preferences.telegram_enabled}
              />
            </div>

            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="telegram-new" className="text-base font-medium">
                  New Analysis Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when followed analyzers publish new analyses
                </p>
              </div>
              <Switch
                id="telegram-new"
                checked={preferences.telegram_new_analysis}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, telegram_new_analysis: checked })
                }
                disabled={!preferences.telegram_enabled}
              />
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">Quiet Hours</Label>
                <p className="text-sm text-muted-foreground">
                  Mute notifications during specific hours (optional)
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Start Hour</Label>
                  <Select
                    value={preferences.quiet_hours_start?.toString() || 'none'}
                    onValueChange={(value) =>
                      setPreferences({
                        ...preferences,
                        quiet_hours_start: value === 'none' ? null : parseInt(value),
                      })
                    }
                    disabled={!preferences.telegram_enabled}
                  >
                    <SelectTrigger id="quiet-start">
                      <SelectValue placeholder="Select hour" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Disabled</SelectItem>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End Hour</Label>
                  <Select
                    value={preferences.quiet_hours_end?.toString() || 'none'}
                    onValueChange={(value) =>
                      setPreferences({
                        ...preferences,
                        quiet_hours_end: value === 'none' ? null : parseInt(value),
                      })
                    }
                    disabled={!preferences.telegram_enabled}
                  >
                    <SelectTrigger id="quiet-end">
                      <SelectValue placeholder="Select hour" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Disabled</SelectItem>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
