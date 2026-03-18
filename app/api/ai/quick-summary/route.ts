/**
 * POST /api/ai/quick-summary
 *
 * Generates a concise AI investment summary for a ticker or a general market insight.
 *
 * Body: { ticker: string, mode?: 'company' | 'market_insight', chat_id?: string, language?: string }
 * Response: { slug, ticker, telegram_preview, result }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chatComplete, parseJsonResponse } from '@/lib/ai/openai-client';
import { generateSlug } from '@/lib/ai/slug-generator';

function isAuthorized(req: NextRequest): boolean {
  const secret   = req.headers.get('x-telegram-bot-api-secret-token');
  const apiKey   = req.headers.get('x-api-key');
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && (secret === expected || apiKey === expected)) return true;
  if (!expected) return true;
  return false;
}

const SYSTEM_PROMPT = `You are a concise, high-signal investment analyst.
Produce a brief but insightful investment summary. Quality over quantity.
Output ONLY valid JSON matching the provided schema.`;

function buildCompanyPrompt(ticker: string, language: string): string {
  return `Write a quick investment summary for: ${ticker}
Language: ${language === 'ar' ? 'Arabic' : 'English'}

Return JSON:
{
  "ticker": "TICKER",
  "company_name": "Full name",
  "market": "Market",
  "sector": "Sector",
  "telegram_preview": "2-3 sentence summary for Telegram (no HTML)",
  "investment_stance": "bullish | neutral | bearish",
  "key_positives": ["positive1", "positive2", "positive3"],
  "key_risks": ["risk1", "risk2"],
  "valuation_note": "Brief valuation comment",
  "technical_note": "Brief technical comment",
  "summary": "3-4 sentence comprehensive summary",
  "conclusion": "One clear investment takeaway",
  "disclaimer": "For informational purposes only."
}`;
}

function buildMarketInsightPrompt(language: string): string {
  return `Write a smart market insight summary covering current macro conditions, key market themes, and what investors should watch.
Language: ${language === 'ar' ? 'Arabic' : 'English'}

Return JSON:
{
  "title": "Smart Market Insight",
  "telegram_preview": "2-3 sentence market overview for Telegram (no HTML)",
  "market_sentiment": "bullish | cautious | neutral | bearish",
  "key_themes": ["theme1", "theme2", "theme3"],
  "sectors_to_watch": ["sector1", "sector2"],
  "macro_factors": "Brief macro summary",
  "risks": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "summary": "3-4 sentence market overview",
  "conclusion": "Key actionable insight",
  "disclaimer": "For informational purposes only."
}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ticker   = (body.ticker || 'MARKET').trim().toUpperCase();
  const mode     = body.mode     || 'company';
  const chatId   = body.chat_id  || null;
  const language = body.language || 'en';

  const isMarketMode = mode === 'market_insight' || ticker === 'MARKET';

  try {
    const prompt = isMarketMode
      ? buildMarketInsightPrompt(language)
      : buildCompanyPrompt(ticker, language);

    const ai = await chatComplete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
      { json_mode: true, temperature: 0.3, max_tokens: 1500 }
    );

    const result = parseJsonResponse<any>(ai.content);

    const slug            = generateSlug('summary', isMarketMode ? 'market' : ticker);
    const telegramPreview = result.telegram_preview || result.summary || '';
    const companyName     = result.company_name || result.title || ticker;

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('ai_analysis_results').insert({
      slug,
      analysis_type: 'quick_summary',
      ticker:         isMarketMode ? 'MARKET' : ticker,
      company_name:   companyName,
      language,
      chat_id:        chatId,
      result,
      telegram_preview: telegramPreview,
    });

    return NextResponse.json({
      slug,
      ticker:          isMarketMode ? 'MARKET' : ticker,
      company_name:    companyName,
      telegram_preview: telegramPreview,
      result,
    });

  } catch (err: any) {
    console.error('[AI Quick Summary] error:', err);
    if (err?.message?.includes('aborted')) {
      return NextResponse.json({ error: 'AI timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'AI analysis failed', detail: err?.message }, { status: 500 });
  }
}
