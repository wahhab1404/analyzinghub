import { createClient } from 'npm:@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface PriceData {
  symbol: string
  price: number
  timestamp: Date
}

class PolygonPriceProvider {
  private apiKey: string
  private baseUrl = 'https://api.polygon.io'

  constructor(apiKey: string) {
    this.apiKey = apiKey
    if (!this.apiKey) {
      throw new Error('Polygon API key is required')
    }
  }

  async getPrice(symbol: string): Promise<PriceData> {
    const normalizedSymbol = this.normalizeSymbol(symbol)

    try {
      const response = await fetch(
        `${this.baseUrl}/v2/last/trade/${normalizedSymbol}?apiKey=${this.apiKey}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Symbol ${symbol} not found on Polygon`)
        }
        throw new Error(`Polygon API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status === 'ERROR') {
        throw new Error(`Polygon API error: ${data.error || 'Unknown error'}`)
      }

      if (!data.results || !data.results.p) {
        throw new Error(`No price data available for ${symbol}`)
      }

      return {
        symbol,
        price: data.results.p,
        timestamp: new Date(data.results.t / 1000000),
      }
    } catch (error: any) {
      console.error(`Error fetching price for ${symbol}:`, error.message)
      throw error
    }
  }

  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase().trim()

    if (upper.includes('/')) {
      const parts = upper.split('/')
      if (parts[1] === 'USD') {
        return `X:${parts[0]}USD`
      }
    }

    return upper
  }
}

class MockPriceProvider {
  private basePrices: Map<string, number> = new Map([
    ['BTC/USD', 45000],
    ['ETH/USD', 2500],
    ['AAPL', 175],
    ['GOOGL', 140],
    ['MSFT', 380],
    ['TSLA', 250],
    ['AMZN', 155],
  ])

  private priceHistory: Map<string, number[]> = new Map()

  async getPrice(symbol: string): Promise<PriceData> {
    const basePrice = this.basePrices.get(symbol) || 100
    const history = this.priceHistory.get(symbol) || []

    const volatility = 0.02
    const lastPrice = history.length > 0 ? history[history.length - 1] : basePrice
    const change = (Math.random() - 0.5) * 2 * volatility
    const newPrice = lastPrice * (1 + change)

    history.push(newPrice)
    if (history.length > 100) {
      history.shift()
    }
    this.priceHistory.set(symbol, history)

    return {
      symbol,
      price: Math.round(newPrice * 100) / 100,
      timestamp: new Date(),
    }
  }
}

interface ValidationResult {
  shouldValidate: boolean
  eventType?: 'STOP_LOSS_HIT' | 'TARGET_HIT'
  targetNumber?: number
  priceAtHit?: number
}

function checkAnalysis(
  analysis: any,
  targets: any[],
  currentPrice: number
): ValidationResult {
  if (analysis.status !== 'IN_PROGRESS') {
    return { shouldValidate: false }
  }

  const direction = analysis.direction
  const stopLoss = Number(analysis.stop_loss)

  const sortedTargets = [...targets]
    .sort((a, b) => Number(a.price) - Number(b.price))
    .map((t, index) => ({
      ...t,
      number: index + 1,
    }))

  if (direction === 'Long') {
    if (currentPrice <= stopLoss) {
      return {
        shouldValidate: true,
        eventType: 'STOP_LOSS_HIT',
        priceAtHit: currentPrice,
      }
    }

    for (const target of sortedTargets) {
      const targetPrice = Number(target.price)
      if (currentPrice >= targetPrice) {
        return {
          shouldValidate: true,
          eventType: 'TARGET_HIT',
          targetNumber: target.number,
          priceAtHit: currentPrice,
        }
      }
    }
  } else if (direction === 'Short') {
    if (currentPrice >= stopLoss) {
      return {
        shouldValidate: true,
        eventType: 'STOP_LOSS_HIT',
        priceAtHit: currentPrice,
      }
    }

    for (let i = sortedTargets.length - 1; i >= 0; i--) {
      const target = sortedTargets[i]
      const targetPrice = Number(target.price)
      if (currentPrice <= targetPrice) {
        return {
          shouldValidate: true,
          eventType: 'TARGET_HIT',
          targetNumber: target.number,
          priceAtHit: currentPrice,
        }
      }
    }
  }

  return { shouldValidate: false }
}

async function sendTelegramNotification(
  supabase: any,
  analysis: any,
  validationResult: ValidationResult,
  notificationId: string
) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', analysis.user_id)
      .maybeSingle()

    const payload = {
      notificationId,
      userId: analysis.user_id,
      type: validationResult.eventType === 'TARGET_HIT' ? 'target_hit' : 'stop_hit',
      analysisId: analysis.id,
      analyzerName: profile?.full_name || 'Unknown',
      symbol: analysis.symbols.symbol,
      targetNumber: validationResult.targetNumber,
      targetPrice: validationResult.priceAtHit,
      stopPrice: validationResult.eventType === 'STOP_LOSS_HIT' ? validationResult.priceAtHit : undefined,
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-sender`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to send Telegram notification:', error)
    } else {
      console.log('Telegram notification sent successfully')
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error)
  }
}

