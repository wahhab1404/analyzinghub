'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle2, XCircle, Clock, Download, Send, RefreshCw, FileText, CalendarIcon, Settings, ShieldAlert, Eye, Save, Image } from 'lucide-react'
import { format } from 'date-fns'
import { useLanguage } from '@/lib/i18n/language-context'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SendToChannelDialog } from '@/components/reports/SendToChannelDialog'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface Report {
  id: string
  report_date: string
  language_mode: 'en' | 'ar' | 'dual'
  status: string
  file_url?: string
  image_url?: string
  created_at: string
  period_type?: 'daily' | 'weekly' | 'monthly' | 'custom'
  start_date?: string
  end_date?: string
  html_content?: string
  summary?: {
    total_trades: number
    active_trades: number
    closed_trades: number
    expired_trades: number
    avg_profit_percent: number
    max_profit_percent: number
    win_rate: number
  }
  deliveries?: Array<{
    id: string
    channel_name?: string
    status: string
    sent_at?: string
  }>
}

interface ReportSettings {
  id: string
  enabled: boolean
  language_mode: 'en' | 'ar' | 'dual'
  schedule_time: string
  timezone: string
  default_channel_id?: string
  extra_channel_ids?: string[]
}

export default function ReportsPage() {
  const router = useRouter()
  const { language } = useLanguage()
  const [mounted, setMounted] = useState(false)
  const [initComplete, setInitComplete] = useState(false)
  const [activeTab, setActiveTab] = useState('generate')

  // Manual generation
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [languageMode, setLanguageMode] = useState<'en' | 'ar' | 'dual'>('dual')
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily')
  const [weekOffset, setWeekOffset] = useState<number>(0)
  const [monthOffset, setMonthOffset] = useState<number>(0)

  // Reports history
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [previewReport, setPreviewReport] = useState<Report | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [sendingToTelegram, setSendingToTelegram] = useState<string | null>(null)
  const [channelDialogOpen, setChannelDialogOpen] = useState(false)
  const [selectedReportForSend, setSelectedReportForSend] = useState<string | null>(null)

  // Automated settings
  const [settings, setSettings] = useState<ReportSettings | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const checkAccess = useCallback(async () => {
    try {
      const response = await fetch('/api/me', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (!response.ok) throw new Error('Failed to load user info')
      const data = await response.json()
      const role = data.user?.role || ''
      setUserRole(role)
      setHasAccess(role === 'Analyzer' || role === 'SuperAdmin')
    } catch (err) {
      console.error('Error checking access:', err)
      setHasAccess(false)
    }
  }, [])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('[Reports Page] Loading reports...')
      const response = await fetch('/api/reports?t=' + Date.now(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      })

      console.log('[Reports Page] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Reports Page] Error response:', errorText)
        throw new Error('Failed to load reports')
      }

      const data = await response.json()
      console.log('[Reports Page] Received data:', {
        reportsCount: data.reports?.length || 0,
        total: data.total,
        reports: data.reports
      })

      setReports(data.reports || [])
    } catch (err) {
      console.error('[Reports Page] Load error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true)
    try {
      const response = await fetch('/api/reports/settings')
      if (!response.ok) throw new Error('Failed to load settings')
      const data = await response.json()
      setSettings(data)
    } catch (err) {
      console.error('Error loading settings:', err)
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    let isActive = true

    const init = async () => {
      if (!isActive) return

      await checkAccess()
      await loadReports()
      await loadSettings()

      if (isActive) {
        setInitComplete(true)
        router.refresh()
      }
    }

    init()

    return () => {
      isActive = false
    }
  }, [mounted, checkAccess, loadReports, loadSettings, router])

  const generateReport = async () => {
    setGenerating(true)
    setError(null)
    setSuccess(null)

    try {
      let endpoint = '/api/reports/generate'
      let body: any = {
        language_mode: languageMode
      }

      if (periodType === 'daily') {
        body.date = format(selectedDate, 'yyyy-MM-dd')
      } else {
        endpoint = '/api/reports/generate-period'
        body.period_type = periodType

        if (periodType === 'weekly') {
          body.week_offset = weekOffset
        } else if (periodType === 'monthly') {
          body.month_offset = monthOffset
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate report')
      }

      const data = await response.json()
      setSuccess(`Report generated successfully! ${periodType === 'daily' ? '' : `(${data.start_date} to ${data.end_date})`}`)

      // Force immediate refresh
      await loadReports()
      setActiveTab('history')

      // Refresh again after a short delay to ensure the database write is complete
      setTimeout(() => {
        loadReports()
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return

    setSavingSettings(true)
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
      setSavingSettings(false)
    }
  }

  const handlePreview = (report: Report) => {
    setPreviewReport(report)
    setPreviewOpen(true)
  }

  const handleImagePreview = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl)
    setImagePreviewOpen(true)
  }

  const openChannelDialog = (reportId: string) => {
    setSelectedReportForSend(reportId)
    setChannelDialogOpen(true)
  }

  const sendToSelectedChannels = async (channelIds: string[]) => {
    if (!selectedReportForSend) return

    setSendingToTelegram(selectedReportForSend)
    setError(null)
    setSuccess(null)

    try {
      const currentReport = reports.find(r => r.id === selectedReportForSend)
      if (!currentReport) {
        throw new Error('Report not found. Please refresh and try again.')
      }

      console.log('[Reports Page] Sending report to Telegram:', {
        reportId: selectedReportForSend,
        channelIds,
        languageMode: currentReport.language_mode,
        hasSummary: !!currentReport.summary
      })

      const response = await fetch('/api/reports/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: selectedReportForSend,
          channel_ids: channelIds,
          language_mode: currentReport.language_mode || 'dual'
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[Reports Page] Telegram send error:', errorData)
        throw new Error(errorData.error || 'Failed to send to Telegram')
      }

      const result = await response.json()
      console.log('[Reports Page] Telegram send result:', result)

      setSuccess(`Report sent successfully to ${result.sent_to || channelIds.length} channel(s)!`)

      setTimeout(() => {
        loadReports()
      }, 500)
    } catch (err) {
      console.error('[Reports Page] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send to Telegram')
      throw err
    } finally {
      setSendingToTelegram(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'generated':
        return <Badge variant="outline" className="bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Generated</Badge>
      case 'sent':
        return <Badge variant="outline" className="bg-blue-50"><Send className="w-3 h-3 mr-1" />Sent</Badge>
      case 'failed':
        return <Badge variant="outline" className="bg-red-50"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
      case 'generating':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Generating</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (!mounted) {
    return null
  }

  if (hasAccess === null || !initComplete) {
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
        <div>
          <h1 className="text-3xl font-bold">
            {language === 'ar' ? 'التقارير' : 'Reports'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ar'
              ? 'إنشاء وإدارة تقارير التداول'
              : 'Generate and manage trading reports'}
          </p>
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
                  ? 'التقارير متاحة فقط للمحللين والمسؤولين. دورك الحالي: ' + userRole
                  : 'Reports are only available to Analyzers and Admins. Your current role: ' + userRole}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {language === 'ar' ? 'التقارير' : 'Reports'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ar'
              ? 'إنشاء وإدارة تقارير التداول'
              : 'Generate and manage trading reports'}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            loadReports()
            loadSettings()
          }}
          disabled={loading || loadingSettings}
          title={language === 'ar' ? 'تحديث' : 'Refresh'}
        >
          <RefreshCw className={cn("w-4 h-4", (loading || loadingSettings) && "animate-spin")} />
        </Button>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generate">
            <FileText className="w-4 h-4 mr-2" />
            {language === 'ar' ? 'إنشاء تقرير' : 'Generate'}
          </TabsTrigger>
          <TabsTrigger value="automated">
            <Settings className="w-4 h-4 mr-2" />
            {language === 'ar' ? 'تقارير تلقائية' : 'Automated'}
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="w-4 h-4 mr-2" />
            {language === 'ar' ? 'السجل' : 'History'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {language === 'ar' ? 'إنشاء تقرير جديد' : 'Generate New Report'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'اختر نوع التقرير والإعدادات'
                  : 'Select report type and settings'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {language === 'ar' ? 'نوع التقرير' : 'Report Type'}
                  </label>
                  <Select value={periodType} onValueChange={(v: any) => setPeriodType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">
                        {language === 'ar' ? 'يومي' : 'Daily'}
                      </SelectItem>
                      <SelectItem value="weekly">
                        {language === 'ar' ? 'أسبوعي' : 'Weekly'}
                      </SelectItem>
                      <SelectItem value="monthly">
                        {language === 'ar' ? 'شهري' : 'Monthly'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {periodType === 'daily' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {language === 'ar' ? 'التاريخ' : 'Date'}
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !selectedDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => date && setSelectedDate(date)}
                          initialFocus
                          disabled={(date) => date > new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {periodType === 'weekly' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {language === 'ar' ? 'الأسبوع' : 'Week Period'}
                    </label>
                    <Select value={weekOffset.toString()} onValueChange={(v) => setWeekOffset(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{language === 'ar' ? 'الأسبوع الحالي' : 'Current Week'}</SelectItem>
                        <SelectItem value="-1">{language === 'ar' ? 'الأسبوع الماضي' : 'Last Week'}</SelectItem>
                        <SelectItem value="-2">{language === 'ar' ? 'أسبوعين ماضيين' : '2 Weeks Ago'}</SelectItem>
                        <SelectItem value="-3">{language === 'ar' ? 'ثلاثة أسابيع ماضية' : '3 Weeks Ago'}</SelectItem>
                        <SelectItem value="-4">{language === 'ar' ? 'أربعة أسابيع ماضية' : '4 Weeks Ago'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {periodType === 'monthly' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {language === 'ar' ? 'الشهر' : 'Month Period'}
                    </label>
                    <Select value={monthOffset.toString()} onValueChange={(v) => setMonthOffset(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{language === 'ar' ? 'الشهر الحالي' : 'Current Month'}</SelectItem>
                        <SelectItem value="-1">{language === 'ar' ? 'الشهر الماضي' : 'Last Month'}</SelectItem>
                        <SelectItem value="-2">{language === 'ar' ? 'شهرين ماضيين' : '2 Months Ago'}</SelectItem>
                        <SelectItem value="-3">{language === 'ar' ? 'ثلاثة أشهر ماضية' : '3 Months Ago'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {language === 'ar' ? 'اللغة' : 'Language'}
                  </label>
                  <Select value={languageMode} onValueChange={(v: any) => setLanguageMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="dual">Both / كلاهما</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={generateReport}
                    disabled={generating}
                    className="w-full"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {language === 'ar' ? 'جاري الإنشاء...' : 'Generating...'}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        {language === 'ar' ? 'إنشاء' : 'Generate'}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {periodType === 'weekly' && (
                <Alert>
                  <AlertDescription className="text-sm">
                    {language === 'ar'
                      ? `سيتم إنشاء تقرير أسبوعي ${
                          weekOffset === 0 ? 'للأسبوع الحالي' :
                          weekOffset === -1 ? 'للأسبوع الماضي' :
                          `لأسبوع قبل ${Math.abs(weekOffset)} أسابيع`
                        }`
                      : `Will generate weekly report ${
                          weekOffset === 0 ? 'for current week' :
                          weekOffset === -1 ? 'for last week' :
                          `for ${Math.abs(weekOffset)} weeks ago`
                        }`}
                  </AlertDescription>
                </Alert>
              )}
              {periodType === 'monthly' && (
                <Alert>
                  <AlertDescription className="text-sm">
                    {language === 'ar'
                      ? `سيتم إنشاء تقرير شهري ${
                          monthOffset === 0 ? 'للشهر الحالي' :
                          monthOffset === -1 ? 'للشهر الماضي' :
                          `لشهر قبل ${Math.abs(monthOffset)} أشهر`
                        }`
                      : `Will generate monthly report ${
                          monthOffset === 0 ? 'for current month' :
                          monthOffset === -1 ? 'for last month' :
                          `for ${Math.abs(monthOffset)} months ago`
                        }`}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automated" className="space-y-6">
          {loadingSettings ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : settings ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {language === 'ar' ? 'إعدادات التقارير التلقائية' : 'Automated Report Settings'}
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
                      ? 'ملاحظة: التقارير التلقائية يتم إنشاءها فقط في أيام التداول (الإثنين - الجمعة، باستثناء العطلات)'
                      : 'Note: Automatic reports are only generated on trading days (Monday-Friday, excluding holidays)'}
                  </AlertDescription>
                </Alert>

                <div className="flex justify-end">
                  <Button onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings ? (
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
          ) : null}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {language === 'ar' ? 'التقارير السابقة' : 'Generated Reports'}
              </CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'سجل التقارير المُنشأة'
                  : 'History of generated reports'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !reports || reports.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-muted-foreground mb-4">
                    {language === 'ar'
                      ? 'لا توجد تقارير بعد. انتقل إلى تبويب "إنشاء تقرير" لإنشاء تقرير جديد.'
                      : 'No reports yet. Go to the "Generate" tab to create your first report.'}
                  </div>
                  <Button onClick={loadReports} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {language === 'ar' ? 'تحديث' : 'Refresh'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">
                              {report.period_type === 'daily'
                                ? format(new Date(report.report_date), 'PPP')
                                : `${report.period_type?.charAt(0).toUpperCase()}${report.period_type?.slice(1)} Report`
                              }
                            </h3>
                            {getStatusBadge(report.status)}
                            <Badge variant="secondary" className="text-xs">
                              {report.language_mode === 'en' ? 'English' : report.language_mode === 'ar' ? 'العربية' : 'Both'}
                            </Badge>
                            {report.image_url && (
                              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                <Image className="w-3 h-3 mr-1" />
                                Image
                              </Badge>
                            )}
                          </div>

                          {report.start_date && report.end_date && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {format(new Date(report.start_date), 'MMM dd')} - {format(new Date(report.end_date), 'MMM dd, yyyy')}
                            </p>
                          )}

                          {report.summary && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {language === 'ar' ? 'إجمالي الصفقات' : 'Total Trades'}
                                </p>
                                <p className="text-lg font-semibold">{report.summary.total_trades || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {language === 'ar' ? 'نشطة' : 'Active'}
                                </p>
                                <p className="text-lg font-semibold text-blue-600">{report.summary.active_trades || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {language === 'ar' ? 'مغلقة' : 'Closed'}
                                </p>
                                <p className="text-lg font-semibold text-green-600">{report.summary.closed_trades || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {language === 'ar' ? 'معدل النجاح' : 'Win Rate'}
                                </p>
                                <p className="text-lg font-semibold">{(report.summary.win_rate || 0).toFixed(1)}%</p>
                              </div>
                            </div>
                          )}

                          {report.deliveries && report.deliveries.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs text-muted-foreground mb-2">
                                {language === 'ar' ? 'الإرسال إلى تيليجرام:' : 'Telegram Deliveries:'}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {report.deliveries.map((delivery) => (
                                  <Badge key={delivery.id} variant="outline" className="text-xs">
                                    {delivery.channel_name || 'Unknown'}: {delivery.status}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {report.html_content && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreview(report)}
                              title={language === 'ar' ? 'معاينة HTML' : 'Preview HTML'}
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          )}
                          {report.image_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImagePreview(report.image_url!)}
                              title={language === 'ar' ? 'معاينة الصورة' : 'Preview Image'}
                            >
                              <Eye className="w-4 h-4 text-purple-600" />
                            </Button>
                          )}
                          {report.file_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              title={language === 'ar' ? 'تحميل PDF' : 'Download PDF'}
                            >
                              <a href={report.file_url} target="_blank" rel="noopener noreferrer">
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openChannelDialog(report.id)}
                            disabled={sendingToTelegram === report.id}
                            title={language === 'ar' ? 'إرسال إلى تيليجرام' : 'Send to Telegram'}
                          >
                            {sendingToTelegram === report.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'معاينة التقرير HTML' : 'HTML Report Preview'}
            </DialogTitle>
          </DialogHeader>
          {previewReport?.html_content && (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: previewReport.html_content }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'معاينة صورة التقرير' : 'Report Image Preview'}
            </DialogTitle>
          </DialogHeader>
          {selectedImageUrl && (
            <div className="flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-lg p-4">
              <img
                src={selectedImageUrl}
                alt="Report Preview"
                className="max-w-full h-auto rounded-lg shadow-lg"
                style={{ maxHeight: 'calc(90vh - 120px)' }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SendToChannelDialog
        open={channelDialogOpen}
        onOpenChange={setChannelDialogOpen}
        onSend={sendToSelectedChannels}
        reportId={selectedReportForSend || ''}
      />
    </div>
  )
}
