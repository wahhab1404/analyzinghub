/**
 * Market Hours Utility
 * Determines if US stock market is currently open
 */

export interface MarketStatus {
  isOpen: boolean;
  status: 'open' | 'closed' | 'pre-market' | 'after-hours';
  nextOpen?: Date;
  nextClose?: Date;
  message: string;
}

export function getMarketStatus(): MarketStatus {
  const now = new Date();

  // Get current time in ET timezone
  const etTimeString = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  // Parse the ET time string to get hours and minutes
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayOfWeek = etDate.getDay(); // 0 = Sunday, 6 = Saturday

  // Get the actual hours in ET by using UTC methods with timezone offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const timeInMinutes = hours * 60 + minutes;

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isOpen: false,
      status: 'closed',
      message: 'Markets closed (Weekend)',
    };
  }

  // Market hours in ET: 9:30 AM - 4:00 PM
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM

  // Pre-market: 4:00 AM - 9:30 AM
  const preMarketStart = 4 * 60; // 4:00 AM

  // After-hours: 4:00 PM - 8:00 PM
  const afterHoursEnd = 20 * 60; // 8:00 PM

  if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
    return {
      isOpen: true,
      status: 'open',
      message: 'Markets open',
    };
  } else if (timeInMinutes >= preMarketStart && timeInMinutes < marketOpen) {
    return {
      isOpen: false,
      status: 'pre-market',
      message: 'Pre-market hours',
    };
  } else if (timeInMinutes >= marketClose && timeInMinutes < afterHoursEnd) {
    return {
      isOpen: false,
      status: 'after-hours',
      message: 'After-hours trading',
    };
  } else {
    return {
      isOpen: false,
      status: 'closed',
      message: 'Markets closed',
    };
  }
}

export function formatMarketTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
    hour12: true,
  }) + ' ET';
}
