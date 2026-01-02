import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Step 1: Strict body validation with null check
    const body = await request.json().catch(() => null)

    if (!body) {
      console.error('[Login] Invalid JSON body')
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const { email, password } = body

    // Step 2: Validate required fields
    if (!email || !password) {
      console.error('[Login] Missing email/password', {
        keys: Object.keys(body),
        email: !!email,
        password: !!password,
      })
      return NextResponse.json({
        ok: false,
        error: 'Missing email or password'
      }, { status: 400 })
    }

    // Step 3: Get and validate Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Login] Missing Supabase environment variables')
      return NextResponse.json(
        { ok: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Step 4: Log safe env metadata for debugging
    console.log('[Login] Supabase env meta:', {
      urlHost: (() => {
        try {
          return new URL(supabaseUrl).host
        } catch {
          return 'bad_url'
        }
      })(),
      anonLen: supabaseAnonKey.length,
      anonPrefix: supabaseAnonKey.slice(0, 10),
      nodeEnv: process.env.NODE_ENV,
    })

    // CRITICAL: Use 'let' so cookie mutations survive
    let response = NextResponse.json({ ok: true }, { status: 200 })
    const isProduction = process.env.NODE_ENV === 'production'

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name) {
            return request.cookies.get(name)?.value
          },
          set(name, value, options) {
            response.cookies.set({
              name,
              value,
              ...options,
              path: '/',
              sameSite: 'lax',
              secure: isProduction,
              // CRITICAL: Don't override Supabase's httpOnly settings
              httpOnly: options?.httpOnly,
            })
          },
          remove(name, options) {
            response.cookies.set({
              name,
              value: '',
              ...options,
              path: '/',
              sameSite: 'lax',
              secure: isProduction,
              // CRITICAL: Don't override Supabase's httpOnly settings
              httpOnly: options?.httpOnly,
              maxAge: 0,
            })
          },
        },
      }
    )

    // Step 5: Attempt login with enhanced error logging
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // Step 6: Log detailed error information
      console.error('[Login] Authentication failed:', {
        message: error.message,
        status: error.status,
        code: (error as any).code,
        name: (error as any).name,
        __isAuthError: (error as any).__isAuthError,
      })

      // DEBUGGING: Return comprehensive error details
      const urlHost = (() => {
        try { return new URL(supabaseUrl).host } catch { return 'bad_url' }
      })()

      return NextResponse.json({
        ok: false,
        error: error.message,
        supabase: {
          status: (error as any).status,
          code: (error as any).code,
          name: (error as any).name,
        },
        envMeta: {
          urlHost,
          anonLen: supabaseAnonKey.length,
          anonPrefix: supabaseAnonKey.slice(0, 10),
          nodeEnv: process.env.NODE_ENV,
        },
      }, { status: 401 })
    }

    // Step 7: Log success details
    console.log('[Login] Authentication successful:', {
      userId: data.user?.id,
      email: data.user?.email,
      expiresAt: data.session?.expires_at,
    })

    return response
  } catch (err: any) {
    console.error('[Login] Unexpected error:', {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
    })
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
