/**
 * POST /api/ai/compare-companies
 *
 * Generates a structured side-by-side AI comparison of two companies.
 *
 * Body: { company1: string, company2: string, chat_id?: string, language?: string }
 * Response: { slug, company1, company2, telegram_preview, result }
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

const SYSTEM_PROMPT = `You are a senior equity research analyst specialising in comparative company analysis.
Produce a structured, data-driven side-by-side comparison with a clear investment perspective.
Output ONLY valid JSON matching the provided schema.`;

function buildUserPrompt(c1: string, c2: string, language: string): string {
  return `Compare these two companies/assets: ${c1} vs ${c2}
Language: ${language === 'ar' ? 'Arabic' : 'English'}

Return JSON:
{
  "company1": {
    "ticker": "${c1}",
    "name": "Full name",
    "market": "Market",
    "sector": "Sector"
  },
  "company2": {
    "ticker": "${c2}",
    "name": "Full name",
    "market": "Market",
    "sector": "Sector"
  },
  "telegram_preview": "2-3 sentence comparison preview for Telegram (no HTML)",
  "comparison_summary": "2-3 sentence high-level comparison",
  "financial_comparison": {
    "revenue_growth":    { "c1": "e.g. strong", "c2": "e.g. moderate", "winner": "${c1} | ${c2} | tied" },
    "profitability":     { "c1": "e.g. high margins", "c2": "e.g. lower margins", "winner": "${c1} | ${c2} | tied" },
    "balance_sheet":     { "c1": "e.g. strong", "c2": "e.g. moderate", "winner": "${c1} | ${c2} | tied" },
    "valuation":         { "c1": "e.g. fairly valued", "c2": "e.g. overvalued", "winner": "${c1} | ${c2} | tied" },
    "cash_generation":   { "c1": "e.g. excellent", "c2": "e.g. good", "winner": "${c1} | ${c2} | tied" }
  },
  "technical_comparison": {
    "trend":             { "c1": "bullish | bearish | neutral", "c2": "bullish | bearish | neutral" },
    "momentum":          { "c1": "strong | moderate | weak", "c2": "strong | moderate | weak" },
    "relative_strength": "Which is technically stronger and why"
  },
  "strengths": {
    "c1": ["strength1", "strength2"],
    "c2": ["strength1", "strength2"]
  },
  "risks": {
    "c1": ["risk1", "risk2"],
    "c2": ["risk1", "risk2"]
  },
  "scorecard": {
    "c1_score": "e.g. 7/10",
    "c2_score": "e.g. 8/10",
    "scoring_basis": "Brief explanation"
  },
  "overall_preference": {
    "preferred": "${c1} | ${c2} | Equal",
    "rationale": "Why one is preferred",
    "for_growth_investors": "${c1} | ${c2}",
    "for_value_investors": "${c1} | ${c2}",
    "for_income_investors": "${c1} | ${c2}"
  },
  "final_conclusion": "Comprehensive comparison conclusion",
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

  const company1 = (body.company1 || '').trim().toUpperCase();
  const company2 = (body.company2 || '').trim().toUpperCase();
  const chatId   = body.chat_id  || null;
  const language = body.language || 'en';

  if (!company1 || !company2) {
    return NextResponse.json({ error: 'company1 and company2 are required' }, { status: 400 });
  }

  try {
    const ai = await chatComplete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(company1, company2, language) },
      ],
      { json_mode: true, temperature: 0.25, max_tokens: 3000 }
    );

    const result = parseJsonResponse<any>(ai.content);

    const slug            = generateSlug('compare', `${company1}-${company2}`);
    const telegramPreview = result.telegram_preview || result.comparison_summary || '';

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('ai_analysis_results').insert({
      slug,
      analysis_type: 'compare',
      ticker:         `${company1}_${company2}`,
      company_name:   `${company1} vs ${company2}`,
      language,
      chat_id:        chatId,
      result,
      telegram_preview: telegramPreview,
    });

    return NextResponse.json({
      slug,
      company1,
      company2,
      telegram_preview: telegramPreview,
      result,
    });

  } catch (err: any) {
    console.error('[AI Compare] error:', err);
    if (err?.message?.includes('aborted')) {
      return NextResponse.json({ error: 'AI timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'AI analysis failed', detail: err?.message }, { status: 500 });
  }
}
