/**
 * lib/polygon/client.ts
 *
 * Base Polygon REST client with retry, backoff, rate-limit handling, and logging.
 * Server-side only — never import in browser/client components.
 *
 * Usage:
 *   import { polygonFetch } from '@/lib/polygon/client';
 *   const data = await polygonFetch('/v3/snapshot/options/SPX/O:...');
 */

const API_KEY = process.env.POLYGON_API_KEY;
const BASE_URL = 'https://api.polygon.io';

// ── TYPES ─────────────────────────────────────────────────────────────────────

export interface PolygonClientOptions {
  retries?: number;      // default 3
  baseBackoffMs?: number; // default 1000
  timeoutMs?: number;    // default 10000
  logPrefix?: string;
}

export class PolygonError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'PolygonError';
  }
}

export class PolygonRateLimitError extends PolygonError {
  constructor(public readonly retryAfterMs: number) {
    super(429, `Polygon rate limited. Retry after ${retryAfterMs}ms`);
    this.name = 'PolygonRateLimitError';
  }
}

// ── CORE FETCH ────────────────────────────────────────────────────────────────

/**
 * Fetch a Polygon REST endpoint with automatic retry and exponential backoff.
 *
 * @param path     API path (e.g. '/v3/snapshot/options/SPX/O:SPX251219C05900000')
 * @param params   Additional query params (apiKey is added automatically)
 * @param options  Retry / timeout settings
 */
export async function polygonFetch<T = unknown>(
  path: string,
  params: Record<string, string> = {},
  options: PolygonClientOptions = {}
): Promise<T> {
  if (!API_KEY) {
    throw new Error('POLYGON_API_KEY environment variable is not set');
  }

  const {
    retries = 3,
    baseBackoffMs = 1000,
    timeoutMs = 10_000,
    logPrefix = '[Polygon]',
  } = options;

  const url = buildUrl(path, { ...params, apiKey: API_KEY });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : baseBackoffMs * Math.pow(2, attempt);

        console.warn(`${logPrefix} Rate limited (attempt ${attempt + 1}/${retries + 1}). Retry in ${retryAfterMs}ms`);

        if (attempt === retries) {
          throw new PolygonRateLimitError(retryAfterMs);
        }

        await sleep(retryAfterMs);
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const safeUrl = url.replace(API_KEY!, '[REDACTED]');
        console.error(`${logPrefix} HTTP ${response.status} for ${safeUrl}: ${body.slice(0, 300)}`);
        throw new PolygonError(response.status, `Polygon API error ${response.status}`, body);
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (err instanceof PolygonError || err instanceof PolygonRateLimitError) {
        throw err; // Already handled
      }

      if (err?.name === 'AbortError') {
        console.warn(`${logPrefix} Request timed out (attempt ${attempt + 1}/${retries + 1})`);
      } else {
        console.error(`${logPrefix} Network error (attempt ${attempt + 1}/${retries + 1}):`, err?.message);
      }

      if (attempt === retries) throw err;

      const backoff = baseBackoffMs * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  // TypeScript: unreachable but satisfies return type
  throw new Error('polygonFetch: exhausted retries');
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string>): string {
  const base = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const qs = new URLSearchParams(params).toString();
  return qs ? `${base}?${qs}` : base;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Redact the API key from a URL for safe logging */
export function redactKey(url: string): string {
  return url.replace(/apiKey=[^&]+/, 'apiKey=[REDACTED]');
}
