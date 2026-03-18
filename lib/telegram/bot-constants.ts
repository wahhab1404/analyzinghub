/**
 * Telegram Bot — Bilingual Copy Constants (English + Arabic)
 *
 * All user-facing strings live here so they can be revised in one place.
 * Arabic copy is native-quality, not machine-translated.
 */

// ─── Welcome / Start ────────────────────────────────────────────────────────

export const WELCOME_TEXT = `\
✦ <b>AnalyzingHub — AI Market Intelligence</b>

أهلاً بك في مساعد التحليل الذكي.
اختر من القائمة أدناه للوصول إلى التحليل المالي والفني بالذكاء الاصطناعي، البحث في المنصة، الصفقات، والتقارير — بتجربة احترافية متكاملة.

Welcome to your AI Market Intelligence Assistant.
Choose a service below to access AI-powered financial &amp; technical analysis, platform research, trades, and reports.`;

export const WELCOME_LINKED_TEXT = (name: string) => `\
✦ <b>AnalyzingHub</b>  •  أهلاً ${name}

حسابك مرتبط ✓ — القائمة الرئيسية جاهزة.
Your account is linked ✓ — main menu ready.`;

// ─── Loading / Progress States ───────────────────────────────────────────────

export const LOADING = {
  ai_financial: [
    '⏳ <i>Reviewing company data…\nمراجعة بيانات الشركة…</i>',
    '⏳ <i>Analysing financials…\nتحليل البيانات المالية…</i>',
    '⏳ <i>Structuring AI insights…\nبناء رؤى الذكاء الاصطناعي…</i>',
    '⏳ <i>Building your result page…\nإعداد صفحة النتائج…</i>',
  ],
  ai_technical: [
    '⏳ <i>Loading chart data…\nجارٍ تحميل بيانات الرسم البياني…</i>',
    '⏳ <i>Identifying key levels…\nتحديد المستويات الرئيسية…</i>',
    '⏳ <i>Generating technical summary…\nإعداد الملخص الفني…</i>',
    '⏳ <i>Building your result page…\nإعداد صفحة النتائج…</i>',
  ],
  quick_summary: [
    '⏳ <i>Preparing quick summary…\nإعداد الملخص السريع…</i>',
    '⏳ <i>Compiling key data…\nتجميع البيانات الأساسية…</i>',
  ],
  compare: [
    '⏳ <i>Comparing companies…\nمقارنة الشركتين…</i>',
    '⏳ <i>Structuring comparison…\nبناء جدول المقارنة…</i>',
  ],
};

// ─── Input Prompts ────────────────────────────────────────────────────────────

export const PROMPTS = {
  ai_financial: `\
🧠 <b>AI Financial Analysis | التحليل المالي الذكي</b>

أدخل رمز السهم أو اسم الشركة:
Enter the ticker symbol or company name:

<i>Examples: AAPL · TSLA · 2222.SR · Saudi Aramco</i>`,

  ai_technical: `\
📐 <b>AI Technical Analysis | التحليل الفني الذكي</b>

أدخل رمز الأصل:
Enter the asset symbol:

<i>Examples: AAPL · BTC · SPY · 2222.SR</i>`,

  quick_summary: `\
⚡ <b>Quick Investment Summary | ملخص استثماري سريع</b>

أدخل رمز السهم أو اسم الشركة:
Enter the ticker or company name:`,

  compare_company1: `\
⚖️ <b>Compare Two Companies | مقارنة شركتين</b>

أدخل رمز الشركة الأولى:
Enter the first company ticker:

<i>Example: AAPL</i>`,

  compare_company2: (c1: string) => `\
⚖️ <b>Compare Two Companies | مقارنة شركتين</b>

الشركة الأولى: <code>${c1}</code>

أدخل رمز الشركة الثانية:
Enter the second company ticker:

<i>Example: MSFT</i>`,

  risk_detection: `\
🔍 <b>Risk Detection | كشف المخاطر</b>

أدخل رمز الشركة أو الأصل:
Enter the company or asset symbol:`,

  search_ticker: `\
🔍 <b>Search Analyses | البحث عن تحليلات</b>

أدخل رمز السهم للبحث:
Enter the ticker symbol to search:

<i>Example: AAPL · TSLA · 2222.SR</i>`,

  asset_lookup: `\
🏢 <b>Asset Lookup | البحث عن أصل</b>

أدخل رمز السهم أو المؤشر أو اسم الشركة:
Enter a ticker, index, or company name:`,
};

