import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function manuallyActivateStuckAnalyses() {
  console.log('🔧 Manually activating stuck analyses that passed activation conditions...\n')

  // LMT: activation at $546.7, current at $573+
  const lmtId = '63f78a44-dbc8-47ce-a25c-25300171ab70'

  // SBUX: activation at $90.6, current at $91+
  const sbuxId = '1184f558-187f-40ec-890b-5569b66e2370'

  const analysesToActivate = [
    { id: lmtId, symbol: 'LMT', activationPrice: 546.7, currentPrice: 573.5 },
    { id: sbuxId, symbol: 'SBUX', activationPrice: 90.6, currentPrice: 91.4 }
  ]

  for (const analysis of analysesToActivate) {
    console.log(`\n📌 Activating ${analysis.symbol}...`)
    console.log(`   Activation Price: $${analysis.activationPrice}`)
    console.log(`   Current Price: $${analysis.currentPrice}`)
    console.log(`   Status: Price already passed activation level`)

    const { data, error } = await supabase
      .from('analyses')
      .update({
        activation_status: 'active',
        activated_at: new Date().toISOString(),
        activation_met_at: new Date().toISOString(),
        activation_notes: `Manually activated - price already passed ${analysis.activationPrice} (current: ${analysis.currentPrice})`
      })
      .eq('id', analysis.id)
      .select()

    if (error) {
      console.error(`   ❌ Error:`, error)
    } else {
      console.log(`   ✅ Successfully activated!`)
    }
  }

  console.log('\n✨ Done!')
}

manuallyActivateStuckAnalyses().catch(console.error)
