/**
 * Market Hours Utility
 * Determines if US stock market is currently open (ET timezone).
 *
 * Bug fixed: the old implementation used
 *   `new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))`
 * which re-parses the locale string in the server's local timezone rather than
 * ET, producing wrong hours on any server not running in ET.
 *
 * Fix: use Intl.DateTimeFormat.formatToParts() to extract ET hour/minute/weekday
 * directly without any round-trip through the Date constructor.
 */

export interface MarketStatus {
  isOpen: boolean;
  status: 'open' | 'closed' | 'pre-market' | 'after-hours';
  nextOpen?: Date;
  nextClose?: Date;
  message: string;
}

function getETTimeParts(now: Date): { dayOfWeek: number; hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',   // 'Sun', 'Mon', ..., 'Sat'
    hour:    'numeric', // 0–23 with hour12: false
    minute:  'numeric',
    hour12:  false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

  const weekdayStr = get('weekday'); // 'Sun' | 'Mon' | ... | 'Sat'
  // hour can be '24' at midnight in some runtimes — normalise to 0
  const hours   = parseInt(get('hour'),   10) % 24;
  const minutes = parseInt(get('minute'), 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? new Date().getDay();

  return { dayOfWeek, hours, minutes };
}

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  const { dayOfWeek, hours, minutes } = getETTimeParts(now);
  const timeInMinutes = hours * 60 + minutes;

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isOpen: false,
      status: 'closed',
      message: 'Markets closed (Weekend)',
    };
  }

  // Market hours in ET
  const MARKET_OPEN  = 9 * 60 + 30; // 9:30 AM
  const MARKET_CLOSE = 16 * 60;     // 4:00 PM
  const PRE_START    = 4 * 60;      // 4:00 AM
  const AH_END       = 20 * 60;     // 8:00 PM

  if (timeInMinutes >= MARKET_OPEN && timeInMinutes < MARKET_CLOSE) {
    return { isOpen: true,  status: 'open',        message: 'Markets open (RTH 9:30–4:00 PM ET)' };
  }
  if (timeInMinutes >= PRE_START && timeInMinutes < MARKET_OPEN) {
    return { isOpen: false, status: 'pre-market',  message: 'Pre-market hours (4:00–9:30 AM ET)' };
  }
  if (timeInMinutes >= MARKET_CLOSE && timeInMinutes < AH_END) {
    return { isOpen: false, status: 'after-hours', message: 'After-hours trading (4:00–8:00 PM ET)' };
  }
  return { isOpen: false, status: 'closed', message: 'Markets closed' };
}

export function formatMarketTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: 'America/New_York',
    hour12:   true,
  }) + ' ET';
}
