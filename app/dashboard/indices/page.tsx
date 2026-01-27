'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, TrendingUp, TrendingDown, Activity, ArrowLeft, FileText, CalendarIcon, Download, Send, RefreshCw, Settings, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { CreateIndexAnalysisForm } from '@/components/indices/CreateIndexAnalysisForm'
import { IndexAnalysesList } from '@/components/indices/IndexAnalysesList'
import { AddTradeForm } from '@/components/indices/AddTradeForm'
import { TradesList } from '@/components/indices/TradesList'
import { TradeMonitor } from '@/components/indices/TradeMonitor'
import { NewTradeDialog } from '@/components/indices/NewTradeDialog'
import { useLanguage } from '@/lib/i18n/language-context'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type View = 'list' | 'manage-trades' | 'monitor-trade'

interface Report {
  id: string
  report_date: string
  language_mode: 'en' | 'ar' | 'dual'
  status: string
  file_url?: string
  created_at: string
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

interface TelegramChannel {
  id: string
  channelId: string
  channelName: string
  audienceType: string
  verified: boolean
  enabled: boolean
}

export default function IndicesHubPage() {
  const { t, language } = useLanguage()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [currentView, setCurrentView] = useState<View>('list')
  const [showAddTradeForm, setShowAddTradeForm] = useState(false)
  const [showStandaloneTradeDialog, setShowStandaloneTradeDialog] = useState(false)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [selectedIndexSymbol, setSelectedIndexSymbol] = useState<string>('SPX')
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [refreshStandaloneTrades, setRefreshStandaloneTrades] = useState(0)

  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [languageMode, setLanguageMode] = useState<'en' | 'ar' | 'dual'>('dual')
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([])
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [showChannelSelector, setShowChannelSelector] = useState(false)
  const [reportToSend, setReportToSend] = useState<string | null>(null)

  const handleManageTrades = (analysisId: string, indexSymbol: string) => {
    setSelectedAnalysisId(analysisId)
    setSelectedIndexSymbol(indexSymbol)
    setCurrentView('manage-trades')
    setShowAddTradeForm(false)
  }

  const handleSelectTradeForMonitoring = (tradeId: string) => {
    setSelectedTradeId(tradeId)
    setCurrentView('monitor-trade')
  }

  const handleBackToList = () => {
    setCurrentView('list')
    setSelectedAnalysisId(null)
    setSelectedTradeId(null)
    setShowAddTradeForm(false)
  }

  const handleBackToTrades = () => {
    if (selectedAnalysisId) {
      setCurrentView('manage-trades')
      setSelectedTradeId(null)
    } else {
      handleBackToList()
    }
  }

  const handleTradeAdded = () => {
    setShowAddTradeForm(false)
    setRefreshStandaloneTrades(prev => prev + 1)
  }

  const handleStandaloneTradeAdded = () => {
    setShowStandaloneTradeDialog(false)
    setRefreshStandaloneTrades(prev => prev + 1)
  }

  useEffect(() => {
    loadReports()
    loadTelegramChannels()
  }, [])

  const loadReports = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/reports')
      if (!response.ok) throw new Error('Failed to load reports')
      const data = await response.json()
      setReports(data.reports || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const loadTelegramChannels = async () => {
    try {
      const response = await fetch('/api/telegram/channels/list')
      if (!response.ok) return
      const data = await response.json()
      if (data.ok && data.channels) {
        setTelegramChannels(data.channels)
      }
    } catch (err) {
      console.error('Failed to load telegram channels:', err)
    }
  }

  const generateReport = async (dryRun = false) => {
    setGenerating(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          language_mode: languageMode,
          dry_run: dryRun
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate report')
      }

      const data = await response.json()

      if (dryRun) {
        setPreviewData(data)
        setShowPreview(true)
      } else {
        setSuccess('Report generated successfully!')
        await loadReports()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const sendReport = async (reportId: string, channelIds?: string[]) => {
    if (!channelIds) {
      setReportToSend(reportId)
      setSelectedChannels([])
      setShowChannelSelector(true)
      return
    }

    setSending(reportId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          channel_ids: channelIds,
          send_as_image: true
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send report')
      }

      const data = await response.json()
      const sentCount = data.results?.filter((r: any) => r.status === 'sent').length || 0
      setSuccess(`Report sent successfully to ${sentCount} channel(s)`)
      setShowChannelSelector(false)
      setReportToSend(null)
      await loadReports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send report')
    } finally {
      setSending(null)
    }
  }

  const sendPreview = async () => {
    setShowPreview(false)
    setReportToSend('preview')
    setSelectedChannels([])
    setShowChannelSelector(true)
  }

  const confirmSendPreview = async (channelIds: string[]) => {
    if (!previewData) return

    setSending('preview')
    setError(null)

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          language_mode: languageMode,
          dry_run: false
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate report')
      }

      const data = await response.json()

      if (data.report_id) {
        const sendResponse = await fetch('/api/reports/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_id: data.report_id,
            channel_ids: channelIds,
            send_as_image: true
          })
        })

        if (!sendResponse.ok) {
          const errorData = await sendResponse.json()
          throw new Error(errorData.error || 'Failed to send report')
        }

        const sendData = await sendResponse.json()
        const sentCount = sendData.results?.filter((r: any) => r.status === 'sent').length || 0
        setSuccess(`Report sent successfully to ${sentCount} channel(s)`)
        setShowChannelSelector(false)
        setReportToSend(null)
        setPreviewData(null)
        await loadReports()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send report')
    } finally {
      setSending(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {currentView === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{t.indicesHub.title}</h1>
              <p className="text-muted-foreground">
                {t.indicesHub.subtitle}
              </p>
            </div>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t.indicesHub.createAnalysis}
            </Button>
          </div>

          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle>{t.indicesHub.createAnalysis}</CardTitle>
                <CardDescription>
                  {t.indicesHub.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreateIndexAnalysisForm onComplete={() => setShowCreateForm(false)} />
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="analyses" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="analyses">
                <Activity className="h-4 w-4 mr-2" />
                {t.indicesHub.myAnalyses}
              </TabsTrigger>
              <TabsTrigger value="standalone">
                <TrendingUp className="h-4 w-4 mr-2" />
                Standalone Trades
              </TabsTrigger>
              <TabsTrigger value="reports">
                <FileText className="h-4 w-4 mr-2" />
                {language === 'ar' ? 'التقارير' : 'Reports'}
              </TabsTrigger>
              <TabsTrigger value="archive">
                <TrendingDown className="h-4 w-4 mr-2" />
                {t.indicesHub.archive}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analyses" className="space-y-4">
              <IndexAnalysesList
                status="active"
                onSelectContract={handleSelectTradeForMonitoring}
                onManageTrades={handleManageTrades}
              />
            </TabsContent>

            <TabsContent value="standalone" className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Standalone Trades</h3>
                  <p className="text-sm text-muted-foreground">
                    Trades not linked to any analysis
                  </p>
                </div>
                <Button onClick={() => setShowStandaloneTradeDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Standalone Trade
                </Button>
              </div>
              <TradesList
                standalone={true}
                onSelectTrade={handleSelectTradeForMonitoring}
                refreshKey={refreshStandaloneTrades}
              />
            </TabsContent>

            <TabsContent value="reports" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {language === 'ar' ? 'تقارير التداول اليومية' : 'Daily Trading Reports'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar'
                      ? 'إنشاء وإدارة تقارير التداول اليومية'
                      : 'Generate and manage daily trading reports'}
                  </p>
                </div>
                <Link href="/dashboard/reports/settings">
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    {language === 'ar' ? 'الإعدادات' : 'Settings'}
                  </Button>
                </Link>
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
                      ? 'اختر التاريخ واللغة لإنشاء تقرير شامل'
                      : 'Select date and language to generate a comprehensive report'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                    <div className="flex items-end gap-2">
                      <Button
                        onClick={() => generateReport(true)}
                        variant="outline"
                        disabled={generating}
                        className="flex-1"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        {language === 'ar' ? 'معاينة' : 'Preview'}
                      </Button>
                      <Button
                        onClick={() => generateReport(false)}
                        disabled={generating}
                        className="flex-1"
                      >
                        {generating ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4 mr-2" />
                        )}
                        {language === 'ar' ? 'إنشاء' : 'Generate'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {language === 'ar' ? 'التقارير السابقة' : 'Generated Reports'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'ar'
                      ? 'سجل التقارير المُنشأة وحالة الإرسال'
                      : 'History of generated reports and delivery status'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {language === 'ar' ? 'لا توجد تقارير بعد. انقر "إنشاء" لإنشاء تقرير جديد.' : 'No reports yet. Click "Generate" to create your first report.'}
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
                                  {format(new Date(report.report_date), 'MMMM d, yyyy')}
                                </h3>
                                {getStatusBadge(report.status)}
                                <Badge variant="secondary" className="text-xs">
                                  {report.language_mode === 'dual' ? 'EN + AR' : report.language_mode.toUpperCase()}
                                </Badge>
                              </div>

                              {report.summary && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
                                  <div>
                                    <p className="text-muted-foreground">
                                      {language === 'ar' ? 'الإجمالي' : 'Total'}
                                    </p>
                                    <p className="font-semibold">{report.summary.total_trades ?? 0}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      {language === 'ar' ? 'نشطة' : 'Active'}
                                    </p>
                                    <p className="font-semibold">{report.summary.active_trades ?? 0}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      {language === 'ar' ? 'معدل الفوز' : 'Win Rate'}
                                    </p>
                                    <p className="font-semibold">{report.summary.win_rate?.toFixed(1) ?? '0.0'}%</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      {language === 'ar' ? 'أقصى ربح' : 'Max Profit'}
                                    </p>
                                    <p className="font-semibold">+{report.summary.max_profit_percent?.toFixed(1) ?? '0.0'}%</p>
                                  </div>
                                </div>
                              )}

                              {report.deliveries && report.deliveries.length > 0 && (
                                <div className="mt-3 text-sm text-muted-foreground">
                                  {language === 'ar' ? 'تم الإرسال إلى' : 'Sent to'} {report.deliveries.length} {language === 'ar' ? 'قناة' : 'channel(s)'}
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {report.file_url && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={report.file_url} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => sendReport(report.id)}
                                disabled={sending === report.id}
                              >
                                {sending === report.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
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

            <TabsContent value="archive" className="space-y-4">
              <IndexAnalysesList
                status="closed"
                onSelectContract={handleSelectTradeForMonitoring}
                onManageTrades={handleManageTrades}
              />
            </TabsContent>
          </Tabs>

          <NewTradeDialog
            open={showStandaloneTradeDialog}
            onOpenChange={setShowStandaloneTradeDialog}
            onComplete={handleStandaloneTradeAdded}
            standalone={true}
          />

        </>
      )}

      {currentView === 'manage-trades' && selectedAnalysisId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBackToList}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Analyses
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Manage Trades</h1>
                <p className="text-muted-foreground">
                  Add and monitor trades for this analysis
                </p>
              </div>
            </div>
            {!showAddTradeForm && (
              <Button onClick={() => setShowAddTradeForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Trade
              </Button>
            )}
          </div>

          {showAddTradeForm && (
            <Card>
              <CardHeader>
                <CardTitle>Add New Trade</CardTitle>
                <CardDescription>
                  Add a new contract/trade to this analysis with live tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AddTradeForm
                  analysisId={selectedAnalysisId}
                  indexSymbol={selectedIndexSymbol}
                  onComplete={handleTradeAdded}
                  onCancel={() => setShowAddTradeForm(false)}
                />
              </CardContent>
            </Card>
          )}

          <TradesList
            analysisId={selectedAnalysisId}
            onSelectTrade={handleSelectTradeForMonitoring}
          />
        </>
      )}

      {currentView === 'monitor-trade' && selectedTradeId && (
        <TradeMonitor
          tradeId={selectedTradeId}
          onBack={handleBackToTrades}
        />
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl max-h-[95vh] p-0 gap-0 overflow-hidden">
          <ScrollArea className="max-h-[95vh]">
            {previewData && (
              <div className="relative">
                {/* Header with Gradient Background */}
                <div className="relative bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white p-8">
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDEzNGg4djFoLTh2LTF6bTAgMTBoOHYxaC04di0xem0wIDEwaDh2MWgtOHYtMXptMCAxMGg4djFoLTh2LTF6bTAgMTBoOHYxaC04di0xem0wIDEwaDh2MWgtOHYtMXoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-10"></div>

                  <div className="relative flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      {previewData.analyzer?.avatar_url ? (
                        <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 overflow-hidden ring-4 ring-white/10">
                          <img
                            src={previewData.analyzer.avatar_url}
                            alt="Analyzer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 flex items-center justify-center text-2xl font-bold ring-4 ring-white/10">
                          {(previewData.analyzer?.full_name || previewData.analyzer?.username || 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h2 className="text-2xl font-bold mb-1">
                          {previewData.analyzer?.full_name || previewData.analyzer?.username || 'Analyzer'}
                        </h2>
                        <p className="text-white/80 text-sm">
                          {language === 'ar' ? 'تقرير التداول اليومي' : 'Daily Trading Report'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white/80 text-sm mb-1">
                        {format(selectedDate, 'MMMM dd, yyyy')}
                      </p>
                      <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                        {languageMode === 'dual' ? 'EN + AR' : languageMode.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {/* Total Profit Banner */}
                  <div className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/80 text-sm uppercase tracking-wider mb-2">
                          {language === 'ar' ? 'إجمالي الربح' : 'Total Profit'}
                        </p>
                        <p className={`text-4xl font-bold ${
                          (previewData.metrics.total_profit_dollars || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                        }`}>
                          {(previewData.metrics.total_profit_dollars || 0) >= 0 ? '+' : ''}
                          ${Math.abs(previewData.metrics.total_profit_dollars || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/80 text-sm uppercase tracking-wider mb-2">
                          {language === 'ar' ? 'معدل الفوز' : 'Win Rate'}
                        </p>
                        <p className="text-4xl font-bold text-white">
                          {(previewData.metrics.win_rate || 0).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                {previewData.metrics && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gradient-to-br from-gray-50 to-gray-100/50">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200/50">
                      <p className="text-sm text-gray-500 mb-1 uppercase tracking-wide">
                        {language === 'ar' ? 'إجمالي' : 'Total'}
                      </p>
                      <p className="text-3xl font-bold text-gray-900">{previewData.metrics.total_trades || 0}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {language === 'ar' ? 'التداولات' : 'Trades'}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200/50">
                      <p className="text-sm text-blue-600 mb-1 uppercase tracking-wide">
                        {language === 'ar' ? 'نشطة' : 'Active'}
                      </p>
                      <p className="text-3xl font-bold text-blue-700">{previewData.metrics.active_trades || 0}</p>
                      <p className="text-xs text-blue-600 mt-1">
                        {language === 'ar' ? 'جارية' : 'Running'}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-green-200/50">
                      <p className="text-sm text-green-600 mb-1 uppercase tracking-wide">
                        {language === 'ar' ? 'فائزة' : 'Winners'}
                      </p>
                      <p className="text-3xl font-bold text-green-700">{previewData.metrics.winning_trades || 0}</p>
                      <p className="text-xs text-green-600 mt-1">
                        {language === 'ar' ? 'مربحة' : 'Profitable'}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200/50">
                      <p className="text-sm text-red-600 mb-1 uppercase tracking-wide">
                        {language === 'ar' ? 'خاسرة' : 'Losers'}
                      </p>
                      <p className="text-3xl font-bold text-red-700">{previewData.metrics.losing_trades || 0}</p>
                      <p className="text-xs text-red-600 mt-1">
                        {language === 'ar' ? 'غير مربحة' : 'Unprofitable'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Trades List */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900">
                      {language === 'ar' ? 'تفاصيل التداولات' : 'Trade Details'}
                    </h3>
                    <Badge variant="secondary" className="text-sm">
                      {previewData.trades?.length || 0} {language === 'ar' ? 'تداول' : 'Trades'}
                    </Badge>
                  </div>

                  {previewData.trades && previewData.trades.length > 0 ? (
                    <div className="space-y-3">
                      {previewData.trades.map((trade: any, index: number) => (
                        <div
                          key={index}
                          className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-purple-300 transition-all duration-200"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${
                                trade.type === 'call'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {trade.type === 'call' ? '📈' : '📉'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xl font-bold text-gray-900">{trade.symbol}</span>
                                  <Badge variant={trade.type === 'call' ? 'default' : 'destructive'} className="text-xs">
                                    {trade.type?.toUpperCase()}
                                  </Badge>
                                  <Badge variant={
                                    trade.status === 'active' ? 'default' :
                                    trade.status === 'closed' ? 'secondary' :
                                    'outline'
                                  } className="text-xs">
                                    {trade.expired_status || (language === 'ar'
                                      ? trade.status === 'active' ? 'نشط' : trade.status === 'closed' ? 'مغلق' : trade.status
                                      : trade.status
                                    )}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-500">
                                  {language === 'ar'
                                    ? `السعر: $${trade.strike?.toFixed(2)} • الكمية: ${trade.qty}`
                                    : `Strike: $${trade.strike?.toFixed(2)} • Qty: ${trade.qty}`
                                  }
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-2xl font-bold ${
                                (trade.profit_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {(trade.profit_percent || 0) >= 0 ? '+' : ''}
                                {(trade.profit_percent || 0).toFixed(1)}%
                              </div>
                              <div className={`text-sm font-semibold ${
                                (trade.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {(trade.profit || 0) >= 0 ? '+' : ''}${Math.abs(trade.profit || 0).toFixed(0)}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                            <div className="text-center">
                              <p className="text-xs text-gray-500 mb-1">
                                {language === 'ar' ? 'الدخول' : 'Entry'}
                              </p>
                              <p className="text-sm font-semibold text-gray-900">
                                ${trade.entry_price?.toFixed(2)}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500 mb-1">
                                {language === 'ar' ? 'الأعلى' : 'Highest'}
                              </p>
                              <p className="text-sm font-semibold text-green-700">
                                ${trade.highest_price?.toFixed(2)}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500 mb-1">
                                {language === 'ar' ? 'الانتهاء' : 'Expiry'}
                              </p>
                              <p className="text-sm font-semibold text-gray-900">
                                {trade.expiry ? format(new Date(trade.expiry), 'MMM dd') : 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <div className="text-6xl mb-4">📭</div>
                      <p className="text-lg font-medium">
                        {language === 'ar' ? 'لا توجد تداولات' : 'No trades recorded'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex items-center justify-between gap-4 shadow-xl">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setShowPreview(false)
                      setPreviewData(null)
                    }}
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                  <Button
                    size="lg"
                    onClick={sendPreview}
                    disabled={sending === 'preview'}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg"
                  >
                    {sending === 'preview' ? (
                      <>
                        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        {language === 'ar' ? 'جاري الإرسال...' : 'Sending...'}
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        {language === 'ar' ? 'إرسال إلى تيليجرام' : 'Send to Telegram'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showChannelSelector} onOpenChange={setShowChannelSelector}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'اختر قنوات تيليجرام' : 'Select Telegram Channels'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? 'اختر القنوات التي تريد إرسال التقرير إليها كصورة'
                : 'Select the channels you want to send the report to as an image'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {telegramChannels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="mb-2">
                  {language === 'ar'
                    ? 'لا توجد قنوات تيليجرام متصلة'
                    : 'No Telegram channels connected'}
                </p>
                <Link href="/dashboard/settings">
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    {language === 'ar' ? 'إعداد القنوات' : 'Setup Channels'}
                  </Button>
                </Link>
              </div>
            ) : (
              <ScrollArea className="max-h-[300px] pr-4">
                <div className="space-y-3">
                  {telegramChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-start space-x-3 rtl:space-x-reverse"
                    >
                      <Checkbox
                        id={`channel-${channel.id}`}
                        checked={selectedChannels.includes(channel.channelId)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedChannels([...selectedChannels, channel.channelId])
                          } else {
                            setSelectedChannels(selectedChannels.filter(id => id !== channel.channelId))
                          }
                        }}
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`channel-${channel.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {channel.channelName}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {channel.audienceType} • {channel.verified ? (language === 'ar' ? 'موثق' : 'Verified') : (language === 'ar' ? 'غير موثق' : 'Unverified')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowChannelSelector(false)
                setReportToSend(null)
                setSelectedChannels([])
                if (reportToSend === 'preview') {
                  setShowPreview(true)
                }
              }}
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={() => {
                if (reportToSend === 'preview') {
                  confirmSendPreview(selectedChannels)
                } else if (reportToSend) {
                  sendReport(reportToSend, selectedChannels)
                }
              }}
              disabled={selectedChannels.length === 0 || sending !== null}
            >
              {sending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {language === 'ar' ? 'جاري الإرسال...' : 'Sending...'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {language === 'ar' ? `إرسال (${selectedChannels.length})` : `Send (${selectedChannels.length})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
