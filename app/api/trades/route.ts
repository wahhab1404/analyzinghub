import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { CreateTradeInput, TradeTarget } from '@/lib/types/trades'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const targetSchema = z.object({
  label: z.string().min(1),
  price: z.number().positive(),
})

const stockTradeSchema = z.object({
  trade_type: z.literal('stock'),
  symbol: z.string().min(1).max(20).transform(s => s.toUpperCase().trim()),
  direction: z.enum(['long', 'short']),
  entry_price: z.number().positive(),
  stop_loss: z.number().positive(),
  targets: z.array(targetSchema).min(1),
  timeframe: z.string().optional(),
  expected_duration: z.string().optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'very_high']).optional(),
  notes: z.string().max(2000).optional(),
  analysis_id: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public', 'followers', 'subscribers', 'plan_only', 'private']).optional().default('public'),
  plan_id: z.string().uuid().nullable().optional(),
  telegram_channel_id: z.string().nullable().optional(),
  is_public: z.boolean().optional().default(true),
  is_testing: z.boolean().optional().default(false),
  publish_now: z.boolean().optional().default(false),
})

const optionTradeSchema = z.object({
  trade_type: z.literal('option'),
  symbol: z.string().min(1).max(20).transform(s => s.toUpperCase().trim()),
  direction: z.enum(['call', 'put']),
  entry_price: z.number().positive().optional(),
  stop_loss: z.number().positive().optional(),
  targets: z.array(targetSchema).optional().default([]),
  timeframe: z.string().optional(),
  expected_duration: z.string().optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'very_high']).optional(),
  notes: z.string().max(2000).optional(),
  analysis_id: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public', 'followers', 'subscribers', 'plan_only', 'private']).optional().default('public'),
  plan_id: z.string().uuid().nullable().optional(),
  telegram_channel_id: z.string().nullable().optional(),
  is_public: z.boolean().optional().default(true),
  is_testing: z.boolean().optional().default(false),
  publish_now: z.boolean().optional().default(false),
  // Option-specific
  underlying_symbol: z.string().min(1).max(20).transform(s => s.toUpperCase().trim()),
  option_type: z.enum(['call', 'put']),
  strike_price: z.number().positive(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  contract_symbol: z.string().optional(),
  entry_premium: z.number().positive(),
  stop_premium: z.number().positive().optional(),
  stop_rule: z.string().optional(),
  quantity: z.number().int().positive().optional().default(1),
  contract_multiplier: z.number().int().positive().optional().default(100),
})

