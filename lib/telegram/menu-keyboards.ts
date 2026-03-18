/**
 * Telegram Bot — Inline Keyboard Definitions
 *
 * All keyboard layouts are pure data (no side effects).
 * Callback data format:  NAMESPACE:ACTION[:PARAM]
 * Hard limit: callback_data ≤ 64 bytes.
 */

import { CTA } from './bot-constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type KeyboardRow   = InlineButton[];
export type InlineKeyboard = KeyboardRow[];

// ─── Callback Data Constants ─────────────────────────────────────────────────

export const CB = {
  // Menu navigation
  MENU_MAIN:    'MENU:main',
  MENU_AI:      'MENU:ai',
  MENU_SEARCH:  'MENU:search',
  MENU_TRADES:  'MENU:trades',
  MENU_REPORTS: 'MENU:reports',
  MENU_DISCOVER:'MENU:discover',
  MENU_ASSETS:  'MENU:assets',
  MENU_MYSPACE: 'MENU:myspace',
  MENU_HELP:    'MENU:help',

  // AI actions
  ACTION_AI_FINANCIAL:   'ACTION:ai_financial',
  ACTION_AI_TECHNICAL:   'ACTION:ai_technical',
  ACTION_QUICK_SUMMARY:  'ACTION:quick_summary',
  ACTION_COMPARE:        'ACTION:compare',
  ACTION_RISK_DETECTION: 'ACTION:risk_detection',
  ACTION_MARKET_INSIGHT: 'ACTION:market_insight',

  // Search actions
  ACTION_SEARCH_TICKER:  'ACTION:search_ticker',
  ACTION_SEARCH_LATEST:  'ACTION:search_latest',
  ACTION_SEARCH_TODAY:   'ACTION:search_today',
  ACTION_SEARCH_WEEK:    'ACTION:search_week',
  ACTION_SEARCH_TOP:     'ACTION:search_top',
  ACTION_SEARCH_ANALYST: 'ACTION:search_analyst',
  ACTION_SEARCH_MARKET:  'ACTION:search_market',

  // Trade actions
  ACTION_TRADES_LATEST:  'ACTION:trades_latest',
  ACTION_TRADES_OPEN:    'ACTION:trades_open',
  ACTION_TRADES_CLOSED:  'ACTION:trades_closed',
  ACTION_TRADES_HIGH:    'ACTION:trades_high',
  ACTION_TRADES_INDICES: 'ACTION:trades_indices',
  ACTION_TRADES_STOCKS:  'ACTION:trades_stocks',

  // Report actions
  ACTION_REPORTS_DAILY:  'ACTION:reports_daily',
  ACTION_REPORTS_WEEKLY: 'ACTION:reports_weekly',
  ACTION_REPORTS_RECAP:  'ACTION:reports_recap',
  ACTION_REPORTS_INDEX:  'ACTION:reports_index',
  ACTION_REPORTS_SECTOR: 'ACTION:reports_sector',

  // Discover actions
  ACTION_DISCOVER_TRENDING: 'ACTION:discover_trending',
  ACTION_DISCOVER_VIEWED:   'ACTION:discover_viewed',
  ACTION_DISCOVER_DISCUSSED:'ACTION:discover_discussed',
  ACTION_DISCOVER_BULLISH:  'ACTION:discover_bullish',
  ACTION_DISCOVER_BEARISH:  'ACTION:discover_bearish',
  ACTION_DISCOVER_PICKS:    'ACTION:discover_picks',

  // Asset actions
  ACTION_ASSET_STOCK:    'ACTION:asset_stock',
  ACTION_ASSET_INDEX:    'ACTION:asset_index',
  ACTION_ASSET_ETF:      'ACTION:asset_etf',
  ACTION_ASSET_SECTOR:   'ACTION:asset_sector',
  ACTION_ASSET_SNAPSHOT: 'ACTION:asset_snapshot',

  // My Space
  ACTION_MYSPACE_SAVED:     'ACTION:myspace_saved',
  ACTION_MYSPACE_RECENT:    'ACTION:myspace_recent',
  ACTION_MYSPACE_WATCHLIST: 'ACTION:myspace_watchlist',

  // Help actions
  ACTION_HELP_HOWTO:      'ACTION:help_howto',
  ACTION_HELP_AI_HOW:     'ACTION:help_ai_how',
  ACTION_HELP_FAQ:        'ACTION:help_faq',
  ACTION_HELP_DISCLAIMER: 'ACTION:help_disclaimer',
  ACTION_HELP_CONTACT:    'ACTION:help_contact',
} as const;

