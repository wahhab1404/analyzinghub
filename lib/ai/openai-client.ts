/**
 * OpenAI API Client — thin fetch wrapper
 *
 * Uses the native fetch API so no additional npm package is required.
 * Model is configurable via OPENAI_MODEL env var (default: gpt-4o).
 */

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIResponse {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL  = 'gpt-4o';
const TIMEOUT_MS     = 55_000; // 55 s (stay under Vercel/Netlify 60 s limit)

export async function chatComplete(
  messages:    ChatMessage[],
  opts?: {
    model?:       string;
    temperature?: number;
    max_tokens?:  number;
    json_mode?:   boolean;
  }
): Promise<OpenAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model       = opts?.model       ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const temperature = opts?.temperature ?? 0.3;
  const max_tokens  = opts?.max_tokens  ?? 3000;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  if (opts?.json_mode) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage:   data.usage,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Parse JSON from AI response — strips markdown code fences if present */
export function parseJsonResponse<T>(content: string): T {
  let cleaned = content.trim();
  // Strip ```json ... ``` fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  return JSON.parse(cleaned) as T;
}
