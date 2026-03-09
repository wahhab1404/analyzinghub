import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { calculateCanonicalPnL, calculateAverageEntry } from '@/services/trades/canonical-pnl.service'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const analysisId = searchParams.get('analysis_id')
    const symbol = searchParams.get('symbol')
    const status = searchParams.get('status')
    const includeTesting = searchParams.get('include_testing') === 'true'

    let query = supabase
      .from('contract_trades')
      .select('*')
      .eq('scope', 'company')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })

    // Exclude testing trades by default (only owner can see them via include_testing=true)
    if (!includeTesting) {
      query = query.eq('is_testing', false)
    }

    if (analysisId) {
      query = query.eq('analysis_id', analysisId)
    }

    if (symbol) {
      query = query.eq('symbol', symbol)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: trades, error } = await query

    if (error) throw error

    return NextResponse.json({ trades })
  } catch (error) {
    console.error('[Company Trades] Error fetching trades:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      analysis_id,
      symbol,
      direction,
      strike,
      expiry_date,
      entry_price,
      contracts_qty,
      targets,
      stoploss,
      notes,
      is_average_entry,
      existing_trade_id,
      // Telegram
      telegram_channel_id,
      auto_publish_telegram,
      // Testing mode
      is_testing,
      testing_channel_ids,
    } = body

    if (!analysis_id || !symbol || !direction || !strike || !expiry_date || !entry_price) {
      return NextResponse.json(
        { error: 'Missing required fields: analysis_id, symbol, direction, strike, expiry_date, entry_price' },
        { status: 400 }
      )
    }

    if (is_testing && (!testing_channel_ids || testing_channel_ids.length === 0)) {
      return NextResponse.json(
        { error: 'Testing trades must have at least one testing channel selected' },
        { status: 400 }
      )
    }

    // ── Average entry flow ────────────────────────────────────────────────────
    if (is_average_entry && existing_trade_id) {
      const { data: existingTrade, error: fetchError } = await supabase
        .from('contract_trades')
        .select('*')
        .eq('id', existing_trade_id)
        .eq('author_id', user.id)
        .single()

      if (fetchError || !existingTrade) {
        return NextResponse.json({ error: 'Existing trade not found' }, { status: 404 })
      }

      const averaged = calculateAverageEntry(
        { price: existingTrade.entry_price, qty: existingTrade.contracts_qty },
        { price: entry_price, qty: contracts_qty }
      )

      const adjustmentHistory = existingTrade.adjustment_history || []
      adjustmentHistory.push({
        timestamp: new Date().toISOString(),
        old_entry: existingTrade.entry_price,
        old_qty: existingTrade.contracts_qty,
        new_entry: entry_price,
        new_qty: contracts_qty,
        averaged_entry: averaged.averagePrice,
        total_qty: averaged.totalQty
      })

      const { data: updatedTrade, error: updateError } = await supabase
        .from('contract_trades')
        .update({
          entry_price: averaged.averagePrice,
          contracts_qty: averaged.totalQty,
          avg_adjustments_count: (existingTrade.avg_adjustments_count || 0) + 1,
          adjustment_history: adjustmentHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing_trade_id)
        .eq('author_id', user.id)
        .select()
        .single()

      if (updateError) throw updateError

      return NextResponse.json({ trade: updatedTrade, averaged: true })
    }

    // ── Resolve production telegram_channel_id ────────────────────────────────
    // Keep as-is — UUID or direct chat ID both accepted; outbox processor uses it directly
    const resolvedChannelId = (is_testing ? null : (telegram_channel_id || null))

    const tradeData = {
      scope: 'company' as const,
      analysis_id,
      author_id: user.id,
      created_by: user.id,
      symbol: symbol.toUpperCase(),
      direction: direction.toUpperCase(),
      strike,
      expiry_date,
      entry_price,
      contracts_qty: contracts_qty || 1,
      contract_multiplier: 100,
      status: 'ACTIVE' as const,
      max_price_since_entry: entry_price,
      targets: targets || [],
      stoploss: stoploss || null,
      notes: notes || null,
      telegram_channel_id: resolvedChannelId,
      is_testing: is_testing || false,
      testing_channel_ids: is_testing ? (testing_channel_ids || []) : [],
    }

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .insert([tradeData])
      .select()
      .single()

    if (error) throw error

    console.log(`[Company Trades] Created trade ${trade.id} (symbol=${trade.symbol}, direction=${trade.direction}, is_testing=${trade.is_testing})`)

    // ── Telegram Publishing ───────────────────────────────────────────────────
    if (auto_publish_telegram) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !serviceRoleKey) {
          console.error('[Company Trades] Missing Supabase env vars for Telegram publishing')
        } else {
          const adminClient = createAdminClient(supabaseUrl, serviceRoleKey)
          const channelsToPublish: string[] = []

          if (is_testing && testing_channel_ids && testing_channel_ids.length > 0) {
            // Resolve each testing channel UUID → actual Telegram chat ID
            console.log(`[Company Trades][Testing] Resolving ${testing_channel_ids.length} testing channel UUIDs`)
            for (const channelUuid of testing_channel_ids) {
              const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelUuid)
              if (isUUID) {
                const { data: testChannel } = await adminClient
                  .from('analyzer_testing_channels')
                  .select('telegram_channel_id')
                  .eq('id', channelUuid)
                  .eq('is_enabled', true)
                  .single()

                if (testChannel?.telegram_channel_id) {
                  channelsToPublish.push(testChannel.telegram_channel_id)
                  console.log(`[Company Trades][Testing] Resolved ${channelUuid} → ${testChannel.telegram_channel_id}`)
                } else {
                  console.warn(`[Company Trades][Testing] Could not resolve testing channel UUID ${channelUuid}`)
                }
              } else {
                channelsToPublish.push(channelUuid)
              }
            }
          } else if (telegram_channel_id) {
            // Production channel — resolve UUID if needed
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(telegram_channel_id)
            if (isUUID) {
              const { data: channel } = await adminClient
                .from('telegram_channels')
                .select('channel_id')
                .eq('id', telegram_channel_id)
                .single()

              if (channel?.channel_id) {
                channelsToPublish.push(channel.channel_id)
              } else {
                console.warn(`[Company Trades] Could not resolve production channel UUID ${telegram_channel_id}`)
              }
            } else {
              channelsToPublish.push(telegram_channel_id)
            }
          }

          if (channelsToPublish.length > 0) {
            for (const chatId of channelsToPublish) {
              const { error: outboxError } = await adminClient.from('telegram_outbox').insert({
                message_type: 'company_new_trade',
                payload: {
                  trade,
                  isTestingMode: is_testing || false,
                },
                channel_id: chatId,
                status: 'pending',
                priority: 5,
                next_retry_at: new Date().toISOString(),
              })

              if (outboxError) {
                console.error(`[Company Trades] Failed to queue Telegram message to ${chatId}:`, outboxError.message)
              } else {
                console.log(`[Company Trades] ✅ Queued company_new_trade to ${chatId} (isTestingMode=${is_testing || false})`)
              }
            }
          } else {
            console.log('[Company Trades] No channels resolved — Telegram publishing skipped')
          }
        }
      } catch (telegramError) {
        console.error('[Company Trades] Telegram publishing error (non-critical):', telegramError)
      }
    }

    return NextResponse.json({ trade }, { status: 201 })
  } catch (error: any) {
    console.error('[Company Trades] Error creating trade:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create trade' },
      { status: 500 }
    )
  }
}
