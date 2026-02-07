import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

async function checkTrades() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('Checking index_trades table...\n')

  const { data, error } = await supabase
    .from('index_trades')
    .select('id, author_id, status, underlying_index_symbol, instrument_type, is_winning_trade, max_profit, profit_from_entry')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Found ${data?.length || 0} trades:`)
  console.log(JSON.stringify(data, null, 2))

  // Check total count
  const { count } = await supabase
    .from('index_trades')
    .select('id', { count: 'exact', head: true })

  console.log(`\nTotal trades in database: ${count}`)
}

checkTrades()
