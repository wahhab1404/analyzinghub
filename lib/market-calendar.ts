export interface MarketHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  market: 'US' | 'ALL';
}

export const US_MARKET_HOLIDAYS_2025: MarketHoliday[] = [
  { date: '2025-01-01', name: "New Year's Day", market: 'US' },
  { date: '2025-01-20', name: 'Martin Luther King Jr. Day', market: 'US' },
  { date: '2025-02-17', name: "Presidents' Day", market: 'US' },
  { date: '2025-04-18', name: 'Good Friday', market: 'US' },
  { date: '2025-05-26', name: 'Memorial Day', market: 'US' },
  { date: '2025-06-19', name: 'Juneteenth', market: 'US' },
  { date: '2025-07-04', name: 'Independence Day', market: 'US' },
  { date: '2025-09-01', name: 'Labor Day', market: 'US' },
  { date: '2025-11-27', name: 'Thanksgiving Day', market: 'US' },
  { date: '2025-12-25', name: 'Christmas Day', market: 'US' },
];

export const US_MARKET_HOLIDAYS_2026: MarketHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day", market: 'US' },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day', market: 'US' },
  { date: '2026-02-16', name: "Presidents' Day", market: 'US' },
  { date: '2026-04-03', name: 'Good Friday', market: 'US' },
  { date: '2026-05-25', name: 'Memorial Day', market: 'US' },
  { date: '2026-06-19', name: 'Juneteenth', market: 'US' },
  { date: '2026-07-03', name: 'Independence Day (Observed)', market: 'US' },
  { date: '2026-09-07', name: 'Labor Day', market: 'US' },
  { date: '2026-11-26', name: 'Thanksgiving Day', market: 'US' },
  { date: '2026-12-25', name: 'Christmas Day', market: 'US' },
];

const ALL_HOLIDAYS = [...US_MARKET_HOLIDAYS_2025, ...US_MARKET_HOLIDAYS_2026];

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isMarketHoliday(date: Date, market: 'US' | 'ALL' = 'US'): boolean {
  const dateStr = date.toISOString().split('T')[0];
  return ALL_HOLIDAYS.some(
    (holiday) => holiday.date === dateStr && (holiday.market === market || holiday.market === 'ALL')
  );
}

export function isMarketOpen(date: Date, market: 'US' | 'ALL' = 'US'): boolean {
  return !isWeekend(date) && !isMarketHoliday(date, market);
}

export function getLastTradingDay(referenceDate: Date = new Date()): Date {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  date.setDate(date.getDate() - 1);

  while (!isMarketOpen(date)) {
    date.setDate(date.getDate() - 1);
  }

  return date;
}

export function getNextTradingDay(referenceDate: Date = new Date()): Date {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);

  date.setDate(date.getDate() + 1);

  while (!isMarketOpen(date)) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

export function getTradingDaysInRange(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    if (isMarketOpen(current)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

export function getWeekTradingDays(weekOffset: number = 0): { start: Date; end: Date; days: Date[] } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  // Don't include future dates - cap at today
  const endDate = friday > now ? now : friday;

  return {
    start: monday,
    end: endDate,
    days: getTradingDaysInRange(monday, endDate),
  };
}

export function getMonthTradingDays(monthOffset: number = 0): { start: Date; end: Date; days: Date[] } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);

  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  // Don't include future dates for current month - cap at today
  const endDate = monthOffset === 0 && end > now ? now : end;

  return {
    start,
    end: endDate,
    days: getTradingDaysInRange(start, endDate),
  };
}

export function formatDateForReport(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function shouldGenerateReportToday(): boolean {
  const today = new Date();
  return isMarketOpen(today);
}