const createTradeSchema = z.discriminatedUnion('trade_type', [stockTradeSchema, optionTradeSchema])

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trades
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { searchParams } = new URL(req.url)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch current user's role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single()
    const roleName = (profile as any)?.roles?.name as string | undefined

    // Filters
    const symbol      = searchParams.get('symbol')?.toUpperCase()
    const trade_type  = searchParams.get('trade_type')
    const direction   = searchParams.get('direction')
    const status      = searchParams.get('status')
    const user_id     = searchParams.get('user_id')
    const plan_id     = searchParams.get('plan_id')
    const linked      = searchParams.get('linked')   // 'linked' | 'standalone'
    const is_testing  = searchParams.get('is_testing') === 'true'
    const sort_by     = searchParams.get('sort_by') || 'newest'
    const limit       = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset      = parseInt(searchParams.get('offset') || '0')
    const mine        = searchParams.get('mine') === 'true'

    let query = supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name, avatar_url),
        analysis:analyses!analysis_id(id, title),
        option_details:option_trade_details(*),
        plan:analyzer_plans!plan_id(id, name)
      `, { count: 'exact' })

    // Permission-based filtering
    if (mine || roleName === 'Analyzer') {
      if (mine) {
        query = query.eq('user_id', user.id)
      }
    } else if (roleName !== 'SuperAdmin') {
      // Regular traders see only public non-testing published trades
      // (RLS handles the rest, but we also filter here for clarity)
      query = query
        .eq('is_public', true)
        .eq('is_testing', false)
        .in('status', ['published', 'active', 'completed', 'stopped', 'expired'])
    }

    // Testing trades: only show to owners/admins
    if (!is_testing) {
      if (roleName === 'SuperAdmin' || mine) {
        // don't filter
      } else {
        query = query.eq('is_testing', false)
      }
    }

    // Apply filters
    if (symbol)     query = query.ilike('symbol', symbol)
    if (trade_type) query = query.eq('trade_type', trade_type)
    if (direction)  query = query.eq('direction', direction)
    if (status)     query = query.eq('status', status)
    if (user_id)    query = query.eq('user_id', user_id)
    if (plan_id)    query = query.eq('plan_id', plan_id)
    if (linked === 'linked')     query = query.not('analysis_id', 'is', null)
    if (linked === 'standalone') query = query.is('analysis_id', null)

    // Sorting
    switch (sort_by) {
      case 'oldest':    query = query.order('created_at', { ascending: true }); break
      case 'active':    query = query.eq('status', 'active').order('published_at', { ascending: false }); break
      case 'completed': query = query.eq('status', 'completed').order('completed_at', { ascending: false }); break
      case 'stopped':   query = query.eq('status', 'stopped').order('updated_at', { ascending: false }); break
      default:          query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    const { data: trades, error, count } = await query

    if (error) {
      console.error('[GET /api/trades]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trades: trades ?? [], total: count ?? 0 })
  } catch (err: any) {
    console.error('[GET /api/trades] unexpected', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trades
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single()
    const roleName = (profile as any)?.roles?.name as string | undefined
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ error: 'Only admins and analyzers can create trades' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = createTradeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const input = parsed.data as CreateTradeInput

    // Validate analysis ownership if linking
    if (input.analysis_id) {
      const { data: analysis } = await supabase
        .from('analyses')
        .select('id, analyzer_id')
        .eq('id', input.analysis_id)
        .single()
      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
      }
      if (roleName !== 'SuperAdmin' && analysis.analyzer_id !== user.id) {
        return NextResponse.json({ error: 'You can only link trades to your own analyses' }, { status: 403 })
      }
    }

    // Validate plan ownership if routing
    if (input.plan_id) {
      const { data: plan } = await supabase
        .from('analyzer_plans')
        .select('id, analyst_id')
        .eq('id', input.plan_id)
        .single()
      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      }
      if (roleName !== 'SuperAdmin' && plan.analyst_id !== user.id) {
        return NextResponse.json({ error: 'You can only use your own plans' }, { status: 403 })
      }
    }

    const publishNow = 'publish_now' in input ? input.publish_now : false
    const now = new Date().toISOString()

    // Build targets with hit flags
    const targetsWithFlags: TradeTarget[] = (input.targets ?? []).map((t, i) => ({
      label: t.label || `TP${i + 1}`,
      price: t.price,
      hit: false,
      hit_at: null,
    }))

    // Insert base trade row
    const { data: trade, error: insertError } = await supabase
      .from('trades')
      .insert({
        user_id:          user.id,
        analysis_id:      input.analysis_id ?? null,
        symbol:           input.symbol,
        trade_type:       input.trade_type,
        direction:        input.direction,
        status:           publishNow ? 'published' : 'draft',
        entry_price:      input.entry_price ?? (input.trade_type === 'option' ? (input as any).entry_premium : null),
        stop_loss:        input.stop_loss ?? null,
        targets:          targetsWithFlags,
        hit_targets:      [],
        timeframe:        input.timeframe ?? null,
        expected_duration: input.expected_duration ?? null,
        risk_level:       input.risk_level ?? null,
        notes:            input.notes ?? null,
        visibility:       input.visibility ?? 'public',
        plan_id:          input.plan_id ?? null,
        telegram_channel_id: input.telegram_channel_id ?? null,
        is_public:        input.is_public ?? true,
        is_testing:       input.is_testing ?? false,
        published_at:     publishNow ? now : null,
      })
      .select('*')
      .single()

    if (insertError) {
      console.error('[POST /api/trades] insert error', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Insert option details
    let optionDetails = null
    if (input.trade_type === 'option') {
      const optInput = input as any
      const { data: details, error: optError } = await supabase
        .from('option_trade_details')
        .insert({
          trade_id:          trade!.id,
          underlying_symbol: optInput.underlying_symbol,
          option_type:       optInput.option_type,
          strike_price:      optInput.strike_price,
          expiration_date:   optInput.expiration_date,
          contract_symbol:   optInput.contract_symbol ?? null,
          entry_premium:     optInput.entry_premium,
          stop_premium:      optInput.stop_premium ?? null,
          stop_rule:         optInput.stop_rule ?? null,
          quantity:          optInput.quantity ?? 1,
          contract_multiplier: optInput.contract_multiplier ?? 100,
        })
        .select('*')
        .single()

      if (optError) {
        // Rollback trade on option details failure
        await supabase.from('trades').delete().eq('id', trade!.id)
        console.error('[POST /api/trades] option_details error', optError)
        return NextResponse.json({ error: optError.message }, { status: 500 })
      }
      optionDetails = details
    }

    return NextResponse.json({ trade, option_details: optionDetails }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/trades] unexpected', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
