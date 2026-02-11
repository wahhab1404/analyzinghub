'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ImageViewer } from '@/components/ui/image-viewer'
import { ShareMenu } from '@/components/ui/share-menu'
import { StockPrice } from '@/components/analysis/StockPrice'
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Clock, Newspaper, FileText, LineChart, ExternalLink, ArrowRight, Eye, Users, BarChart, Globe } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { useSearchParams, usePathname } from 'next/navigation'
import { downloadImageWithWatermark, generatePostSnapshot } from '@/lib/image-utils'
import { getTextDirection } from '@/lib/utils'
import { toast } from 'sonner'

interface PublicAnalysisViewProps {
  analysis: {
    id: string
    post_type?: 'analysis' | 'news' | 'article'
    direction?: 'Long' | 'Short' | 'Neutral'
    stop_loss?: number
    analysis_type?: 'classic' | 'elliott_wave' | 'harmonics' | 'ict' | 'other'
    chart_frame?: string | null
    title?: string
    summary?: string
    description?: string
    content?: string
    source_url?: string
    chart_image_url: string | null
    created_at: string
    status?: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
    validated_at?: string | null
    profiles: {
      id: string
      full_name: string
      avatar_url: string | null
      bio?: string | null
    }
    symbols: {
      symbol: string
    }
    analysis_targets?: Array<{
      price: number
      expected_time: string
    }>
    validation_events?: Array<{
      event_type: 'STOP_LOSS_HIT' | 'TARGET_HIT'
      target_number: number | null
      price_at_hit: number
      hit_at: string
    }>
  }
}

const translations = {
  en: {
    platformName: 'AnalyzingHub',
    platformTagline: 'Financial Analysis Platform',
    signUpFree: 'Sign Up Free',
    login: 'Login',
    ago: 'ago',
    news: 'News',
    article: 'Article',
    analysis: 'Analysis',
    classicAnalysis: 'Classic Technical Analysis',
    elliottWave: 'Elliott Wave',
    harmonics: 'Harmonics',
    ict: 'ICT (Inner Circle Trader)',
    other: 'Other',
    inProgress: 'In Progress',
    success: 'Success',
    failed: 'Failed',
    long: 'Long',
    short: 'Short',
    neutral: 'Neutral',
    analysisType: 'Analysis Type',
    chartTimeframe: 'Chart Timeframe',
    description: 'Description',
    fullAnalysis: 'Full Analysis',
    stopLoss: 'Stop Loss',
    targets: 'Targets',
    target: 'Target',
    hit: 'Hit',
    viewOriginalSource: 'View Original Source',
    joinTitle: 'Join AnalyzingHub Today',
    joinDescription: 'Get access to professional financial analysis, real-time market insights, and expert predictions. Follow top analysts, track your favorite stocks, and make informed investment decisions.',
    realtimeAnalysis: 'Real-time Analysis',
    realtimeAnalysisDesc: 'Get instant access to professional market analysis and predictions',
    expertCommunity: 'Expert Community',
    expertCommunityDesc: 'Follow and interact with verified financial analysts',
    trackPerformance: 'Track Performance',
    trackPerformanceDesc: 'Monitor analysis success rates and analyst performance',
    createFreeAccount: 'Create Free Account',
    signIn: 'Sign In',
    freeForever: 'Free forever • No credit card required • Instant access',
  },
  ar: {
    platformName: 'AnalyzingHub',
    platformTagline: 'منصة تحليل مالي',
    signUpFree: 'سجل مجاناً',
    login: 'تسجيل الدخول',
    ago: 'منذ',
    news: 'أخبار',
    article: 'مقالة',
    analysis: 'تحليل',
    classicAnalysis: 'التحليل الفني الكلاسيكي',
    elliottWave: 'موجات إليوت',
    harmonics: 'الهارمونيك',
    ict: 'ICT (Inner Circle Trader)',
    other: 'أخرى',
    inProgress: 'قيد التنفيذ',
    success: 'نجح',
    failed: 'فشل',
    long: 'شراء',
    short: 'بيع',
    neutral: 'محايد',
    analysisType: 'نوع التحليل',
    chartTimeframe: 'الإطار الزمني',
    description: 'الوصف',
    fullAnalysis: 'التحليل الكامل',
    stopLoss: 'وقف الخسارة',
    targets: 'الأهداف',
    target: 'الهدف',
    hit: 'تحقق',
    viewOriginalSource: 'عرض المصدر الأصلي',
    joinTitle: 'انضم إلى AnalyzingHub اليوم',
    joinDescription: 'احصل على تحليلات مالية احترافية، رؤى سوقية فورية، وتوقعات من الخبراء. تابع أفضل المحللين، راقب أسهمك المفضلة، واتخذ قرارات استثمارية مدروسة.',
    realtimeAnalysis: 'تحليلات فورية',
    realtimeAnalysisDesc: 'احصل على وصول فوري لتحليلات السوق الاحترافية والتوقعات',
    expertCommunity: 'مجتمع الخبراء',
    expertCommunityDesc: 'تابع وتفاعل مع المحللين الماليين المعتمدين',
    trackPerformance: 'تتبع الأداء',
    trackPerformanceDesc: 'راقب معدلات نجاح التحليلات وأداء المحللين',
    createFreeAccount: 'إنشاء حساب مجاني',
    signIn: 'تسجيل الدخول',
    freeForever: 'مجاني للأبد • لا حاجة لبطاقة ائتمان • وصول فوري',
  },
}

