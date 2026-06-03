import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { announceTradeOnTwitter } from '@/lib/twitter/announce'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  status:                    z.enum(['draft', 'published', 'active', 'stopped', 'completed', 'cancelled', 'expired']).optional(),
  current_price:             z.number().optional(),
  highest_price_since_entry: z.number().optional(),
  stop_loss:                 z.number().optional(),
  targets:                   z.array(z.object({
    label: z.string(),
    price: z.number(),
    hit:   z.boolean(),
    hit_at: z.string().nullable().optional(),
  })).optional(),
  notes:                     z.string().max(2000).optional(),
  telegram_channel_id:       z.string().nullable().optional(),
  plan_id:                   z.string().uuid().nullable().optional(),
  visibility:                z.enum(['public', 'followers', 'subscribers', 'plan_only', 'private']).optional(),
  is_public:                 z.boolean().optional(),
  send_telegram_update:      z.boolean().optional(),
  // Close trade fields
  close_reason:              z.string().optional(),
  close_price:               z.number().optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trades/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: trade, error } = await supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name, avatar_url),
        analysis:analyses!analysis_id(id, title, direction),
        option_details:option_trade_details(*),
        plan:analyzer_plans!plan_id(id, name),
        alerts:trade_alerts(*)
      `)
      .eq('id', id)
      .single()

    if (error || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    return NextResponse.json({ trade })
  } catch (err: any) {
    console.error('[GET /api/trades/[id]]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/trades/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

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

    // Ownership check
    const { data: existing } = await supabase
      .from('trades')
      .select('id, user_id, status')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (roleName !== 'SuperAdmin' && existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const updates = parsed.data
    const now = new Date().toISOString()

    const dbUpdates: Record<string, any> = {}
    if (updates.status !== undefined) {
      dbUpdates.status = updates.status
      if (updates.status === 'published' && !existing.status.includes('published')) {
        dbUpdates.published_at = now
      }
      if (updates.status === 'active') {
        dbUpdates.activated_at = now
      }
      if (['completed', 'stopped', 'expired', 'cancelled'].includes(updates.status)) {
        dbUpdates.completed_at = now
      }
    }
    if (updates.current_price             !== undefined) dbUpdates.current_price             = updates.current_price
    if (updates.highest_price_since_entry !== undefined) dbUpdates.highest_price_since_entry = updates.highest_price_since_entry
    if (updates.stop_loss                 !== undefined) dbUpdates.stop_loss                 = updates.stop_loss
    if (updates.targets                   !== undefined) dbUpdates.targets                   = updates.targets
    if (updates.notes                     !== undefined) dbUpdates.notes                     = updates.notes
    if (updates.telegram_channel_id       !== undefined) dbUpdates.telegram_channel_id       = updates.telegram_channel_id
    if (updates.plan_id                   !== undefined) dbUpdates.plan_id                   = updates.plan_id
    if (updates.visibility                !== undefined) dbUpdates.visibility                = updates.visibility
    if (updates.is_public                 !== undefined) dbUpdates.is_public                 = updates.is_public

    const { data: trade, error: updateError } = await supabase
      .from('trades')
      .update(dbUpdates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[PATCH /api/trades/[id]]', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Auto-post to X on completion when the owner enabled it. Best-effort: a
    // failure here must never break the trade update, and the announce core
    // re-checks profit + dedup so a missed/duplicate call is harmless.
    let twitterAutoPost: { ok: boolean; error?: string } | undefined
    const justCompleted =
      updates.status === 'completed' && existing.status !== 'completed'
    if (justCompleted) {
      try {
        const admin = createServiceRoleClient()
        const { data: twAccount } = await admin
          .from('twitter_accounts')
          .select('auto_post, is_active')
          .eq('user_id', existing.user_id)
          .maybeSingle()

        if (twAccount?.is_active && twAccount.auto_post) {
          const result = await announceTradeOnTwitter(admin, id)
          twitterAutoPost = { ok: result.ok, error: result.ok ? undefined : String(result.body.error ?? '') }
        }
      } catch (e: any) {
        console.error('[PATCH /api/trades/[id]] auto-post to X failed:', e?.message)
        twitterAutoPost = { ok: false, error: e?.message }
      }
    }

    return NextResponse.json({ trade, twitter_auto_post: twitterAutoPost })
  } catch (err: any) {
    console.error('[PATCH /api/trades/[id]]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/trades/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

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

    const { data: existing } = await supabase
      .from('trades')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (roleName !== 'SuperAdmin' && existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: deleteError } = await supabase.from('trades').delete().eq('id', id)
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[DELETE /api/trades/[id]]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
