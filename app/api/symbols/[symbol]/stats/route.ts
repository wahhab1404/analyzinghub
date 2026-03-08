import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const params = await context.params
    const { symbol: symbolParam } = params
    const supabase = createRouteHandlerClient(request)
    const symbol = symbolParam.toUpperCase()

    const { data: analyses, error } = await supabase
      .from('analyses')
      .select(`
        id,
        direction,
        status,
        analyzer_id,
        created_at,
        profiles!analyses_analyzer_id_fkey (
          id,
          full_name,
          avatar_url
        ),
        symbols!inner (
          symbol
        ),
        validation_events (
          event_type
        )
      `)
      .eq('symbols.symbol', symbol)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Stats query error:', error)
      return NextResponse.json({ sentiment: null, topAnalysts: [] })
    }

    const list = analyses || []

    // ── Sentiment breakdown ────────────────────────────────────────────────
    const bullish = list.filter(a => a.direction === 'Long').length
    const bearish  = list.filter(a => a.direction === 'Short').length
    const neutral  = list.filter(a => a.direction === 'Neutral').length
    const total    = list.length

    // ── Top analysts ───────────────────────────────────────────────────────
    const analystMap = new Map<string, {
      id: string
      profile: any
      analyses: number
      wins: number
      losses: number
    }>()

    for (const analysis of list) {
      const id = analysis.analyzer_id
      if (!analystMap.has(id)) {
        analystMap.set(id, {
          id,
          profile: analysis.profiles,
          analyses: 0,
          wins: 0,
          losses: 0,
        })
      }
      const a = analystMap.get(id)!
      a.analyses++
      const events: any[] = analysis.validation_events || []
      if (events.some(e => e.event_type === 'TARGET_HIT'))    a.wins++
      else if (events.some(e => e.event_type === 'STOP_LOSS_HIT')) a.losses++
    }

    const topAnalysts = Array.from(analystMap.values())
      .map(a => ({
        id:        a.id,
        profile:   a.profile,
        analyses:  a.analyses,
        wins:      a.wins,
        losses:    a.losses,
        win_rate:  a.wins + a.losses > 0
          ? Math.round((a.wins / (a.wins + a.losses)) * 100)
          : null,
      }))
      .sort((a, b) => b.analyses - a.analyses)
      .slice(0, 6)

    return NextResponse.json({
      sentiment: { bullish, bearish, neutral, total },
      topAnalysts,
    })
  } catch (error) {
    console.error('Error in GET /api/symbols/[symbol]/stats:', error)
    return NextResponse.json({ sentiment: null, topAnalysts: [] })
  }
}
