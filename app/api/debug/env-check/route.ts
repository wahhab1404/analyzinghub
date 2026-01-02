import { NextResponse } from 'next/server';

/**
 * Debug endpoint to verify environment variables are loaded
 * This endpoint is for debugging only - remove or secure before production
 */
export async function GET() {
  try {
    const envCheck = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      APP_BASE_URL: !!process.env.APP_BASE_URL,
      POLYGON_API_KEY: !!process.env.POLYGON_API_KEY,
      SMTP_HOST: !!process.env.SMTP_HOST,
      SMTP_PORT: !!process.env.SMTP_PORT,
      SMTP_USER: !!process.env.SMTP_USER,
      SMTP_PASSWORD: !!process.env.SMTP_PASSWORD,
      SMTP_FROM_EMAIL: !!process.env.SMTP_FROM_EMAIL,
      SMTP_FROM_NAME: !!process.env.SMTP_FROM_NAME,
    };

    const missingVars = Object.entries(envCheck)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    return NextResponse.json({
      ok: missingVars.length === 0,
      environment: process.env.NODE_ENV,
      variables: envCheck,
      missingCount: missingVars.length,
      missing: missingVars,
      message: missingVars.length === 0
        ? 'All environment variables are configured correctly'
        : `Missing ${missingVars.length} environment variable(s)`,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}
