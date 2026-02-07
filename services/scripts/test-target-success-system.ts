import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testTargetSuccessSystem() {
  console.log('🧪 Testing Target Hit = Analysis Success System\n')
  console.log('=' . repeat(60))

  console.log('\n1️⃣  Testing SBUX Analysis (Long from $88.88, Current $96.40)')
  console.log('-'.repeat(60))

  const { data: sbuxAnalysis, error: sbuxError } = await supabase
    .from('analyses')
    .select(`
      id,
      status,
      success_at,
      success_reason,
      first_hit_target_id,
      success_counted,
      targets_hit_data,
      symbol:symbols!inner(symbol)
    `)
    .eq('symbols.symbol', 'SBUX')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (sbuxError || !sbuxAnalysis) {
    console.log('❌ Failed to fetch SBUX analysis:', sbuxError?.message)
  } else {
    console.log(`\n📊 SBUX Analysis ID: ${sbuxAnalysis.id}`)
    console.log(`Status: ${sbuxAnalysis.status}`)
    console.log(`Success Counted: ${sbuxAnalysis.success_counted}`)
    console.log(`Success At: ${sbuxAnalysis.success_at || 'N/A'}`)
    console.log(`Success Reason: ${sbuxAnalysis.success_reason || 'N/A'}`)
    console.log(`First Hit Target ID: ${sbuxAnalysis.first_hit_target_id || 'N/A'}`)
    console.log(`\nTargets Hit Data:`, JSON.stringify(sbuxAnalysis.targets_hit_data, null, 2))

    const { data: sbuxTargets } = await supabase
      .from('analysis_targets')
      .select('*')
      .eq('analysis_id', sbuxAnalysis.id)
      .order('price', { ascending: true })

    console.log(`\n🎯 Targets:`)
    sbuxTargets?.forEach((target, idx) => {
      const isHit = sbuxAnalysis.targets_hit_data?.some((hit: any) => hit.target_id === target.id)
      console.log(`  TP${idx + 1}: $${target.price} - ${isHit ? '✅ HIT' : '⏸️  NOT HIT'}`)
    })

    if (sbuxAnalysis.status === 'SUCCESS') {
      console.log('\n✅ PASSED: SBUX analysis correctly marked as SUCCESS')
    } else {
      console.log('\n❌ FAILED: SBUX analysis should be SUCCESS but is:', sbuxAnalysis.status)
    }
  }

  console.log('\n2️⃣  Testing LMT Analysis (Long from $542.92, Pre-Market $593.91)')
  console.log('-'.repeat(60))

  const { data: lmtAnalysis, error: lmtError } = await supabase
    .from('analyses')
    .select(`
      id,
      status,
      success_at,
      success_reason,
      first_hit_target_id,
      success_counted,
      targets_hit_data,
      symbol:symbols!inner(symbol)
    `)
    .eq('symbols.symbol', 'LMT')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (lmtError || !lmtAnalysis) {
    console.log('❌ Failed to fetch LMT analysis:', lmtError?.message)
  } else {
    console.log(`\n📊 LMT Analysis ID: ${lmtAnalysis.id}`)
    console.log(`Status: ${lmtAnalysis.status}`)
    console.log(`Success Counted: ${lmtAnalysis.success_counted}`)
    console.log(`Success At: ${lmtAnalysis.success_at || 'N/A'}`)
    console.log(`Success Reason: ${lmtAnalysis.success_reason || 'N/A'}`)
    console.log(`First Hit Target ID: ${lmtAnalysis.first_hit_target_id || 'N/A'}`)
    console.log(`\nTargets Hit Data:`, JSON.stringify(lmtAnalysis.targets_hit_data, null, 2))

    const { data: lmtTargets } = await supabase
      .from('analysis_targets')
      .select('*')
      .eq('analysis_id', lmtAnalysis.id)
      .order('price', { ascending: true })

    console.log(`\n🎯 Targets:`)
    lmtTargets?.forEach((target, idx) => {
      const isHit = lmtAnalysis.targets_hit_data?.some((hit: any) => hit.target_id === target.id)
      console.log(`  TP${idx + 1}: $${target.price} - ${isHit ? '✅ HIT' : '⏸️  NOT HIT'}`)
    })

    const targetsHit = lmtAnalysis.targets_hit_data?.length || 0
    if (lmtAnalysis.status === 'SUCCESS' && targetsHit >= 1) {
      console.log(`\n✅ PASSED: LMT analysis correctly marked as SUCCESS with ${targetsHit} targets hit`)
    } else {
      console.log(`\n❌ FAILED: LMT analysis should be SUCCESS with targets hit, but is: ${lmtAnalysis.status}`)
    }
  }

  console.log('\n3️⃣  Testing Idempotency (No Double Counting)')
  console.log('-'.repeat(60))

  const testAnalysis = sbuxAnalysis || lmtAnalysis
  if (testAnalysis) {
    console.log(`\nChecking for duplicate success events for analysis: ${testAnalysis.id}`)

    const { data: events, error: eventsError } = await supabase
      .from('analysis_events')
      .select('*')
      .eq('analysis_id', testAnalysis.id)
      .eq('event_type', 'ANALYSIS_SUCCESS')

    if (eventsError) {
      console.log('❌ Error checking events:', eventsError.message)
    } else {
      console.log(`Found ${events?.length || 0} ANALYSIS_SUCCESS event(s)`)

      if (events && events.length > 1) {
        console.log('❌ FAILED: Multiple success events found (double counting detected)')
        events.forEach((event, idx) => {
          console.log(`  Event ${idx + 1}: ${event.created_at}`)
        })
      } else if (testAnalysis.status === 'SUCCESS' && events && events.length === 1) {
        console.log('✅ PASSED: Exactly one success event (idempotency working)')
        console.log(`  Event created at: ${events[0].created_at}`)
        console.log(`  Metadata:`, JSON.stringify(events[0].metadata, null, 2))
      } else if (testAnalysis.status === 'SUCCESS' && events && events.length === 0) {
        console.log('⚠️  WARNING: Analysis is SUCCESS but no event recorded')
      } else {
        console.log('✅ PASSED: No success events for non-SUCCESS analysis')
      }
    }
  }

  console.log('\n4️⃣  Testing Analyzer Stats Update')
  console.log('-'.repeat(60))

  if (testAnalysis) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, successful_analyses, total_analyses')
      .eq('id', testAnalysis.analyzer_id)
      .single()

    if (profileError || !profile) {
      console.log('❌ Failed to fetch analyzer profile:', profileError?.message)
    } else {
      console.log(`\n👤 Analyzer: ${profile.full_name}`)
      console.log(`Successful Analyses: ${profile.successful_analyses || 0}`)
      console.log(`Total Analyses: ${profile.total_analyses || 0}`)

      if (testAnalysis.status === 'SUCCESS' && profile.successful_analyses > 0) {
        console.log('✅ PASSED: Analyzer stats updated after success')
      } else if (testAnalysis.status === 'SUCCESS' && profile.successful_analyses === 0) {
        console.log('⚠️  WARNING: Analysis is SUCCESS but analyzer stats not updated')
      } else {
        console.log('ℹ️  INFO: Analysis not yet successful')
      }
    }
  }

  console.log('\n5️⃣  Testing UI Status Display Mapping')
  console.log('-'.repeat(60))

  const statusTests = [
    { status: 'SUCCESS', expectedBadge: 'Successful', expectedColor: 'green', expectedVariant: 'success' },
    { status: 'FAILED', expectedBadge: 'Failed', expectedColor: 'red', expectedVariant: 'destructive' },
    { status: 'IN_PROGRESS', expectedBadge: 'Active', expectedColor: 'blue', expectedVariant: 'default' },
  ]

  let allPassed = true
  for (const test of statusTests) {
    const { data: result } = await supabase.rpc('get_analysis_status_display', {
      p_status: test.status
    })

    if (result) {
      const passed = result.badgeText === test.expectedBadge && result.color === test.expectedColor
      console.log(`${passed ? '✅' : '❌'} ${test.status}: ${result.badgeText} (${result.color}) - Variant: ${test.expectedVariant}`)
      if (!passed) allPassed = false
    } else {
      console.log(`❌ ${test.status}: Function returned null`)
      allPassed = false
    }
  }

  if (allPassed) {
    console.log('\n✅ PASSED: All status display mappings correct')
  } else {
    console.log('\n❌ FAILED: Some status display mappings incorrect')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Test Suite Complete!\n')
}

testTargetSuccessSystem().catch(console.error)