export function PublicAnalysisView({ analysis }: PublicAnalysisViewProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [language, setLanguage] = useState<'en' | 'ar'>('en')

  useEffect(() => {
    const langParam = searchParams.get('lang')
    if (langParam === 'ar' || langParam === 'en') {
      setLanguage(langParam)
    } else {
      const browserLang = navigator.language.toLowerCase()
      setLanguage(browserLang.startsWith('ar') ? 'ar' : 'en')
    }
  }, [searchParams])

  const t = translations[language]
  const isRTL = language === 'ar'

  const postType = analysis.post_type || 'analysis'

  const handleDownloadImage = async () => {
    if (!analysis.chart_image_url) return

    try {
      const filename = `${analysis.symbols.symbol}_${analysis.id.substring(0, 8)}.png`
      await downloadImageWithWatermark(
        analysis.chart_image_url,
        analysis.profiles.full_name,
        analysis.symbols.symbol,
        filename
      )
      toast.success('Image downloaded successfully')
    } catch (error) {
      toast.error('Failed to download image')
    }
  }

  const handleDownloadSnapshot = async () => {
    try {
      const sortedTargets = analysis.analysis_targets ? [...analysis.analysis_targets].sort((a, b) => a.price - b.price) : []
      const dataUrl = await generatePostSnapshot(
        analysis.id,
        analysis.profiles.full_name,
        analysis.symbols.symbol,
        postType,
        {
          title: analysis.title,
          summary: analysis.summary,
          direction: analysis.direction,
          stopLoss: analysis.stop_loss,
          targets: sortedTargets,
          analysisType: analysis.analysis_type,
          chartFrame: analysis.chart_frame,
        }
      )

      const link = document.createElement('a')
      link.download = `${analysis.symbols.symbol}_snapshot_${analysis.id.substring(0, 8)}.png`
      link.href = dataUrl
      link.click()
      toast.success('Snapshot downloaded successfully')
    } catch (error) {
      toast.error('Failed to download snapshot')
    }
  }

  const getPostTypeIcon = () => {
    if (postType === 'news') return <Newspaper className="h-4 w-4" />
    if (postType === 'article') return <FileText className="h-4 w-4" />
    return <LineChart className="h-4 w-4" />
  }

  const getPostTypeColor = () => {
    if (postType === 'news') return 'bg-orange-100 text-orange-800 border-orange-300'
    if (postType === 'article') return 'bg-green-100 text-green-800 border-green-300'
    return 'bg-blue-100 text-blue-800 border-blue-300'
  }

  const getPostTypeLabel = () => {
    if (postType === 'news') return t.news
    if (postType === 'article') return t.article
    return t.analysis
  }

  const getAnalysisTypeLabel = (type?: string) => {
    if (!type) return t.classicAnalysis
    const labels: Record<string, string> = {
      classic: t.classicAnalysis,
      elliott_wave: t.elliottWave,
      harmonics: t.harmonics,
      ict: t.ict,
      other: t.other,
    }
    return labels[type] || type
  }

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'ar' : 'en'
    setLanguage(newLang)
    const url = new URL(window.location.href)
    url.searchParams.set('lang', newLang)
    window.history.pushState({}, '', url.toString())
  }

  const directionIcons = {
    Long: <TrendingUp className="h-4 w-4" />,
    Short: <TrendingDown className="h-4 w-4" />,
    Neutral: <Minus className="h-4 w-4" />,
  }

  const directionColors = {
    Long: 'bg-green-100 text-green-800 border-green-300',
    Short: 'bg-red-100 text-red-800 border-red-300',
    Neutral: 'bg-gray-100 text-gray-800 border-gray-300',
  }

  const statusConfig = {
    IN_PROGRESS: {
      label: t.inProgress,
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    SUCCESS: {
      label: t.success,
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-green-100 text-green-800 border-green-300',
    },
    FAILED: {
      label: t.failed,
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-red-100 text-red-800 border-red-300',
    },
  }

  const directionLabels = {
    Long: t.long,
    Short: t.short,
    Neutral: t.neutral,
  }

  const status = analysis.status || 'IN_PROGRESS'
  const sortedTargets = analysis.analysis_targets ? [...analysis.analysis_targets].sort((a, b) => a.price - b.price) : []

  const validationEvent = analysis.validation_events?.[0]
  const hitTargetNumber = validationEvent?.event_type === 'TARGET_HIT' ? validationEvent.target_number : null
  const stopLossHit = validationEvent?.event_type === 'STOP_LOSS_HIT'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <Card className="border-2">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src="/analyzer-logo.png" alt="AnalyzingHub" className="h-10 w-10" />
                <div>
                  <h1 className="text-2xl font-bold">{t.platformName}</h1>
                  <p className="text-sm text-blue-100">{t.platformTagline}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleLanguage}
                  className="text-white hover:bg-white/10"
                >
                  <Globe className="h-4 w-4 me-2" />
                  {language === 'en' ? 'العربية' : 'English'}
                </Button>
                <Link href="/register">
                  <Button variant="secondary" size="sm">
                    {t.signUpFree}
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                    {t.login}
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={analysis.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    {analysis.profiles.full_name
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">{analysis.profiles.full_name}</p>
                  {analysis.profiles.bio && (
                    <p className="text-sm text-muted-foreground">{analysis.profiles.bio}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <ShareMenu
                url={`/share/${analysis.id}`}
                title={`${analysis.symbols.symbol} - ${getPostTypeLabel()} by ${analysis.profiles.full_name}`}
                description={analysis.title || analysis.summary || `${analysis.direction} position on ${analysis.symbols.symbol}`}
                onDownloadImage={analysis.chart_image_url ? handleDownloadImage : undefined}
                onDownloadSnapshot={handleDownloadSnapshot}
              />
            </div>

            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex-1 space-y-1">
                <h1 className="text-4xl font-bold">{analysis.symbols.symbol}</h1>
                <p className="text-sm text-muted-foreground">{analysis.symbols.symbol} • Symbol</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={getPostTypeColor()}>
                  <span className="mr-1">{getPostTypeIcon()}</span>
                  {getPostTypeLabel()}
                </Badge>
                {postType === 'analysis' && analysis.direction && (
                  <>
                    <Badge variant="outline" className={statusConfig[status].className}>
                      <span className={isRTL ? 'ms-1' : 'me-1'}>{statusConfig[status].icon}</span>
                      {statusConfig[status].label}
                    </Badge>
                    <Badge variant="outline" className={directionColors[analysis.direction]}>
                      <span className={isRTL ? 'ms-1' : 'me-1'}>{directionIcons[analysis.direction]}</span>
                      {directionLabels[analysis.direction]}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {analysis.chart_image_url && (
              <div
                className="rounded-xl overflow-hidden border-2 hover:border-primary transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl"
                onClick={() => setShowImageViewer(true)}
              >
                <img
                  src={analysis.chart_image_url}
                  alt={postType === 'news' ? 'News image' : postType === 'article' ? 'Article image' : 'Chart'}
                  className="w-full h-auto object-cover"
                />
              </div>
            )}

            {postType === 'analysis' && (analysis.analysis_type || analysis.chart_frame) && (
              <div className="flex flex-wrap items-center gap-3 p-5 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border-2 border-blue-100 dark:border-blue-900 shadow-md">
                {analysis.analysis_type && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border-2 border-blue-200 dark:border-blue-800 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                      <LineChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.analysisType}</p>
                      <p className="text-base font-bold text-foreground">{getAnalysisTypeLabel(analysis.analysis_type)}</p>
                    </div>
                  </div>
                )}
                {analysis.chart_frame && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border-2 border-purple-200 dark:border-purple-800 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                      <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.chartTimeframe}</p>
                      <p className="text-base font-bold text-foreground">{analysis.chart_frame}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {postType === 'analysis' && (
              <StockPrice symbol={analysis.symbols.symbol} size="lg" language={language} />
            )}

            {postType === 'news' && (
              <div className="space-y-4">
                <h2
                  className="text-2xl font-bold leading-tight"
                  dir={getTextDirection(analysis.title)}
                >
                  {analysis.title}
                </h2>
                <p
                  className="text-lg text-muted-foreground"
                  dir={getTextDirection(analysis.summary)}
                >
                  {analysis.summary}
                </p>
                {analysis.source_url && (
                  <a
                    href={analysis.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                  >
                    {t.viewOriginalSource} <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}

            {postType === 'article' && (
              <div className="space-y-4">
                <h2
                  className="text-2xl font-bold leading-tight"
                  dir={getTextDirection(analysis.title)}
                >
                  {analysis.title}
                </h2>
                <div
                  className="text-lg leading-relaxed whitespace-pre-wrap"
                  dir={getTextDirection(analysis.content)}
                >
                  {analysis.content}
                </div>
              </div>
            )}

            {analysis.description && (
              <div className="p-5 bg-slate-50 dark:bg-slate-900 rounded-xl border-2">
                <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  {t.fullAnalysis}
                </h3>
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
                  dir={getTextDirection(analysis.description)}
                >
                  {analysis.description}
                </p>
              </div>
            )}

            {postType === 'analysis' && analysis.stop_loss !== undefined && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{t.stopLoss}</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-2xl font-bold ${stopLossHit ? 'text-red-600 line-through' : 'text-red-600'}`}>
                      ${analysis.stop_loss.toFixed(2)}
                    </p>
                    {stopLossHit && (
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                        <XCircle className={`h-3 w-3 ${isRTL ? 'ms-1' : 'me-1'}`} />
                        {t.hit}
                      </Badge>
                    )}
                  </div>
                  {stopLossHit && validationEvent && (
                    <p className="text-sm text-muted-foreground">
                      {t.hit} ${validationEvent.price_at_hit.toFixed(2)} • {formatDistanceToNow(new Date(validationEvent.hit_at), { addSuffix: true })}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{t.targets}</p>
                  <div className="space-y-2">
                    {sortedTargets.map((target, index) => {
                      const targetNum = index + 1
                      const isHit = hitTargetNumber === targetNum
                      return (
                        <div key={index} className="space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-muted-foreground">TP{targetNum}:</span>
                            <span className={`text-lg font-bold ${isHit ? 'text-green-600 line-through' : 'text-green-600'}`}>
                              ${target.price.toFixed(2)}
                            </span>
                            {isHit && (
                              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                <CheckCircle2 className={`h-3 w-3 ${isRTL ? 'ms-1' : 'me-1'}`} />
                                {t.hit}
                              </Badge>
                            )}
                            {!isHit && (
                              <span className="text-sm text-muted-foreground">
                                ({formatDistanceToNow(new Date(target.expected_time))})
                              </span>
                            )}
                          </div>
                          {isHit && validationEvent && (
                            <p className={`text-sm text-muted-foreground ${isRTL ? 'mr-12' : 'ml-12'}`}>
                              {t.hit} ${validationEvent.price_at_hit.toFixed(2)} • {formatDistanceToNow(new Date(validationEvent.hit_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-2 border-blue-200 dark:border-blue-800">
          <CardContent className="py-8">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 text-white mb-4">
                <BarChart className="h-8 w-8" />
              </div>

              <h2 className="text-3xl font-bold">{t.joinTitle}</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {t.joinDescription}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-semibold">{t.realtimeAnalysis}</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.realtimeAnalysisDesc}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="font-semibold">{t.expertCommunity}</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.expertCommunityDesc}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold">{t.trackPerformance}</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {t.trackPerformanceDesc}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <Link href="/register">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                    {t.createFreeAccount}
                    <ArrowRight className={`h-5 w-5 ${isRTL ? 'me-2' : 'ms-2'}`} />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline">
                    {t.signIn}
                  </Button>
                </Link>
              </div>

              <p className="text-sm text-muted-foreground">
                {t.freeForever}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {analysis.chart_image_url && (
        <ImageViewer
          src={analysis.chart_image_url}
          alt={`${analysis.symbols.symbol} chart`}
          open={showImageViewer}
          onOpenChange={setShowImageViewer}
          onDownload={handleDownloadImage}
        />
      )}
    </div>
  )
}
