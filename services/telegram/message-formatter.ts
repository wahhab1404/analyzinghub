interface Analysis {
  id: string
  post_type?: 'analysis' | 'news' | 'article'
  direction?: 'Long' | 'Short' | 'Neutral'
  stop_loss?: number
  analysis_type?: 'classic' | 'elliott_wave' | 'harmonics' | 'ict' | 'other'
  chart_frame?: string | null
  title?: string
  summary?: string
  content?: string
  source_url?: string
  description?: string
  chart_image_url?: string
  activation_enabled?: boolean
  activation_type?: string
  activation_price?: number
  activation_timeframe?: string
  activation_status?: string
  profiles: {
    full_name: string
  }
  symbols: {
    symbol: string
  }
  analysis_targets?: Array<{
    price: number
    expected_time: string
  }>
}

interface FormatOptions {
  language: 'en' | 'ar'
  includeLink?: boolean
  baseUrl?: string
}

const translations = {
  en: {
    newAnalysis: '📊 New Technical Analysis',
    newNews: '📰 Market News',
    newArticle: '📝 New Article',
    by: 'by',
    symbol: 'Symbol',
    analysisType: 'Analysis Type',
    chartFrame: 'Timeframe',
    direction: 'Direction',
    stopLoss: 'Stop Loss',
    targets: 'Price Targets',
    target: 'TP',
    description: 'Description',
    summary: 'Summary',
    source: 'Source',
    viewFull: '👁️ View Full Analysis',
    long: '📈 Long (Bullish)',
    short: '📉 Short (Bearish)',
    neutral: '➡️ Neutral',
    classic: 'Classic Technical Analysis',
    elliottWave: 'Elliott Wave',
    harmonics: 'Harmonics',
    ict: 'ICT (Inner Circle Trader)',
    other: 'Other',
    poweredBy: 'Powered by AnalyzingHub',
    platform: '💹 Professional Financial Analysis Platform',
    activationCondition: 'Activation Required',
    activationPrice: 'Activation Price',
    activationTimeframe: 'Timeframe',
    activationPending: '⏳ Pending Activation',
    activationActive: '✅ Active',
    activationMustBe: 'Price must be',
    price_above: 'above',
    price_below: 'below',
    time_based: 'Time Based',
    passing_price: 'Passing Price',
    daily_close: 'Daily Close',
  },
  ar: {
    newAnalysis: '📊 تحليل فني جديد',
    newNews: '📰 أخبار السوق',
    newArticle: '📝 مقالة جديدة',
    by: 'بواسطة',
    symbol: 'الرمز',
    analysisType: 'نوع التحليل',
    chartFrame: 'الإطار الزمني',
    direction: 'الاتجاه',
    stopLoss: 'وقف الخسارة',
    targets: 'الأهداف السعرية',
    target: 'الهدف',
    description: 'الوصف',
    summary: 'الملخص',
    source: 'المصدر',
    viewFull: '👁️ عرض التحليل الكامل',
    long: '📈 شراء (صاعد)',
    short: '📉 بيع (هابط)',
    neutral: '➡️ محايد',
    classic: 'التحليل الفني الكلاسيكي',
    elliottWave: 'موجات إليوت',
    harmonics: 'الهارمونيك',
    ict: 'ICT (Inner Circle Trader)',
    other: 'أخرى',
    poweredBy: 'مدعوم من AnalyzingHub',
    platform: '💹 منصة تحليل مالي احترافية',
    activationCondition: 'يتطلب التفعيل',
    activationPrice: 'سعر التفعيل',
    activationTimeframe: 'الإطار الزمني',
    activationPending: '⏳ في انتظار التفعيل',
    activationActive: '✅ مفعل',
    activationMustBe: 'يجب أن يكون السعر',
    price_above: 'فوق',
    price_below: 'تحت',
    time_based: 'مبني على الوقت',
    passing_price: 'عبور السعر',
    daily_close: 'إغلاق يومي',
  },
}

function formatDirectionEmoji(direction?: string): string {
  if (direction === 'Long') return '📈'
  if (direction === 'Short') return '📉'
  return '➡️'
}

function formatDirection(direction: string, language: 'en' | 'ar'): string {
  const t = translations[language]
  if (direction === 'Long') return t.long
  if (direction === 'Short') return t.short
  return t.neutral
}

function formatAnalysisType(type: string | undefined, language: 'en' | 'ar'): string {
  if (!type) return translations[language].classic
  const t = translations[language]
  const typeMap: Record<string, string> = {
    classic: t.classic,
    elliott_wave: t.elliottWave,
    harmonics: t.harmonics,
    ict: t.ict,
    other: t.other,
  }
  return typeMap[type] || type
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}

