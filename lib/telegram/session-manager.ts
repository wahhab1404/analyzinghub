/**
 * Telegram Bot Session Manager
 *
 * Persists per-user conversation state in the `bot_sessions` Supabase table
 * so multi-step flows (e.g. "AI analysis → enter ticker") survive across
 * separate webhook invocations.
 *
 * State machine states
 * ────────────────────
 * IDLE                       Default — ticker-search or main menu
 * AWAITING_AI_FINANCIAL      Waiting for ticker / company name
 * AWAITING_AI_TECHNICAL      Waiting for asset ticker
 * AWAITING_QUICK_SUMMARY     Waiting for ticker / company name
 * AWAITING_COMPARE_COMPANY1  Waiting for first company
 * AWAITING_COMPARE_COMPANY2  Waiting for second company  (context.company1 set)
 * AWAITING_RISK_DETECTION    Waiting for ticker
 * AWAITING_SEARCH_TICKER     Waiting for search query
 * AWAITING_ASSET_LOOKUP      Waiting for asset ticker / name
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotState =
  | 'IDLE'
  | 'AWAITING_AI_FINANCIAL'
  | 'AWAITING_AI_TECHNICAL'
  | 'AWAITING_QUICK_SUMMARY'
  | 'AWAITING_COMPARE_COMPANY1'
  | 'AWAITING_COMPARE_COMPANY2'
  | 'AWAITING_RISK_DETECTION'
  | 'AWAITING_SEARCH_TICKER'
  | 'AWAITING_ASSET_LOOKUP';

export interface BotSession {
  chat_id:    string;
  state:      BotState;
  context:    Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Session Manager ──────────────────────────────────────────────────────────

export class SessionManager {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /** Get session for a chat_id.  Returns a default IDLE session if not found. */
  async get(chatId: string): Promise<BotSession> {
    const { data, error } = await this.supabase
      .from('bot_sessions')
      .select('*')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (error) {
      console.error('[SessionManager] get error:', error);
    }

    if (!data) {
      return {
        chat_id:    chatId,
        state:      'IDLE',
        context:    {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return data as BotSession;
  }

  /** Set state (and optional context merge) for a chat_id. */
  async set(
    chatId:  string,
    state:   BotState,
    context: Record<string, unknown> = {}
  ): Promise<void> {
    const { error } = await this.supabase
      .from('bot_sessions')
      .upsert(
        { chat_id: chatId, state, context },
        { onConflict: 'chat_id' }
      );

    if (error) {
      console.error('[SessionManager] set error:', error);
    }
  }

  /** Reset to IDLE with empty context. */
  async reset(chatId: string): Promise<void> {
    await this.set(chatId, 'IDLE', {});
  }

  /** Update only the context object (merge, not replace). */
  async updateContext(
    chatId:  string,
    partial: Record<string, unknown>
  ): Promise<void> {
    const session = await this.get(chatId);
    const merged  = { ...session.context, ...partial };
    await this.set(chatId, session.state, merged);
  }
}

// ─── Factory (singleton per request) ─────────────────────────────────────────

let _manager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!_manager) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars missing for SessionManager');
    _manager = new SessionManager(url, key);
  }
  return _manager;
}