// ─── Submenu Headers ──────────────────────────────────────────────────────────

export const SUBMENU_HEADERS = {
  ai: `🧠 <b>AI Intelligence | الذكاء التحليلي</b>\n\nاختر أداة التحليل الذكي:\nChoose an AI analysis tool:`,
  search: `🔍 <b>Platform Search | البحث في المنصة</b>\n\nاختر نوع البحث:\nChoose a search type:`,
  trades: `📈 <b>Trades Center | مركز الصفقات</b>\n\nاختر عرض الصفقات:\nChoose a trades view:`,
  reports: `📋 <b>Reports Hub | مركز التقارير</b>\n\nاختر التقرير:\nChoose a report:`,
  discover: `🌟 <b>Discover | الاستكشاف</b>\n\nاستكشف أبرز المحتوى:\nExplore trending content:`,
  assets: `🏢 <b>Asset Lookup | البحث عن أصل</b>\n\nاختر نوع البحث:\nChoose asset type:`,
  myspace: `⭐ <b>My Space | مساحتي</b>\n\nوصول سريع لمحتواك الشخصي:\nQuick access to your personal content:`,
  help: `❓ <b>Help Center | مركز المساعدة</b>\n\nكيف يمكننا مساعدتك؟\nHow can we help you?`,
};

// ─── Result Preview Templates ─────────────────────────────────────────────────

export const RESULT_PREVIEW = {
  ai_financial: (ticker: string, company: string, summary: string, url: string) => `\
📊 <b>AI Financial Analysis — ${ticker}</b>
🏢 ${company}

${summary}

━━━━━━━━━━━━━━━━━━━
🔗 Full detailed analysis ready ↓`,

  ai_technical: (ticker: string, bias: string, summary: string, url: string) => `\
📐 <b>AI Technical Analysis — ${ticker}</b>
📌 Bias: <b>${bias}</b>

${summary}

━━━━━━━━━━━━━━━━━━━
🔗 Full chart analysis ready ↓`,

  quick_summary: (ticker: string, summary: string) => `\
⚡ <b>Quick Summary — ${ticker}</b>

${summary}`,

  compare: (t1: string, t2: string, summary: string) => `\
⚖️ <b>Company Comparison</b>
${t1} vs ${t2}

${summary}

━━━━━━━━━━━━━━━━━━━
🔗 Full comparison ready ↓`,
};

// ─── CTA Button Labels ────────────────────────────────────────────────────────

export const CTA = {
  view_full_analysis:  '📄 View Full Analysis | عرض التحليل الكامل',
  view_full_report:    '📋 Open Full Report | فتح التقرير',
  view_related:        '🔗 Related Analyses | تحليلات ذات صلة',
  view_trades:         '📈 View Trades | عرض الصفقات',
  back_to_menu:        '← Main Menu | القائمة الرئيسية',
  back:                '← Back | رجوع',
  try_again:           '🔄 Try Again | حاول مجددًا',
  open_platform:       '🌐 Open Platform | فتح المنصة',
  search_website:      '🔍 Search on Platform | البحث في المنصة',
  ai_analyze_ticker:   '🧠 AI Analyse | تحليل ذكي',
  next_page:           'Next ›',
  prev_page:           '‹ Prev',
};

// ─── Error / Empty States ────────────────────────────────────────────────────

