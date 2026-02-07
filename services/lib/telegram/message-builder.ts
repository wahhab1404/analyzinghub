/**
 * Telegram Message Builder for Analysis Results
 *
 * Formats analysis data into clean, professional Telegram messages
 * with inline keyboard buttons.
 */

import { escapeHtml, formatDateForTelegram, truncateText } from './symbol-utils';

export interface AnalysisResult {
  analysis_id: string;
  analyzer_name: string;
  analyzer_display_name: string | null;
  title: string | null;
  summary: string | null;
  post_type: string;
  analysis_type: string;
  direction: string | null;
  chart_frame: string | null;
  created_at: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

/**
 * Build Telegram message for analysis results
 *
 * @param symbol - Normalized symbol
 * @param analyses - Array of analysis results
 * @param pagination - Pagination info
 * @param baseUrl - Base URL for analysis links (e.g., https://analyzinghub.com)
 * @returns Object with message text and inline keyboard
 */
export function buildAnalysisResultMessage(
  symbol: string,
  analyses: AnalysisResult[],
  pagination: PaginationInfo,
  baseUrl: string
): { text: string; keyboard: any[] } {
  const { currentPage, totalPages, totalCount, pageSize } = pagination;

  // Build header
  let text = `<b>📊 Analyses for ${escapeHtml(symbol)}</b>\n`;
  text += `<i>Found ${totalCount} analysis${totalCount !== 1 ? 'es' : ''}</i>\n`;

  if (totalPages > 1) {
    text += `<i>Page ${currentPage} of ${totalPages}</i>\n`;
  }

  text += '\n';

  // Build analysis list
  analyses.forEach((analysis, index) => {
    const num = (currentPage - 1) * pageSize + index + 1;

    // Analysis title or default
    let title = analysis.title || `Analysis #${num}`;
    title = truncateText(title, 60);

    // Analyzer name
    const analyzerName = analysis.analyzer_display_name || analysis.analyzer_name || 'Unknown';

    // Date
    const date = formatDateForTelegram(analysis.created_at);

    // Direction emoji
    let directionEmoji = '';
    if (analysis.direction === 'Long') directionEmoji = '📈';
    else if (analysis.direction === 'Short') directionEmoji = '📉';
    else if (analysis.direction === 'Neutral') directionEmoji = '➡️';

    // Type
    const typeLabel = analysis.analysis_type || analysis.post_type || '';

    // Build line
    text += `${num}. ${directionEmoji} <b>${escapeHtml(title)}</b>\n`;
    text += `   👤 ${escapeHtml(analyzerName)} • 📅 ${date}`;

    if (typeLabel) {
      text += ` • ${escapeHtml(typeLabel)}`;
    }

    if (analysis.chart_frame) {
      text += ` • ${escapeHtml(analysis.chart_frame)}`;
    }

    text += '\n\n';
  });

  // Build inline keyboard
  const keyboard: any[] = [];

  // Analysis buttons (2 per row)
  const buttonRows: any[][] = [];
  analyses.forEach((analysis, index) => {
    const num = (currentPage - 1) * pageSize + index + 1;
    const url = `${baseUrl}/share/${analysis.analysis_id}`;

    const button = {
      text: `${num}. Open`,
      url: url
    };

    const lastRow = buttonRows[buttonRows.length - 1];
    if (!lastRow || lastRow.length >= 2) {
      buttonRows.push([button]);
    } else {
      lastRow.push(button);
    }
  });

  keyboard.push(...buttonRows);

  // Pagination buttons
  if (totalPages > 1) {
    const paginationRow: any[] = [];

    if (currentPage > 1) {
      paginationRow.push({
        text: '⬅️ Previous',
        callback_data: `ANALYSES:${symbol}:${currentPage - 1}`
      });
    }

    if (currentPage < totalPages) {
      paginationRow.push({
        text: 'Next ➡️',
        callback_data: `ANALYSES:${symbol}:${currentPage + 1}`
      });
    }

    if (paginationRow.length > 0) {
      keyboard.push(paginationRow);
    }
  }

  // Search on website button
  keyboard.push([{
    text: '🔍 Search on Website',
    url: `${baseUrl}/search?symbol=${encodeURIComponent(symbol)}`
  }]);

  return { text, keyboard };
}

/**
 * Build message for no results found
 *
 * @param symbol - Normalized symbol
 * @param baseUrl - Base URL for search link
 * @returns Object with message text and inline keyboard
 */
export function buildNoResultsMessage(
  symbol: string,
  baseUrl: string
): { text: string; keyboard: any[] } {
  const text =
    `<b>📊 Analyses for ${escapeHtml(symbol)}</b>\n\n` +
    `No analyses found for this symbol.\n\n` +
    `💡 <i>Try another symbol or check the spelling.</i>`;

  const keyboard = [[{
    text: '🔍 Search on Website',
    url: `${baseUrl}/search?symbol=${encodeURIComponent(symbol)}`
  }]];

  return { text, keyboard };
}

/**
 * Build help message for ticker queries
 *
 * @returns Message text
 */
export function buildTickerHelpMessage(): string {
  return (
    '<b>📊 Ticker Symbol Search</b>\n\n' +
    'Send me any stock ticker to search for analyses!\n\n' +
    '<b>Examples:</b>\n' +
    '• AAPL\n' +
    '• TSLA\n' +
    '• 2222.SR\n' +
    '• BRK.B\n\n' +
    '<i>Just type the symbol and send it to me.</i>\n\n' +
    '<b>Available Commands:</b>\n' +
    '/start <code> - Link your account\n' +
    '/help - Show help\n' +
    '/status - Check connection status'
  );
}

/**
 * Build rate limit exceeded message
 *
 * @returns Message text
 */
export function buildRateLimitMessage(): string {
  return (
    '⏱️ <b>Rate Limit Exceeded</b>\n\n' +
    'You\'ve reached the maximum number of symbol queries (10 per 10 minutes).\n\n' +
    'Please wait a few minutes and try again.'
  );
}

/**
 * Build error message
 *
 * @param error - Error message
 * @returns Message text
 */
export function buildErrorMessage(error: string): string {
  return (
    '❌ <b>Error</b>\n\n' +
    `${escapeHtml(error)}\n\n` +
    'Please try again or contact support if the problem persists.'
  );
}

/**
 * Build temporary error message
 *
 * @returns Message text
 */
export function buildTemporaryErrorMessage(): string {
  return (
    '⚠️ <b>Temporary Issue</b>\n\n' +
    'We\'re experiencing a temporary issue. Please try again in a moment.'
  );
}
