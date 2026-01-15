'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Send, Loader2, CheckCircle2, AlertCircle, Eye, Calendar, Languages } from 'lucide-react'
import { toast } from 'sonner'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'

interface ReportStats {
  totalTrades: number
  activeTrades: number
  closedTrades: number
  expiredTrades?: number
  avgProfit: number
  maxProfit: number
  winRate: number
}

export function DailyReportControls() {
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [lastSent, setLastSent] = useState<Date | null>(null)
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [language, setLanguage] = useState<'ar' | 'en'>('ar')

  const handlePreviewReport = async () => {
    setPreviewLoading(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      console.log('Fetching preview for date:', dateStr, 'Language:', language)

      const response = await fetch('/api/indices/preview-daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, language })
      })

      console.log('Response status:', response.status)

      const data = await response.json()
      console.log('Response data:', {
        hasHtml: !!data.html,
        htmlLength: data.html?.length || 0,
        stats: data.stats,
        keys: Object.keys(data)
      })

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate preview')
      }

      if (data.html && data.html.length > 0) {
        setPreviewHtml(data.html)
        setStats(data.stats)
        setShowPreview(true)
      } else {
        console.error('No valid HTML in response:', {
          hasHtml: !!data.html,
          htmlType: typeof data.html,
          htmlLength: data.html?.length,
          fullData: data
        })
        toast.error('No Preview Available', {
          description: 'The report was generated but no HTML preview was returned. Check console for details.',
          icon: <AlertCircle className="h-5 w-5" />,
        })
      }
    } catch (error: any) {
      console.error('Error previewing report:', error)
      toast.error('Failed to Preview Report', {
        description: error.message || 'An error occurred while generating the preview',
        icon: <AlertCircle className="h-5 w-5" />,
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSendReport = async () => {
    setLoading(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const response = await fetch('/api/indices/send-daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, language })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send report')
      }

      setLastSent(new Date())
      if (data.data?.stats) {
        setStats(data.data.stats)
      }

      toast.success('Daily Report Sent!', {
        description: 'The report has been sent to all subscriber channels',
        icon: <CheckCircle2 className="h-5 w-5" />,
      })
    } catch (error: any) {
      console.error('Error sending report:', error)
      toast.error('Failed to Send Report', {
        description: error.message || 'An error occurred while sending the report',
        icon: <AlertCircle className="h-5 w-5" />,
      })
    } finally {
      setLoading(false)
    }
  }

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  const isYesterday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')

  return (
    <>
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Daily Trading Report</CardTitle>
          </div>
          <CardDescription className="text-sm">
            Generate and send trading reports to subscriber channels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Select Report Date
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal text-sm"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(selectedDate, 'PPP')}
                    {isToday && <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">Today</span>}
                    {isYesterday && <span className="ml-2 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">Yesterday</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date > new Date() || date < new Date('2020-01-01')}
                    initialFocus
                  />
                  <div className="p-3 border-t flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setSelectedDate(new Date(Date.now() - 86400000))}
                    >
                      Yesterday
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setSelectedDate(new Date())}
                    >
                      Today
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="sm:w-48">
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Report Language
              </label>
              <Select value={language} onValueChange={(value: 'ar' | 'en') => setLanguage(value)}>
                <SelectTrigger className="w-full text-sm">
                  <Languages className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">
                    <div className="flex items-center gap-2">
                      <span>🇸🇦</span>
                      <span>Arabic (العربية)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="en">
                    <div className="flex items-center gap-2">
                      <span>🇺🇸</span>
                      <span>English</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border">
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className="text-xl font-bold text-foreground">{stats.totalTrades}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total</div>
              </div>
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className="text-xl font-bold text-blue-600">{stats.activeTrades}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Active</div>
              </div>
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className="text-xl font-bold text-green-600">{stats.closedTrades}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Closed</div>
              </div>
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className="text-xl font-bold text-orange-600">{stats.expiredTrades || 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Expired</div>
              </div>
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className={`text-xl font-bold ${stats.avgProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.avgProfit >= 0 ? '+' : ''}{stats.avgProfit.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Avg</div>
              </div>
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className="text-xl font-bold text-green-600">
                  +{stats.maxProfit.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Max</div>
              </div>
              <div className="text-center p-2 bg-white dark:bg-slate-950 rounded-md">
                <div className="text-xl font-bold text-purple-600">{stats.winRate.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground mt-0.5">Win Rate</div>
              </div>
            </div>
          )}

          {lastSent && (
            <div className="flex items-center gap-2 text-sm bg-green-50 dark:bg-green-950/20 p-2 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span className="text-xs font-medium text-green-800 dark:text-green-200">
                Last sent: {lastSent.toLocaleTimeString()} on {lastSent.toLocaleDateString()}
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button
              onClick={handlePreviewReport}
              disabled={previewLoading || loading}
              variant="outline"
              className="flex-1 w-full"
            >
              {previewLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Report
                </>
              )}
            </Button>
            <Button
              onClick={handleSendReport}
              disabled={loading || previewLoading}
              className="flex-1 w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Report...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Report
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1.5 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border">
            <p className="font-semibold text-foreground text-xs">What this does:</p>
            <ul className="space-y-1 ml-3 text-xs">
              <li>• Generates PDF report with performance statistics</li>
              <li>• Preview before sending to ensure accuracy</li>
              <li>• Sends to all subscriber Telegram channels</li>
            </ul>
            <p className="pt-2 border-t text-xs">
              <strong>Note:</strong> Reports auto-send Mon-Fri at 4 PM ET
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">Report Preview</DialogTitle>
            <DialogDescription className="text-sm">
              Preview of the daily trading report for {format(selectedDate, 'PPP')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-slate-50 dark:bg-slate-900">
            {previewHtml && (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full min-h-[600px]"
                title="Report Preview"
                sandbox="allow-same-origin"
              />
            )}
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close Preview
            </Button>
            <Button
              onClick={() => {
                setShowPreview(false)
                handleSendReport()
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Send This Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
