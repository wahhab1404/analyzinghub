/**
 * Builds the Telegram message for an index analysis.
 *
 * This mirrors `formatAnalysisMessage` in the
 * `indices-telegram-publisher` edge function so that editing a published
 * message from the platform reproduces the exact same Arabic, RTL-anchored,
 * full-text layout.
 */

// Right-to-Left Mark — keeps Arabic text from flipping around Latin
// symbols / numbers / prices.
const RLM = '\u200F';

export const TELEGRAM_CAPTION_LIMIT = 1024;

function toRtlLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() ? RLM + line : line))
    .join('\n');
}

export interface IndexAnalysisLike {
  id: string;
  index_symbol: string;
  title: string;
  body?: string | null;
  timeframe?: string | null;
  schools_used?: string[] | null;
  invalidation_price?: number | string | null;
  author?: { full_name?: string | null } | null;
}

export function buildIndexAnalysisMessage(
  analysis: IndexAnalysisLike,
  baseUrl: string,
): { text: string; caption: string } {
  const analysisUrl = `${baseUrl}/dashboard/analysis/${analysis.id}`;
  const timeframe = analysis.timeframe || 'غير محدد';
  const schools = analysis.schools_used?.join('، ') || '';
  const authorName = analysis.author?.full_name || '';
  const invalidation =
    analysis.invalidation_price !== undefined &&
    analysis.invalidation_price !== null &&
    analysis.invalidation_price !== ''
      ? Number(analysis.invalidation_price)
      : null;

  let text = '📊 <b>تحليل جديد للمؤشر</b>\n\n';
  text += `${RLM}<b>المؤشر:</b> ${analysis.index_symbol}\n`;
  text += `${RLM}<b>الإطار الزمني:</b> ${timeframe}\n`;
  if (authorName) text += `${RLM}<b>المحلل:</b> ${authorName}\n`;
  if (schools) text += `${RLM}<b>الأدوات المستخدمة:</b> ${schools}\n`;

  text += `\n${RLM}<b>العنوان:</b> ${analysis.title}\n\n`;

  if (analysis.body) {
    text += `${toRtlLines(analysis.body)}\n\n`;
  }

  if (invalidation !== null && !Number.isNaN(invalidation)) {
    text += `${RLM}<b>⚠️ الإبطال:</b> ${invalidation.toFixed(2)}\n\n`;
  }

  text += `${RLM}<a href="${analysisUrl}">📈 عرض التحليل الكامل</a>`;

  let caption = '📊 <b>تحليل جديد للمؤشر</b>\n\n';
  caption += `${RLM}<b>المؤشر:</b> ${analysis.index_symbol} • ${timeframe}\n`;
  caption += `${RLM}<b>العنوان:</b> ${analysis.title}`;

  return { text, caption };
}