export const ERRORS = {
  generic: `\
⚠️ <b>Temporary Issue | خطأ مؤقت</b>

نواجه مشكلة تقنية مؤقتة. يرجى المحاولة مرة أخرى.
We're experiencing a temporary issue. Please try again shortly.`,

  no_results: (symbol: string) => `\
📊 <b>No results for ${symbol}</b>

لم يتم العثور على تحليلات لهذا الرمز.
No analyses found for this symbol yet.

💡 <i>Try a different ticker or browse the platform.</i>`,

  invalid_ticker: `\
❌ <b>Invalid Symbol | رمز غير صالح</b>

يرجى إدخال رمز سهم صالح (أحرف وأرقام فقط).
Please enter a valid ticker symbol (letters and numbers only).

<i>Examples: AAPL · TSLA · 2222.SR</i>`,

  rate_limit: `\
⏱️ <b>Rate Limit | حد الاستخدام</b>

لقد تجاوزت الحد المسموح به. يرجى الانتظار قليلاً.
You've exceeded the query limit. Please wait a few minutes.`,

  ai_timeout: `\
⚠️ <b>AI Timeout | انتهت مدة الطلب</b>

استغرق التحليل وقتاً أطول من المتوقع. يرجى المحاولة مجددًا.
The AI analysis took longer than expected. Please try again.`,

  not_linked: `\
🔒 <b>Account Not Linked | الحساب غير مرتبط</b>

هذه الميزة تتطلب ربط حسابك بالمنصة.
This feature requires a linked AnalyzingHub account.

<b>How to link:</b>
1. Log in to AnalyzingHub
2. Go to Settings → Telegram
3. Generate a link code
4. Send <code>/start CODE</code> here`,

  no_reports: `\
📋 <b>No Reports Available | لا توجد تقارير</b>

لا توجد تقارير متاحة حالياً. تحقق لاحقاً.
No reports available right now. Check back later.`,
};

// ─── Help Content ─────────────────────────────────────────────────────────────

