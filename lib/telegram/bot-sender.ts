/**
 * Telegram Bot Sender Utilities
 *
 * Low-level helpers for making Telegram Bot API calls.
 * All functions resolve the bot token once and re-use it.
 */

import { createClient } from '@supabase/supabase-js';
import type { InlineKeyboard } from './menu-keyboards';

// ─── Token Resolution ─────────────────────────────────────────────────────────

export async function getBotToken(
  supabaseUrl: string,
  supabaseKey: string
): Promise<string | null> {
  // 1. Try DB (admin_settings override)
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'telegram_bot_token')
    .maybeSingle();

  if (data?.setting_value && data.setting_value !== 'YOUR_BOT_TOKEN_HERE') {
    return data.setting_value as string;
  }

  // 2. Fallback to env
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken && envToken !== 'YOUR_BOT_TOKEN_HERE') return envToken;

  return null;
}

// ─── Core Send / Edit ─────────────────────────────────────────────────────────

export async function sendMessage(
  token:    string,
  chatId:   string,
  text:     string,
  keyboard?: InlineKeyboard
): Promise<number | null> {
  const payload: Record<string, unknown> = {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (keyboard?.length) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('[BotSender] sendMessage error:', json);
    return null;
  }

  return json.result?.message_id ?? null;
}

export async function editMessage(
  token:     string,
  chatId:    string,
  messageId: number,
  text:      string,
  keyboard?: InlineKeyboard
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    chat_id:    chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (keyboard?.length) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const json = await res.json();
    console.error('[BotSender] editMessage error:', json);
    return false;
  }
  return true;
}

/**
 * Edit the caption of a previously-sent photo message. Returns true on success.
 */
export async function editMessageCaption(
  token:     string,
  chatId:    string,
  messageId: number,
  caption:   string,
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:    chatId,
      message_id: messageId,
      caption:    caption.slice(0, 1024),
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const json = await res.json();
    console.error('[BotSender] editMessageCaption error:', json);
    return false;
  }
  return true;
}

export async function answerCallback(
  token:           string,
  callbackQueryId: string,
  text?:           string
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

/**
 * Send a photo (PNG bytes or remote URL) to a Telegram chat with an optional
 * HTML caption. Returns the Telegram message_id on success or null on failure.
 *
 * - If `photo` is a Uint8Array/Buffer it is uploaded via multipart/form-data.
 * - If `photo` is a string it is passed straight through (URL or file_id).
 */
export async function sendPhoto(
  token: string,
  chatId: string,
  photo: Uint8Array | string,
  caption?: string,
): Promise<number | null> {
  try {
    if (typeof photo === 'string') {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo,
          caption: caption?.slice(0, 1024),
          parse_mode: 'HTML',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error('[BotSender] sendPhoto URL error:', json);
        return null;
      }
      return json.result?.message_id ?? null;
    }

    // Multipart upload from raw bytes
    const fd = new FormData();
    fd.append('chat_id', chatId);
    if (caption) fd.append('caption', caption.slice(0, 1024));
    fd.append('parse_mode', 'HTML');
    fd.append('photo', new Blob([photo], { type: 'image/png' }), 'auto-trade.png');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) {
      console.error('[BotSender] sendPhoto bytes error:', json);
      return null;
    }
    return json.result?.message_id ?? null;
  } catch (err: any) {
    console.error('[BotSender] sendPhoto threw:', err?.message);
    return null;
  }
}

export async function deleteMessage(
  token:     string,
  chatId:    string,
  messageId: number
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    console.error('[BotSender] deleteMessage error:', json);
    return false;
  }
  return true;
}
