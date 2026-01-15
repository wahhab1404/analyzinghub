import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    console.log('[Preview API] Starting preview request')
    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[Preview API] Auth failed:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Preview API] User authenticated:', user.id)

    const body = await request.json()
    const reportDateStr = body.date || new Date().toISOString().split('T')[0]
    const language = body.language || 'ar' // Default to Arabic
    console.log('[Preview API] Report date:', reportDateStr, 'Language:', language)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Call edge function with previewOnly flag
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-daily-pdf-report`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: reportDateStr,
          language,
          previewOnly: true
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Edge function failed: ${errorText}`)
    }

    const result = await response.json()

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Preview API] Error generating report preview:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate report preview' },
      { status: 500 }
    )
  }
}
