import dotenv from 'dotenv'

dotenv.config()

async function testActivationChecker() {
  console.log('🧪 Testing activation condition checker...\n')

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/activation-condition-checker`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json()
  console.log('Response:', JSON.stringify(data, null, 2))

  if (data.success) {
    console.log('\n✅ Checker ran successfully!')
    console.log(`   Checked: ${data.results.checked}`)
    console.log(`   Activated: ${data.results.activated}`)
    console.log(`   Preactivation stops: ${data.results.preactivation_stops}`)
    console.log(`   Errors: ${data.results.errors}`)
  } else {
    console.error('\n❌ Checker failed:', data.error)
  }
}

testActivationChecker().catch(console.error)
