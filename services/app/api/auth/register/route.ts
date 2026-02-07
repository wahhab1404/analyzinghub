import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Step 1: Strict body validation with null check
    const body = await request.json().catch(() => null)

    if (!body) {
      console.error('[Register] Invalid JSON body')
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const { email, password, fullName, name, role } = body

    // Handle both fullName and name for backward compatibility
    const fullNameFinal = fullName ?? name ?? null

    // Step 2: Validate required fields
    if (!email || !password) {
      console.error('[Register] Missing email/password', {
        email: !!email,
        password: !!password,
        bodyKeys: Object.keys(body)
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
      console.error('[Register] Missing Supabase environment variables')
      return NextResponse.json(
        { ok: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Step 4: Log safe env metadata for debugging
    console.log('[Register] Supabase env:', {
      urlHost: (() => {
        try {
          return new URL(supabaseUrl).host
        } catch {
          return 'bad_url'
        }
      })(),
      anonLen: supabaseAnonKey?.length ?? 0,
      anonPrefix: supabaseAnonKey?.slice(0, 10) ?? null,
    })

    let response = NextResponse.json({ ok: true }, { status: 200 })

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
            })
          },
          remove(name, options) {
            response.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )

    // Step 5: Attempt signup with enhanced error logging
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullNameFinal,
          role: role ?? 'user',
        },
      },
    })

    if (signUpError) {
      // Step 6: Log detailed error information
      console.error('[Register] Supabase signUpError:', {
        message: signUpError.message,
        name: (signUpError as any).name,
        status: (signUpError as any).status,
        code: (signUpError as any).code,
        __isAuthError: (signUpError as any).__isAuthError,
      })

      // DEBUGGING: Return comprehensive error details
      const urlHost = (() => {
        try { return new URL(supabaseUrl).host } catch { return 'bad_url' }
      })()

      return NextResponse.json({
        ok: false,
        error: signUpError.message,
        supabase: {
          status: (signUpError as any).status,
          code: (signUpError as any).code,
          name: (signUpError as any).name,
        },
        envMeta: {
          urlHost,
          anonLen: supabaseAnonKey.length,
          anonPrefix: supabaseAnonKey.slice(0, 10),
          nodeEnv: process.env.NODE_ENV,
        },
      }, { status: 400 })
    }

    if (!authData.user) {
      console.error('[Register] No user returned after signup')
      return NextResponse.json({
        ok: false,
        error: 'Failed to create user'
      }, { status: 400 })
    }

    // Step 7: Return success with useful debug info
    console.log('[Register] Success:', {
      userId: authData.user.id,
      email: authData.user.email,
    })

    // Update response with debug info
    response = NextResponse.json({
      ok: true,
      userId: authData.user.id,
      email: authData.user.email,
    }, { status: 200 })

    return response
  } catch (err: any) {
    console.error('[Register] Unexpected error:', {
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
