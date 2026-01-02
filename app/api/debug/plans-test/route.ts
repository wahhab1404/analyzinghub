import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: {},
    database: {},
    rpc: {},
    queries: {}
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    diagnostics.environment = {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey,
      urlLength: supabaseUrl?.length || 0,
      keyLength: supabaseServiceKey?.length || 0,
      urlPrefix: supabaseUrl?.substring(0, 20) || 'missing'
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        status: 'error',
        message: 'Missing environment variables',
        diagnostics
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { searchParams } = new URL(request.url)
    const analystId = searchParams.get('analystId')

    if (!analystId) {
      return NextResponse.json({
        status: 'error',
        message: 'analystId parameter required',
        diagnostics
      })
    }

    diagnostics.queries.analystId = analystId

    const { data: plans, error: plansError } = await supabase
      .from('analyzer_plans')
      .select('id, name, analyst_id, is_active, price_cents')
      .eq('analyst_id', analystId)
      .eq('is_active', true)

    diagnostics.queries.plansQuery = {
      success: !plansError,
      error: plansError ? {
        message: plansError.message,
        code: plansError.code,
        details: plansError.details,
        hint: plansError.hint
      } : null,
      planCount: plans?.length || 0,
      planIds: plans?.map(p => p.id) || []
    }

    if (plansError) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to query plans',
        diagnostics
      })
    }

    if (plans && plans.length > 0) {
      const testPlan = plans[0]

      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('get_plan_subscriber_count', { p_plan_id: testPlan.id })

      diagnostics.rpc.function = 'get_plan_subscriber_count'
      diagnostics.rpc.testPlanId = testPlan.id
      diagnostics.rpc.success = !rpcError
      diagnostics.rpc.error = rpcError ? {
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint
      } : null
      diagnostics.rpc.result = rpcResult

      const { count, error: countError } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('plan_id', testPlan.id)
        .in('status', ['active', 'trialing'])

      diagnostics.queries.subscriptionsCount = {
        success: !countError,
        error: countError ? {
          message: countError.message,
          code: countError.code,
          details: countError.details,
          hint: countError.hint
        } : null,
        count: count || 0
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'All checks passed',
      diagnostics
    })

  } catch (error: any) {
    diagnostics.exception = {
      message: error?.message,
      name: error?.name,
      stack: error?.stack
    }

    return NextResponse.json({
      status: 'error',
      message: 'Unhandled exception',
      diagnostics
    }, { status: 500 })
  }
}
