import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export function createSupabaseSSRClient() {
  const cookieStore = cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    console.error('[createSupabaseSSRClient] Missing Supabase environment variables:', {
      hasUrl: !!url,
      hasAnonKey: !!anonKey,
      availableEnvVars: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    })
    throw new Error('Missing Supabase environment variables')
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })
}

export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('[createSupabaseServiceClient] Missing Supabase environment variables:', {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
      availableEnvVars: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    })
    throw new Error('Missing Supabase environment variables')
  }

  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, serviceKey)
}
