import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkStockAnalyses() {
  console.log('🔍 Checking stock analyses with activation enabled...\n')

  // Check regular stock analyses (not index options)
  const { data: analyses, error } = await supabase
    .from('analyses')
    .select(`
      id,
      symbol_id,
      symbols!inner(symbol),
      stop_loss,
      activation_enabled,
      activation_type,
      activation_price,
      activation_timeframe,
      activation_status,
      activated_at,
      activation_met_at,
      last_eval_price,
      last_eval_at,
      preactivation_stop_touched,
      created_at
    `)
    .eq('activation_enabled', true)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!analyses || analyses.length === 0) {
    console.log('ℹ️  No stock analyses with activation enabled found.')
    return
  }

  console.log(`📊 Found ${analyses.length} stock analyses with activation enabled:\n`)

  for (const analysis of analyses) {
    const symbol = (analysis as any).symbols?.symbol
    console.log('─'.repeat(80))
    console.log(`📌 Analysis ID: ${analysis.id}`)
    console.log(`   Symbol: ${symbol}`)
    console.log(`   Stop Loss: $${analysis.stop_loss}`)
    console.log(`   Activation Status: ${analysis.activation_status}`)
    console.log(`   Activation Type: ${analysis.activation_type}`)
    console.log(`   Activation Price: $${analysis.activation_price}`)
    console.log(`   Activation Timeframe: ${analysis.activation_timeframe}`)
    console.log(`   Activated At: ${analysis.activated_at || 'Not activated'}`)
    console.log(`   Last Eval Price: ${analysis.last_eval_price || 'N/A'}`)
    console.log(`   Preactivation Stop Touched: ${analysis.preactivation_stop_touched}`)

    // Get current price from Polygon
    try {
      const response = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${process.env.POLYGON_API_KEY}`
      )
      const data = await response.json()
      const currentPrice = data.ticker?.day?.c || data.ticker?.lastTrade?.p

      if (currentPrice) {
        console.log(`   Current Price: $${currentPrice.toFixed(2)}`)

        // Check if activation should have triggered
        if (analysis.activation_status === 'published_inactive' && analysis.activation_price) {
          const shouldActivate = analysis.activation_type === 'ABOVE_PRICE'
            ? currentPrice > analysis.activation_price
            : analysis.activation_type === 'UNDER_PRICE'
            ? currentPrice < analysis.activation_price
            : false

          if (shouldActivate) {
            console.log(`   ⚠️  SHOULD BE ACTIVATED! (${analysis.activation_type}: ${currentPrice} vs ${analysis.activation_price})`)
          }
        }

        // Check if stop loss should have triggered
        if (analysis.activation_status === 'published_inactive' && !analysis.preactivation_stop_touched) {
          if (currentPrice <= analysis.stop_loss) {
            console.log(`   ⚠️  Preactivation stop should be marked as touched! (Current: $${currentPrice} <= Stop: $${analysis.stop_loss})`)
          }
        }
      }
    } catch (e) {
      console.log(`   ⚠️  Could not fetch current price: ${e}`)
    }

    console.log('')
  }

  console.log('─'.repeat(80))
}

checkStockAnalyses().catch(console.error)
