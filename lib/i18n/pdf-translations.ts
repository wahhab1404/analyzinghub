/**
 * PDF Report Translations
 * Professional Arabic and English translations for daily trading reports
 */

export interface PDFTranslations {
  title: string
  datePrefix: string
  summaryTitle: string
  totalTrades: string
  activeTrades: string
  closedTrades: string
  expiredTrades: string
  avgProfit: string
  maxProfit: string
  winRate: string
  todaysTrades: string
  symbol: string
  direction: string
  contract: string
  entryPrice: string
  currentPrice: string
  maxPrice: string
  profit: string
  maxProfitLabel: string
  status: string
  time: string
  long: string
  short: string
  call: string
  put: string
  active: string
  closed: string
  expired: string
  strikePrice: string
  highestPrice: string
  currentPriceShort: string
  outcome: string
  win: string
  loss: string
  noTrades: string
  noTradesTitle: string
  noTradesDescription: string
  footer: {
    platform: string
    generatedOn: string
    copyright: string
    note: string
  }
  telegram: {
    title: string
    datePrefix: string
    performanceSummary: string
    profitMetrics: string
    totalTradesLabel: string
    activeLabel: string
    closedLabel: string
    expiredLabel: string
    avgProfitLabel: string
    maxProfitLabel: string
    winRateLabel: string
    fullReportAttached: string
    fileCaption: string
  }
}

export const pdfTranslations: Record<'en' | 'ar', PDFTranslations> = {
  en: {
    title: 'Daily Trading Report',
    datePrefix: '',
    summaryTitle: 'Performance Summary',
    totalTrades: 'Total Trades',
    activeTrades: 'Active Trades',
    closedTrades: 'Closed Trades',
    expiredTrades: 'Expired Trades',
    avgProfit: 'Avg Profit',
    maxProfit: 'Max Profit',
    winRate: 'Win Rate',
    todaysTrades: "Today's Trades",
    symbol: 'Symbol',
    direction: 'Direction',
    contract: 'Contract',
    entryPrice: 'Entry',
    currentPrice: 'Current',
    maxPrice: 'Max Price',
    profit: 'Profit',
    maxProfitLabel: 'Max Profit',
    status: 'Status',
    time: 'Time',
    long: 'LONG',
    short: 'SHORT',
    call: 'CALL',
    put: 'PUT',
    active: 'ACTIVE',
    closed: 'CLOSED',
    expired: 'EXPIRED',
    strikePrice: 'Strike Price',
    highestPrice: 'Highest Price',
    currentPriceShort: 'Current Price',
    outcome: 'Outcome',
    win: 'WIN',
    loss: 'LOSS',
    noTrades: 'No Trades Today',
    noTradesTitle: 'No Trades Today',
    noTradesDescription: 'There were no trades recorded for today.',
    footer: {
      platform: 'AnalyZHub - Professional Trading Analysis Platform',
      generatedOn: 'Generated on',
      copyright: 'All Rights Reserved',
      note: 'This report is for informational purposes only and does not constitute financial advice.'
    },
    telegram: {
      title: 'Daily Trading Report',
      datePrefix: '',
      performanceSummary: 'Performance Summary',
      profitMetrics: 'Profit Metrics',
      totalTradesLabel: 'Total Trades',
      activeLabel: 'Active',
      closedLabel: 'Closed',
      expiredLabel: 'Expired',
      avgProfitLabel: 'Avg Profit',
      maxProfitLabel: 'Max Profit',
      winRateLabel: 'Win Rate',
      fullReportAttached: 'Full detailed report attached below',
      fileCaption: 'Daily Trading Report'
    }
  },
  ar: {
    title: 'التقرير اليومي للتداول',
    datePrefix: '',
    summaryTitle: 'ملخص الأداء',
    totalTrades: 'إجمالي الصفقات',
    activeTrades: 'الصفقات النشطة',
    closedTrades: 'الصفقات المغلقة',
    expiredTrades: 'الصفقات المنتهية',
    avgProfit: 'متوسط الربح',
    maxProfit: 'أعلى ربح',
    winRate: 'معدل النجاح',
    todaysTrades: 'صفقات اليوم',
    symbol: 'الرمز',
    direction: 'الاتجاه',
    contract: 'العقد',
    entryPrice: 'سعر الدخول',
    currentPrice: 'السعر الحالي',
    maxPrice: 'أعلى سعر',
    profit: 'الربح',
    maxProfitLabel: 'أعلى ربح',
    status: 'الحالة',
    time: 'الوقت',
    long: 'شراء',
    short: 'بيع',
    call: 'شراء',
    put: 'بيع',
    active: 'نشط',
    closed: 'مغلق',
    expired: 'منتهي',
    strikePrice: 'سعر التنفيذ',
    highestPrice: 'أعلى سعر',
    currentPriceShort: 'السعر الحالي',
    outcome: 'النتيجة',
    win: 'ربح',
    loss: 'خسارة',
    noTrades: 'لا توجد صفقات اليوم',
    noTradesTitle: 'لا توجد صفقات اليوم',
    noTradesDescription: 'لم يتم تسجيل أي صفقات لهذا اليوم.',
    footer: {
      platform: 'AnalyZHub - منصة احترافية لتحليل التداول',
      generatedOn: 'تم الإنشاء في',
      copyright: 'جميع الحقوق محفوظة',
      note: 'هذا التقرير للأغراض الإعلامية فقط ولا يشكل نصيحة مالية.'
    },
    telegram: {
      title: 'التقرير اليومي للتداول',
      datePrefix: '',
      performanceSummary: 'ملخص الأداء',
      profitMetrics: 'مؤشرات الربح',
      totalTradesLabel: 'إجمالي الصفقات',
      activeLabel: 'نشط',
      closedLabel: 'مغلق',
      expiredLabel: 'منتهي',
      avgProfitLabel: 'متوسط الربح',
      maxProfitLabel: 'أعلى ربح',
      winRateLabel: 'معدل النجاح',
      fullReportAttached: 'التقرير التفصيلي الكامل مرفق أدناه',
      fileCaption: 'التقرير اليومي للتداول'
    }
  }
}

export function getPDFTranslations(language: 'en' | 'ar' = 'en'): PDFTranslations {
  return pdfTranslations[language] || pdfTranslations.en
}

// Helper function to format date in the appropriate language
export function formatDateForPDF(date: Date, language: 'en' | 'ar' = 'en'): string {
  if (language === 'ar') {
    return date.toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Helper function to get RTL direction attribute
export function getDirectionAttr(language: 'en' | 'ar' = 'en'): string {
  return language === 'ar' ? 'rtl' : 'ltr'
}

// Helper function to get the appropriate font family
export function getFontFamily(language: 'en' | 'ar' = 'en'): string {
  if (language === 'ar') {
    return "'Cairo', 'Segoe UI', Tahoma, sans-serif"
  }
  return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
}
