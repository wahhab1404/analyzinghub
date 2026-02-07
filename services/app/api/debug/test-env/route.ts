import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
    },
    supabaseVars: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
      urlPreview: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 40),
    },
    otherServices: {
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'MISSING',
      POLYGON_API_KEY: process.env.POLYGON_API_KEY ? 'SET' : 'MISSING',
      SMTP_HOST: process.env.SMTP_HOST ? 'SET' : 'MISSING',
    },
    allSupabaseKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    totalEnvVars: Object.keys(process.env).length,
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  })
}
