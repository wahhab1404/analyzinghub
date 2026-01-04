import 'server-only'
import { createServerClient as createSupabaseServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import { cookies } from 'next/headers'

export function createClient(cookieStore: ReadonlyRequestCookies) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  // During build time, environment variables may not be available
  // Return a dummy client that will never be used
  if (!supabaseUrl || !supabaseAnonKey) {
    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'

    if (isBuildTime) {
      // Build time - return dummy client
      return createSupabaseServerClient(
        'https://placeholder.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder',
        {
          cookies: {
            get(name: string) {
              return cookieStore?.get?.(name)?.value
            },
            set() {},
            remove() {},
          },
        }
      )
    }

    console.error('[createClient] Missing Supabase environment variables:', {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      availableEnvVars: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    })
    throw new Error('Missing Supabase environment variables')
  }

  return createSupabaseServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore?.get?.(name)?.value
        },
        set() {},
        remove() {},
      },
    }
  )
}

export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  // During build time, environment variables may not be available
  if (!supabaseUrl || !supabaseAnonKey) {
    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'

    if (isBuildTime) {
      // Build time - return dummy client
      return createSupabaseClient(
        'https://placeholder.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder'
      )
    }

    console.error('[createServerClient] Missing Supabase environment variables:', {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      availableEnvVars: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    })
    throw new Error('Missing Supabase environment variables')
  }

  try {
    const cookieStore = cookies()
    return createSupabaseServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore?.get?.(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )
  } catch (error) {
    // Fallback for environments where cookies() is not available
    // This creates a client without cookie-based session management
    return createSupabaseClient(
      supabaseUrl,
      supabaseAnonKey
    )
  }
}

export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // During build time, environment variables may not be available
  if (!supabaseUrl || !serviceRoleKey) {
    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'

    if (isBuildTime) {
      // Build time - return dummy client
      return createSupabaseClient(
        'https://placeholder.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0NTE5MjgwMCwiZXhwIjoxOTYwNzY4ODAwfQ.placeholder',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )
    }

    console.error('[ServiceRoleClient] Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      supabaseUrl: supabaseUrl?.slice(0, 30) + '...',
      nodeEnv: process.env.NODE_ENV,
    })

    if (!supabaseUrl) {
      console.error('[ServiceRoleClient] SUPABASE_URL missing. Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
      throw new Error('Missing SUPABASE_URL environment variable')
    }

    if (!serviceRoleKey) {
      console.error('[ServiceRoleClient] SUPABASE_SERVICE_ROLE_KEY missing. Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please configure it in your hosting environment')
    }
  }

  return createSupabaseClient(
    supabaseUrl!,
    serviceRoleKey!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
