import { TutorialSection } from './types';

export const tutorialSections: TutorialSection[] = [
  {
    id: 'getting_started',
    title: 'Getting Started with AnalyzingHub',
    titleAr: 'البدء مع AnalyzingHub',
    description: 'Learn the basics of navigating and using the platform effectively.',
    descriptionAr: 'تعلم أساسيات التنقل واستخدام المنصة بفعالية.',
    icon: 'Rocket',
    capabilitiesRequired: ['canViewPublicAnalyses'],
    estimatedMinutes: 5,
    steps: [
      {
        title: 'Welcome to AnalyzingHub',
        titleAr: 'مرحباً بك في AnalyzingHub',
        content: 'AnalyzingHub is a professional platform for sharing and tracking stock market analyses. Whether you\'re an analyst sharing your insights or a subscriber following top performers, this guide will help you get started.',
        contentAr: 'AnalyzingHub هي منصة احترافية لمشاركة وتتبع تحليلات سوق الأسهم. سواء كنت محللاً تشارك رؤاك أو مشتركاً يتابع أفضل المحللين، سيساعدك هذا الدليل على البدء.',
        tips: [
          'Explore the dashboard to familiarize yourself with the layout',
          'Check out the Rankings page to see top-performing analysts',
          'Use the search feature to find specific stocks or analysts'
        ],
        tipsAr: [
          'استكشف لوحة التحكم للتعرف على التخطيط',
          'تحقق من صفحة التصنيفات لرؤية أفضل المحللين',
          'استخدم ميزة البحث للعثور على أسهم أو محللين معينين'
        ]
      },
      {
        title: 'Understanding Your Dashboard',
        titleAr: 'فهم لوحة التحكم الخاصة بك',
        content: 'Your dashboard is your central hub. Here you can view your feed, manage subscriptions, track your performance (for analysts), and access all platform features through the sidebar navigation.',
        contentAr: 'لوحة التحكم هي مركزك الرئيسي. هنا يمكنك عرض موجزك وإدارة اشتراكاتك وتتبع أدائك (للمحللين) والوصول إلى جميع ميزات المنصة من خلال شريط التنقل الجانبي.',
        deepLink: '/dashboard',
        tips: [
          'The sidebar provides quick access to all major features',
          'Your profile icon in the top right opens user settings',
          'Notifications bell shows important updates'
        ],
        tipsAr: [
          'يوفر الشريط الجانبي وصولاً سريعاً إلى جميع الميزات الرئيسية',
          'أيقونة ملفك الشخصي في الأعلى اليمين تفتح إعدادات المستخدم',
          'جرس الإشعارات يعرض التحديثات المهمة'
        ]
      }
    ]
  },
  {
    id: 'create_analysis',
    title: 'Creating Your First Analysis',
    titleAr: 'إنشاء أول تحليل لك',
    description: 'Step-by-step guide to creating and publishing stock analyses.',
    descriptionAr: 'دليل خطوة بخطوة لإنشاء ونشر تحليلات الأسهم.',
    icon: 'FileText',
    capabilitiesRequired: ['canCreateAnalysis'],
    estimatedMinutes: 10,
    relatedTourId: 'create_analysis',
    steps: [
      {
        title: 'Navigate to Create Analysis',
        titleAr: 'انتقل إلى إنشاء تحليل',
        content: 'Click on "Create Analysis" in the sidebar, or use the "+ New Analysis" button on your dashboard. This will open the analysis creation form.',
        contentAr: 'انقر على "إنشاء تحليل" في الشريط الجانبي، أو استخدم زر "+ تحليل جديد" على لوحة التحكم. سيؤدي هذا إلى فتح نموذج إنشاء التحليل.',
        deepLink: '/dashboard/create-analysis',
        tips: [
          'Make sure you have your analysis prepared before starting',
          'Have your chart image ready to upload',
          'Know your target prices and stop loss in advance'
        ],
        tipsAr: [
          'تأكد من تحضير تحليلك قبل البدء',
          'جهز صورة الرسم البياني للتحميل',
          'اعرف أسعار الهدف ووقف الخسارة مسبقاً'
        ]
      },
      {
        title: 'Select Symbol and Analysis Type',
        titleAr: 'اختر الرمز ونوع التحليل',
        content: 'Start by selecting the stock symbol you want to analyze. Use the search box to find it quickly. Then choose your analysis type (Technical, Fundamental, or Mixed) and timeframe.',
        contentAr: 'ابدأ باختيار رمز السهم الذي تريد تحليله. استخدم مربع البحث للعثور عليه بسرعة. ثم اختر نوع تحليلك (فني أو أساسي أو مختلط) والإطار الزمني.',
        tips: [
          'The symbol search shows current price and basic info',
          'Technical analysis is most common for short-term trades',
          'Choose timeframe that matches your analysis strategy'
        ],
        tipsAr: [
          'يظهر بحث الرمز السعر الحالي والمعلومات الأساسية',
          'التحليل الفني هو الأكثر شيوعاً للصفقات قصيرة الأجل',
          'اختر إطاراً زمنياً يتوافق مع استراتيجية تحليلك'
        ],
        commonMistakes: [
          'Forgetting to verify the correct symbol',
          'Choosing wrong timeframe for analysis type'
        ],
        commonMistakesAr: [
          'نسيان التحقق من الرمز الصحيح',
          'اختيار إطار زمني خاطئ لنوع التحليل'
        ]
      },
      {
        title: 'Set Entry, Targets, and Stop Loss',
        titleAr: 'حدد الدخول والأهداف ووقف الخسارة',
        content: 'Define your entry price, target prices (you can add multiple targets), and stop loss level. These are critical for tracking analysis performance and building your reputation.',
        contentAr: 'حدد سعر الدخول وأسعار الهدف (يمكنك إضافة أهداف متعددة) ومستوى وقف الخسارة. هذه أمور حاسمة لتتبع أداء التحليل وبناء سمعتك.',
        tips: [
          'Be realistic with your targets based on technical levels',
          'Always set a stop loss to manage risk',
          'Multiple targets allow partial profit taking',
          'The system automatically tracks if targets are hit'
        ],
        tipsAr: [
          'كن واقعياً مع أهدافك بناءً على المستويات الفنية',
          'حدد دائماً وقف خسارة لإدارة المخاطر',
          'تسمح الأهداف المتعددة بجني الأرباح الجزئية',
          'يتتبع النظام تلقائياً ما إذا تم الوصول إلى الأهداف'
        ],
        commonMistakes: [
          'Setting unrealistic targets too far from entry',
          'Not setting a stop loss',
          'Stop loss too tight causing premature exits'
        ],
        commonMistakesAr: [
          'تحديد أهداف غير واقعية بعيدة جداً عن الدخول',
          'عدم تحديد وقف خسارة',
          'وقف خسارة ضيق جداً يسبب خروجاً مبكراً'
        ]
      },
      {
        title: 'Write Your Analysis',
        titleAr: 'اكتب تحليلك',
        content: 'Provide a clear, detailed explanation of your analysis. Include key technical levels, chart patterns, fundamental factors, or news catalysts. Your analysis quality directly impacts your reputation.',
        contentAr: 'قدم شرحاً واضحاً ومفصلاً لتحليلك. قم بتضمين المستويات الفنية الرئيسية وأنماط الرسوم البيانية والعوامل الأساسية أو محفزات الأخبار. جودة تحليلك تؤثر بشكل مباشر على سمعتك.',
        tips: [
          'Use clear, professional language',
          'Explain your reasoning, not just predictions',
          'Mention key support/resistance levels',
          'Include risk factors and considerations',
          'Support analysis with chart images'
        ],
        tipsAr: [
          'استخدم لغة واضحة واحترافية',
          'اشرح منطقك، وليس مجرد توقعات',
          'اذكر مستويات الدعم والمقاومة الرئيسية',
          'قم بتضمين عوامل المخاطر والاعتبارات',
          'ادعم التحليل بصور الرسوم البيانية'
        ]
      },
      {
        title: 'Upload Chart Image',
        titleAr: 'تحميل صورة الرسم البياني',
        content: 'Add a clear chart image that supports your analysis. Mark important levels, patterns, and indicators. Visual context helps subscribers understand your reasoning.',
        contentAr: 'أضف صورة رسم بياني واضحة تدعم تحليلك. حدد المستويات والأنماط والمؤشرات المهمة. السياق البصري يساعد المشتركين على فهم منطقك.',
        tips: [
          'Use high-quality, clear screenshots',
          'Mark key levels with lines or annotations',
          'Include relevant timeframe in the chart',
          'Consider using multiple charts for clarity'
        ],
        tipsAr: [
          'استخدم لقطات شاشة عالية الجودة وواضحة',
          'حدد المستويات الرئيسية بخطوط أو تعليقات توضيحية',
          'قم بتضمين الإطار الزمني ذي الصلة في الرسم البياني',
          'فكر في استخدام رسوم بيانية متعددة للوضوح'
        ]
      },
      {
        title: 'Select Plans and Publish',
        titleAr: 'اختر الخطط وانشر',
        content: 'Choose which subscription plans can access this analysis. You can make it public for all, or restrict to specific premium tiers. Review everything, then click Publish to share with your audience.',
        contentAr: 'اختر خطط الاشتراك التي يمكنها الوصول إلى هذا التحليل. يمكنك جعله عاماً للجميع، أو تقييده لمستويات مميزة محددة. راجع كل شيء، ثم انقر على نشر لمشاركته مع جمهورك.',
        deepLink: '/dashboard/feed',
        tips: [
          'Free analyses help build your initial audience',
          'Premium analyses provide value for paid subscribers',
          'You can edit or update analyses after publishing',
          'Analyses are automatically tracked for performance'
        ],
        tipsAr: [
          'التحليلات المجانية تساعد في بناء جمهورك الأولي',
          'التحليلات المميزة توفر قيمة للمشتركين المدفوعين',
          'يمكنك تعديل أو تحديث التحليلات بعد النشر',
          'يتم تتبع التحليلات تلقائياً للأداء'
        ]
      }
    ]
  },
  {
    id: 'indices_trading',
    title: 'Indices Trading System',
    titleAr: 'نظام تداول المؤشرات',
    description: 'Master the professional indices trading hub for SPX and other index options.',
    descriptionAr: 'إتقان مركز تداول المؤشرات الاحترافي لخيارات SPX والمؤشرات الأخرى.',
    icon: 'TrendingUp',
    capabilitiesRequired: ['canAccessIndicesHub'],
    estimatedMinutes: 15,
    relatedTourId: 'indices_trading',
    steps: [
      {
        title: 'Introduction to Indices Hub',
        titleAr: 'مقدمة لمركز المؤشرات',
        content: 'The Indices Hub is a professional system for trading index options like SPX. It provides real-time tracking, automated trade management, profit/loss calculation, and Telegram integration.',
        contentAr: 'مركز المؤشرات هو نظام احترافي لتداول خيارات المؤشرات مثل SPX. يوفر تتبعاً في الوقت الفعلي وإدارة تجارة تلقائية وحساب الربح/الخسارة وتكامل Telegram.',
        deepLink: '/dashboard/indices',
        tips: [
          'This is designed for experienced options traders',
          'All trades are tracked in real-time during market hours',
          'Reports are generated automatically'
        ],
        tipsAr: [
          'مصمم للمتداولين ذوي الخبرة في الخيارات',
          'يتم تتبع جميع الصفقات في الوقت الفعلي خلال ساعات السوق',
          'يتم إنشاء التقارير تلقائياً'
        ]
      },
      {
        title: 'Creating an Index Analysis',
        titleAr: 'إنشاء تحليل المؤشر',
        content: 'Start by creating an analysis for an index (e.g., SPX). Provide your market outlook, key levels, and setup details. This creates the framework for your trades.',
        contentAr: 'ابدأ بإنشاء تحليل لمؤشر (مثل SPX). قدم توقعاتك للسوق والمستويات الرئيسية وتفاصيل الإعداد. هذا ينشئ إطار عمل لصفقاتك.',
        tips: [
          'Be clear about your market direction (bullish/bearish)',
          'Mention key support/resistance levels',
          'State your trading plan and strategy'
        ],
        tipsAr: [
          'كن واضحاً بشأن اتجاه السوق (صعودي/هبوطي)',
          'اذكر مستويات الدعم والمقاومة الرئيسية',
          'اذكر خطة وإستراتيجية التداول الخاصة بك'
        ]
      },
      {
        title: 'Adding Options Trades',
        titleAr: 'إضافة صفقات الخيارات',
        content: 'Within your analysis, add specific options trades. Select contract type (Call/Put), strike price, expiration date, and entry price. The system will track the contract in real-time.',
        contentAr: 'ضمن تحليلك، أضف صفقات خيارات محددة. حدد نوع العقد (Call/Put) وسعر التنفيذ وتاريخ الانتهاء وسعر الدخول. سيتتبع النظام العقد في الوقت الفعلي.',
        tips: [
          'Use Polygon.io integration for real-time pricing',
          'Set realistic targets based on market conditions',
          'System auto-calculates profit/loss',
          'You can add multiple trades to one analysis'
        ],
        tipsAr: [
          'استخدم تكامل Polygon.io للتسعير في الوقت الفعلي',
          'حدد أهداف واقعية بناءً على ظروف السوق',
          'يحسب النظام الربح/الخسارة تلقائياً',
          'يمكنك إضافة صفقات متعددة إلى تحليل واحد'
        ]
      },
      {
        title: 'Real-Time Trade Tracking',
        titleAr: 'تتبع الصفقات في الوقت الفعلي',
        content: 'Once a trade is active, the system automatically tracks its performance during market hours. You\'ll see current price, profit/loss, and alerts when targets are hit.',
        contentAr: 'بمجرد تفعيل صفقة، يتتبع النظام أداءها تلقائياً خلال ساعات السوق. سترى السعر الحالي والربح/الخسارة والتنبيهات عند الوصول إلى الأهداف.',
        tips: [
          'Green indicates profitable trades',
          'Red indicates losing trades',
          'System sends Telegram alerts for key events',
          'Trades are tracked until expiration or manual close'
        ],
        tipsAr: [
          'الأخضر يشير إلى الصفقات الرابحة',
          'الأحمر يشير إلى الصفقات الخاسرة',
          'يرسل النظام تنبيهات Telegram للأحداث الرئيسية',
          'يتم تتبع الصفقات حتى الانتهاء أو الإغلاق اليدوي'
        ]
      },
      {
        title: 'Generating Reports',
        titleAr: 'إنشاء التقارير',
        content: 'Access the Reports tab to generate daily, weekly, or custom period reports. Reports show all trades, win rate, profit/loss, and performance metrics. You can send reports to Telegram channels.',
        contentAr: 'ادخل إلى تبويب التقارير لإنشاء تقارير يومية أو أسبوعية أو فترات مخصصة. تعرض التقارير جميع الصفقات ومعدل الربح والربح/الخسارة ومقاييس الأداء. يمكنك إرسال التقارير إلى قنوات Telegram.',
        deepLink: '/dashboard/reports',
        tips: [
          'Reports are generated with professional formatting',
          'Include performance statistics and charts',
          'Can be shared directly to Telegram',
          'Use for subscriber transparency'
        ],
        tipsAr: [
          'يتم إنشاء التقارير بتنسيق احترافي',
          'تتضمن إحصاءات الأداء والرسوم البيانية',
          'يمكن مشاركتها مباشرة على Telegram',
          'استخدمها لشفافية المشتركين'
        ]
      }
    ]
  },
  {
    id: 'telegram_integration',
    title: 'Telegram Integration',
    titleAr: 'تكامل Telegram',
    description: 'Connect your Telegram channels and automate analysis broadcasting.',
    descriptionAr: 'اربط قنوات Telegram الخاصة بك وأتمت نشر التحليلات.',
    icon: 'Send',
    capabilitiesRequired: ['canConnectTelegram'],
    estimatedMinutes: 8,
    relatedTourId: 'telegram_setup',
    steps: [
      {
        title: 'Why Connect Telegram',
        titleAr: 'لماذا ربط Telegram',
        content: 'Telegram integration allows you to automatically broadcast analyses to your channel subscribers. It builds your audience and keeps them updated in real-time.',
        contentAr: 'يتيح لك تكامل Telegram نشر التحليلات تلقائياً لمشتركي قناتك. يبني جمهورك ويبقيهم محدثين في الوقت الفعلي.',
        tips: [
          'Increases your reach and engagement',
          'Automated posting saves time',
          'Professional formatting with charts',
          'Separate channels for different audience tiers'
        ],
        tipsAr: [
          'يزيد من وصولك ومشاركتك',
          'النشر التلقائي يوفر الوقت',
          'تنسيق احترافي مع الرسوم البيانية',
          'قنوات منفصلة لمستويات جمهور مختلفة'
        ]
      },
      {
        title: 'Setting Up Your Bot Token',
        titleAr: 'إعداد رمز البوت الخاص بك',
        content: 'First, create a Telegram bot using @BotFather. Get your bot token and enter it in Settings > Telegram Settings. This connects AnalyzingHub to your bot.',
        contentAr: 'أولاً، أنشئ بوت Telegram باستخدام @BotFather. احصل على رمز البوت الخاص بك وأدخله في الإعدادات > إعدادات Telegram. هذا يربط AnalyzingHub ببوتك.',
        deepLink: '/dashboard/settings',
        tips: [
          'Keep your bot token secure and private',
          'Never share your token publicly',
          'You can regenerate the token if compromised'
        ],
        tipsAr: [
          'حافظ على رمز البوت آمناً وخاصاً',
          'لا تشارك الرمز علناً أبداً',
          'يمكنك إعادة إنشاء الرمز إذا تم اختراقه'
        ],
        commonMistakes: [
          'Using incorrect bot token format',
          'Not making bot an admin in channel'
        ],
        commonMistakesAr: [
          'استخدام تنسيق رمز بوت غير صحيح',
          'عدم جعل البوت مسؤولاً في القناة'
        ]
      },
      {
        title: 'Adding Telegram Channels',
        titleAr: 'إضافة قنوات Telegram',
        content: 'Add your Telegram channels by providing the Channel ID and name. Make sure to add your bot as an administrator in the channel with post permissions.',
        contentAr: 'أضف قنوات Telegram الخاصة بك من خلال توفير معرف القناة والاسم. تأكد من إضافة البوت كمسؤول في القناة مع أذونات النشر.',
        tips: [
          'Get Channel ID by forwarding a message to @userinfobot',
          'Channel ID usually starts with -100',
          'Bot needs admin rights to post messages',
          'You can add multiple channels for different tiers'
        ],
        tipsAr: [
          'احصل على معرف القناة بإعادة توجيه رسالة إلى @userinfobot',
          'معرف القناة عادة يبدأ بـ -100',
          'يحتاج البوت إلى حقوق المسؤول لنشر الرسائل',
          'يمكنك إضافة قنوات متعددة لمستويات مختلفة'
        ]
      },
      {
        title: 'Auto-Broadcasting Analyses',
        titleAr: 'نشر التحليلات تلقائياً',
        content: 'When creating an analysis, you can choose to auto-broadcast it to specific Telegram channels. The system formats your analysis professionally and posts it automatically.',
        contentAr: 'عند إنشاء تحليل، يمكنك اختيار نشره تلقائياً إلى قنوات Telegram محددة. ينسق النظام تحليلك بشكل احترافي وينشره تلقائياً.',
        tips: [
          'Select channels based on subscription tiers',
          'Analyses include charts and all key information',
          'Messages are formatted in Arabic or English',
          'You can resend to channel from analysis page'
        ],
        tipsAr: [
          'حدد القنوات بناءً على مستويات الاشتراك',
          'تتضمن التحليلات الرسوم البيانية وجميع المعلومات الرئيسية',
          'يتم تنسيق الرسائل بالعربية أو الإنجليزية',
          'يمكنك إعادة الإرسال إلى القناة من صفحة التحليل'
        ]
      }
    ]
  },
  {
    id: 'subscription_plans',
    title: 'Creating Subscription Plans',
    titleAr: 'إنشاء خطط الاشتراك',
    description: 'Set up and manage subscription tiers for your followers.',
    descriptionAr: 'إعداد وإدارة مستويات الاشتراك لمتابعيك.',
    icon: 'CreditCard',
    capabilitiesRequired: ['canCreatePlans'],
    estimatedMinutes: 7,
    steps: [
      {
        title: 'Understanding Subscription Plans',
        titleAr: 'فهم خطط الاشتراك',
        content: 'Subscription plans allow you to monetize your analyses by offering different access tiers. Subscribers pay monthly to access your premium content and signals.',
        contentAr: 'تسمح لك خطط الاشتراك بتحقيق الدخل من تحليلاتك من خلال تقديم مستويات وصول مختلفة. يدفع المشتركون شهرياً للوصول إلى محتواك ومؤشراتك المميزة.',
        deepLink: '/dashboard/subscriptions',
        tips: [
          'Offer 2-3 tiers for different budgets',
          'Clearly define what each tier includes',
          'Free tier helps build initial audience',
          'Premium tiers drive revenue'
        ],
        tipsAr: [
          'قدم 2-3 مستويات لميزانيات مختلفة',
          'حدد بوضوح ما يتضمنه كل مستوى',
          'المستوى المجاني يساعد في بناء جمهور أولي',
          'المستويات المميزة تدر الإيرادات'
        ]
      },
      {
        title: 'Creating a Plan',
        titleAr: 'إنشاء خطة',
        content: 'Go to Subscriptions settings to create a new plan. Set the name, price, duration, features list, and Telegram channel assignment. Make it clear what value subscribers will get.',
        contentAr: 'انتقل إلى إعدادات الاشتراكات لإنشاء خطة جديدة. حدد الاسم والسعر والمدة وقائمة الميزات وتعيين قناة Telegram. اجعل من الواضح القيمة التي سيحصل عليها المشتركون.',
        tips: [
          'Price competitively based on your track record',
          'List specific features and benefits',
          'Connect to appropriate Telegram channel',
          'Consider trial periods for new subscribers'
        ],
        tipsAr: [
          'سعر تنافسي بناءً على سجلك',
          'اذكر الميزات والفوائد المحددة',
          'اربط بقناة Telegram المناسبة',
          'فكر في فترات تجريبية للمشتركين الجدد'
        ]
      },
      {
        title: 'Managing Subscribers',
        titleAr: 'إدارة المشتركين',
        content: 'View and manage your subscribers from the Subscribers page. You can see active subscriptions, expiration dates, and revenue. The system handles renewals automatically.',
        contentAr: 'اعرض وأدر مشتركيك من صفحة المشتركين. يمكنك رؤية الاشتراكات النشطة وتواريخ الانتهاء والإيرادات. يتعامل النظام مع التجديدات تلقائياً.',
        deepLink: '/dashboard/subscribers',
        tips: [
          'Monitor subscription renewals',
          'Engage with subscribers for retention',
          'Track which plans perform best',
          'Adjust pricing based on value delivered'
        ],
        tipsAr: [
          'راقب تجديدات الاشتراك',
          'تفاعل مع المشتركين للاحتفاظ بهم',
          'تتبع الخطط التي تحقق أفضل أداء',
          'اضبط التسعير بناءً على القيمة المقدمة'
        ]
      }
    ]
  }
];

export function getTutorialSection(sectionId: string): TutorialSection | undefined {
  return tutorialSections.find(section => section.id === sectionId);
}

export function getTutorialSectionsByCapabilities(
  capabilities: Record<string, boolean>
): TutorialSection[] {
  return tutorialSections.filter(section =>
    section.capabilitiesRequired.every(cap => capabilities[cap])
  );
}
