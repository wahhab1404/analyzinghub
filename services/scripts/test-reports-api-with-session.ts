import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function testReportsAPIWithSession() {
  console.log('=== Testing Reports API with Session ===\n')

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  console.log('1. Logging in...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'analyzer@analayzinghub.com',
    password: 'Analyzer@2026'
  })

  if (authError) {
    console.error('❌ Login error:', authError.message)
    return
  }

  console.log('✅ Logged in successfully')
  console.log('   User ID:', authData.user?.id)
  console.log('   Session token exists:', !!authData.session?.access_token)
  console.log()

  console.log('2. Testing /api/reports endpoint directly...')
  const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports?t=${Date.now()}`
  console.log('   URL:', apiUrl)

  try {
    // Simulate browser fetch with session cookie
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${authData.session!.access_token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })

    console.log('   Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ API error:', errorText)
      return
    }

    const data = await response.json()
    console.log('✅ API response received')
    console.log('   Total reports:', data.total)
    console.log('   Reports returned:', data.reports?.length || 0)
    console.log()

    if (data.reports && data.reports.length > 0) {
      console.log('📊 Recent Reports:')
      data.reports.slice(0, 5).forEach((report: any, index: number) => {
        console.log(`   ${index + 1}. ${report.report_date} (${report.period_type}) - ${report.status}`)
      })
    } else {
      console.log('   ⚠️  No reports returned')
    }
  } catch (error) {
    console.error('❌ Error calling API:', error)
  }
  console.log()

  console.log('3. Testing direct Supabase query (bypassing API)...')
  const { data: directReports, error: directError, count } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, status, period_type, created_at', { count: 'exact' })
    .eq('author_id', authData.user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (directError) {
    console.error('❌ Direct query error:', directError.message)
  } else {
    console.log('✅ Direct query successful')
    console.log('   Total count:', count)
    console.log('   Reports returned:', directReports?.length || 0)
    console.log()
    console.log('📊 Reports (direct query):')
    directReports?.forEach((report: any, index: number) => {
      console.log(`   ${index + 1}. ${report.report_date} (${report.period_type}) - ${report.status}`)
    })
  }

  console.log()
  console.log('=== Test Complete ===')
}

testReportsAPIWithSession().catch(console.error)
