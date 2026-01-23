import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function retroactiveMarkSuccess() {
  console.log('🔄 Retroactively Marking Analyses with Target Hits as SUCCESS\n')
  console.log('='.repeat(60))

  const { data: analysesWithHits, error: fetchError } = await supabase
    .from('analyses')
    .select(`
      id,
      analyzer_id,
      status,
      targets_hit_data,
      symbol:symbols!inner(symbol)
    `)
    .eq('status', 'IN_PROGRESS')
    .not('targets_hit_data', 'is', null)

  if (fetchError) {
    console.error('❌ Failed to fetch analyses:', fetchError)
    return
  }

  const analysesToUpdate = analysesWithHits.filter((a: any) => {
    return Array.isArray(a.targets_hit_data) && a.targets_hit_data.length > 0
  })

  console.log(`\nFound ${analysesToUpdate.length} analyses with targets hit but still IN_PROGRESS\n`)

  let successCount = 0
  let errorCount = 0

  for (const analysis of analysesToUpdate) {
    console.log(`\n📊 Processing ${analysis.symbol.symbol} (ID: ${analysis.id})`)
    console.log(`   Targets hit: ${analysis.targets_hit_data.length}`)

    const firstHit = analysis.targets_hit_data[0]

    try {
      const { data: result, error: finalizeError } = await supabase.rpc(
        'finalize_analysis_success',
        {
          p_analysis_id: analysis.id,
          p_target_id: firstHit.target_id,
          p_hit_price: firstHit.hit_price,
          p_hit_session: firstHit.hit_session || 'unknown',
          p_hit_source: firstHit.hit_source || 'unknown'
        }
      )

      if (finalizeError) {
        console.log(`   ❌ Error: ${finalizeError.message}`)
        errorCount++
      } else if (result?.skipped) {
        console.log(`   ⏭️  Skipped: ${result.message}`)
      } else {
        console.log(`   ✅ Success! Marked as SUCCESS`)
        successCount++
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error: any) {
      console.log(`   ❌ Exception: ${error.message}`)
      errorCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`\n✅ Complete!`)
  console.log(`   Successfully updated: ${successCount}`)
  console.log(`   Errors: ${errorCount}`)
  console.log(`   Total processed: ${analysesToUpdate.length}\n`)
}

retroactiveMarkSuccess().catch(console.error)
