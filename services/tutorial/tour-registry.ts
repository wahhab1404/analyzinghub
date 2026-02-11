import { Tour } from './types';

export const tours: Tour[] = [
  {
    id: 'create_analysis',
    name: 'Create Your First Analysis',
    nameAr: 'إنشاء أول تحليل لك',
    description: 'Interactive walkthrough of creating a stock analysis',
    descriptionAr: 'جولة تفاعلية لإنشاء تحليل للأسهم',
    capabilitiesRequired: ['canCreateAnalysis'],
    estimatedMinutes: 5,
    steps: [
      {
        route: '/dashboard/create-analysis',
        selector: '#symbol-search',
        title: 'Search for a Symbol',
        titleAr: 'ابحث عن رمز',
        content: 'Start by searching for the stock symbol you want to analyze. Type the symbol or company name.',
        contentAr: 'ابدأ بالبحث عن رمز السهم الذي تريد تحليله. اكتب الرمز أو اسم الشركة.',
        placement: 'bottom',
        waitForSelector: true
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#analysis-type',
        title: 'Choose Analysis Type',
        titleAr: 'اختر نوع التحليل',
        content: 'Select whether this is Technical, Fundamental, or Mixed analysis.',
        contentAr: 'حدد ما إذا كان هذا تحليلاً فنياً أو أساسياً أو مختلطاً.',
        placement: 'right'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#entry-price',
        title: 'Set Entry Price',
        titleAr: 'حدد سعر الدخول',
        content: 'Enter your recommended entry price for this trade.',
        contentAr: 'أدخل سعر الدخول الموصى به لهذه الصفقة.',
        placement: 'right'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#target-prices',
        title: 'Add Target Prices',
        titleAr: 'أضف أسعار الهدف',
        content: 'Set your target price levels. You can add multiple targets for partial profit taking.',
        contentAr: 'حدد مستويات أسعار الهدف. يمكنك إضافة أهداف متعددة لجني الأرباح الجزئية.',
        placement: 'left'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#stop-loss',
        title: 'Set Stop Loss',
        titleAr: 'حدد وقف الخسارة',
        content: 'Always set a stop loss level to manage risk effectively.',
        contentAr: 'حدد دائماً مستوى وقف الخسارة لإدارة المخاطر بفعالية.',
        placement: 'right'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#analysis-content',
        title: 'Write Your Analysis',
        titleAr: 'اكتب تحليلك',
        content: 'Provide detailed analysis explaining your reasoning, key levels, and market outlook.',
        contentAr: 'قدم تحليلاً مفصلاً يشرح منطقك والمستويات الرئيسية وتوقعات السوق.',
        placement: 'top'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#chart-upload',
        title: 'Upload Chart Image',
        titleAr: 'تحميل صورة الرسم البياني',
        content: 'Add a chart image with marked levels to support your analysis visually.',
        contentAr: 'أضف صورة رسم بياني مع مستويات محددة لدعم تحليلك بصرياً.',
        placement: 'bottom'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#plan-selection',
        title: 'Select Access Plans',
        titleAr: 'اختر خطط الوصول',
        content: 'Choose which subscription plans can access this analysis.',
        contentAr: 'اختر خطط الاشتراك التي يمكنها الوصول إلى هذا التحليل.',
        placement: 'left'
      },
      {
        route: '/dashboard/create-analysis',
        selector: '#publish-button',
        title: 'Publish Analysis',
        titleAr: 'نشر التحليل',
        content: 'Review everything and click Publish to share with your subscribers!',
        contentAr: 'راجع كل شيء وانقر على نشر لمشاركته مع مشتركيك!',
        placement: 'top',
        spotlightClicks: true
      }
    ]
  },
  {
    id: 'indices_trading',
    name: 'Indices Trading Walkthrough',
    nameAr: 'جولة تداول المؤشرات',
    description: 'Learn to use the professional indices trading system',
    descriptionAr: 'تعلم استخدام نظام تداول المؤشرات الاحترافي',
    capabilitiesRequired: ['canAccessIndicesHub'],
    estimatedMinutes: 7,
    steps: [
      {
        route: '/dashboard/indices',
        selector: '#create-index-analysis',
        title: 'Create Index Analysis',
        titleAr: 'إنشاء تحليل المؤشر',
        content: 'Start by creating an analysis for an index like SPX.',
        contentAr: 'ابدأ بإنشاء تحليل لمؤشر مثل SPX.',
        placement: 'bottom',
        spotlightClicks: true
      },
      {
        route: '/dashboard/indices/create',
        selector: '#index-symbol',
        title: 'Select Index',
        titleAr: 'اختر المؤشر',
        content: 'Choose the index you want to trade (SPX, NDX, etc.).',
        contentAr: 'اختر المؤشر الذي تريد تداوله (SPX، NDX، إلخ).',
        placement: 'bottom'
      },
      {
        route: '/dashboard/indices/create',
        selector: '#market-outlook',
        title: 'Market Outlook',
        titleAr: 'توقعات السوق',
        content: 'Describe your market outlook and setup for this trade.',
        contentAr: 'صف توقعاتك للسوق وإعداد هذه الصفقة.',
        placement: 'right'
      },
      {
        route: '/dashboard/indices',
        selector: '#add-trade-button',
        title: 'Add Options Trade',
        titleAr: 'إضافة صفقة خيارات',
        content: 'Add a specific options trade to this analysis.',
        contentAr: 'أضف صفقة خيارات محددة إلى هذا التحليل.',
        placement: 'left',
        spotlightClicks: true
      },
      {
        route: '/dashboard/indices',
        selector: '#contract-type',
        title: 'Select Contract Type',
        titleAr: 'اختر نوع العقد',
        content: 'Choose Call for bullish or Put for bearish trades.',
        contentAr: 'اختر Call للصفقات الصعودية أو Put للصفقات الهبوطية.',
        placement: 'right'
      },
      {
        route: '/dashboard/indices',
        selector: '#strike-price',
        title: 'Strike Price',
        titleAr: 'سعر التنفيذ',
        content: 'Enter the strike price for your options contract.',
        contentAr: 'أدخل سعر التنفيذ لعقد خياراتك.',
        placement: 'right'
      },
      {
        route: '/dashboard/indices',
        selector: '#expiration-date',
        title: 'Expiration Date',
        titleAr: 'تاريخ الانتهاء',
        content: 'Select the expiration date for the contract.',
        contentAr: 'حدد تاريخ انتهاء العقد.',
        placement: 'left'
      },
      {
        route: '/dashboard/indices',
        selector: '#trade-list',
        title: 'Real-Time Tracking',
        titleAr: 'التتبع في الوقت الفعلي',
        content: 'Your trades are tracked in real-time here. Green = profit, Red = loss.',
        contentAr: 'يتم تتبع صفقاتك في الوقت الفعلي هنا. الأخضر = ربح، الأحمر = خسارة.',
        placement: 'top'
      }
    ]
  },
  {
    id: 'telegram_setup',
    name: 'Connect Telegram',
    nameAr: 'ربط Telegram',
    description: 'Set up Telegram integration for auto-broadcasting',
    descriptionAr: 'إعداد تكامل Telegram للنشر التلقائي',
    capabilitiesRequired: ['canConnectTelegram'],
    estimatedMinutes: 4,
    steps: [
      {
        route: '/dashboard/settings',
        selector: '#telegram-settings-tab',
        title: 'Open Telegram Settings',
        titleAr: 'افتح إعدادات Telegram',
        content: 'Navigate to the Telegram settings section.',
        contentAr: 'انتقل إلى قسم إعدادات Telegram.',
        placement: 'right',
        spotlightClicks: true
      },
      {
        route: '/dashboard/settings',
        selector: '#bot-token-input',
        title: 'Enter Bot Token',
        titleAr: 'أدخل رمز البوت',
        content: 'Get your bot token from @BotFather on Telegram and paste it here.',
        contentAr: 'احصل على رمز البوت من @BotFather على Telegram والصقه هنا.',
        placement: 'bottom'
      },
      {
        route: '/dashboard/settings',
        selector: '#save-bot-token',
        title: 'Save Token',
        titleAr: 'احفظ الرمز',
        content: 'Click save to connect your bot to AnalyzingHub.',
        contentAr: 'انقر على حفظ لربط البوت بـ AnalyzingHub.',
        placement: 'left',
        spotlightClicks: true
      },
      {
        route: '/dashboard/settings',
        selector: '#add-channel-button',
        title: 'Add Channel',
        titleAr: 'أضف قناة',
        content: 'Now add your Telegram channel by providing its ID and name.',
        contentAr: 'الآن أضف قناة Telegram الخاصة بك بتوفير معرفها واسمها.',
        placement: 'bottom',
        spotlightClicks: true
      },
      {
        route: '/dashboard/settings',
        selector: '#channel-id-input',
        title: 'Channel ID',
        titleAr: 'معرف القناة',
        content: 'Enter your Telegram channel ID (starts with -100).',
        contentAr: 'أدخل معرف قناة Telegram (يبدأ بـ -100).',
        placement: 'right'
      },
      {
        route: '/dashboard/settings',
        selector: '#verify-channel',
        title: 'Verify Channel',
        titleAr: 'تحقق من القناة',
        content: 'Verify that your bot has admin access to the channel.',
        contentAr: 'تحقق من أن البوت لديه وصول مسؤول إلى القناة.',
        placement: 'left'
      }
    ]
  }
];

export function getTour(tourId: string): Tour | undefined {
  return tours.find(tour => tour.id === tourId);
}

export function getToursByCapabilities(
  capabilities: Record<string, boolean>
): Tour[] {
  return tours.filter(tour =>
    tour.capabilitiesRequired.every(cap => capabilities[cap])
  );
}
