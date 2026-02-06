import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface WeekData {
  start: Date;
  end: Date;
}

function getWeekTradingDays(weekOffset: number = 0): WeekData {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();

  // If today is weekend, use Friday as reference
  let referenceDate = new Date(now);
  if (dayOfWeek === 0) {
    // Sunday: go back to previous Friday
    referenceDate.setDate(now.getDate() - 2);
  } else if (dayOfWeek === 6) {
    // Saturday: go back to Friday
    referenceDate.setDate(now.getDate() - 1);
  }

  // Now calculate Monday of the week
  const refDay = referenceDate.getDay();
  const daysFromMonday = refDay - 1; // Mon=1, so Mon-1=0, Tue-1=1, etc.

  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() - daysFromMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return {
    start: monday,
    end: friday,
  };
}

function formatDateForReport(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function testWeekReport() {
  console.log('=== Testing Week Report Generation ===\n');

  const today = new Date();
  console.log('Today:', today.toISOString());
  console.log('Today (formatted):', formatDateForReport(today));
  console.log('Day of week:', today.getDay(), '(0=Sun, 6=Sat)\n');

  // Test This Week (offset 0)
  console.log('--- This Week (offset=0) ---');
  const thisWeek = getWeekTradingDays(0);
  console.log('Start:', formatDateForReport(thisWeek.start));
  console.log('End:', formatDateForReport(thisWeek.end));

  // Test Last Week (offset -1)
  console.log('\n--- Last Week (offset=-1) ---');
  const lastWeek = getWeekTradingDays(-1);
  console.log('Start:', formatDateForReport(lastWeek.start));
  console.log('End:', formatDateForReport(lastWeek.end));

  // Now test the actual API call for last week
  console.log('\n=== Testing API Call for Last Week (via Next.js API) ===\n');

  const requestBody = {
    period_type: 'weekly',
    week_offset: -1,
    language_mode: 'dual',
    dry_run: true
  };

  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  try {
    // Calculate what dates should be sent
    const lastWeek = getWeekTradingDays(-1);
    const calculatedStart = formatDateForReport(lastWeek.start);
    const calculatedEnd = formatDateForReport(lastWeek.end);
    console.log(`\nCalculated dates to send: ${calculatedStart} to ${calculatedEnd}\n`);

    // Call edge function directly with calculated dates
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-period-report`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          start_date: calculatedStart,
          end_date: calculatedEnd,
          period_type: 'weekly',
          language_mode: 'dual',
          dry_run: true,
          analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f' // Your user ID
        }),
      }
    );

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error response:', errorData);
      return;
    }

    const result = await response.json();
    console.log('\nResult:');
    console.log('- Total trades:', result.metrics?.total_trades || 0);
    console.log('- Active trades:', result.metrics?.active_trades || 0);
    console.log('- Closed trades:', result.metrics?.closed_trades || 0);
    console.log('- Win rate:', result.metrics?.win_rate?.toFixed(1) || 0, '%');
    console.log('- Net profit:', result.metrics?.net_profit || 0);

    if (result.trades && result.trades.length > 0) {
      console.log('\nTrades found:');
      result.trades.forEach((trade: any, i: number) => {
        console.log(`${i + 1}. ${trade.symbol} ${trade.type} @ ${trade.strike} - Created: ${trade.created_at}`);
      });
    } else {
      console.log('\nNo trades found in this period');
    }
  } catch (error) {
    console.error('Error calling API:', error);
  }
}

testWeekReport();
