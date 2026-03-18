/**
 * POST /api/ai/financial-analysis
 *
 * Generates a structured AI financial analysis for a given ticker.
 * Stores result in `ai_analysis_results` and returns the public slug.
 *
 * Body: { ticker: string, chat_id?: string, focus?: 'full' | 'risk', language?: 'en' | 'ar' | 'bilingual' }
 * Response: { slug, ticker, company_name, telegram_preview, result }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chatComplete, parseJsonResponse } from '@/lib/ai/openai-client';
import { generateSlug } from '@/lib/ai/slug-generator';

// ─── Auth guard (internal + webhook calls only) ───────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  const apiKey = req.headers.get('x-api-key');
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (expected && (secret === expected || apiKey === expected)) return true;
  if (!expected) return true; // dev mode
  return false;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(focus: string): string {
  return `You are an elite institutional financial analyst with expertise in equity research, fundamental analysis, and investment strategy.

Your task is to produce a comprehensive, structured financial analysis in JSON format.
Be precise, data-driven, and professional. Use institutional-quality language.
If you do not have real-time data, use your training knowledge and clearly note that data reflects your last training update.

Output ONLY valid JSON matching the schema provided. Do not add markdown or extra text.`;
}

function buildUserPrompt(ticker: string, focus: string, language: string): string {
  const focusNote = focus === 'risk'
    ? 'Focus especially on risk factors, financial vulnerabilities, and downside scenarios.'
    : 'Provide a comprehensive balanced analysis.';

  const langNote = language === 'ar'
    ? 'Generate the analysis content in Arabic.'
    : language === 'bilingual'
    ? 'Generate executive_summary and final_conclusion in both English and Arabic (separated by \\n\\n---\\n\\n).'
    : 'Generate in English.';

  return `Analyse the company/asset: ${ticker}

${focusNote}
${langNote}

Return a JSON object with this exact schema:
{
  "company_name": "Full company name",
  "ticker": "TICKER",
  "market": "e.g. NASDAQ / NYSE / Tadawul",
  "sector": "Sector name",
  "industry": "Industry name",
  "currency": "USD / SAR etc",
  "executive_summary": "2-3 sentence high-level summary",
  "telegram_preview": "Concise 2-3 sentence preview for Telegram message (no HTML)",
  "company_overview": {
    "description": "Brief business description",
    "founded": "Year",
    "headquarters": "City, Country",
    "employees": "Approx number"
  },
  "revenue_analysis": {
    "narrative": "Revenue growth analysis narrative",
    "trend": "growing | stable | declining",
    "key_drivers": ["driver1", "driver2"]
  },
  "profitability_analysis": {
    "narrative": "Profitability analysis",
    "net_income_trend": "growing | stable | declining",
    "gross_margin_pct": "e.g. 43%",
    "operating_margin_pct": "e.g. 28%"
  },
  "margin_analysis": {
    "narrative": "Margin analysis",
    "gross_margin": "value",
    "operating_margin": "value",
    "net_margin": "value",
    "trend": "expanding | stable | compressing"
  },
  "balance_sheet": {
    "narrative": "Balance sheet overview",
    "total_assets": "approx value",
    "total_liabilities": "approx value",
    "equity": "approx value",
    "health": "strong | moderate | weak"
  },
  "liquidity": {
    "narrative": "Liquidity position",
    "current_ratio": "value",
    "quick_ratio": "value",
    "assessment": "strong | adequate | tight"
  },
  "debt_leverage": {
    "narrative": "Debt analysis",
    "debt_to_equity": "value",
    "net_debt": "approx value",
    "assessment": "low | moderate | high | very high"
  },
  "cash_flow": {
    "narrative": "Cash flow quality analysis",
    "operating_cf_trend": "positive | negative | volatile",
    "free_cash_flow": "positive | negative",
    "quality": "high | moderate | low"
  },
  "valuation": {
    "narrative": "Valuation snapshot",
    "pe_ratio": "approx value or N/A",
    "pb_ratio": "approx value or N/A",
    "ps_ratio": "approx value or N/A",
    "ev_ebitda": "approx value or N/A",
    "assessment": "undervalued | fairly valued | overvalued"
  },
  "strengths": ["strength1", "strength2", "strength3"],
  "risks": ["risk1", "risk2", "risk3"],
  "investment_view": {
    "stance": "bullish | neutral | bearish | cautious",
    "rationale": "Investment rationale",
    "time_horizon": "short-term | medium-term | long-term"
  },
  "final_conclusion": "Comprehensive concluding paragraph",
  "disclaimer": "This analysis is for informational purposes only and does not constitute financial advice.",
  "data_note": "Analysis based on available data as of AI training cutoff. Verify with current sources."
}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

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
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ticker   = (body.ticker   || '').trim().toUpperCase();
  const chatId   = body.chat_id   || null;
  const focus    = body.focus     || 'full';
  const language = body.language  || 'en';

  if (!ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
  }

  try {
    const ai = await chatComplete(
      [
        { role: 'system', content: buildSystemPrompt(focus) },
        { role: 'user',   content: buildUserPrompt(ticker, focus, language) },
      ],
      { json_mode: true, temperature: 0.2, max_tokens: 3500 }
    );

    const result = parseJsonResponse<any>(ai.content);

    const slug          = generateSlug(focus === 'risk' ? 'risk' : 'financial', ticker);
    const telegramPreview = result.telegram_preview || result.executive_summary || '';
    const companyName   = result.company_name || ticker;

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('ai_analysis_results').insert({
      slug,
      analysis_type: 'financial',
      ticker:        result.ticker || ticker,
      company_name:  companyName,
      market:        result.market || null,
      language,
      chat_id:       chatId,
      result,
      telegram_preview: telegramPreview,
    });

    return NextResponse.json({
      slug,
      ticker:          result.ticker || ticker,
      company_name:    companyName,
      telegram_preview: telegramPreview,
      result,
    });

  } catch (err: any) {
    console.error('[AI Financial] error:', err);
    if (err?.message?.includes('aborted')) {
      return NextResponse.json({ error: 'AI timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'AI analysis failed', detail: err?.message }, { status: 500 });
  }
}
