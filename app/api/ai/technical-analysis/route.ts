/**
 * POST /api/ai/technical-analysis
 *
 * Generates a structured AI technical analysis for a given asset ticker.
 * Stores result in `ai_analysis_results` and returns the public slug.
 *
 * Body: { ticker: string, chat_id?: string, timeframe?: string, language?: string }
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

const SYSTEM_PROMPT = `You are a senior technical analyst specialising in equity, crypto, and derivatives markets.
You produce structured, precise technical analyses that professional traders and investors rely on.
Use institutional-quality language. Provide concrete price levels where known from training data.
Output ONLY valid JSON matching the provided schema.`;

function buildUserPrompt(ticker: string, timeframe: string, language: string): string {
  const langNote = language === 'ar'
    ? 'Generate the analysis in Arabic.'
    : language === 'bilingual'
    ? 'executive_summary and final_conclusion should be bilingual (English then Arabic separated by \\n\\n---\\n\\n).'
    : 'Generate in English.';

  return `Perform a technical analysis for: ${ticker}
Primary timeframe focus: ${timeframe || 'weekly / daily'}
${langNote}

Return JSON with this exact schema:
{
  "asset_name": "Full asset / company name",
  "ticker": "TICKER",
  "market": "Market name",
  "asset_type": "stock | index | etf | crypto | forex",
  "primary_timeframe": "timeframe string",
  "executive_summary": "2-3 sentence technical overview",
  "telegram_preview": "Concise 2-3 sentence Telegram preview (no HTML)",
  "trend_bias": {
    "overall": "bullish | bearish | neutral",
    "short_term": "bullish | bearish | neutral",
    "medium_term": "bullish | bearish | neutral",
    "long_term": "bullish | bearish | neutral",
    "narrative": "Trend narrative"
  },
  "market_structure": {
    "pattern": "uptrend | downtrend | range | consolidation | breakout | breakdown",
    "description": "Market structure description",
    "higher_highs_lows": true,
    "key_pattern": "e.g. ascending triangle, head and shoulders, etc."
  },
  "momentum": {
    "rsi_reading": "e.g. 58 (neutral-bullish)",
    "macd_signal": "bullish crossover | bearish crossover | neutral",
    "volume_analysis": "above average | below average | normal",
    "narrative": "Momentum analysis narrative"
  },
  "support_levels": [
    { "price": "value", "strength": "strong | moderate | weak", "description": "why" },
    { "price": "value", "strength": "strong | moderate | weak", "description": "why" }
  ],
  "resistance_levels": [
    { "price": "value", "strength": "strong | moderate | weak", "description": "why" },
    { "price": "value", "strength": "strong | moderate | weak", "description": "why" }
  ],
  "scenarios": [
    {
      "label": "Bullish Scenario",
      "trigger": "What needs to happen",
      "target": "Price target",
      "probability": "high | medium | low"
    },
    {
      "label": "Bearish Scenario",
      "trigger": "What needs to happen",
      "target": "Price target",
      "probability": "high | medium | low"
    }
  ],
  "trigger_levels": ["level1 — description", "level2 — description"],
  "invalidation": {
    "level": "Price level",
    "description": "What invalidates the primary scenario"
  },
  "targets": [
    { "label": "Target 1", "price": "value", "timeframe": "short | medium | long" },
    { "label": "Target 2", "price": "value", "timeframe": "short | medium | long" }
  ],
  "multi_timeframe_view": {
    "weekly":  "bullish | bearish | neutral",
    "daily":   "bullish | bearish | neutral",
    "h4":      "bullish | bearish | neutral",
    "narrative": "Multi-timeframe alignment summary"
  },
  "key_levels_summary": "One-paragraph summary of the most critical price levels",
  "final_conclusion": "Comprehensive technical conclusion paragraph",
  "disclaimer": "This technical analysis is for informational purposes only.",
  "data_note": "Based on available price history in AI training data. Verify current prices."
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

  const ticker    = (body.ticker    || '').trim().toUpperCase();
  const chatId    = body.chat_id    || null;
  const timeframe = body.timeframe  || 'weekly/daily';
  const language  = body.language   || 'en';

  if (!ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
  }

  try {
    const ai = await chatComplete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(ticker, timeframe, language) },
      ],
      { json_mode: true, temperature: 0.25, max_tokens: 3200 }
    );

    const result = parseJsonResponse<any>(ai.content);

    const slug            = generateSlug('technical', ticker);
    const telegramPreview = result.telegram_preview || result.executive_summary || '';
    const assetName       = result.asset_name || ticker;

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('ai_analysis_results').insert({
      slug,
      analysis_type: 'technical',
      ticker:         result.ticker || ticker,
      company_name:   assetName,
      market:         result.market || null,
      language,
      chat_id:        chatId,
      result,
      telegram_preview: telegramPreview,
    });

    return NextResponse.json({
      slug,
      ticker:          result.ticker || ticker,
      asset_name:      assetName,
      telegram_preview: telegramPreview,
      result,
    });

  } catch (err: any) {
    console.error('[AI Technical] error:', err);
    if (err?.message?.includes('aborted')) {
      return NextResponse.json({ error: 'AI timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'AI analysis failed', detail: err?.message }, { status: 500 });
  }
}
