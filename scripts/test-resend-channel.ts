import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function testResendChannel() {
  console.log('🧪 Testing Resend to Channel Feature\n')

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Test 1: Check channels endpoint
  console.log('1️⃣ Testing channels list endpoint...')
  try {
    // Get first user with analyses
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name')
      .limit(1)

    if (!users || users.length === 0) {
      console.log('⚠️ No users found')
      return
    }

    const userId = users[0].id
    console.log(`   Using user: ${users[0].full_name} (${userId})`)

    // Check if user has channels
    const { data: channels, error: channelsError } = await supabase
      .from('telegram_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('enabled', true)

    if (channelsError) {
      console.error('❌ Error fetching channels:', channelsError)
      return
    }

    console.log(`   ✅ Found ${channels?.length || 0} enabled channels`)

    if (channels && channels.length > 0) {
      channels.forEach((ch, i) => {
        console.log(`   ${i + 1}. ${ch.channel_name} (${ch.audience_type})`)
        console.log(`      Channel ID: ${ch.channel_id}`)
      })
    }
    console.log()

  } catch (error) {
    console.error('❌ Error:', error)
  }

  // Test 2: Check analyses
  console.log('2️⃣ Testing analyses for resending...')
  try {
    const { data: analyses, error: analysesError } = await supabase
      .from('analyses')
      .select(`
        id,
        title,
        analyzer_id,
        symbols:symbol_id (symbol),
        direction,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    if (analysesError) {
      console.error('❌ Error fetching analyses:', analysesError)
      return
    }

    console.log(`   ✅ Found ${analyses?.length || 0} recent analyses`)

    if (analyses && analyses.length > 0) {
      analyses.forEach((analysis, i) => {
        console.log(`   ${i + 1}. ${analysis.title || 'Untitled'} - ${(analysis as any).symbols?.symbol || 'N/A'}`)
        console.log(`      ID: ${analysis.id}`)
        console.log(`      Direction: ${analysis.direction || 'N/A'}`)
      })
    }
    console.log()

  } catch (error) {
    console.error('❌ Error:', error)
  }

  // Test 3: Check API route exists
  console.log('3️⃣ Testing API route...')
  try {
    // Just check if the route file exists
    const fs = require('fs')
    const path = require('path')
    const routePath = path.join(process.cwd(), 'app/api/analyses/[id]/resend-to-channel/route.ts')

    if (fs.existsSync(routePath)) {
      console.log('   ✅ API route file exists')
    } else {
      console.log('   ❌ API route file not found')
    }
    console.log()

  } catch (error) {
    console.error('❌ Error:', error)
  }

  // Test 4: Check component exists
  console.log('4️⃣ Testing UI component...')
  try {
    const fs = require('fs')
    const path = require('path')
    const componentPath = path.join(process.cwd(), 'components/analysis/ResendToChannelDialog.tsx')

    if (fs.existsSync(componentPath)) {
      console.log('   ✅ ResendToChannelDialog component exists')
    } else {
      console.log('   ❌ ResendToChannelDialog component not found')
    }
    console.log()

  } catch (error) {
    console.error('❌ Error:', error)
  }

  // Test 5: Verify database permissions
  console.log('5️⃣ Testing database permissions...')
  try {
    // Check if service role can access telegram_channels
    const { data, error } = await supabase
      .from('telegram_channels')
      .select('id')
      .limit(1)

    if (error) {
      console.error('❌ Permission error:', error)
    } else {
      console.log('   ✅ Database permissions OK')
    }
    console.log()

  } catch (error) {
    console.error('❌ Error:', error)
  }

  console.log('🎉 All tests completed!\n')
  console.log('📝 Next Steps:')
  console.log('1. Open an analysis detail page as the author')
  console.log('2. Click the 🔁 Resend button next to the Send button')
  console.log('3. Select a target channel from the dialog')
  console.log('4. Click "Send to Channel"')
  console.log('5. Check your Telegram channel for the message')
  console.log('\n💡 Make sure you have at least one Telegram channel connected in Settings')
}

testResendChannel().catch(console.error)
