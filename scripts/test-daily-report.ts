import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function testDailyReport() {
  console.log('🧪 Testing Daily Trade Report System\n')

  // Test 1: Check database columns
  console.log('1️⃣ Checking database schema...')
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: columns, error: colError } = await supabase
    .from('index_trades')
    .select('*')
    .limit(1)

  if (colError) {
    console.error('❌ Error:', colError)
    return
  }

  const requiredColumns = ['max_profit', 'max_contract_price', 'profit_from_entry', 'is_winning_trade', 'trade_outcome']
  const hasAllColumns = requiredColumns.every(col =>
    columns && columns[0] && col in columns[0]
  )

  if (hasAllColumns) {
    console.log('✅ All required columns exist\n')
  } else {
    console.log('❌ Missing columns:', requiredColumns.filter(col => !(columns && columns[0] && col in columns[0])))
    return
  }

  // Test 2: Check existing trades
  console.log('2️⃣ Checking existing trades...')

  const { data: trades, error: tradesError } = await supabase
    .from('index_trades')
    .select(`
      id,
      underlying_index_symbol,
      direction,
      entry_contract_snapshot,
      current_contract,
      manual_contract_price,
      max_profit,
      profit_from_entry,
      is_winning_trade,
      trade_outcome,
      status,
      created_at
    `)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(5)

  if (tradesError) {
    console.error('❌ Error:', tradesError)
    return
  }

  console.log(`Found ${trades?.length || 0} live trades\n`)

  if (trades && trades.length > 0) {
    console.log('📊 Sample Trade Data:')
    trades.forEach((trade, i) => {
      const entryPrice = trade.entry_contract_snapshot?.last || trade.entry_contract_snapshot?.close || 0
      const currentPrice = trade.manual_contract_price || trade.current_contract || 0

      console.log(`\n${i + 1}. ${trade.underlying_index_symbol} (${trade.direction})`)
      console.log(`   Entry: $${entryPrice.toFixed(2)} → Current: $${currentPrice.toFixed(2)}`)
      console.log(`   Profit from Entry: $${(trade.profit_from_entry || 0).toFixed(2)}`)
      console.log(`   Max Profit: $${(trade.max_profit || 0).toFixed(2)}`)
      console.log(`   Is Winning: ${trade.is_winning_trade ? '✅ YES' : '❌ NO'}`)
      console.log(`   Outcome: ${trade.trade_outcome || 'pending'}`)
    })
    console.log()
  }

  // Test 3: Test daily summary function
  console.log('3️⃣ Testing daily summary function...')

  const testDate = new Date()
  testDate.setDate(testDate.getDate() - 1) // Yesterday
  const targetDate = testDate.toISOString().split('T')[0]

  const { data: summary, error: summaryError } = await supabase.rpc(
    'get_daily_trade_summary',
    {
      target_date: targetDate,
      author_id_param: null
    }
  )

  if (summaryError) {
    console.error('❌ Error:', summaryError)
  } else {
    console.log(`✅ Daily summary function works (${summary?.length || 0} trades for ${targetDate})\n`)
  }

  // Test 4: Trigger the edge function
  console.log('4️⃣ Testing edge function...')
  console.log('   Calling indices-daily-report-sender...\n')

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/indices-daily-report-sender?date=${targetDate}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ test: true })
      }
    )

    const result = await response.json()

    if (response.ok) {
      console.log('✅ Edge function executed successfully!')
      console.log(`   Date: ${result.date}`)
      console.log(`   Total Trades: ${result.total_trades}`)
      console.log(`   Channels: ${result.channels}`)
      console.log(`   Notifications Sent: ${result.notifications_sent || 0}\n`)
    } else {
      console.log('⚠️ Edge function returned error:', result)
    }
  } catch (error) {
    console.error('❌ Error calling edge function:', error)
  }

  // Test 5: Check generated reports
  console.log('5️⃣ Checking stored reports...')

  const { data: reports, error: reportsError } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3)

  if (reportsError) {
    console.error('❌ Error:', reportsError)
  } else {
    console.log(`✅ Found ${reports?.length || 0} stored reports`)

    if (reports && reports.length > 0) {
      reports.forEach((report, i) => {
        console.log(`\n${i + 1}. ${report.report_date}`)
        console.log(`   Trades: ${report.trade_count}`)
        if (report.summary) {
          console.log(`   Winning: ${report.summary.winning || 0}`)
          console.log(`   Total P&L: $${(report.summary.total_profit || 0).toFixed(2)}`)
          console.log(`   Win Rate: ${(report.summary.win_rate || 0).toFixed(1)}%`)
        }
      })
    }
    console.log()
  }

  // Test 6: Verify profit tracking trigger
  console.log('6️⃣ Testing profit tracking trigger...')

  if (trades && trades.length > 0) {
    const testTrade = trades[0]

    // Update a trade to trigger the profit calculation
    const { error: updateError } = await supabase
      .from('index_trades')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', testTrade.id)

    if (updateError) {
      console.error('❌ Error:', updateError)
    } else {
      // Fetch updated trade
      const { data: updatedTrade } = await supabase
        .from('index_trades')
        .select('max_profit, profit_from_entry, is_winning_trade')
        .eq('id', testTrade.id)
        .single()

      if (updatedTrade) {
        console.log('✅ Trigger executed successfully!')
        console.log(`   Max Profit: $${(updatedTrade.max_profit || 0).toFixed(2)}`)
        console.log(`   Current Profit: $${(updatedTrade.profit_from_entry || 0).toFixed(2)}`)
        console.log(`   Is Winning: ${updatedTrade.is_winning_trade ? 'YES' : 'NO'}\n`)
      }
    }
  }

  console.log('🎉 All tests completed!')
  console.log('\n📝 Next Steps:')
  console.log('1. Set up the cron job in Supabase dashboard (see DAILY_TRADE_REPORT_SETUP.md)')
  console.log('2. Verify Telegram channels have valid channel_id')
  console.log('3. Check TELEGRAM_BOT_TOKEN is configured in edge function')
  console.log('4. Monitor first automatic run at 4:15 PM ET')
}

testDailyReport().catch(console.error)
