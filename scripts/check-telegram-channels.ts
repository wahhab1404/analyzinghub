#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTelegramChannels() {
  console.log('🔍 Checking Telegram Channels Configuration\n')
  console.log('=' .repeat(80))

  // Get all telegram channels
  const { data: channels, error: channelsError } = await supabase
    .from('telegram_channels')
    .select(`
      id,
      user_id,
      channel_id,
      channel_name,
      audience_type,
      enabled,
      notify_new_analysis,
      notify_target_hit,
      notify_stop_hit,
      is_platform_default,
      linked_plan_id,
      verified_at,
      created_at,
      profiles:user_id (full_name)
    `)
    .order('created_at', { ascending: false })

  if (channelsError) {
    console.error('❌ Error fetching channels:', channelsError)
    return
  }

  if (!channels || channels.length === 0) {
    console.log('⚠️  No Telegram channels configured')
    return
  }

  console.log(`\n✅ Found ${channels.length} Telegram channel(s)\n`)

  // Group by user
  const channelsByUser = new Map<string, any[]>()
  channels.forEach(channel => {
    if (!channelsByUser.has(channel.user_id)) {
      channelsByUser.set(channel.user_id, [])
    }
    channelsByUser.get(channel.user_id)!.push(channel)
  })

  // Display by user
  for (const [userId, userChannels] of channelsByUser.entries()) {
    const profile = (userChannels[0] as any).profiles
    console.log('\n' + '─'.repeat(80))
    console.log(`👤 User: ${profile?.full_name || 'Unknown'}`)
    console.log(`   ID: ${userId}`)
    console.log('─'.repeat(80))

    userChannels.forEach((channel, index) => {
      console.log(`\n📢 Channel ${index + 1}: ${channel.channel_name}`)
      console.log(`   Channel ID: ${channel.channel_id}`)
      console.log(`   Audience Type: ${channel.audience_type}`)
      console.log(`   Platform Default: ${channel.is_platform_default ? '✅ Yes' : '❌ No'}`)
      console.log(`   Linked Plan ID: ${channel.linked_plan_id || 'None (all subscribers)'}`)
      console.log(`   Enabled: ${channel.enabled ? '✅ Yes' : '❌ No'}`)
      console.log(`   Verified: ${channel.verified_at ? `✅ Yes (${new Date(channel.verified_at).toLocaleString()})` : '❌ No'}`)
      console.log(`   Notifications:`)
      console.log(`     - New Analysis: ${channel.notify_new_analysis ? '✅' : '❌'}`)
      console.log(`     - Target Hit: ${channel.notify_target_hit ? '✅' : '❌'}`)
      console.log(`     - Stop Hit: ${channel.notify_stop_hit ? '✅' : '❌'}`)

      // Check issues
      const issues = []
      if (!channel.enabled) issues.push('Channel is disabled')
      if (!channel.verified_at) issues.push('Channel is not verified')
      if (!channel.notify_new_analysis) issues.push('New analysis notifications disabled')

      if (issues.length > 0) {
        console.log(`   ⚠️  Issues:`)
        issues.forEach(issue => console.log(`     - ${issue}`))
      } else {
        console.log(`   ✅ Configuration looks good!`)
      }
    })

    // Check coverage
    console.log(`\n📊 Coverage Analysis:`)
    const audienceTypes = ['public', 'followers', 'subscribers']
    audienceTypes.forEach(type => {
      const defaultForType = userChannels.find(
        ch => ch.audience_type === type && ch.is_platform_default
      )
      const ready = defaultForType && defaultForType.enabled && defaultForType.verified_at
      console.log(`   ${type.padEnd(15)}: ${ready ? '✅ Ready' : '❌ Not configured'}`)
    })

    // Check plan-specific channels
    const planChannels = userChannels.filter(ch => ch.linked_plan_id !== null)
    if (planChannels.length > 0) {
      console.log(`\n📦 Plan-Specific Channels: ${planChannels.length}`)
      for (const planChannel of planChannels) {
        const { data: plan } = await supabase
          .from('analyzer_plans')
          .select('name')
          .eq('id', planChannel.linked_plan_id)
          .maybeSingle()

        const ready = planChannel.enabled && planChannel.verified_at
        console.log(`   ${plan?.name || planChannel.linked_plan_id}: ${ready ? '✅ Ready' : '❌ Not configured'}`)
      }
    }
  }

  // Check for common issues
  console.log('\n\n' + '═'.repeat(80))
  console.log('🔍 SYSTEM-WIDE CHECKS')
  console.log('═'.repeat(80))

  // Check if any channels lack verification
  const unverifiedChannels = channels.filter(ch => !ch.verified_at)
  if (unverifiedChannels.length > 0) {
    console.log(`\n⚠️  ${unverifiedChannels.length} channel(s) need verification:`)
    unverifiedChannels.forEach(ch => {
      console.log(`   - ${ch.channel_name} (${ch.channel_id})`)
    })
    console.log(`\n   To verify: Go to Settings → Telegram → Click "Verify Channel"`)
  }

  // Check if any channels are disabled
  const disabledChannels = channels.filter(ch => !ch.enabled)
  if (disabledChannels.length > 0) {
    console.log(`\n⚠️  ${disabledChannels.length} channel(s) are disabled:`)
    disabledChannels.forEach(ch => {
      console.log(`   - ${ch.channel_name} (${ch.channel_id})`)
    })
    console.log(`\n   To enable: Go to Settings → Telegram → Toggle "Enabled"`)
  }

  // Check if notifications are disabled
  const noNewAnalysis = channels.filter(ch => ch.enabled && ch.verified_at && !ch.notify_new_analysis)
  if (noNewAnalysis.length > 0) {
    console.log(`\n⚠️  ${noNewAnalysis.length} channel(s) have new analysis notifications disabled:`)
    noNewAnalysis.forEach(ch => {
      console.log(`   - ${ch.channel_name} (${ch.channel_id})`)
    })
    console.log(`\n   To enable: Go to Settings → Telegram → Toggle "Notify New Analysis"`)
  }

  // Check for missing platform defaults
  console.log('\n\n📋 Platform Default Coverage:')
  const users = Array.from(channelsByUser.keys())
  for (const userId of users) {
    const userChannels = channelsByUser.get(userId)!
    const profile = (userChannels[0] as any).profiles
    console.log(`\n   ${profile?.full_name || 'User ' + userId}:`)

    const audienceTypes = ['public', 'followers', 'subscribers']
    audienceTypes.forEach(type => {
      const hasDefault = userChannels.some(
        ch => ch.audience_type === type && ch.is_platform_default && ch.enabled && ch.verified_at
      )
      console.log(`     ${type.padEnd(15)}: ${hasDefault ? '✅' : '❌ Missing'}`)
    })
  }

  console.log('\n' + '═'.repeat(80))
  console.log('✅ Check complete!')
  console.log('═'.repeat(80) + '\n')
}

checkTelegramChannels().catch(console.error)