export const HELP = {
  how_to_use: `\
📖 <b>How to Use | كيفية الاستخدام</b>

<b>Main Features:</b>
• 🧠 <b>AI Intelligence</b> — Get AI-powered financial & technical analysis for any asset
• 🔍 <b>Search</b> — Find analyses by ticker, analyst, market, or date
• 📈 <b>Trades</b> — Browse open and closed trade setups with targets
• 📋 <b>Reports</b> — Access daily, weekly, and sector reports
• 🌟 <b>Discover</b> — Explore trending and editor-picked content
• 🏢 <b>Asset Lookup</b> — Get a snapshot of any stock, index, or ETF

<b>Quick tip:</b> Type any ticker directly (e.g., <code>AAPL</code>) to instantly search analyses.

━━━━━━━━━━━━━━━━━━━
<b>المميزات الرئيسية:</b>
• 🧠 <b>الذكاء التحليلي</b> — تحليل مالي وفني بالذكاء الاصطناعي لأي أصل
• 🔍 <b>البحث</b> — ابحث بالرمز، المحلل، السوق، أو التاريخ
• 📈 <b>الصفقات</b> — تصفح الصفقات المفتوحة والمغلقة مع الأهداف
• 📋 <b>التقارير</b> — اليومية، الأسبوعية، والقطاعية
• 🌟 <b>الاستكشاف</b> — المحتوى الرائج والمختار
• 🏢 <b>البحث عن أصل</b> — نظرة سريعة على أي سهم أو مؤشر`,

  how_ai_works: `\
🤖 <b>How AI Analysis Works | كيف يعمل التحليل الذكي</b>

<b>Process:</b>
1. You enter a ticker or company name
2. We gather relevant market &amp; financial data
3. Our AI engine structures a deep analysis
4. A premium result page is generated instantly
5. You receive a concise preview + link to the full page

<b>AI analyses cover:</b>
• Revenue, margins, profitability
• Balance sheet &amp; cash flow
• Valuation ratios
• Technical trend &amp; key levels
• Risk factors &amp; investment view

<i>All AI analysis is informational and does not constitute financial advice.</i>

━━━━━━━━━━━━━━━━━━━
<b>كيف يعمل:</b>
1. تدخل رمز السهم أو اسم الشركة
2. نجمع بيانات السوق والمالية ذات الصلة
3. يبني محرك الذكاء الاصطناعي تحليلاً متعمقاً
4. تُنشأ صفحة نتائج احترافية فوراً
5. تتلقى ملخصاً موجزاً ورابطاً للصفحة الكاملة`,

  faq: `\
❓ <b>FAQ | الأسئلة الشائعة</b>

<b>Q: Do I need an account?</b>
A: No — AI analysis and search are free to use. Some features (watchlist, saved items) require linking your account.

<b>Q: How current is the data?</b>
A: Market data is near-real-time. AI analyses reflect the latest available data at generation time.

<b>Q: What markets are supported?</b>
A: US equities, Saudi market (Tadawul), indices, ETFs, and options.

<b>Q: How do I link my account?</b>
A: Go to Settings → Telegram in the platform, generate a code, then send <code>/start CODE</code> here.

━━━━━━━━━━━━━━━━━━━
<b>س: هل أحتاج حساباً؟</b>
ج: لا — التحليل الذكي والبحث مجانيان. بعض الميزات (قائمة المتابعة، المحفوظات) تتطلب ربط الحساب.

<b>س: ما مدى حداثة البيانات؟</b>
ج: بيانات السوق شبه فورية. تعكس تحليلات الذكاء الاصطناعي أحدث البيانات المتاحة وقت الإنشاء.`,

  disclaimer: `\
⚖️ <b>Disclaimer | إخلاء المسؤولية</b>

All content provided by this bot and the AnalyzingHub platform is for <b>informational and educational purposes only</b>.

Nothing here constitutes financial advice, investment recommendations, or solicitation to buy or sell any security.

Past performance does not guarantee future results. Trading involves significant risk of loss.

Always conduct your own due diligence and consult a licensed financial advisor before making investment decisions.

━━━━━━━━━━━━━━━━━━━
جميع المحتوى المقدم عبر هذا البوت ومنصة AnalyzingHub هو <b>لأغراض إعلامية وتعليمية فقط</b>.

لا يُعدّ أياً من هذا المحتوى نصيحة مالية أو توصية استثمارية أو دعوة لشراء أو بيع أي ورقة مالية.

الأداء السابق لا يضمن النتائج المستقبلية. ينطوي التداول على مخاطر خسارة كبيرة.

قم دائماً بإجراء البحث اللازم واستشر مستشاراً مالياً مرخصاً قبل اتخاذ أي قرارات استثمارية.`,

  contact: `\
📬 <b>Contact Support | التواصل مع الدعم</b>

للمساعدة أو الاستفسار، يمكنك التواصل معنا عبر المنصة.
For help or inquiries, contact us through the platform.

🌐 <a href="https://analyzinghub.com">analyzinghub.com</a>`,
};

// ─── Account Link ─────────────────────────────────────────────────────────────

export const LINK_SUCCESS = (name: string) => `\
✅ <b>Account Linked | تم ربط الحساب</b>

مرحباً ${name}! تم ربط حسابك بنجاح.
Welcome ${name}! Your account has been linked successfully.

ستتلقى إشعارات التحليلات والصفقات هنا.
You will now receive analysis and trade notifications here.`;

export const LINK_ALREADY = `\
⚠️ حسابك مرتبط بالفعل.
Your account is already linked.`;

export const LINK_INVALID_CODE = `\
❌ <b>Invalid Code | رمز غير صالح</b>

الرمز غير صالح أو منتهي الصلاحية. يرجى إنشاء رمز جديد من إعدادات المنصة.
Invalid or expired code. Please generate a new code from platform Settings → Telegram.`;

export const STATUS_LINKED = (since: string) => `\
✅ <b>Account Linked | الحساب مرتبط</b>

حسابك نشط ومرتبط منذ ${since}.
Your account is active and linked since ${since}.`;

export const STATUS_NOT_LINKED = `\
❌ <b>Not Linked | غير مرتبط</b>

حسابك غير مرتبط بعد.
Your account is not linked yet.

Send <code>/start CODE</code> to link it.`;
