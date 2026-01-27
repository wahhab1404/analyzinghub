'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, Clock, Download, Send, RefreshCw, FileText, CalendarIcon, Settings, ShieldAlert, Eye } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/language-context'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface Report {
  id: string
  report_date: string
  language_mode: 'en' | 'ar' | 'dual'
  status: string
  file_url?: string
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

export default function ReportsPage() {
  const router = useRouter()
  const { language } = useLanguage()
  const [initComplete, setInitComplete] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [languageMode, setLanguageMode] = useState<'en' | 'ar' | 'dual'>('dual')
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily')
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [previewReport, setPreviewReport] = useState<Report | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sendingToTelegram, setSendingToTelegram] = useState<string | null>(null)

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
      const response = await fetch('/api/reports?t=' + Date.now(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      })
      if (!response.ok) throw new Error('Failed to load reports')
      const data = await response.json()
      setReports(data.reports || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      if (!mounted) return

      await checkAccess()
      await loadReports()

      if (mounted) {
        setInitComplete(true)
        router.refresh()
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [checkAccess, loadReports, router])

  useEffect(() => {
    if (!initComplete) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadReports()
      }
    }

    const handleFocus = () => {
      loadReports()
      router.refresh()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [initComplete, loadReports, router])

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
          body.week_offset = 0
        } else if (periodType === 'monthly') {
          body.month_offset = 0
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

      setTimeout(() => {
        loadReports()
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handlePreview = (report: Report) => {
    setPreviewReport(report)
    setPreviewOpen(true)
  }

  const sendToTelegram = async (reportId: string) => {
    setSendingToTelegram(reportId)
    setError(null)
    setSuccess(null)

    try {
      await loadReports()

      const currentReport = reports.find(r => r.id === reportId)
      if (!currentReport) {
        throw new Error('Report not found. Please refresh and try again.')
      }

      const response = await fetch('/api/reports/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          summary: currentReport.summary
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send to Telegram')
      }

      setSuccess('Report sent to Telegram successfully!')

      setTimeout(() => {
        loadReports()
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to Telegram')
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

        <Card>
          <CardHeader>
            <CardTitle>
              {language === 'ar' ? 'حول التقارير' : 'About Reports'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {language === 'ar'
                ? 'ميزة التقارير تسمح للمحللين بـ:'
                : 'The Reports feature allows analyzers to:'}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                {language === 'ar'
                  ? 'إنشاء تقارير تداول يومية وأسبوعية وشهرية'
                  : 'Generate daily, weekly, and monthly trading reports'}
              </li>
              <li>
                {language === 'ar'
                  ? 'تتبع أداء التداول وإحصائيات الربح'
                  : 'Track trading performance and profit statistics'}
              </li>
              <li>
                {language === 'ar'
                  ? 'إرسال التقارير تلقائياً إلى قنوات تيليجرام'
                  : 'Automatically send reports to Telegram channels'}
              </li>
              <li>
                {language === 'ar'
                  ? 'عرض تقارير بصيغة PDF واجهات جذابة'
                  : 'View reports in PDF format with beautiful layouts'}
              </li>
            </ul>
          </CardContent>
        </Card>
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadReports}
            disabled={loading}
            title={language === 'ar' ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Link href="/dashboard/reports/settings">
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              {language === 'ar' ? 'الإعدادات' : 'Settings'}
            </Button>
          </Link>
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
                    />
                  </PopoverContent>
                </Popover>
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

          {periodType !== 'daily' && (
            <Alert>
              <AlertDescription className="text-sm">
                {language === 'ar'
                  ? `سيتم إنشاء تقرير ${periodType === 'weekly' ? 'أسبوعي' : 'شهري'} للفترة الحالية`
                  : `Will generate ${periodType} report for the current period`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

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
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {language === 'ar'
                ? 'لا توجد تقارير بعد. انقر "إنشاء" لإنشاء تقرير جديد.'
                : 'No reports yet. Click "Generate" to create your first report.'}
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
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      {report.file_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href={report.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendToTelegram(report.id)}
                        disabled={sendingToTelegram === report.id}
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'معاينة التقرير' : 'Report Preview'}
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
    </div>
  )
}
