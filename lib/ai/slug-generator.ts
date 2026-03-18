/**
 * Slug generator for AI analysis public pages
 *
 * Format:  {type}-{ticker}-{timestamp}-{random4}
 * Example: financial-aapl-20260318-a3f9
 */

export function generateSlug(type: string, ticker: string): string {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6);
  const clean  = ticker.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
  return `${type}-${clean}-${date}-${random}`;
}
