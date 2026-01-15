import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const reportDate = body.date || new Date().toISOString().split('T')[0]
    const language = body.language || 'ar' // Default to Arabic

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-daily-pdf-report`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: reportDate,
          language
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Edge function failed: ${errorText}`)
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      message: 'Daily report sent successfully',
      data: result
    })
  } catch (error: any) {
    console.error('Error sending daily report:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send daily report' },
      { status: 500 }
    )
  }
}
