import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function testReportsAPI() {
  console.log('\n=== Testing Reports API ===\n');

  // Test 1: Check if reports exist in DB
  console.log('1. Checking reports in database...');
  const { data: allReports, error: reportsError } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, status, trade_count, period_type, author_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (reportsError) {
    console.error('❌ Error fetching reports:', reportsError);
  } else {
    console.log(`✅ Found ${allReports?.length || 0} reports in database`);
    if (allReports && allReports.length > 0) {
      console.log('   Sample reports:');
      allReports.slice(0, 3).forEach((r) => {
        console.log(`   - ${r.report_date} (${r.period_type}): ${r.trade_count} trades, status: ${r.status}, author: ${r.author_id}`);
      });
    }
  }

  // Test 2: Check RLS policies
  console.log('\n2. Checking RLS policies...');
  const { data: policies, error: policiesError } = await supabase
    .rpc('exec_sql', {
      sql: `SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'daily_trade_reports'`
    });

  if (!policiesError && policies) {
    console.log('✅ RLS policies found:');
    console.log(JSON.stringify(policies, null, 2));
  }

  // Test 3: Check HTML content
  console.log('\n3. Checking if reports have HTML content...');
  const { data: htmlCheck, error: htmlError } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, html_content')
    .not('html_content', 'is', null)
    .limit(3);

  if (htmlError) {
    console.error('❌ Error checking HTML:', htmlError);
  } else {
    console.log(`✅ Found ${htmlCheck?.length || 0} reports with HTML content`);
    if (htmlCheck && htmlCheck.length > 0) {
      htmlCheck.forEach((r) => {
        const htmlLength = r.html_content?.length || 0;
        console.log(`   - ${r.report_date}: ${htmlLength} characters`);
      });
    }
  }

  // Test 4: Simulate authenticated user query
  console.log('\n4. Simulating authenticated user query...');
  const testUserId = allReports?.[0]?.author_id;
  if (testUserId) {
    const { data: userReports, error: userError } = await supabase
      .from('daily_trade_reports')
      .select(`
        id,
        report_date,
        language_mode,
        status,
        file_url,
        created_at,
        period_type,
        start_date,
        end_date,
        summary,
        deliveries:report_deliveries(*)
      `)
      .eq('author_id', testUserId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (userError) {
      console.error('❌ Error simulating user query:', userError);
    } else {
      console.log(`✅ User ${testUserId} has ${userReports?.length || 0} reports`);
      if (userReports && userReports.length > 0) {
        userReports.forEach((r) => {
          console.log(`   - ${r.report_date} (${r.period_type}): ${r.status}`);
        });
      }
    }
  }

  console.log('\n=== Test Complete ===\n');
}

testReportsAPI().catch(console.error);
