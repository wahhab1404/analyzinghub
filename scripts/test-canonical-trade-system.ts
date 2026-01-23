import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testCanonicalTradeSystem() {
  console.log('🧪 Testing Canonical Contract Trade System\n')
  console.log('='.repeat(80))

  // Get test user
  const { data: testUser } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('email', 'analyzer@test.com')
    .single()

  if (!testUser) {
    console.log('❌ Test user not found. Create analyzer@test.com first.')
    return
  }

  console.log(`\n✅ Using test user: ${testUser.full_name} (${testUser.id})`)

  console.log('\n' + '='.repeat(80))
  console.log('TEST 1: Entry $2.50, qty=1, high $3.50 => max_profit=$100 => WIN')
  console.log('='.repeat(80))

  // Create trade with entry $2.50
  const test1TradeData = {
    author_id: testUser.id,
    status: 'active',
    instrument_type: 'options',
    direction: 'call',
    underlying_index_symbol: 'SPX',
    polygon_underlying_index_ticker: 'I:SPX',
    polygon_option_ticker: 'O:SPXW250131C06100000',
    strike: 6100,
    expiry: '2025-01-31',
    option_type: 'call',
    contract_multiplier: 100,
    entry_underlying_snapshot: { price: 6050, timestamp: new Date().toISOString() },
    entry_contract_snapshot: { mid: 2.50, timestamp: new Date().toISOString() },
    current_contract: 2.50,
    qty: 1,
    entry_cost_usd: 2.50 * 1 * 100, // $250
    max_profit: 0,
    max_contract_price: 2.50,
    original_entry_price: 2.50,
    trade_price_basis: 'OPTION_PREMIUM',
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  }

  const { data: test1Trade, error: test1Error } = await supabase
    .from('index_trades')
    .insert(test1TradeData)
    .select('id')
    .single()

  if (test1Error || !test1Trade) {
    console.log('❌ Failed to create test1 trade:', test1Error?.message)
    return
  }

  console.log(`✅ Created trade ${test1Trade.id} with entry $2.50`)

  // Simulate price reaching $3.50 (exactly $100 profit)
  const { data: updateResult1, error: updateError1 } = await supabase.rpc(
    'update_trade_high_watermark',
    {
      p_trade_id: test1Trade.id,
      p_current_price: 3.50
    }
  )

  if (updateError1) {
    console.log('❌ Failed to update high watermark:', updateError1.message)
    return
  }

  console.log('\n📊 High watermark update result:')
  console.log(`  New high: $${updateResult1.new_high}`)
  console.log(`  Max profit dollars: $${updateResult1.max_profit_dollars}`)
  console.log(`  Is win: ${updateResult1.is_win}`)
  console.log(`  Newly won: ${updateResult1.newly_won}`)

  // Verify WIN status
  const { data: test1Check } = await supabase
    .from('index_trades')
    .select('*')
    .eq('id', test1Trade.id)
    .single()

  console.log('\n📋 Trade verification:')
  console.log(`  max_contract_price: $${test1Check?.max_contract_price}`)
  console.log(`  max_profit: $${test1Check?.max_profit}`)
  console.log(`  is_winning_trade: ${test1Check?.is_winning_trade}`)
  console.log(`  is_win: ${test1Check?.is_win}`)
  console.log(`  win_at: ${test1Check?.win_at || 'not set'}`)

  if (test1Check?.is_win && test1Check?.max_profit >= 100) {
    console.log('\n✅ PASS: Trade correctly marked as WIN with max_profit >= $100')
  } else {
    console.log('\n❌ FAIL: Trade should be WIN but is_win=' + test1Check?.is_win)
  }

  // Finalize the trade
  console.log('\n🔒 Finalizing trade...')
  const { data: finalizeResult1, error: finalizeError1 } = await supabase.rpc(
    'finalize_trade_canonical',
    {
      p_trade_id: test1Trade.id
    }
  )

  if (finalizeError1) {
    console.log('❌ Failed to finalize:', finalizeError1.message)
  } else {
    console.log('✅ Finalization result:', JSON.stringify(finalizeResult1, null, 2))

    if (finalizeResult1.final_pnl === 100 && finalizeResult1.outcome === 'win') {
      console.log('\n✅ PASS: Final P&L = $100 (max_profit), outcome = WIN')
    } else {
      console.log(`\n❌ FAIL: Expected pnl=$100, outcome=win. Got pnl=${finalizeResult1.final_pnl}, outcome=${finalizeResult1.outcome}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('TEST 2: Entry $2.50, qty=1, high $3.40 => max_profit=$90 => LOSS')
  console.log('='.repeat(80))

  // Create trade with entry $2.50
  const test2TradeData = {
    ...test1TradeData,
    polygon_option_ticker: 'O:SPXW250131C06105000',
    strike: 6105,
  }

  const { data: test2Trade, error: test2Error } = await supabase
    .from('index_trades')
    .insert(test2TradeData)
    .select('id')
    .single()

  if (test2Error || !test2Trade) {
    console.log('❌ Failed to create test2 trade:', test2Error?.message)
    return
  }

  console.log(`✅ Created trade ${test2Trade.id} with entry $2.50`)

  // Simulate price reaching $3.40 (only $90 profit, below $100 threshold)
  const { data: updateResult2, error: updateError2 } = await supabase.rpc(
    'update_trade_high_watermark',
    {
      p_trade_id: test2Trade.id,
      p_current_price: 3.40
    }
  )

  if (updateError2) {
    console.log('❌ Failed to update high watermark:', updateError2.message)
    return
  }

  console.log('\n📊 High watermark update result:')
  console.log(`  New high: $${updateResult2.new_high}`)
  console.log(`  Max profit dollars: $${updateResult2.max_profit_dollars}`)
  console.log(`  Is win: ${updateResult2.is_win}`)

  // Verify LOSS status
  const { data: test2Check } = await supabase
    .from('index_trades')
    .select('*')
    .eq('id', test2Trade.id)
    .single()

  if (!test2Check?.is_win && test2Check?.max_profit < 100) {
    console.log('\n✅ PASS: Trade correctly NOT marked as WIN (max_profit < $100)')
  } else {
    console.log('\n❌ FAIL: Trade should NOT be WIN but is_win=' + test2Check?.is_win)
  }

  // Mark as expired and finalize
  await supabase
    .from('index_trades')
    .update({ status: 'expired' })
    .eq('id', test2Trade.id)

  console.log('\n🔒 Finalizing expired trade...')
  const { data: finalizeResult2, error: finalizeError2 } = await supabase.rpc(
    'finalize_trade_canonical',
    {
      p_trade_id: test2Trade.id
    }
  )

  if (finalizeError2) {
    console.log('❌ Failed to finalize:', finalizeError2.message)
  } else {
    console.log('✅ Finalization result:', JSON.stringify(finalizeResult2, null, 2))

    const expectedLoss = -250 // -total_cost
    if (finalizeResult2.final_pnl === expectedLoss && finalizeResult2.outcome === 'loss') {
      console.log(`\n✅ PASS: Final P&L = -$250 (total loss), outcome = LOSS`)
    } else {
      console.log(`\n❌ FAIL: Expected pnl=-$250, outcome=loss. Got pnl=${finalizeResult2.final_pnl}, outcome=${finalizeResult2.outcome}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('TEST 3: Entry $2.50, qty=3, high $2.85 => max_profit=$105 => WIN')
  console.log('='.repeat(80))

  // Create trade with qty=3
  const test3TradeData = {
    ...test1TradeData,
    polygon_option_ticker: 'O:SPXW250131C06110000',
    strike: 6110,
    qty: 3,
    entry_cost_usd: 2.50 * 3 * 100, // $750
  }

  const { data: test3Trade, error: test3Error } = await supabase
    .from('index_trades')
    .insert(test3TradeData)
    .select('id')
    .single()

  if (test3Error || !test3Trade) {
    console.log('❌ Failed to create test3 trade:', test3Error?.message)
    return
  }

  console.log(`✅ Created trade ${test3Trade.id} with entry $2.50, qty=3`)

  // Simulate price reaching $2.85
  // Profit = (2.85 - 2.50) * 3 * 100 = $105 (just over threshold)
  const { data: updateResult3, error: updateError3 } = await supabase.rpc(
    'update_trade_high_watermark',
    {
      p_trade_id: test3Trade.id,
      p_current_price: 2.85
    }
  )

  if (updateError3) {
    console.log('❌ Failed to update high watermark:', updateError3.message)
    return
  }

  console.log('\n📊 High watermark update result:')
  console.log(`  New high: $${updateResult3.new_high}`)
  console.log(`  Max profit dollars: $${updateResult3.max_profit_dollars}`)
  console.log(`  Is win: ${updateResult3.is_win}`)

  const { data: test3Check } = await supabase
    .from('index_trades')
    .select('*')
    .eq('id', test3Trade.id)
    .single()

  if (test3Check?.is_win && test3Check?.max_profit >= 100) {
    console.log('\n✅ PASS: Trade with qty=3 correctly marked as WIN')
  } else {
    console.log('\n❌ FAIL: Trade should be WIN but is_win=' + test3Check?.is_win)
  }

  console.log('\n' + '='.repeat(80))
  console.log('TEST 4: Idempotency - finalize twice should not double count')
  console.log('='.repeat(80))

  // Finalize first time
  const { data: firstFinalize } = await supabase.rpc('finalize_trade_canonical', {
    p_trade_id: test3Trade.id
  })

  console.log('First finalization:', firstFinalize)

  // Check counted_in_stats
  const { data: afterFirst } = await supabase
    .from('index_trades')
    .select('counted_in_stats, pnl_usd')
    .eq('id', test3Trade.id)
    .single()

  console.log(`After first: counted_in_stats=${afterFirst?.counted_in_stats}, pnl=${afterFirst?.pnl_usd}`)

  // Finalize second time (should be skipped)
  const { data: secondFinalize } = await supabase.rpc('finalize_trade_canonical', {
    p_trade_id: test3Trade.id
  })

  console.log('Second finalization:', secondFinalize)

  if (secondFinalize.message === 'Already finalized') {
    console.log('\n✅ PASS: Idempotency working - second finalization skipped')
  } else {
    console.log('\n❌ FAIL: Second finalization should be skipped')
  }

  console.log('\n' + '='.repeat(80))
  console.log('TEST 5: WIN status persists even if price drops')
  console.log('='.repeat(80))

  // Create trade
  const test5TradeData = {
    ...test1TradeData,
    polygon_option_ticker: 'O:SPXW250131C06115000',
    strike: 6115,
  }

  const { data: test5Trade, error: test5Error } = await supabase
    .from('index_trades')
    .insert(test5TradeData)
    .select('id')
    .single()

  if (test5Error || !test5Trade) {
    console.log('❌ Failed to create test5 trade:', test5Error?.message)
    return
  }

  console.log(`✅ Created trade ${test5Trade.id}`)

  // Price goes to $3.50 (WIN)
  await supabase.rpc('update_trade_high_watermark', {
    p_trade_id: test5Trade.id,
    p_current_price: 3.50
  })

  const { data: afterWin } = await supabase
    .from('index_trades')
    .select('is_winning_trade, is_win, max_profit, win_at')
    .eq('id', test5Trade.id)
    .single()

  console.log(`\nAfter reaching $3.50:`)
  console.log(`  is_win: ${afterWin?.is_win}`)
  console.log(`  max_profit: $${afterWin?.max_profit}`)
  console.log(`  win_at: ${afterWin?.win_at}`)

  // Price drops to $2.00 (still should be WIN)
  await supabase.rpc('update_trade_high_watermark', {
    p_trade_id: test5Trade.id,
    p_current_price: 2.00
  })

  const { data: afterDrop } = await supabase
    .from('index_trades')
    .select('is_winning_trade, is_win, max_profit, max_contract_price')
    .eq('id', test5Trade.id)
    .single()

  console.log(`\nAfter dropping to $2.00:`)
  console.log(`  is_win: ${afterDrop?.is_win}`)
  console.log(`  max_profit: $${afterDrop?.max_profit}`)
  console.log(`  max_contract_price: $${afterDrop?.max_contract_price}`)

  if (afterDrop?.is_win && afterDrop?.max_profit >= 100 && afterDrop?.max_contract_price === 3.50) {
    console.log('\n✅ PASS: WIN status persisted, high watermark preserved')
  } else {
    console.log('\n❌ FAIL: WIN status should persist after price drop')
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ ALL TESTS COMPLETE')
  console.log('='.repeat(80))

  // Cleanup
  console.log('\n🧹 Cleaning up test trades...')
  await supabase
    .from('index_trades')
    .delete()
    .in('id', [test1Trade.id, test2Trade.id, test3Trade.id, test5Trade.id])

  console.log('✅ Cleanup complete\n')
}

testCanonicalTradeSystem().catch(console.error)
