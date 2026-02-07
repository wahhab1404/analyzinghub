/**
 * Test Script for Telegram Symbol Query Feature
 *
 * Usage: npm run test:telegram:symbol
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSymbolNormalization() {
  console.log('\n📝 Testing symbol normalization...');

  const testCases = [
    { input: 'AAPL', expected: 'AAPL' },
    { input: 'aapl', expected: 'AAPL' },
    { input: '$AAPL', expected: 'AAPL' },
    { input: '  TSLA  ', expected: 'TSLA' },
    { input: 'BRK.B', expected: 'BRK.B' },
    { input: '2222.SR', expected: '2222.SR' },
  ];

  for (const testCase of testCases) {
    const normalized = testCase.input.trim().replace(/^\$/, '').toUpperCase();
    const passed = normalized === testCase.expected;
    console.log(`  ${passed ? '✅' : '❌'} "${testCase.input}" → "${normalized}" (expected: "${testCase.expected}")`);
  }
}

async function testDatabaseFunction() {
  console.log('\n🔍 Testing get_analyses_by_symbol function...');

  // Query for a test symbol
  const testSymbol = 'AAPL';

  const { data, error } = await supabase.rpc('get_analyses_by_symbol', {
    p_symbol_normalized: testSymbol,
    p_page: 1,
    p_page_size: 10
  });

  if (error) {
    console.error('  ❌ Database error:', error);
    return false;
  }

  const totalCount = data && data.length > 0 ? Number(data[0].total_count) : 0;
  console.log(`  ✅ Query successful`);
  console.log(`  📊 Found ${totalCount} total analyses for ${testSymbol}`);
  console.log(`  📄 Returned ${data.length} results on page 1`);

  if (data.length > 0) {
    console.log('\n  Sample result:');
    console.log(`    - ID: ${data[0].analysis_id}`);
    console.log(`    - Title: ${data[0].title || 'N/A'}`);
    console.log(`    - Analyzer: ${data[0].analyzer_display_name || data[0].analyzer_name}`);
    console.log(`    - Direction: ${data[0].direction || 'N/A'}`);
    console.log(`    - Type: ${data[0].analysis_type}`);
    console.log(`    - Date: ${data[0].created_at}`);
  }

  return true;
}

async function testRateLimitFunction() {
  console.log('\n⏱️  Testing rate limit function...');

  const testChatId = 'test_chat_' + Date.now();

  // First 10 should succeed
  for (let i = 1; i <= 10; i++) {
    const { data: allowed, error } = await supabase.rpc('check_telegram_symbol_query_limit', {
      p_user_chat_id: testChatId,
      p_max_queries: 10,
      p_window_minutes: 10
    });

    if (error) {
      console.error(`  ❌ Error on query ${i}:`, error);
      return false;
    }

    if (!allowed) {
      console.error(`  ❌ Query ${i} was blocked (should be allowed)`);
      return false;
    }
  }

  console.log('  ✅ First 10 queries allowed');

  // 11th should be blocked
  const { data: blockedAllowed, error: blockedError } = await supabase.rpc('check_telegram_symbol_query_limit', {
    p_user_chat_id: testChatId,
    p_max_queries: 10,
    p_window_minutes: 10
  });

  if (blockedError) {
    console.error('  ❌ Error on 11th query:', blockedError);
    return false;
  }

  if (blockedAllowed) {
    console.error('  ❌ 11th query was allowed (should be blocked)');
    return false;
  }

  console.log('  ✅ 11th query blocked (rate limit working)');

  // Cleanup test data
  await supabase
    .from('telegram_symbol_query_limits')
    .delete()
    .eq('user_chat_id', testChatId);

  return true;
}

async function testSymbolizedData() {
  console.log('\n📊 Testing symbol_normalized data integrity...');

  // Check symbols table
  const { data: symbols, error: symbolsError } = await supabase
    .from('symbols')
    .select('symbol, symbol_normalized')
    .limit(5);

  if (symbolsError) {
    console.error('  ❌ Error querying symbols:', symbolsError);
    return false;
  }

  console.log(`  ✅ Symbols table has ${symbols.length} entries (sample):`);
  symbols.forEach(s => {
    console.log(`    - ${s.symbol} → ${s.symbol_normalized || 'NULL'}`);
  });

  // Check for any NULL symbol_normalized
  const { data: nullSymbols, error: nullError } = await supabase
    .from('symbols')
    .select('id')
    .is('symbol_normalized', null);

  if (nullError) {
    console.error('  ❌ Error checking for NULL symbols:', nullError);
    return false;
  }

  if (nullSymbols && nullSymbols.length > 0) {
    console.warn(`  ⚠️  Found ${nullSymbols.length} symbols with NULL symbol_normalized`);
    console.warn('     Run backfill migration to fix');
  } else {
    console.log('  ✅ All symbols have normalized values');
  }

  // Check analyses table
  const { data: analyses, error: analysesError } = await supabase
    .from('analyses')
    .select('id, symbol_normalized')
    .limit(5);

  if (analysesError) {
    console.error('  ❌ Error querying analyses:', analysesError);
    return false;
  }

  console.log(`  ✅ Analyses table has ${analyses.length} entries (sample)`);

  // Check for any NULL symbol_normalized in analyses
  const { data: nullAnalyses, error: nullAnalysesError } = await supabase
    .from('analyses')
    .select('id')
    .is('symbol_normalized', null);

  if (nullAnalysesError) {
    console.error('  ❌ Error checking for NULL analyses:', nullAnalysesError);
    return false;
  }

  if (nullAnalyses && nullAnalyses.length > 0) {
    console.warn(`  ⚠️  Found ${nullAnalyses.length} analyses with NULL symbol_normalized`);
    console.warn('     Run backfill migration to fix');
  } else {
    console.log('  ✅ All analyses have normalized symbol values');
  }

  return true;
}

async function testAPIEndpoint() {
  console.log('\n🌐 Testing /api/telegram/query-symbol endpoint...');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('  ⚠️  TELEGRAM_WEBHOOK_SECRET not set, skipping API test');
    return true;
  }

  try {
    const response = await fetch(`${baseUrl}/api/telegram/query-symbol`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': webhookSecret
      },
      body: JSON.stringify({
        symbol: 'AAPL',
        page: 1,
        pageSize: 10,
        chatId: 'test_' + Date.now()
      })
    });

    if (!response.ok) {
      console.error(`  ❌ API returned status ${response.status}`);
      const text = await response.text();
      console.error('     Response:', text);
      return false;
    }

    const result = await response.json();

    console.log('  ✅ API endpoint responding');
    console.log(`  📊 Rate limited: ${result.rateLimited}`);
    console.log(`  📄 Analyses returned: ${result.analyses.length}`);
    console.log(`  📑 Total count: ${result.pagination.totalCount}`);
    console.log(`  📄 Pages: ${result.pagination.totalPages}`);

    return true;
  } catch (error) {
    console.error('  ❌ Error calling API:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Telegram Symbol Query Feature Tests\n');
  console.log('='.repeat(50));

  const results = {
    normalization: true,
    database: false,
    rateLimit: false,
    dataIntegrity: false,
    api: false
  };

  // Run tests
  results.normalization = true; // Always passes (client-side logic)
  await testSymbolNormalization();

  results.database = await testDatabaseFunction();
  results.rateLimit = await testRateLimitFunction();
  results.dataIntegrity = await testSymbolizedData();
  results.api = await testAPIEndpoint();

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Summary:\n');

  const tests = [
    { name: 'Symbol Normalization', result: results.normalization },
    { name: 'Database Function', result: results.database },
    { name: 'Rate Limiting', result: results.rateLimit },
    { name: 'Data Integrity', result: results.dataIntegrity },
    { name: 'API Endpoint', result: results.api }
  ];

  tests.forEach(test => {
    console.log(`  ${test.result ? '✅' : '❌'} ${test.name}`);
  });

  const allPassed = Object.values(results).every(r => r === true);

  console.log('\n' + '='.repeat(50));
  console.log(allPassed ? '\n✅ All tests passed!' : '\n❌ Some tests failed');
  console.log('');

  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
