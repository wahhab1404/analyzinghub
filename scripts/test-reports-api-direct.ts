import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function testReportsAPI() {
  console.log('=== Testing Reports API Direct ===\n')

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  console.log('1. Logging in as analyzer@analayzinghub.com...')
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
  console.log('   Email:', authData.user?.email)
  console.log()

  console.log('2. Fetching user profile and role...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, role:roles(name)')
    .eq('id', authData.user!.id)
    .single()

  if (profileError) {
    console.error('❌ Profile error:', profileError.message)
  } else {
    console.log('✅ Profile loaded:')
    console.log('   Name:', profile.display_name)
    console.log('   Role:', (profile as any).role?.name)
  }
  console.log()

  console.log('3. Fetching reports directly from table...')
  const { data: reports, error: reportsError, count } = await supabase
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
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10)

  if (reportsError) {
    console.error('❌ Reports query error:', reportsError.message)
    console.error('   Details:', reportsError)
  } else {
    console.log('✅ Reports query successful')
    console.log('   Total count:', count)
    console.log('   Returned:', reports?.length || 0)
    console.log()

    if (reports && reports.length > 0) {
      console.log('📊 Recent Reports:')
      reports.forEach((report: any, index: number) => {
        console.log(`\n   ${index + 1}. Report ${report.id.substring(0, 8)}...`)
        console.log(`      Date: ${report.report_date}`)
        console.log(`      Type: ${report.period_type}`)
        console.log(`      Language: ${report.language_mode}`)
        console.log(`      Status: ${report.status}`)
        console.log(`      Has Image: ${report.image_url ? 'Yes' : 'No'}`)
        console.log(`      Has PDF: ${report.file_url ? 'Yes' : 'No'}`)
        if (report.summary) {
          console.log(`      Total Trades: ${report.summary.total_trades || 0}`)
        }
      })
    } else {
      console.log('   ⚠️  No reports found')
    }
  }
  console.log()

  console.log('4. Testing with author_id filter...')
  const { data: filteredReports, error: filteredError } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, status, period_type')
    .eq('author_id', authData.user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (filteredError) {
    console.error('❌ Filtered query error:', filteredError.message)
  } else {
    console.log('✅ Filtered by author_id:')
    console.log('   Found:', filteredReports?.length || 0, 'reports')
  }
  console.log()

  console.log('5. Checking RLS policies...')
  const { data: policies, error: policiesError } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT policyname, cmd, qual
        FROM pg_policies
        WHERE tablename = 'daily_trade_reports'
      `
    })
    .single()

  if (policiesError) {
    console.log('   ⚠️  Could not query policies (expected)')
  }
  console.log()

  console.log('=== Test Complete ===')
}

testReportsAPI().catch(console.error)
