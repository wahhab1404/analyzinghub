import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface GenerateReportRequest {
  date?: string
  language_mode?: 'en' | 'ar' | 'dual'
  period_type?: 'daily' | 'weekly' | 'monthly'
  dry_run?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .single()

    const roleName = (profile as any)?.role?.name
    if (!roleName || !['Analyzer', 'SuperAdmin'].includes(roleName)) {
      return NextResponse.json({ error: 'Forbidden: Analyzer or Admin role required' }, { status: 403 })
    }

    const body: GenerateReportRequest = await request.json()
    const date = body.date || new Date().toISOString().split('T')[0]
    const language_mode = body.language_mode || 'dual'
    const period_type = body.period_type || 'daily'
    const dry_run = body.dry_run || false

    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-advanced-daily-report`

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        date,
        analyst_id: user.id,
        language_mode,
        period_type,
        dry_run
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Edge function error: ${error}`)
    }

    const result = await response.json()

    // Generate image for the report if it was successfully created
    if (result.report_id) {
      try {
        console.log('[Generate Report] Generating image for report:', result.report_id)
        const imageResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-report-image`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ report_id: result.report_id })
          }
        )

        if (imageResponse.ok) {
          const imageBlob = await imageResponse.arrayBuffer()
          const fileName = `report-${result.report_id}-${Date.now()}.png`

          // Upload image to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('daily-reports')
            .upload(fileName, imageBlob, {
              contentType: 'image/png',
              cacheControl: '3600'
            })

          if (!uploadError && uploadData) {
            const { data: { publicUrl } } = supabase.storage
              .from('daily-reports')
              .getPublicUrl(fileName)

            // Update report with image URL
            await supabase
              .from('daily_trade_reports')
              .update({ image_url: publicUrl })
              .eq('id', result.report_id)

            console.log('[Generate Report] Image saved:', publicUrl)
          } else {
            console.error('[Generate Report] Image upload error:', uploadError)
          }
        } else {
          console.error('[Generate Report] Image generation failed:', await imageResponse.text())
        }
      } catch (imageError) {
        console.error('[Generate Report] Image generation error:', imageError)
        // Don't fail the whole request if image generation fails
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error generating report:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
