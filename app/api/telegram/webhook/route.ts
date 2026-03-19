/**
 * Telegram Bot Webhook — Premium AI-Powered Market Intelligence Bot
 *
 * Handles all incoming Telegram updates:
 *   • /start  → Welcome + main menu
 *   • /menu   → Main menu
 *   • /help   → Help center
 *   • /status → Account link status
 *   • Inline keyboard callbacks → Menu navigation + action dispatch
 *   • Text messages → State-machine driven multi-step flows
 *                     (ticker-query fallback for IDLE state)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  WELCOME_TEXT,
  WELCOME_LINKED_TEXT,
  LINK_SUCCESS,
  LINK_ALREADY,
  LINK_INVALID_CODE,
  STATUS_LINKED,
  STATUS_NOT_LINKED,
  PROMPTS,
  SUBMENU_HEADERS,
  LOADING,
  RESULT_PREVIEW,
  ERRORS,
  HELP,
  CTA,
} from '@/lib/telegram/bot-constants';

import {
  CB,
  mainMenuKeyboard,
  aiMenuKeyboard,
  searchMenuKeyboard,
  tradesMenuKeyboard,
  reportsMenuKeyboard,
  discoverMenuKeyboard,
  assetsMenuKeyboard,
  mySpaceMenuKeyboard,
  helpMenuKeyboard,
  analysisResultKeyboard,
  reportResultKeyboard,
  assetSnapshotKeyboard,
  searchResultKeyboard,
  errorKeyboard,
} from '@/lib/telegram/menu-keyboards';

import {
  getBotToken,
  sendMessage,
  editMessage,
  answerCallback,
} from '@/lib/telegram/bot-sender';

import {
  getSessionManager,
  type BotState,
} from '@/lib/telegram/session-manager';

import {
  validateAndNormalizeSymbol,
  escapeHtml,
  formatDateForTelegram,
  truncateText,
} from '@/lib/telegram/symbol-utils';

import type { AnalysisResult, PaginationInfo } from '@/lib/telegram/message-builder';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://analyzinghub.com';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[Webhook] Missing Supabase env vars');
    return NextResponse.json({ ok: true });
  }

  // Verify webhook secret
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  console.log('[Webhook] update_id:', update.update_id);

  const token = await getBotToken(supabaseUrl, supabaseKey);
  if (!token) {
    console.error('[Webhook] No bot token available');
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query, token, supabaseUrl, supabaseKey);
    } else if (update.message) {
      await handleMessage(update.message, token, supabaseUrl, supabaseKey);
    }
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
  }

  return NextResponse.json({ ok: true });
}

// ─── Message Handler ──────────────────────────────────────────────────────────

async function handleMessage(
  msg:          any,
  token:        string,
  supabaseUrl:  string,
  supabaseKey:  string
) {
  const chatId   = String(msg.chat.id);
  const text     = msg.text?.trim() || '';
  const from     = msg.from;
  const username = from?.username;
  const firstName = from?.first_name || '';

  // ── /start ──────────────────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    const code  = parts[1]?.toUpperCase();

    // Always reset session state on /start so old multi-step flows don't linger
    try {
      const sessions = getSessionManager();
      await sessions.reset(chatId);
    } catch {
      // Non-fatal — proceed even if session reset fails
    }

    // /start CODE → account linking
    if (code) {
      await handleLinkAccount(chatId, code, username, firstName, token, supabaseUrl, supabaseKey);
      return;
    }

    // /start with username auto-link check
    if (username) {
      const linked = await tryAutoLink(chatId, username, firstName, token, supabaseUrl, supabaseKey);
      if (linked) return;
    }

    // Plain /start → welcome + main menu
    await sendWelcome(chatId, firstName, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── /menu ────────────────────────────────────────────────────────────────────
  if (text === '/menu' || text === '/m') {
    try {
      const sessions = getSessionManager();
      await sessions.reset(chatId);
    } catch {
      // Non-fatal
    }
    await sendMainMenu(chatId, token);
    return;
  }

  // ── /help ────────────────────────────────────────────────────────────────────
  if (text === '/help') {
    await sendMessage(token, chatId, HELP.how_to_use, helpMenuKeyboard());
    return;
  }

  // ── /status ──────────────────────────────────────────────────────────────────
  if (text === '/status') {
    await handleStatus(chatId, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── State-machine dispatch ───────────────────────────────────────────────────
  if (!text.startsWith('/')) {
    await handleStateInput(chatId, text, token, supabaseUrl, supabaseKey);
  }
}

// ─── Callback Handler ─────────────────────────────────────────────────────────

async function handleCallback(
  cb:           any,
  token:        string,
  supabaseUrl:  string,
  supabaseKey:  string
) {
  const chatId    = String(cb.message.chat.id);
  const msgId     = cb.message.message_id;
  const data      = cb.data || '';

  await answerCallback(token, cb.id);

  // ── Menu navigation ──────────────────────────────────────────────────────────
  if (data === CB.MENU_MAIN)    { await editMainMenu(chatId, msgId, token);                                   return; }
  if (data === CB.MENU_AI)      { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.ai,      aiMenuKeyboard());       return; }
  if (data === CB.MENU_SEARCH)  { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.search,  searchMenuKeyboard());   return; }
  if (data === CB.MENU_TRADES)  { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.trades,  tradesMenuKeyboard());   return; }
  if (data === CB.MENU_REPORTS) { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.reports, reportsMenuKeyboard());  return; }
  if (data === CB.MENU_DISCOVER){ await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.discover,discoverMenuKeyboard()); return; }
  if (data === CB.MENU_ASSETS)  { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.assets,  assetsMenuKeyboard());   return; }
  if (data === CB.MENU_MYSPACE) { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.myspace, mySpaceMenuKeyboard());  return; }
  if (data === CB.MENU_HELP)    { await editWithMenu(chatId, msgId, token, SUBMENU_HEADERS.help,    helpMenuKeyboard());     return; }

  // ── AI actions ───────────────────────────────────────────────────────────────
  if (data === CB.ACTION_AI_FINANCIAL) {
    await promptInput(chatId, msgId, token, PROMPTS.ai_financial, 'AWAITING_AI_FINANCIAL');
    return;
  }
  if (data === CB.ACTION_AI_TECHNICAL) {
    await promptInput(chatId, msgId, token, PROMPTS.ai_technical, 'AWAITING_AI_TECHNICAL');
    return;
  }
  if (data === CB.ACTION_QUICK_SUMMARY) {
    await promptInput(chatId, msgId, token, PROMPTS.quick_summary, 'AWAITING_QUICK_SUMMARY');
    return;
  }
  if (data === CB.ACTION_COMPARE) {
    await promptInput(chatId, msgId, token, PROMPTS.compare_company1, 'AWAITING_COMPARE_COMPANY1');
    return;
  }
  if (data === CB.ACTION_RISK_DETECTION) {
    await promptInput(chatId, msgId, token, PROMPTS.risk_detection, 'AWAITING_RISK_DETECTION');
    return;
  }
  if (data === CB.ACTION_MARKET_INSIGHT) {
    await handleMarketInsight(chatId, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── Search actions ────────────────────────────────────────────────────────────
  if (data === CB.ACTION_SEARCH_TICKER) {
    await promptInput(chatId, msgId, token, PROMPTS.search_ticker, 'AWAITING_SEARCH_TICKER');
    return;
  }
  if (data === CB.ACTION_SEARCH_LATEST) { await handleSearchLatest(chatId, token, supabaseUrl, supabaseKey, 'latest'); return; }
  if (data === CB.ACTION_SEARCH_TODAY)  { await handleSearchLatest(chatId, token, supabaseUrl, supabaseKey, 'today');  return; }
  if (data === CB.ACTION_SEARCH_WEEK)   { await handleSearchLatest(chatId, token, supabaseUrl, supabaseKey, 'week');   return; }
  if (data === CB.ACTION_SEARCH_TOP)    { await handleSearchLatest(chatId, token, supabaseUrl, supabaseKey, 'top');    return; }
  if (data === CB.ACTION_SEARCH_ANALYST){ await editWithMenu(chatId, msgId, token, '👤 <b>Search by Analyst</b>\n\n<i>Coming soon — use the platform search for now.</i>', [[ { text: CTA.open_platform, url: `${BASE_URL}/search` }, { text: CTA.back_to_menu, callback_data: CB.MENU_MAIN } ]]); return; }
  if (data === CB.ACTION_SEARCH_MARKET) { await editWithMenu(chatId, msgId, token, '🌍 <b>Search by Market</b>\n\n<i>Coming soon — use the platform search for now.</i>', [[ { text: CTA.open_platform, url: `${BASE_URL}/search` }, { text: CTA.back_to_menu, callback_data: CB.MENU_MAIN } ]]); return; }

  // ── Trade actions ─────────────────────────────────────────────────────────────
  if (data === CB.ACTION_TRADES_LATEST  || data === CB.ACTION_TRADES_OPEN   ||
      data === CB.ACTION_TRADES_CLOSED  || data === CB.ACTION_TRADES_HIGH   ||
      data === CB.ACTION_TRADES_INDICES || data === CB.ACTION_TRADES_STOCKS) {
    await handleTradesAction(chatId, msgId, data, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── Report actions ────────────────────────────────────────────────────────────
  if (data === CB.ACTION_REPORTS_DAILY  || data === CB.ACTION_REPORTS_WEEKLY ||
      data === CB.ACTION_REPORTS_RECAP  || data === CB.ACTION_REPORTS_INDEX  ||
      data === CB.ACTION_REPORTS_SECTOR) {
    await handleReportsAction(chatId, msgId, data, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── Discover actions ──────────────────────────────────────────────────────────
  if (data.startsWith('ACTION:discover_')) {
    await handleDiscoverAction(chatId, msgId, data, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── Asset Lookup actions ──────────────────────────────────────────────────────
  if (data === CB.ACTION_ASSET_STOCK   || data === CB.ACTION_ASSET_INDEX  ||
      data === CB.ACTION_ASSET_ETF     || data === CB.ACTION_ASSET_SECTOR ||
      data === CB.ACTION_ASSET_SNAPSHOT) {
    await promptInput(chatId, msgId, token, PROMPTS.asset_lookup, 'AWAITING_ASSET_LOOKUP');
    return;
  }

  // ── My Space ──────────────────────────────────────────────────────────────────
  if (data.startsWith('ACTION:myspace_')) {
    await handleMySpace(chatId, msgId, data, token, supabaseUrl, supabaseKey);
    return;
  }

  // ── Help actions ──────────────────────────────────────────────────────────────
  if (data === CB.ACTION_HELP_HOWTO)      { await editWithMenu(chatId, msgId, token, HELP.how_to_use,    helpMenuKeyboard()); return; }
  if (data === CB.ACTION_HELP_AI_HOW)     { await editWithMenu(chatId, msgId, token, HELP.how_ai_works,  helpMenuKeyboard()); return; }
  if (data === CB.ACTION_HELP_FAQ)        { await editWithMenu(chatId, msgId, token, HELP.faq,           helpMenuKeyboard()); return; }
  if (data === CB.ACTION_HELP_DISCLAIMER) { await editWithMenu(chatId, msgId, token, HELP.disclaimer,    helpMenuKeyboard()); return; }
  if (data === CB.ACTION_HELP_CONTACT)    { await editWithMenu(chatId, msgId, token, HELP.contact,       helpMenuKeyboard()); return; }

  // ── Direct-ticker shortcuts (from asset snapshot / search results) ────────────
  if (data.startsWith('ACTION:search_ticker_direct:')) {
    const ticker = data.split(':')[2];
    if (ticker) {
      await editMessage(token, chatId, msgId, `⏳ <i>Searching ${escapeHtml(ticker)}…</i>`);
      await runTickerSearch(ticker, chatId, msgId, token, supabaseUrl, supabaseKey);
    }
    return;
  }

  if (data.startsWith('ACTION:ai_ticker:')) {
    const ticker = data.split(':')[2];
    if (ticker) {
      await runAiFinancial(ticker, chatId, msgId, token, supabaseUrl, supabaseKey);
    }
    return;
  }

  // ── Legacy pagination (ANALYSES:SYMBOL:PAGE) ─────────────────────────────────
  if (data.startsWith('ANALYSES:')) {
    const parts = data.split(':');
    if (parts.length === 3) {
      const symbol = parts[1];
      const page   = parseInt(parts[2], 10);
      if (symbol && !isNaN(page)) {
        await editMessage(token, chatId, msgId, `⏳ <i>Loading page ${page}…</i>`);
        await runTickerSearch(symbol, chatId, msgId, token, supabaseUrl, supabaseKey, page);
      }
    }
    return;
  }
}

// ─── State Machine Input Handler ─────────────────────────────────────────────

async function handleStateInput(
  chatId:       string,
  text:         string,
  token:        string,
  supabaseUrl:  string,
  supabaseKey:  string
) {
  const sessions = getSessionManager();
  const session  = await sessions.get(chatId);

  switch (session.state as BotState) {

    case 'AWAITING_AI_FINANCIAL': {
      const ticker = text.toUpperCase().trim();
      await sessions.reset(chatId);
      const msgId = await sendMessage(token, chatId, LOADING.ai_financial[0]);
      await runAiFinancial(ticker, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'AWAITING_AI_TECHNICAL': {
      const ticker = text.toUpperCase().trim();
      await sessions.reset(chatId);
      const msgId = await sendMessage(token, chatId, LOADING.ai_technical[0]);
      await runAiTechnical(ticker, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'AWAITING_QUICK_SUMMARY': {
      const ticker = text.toUpperCase().trim();
      await sessions.reset(chatId);
      const msgId = await sendMessage(token, chatId, LOADING.quick_summary[0]);
      await runQuickSummary(ticker, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'AWAITING_COMPARE_COMPANY1': {
      await sessions.set(chatId, 'AWAITING_COMPARE_COMPANY2', { company1: text.toUpperCase().trim() });
      await sendMessage(token, chatId, PROMPTS.compare_company2(text.toUpperCase().trim()));
      break;
    }

    case 'AWAITING_COMPARE_COMPANY2': {
      const company1 = (session.context.company1 as string) || '';
      const company2 = text.toUpperCase().trim();
      await sessions.reset(chatId);
      const msgId = await sendMessage(token, chatId, LOADING.compare[0]);
      await runCompare(company1, company2, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'AWAITING_RISK_DETECTION': {
      const ticker = text.toUpperCase().trim();
      await sessions.reset(chatId);
      const msgId = await sendMessage(token, chatId, '⏳ <i>Detecting risks…\nكشف المخاطر…</i>');
      await runRiskDetection(ticker, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'AWAITING_SEARCH_TICKER': {
      await sessions.reset(chatId);
      const validation = validateAndNormalizeSymbol(text);
      if (!validation.valid) {
        await sendMessage(token, chatId, ERRORS.invalid_ticker, [
          [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
        ]);
        return;
      }
      const msgId = await sendMessage(token, chatId, `⏳ <i>Searching ${escapeHtml(validation.normalized!)}…</i>`);
      await runTickerSearch(validation.normalized!, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'AWAITING_ASSET_LOOKUP': {
      await sessions.reset(chatId);
      const msgId = await sendMessage(token, chatId, `⏳ <i>Looking up ${escapeHtml(text)}…\nجارٍ البحث…</i>`);
      await runAssetLookup(text.toUpperCase().trim(), chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      break;
    }

    case 'IDLE':
    default: {
      // Fall back to ticker search if it looks like a symbol
      const validation = validateAndNormalizeSymbol(text);
      if (validation.valid) {
        const msgId = await sendMessage(token, chatId, `⏳ <i>Searching ${escapeHtml(validation.normalized!)}…</i>`);
        await runTickerSearch(validation.normalized!, chatId, msgId ?? undefined, token, supabaseUrl, supabaseKey);
      } else {
        // Unknown input → show main menu
        await sendMessage(token, chatId,
          '💡 <i>Use the menu to navigate or type a ticker symbol to search.\nاستخدم القائمة أو أدخل رمز سهم للبحث.</i>',
          mainMenuKeyboard()
        );
      }
      break;
    }
  }
}

// ─── Account Link ─────────────────────────────────────────────────────────────

async function handleLinkAccount(
  chatId:      string,
  code:        string,
  username:    string | undefined,
  firstName:   string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: linkCode } = await supabase
    .from('telegram_link_codes')
    .select('user_id, used_at, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!linkCode || linkCode.used_at || new Date(linkCode.expires_at) < new Date()) {
    await sendMessage(token, chatId, LINK_INVALID_CODE, mainMenuKeyboard());
    return;
  }

  const { data: existingAccount } = await supabase
    .from('telegram_accounts')
    .select('id')
    .eq('user_id', linkCode.user_id)
    .is('revoked_at', null)
    .maybeSingle();

  if (existingAccount) {
    await sendMessage(token, chatId, LINK_ALREADY, mainMenuKeyboard());
    return;
  }

  await supabase.from('telegram_accounts').insert({
    user_id:  linkCode.user_id,
    chat_id:  chatId,
    username: username || null,
  });

  await supabase
    .from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code);

  await supabase
    .from('notification_preferences')
    .update({ telegram_enabled: true })
    .eq('user_id', linkCode.user_id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', linkCode.user_id)
    .maybeSingle();

  const name = (profile as any)?.full_name || firstName || 'there';
  await sendMessage(token, chatId, LINK_SUCCESS(name), mainMenuKeyboard());
}

async function tryAutoLink(
  chatId:      string,
  username:    string,
  firstName:   string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: usernameLink } = await supabase
    .from('telegram_username_links')
    .select('user_id, expires_at')
    .eq('telegram_username', username.toLowerCase())
    .eq('status', 'pending')
    .maybeSingle();

  if (!usernameLink || new Date(usernameLink.expires_at) < new Date()) return false;

  const { data: existingAccount } = await supabase
    .from('telegram_accounts')
    .select('id')
    .eq('user_id', usernameLink.user_id)
    .is('revoked_at', null)
    .maybeSingle();

  if (existingAccount) return false;

  await supabase.from('telegram_accounts').insert({
    user_id:  usernameLink.user_id,
    chat_id:  chatId,
    username,
  });

  await supabase
    .from('telegram_username_links')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('telegram_username', username.toLowerCase())
    .eq('user_id', usernameLink.user_id);

  await supabase
    .from('notification_preferences')
    .update({ telegram_enabled: true })
    .eq('user_id', usernameLink.user_id);

  await sendMessage(token, chatId, LINK_SUCCESS(firstName), mainMenuKeyboard());
  return true;
}

async function handleStatus(
  chatId:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from('telegram_accounts')
    .select('linked_at')
    .eq('chat_id', chatId)
    .is('revoked_at', null)
    .maybeSingle();

  if (data) {
    const since = new Date((data as any).linked_at).toLocaleDateString('en-GB');
    await sendMessage(token, chatId, STATUS_LINKED(since), mainMenuKeyboard());
  } else {
    await sendMessage(token, chatId, STATUS_NOT_LINKED, mainMenuKeyboard());
  }
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

async function sendWelcome(
  chatId:      string,
  firstName:   string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from('telegram_accounts')
    .select('linked_at')
    .eq('chat_id', chatId)
    .is('revoked_at', null)
    .maybeSingle();

  const text = data
    ? WELCOME_LINKED_TEXT(firstName || 'there')
    : WELCOME_TEXT;

  await sendMessage(token, chatId, text, mainMenuKeyboard());
}

async function sendMainMenu(chatId: string, token: string) {
  await sendMessage(token, chatId,
    '📊 <b>AnalyzingHub — Main Menu | القائمة الرئيسية</b>\n\nSelect a service to begin:\nاختر خدمة للبدء:',
    mainMenuKeyboard()
  );
}

// ─── Edit helpers ─────────────────────────────────────────────────────────────

async function editMainMenu(chatId: string, msgId: number, token: string) {
  await editMessage(token, chatId, msgId,
    '📊 <b>AnalyzingHub — Main Menu | القائمة الرئيسية</b>\n\nSelect a service:\nاختر خدمة:',
    mainMenuKeyboard()
  );
}

async function editWithMenu(
  chatId:   string,
  msgId:    number,
  token:    string,
  text:     string,
  keyboard: any[][]
) {
  await editMessage(token, chatId, msgId, text, keyboard);
}

async function promptInput(
  chatId:   string,
  msgId:    number,
  token:    string,
  prompt:   string,
  state:    BotState
) {
  await editMessage(token, chatId, msgId, prompt, [
    [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
  ]);
  const sessions = getSessionManager();
  await sessions.set(chatId, state);
}

// ─── AI: Financial Analysis ───────────────────────────────────────────────────

async function runAiFinancial(
  ticker:      string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const updateMsg = async (text: string) => {
    if (msgId) {
      await editMessage(token, chatId, msgId, text);
    }
  };

  await updateMsg(LOADING.ai_financial[1]);

  try {
    const res = await fetch(`${BASE_URL}/api/ai/financial-analysis`, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ ticker, chat_id: chatId }),
    });

    await updateMsg(LOADING.ai_financial[2]);

    if (!res.ok) throw new Error(`AI endpoint error: ${res.status}`);

    const data = await res.json();

    await updateMsg(LOADING.ai_financial[3]);

    const publicUrl = `${BASE_URL}/public/analysis/${data.slug}`;
    const preview   = RESULT_PREVIEW.ai_financial(
      data.ticker || ticker,
      data.company_name || ticker,
      (data.telegram_preview || data.result?.executive_summary || '').substring(0, 280),
      publicUrl
    );

    if (msgId) {
      await editMessage(token, chatId, msgId, preview, analysisResultKeyboard(publicUrl, ticker));
    } else {
      await sendMessage(token, chatId, preview, analysisResultKeyboard(publicUrl, ticker));
    }
  } catch (err) {
    console.error('[runAiFinancial] error:', err);
    const errText = ERRORS.generic;
    if (msgId) await editMessage(token, chatId, msgId, errText, errorKeyboard());
    else await sendMessage(token, chatId, errText, errorKeyboard());
  }
}

// ─── AI: Technical Analysis ───────────────────────────────────────────────────

async function runAiTechnical(
  ticker:      string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const updateMsg = async (text: string) => {
    if (msgId) await editMessage(token, chatId, msgId, text);
  };

  await updateMsg(LOADING.ai_technical[1]);

  try {
    const res = await fetch(`${BASE_URL}/api/ai/technical-analysis`, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ ticker, chat_id: chatId }),
    });

    await updateMsg(LOADING.ai_technical[2]);

    if (!res.ok) throw new Error(`AI endpoint error: ${res.status}`);

    const data = await res.json();

    await updateMsg(LOADING.ai_technical[3]);

    const publicUrl = `${BASE_URL}/public/analysis/${data.slug}`;
    const bias      = data.result?.trend_bias || 'Neutral';
    const preview   = RESULT_PREVIEW.ai_technical(
      data.ticker || ticker,
      bias,
      (data.telegram_preview || data.result?.executive_summary || '').substring(0, 280),
      publicUrl
    );

    if (msgId) {
      await editMessage(token, chatId, msgId, preview, analysisResultKeyboard(publicUrl, ticker));
    } else {
      await sendMessage(token, chatId, preview, analysisResultKeyboard(publicUrl, ticker));
    }
  } catch (err) {
    console.error('[runAiTechnical] error:', err);
    const errText = ERRORS.generic;
    if (msgId) await editMessage(token, chatId, msgId, errText, errorKeyboard());
    else await sendMessage(token, chatId, errText, errorKeyboard());
  }
}

// ─── AI: Quick Summary ────────────────────────────────────────────────────────

async function runQuickSummary(
  ticker:      string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  try {
    const res = await fetch(`${BASE_URL}/api/ai/quick-summary`, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ ticker, chat_id: chatId }),
    });

    if (!res.ok) throw new Error(`AI endpoint error: ${res.status}`);

    const data = await res.json();
    const publicUrl = `${BASE_URL}/public/analysis/${data.slug}`;
    const preview   = RESULT_PREVIEW.quick_summary(
      data.ticker || ticker,
      (data.telegram_preview || '').substring(0, 380)
    );

    if (msgId) {
      await editMessage(token, chatId, msgId, preview, analysisResultKeyboard(publicUrl, ticker));
    } else {
      await sendMessage(token, chatId, preview, analysisResultKeyboard(publicUrl, ticker));
    }
  } catch (err) {
    console.error('[runQuickSummary] error:', err);
    const errText = ERRORS.generic;
    if (msgId) await editMessage(token, chatId, msgId, errText, errorKeyboard());
    else await sendMessage(token, chatId, errText, errorKeyboard());
  }
}

// ─── AI: Compare ──────────────────────────────────────────────────────────────

async function runCompare(
  company1:    string,
  company2:    string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  try {
    const res = await fetch(`${BASE_URL}/api/ai/compare-companies`, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ company1, company2, chat_id: chatId }),
    });

    if (!res.ok) throw new Error(`AI endpoint error: ${res.status}`);

    const data = await res.json();
    const publicUrl = `${BASE_URL}/public/analysis/${data.slug}`;
    const preview   = RESULT_PREVIEW.compare(
      company1, company2,
      (data.telegram_preview || '').substring(0, 320)
    );

    if (msgId) {
      await editMessage(token, chatId, msgId, preview, [
        [{ text: CTA.view_full_analysis, url: publicUrl }],
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ]);
    } else {
      await sendMessage(token, chatId, preview, [
        [{ text: CTA.view_full_analysis, url: publicUrl }],
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ]);
    }
  } catch (err) {
    console.error('[runCompare] error:', err);
    const errText = ERRORS.generic;
    if (msgId) await editMessage(token, chatId, msgId, errText, errorKeyboard());
    else await sendMessage(token, chatId, errText, errorKeyboard());
  }
}

// ─── AI: Risk Detection ───────────────────────────────────────────────────────

async function runRiskDetection(
  ticker:      string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  // Risk detection reuses the financial analysis endpoint with a specialised prompt type
  try {
    const res = await fetch(`${BASE_URL}/api/ai/financial-analysis`, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ ticker, chat_id: chatId, focus: 'risk' }),
    });

    if (!res.ok) throw new Error(`AI endpoint error: ${res.status}`);

    const data = await res.json();
    const publicUrl = `${BASE_URL}/public/analysis/${data.slug}`;
    const preview = `🔍 <b>Risk Analysis — ${escapeHtml(ticker)}</b>\n\n${(data.telegram_preview || '').substring(0, 350)}`;

    if (msgId) {
      await editMessage(token, chatId, msgId, preview, analysisResultKeyboard(publicUrl, ticker));
    } else {
      await sendMessage(token, chatId, preview, analysisResultKeyboard(publicUrl, ticker));
    }
  } catch (err) {
    console.error('[runRiskDetection] error:', err);
    const errText = ERRORS.generic;
    if (msgId) await editMessage(token, chatId, msgId, errText, errorKeyboard());
    else await sendMessage(token, chatId, errText, errorKeyboard());
  }
}

// ─── Market Insight ───────────────────────────────────────────────────────────

async function handleMarketInsight(
  chatId:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const msgId = await sendMessage(token, chatId, '⏳ <i>Generating market insight…\nجارٍ إعداد رؤية السوق…</i>');
  try {
    const res = await fetch(`${BASE_URL}/api/ai/quick-summary`, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ ticker: 'MARKET', mode: 'market_insight', chat_id: chatId }),
    });

    if (!res.ok) throw new Error('Market insight error');

    const data = await res.json();
    const publicUrl = `${BASE_URL}/public/analysis/${data.slug}`;
    const preview = `💡 <b>Smart Market Insight | رؤية ذكية للسوق</b>\n\n${(data.telegram_preview || '').substring(0, 380)}`;

    if (msgId) {
      await editMessage(token, chatId, msgId, preview, [
        [{ text: CTA.view_full_analysis, url: publicUrl }],
        [{ text: CTA.back_to_menu,       callback_data: CB.MENU_MAIN }],
      ]);
    }
  } catch {
    if (msgId) await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
  }
}

// ─── Platform Search ──────────────────────────────────────────────────────────

async function handleSearchLatest(
  chatId:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string,
  mode:        'latest' | 'today' | 'week' | 'top'
) {
  const msgId = await sendMessage(token, chatId, '⏳ <i>Loading analyses…\nجارٍ تحميل التحليلات…</i>');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from('analyses')
      .select(`
        id, title, direction, post_type, analysis_type, chart_frame, created_at,
        profiles:analyzer_id (full_name, display_name),
        symbols:symbol_id (symbol)
      `)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(8);

    const now = new Date();
    if (mode === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      query = query.gte('created_at', start) as any;
    } else if (mode === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', weekAgo) as any;
    }

    const { data: analyses, error } = await query;

    if (error || !analyses?.length) {
      const noResults = `📊 <b>No analyses found</b>\n\nلم يتم العثور على تحليلات.\nNo analyses found for this filter.\n\n<a href="${BASE_URL}/search">Browse on Platform →</a>`;
      if (msgId) await editMessage(token, chatId, msgId, noResults, [
        [{ text: CTA.open_platform, url: `${BASE_URL}/search` }],
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ]);
      return;
    }

    const modeLabel: Record<string, string> = {
      latest: 'Latest Analyses | آخر التحليلات',
      today:  "Today's Analyses | تحليلات اليوم",
      week:   "This Week | هذا الأسبوع",
      top:    'Top Rated | الأعلى تقييمًا',
    };

    let text = `📊 <b>${modeLabel[mode]}</b>\n\n`;
    const btnItems: Array<{ analysis_id: string; num: number }> = [];

    analyses.forEach((a: any, i) => {
      const symbol   = a.symbols?.symbol || 'N/A';
      const analyst  = a.profiles?.display_name || a.profiles?.full_name || 'Unknown';
      const title    = truncateText(a.title || `Analysis #${i + 1}`, 55);
      const dirEmoji = a.direction === 'Long' ? '📈' : a.direction === 'Short' ? '📉' : '➡️';
      const date     = formatDateForTelegram(a.created_at);

      text += `${i + 1}. ${dirEmoji} <b>${escapeHtml(title)}</b>\n`;
      text += `   <code>${escapeHtml(symbol)}</code> · ${escapeHtml(analyst)} · ${date}\n\n`;
      btnItems.push({ analysis_id: a.id, num: i + 1 });
    });

    const keyboard = searchResultKeyboard(btnItems, { currentPage: 1, totalPages: 1, symbol: '' }, BASE_URL);

    if (msgId) await editMessage(token, chatId, msgId, text, keyboard);
    else await sendMessage(token, chatId, text, keyboard);

  } catch (err) {
    console.error('[handleSearchLatest] error:', err);
    if (msgId) await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
  }
}

async function runTickerSearch(
  symbol:      string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string,
  page:        number = 1
) {
  const pageSize = 8;
  const apiUrl   = `${BASE_URL}/api/telegram/query-symbol`;

  try {
    const res = await fetch(apiUrl, {
      method:  'POST',
      headers: {
        'Content-Type':                   'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({ symbol, page, pageSize, chatId }),
    });

    if (!res.ok) throw new Error('query-symbol error');

    const result = await res.json();

    if (result.rateLimited) {
      const txt = ERRORS.rate_limit;
      if (msgId) await editMessage(token, chatId, msgId, txt, [[ { text: CTA.back_to_menu, callback_data: CB.MENU_MAIN } ]]);
      else await sendMessage(token, chatId, txt);
      return;
    }

    if (!result.analyses?.length) {
      const txt = ERRORS.no_results(symbol);
      const kb = [
        [{ text: '🧠 AI Analyse Instead | تحليل ذكي', callback_data: `ACTION:ai_ticker:${symbol}` }],
        [{ text: CTA.search_website, url: `${BASE_URL}/search?symbol=${encodeURIComponent(symbol)}` }],
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ];
      if (msgId) await editMessage(token, chatId, msgId, txt, kb);
      else await sendMessage(token, chatId, txt, kb);
      return;
    }

    const { analyses, pagination } = result;
    let text = `📊 <b>Analyses for ${escapeHtml(symbol)}</b>\n`;
    text += `<i>${pagination.totalCount} result${pagination.totalCount !== 1 ? 's' : ''}`;
    if (pagination.totalPages > 1) text += ` · Page ${pagination.currentPage}/${pagination.totalPages}`;
    text += '</i>\n\n';

    const btnItems: Array<{ analysis_id: string; num: number }> = [];
    analyses.forEach((a: any, i: number) => {
      const num       = (pagination.currentPage - 1) * pageSize + i + 1;
      const title     = truncateText(a.title || `#${num}`, 55);
      const analyst   = a.analyzer_display_name || a.analyzer_name || 'Unknown';
      const dirEmoji  = a.direction === 'Long' ? '📈' : a.direction === 'Short' ? '📉' : '➡️';
      const date      = formatDateForTelegram(a.created_at);

      text += `${num}. ${dirEmoji} <b>${escapeHtml(title)}</b>\n`;
      text += `   👤 ${escapeHtml(analyst)} · ${date}\n\n`;
      btnItems.push({ analysis_id: a.analysis_id, num });
    });

    const keyboard = searchResultKeyboard(
      btnItems,
      { currentPage: pagination.currentPage, totalPages: pagination.totalPages, symbol },
      BASE_URL
    );

    if (msgId) await editMessage(token, chatId, msgId, text, keyboard);
    else await sendMessage(token, chatId, text, keyboard);

  } catch (err) {
    console.error('[runTickerSearch] error:', err);
    if (msgId) await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
    else await sendMessage(token, chatId, ERRORS.generic, errorKeyboard());
  }
}

// ─── Trades ───────────────────────────────────────────────────────────────────

async function handleTradesAction(
  chatId:      string,
  msgId:       number,
  action:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  await editMessage(token, chatId, msgId, '⏳ <i>Loading trades…\nجارٍ تحميل الصفقات…</i>');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const isOpen    = action === CB.ACTION_TRADES_OPEN;
    const isClosed  = action === CB.ACTION_TRADES_CLOSED;
    const isIndices = action === CB.ACTION_TRADES_INDICES;

    let query;

    if (isIndices) {
      query = supabase
        .from('index_trades')
        .select('id, direction, entry_price, stop_price, status, created_at, index_analyses(ticker, title)')
        .order('created_at', { ascending: false })
        .limit(8);

      if (isOpen)   query = query.eq('status', 'open') as any;
      if (isClosed) query = query.eq('status', 'closed') as any;

    } else {
      query = supabase
        .from('analyses')
        .select(`
          id, title, direction, post_type, stop_loss, created_at, status,
          profiles:analyzer_id (full_name, display_name),
          symbols:symbol_id (symbol),
          analysis_targets (price)
        `)
        .order('created_at', { ascending: false })
        .limit(8);

      if (isOpen)   query = query.eq('status', 'open') as any;
      if (isClosed) query = query.in('status', ['closed', 'completed']) as any;
    }

    const { data, error } = await query;

    if (error || !data?.length) {
      await editMessage(token, chatId, msgId,
        '📈 <b>No trades found | لا توجد صفقات</b>\n\nلم يتم العثور على صفقات.\nNo trades found for this filter.',
        [
          [{ text: '🌐 View All Trades | عرض الكل', url: `${BASE_URL}/dashboard` }],
          [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
        ]
      );
      return;
    }

    const labelMap: Record<string, string> = {
      [CB.ACTION_TRADES_LATEST]:  'Latest Trades | أحدث الصفقات',
      [CB.ACTION_TRADES_OPEN]:    'Open Trades | الصفقات المفتوحة',
      [CB.ACTION_TRADES_CLOSED]:  'Closed Trades | الصفقات المغلقة',
      [CB.ACTION_TRADES_HIGH]:    'High Conviction | عالية الثقة',
      [CB.ACTION_TRADES_INDICES]: 'Index Trades | صفقات المؤشرات',
      [CB.ACTION_TRADES_STOCKS]:  'Stock Trades | صفقات الأسهم',
    };

    let text = `📈 <b>${labelMap[action] || 'Trades | الصفقات'}</b>\n\n`;
    const openBtns: Array<{ text: string; url: string }> = [];

    data.forEach((t: any, i: number) => {
      const symbol   = t.symbols?.symbol || t.index_analyses?.ticker || 'N/A';
      const title    = truncateText(t.title || t.index_analyses?.title || `Trade #${i + 1}`, 50);
      const dir      = t.direction === 'Long' ? '📈 Long' : t.direction === 'Short' ? '📉 Short' : '➡️';
      const status   = t.status || '';
      const statusBadge = status === 'open' ? '🟢' : status === 'closed' ? '🔴' : '🟡';
      const date     = formatDateForTelegram(t.created_at);

      text += `${i + 1}. ${statusBadge} ${dir} <b>${escapeHtml(title)}</b>\n`;
      text += `   <code>${escapeHtml(symbol)}</code> · ${date}\n\n`;

      openBtns.push({
        text: `${i + 1}. Open`,
        url:  `${BASE_URL}/share/${t.id}`,
      });
    });

    // Buttons 2 per row
    const btnRows: any[][] = [];
    openBtns.forEach(b => {
      const last = btnRows[btnRows.length - 1];
      if (!last || last.length >= 2) btnRows.push([b]);
      else last.push(b);
    });

    const keyboard = [
      ...btnRows,
      [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
    ];

    await editMessage(token, chatId, msgId, text, keyboard);

  } catch (err) {
    console.error('[handleTradesAction] error:', err);
    await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
  }
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function handleReportsAction(
  chatId:      string,
  msgId:       number,
  action:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  await editMessage(token, chatId, msgId, '⏳ <i>Loading report…\nجارٍ تحميل التقرير…</i>');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const periodMap: Record<string, string> = {
      [CB.ACTION_REPORTS_DAILY]:  'daily',
      [CB.ACTION_REPORTS_WEEKLY]: 'weekly',
      [CB.ACTION_REPORTS_RECAP]:  'daily',
      [CB.ACTION_REPORTS_INDEX]:  'daily',
      [CB.ACTION_REPORTS_SECTOR]: 'daily',
    };

    const period = periodMap[action] || 'daily';

    const { data: report } = await supabase
      .from('daily_trade_reports')
      .select('id, title, summary, period_type, report_date, pdf_file_url, created_at')
      .eq('period_type', period)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!report) {
      await editMessage(token, chatId, msgId, ERRORS.no_reports, [
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ]);
      return;
    }

    const r = report as any;
    const titleText = r.title || `${period.charAt(0).toUpperCase() + period.slice(1)} Report`;
    const summary   = truncateText(r.summary || 'Report available.', 350);
    const date      = formatDateForTelegram(r.report_date || r.created_at);

    let text = `📋 <b>${escapeHtml(titleText)}</b>\n`;
    text += `<i>${date}</i>\n\n`;
    text += `${escapeHtml(summary)}`;

    const reportUrl = r.pdf_file_url || `${BASE_URL}/dashboard/reports`;

    await editMessage(token, chatId, msgId, text, reportResultKeyboard(reportUrl));

  } catch (err) {
    console.error('[handleReportsAction] error:', err);
    await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
  }
}

// ─── Discover ─────────────────────────────────────────────────────────────────

async function handleDiscoverAction(
  chatId:      string,
  msgId:       number,
  action:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  await editMessage(token, chatId, msgId, '⏳ <i>Loading…\nجارٍ التحميل…</i>');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const directionFilter: Record<string, string | null> = {
      [CB.ACTION_DISCOVER_BULLISH]: 'Long',
      [CB.ACTION_DISCOVER_BEARISH]: 'Short',
    };
    const dir = directionFilter[action];

    let query = supabase
      .from('analyses')
      .select(`
        id, title, direction, post_type, created_at,
        profiles:analyzer_id (full_name, display_name),
        symbols:symbol_id (symbol)
      `)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(8);

    if (dir) query = query.eq('direction', dir) as any;

    const { data: analyses, error } = await query;

    if (error || !analyses?.length) {
      await editMessage(token, chatId, msgId,
        '🌟 <b>No content found | لا يوجد محتوى</b>\n\nتحقق لاحقًا.\nCheck back later.',
        [[{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }]]
      );
      return;
    }

    const labelMap: Record<string, string> = {
      [CB.ACTION_DISCOVER_TRENDING]:  'Trending | الرائجة',
      [CB.ACTION_DISCOVER_VIEWED]:    'Most Viewed | الأكثر مشاهدة',
      [CB.ACTION_DISCOVER_DISCUSSED]: 'Most Discussed | الأكثر تفاعلًا',
      [CB.ACTION_DISCOVER_BULLISH]:   'Most Bullish | الأكثر إيجابية',
      [CB.ACTION_DISCOVER_BEARISH]:   'Most Bearish | الأكثر سلبية',
      [CB.ACTION_DISCOVER_PICKS]:     "Editor's Picks | اختيارات مميزة",
    };

    let text = `🌟 <b>${labelMap[action] || 'Discover | الاستكشاف'}</b>\n\n`;
    const btnItems: Array<{ analysis_id: string; num: number }> = [];

    analyses.forEach((a: any, i: number) => {
      const symbol  = a.symbols?.symbol || 'N/A';
      const analyst = a.profiles?.display_name || a.profiles?.full_name || 'Unknown';
      const title   = truncateText(a.title || `#${i + 1}`, 55);
      const dirEmoji = a.direction === 'Long' ? '📈' : a.direction === 'Short' ? '📉' : '➡️';
      const date    = formatDateForTelegram(a.created_at);

      text += `${i + 1}. ${dirEmoji} <b>${escapeHtml(title)}</b>\n`;
      text += `   <code>${escapeHtml(symbol)}</code> · ${escapeHtml(analyst)} · ${date}\n\n`;
      btnItems.push({ analysis_id: a.id, num: i + 1 });
    });

    const btnRows: any[][] = [];
    btnItems.forEach(({ analysis_id, num }) => {
      const btn = { text: `${num}. Open`, url: `${BASE_URL}/share/${analysis_id}` };
      const last = btnRows[btnRows.length - 1];
      if (!last || last.length >= 2) btnRows.push([btn]);
      else last.push(btn);
    });

    await editMessage(token, chatId, msgId, text, [
      ...btnRows,
      [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
    ]);

  } catch (err) {
    console.error('[handleDiscoverAction] error:', err);
    await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
  }
}

// ─── Asset Lookup ─────────────────────────────────────────────────────────────

async function runAssetLookup(
  ticker:      string,
  chatId:      string,
  msgId:       number | undefined,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: symbol } = await supabase
      .from('symbols')
      .select('id, symbol, name, type, market, sector')
      .or(`symbol.ilike.${ticker},name.ilike.%${ticker}%`)
      .limit(1)
      .maybeSingle();

    const { data: analyses } = await supabase
      .from('analyses')
      .select('id')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1);

    const sym = symbol as any;
    const name   = sym?.name || ticker;
    const market = sym?.market || 'N/A';
    const type   = sym?.type || 'Stock';
    const sector = sym?.sector || '';

    let text = `🏢 <b>${escapeHtml(name)}</b>  <code>${escapeHtml(ticker)}</code>\n\n`;
    text += `📍 Market: ${escapeHtml(market)}  •  Type: ${escapeHtml(type)}\n`;
    if (sector) text += `🏭 Sector: ${escapeHtml(sector)}\n`;
    text += `\n`;
    text += `<i>Use the buttons below to view analyses, trades, or get an AI analysis.</i>\n`;
    text += `<i>استخدم الأزرار أدناه لعرض التحليلات أو الحصول على تحليل ذكي.</i>`;

    const keyboard = assetSnapshotKeyboard(ticker, BASE_URL);

    if (msgId) await editMessage(token, chatId, msgId, text, keyboard);
    else await sendMessage(token, chatId, text, keyboard);

  } catch (err) {
    console.error('[runAssetLookup] error:', err);
    if (msgId) await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
    else await sendMessage(token, chatId, ERRORS.generic, errorKeyboard());
  }
}

// ─── My Space ─────────────────────────────────────────────────────────────────

async function handleMySpace(
  chatId:      string,
  msgId:       number,
  action:      string,
  token:       string,
  supabaseUrl: string,
  supabaseKey: string
) {
  const supabase  = createClient(supabaseUrl, supabaseKey);
  const { data: account } = await supabase
    .from('telegram_accounts')
    .select('user_id')
    .eq('chat_id', chatId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!account) {
    await editMessage(token, chatId, msgId, ERRORS.not_linked, [
      [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
    ]);
    return;
  }

  const userId = (account as any).user_id;

  try {
    if (action === CB.ACTION_MYSPACE_SAVED) {
      const { data: saves } = await supabase
        .from('saves')
        .select('analysis_id, created_at, analyses(id, title, symbols:symbol_id(symbol))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8);

      if (!saves?.length) {
        await editMessage(token, chatId, msgId,
          '🔖 <b>Saved Analyses | المحفوظات</b>\n\nلا توجد تحليلات محفوظة.\nNo saved analyses yet.',
          [[{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }]]
        );
        return;
      }

      let text = '🔖 <b>Saved Analyses | التحليلات المحفوظة</b>\n\n';
      const btnRows: any[][] = [];

      (saves as any[]).forEach((s, i) => {
        const a      = s.analyses as any;
        const symbol = a?.symbols?.symbol || 'N/A';
        const title  = truncateText(a?.title || `#${i + 1}`, 55);
        text += `${i + 1}. <b>${escapeHtml(title)}</b> — <code>${escapeHtml(symbol)}</code>\n`;

        const btn = { text: `${i + 1}. Open`, url: `${BASE_URL}/share/${a?.id}` };
        const last = btnRows[btnRows.length - 1];
        if (!last || last.length >= 2) btnRows.push([btn]);
        else last.push(btn);
      });

      await editMessage(token, chatId, msgId, text, [
        ...btnRows,
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ]);
      return;
    }

    if (action === CB.ACTION_MYSPACE_WATCHLIST) {
      await editMessage(token, chatId, msgId,
        '👁 <b>Watchlist | قائمة المتابعة</b>\n\nManage your watchlist on the platform.\nأدر قائمة متابعتك من المنصة.',
        [
          [{ text: '🌐 Open Watchlist | قائمة المتابعة', url: `${BASE_URL}/dashboard` }],
          [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
        ]
      );
      return;
    }

    // Default: recently viewed
    await editMessage(token, chatId, msgId,
      '🕐 <b>Recently Viewed | شوهد مؤخرًا</b>\n\nView your activity on the platform.\nعرض نشاطك على المنصة.',
      [
        [{ text: '🌐 Open Activity | عرض النشاط', url: `${BASE_URL}/dashboard/activity` }],
        [{ text: CTA.back_to_menu, callback_data: CB.MENU_MAIN }],
      ]
    );

  } catch (err) {
    console.error('[handleMySpace] error:', err);
    await editMessage(token, chatId, msgId, ERRORS.generic, errorKeyboard());
  }
}
