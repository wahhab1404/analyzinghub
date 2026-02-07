#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function clearSPXCache() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  console.log('🗑️  Clearing SPX cache...')

  // Delete all SPX cache entries
  const { data, error } = await supabase
    .from('options_chain_cache')
    .delete()
    .like('cache_key', 'options_chain:SPX:%')
    .select('cache_key')

  if (error) {
    console.error('❌ Error clearing cache:', error)
    return
  }

  const count = data?.length || 0
  console.log(`✅ Cleared ${count} SPX cache entries`)

  // Show remaining cache entries
  const { data: remaining, error: error2 } = await supabase
    .from('options_chain_cache')
    .select('cache_key, created_at, expires_at')
    .order('created_at', { ascending: false })

  if (!error2 && remaining) {
    console.log(`\n📊 Remaining cache entries: ${remaining.length}`)
    remaining.forEach((entry: any) => {
      console.log(`  - ${entry.cache_key} (expires: ${entry.expires_at})`)
    })
  }
}

clearSPXCache()
