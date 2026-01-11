import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function testADMActivation() {
  console.log('🔍 Testing ADM analysis activation fields...\n')

  // Get the ADM analysis
  const { data, error } = await supabase
    .from('analyses')
    .select(`
      id,
      title,
      status,
      activation_enabled,
      activation_type,
      activation_price,
      activation_timeframe,
      activation_status,
      activated_at,
      preactivation_stop_touched,
      symbols (symbol)
    `)
    .eq('symbols.symbol', 'ADM')
    .limit(1)
    .single()

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log('✅ ADM Analysis Found:')
  console.log('ID:', data.id)
  console.log('Status:', data.status)
  console.log('Symbol:', (data as any).symbols?.symbol)
  console.log('\n📊 Activation Fields:')
  console.log('  activation_enabled:', data.activation_enabled)
  console.log('  activation_type:', data.activation_type)
  console.log('  activation_price:', data.activation_price)
  console.log('  activation_timeframe:', data.activation_timeframe)
  console.log('  activation_status:', data.activation_status)
  console.log('  activated_at:', data.activated_at || 'not yet')
  console.log('  preactivation_stop_touched:', data.preactivation_stop_touched || false)

  // Check if condition should show as "Waiting"
  const isWaiting = data.activation_enabled &&
    data.activation_status === 'published_inactive'

  console.log('\n🎯 Display Logic:')
  console.log('  Should show "Waiting Activation" badge:', isWaiting)
  console.log('  Badge text:', isWaiting ? '⚡ Waiting Activation' : `📊 ${data.status}`)
}

testADMActivation()