function escapeMarkdown(text: string): string {
  return text
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

function formatActivationType(type: string | undefined, language: 'en' | 'ar'): string {
  if (!type) return ''
  const t = translations[language]

  const normalizedType = type.toLowerCase().replace(/_/g, '_')

  const typeMap: Record<string, string> = {
    'above_price': t.price_above,
    'under_price': t.price_below,
    'passing_price': t.passing_price,
    'price_above': t.price_above,
    'price_below': t.price_below,
    'time_based': t.time_based,
    'daily_close': t.daily_close,
  }
  return typeMap[normalizedType] || type
}

export function formatAnalysisMessage(analysis: Analysis, options: FormatOptions): string {
  const t = translations[options.language]
  const isRTL = options.language === 'ar'
  const postType = analysis.post_type || 'analysis'

  let message = ''

  if (postType === 'analysis') {
    message += `${t.newAnalysis}\n`
  } else if (postType === 'news') {
    message += `${t.newNews}\n`
  } else {
    message += `${t.newArticle}\n`
  }

  message += `━━━━━━━━━━━━━━━━\n\n`

  if (postType === 'news' && analysis.title) {
    message += `*${escapeMarkdown(analysis.title)}*\n\n`
  } else if (postType === 'article' && analysis.title) {
    message += `*${escapeMarkdown(analysis.title)}*\n\n`
  }

  message += `*${t.symbol}:* ${escapeMarkdown(analysis.symbols.symbol)}\n`
  message += `*${t.by}:* ${escapeMarkdown(analysis.profiles.full_name)}\n`

  if (postType === 'analysis') {
    if (analysis.analysis_type || analysis.chart_frame) {
      message += `\n━━━━━━━━━━━━━━━━\n`
      if (analysis.analysis_type) {
        message += `🔍 *${t.analysisType}:* ${formatAnalysisType(analysis.analysis_type, options.language)}\n`
      }
      if (analysis.chart_frame) {
        message += `⏱️ *${t.chartFrame}:* ${escapeMarkdown(analysis.chart_frame)}\n`
      }
    }
    message += `\n`

    if (analysis.direction) {
      const directionEmoji = formatDirectionEmoji(analysis.direction)
      message += `${directionEmoji} *${t.direction}:* ${formatDirection(analysis.direction, options.language)}\n\n`
    }

    if (analysis.activation_enabled && analysis.activation_type && analysis.activation_price) {
      const statusEmoji = analysis.activation_status === 'active' ? '✅' : '⚡'
      let activationText = ''

      if (options.language === 'ar') {
        activationText = `${statusEmoji} *${t.activationCondition}:* ${t.activationMustBe} ${formatActivationType(analysis.activation_type, options.language)} ${formatPrice(analysis.activation_price)}`
      } else {
        activationText = `${statusEmoji} *${t.activationCondition}:* ${t.activationMustBe} ${formatActivationType(analysis.activation_type, options.language)} ${formatPrice(analysis.activation_price)}`
      }

      if (analysis.activation_timeframe && analysis.activation_timeframe !== 'INTRABAR') {
        const timeframeMap: Record<string, { en: string; ar: string }> = {
          '1H_CLOSE': { en: '1H Close', ar: 'إغلاق ساعة' },
          '4H_CLOSE': { en: '4H Close', ar: 'إغلاق 4 ساعات' },
          'DAILY_CLOSE': { en: 'Daily Close', ar: 'إغلاق يومي' },
        }
        const timeframeText = timeframeMap[analysis.activation_timeframe]?.[options.language] || analysis.activation_timeframe
        activationText += ` (${timeframeText})`
      }

      message += `${activationText}\n\n`
    }

    if (analysis.stop_loss !== undefined) {
      message += `🛑 *${t.stopLoss}:* ${formatPrice(analysis.stop_loss)}\n\n`
    }

    if (analysis.analysis_targets && analysis.analysis_targets.length > 0) {
      message += `🎯 *${t.targets}:*\n`
      const sortedTargets = [...analysis.analysis_targets].sort((a, b) =>
        analysis.direction === 'Short' ? b.price - a.price : a.price - b.price
      )

      sortedTargets.forEach((target, index) => {
        message += `   ${t.target}${index + 1}: ${formatPrice(target.price)}\n`
      })
      message += `\n`
    }

    if (analysis.description && analysis.description.trim()) {
      message += `📝 *${t.description}:*\n${escapeMarkdown(analysis.description)}\n\n`
    }
  } else if (postType === 'news') {
    if (analysis.summary) {
      message += `${escapeMarkdown(analysis.summary)}\n\n`
    }

    if (analysis.source_url) {
      message += `🔗 [${t.source}](${analysis.source_url})\n\n`
    }
  } else if (postType === 'article') {
    if (analysis.content) {
      const contentPreview = analysis.content.length > 300
        ? analysis.content.substring(0, 300) + '...'
        : analysis.content
      message += `${escapeMarkdown(contentPreview)}\n\n`
    }
  }

  if (options.includeLink && options.baseUrl) {
    const link = `${options.baseUrl}/share/${analysis.id}?lang=${options.language}`
    message += `[${t.viewFull}](${link})\n\n`
  }

  message += `━━━━━━━━━━━━━━━━\n`
  message += `${t.poweredBy}\n`
  message += `${t.platform}`

  return message
}

export function formatAnalysisMessages(
  analysis: Analysis,
  language: 'en' | 'ar' | 'both',
  options: Partial<FormatOptions> = {}
): { en?: string; ar?: string } {
  const baseOptions: Partial<FormatOptions> = {
    includeLink: true,
    ...options,
  }

  const messages: { en?: string; ar?: string } = {}

  if (language === 'en' || language === 'both') {
    messages.en = formatAnalysisMessage(analysis, {
      ...baseOptions,
      language: 'en',
    } as FormatOptions)
  }

  if (language === 'ar' || language === 'both') {
    messages.ar = formatAnalysisMessage(analysis, {
      ...baseOptions,
      language: 'ar',
    } as FormatOptions)
  }

  return messages
}