// ─── Main Menu ────────────────────────────────────────────────────────────────

export function mainMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '🧠 AI Intelligence | الذكاء التحليلي', callback_data: CB.MENU_AI },
    ],
    [
      { text: '🔍 Search | البحث في المنصة',          callback_data: CB.MENU_SEARCH },
      { text: '📈 Trades | مركز الصفقات',             callback_data: CB.MENU_TRADES },
    ],
    [
      { text: '📋 Reports | مركز التقارير',           callback_data: CB.MENU_REPORTS },
      { text: '🌟 Discover | الاستكشاف',              callback_data: CB.MENU_DISCOVER },
    ],
    [
      { text: '🏢 Asset Lookup | بحث عن أصل',         callback_data: CB.MENU_ASSETS },
      { text: '⭐ My Space | مساحتي',                  callback_data: CB.MENU_MYSPACE },
    ],
    [
      { text: '❓ Help | مركز المساعدة',              callback_data: CB.MENU_HELP },
    ],
  ];
}

// ─── AI Intelligence Submenu ──────────────────────────────────────────────────

export function aiMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '📊 Financial Analysis | التحليل المالي', callback_data: CB.ACTION_AI_FINANCIAL },
    ],
    [
      { text: '📐 Technical Analysis | التحليل الفني',  callback_data: CB.ACTION_AI_TECHNICAL },
    ],
    [
      { text: '⚡ Quick Summary | ملخص سريع',           callback_data: CB.ACTION_QUICK_SUMMARY },
      { text: '⚖️ Compare | مقارنة شركتين',              callback_data: CB.ACTION_COMPARE },
    ],
    [
      { text: '🔍 Risk Detection | كشف المخاطر',        callback_data: CB.ACTION_RISK_DETECTION },
      { text: '💡 Market Insight | رؤية السوق',          callback_data: CB.ACTION_MARKET_INSIGHT },
    ],
    [backButton()],
  ];
}

// ─── Platform Search Submenu ──────────────────────────────────────────────────

export function searchMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '🔎 By Ticker | بالرمز',                 callback_data: CB.ACTION_SEARCH_TICKER },
    ],
    [
      { text: '🕐 Latest | آخر التحليلات',             callback_data: CB.ACTION_SEARCH_LATEST },
      { text: '📅 Today | اليوم',                      callback_data: CB.ACTION_SEARCH_TODAY },
    ],
    [
      { text: '📆 This Week | هذا الأسبوع',            callback_data: CB.ACTION_SEARCH_WEEK },
      { text: '⭐ Top Rated | الأعلى تقييمًا',          callback_data: CB.ACTION_SEARCH_TOP },
    ],
    [
      { text: '👤 By Analyst | بالمحلل',               callback_data: CB.ACTION_SEARCH_ANALYST },
      { text: '🌍 By Market | بالسوق',                  callback_data: CB.ACTION_SEARCH_MARKET },
    ],
    [backButton()],
  ];
}

// ─── Trades Center Submenu ────────────────────────────────────────────────────

