import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const isSharePage = request.nextUrl.pathname.startsWith('/share')
  const isSnapshotAPI = request.nextUrl.pathname.includes('/snapshot-html')

  // Skip middleware for public routes (no authentication required)
  if (isSharePage || isSnapshotAPI) {
    return response
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return response
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/register')
  const isDashboardPage = request.nextUrl.pathname.startsWith('/dashboard')

  // Skip auth check for non-auth-gated routes to avoid unnecessary latency
  if (!isAuthPage && !isDashboardPage) {
    return response
  }

  try {
    // Race the auth check against a 4-second timeout so slow mobile connections
    // never hang waiting for Supabase — on timeout we allow the request through
    // and let the page-level auth handle it.
    const authResult = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ])

    const user = authResult ? (authResult as any).data?.user ?? null : null

    if (!user && isDashboardPage) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (user && isAuthPage) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  } catch {
    // On any auth error, allow the request through — page-level guards handle it
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
