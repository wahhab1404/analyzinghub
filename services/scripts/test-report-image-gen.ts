import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, serviceKey)

async function testReportImageGeneration() {
  console.log('🧪 Testing Report Image Generation...\n')

  const { data: reports, error } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, author_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !reports) {
    console.log('❌ No reports found in database')
    console.log('Please generate a report first using: npm run test:pdf-report')
    return
  }

  console.log(`📄 Found report: ${reports.id}`)
  console.log(`   Date: ${reports.report_date}`)
  console.log(`   Author: ${reports.author_id}\n`)

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://analyzhub.com'
  const previewUrl = `${appBaseUrl}/api/reports/${reports.id}/preview`

  console.log(`🔗 Preview URL: ${previewUrl}\n`)

  console.log('📡 Testing HTML Preview Endpoint...')

  const previewResponse = await fetch(previewUrl)

  if (!previewResponse.ok) {
    console.log(`❌ Preview endpoint failed: ${previewResponse.status} ${previewResponse.statusText}`)
    const text = await previewResponse.text()
    console.log('Response:', text)
    return
  }

  const html = await previewResponse.text()
  console.log(`✅ Preview endpoint working! (${html.length} characters)\n`)

  console.log('📸 Now testing image generation via edge function...')

  const imageGenUrl = `${supabaseUrl}/functions/v1/generate-report-image`
  const imageResponse = await fetch(imageGenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      report_id: reports.id
    })
  })

  if (!imageResponse.ok) {
    console.log(`❌ Image generation failed: ${imageResponse.status}`)
    const errorText = await imageResponse.text()
    console.log('Error:', errorText)
    return
  }

  const imageBlob = await imageResponse.blob()
  console.log(`✅ Image generated successfully! (${imageBlob.size} bytes)\n`)

  console.log('🎉 All tests passed!')
  console.log('\n📝 Summary:')
  console.log('  ✓ Report found in database')
  console.log('  ✓ HTML preview endpoint working')
  console.log('  ✓ Image generation working')
  console.log('\n💡 The 404 issue has been fixed!')
}

testReportImageGeneration().catch(console.error)