export function tradesMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '🕐 Latest Trades | أحدث الصفقات',       callback_data: CB.ACTION_TRADES_LATEST },
    ],
    [
      { text: '🟢 Open | المفتوحة',                    callback_data: CB.ACTION_TRADES_OPEN },
      { text: '🔴 Closed | المغلقة',                   callback_data: CB.ACTION_TRADES_CLOSED },
    ],
    [
      { text: '💎 High Conviction | عالية الثقة',      callback_data: CB.ACTION_TRADES_HIGH },
    ],
    [
      { text: '📊 Index Trades | صفقات المؤشرات',      callback_data: CB.ACTION_TRADES_INDICES },
      { text: '📈 Stock Trades | صفقات الأسهم',        callback_data: CB.ACTION_TRADES_STOCKS },
    ],
    [backButton()],
  ];
}

// ─── Reports Hub Submenu ──────────────────────────────────────────────────────

export function reportsMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '📅 Daily Report | التقرير اليومي',      callback_data: CB.ACTION_REPORTS_DAILY },
      { text: '📆 Weekly Report | الأسبوعي',           callback_data: CB.ACTION_REPORTS_WEEKLY },
    ],
    [
      { text: '📰 Market Recap | ملخص السوق',          callback_data: CB.ACTION_REPORTS_RECAP },
    ],
    [
      { text: '📊 Index Reports | تقارير المؤشرات',    callback_data: CB.ACTION_REPORTS_INDEX },
      { text: '🏭 Sector Reports | القطاعات',           callback_data: CB.ACTION_REPORTS_SECTOR },
    ],
    [backButton()],
  ];
}

// ─── Discover Submenu ─────────────────────────────────────────────────────────

export function discoverMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '🔥 Trending | الرائجة',                 callback_data: CB.ACTION_DISCOVER_TRENDING },
      { text: '👁 Most Viewed | الأكثر مشاهدة',        callback_data: CB.ACTION_DISCOVER_VIEWED },
    ],
    [
      { text: '💬 Most Discussed | الأكثر تفاعلًا',    callback_data: CB.ACTION_DISCOVER_DISCUSSED },
    ],
    [
      { text: '📈 Most Bullish | الأكثر إيجابية',      callback_data: CB.ACTION_DISCOVER_BULLISH },
      { text: '📉 Most Bearish | الأكثر سلبية',        callback_data: CB.ACTION_DISCOVER_BEARISH },
    ],
    [
      { text: '✨ Editor\'s Picks | اختيارات مميزة',    callback_data: CB.ACTION_DISCOVER_PICKS },
    ],
    [backButton()],
  ];
}

// ─── Asset Lookup Submenu ─────────────────────────────────────────────────────

export function assetsMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '📈 Stock | سهم',                        callback_data: CB.ACTION_ASSET_STOCK },
      { text: '📊 Index | مؤشر',                       callback_data: CB.ACTION_ASSET_INDEX },
    ],
    [
      { text: '🗂 ETF | صندوق',                        callback_data: CB.ACTION_ASSET_ETF },
      { text: '🏭 Sector | قطاع',                      callback_data: CB.ACTION_ASSET_SECTOR },
    ],
    [
      { text: '🏢 Company Snapshot | نظرة سريعة',      callback_data: CB.ACTION_ASSET_SNAPSHOT },
    ],
    [backButton()],
  ];
}

// ─── My Space Submenu ─────────────────────────────────────────────────────────

export function mySpaceMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '🔖 Saved Analyses | المحفوظات',         callback_data: CB.ACTION_MYSPACE_SAVED },
    ],
    [
      { text: '🕐 Recently Viewed | شوهد مؤخرًا',      callback_data: CB.ACTION_MYSPACE_RECENT },
      { text: '👁 Watchlist | قائمة المتابعة',          callback_data: CB.ACTION_MYSPACE_WATCHLIST },
    ],
    [backButton()],
  ];
}

// ─── Help Center Submenu ──────────────────────────────────────────────────────

