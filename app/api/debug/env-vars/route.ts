import { NextResponse } from 'next/server'

export async function GET() {
  const envVars = {
    hasNextPublicSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasNextPublicSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseAnonKey: !!process.env.SUPABASE_ANON_KEY,
    hasSupabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasTelegramBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
    hasPolygonApiKey: !!process.env.POLYGON_API_KEY,
    nodeEnv: process.env.NODE_ENV,
    urlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) || 'missing',
    availableSupabaseVars: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
  }

  return NextResponse.json(envVars, { status: 200 })
}
