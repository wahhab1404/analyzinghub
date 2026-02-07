import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDailyPDFReport() {
  console.log('🧪 Testing Daily PDF Report Generation...\n');

  try {
    // Call the edge function
    const functionUrl = `${supabaseUrl}/functions/v1/generate-daily-pdf-report`;

    console.log('📡 Calling edge function:', functionUrl);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        test: true,
        trigger_time: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    console.log('\n✅ Report Generated Successfully!');
    console.log('\n📊 Statistics:');
    console.log('  Total Trades:', result.stats.totalTrades);
    console.log('  Active Trades:', result.stats.activeTrades);
    console.log('  Closed Trades:', result.stats.closedTrades);
    console.log('  Avg Profit:', result.stats.avgProfit.toFixed(2) + '%');
    console.log('  Max Profit:', result.stats.maxProfit.toFixed(2) + '%');
    console.log('  Win Rate:', result.stats.winRate.toFixed(2) + '%');

    // Check if report was stored
    const today = new Date().toISOString().split('T')[0];
    const { data: reportData, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('*')
      .eq('report_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportError) {
      console.log('\n⚠️  Error checking report:', reportError.message);
    } else if (reportData) {
      console.log('\n💾 Report Stored in Database:');
      console.log('  Report ID:', reportData.id);
      console.log('  Date:', reportData.report_date);
      console.log('  HTML Length:', reportData.report_html?.length || 0, 'characters');
    } else {
      console.log('\n⚠️  Report not yet in database (may take a moment to save)');
    }

    // Check configured channels
    const { data: channels, error: channelsError } = await supabase
      .from('analyzer_plans')
      .select('id, telegram_channels!telegram_channel_id(channel_id, channel_name)')
      .not('telegram_channel_id', 'is', null)
      .eq('is_active', true);

    if (channelsError) {
      console.log('\n⚠️  Error fetching channels:', channelsError.message);
    } else {
      console.log('\n📢 Reports Sent to Channels:');
      if (channels && channels.length > 0) {
        channels.forEach((plan: any) => {
          if (plan.telegram_channels) {
            console.log(`  ✓ ${plan.telegram_channels.channel_name} (${plan.telegram_channels.channel_id})`);
          }
        });
      } else {
        console.log('  No Telegram channels configured');
      }
    }

    console.log('\n🎉 Daily PDF Report Test Complete!');
    console.log('\n📝 Next Steps:');
    console.log('  1. Check your Telegram channels for the report message');
    console.log('  2. Verify the statistics match your database');
    console.log('  3. The cron job will run automatically at 4 PM ET (21:00 UTC) Mon-Fri');

  } catch (error) {
    console.error('\n❌ Error testing daily PDF report:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

testDailyPDFReport();
