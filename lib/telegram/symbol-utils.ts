/**
 * Symbol Validation and Normalization Utilities
 *
 * Handles ticker symbol validation, normalization, and formatting
 * for Telegram bot symbol queries.
 */

export interface SymbolValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validate and normalize a ticker symbol
 *
 * Rules:
 * - Remove leading '$' if present
 * - Trim whitespace
 * - Convert to uppercase
 * - Max 20 characters
 * - Only alphanumeric, dots, dashes, and underscores allowed
 * - Support international symbols (e.g., 2222.SR for Saudi stocks)
 *
 * @param input - Raw symbol input from user
 * @returns Validation result with normalized symbol or error
 */
export function validateAndNormalizeSymbol(input: string): SymbolValidationResult {
  if (!input || typeof input !== 'string') {
    return {
      valid: false,
      error: 'Symbol cannot be empty'
    };
  }

  // Remove leading '$' and trim
  let cleaned = input.trim();
  if (cleaned.startsWith('$')) {
    cleaned = cleaned.substring(1);
  }

  // Check length
  if (cleaned.length === 0) {
    return {
      valid: false,
      error: 'Symbol cannot be empty'
    };
  }

  if (cleaned.length > 20) {
    return {
      valid: false,
      error: 'Symbol too long (max 20 characters)'
    };
  }

  // Check allowed characters: A-Z, 0-9, ., -, _
  const allowedPattern = /^[A-Z0-9._-]+$/i;
  if (!allowedPattern.test(cleaned)) {
    return {
      valid: false,
      error: 'Symbol contains invalid characters. Only letters, numbers, dots, and dashes allowed.'
    };
  }

  // Normalize to uppercase
  const normalized = cleaned.toUpperCase();

  return {
    valid: true,
    normalized
  };
}

/**
 * Check if a message looks like a ticker symbol query
 *
 * Returns true if message:
 * - Is 1-20 characters
 * - Starts with optional '$'
 * - Contains only valid symbol characters
 * - Is not a command (doesn't start with '/')
 *
 * @param message - Message text from user
 * @returns True if message appears to be a ticker query
 */
export function isTickerQuery(message: string): boolean {
  if (!message || typeof message !== 'string') {
    return false;
  }

  const trimmed = message.trim();

  // Not a command
  if (trimmed.startsWith('/')) {
    return false;
  }

  // Check if it could be a symbol
  const validation = validateAndNormalizeSymbol(trimmed);
  return validation.valid;
}

/**
 * Format date for display in Telegram messages
 *
 * @param date - ISO date string or Date object
 * @returns Formatted date string (YYYY-MM-DD)
 */
export function formatDateForTelegram(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Escape special characters for Telegram HTML mode
 *
 * @param text - Text to escape
 * @returns Escaped text safe for Telegram HTML
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Truncate text to max length with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength - 3) + '...';
}
