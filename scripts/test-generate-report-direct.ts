import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function testGenerateReport() {
  console.log('=== Testing Report Generation ===\n')

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
  console.log()

  console.log('2. Checking role...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role:roles(name)')
    .eq('id', authData.user!.id)
    .single()

  if (profileError) {
    console.error('❌ Profile error:', profileError.message)
    return
  }

  const roleName = (profile as any)?.role?.name
  console.log('✅ Role:', roleName)

  if (!['Analyzer', 'SuperAdmin'].includes(roleName)) {
    console.error('❌ Insufficient permissions. Role:', roleName)
    return
  }
  console.log()

  console.log('3. Calling edge function to generate report...')
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/generate-advanced-daily-report`

  const today = new Date().toISOString().split('T')[0]
  console.log('   Date:', today)
  console.log('   URL:', edgeFunctionUrl)
  console.log()

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        date: today,
        analyst_id: authData.user!.id,
        language_mode: 'dual',
        period_type: 'daily',
        dry_run: false
      })
    })

    console.log('   Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Edge function error:', errorText)
      return
    }

    const result = await response.json()
    console.log('✅ Report generated successfully!')
    console.log('   Report ID:', result.report_id)
    console.log('   Result:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Error calling edge function:', error)
  }
  console.log()

  console.log('4. Verifying report was saved...')
  const { data: reports, error: reportsError } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, status, period_type, created_at')
    .eq('author_id', authData.user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (reportsError) {
    console.error('❌ Error fetching reports:', reportsError.message)
  } else {
    console.log('✅ Recent reports:')
    reports?.forEach((report: any, index: number) => {
      console.log(`   ${index + 1}. ${report.report_date} (${report.period_type}) - ${report.status}`)
    })
  }

  console.log()
  console.log('=== Test Complete ===')
}

testGenerateReport().catch(console.error)
