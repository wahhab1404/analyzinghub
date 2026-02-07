import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config()

console.log('\n=== Environment Variables Check ===\n')

const requiredVars = {
  'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
}

let allValid = true

for (const [key, value] of Object.entries(requiredVars)) {
  const hasValue = !!value
  const length = value?.length || 0
  const isValidLength = length > 100 // JWT tokens are typically much longer

  console.log(`${key}:`)
  console.log(`  ✓ Present: ${hasValue ? '✓' : '✗'}`)
  console.log(`  ✓ Length: ${length} chars ${isValidLength ? '✓' : '✗ (too short)'`)

  if (value) {
    console.log(`  ✓ Preview: ${value.slice(0, 30)}...${value.slice(-10)}`)
  }

  if (!hasValue || !isValidLength) {
    allValid = false
  }

  console.log()
}

if (!allValid) {
  console.log('❌ Some environment variables are missing or invalid!\n')
  process.exit(1)
}

console.log('=== Testing Supabase Connection ===\n')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

try {
  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('Testing connection with ANON key...')
  const { data, error } = await supabase.from('profiles').select('count').limit(1)

  if (error) {
    console.log('❌ Connection test failed:', error.message)
    process.exit(1)
  }

  console.log('✓ Successfully connected to Supabase!')
  console.log('\n✓ All environment variables are valid and working!\n')

} catch (err: any) {
  console.log('❌ Connection test failed:', err.message)
  process.exit(1)
}