async function sendChannelBroadcast(
  supabase: any,
  analysis: any,
  validationResult: ValidationResult
) {
  try {
    const payload = {
      userId: analysis.user_id,
      analysisId: analysis.id,
      eventType: validationResult.eventType === 'TARGET_HIT' ? 'target_hit' : 'stop_hit',
      symbol: analysis.symbols.symbol,
      targetNumber: validationResult.targetNumber,
      targetPrice: validationResult.priceAtHit,
      stopPrice: validationResult.eventType === 'STOP_LOSS_HIT' ? validationResult.priceAtHit : undefined,
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-channel-broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to send channel broadcast:', error)
    } else {
      console.log('Channel broadcast sent successfully')
    }
  } catch (error) {
    console.error('Error sending channel broadcast:', error)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY') || 'jKbMRYMKztcbYVZylExoLutnJXeMlexe'
    
    let priceProvider: PolygonPriceProvider | MockPriceProvider
    
    try {
      priceProvider = new PolygonPriceProvider(polygonApiKey)
    } catch (error) {
      console.warn('Failed to initialize Polygon provider, falling back to mock:', error)
      priceProvider = new MockPriceProvider()
    }

    const { data: analyses, error: analysesError } = await supabaseClient
      .from('analyses')
      .select('*, symbols(*)')
      .eq('status', 'IN_PROGRESS')

    if (analysesError) {
      throw analysesError
    }

    const results = {
      checked: 0,
      validated: 0,
      errors: [] as string[],
      telegramNotifications: 0,
      channelBroadcasts: 0,
      provider: priceProvider instanceof PolygonPriceProvider ? 'Polygon.io' : 'Mock',
    }

    for (const analysis of analyses || []) {
      try {
        results.checked++

        const symbol = analysis.symbols.symbol
        const priceData = await priceProvider.getPrice(symbol)

        await supabaseClient.from('price_snapshots').insert({
          symbol: priceData.symbol,
          price: priceData.price,
          timestamp: priceData.timestamp.toISOString(),
        })

        const { data: targets, error: targetsError } = await supabaseClient
          .from('analysis_targets')
          .select('*')
          .eq('analysis_id', analysis.id)

        if (targetsError) {
          throw targetsError
        }

        const validationResult = checkAnalysis(
          analysis,
          targets || [],
          priceData.price
        )

        if (validationResult.shouldValidate) {
          const eventData: any = {
            analysis_id: analysis.id,
            event_type: validationResult.eventType,
            price_at_hit: validationResult.priceAtHit,
            hit_at: new Date().toISOString(),
          }

          if (validationResult.eventType === 'TARGET_HIT' && validationResult.targetNumber) {
            eventData.target_number = validationResult.targetNumber
          }

          const { error: eventError } = await supabaseClient
            .from('validation_events')
            .insert(eventData)

          if (eventError) {
            throw eventError
          }

          results.validated++

          const { data: notification } = await supabaseClient
            .from('notifications')
            .select('id')
            .eq('analysis_id', analysis.id)
            .eq('type', validationResult.eventType === 'TARGET_HIT' ? 'target_hit' : 'stop_hit')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (notification) {
            await sendTelegramNotification(
              supabaseClient,
              analysis,
              validationResult,
              notification.id
            )
            results.telegramNotifications++
          }

          await sendChannelBroadcast(
            supabaseClient,
            analysis,
            validationResult
          )
          results.channelBroadcasts++
        }
      } catch (error: any) {
        results.errors.push(`Analysis ${analysis.id}: ${error.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})