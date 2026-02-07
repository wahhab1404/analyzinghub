import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isMarketOpen, getWeekTradingDays, getMonthTradingDays, formatDateForReport } from '@/lib/market-calendar';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .single();

    const roleName = profile?.role?.name;
    if (roleName !== 'Analyzer' && roleName !== 'SuperAdmin') {
      return NextResponse.json(
        { error: 'Only analyzers can generate reports' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      period_type,
      start_date,
      end_date,
      language_mode = 'dual',
      dry_run = false,
      week_offset = 0,
      month_offset = 0,
    } = body;

    let finalStartDate: string;
    let finalEndDate: string;

    if (period_type === 'weekly') {
      const weekData = getWeekTradingDays(week_offset);
      finalStartDate = formatDateForReport(weekData.start);
      finalEndDate = formatDateForReport(weekData.end);
    } else if (period_type === 'monthly') {
      const monthData = getMonthTradingDays(month_offset);
      finalStartDate = formatDateForReport(monthData.start);
      finalEndDate = formatDateForReport(monthData.end);
    } else if (period_type === 'custom') {
      if (!start_date || !end_date) {
        return NextResponse.json(
          { error: 'start_date and end_date are required for custom periods' },
          { status: 400 }
        );
      }
      finalStartDate = start_date;
      finalEndDate = end_date;
    } else if (period_type === 'daily') {
      if (start_date) {
        finalStartDate = start_date;
        finalEndDate = start_date;
      } else {
        const today = new Date();
        finalStartDate = formatDateForReport(today);
        finalEndDate = formatDateForReport(today);
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid period_type. Must be: daily, weekly, monthly, or custom' },
        { status: 400 }
      );
    }

    console.log(`Generating ${period_type} report from ${finalStartDate} to ${finalEndDate}`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-period-report`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          start_date: finalStartDate,
          end_date: finalEndDate,
          analyst_id: user.id,
          language_mode,
          period_type,
          dry_run,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate period report');
    }

    const result = await response.json();

    // Generate image for the report if it was successfully created
    if (result.report_id) {
      try {
        console.log('[Generate Period Report] Generating image for report:', result.report_id)
        const imageResponse = await fetch(
          `${supabaseUrl}/functions/v1/generate-report-image`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`
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

            console.log('[Generate Period Report] Image saved:', publicUrl)
          } else {
            console.error('[Generate Period Report] Image upload error:', uploadError)
          }
        } else {
          console.error('[Generate Period Report] Image generation failed:', await imageResponse.text())
        }
      } catch (imageError) {
        console.error('[Generate Period Report] Image generation error:', imageError)
        // Don't fail the whole request if image generation fails
      }
    }

    return NextResponse.json({
      success: true,
      period_type,
      start_date: finalStartDate,
      end_date: finalEndDate,
      ...result,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error generating period report:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
