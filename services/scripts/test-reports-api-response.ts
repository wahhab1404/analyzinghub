import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testReportsAPI() {
  console.log('🔍 Testing what reports API returns...\n')

  // Get a user first
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, role:roles(name)')
    .limit(1)

  if (!profiles || profiles.length === 0) {
    console.log('❌ No profiles found')
    return
  }

  const userId = profiles[0].id
  console.log(`👤 Using user: ${profiles[0].email}`)
  console.log(`🔑 User ID: ${userId}\n`)

  // Query exactly like the API does
  const { data: reports, error } = await supabase
    .from('daily_trade_reports')
    .select(`
      id,
      report_date,
      language_mode,
      status,
      file_url,
      image_url,
      created_at,
      period_type,
      start_date,
      end_date,
      summary,
      html_content
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`📊 Found ${reports?.length || 0} reports\n`)

  reports?.forEach((report, index) => {
    console.log(`${index + 1}. Report:`)
    console.log(`   ID: ${report.id}`)
    console.log(`   Date: ${report.report_date}`)
    console.log(`   Status: ${report.status}`)
    console.log(`   Period Type: ${report.period_type || 'daily'}`)
    console.log(`   Language: ${report.language_mode}`)
    console.log(`   Has file_url: ${report.file_url ? '✅ YES' : '❌ NO'}`)
    console.log(`   Has image_url: ${report.image_url ? '✅ YES' : '❌ NO'}`)
    console.log(`   Has html_content: ${report.html_content ? '✅ YES' : '❌ NO'}`)
    console.log(`   Has summary: ${report.summary ? '✅ YES' : '❌ NO'}`)

    if (report.file_url) {
      console.log(`   File URL (first 100 chars): ${report.file_url.substring(0, 100)}...`)
    }
    if (report.image_url) {
      console.log(`   Image URL (first 100 chars): ${report.image_url.substring(0, 100)}...`)
    }
    if (report.html_content) {
      console.log(`   HTML Length: ${report.html_content.length} chars`)
    }
    console.log()
  })
}

testReportsAPI().catch(console.error)
