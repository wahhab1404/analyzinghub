import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Target {
  price: number
  expected_time?: string
}

async function addTargetsToAnalysis(analysisId: string, targets: Target[]) {
  console.log(`\nAdding ${targets.length} targets to analysis ${analysisId}...`)

  // Delete existing targets first
  const { error: deleteError } = await supabase
    .from('analysis_targets')
    .delete()
    .eq('analysis_id', analysisId)

  if (deleteError) {
    console.error('Error deleting old targets:', deleteError)
    return
  }

  // Insert new targets
  const targetsData = targets.map(target => ({
    analysis_id: analysisId,
    price: target.price,
    expected_time: target.expected_time || null
  }))

  const { data, error } = await supabase
    .from('analysis_targets')
    .insert(targetsData)
    .select()

  if (error) {
    console.error('Error inserting targets:', error)
    return
  }

  console.log('✓ Successfully added targets:', data)
}

async function main() {
  console.log('=== Add Targets to Analysis ===\n')

  // Get recent analyses
  const { data: analyses, error } = await supabase
    .from('analyses')
    .select(`
      id,
      created_at,
      symbols!inner(symbol),
      profiles!inner(full_name),
      stop_loss
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error fetching analyses:', error)
    return
  }

  console.log('Recent Analyses:')
  analyses?.forEach((a: any, i: number) => {
    console.log(`${i + 1}. ${a.symbols.symbol} - ${a.profiles.full_name} (${new Date(a.created_at).toLocaleDateString()})`)
    console.log(`   ID: ${a.id}`)
    console.log(`   Stop Loss: ${a.stop_loss}\n`)
  })

  // Example: Add targets to the most recent analysis (PFG)
  // Replace these values with your desired targets
  const pfgAnalysisId = analyses?.[0]?.id

  if (pfgAnalysisId) {
    console.log('\n=== Example: Adding targets to PFG analysis ===')
    console.log('To add targets, modify the script with your desired values:\n')
    console.log('await addTargetsToAnalysis(pfgAnalysisId, [')
    console.log('  { price: 95.00 },  // TP1')
    console.log('  { price: 100.00 }, // TP2')
    console.log('  { price: 105.00 }, // TP3')
    console.log('])\n')

    // Uncomment and modify these lines to actually add targets:
    // await addTargetsToAnalysis(pfgAnalysisId, [
    //   { price: 95.00 },
    //   { price: 100.00 },
    //   { price: 105.00 }
    // ])
  }
}

main().catch(console.error)