export function helpMenuKeyboard(): InlineKeyboard {
  return [
    [
      { text: '📖 How to Use | كيفية الاستخدام',       callback_data: CB.ACTION_HELP_HOWTO },
    ],
    [
      { text: '🤖 How AI Works | كيف يعمل الذكاء',     callback_data: CB.ACTION_HELP_AI_HOW },
      { text: '❓ FAQ | الأسئلة الشائعة',               callback_data: CB.ACTION_HELP_FAQ },
    ],
    [
      { text: '⚖️ Disclaimer | إخلاء المسؤولية',        callback_data: CB.ACTION_HELP_DISCLAIMER },
      { text: '📬 Support | الدعم',                     callback_data: CB.ACTION_HELP_CONTACT },
    ],
    [backButton()],
  ];
}

// ─── Post-Result Action Keyboards ─────────────────────────────────────────────

export function analysisResultKeyboard(publicUrl: string, ticker: string): InlineKeyboard {
  return [
    [{ text: CTA.view_full_analysis, url: publicUrl }],
    [
      { text: CTA.view_related,  callback_data: `ACTION:search_ticker_direct:${ticker}` },
      { text: CTA.view_trades,   callback_data: `ACTION:trades_ticker:${ticker}` },
    ],
    [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
  ];
}

export function reportResultKeyboard(publicUrl: string): InlineKeyboard {
  return [
    [{ text: CTA.view_full_report, url: publicUrl }],
    [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
  ];
}

export function assetSnapshotKeyboard(ticker: string, baseUrl: string): InlineKeyboard {
  return [
    [
      { text: '📊 View Analyses | التحليلات', callback_data: `ACTION:search_ticker_direct:${ticker}` },
      { text: '📈 View Trades | الصفقات',     callback_data: `ACTION:trades_ticker:${ticker}` },
    ],
    [
      { text: '🧠 AI Analyse | تحليل ذكي',   callback_data: `ACTION:ai_ticker:${ticker}` },
      { text: '🌐 Open Page | فتح الصفحة',   url: `${baseUrl}/symbol/${encodeURIComponent(ticker)}` },
    ],
    [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
  ];
}

export function searchResultKeyboard(
  analyses: Array<{ analysis_id: string; num: number }>,
  pagination: { currentPage: number; totalPages: number; symbol: string },
  baseUrl: string
): InlineKeyboard {
  const keyboard: InlineKeyboard = [];

  // Open buttons — 2 per row
  const btnRows: KeyboardRow[] = [];
  analyses.forEach(({ analysis_id, num }) => {
    const btn: InlineButton = { text: `${num}. Open`, url: `${baseUrl}/share/${analysis_id}` };
    const last = btnRows[btnRows.length - 1];
    if (!last || last.length >= 2) btnRows.push([btn]);
    else last.push(btn);
  });
  keyboard.push(...btnRows);

  // Pagination
  const { currentPage, totalPages, symbol } = pagination;
  if (totalPages > 1) {
    const row: KeyboardRow = [];
    if (currentPage > 1) row.push({ text: CTA.prev_page, callback_data: `ANALYSES:${symbol}:${currentPage - 1}` });
    if (currentPage < totalPages) row.push({ text: CTA.next_page, callback_data: `ANALYSES:${symbol}:${currentPage + 1}` });
    if (row.length) keyboard.push(row);
  }

  keyboard.push([
    { text: '🔍 Platform Search | بحث في المنصة', url: `${baseUrl}/search?symbol=${encodeURIComponent(symbol)}` },
    { text: CTA.back_to_menu, callback_data: CB.MENU_MAIN },
  ]);

  return keyboard;
}

export function errorKeyboard(): InlineKeyboard {
  return [
    [
      { text: CTA.try_again,    callback_data: CB.MENU_MAIN },
      { text: CTA.back_to_menu, callback_data: CB.MENU_MAIN },
    ],
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function backButton(): InlineButton {
  return { text: CTA.back_to_menu, callback_data: CB.MENU_MAIN };
}
