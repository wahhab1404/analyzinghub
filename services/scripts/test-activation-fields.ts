import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function testActivationFields() {
  console.log('🔍 Testing activation fields in index_analyses...\n')

  // Fetch one analysis to check if fields are returned
  const { data, error } = await supabase
    .from('index_analyses')
    .select(`
      id,
      title,
      activation_enabled,
      activation_type,
      activation_price,
      activation_timeframe,
      activation_status,
      activated_at,
      activation_met_at
    `)
    .limit(1)
    .single()

  if (error) {
    console.error('❌ Error fetching analysis:', error)
    return
  }

  console.log('✅ Successfully fetched analysis with activation fields:')
  console.log(JSON.stringify(data, null, 2))

  console.log('\n📊 Activation Fields Status:')
  console.log('  activation_enabled:', data.activation_enabled)
  console.log('  activation_type:', data.activation_type || 'not set')
  console.log('  activation_price:', data.activation_price || 'not set')
  console.log('  activation_timeframe:', data.activation_timeframe || 'not set')
  console.log('  activation_status:', data.activation_status)

  console.log('\n✅ All activation fields are present and accessible!')
}

testActivationFields()
