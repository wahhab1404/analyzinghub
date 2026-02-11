import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verifyButtons() {
  console.log('🔍 Checking what data makes buttons show/hide...\n')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .limit(1)

  if (!profiles || profiles.length === 0) {
    console.log('❌ No profiles found')
    return
  }

  const userId = profiles[0].id
  console.log(`👤 User: ${profiles[0].email}\n`)

  const { data: reports } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(3)

  console.log(`📊 Found ${reports?.length || 0} reports\n`)

  reports?.forEach((report, index) => {
    console.log(`Report ${index + 1}: ${report.report_date}`)
    console.log(`  Status: ${report.status}`)
    console.log(`  Period: ${report.period_type || 'daily'}`)
    console.log(`  Language: ${report.language_mode}`)
    console.log('\n  Button Availability:')
    console.log(`    ✓ Preview Report button - Always shows (${report.html_content ? 'enabled' : 'DISABLED - no html_content'})`)
    console.log(`    ✓ Preview Image button - Always shows (${report.image_url ? 'enabled' : 'DISABLED - no image_url'})`)
    console.log(`    ✓ Download HTML button - Always shows (${report.file_url ? 'enabled' : 'DISABLED - no file_url'})`)
    console.log(`    ✓ Download PDF button - Always shows (${report.file_url ? 'enabled' : 'DISABLED - no file_url'})`)
    console.log(`    ✓ Send to Telegram button - Always shows (always enabled)`)
    console.log('\n  Data Fields:')
    console.log(`    file_url: ${report.file_url ? 'YES ✅' : 'NO ❌'}`)
    console.log(`    image_url: ${report.image_url ? 'YES ✅' : 'NO ❌'}`)
    console.log(`    html_content: ${report.html_content ? `YES ✅ (${report.html_content.length} chars)` : 'NO ❌'}`)
    console.log(`    summary: ${report.summary ? 'YES ✅' : 'NO ❌'}`)
    console.log('\n')
  })

  console.log('💡 All buttons should be visible in the UI now!')
  console.log('   Some buttons may be disabled (grayed out) if data is missing.')
  console.log('   Look for a gray panel on the right side of each report card.')
}

verifyButtons().catch(console.error)
