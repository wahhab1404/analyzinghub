'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Loader2, Save, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/language-context'
import Link from 'next/link'

interface ReportSettings {
  id: string
  enabled: boolean
  language_mode: 'en' | 'ar' | 'dual'
  schedule_time: string
  timezone: string
  default_channel_id?: string
  extra_channel_ids?: string[]
}

export default function ReportSettingsPage() {
  const { language } = useLanguage()
  const [settings, setSettings] = useState<ReportSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>('')

  useEffect(() => {
    checkAccess()
    loadSettings()
  }, [])

  const checkAccess = async () => {
    try {
      const response = await fetch('/api/me')
      if (!response.ok) throw new Error('Failed to load user info')
      const data = await response.json()
      const role = data.user?.role || ''
      setUserRole(role)
      setHasAccess(role === 'Analyzer' || role === 'SuperAdmin')
    } catch (err) {
      console.error('Error checking access:', err)
      setHasAccess(false)
    }
  }

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/reports/settings')
      if (!response.ok) throw new Error('Failed to load settings')
      const data = await response.json()
      setSettings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/reports/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save settings')
      }

      setSuccess('Settings saved successfully!')
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (hasAccess === null || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (hasAccess === false) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {language === 'ar' ? 'رجوع' : 'Back'}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">
              {language === 'ar' ? 'إعدادات التقارير' : 'Report Settings'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'ar'
                ? 'إدارة إعدادات التقارير التلقائية'
                : 'Manage automatic report settings'}
            </p>
          </div>
        </div>

        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">
                {language === 'ar'
                  ? 'الوصول مرفوض'
                  : 'Access Denied'}
              </p>
              <p>
                {language === 'ar'
                  ? 'إعدادات التقارير متاحة فقط للمحللين والمسؤولين. دورك الحالي: ' + userRole
                  : 'Report settings are only available to Analyzers and Admins. Your current role: ' + userRole}
              </p>
              <p className="text-sm">
                {language === 'ar'
                  ? 'للوصول إلى ميزة التقارير، يرجى الاتصال بالمسؤول لترقية حسابك.'
                  : 'To access the Reports feature, please contact an administrator to upgrade your account.'}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reports">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {language === 'ar' ? 'رجوع' : 'Back'}
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">
            {language === 'ar' ? 'إعدادات التقارير' : 'Report Settings'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ar'
              ? 'إدارة إعدادات التقارير التلقائية'
              : 'Manage automatic report settings'}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>
              {language === 'ar' ? 'الإعدادات العامة' : 'General Settings'}
            </CardTitle>
            <CardDescription>
              {language === 'ar'
                ? 'تخصيص إعدادات التقارير اليومية التلقائية'
                : 'Customize automatic daily report settings'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enabled">
                  {language === 'ar' ? 'تفعيل التقارير التلقائية' : 'Enable Automatic Reports'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar'
                    ? 'إنشاء وإرسال تقارير يومية تلقائياً'
                    : 'Automatically generate and send daily reports'}
                </p>
              </div>
              <Switch
                id="enabled"
                checked={settings.enabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enabled: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language_mode">
                {language === 'ar' ? 'لغة التقرير' : 'Report Language'}
              </Label>
              <Select
                value={settings.language_mode}
                onValueChange={(v: any) =>
                  setSettings({ ...settings, language_mode: v })
                }
              >
                <SelectTrigger id="language_mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية (Arabic)</SelectItem>
                  <SelectItem value="dual">Both / كلاهما</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule_time">
                {language === 'ar' ? 'وقت الإنشاء' : 'Generation Time'}
              </Label>
              <Input
                id="schedule_time"
                type="time"
                value={settings.schedule_time}
                onChange={(e) =>
                  setSettings({ ...settings, schedule_time: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                {language === 'ar'
                  ? 'الوقت اليومي لإنشاء التقرير (بتوقيت المنطقة المحددة)'
                  : 'Daily time to generate the report (in selected timezone)'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">
                {language === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}
              </Label>
              <Select
                value={settings.timezone}
                onValueChange={(v) => setSettings({ ...settings, timezone: v })}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">America/New_York (ET)</SelectItem>
                  <SelectItem value="Asia/Riyadh">Asia/Riyadh</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <AlertDescription className="text-sm">
                {language === 'ar'
                  ? '📌 ملاحظة: التقارير التلقائية يتم إنشاءها فقط في أيام التداول (الإثنين - الجمعة، باستثناء العطلات)'
                  : '📌 Note: Automatic reports are only generated on trading days (Monday-Friday, excluding holidays)'}
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {language === 'ar' ? 'جاري الحفظ...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
