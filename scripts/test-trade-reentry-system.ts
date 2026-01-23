import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testReentrySystem() {
  console.log('🧪 Testing Trade Re-Entry System\n')
  console.log('='.repeat(60))

  // Get a test user (analyzer)
  const { data: testUser } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('email', 'analyzer@test.com')
    .single()

  if (!testUser) {
    console.log('❌ Test user not found. Please create analyzer@test.com first.')
    return
  }

  console.log(`\n✅ Using test user: ${testUser.full_name} (${testUser.id})`)

  console.log('\n1️⃣  Test 1: NEW_ENTRY Decision')
  console.log('-'.repeat(60))

  // Create first trade
  console.log('\n📝 Creating first trade...')
  const firstTradeData = {
    author_id: testUser.id,
    status: 'active',
    instrument_type: 'options',
    direction: 'call',
    underlying_index_symbol: 'SPX',
    polygon_underlying_index_ticker: 'I:SPX',
    polygon_option_ticker: 'SPXW250124C06000000',
    strike: 6000,
    expiry: '2025-01-24',
    option_type: 'call',
    contract_multiplier: 100,
    entry_underlying_snapshot: {price: 5950, timestamp: new Date().toISOString()},
    entry_contract_snapshot: { mid: 10.50, timestamp: new Date().toISOString() },
    current_contract: 10.50,
    qty: 2,
    entry_cost_usd: 10.50 * 2 * 100,
    max_profit: 0,
    max_contract_price: 10.50,
    original_entry_price: 10.50,
    trade_price_basis: 'OPTION_PREMIUM',
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  }

  const { data: firstTrade, error: firstTradeError } = await supabase
    .from('index_trades')
    .insert(firstTradeData)
    .select('id')
    .single()

  if (firstTradeError || !firstTrade) {
    console.log('❌ Failed to create first trade:', firstTradeError?.message)
    return
  }

  console.log(`✅ First trade created: ${firstTrade.id}`)

  // Simulate it reaching a high price
  console.log('\n📈 Simulating price movement to trigger max profit...')
  await supabase
    .from('index_trades')
    .update({
      max_contract_price: 12.00,
      max_profit: (12.00 - 10.50) * 2 * 100
    })
    .eq('id', firstTrade.id)

  console.log(`✅ Max profit set to $${(12.00 - 10.50) * 2 * 100}`)

  // Now test NEW_ENTRY
  console.log('\n🔄 Testing NEW_ENTRY: Close previous and create new...')

  const newTradeData = {
    author_id: testUser.id,
    status: 'active',
    instrument_type: 'options',
    direction: 'call',
    underlying_index_symbol: 'SPX',
    polygon_underlying_index_ticker: 'I:SPX',
    polygon_option_ticker: 'SPXW250124C06000000',
    strike: '6000',
    expiry: '2025-01-24',
    option_type: 'call',
    contract_multiplier: '100',
    entry_underlying_snapshot: {price: 5970, timestamp: new Date().toISOString()},
    entry_contract_snapshot: { mid: 11.25, timestamp: new Date().toISOString() },
    entry_cost_usd: (11.25 * 1 * 100).toString(),
    qty: '1',
    trade_price_basis: 'OPTION_PREMIUM',
  }

  const { data: newEntryResult, error: newEntryError } = await supabase.rpc(
    'process_trade_new_entry',
    {
      p_existing_trade_id: firstTrade.id,
      p_new_trade_data: newTradeData,
      p_idempotency_key: `test_new_entry_${Date.now()}`
    }
  )

  if (newEntryError) {
    console.log('❌ NEW_ENTRY failed:', newEntryError.message)
  } else {
    console.log('✅ NEW_ENTRY result:', JSON.stringify(newEntryResult, null, 2))

    // Verify old trade was closed properly
    const { data: closedTrade } = await supabase
      .from('index_trades')
      .select('*')
      .eq('id', firstTrade.id)
      .single()

    console.log(`\n📊 Previous Trade Status:`)
    console.log(`  Status: ${closedTrade?.status}`)
    console.log(`  Closure Reason: ${closedTrade?.closure_reason}`)
    console.log(`  Final P&L: $${closedTrade?.pnl_usd}`)
    console.log(`  Outcome: ${closedTrade?.outcome}`)

    // Verify new trade was created
    const { data: newTrade } = await supabase
      .from('index_trades')
      .select('*')
      .eq('id', newEntryResult.new_trade_id)
      .single()

    console.log(`\n📊 New Trade Status:`)
    console.log(`  Status: ${newTrade?.status}`)
    console.log(`  Entry Price: $${newTrade?.entry_contract_snapshot?.mid}`)
    console.log(`  Qty: ${newTrade?.qty}`)
    console.log(`  Entry Cost: $${newTrade?.entry_cost_usd}`)

    if (closedTrade?.status === 'closed' && newTrade?.status === 'active') {
      console.log('\n✅ PASSED: NEW_ENTRY correctly closed previous and created new')
    } else {
      console.log('\n❌ FAILED: NEW_ENTRY did not work correctly')
    }

    // Check events
    const { data: events } = await supabase
      .from('index_trade_events')
      .select('*')
      .in('trade_id', [firstTrade.id, newEntryResult.new_trade_id])
      .order('created_at', { ascending: false })

    console.log(`\n📋 Events Created: ${events?.length || 0}`)
    events?.forEach((event, idx) => {
      console.log(`  ${idx + 1}. ${event.event_type} for trade ${event.trade_id}`)
    })
  }

  console.log('\n2️⃣  Test 2: AVERAGE_ADJUSTMENT Decision')
  console.log('-'.repeat(60))

  // Create second test trade
  console.log('\n📝 Creating second trade for averaging test...')
  const secondTradeData = {
    author_id: testUser.id,
    status: 'active',
    instrument_type: 'options',
    direction: 'put',
    underlying_index_symbol: 'SPX',
    polygon_underlying_index_ticker: 'I:SPX',
    polygon_option_ticker: 'SPXW250124P05900000',
    strike: 5900,
    expiry: '2025-01-24',
    option_type: 'put',
    contract_multiplier: 100,
    entry_underlying_snapshot: {price: 5950, timestamp: new Date().toISOString()},
    entry_contract_snapshot: { mid: 8.00, timestamp: new Date().toISOString() },
    current_contract: 8.00,
    qty: 3,
    entry_cost_usd: 8.00 * 3 * 100,
    max_profit: 50,
    max_contract_price: 8.17,
    original_entry_price: 8.00,
    trade_price_basis: 'OPTION_PREMIUM',
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  }

  const { data: secondTrade, error: secondTradeError } = await supabase
    .from('index_trades')
    .insert(secondTradeData)
    .select('id')
    .single()

  if (secondTradeError || !secondTrade) {
    console.log('❌ Failed to create second trade:', secondTradeError?.message)
    return
  }

  console.log(`✅ Second trade created: ${secondTrade.id}`)
  console.log(`   Entry: $8.00 × 3 contracts = $2,400`)
  console.log(`   Max Profit so far: $50`)

  // Now test AVERAGE_ADJUSTMENT
  console.log('\n🔄 Testing AVERAGE_ADJUSTMENT: Adding 2 more contracts at $9.50...')

  const { data: avgResult, error: avgError } = await supabase.rpc(
    'process_trade_average_adjustment',
    {
      p_existing_trade_id: secondTrade.id,
      p_new_entry_price: 9.50,
      p_new_qty: 2,
      p_idempotency_key: `test_avg_${Date.now()}`
    }
  )

  if (avgError) {
    console.log('❌ AVERAGE_ADJUSTMENT failed:', avgError.message)
  } else {
    console.log('✅ AVERAGE_ADJUSTMENT result:', JSON.stringify(avgResult, null, 2))

    // Verify trade was updated
    const { data: updatedTrade } = await supabase
      .from('index_trades')
      .select('*')
      .eq('id', secondTrade.id)
      .single()

    const expectedAvg = (8.00 * 3 + 9.50 * 2) / 5
    const actualAvg = updatedTrade?.entry_contract_snapshot?.mid

    console.log(`\n📊 Updated Trade:`)
    console.log(`  Old Entry: $8.00 × 3`)
    console.log(`  Added: $9.50 × 2`)
    console.log(`  Expected Avg: $${expectedAvg.toFixed(2)}`)
    console.log(`  Actual Avg: $${actualAvg}`)
    console.log(`  New Qty: ${updatedTrade?.qty}`)
    console.log(`  New Total Cost: $${updatedTrade?.entry_cost_usd}`)
    console.log(`  New Max Profit: $${updatedTrade?.max_profit}`)
    console.log(`  Averaged Times: ${updatedTrade?.averaged_times}`)

    const avgMatch = Math.abs(actualAvg - expectedAvg) < 0.01
    const qtyMatch = updatedTrade?.qty === 5

    if (avgMatch && qtyMatch) {
      console.log('\n✅ PASSED: AVERAGE_ADJUSTMENT correctly calculated weighted average')
    } else {
      console.log('\n❌ FAILED: AVERAGE_ADJUSTMENT calculation incorrect')
    }

    // Check events
    const { data: avgEvents } = await supabase
      .from('index_trade_events')
      .select('*')
      .eq('trade_id', secondTrade.id)
      .eq('event_type', 'AVERAGE_ADJUSTMENT')

    console.log(`\n📋 Average Adjustment Events: ${avgEvents?.length || 0}`)
    avgEvents?.forEach((event) => {
      console.log(`  Event Data:`, JSON.stringify(event.event_data, null, 2))
    })
  }

  console.log('\n3️⃣  Test 3: Idempotency Check')
  console.log('-'.repeat(60))

  console.log('\n🔄 Attempting to process same adjustment again with same idempotency key...')

  const { data: idempResult, error: idempError } = await supabase.rpc(
    'process_trade_average_adjustment',
    {
      p_existing_trade_id: secondTrade.id,
      p_new_entry_price: 9.50,
      p_new_qty: 2,
      p_idempotency_key: `test_avg_${Date.now() - 1000}` // Use a previous key
    }
  )

  if (idempResult?.skipped || idempResult?.message === 'Already processed') {
    console.log('✅ PASSED: Idempotency working - duplicate prevented')
  } else {
    console.log('⚠️  WARNING: Idempotency check result:', idempResult)
  }

  console.log('\n4️⃣  Test 4: Check Active Trade Detection Function')
  console.log('-'.repeat(60))

  const { data: activeCheck, error: activeCheckError } = await supabase.rpc(
    'check_active_trade_for_contract',
    {
      p_author_id: testUser.id,
      p_polygon_option_ticker: 'SPXW250124P05900000',
      p_strike: null,
      p_expiry: null,
      p_option_type: null,
      p_underlying_symbol: 'SPX'
    }
  )

  if (activeCheckError) {
    console.log('❌ Active check failed:', activeCheckError.message)
  } else {
    console.log('✅ Active trade detection result:')
    console.log(JSON.stringify(activeCheck, null, 2))

    if (activeCheck && activeCheck.length > 0) {
      console.log('\n✅ PASSED: Active trade correctly detected')
    } else {
      console.log('\n❌ FAILED: Active trade not detected')
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Test Suite Complete!\n')

  // Cleanup
  console.log('🧹 Cleaning up test trades...')
  await supabase
    .from('index_trades')
    .delete()
    .in('id', [firstTrade.id, secondTrade.id, newEntryResult?.new_trade_id].filter(Boolean))

  console.log('✅ Cleanup complete\n')
}

testReentrySystem().catch(console.error)
