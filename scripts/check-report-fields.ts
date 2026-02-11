import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkReportFields() {
  console.log('🔍 Checking report fields...\n')

  const { data: reports, error } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, file_url, image_url, html_content, status')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!reports || reports.length === 0) {
    console.log('⚠️  No reports found')
    return
  }

  console.log(`📊 Found ${reports.length} reports:\n`)

  reports.forEach((report, index) => {
    console.log(`${index + 1}. Report ID: ${report.id}`)
    console.log(`   Date: ${report.report_date}`)
    console.log(`   Status: ${report.status}`)
    console.log(`   Has file_url: ${report.file_url ? '✅ YES' : '❌ NO'}`)
    console.log(`   Has image_url: ${report.image_url ? '✅ YES' : '❌ NO'}`)
    console.log(`   Has html_content: ${report.html_content ? '✅ YES' : '❌ NO'}`)

    if (report.file_url) {
      console.log(`   File URL: ${report.file_url.substring(0, 80)}...`)
    }
    if (report.image_url) {
      console.log(`   Image URL: ${report.image_url.substring(0, 80)}...`)
    }
    if (report.html_content) {
      console.log(`   HTML Length: ${report.html_content.length} chars`)
    }
    console.log()
  })
}

checkReportFields().catch(console.error)
