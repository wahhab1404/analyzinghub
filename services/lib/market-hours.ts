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

  // Get current time in ET timezone using toLocaleString which is more reliable
  const etTimeString = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
  });

  const etDate = new Date(etTimeString);
  const dayOfWeek = etDate.getDay(); // 0 = Sunday, 6 = Saturday

  // Get hours and minutes directly from the ET date
  const hours = etDate.getHours();
  const minutes = etDate.getMinutes();
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
