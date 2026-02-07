import { PriceData, ValidationEvent, AnalysisStatus } from '../price/types'

interface Analysis {
  id: string
  analyzer_id: string
  symbol_id: string
  direction: 'Long' | 'Short' | 'Neutral'
  stop_loss: number
  status: AnalysisStatus
  created_at: string
  updated_at: string
}

interface AnalysisTarget {
  id: string
  analysis_id: string
  price: number
  expected_time: string
  created_at: string
}

interface Symbol {
  id: string
  symbol: string
  created_at: string
}

interface ValidationResult {
  shouldValidate: boolean
  eventType?: 'STOP_LOSS_HIT' | 'TARGET_HIT'
  targetNumber?: number
  priceAtHit?: number
}

export class ValidationService {
  checkAnalysis(
    analysis: Analysis,
    targets: AnalysisTarget[],
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

  async createValidationEvent(
    supabaseClient: any,
    analysisId: string,
    eventType: 'STOP_LOSS_HIT' | 'TARGET_HIT',
    priceAtHit: number,
    targetNumber?: number
  ): Promise<ValidationEvent | null> {
    const eventData: any = {
      analysis_id: analysisId,
      event_type: eventType,
      price_at_hit: priceAtHit,
      hit_at: new Date().toISOString(),
    }

    if (eventType === 'TARGET_HIT' && targetNumber) {
      eventData.target_number = targetNumber
    }

    const { data, error } = await supabaseClient
      .from('validation_events')
      .insert(eventData)
      .select()
      .single()

    if (error) {
      console.error('Error creating validation event:', error)
      return null
    }

    return data
  }

  async validateAnalysis(
    supabaseClient: any,
    analysis: Analysis,
    targets: AnalysisTarget[],
    currentPrice: number
  ): Promise<ValidationEvent | null> {
    const result = this.checkAnalysis(analysis, targets, currentPrice)

    if (!result.shouldValidate) {
      return null
    }

    return this.createValidationEvent(
      supabaseClient,
      analysis.id,
      result.eventType!,
      result.priceAtHit!,
      result.targetNumber
    )
  }

  async getValidationEvents(
    supabaseClient: any,
    analysisId: string
  ): Promise<ValidationEvent[]> {
    const { data, error } = await supabaseClient
      .from('validation_events')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('hit_at', { ascending: false })

    if (error) {
      console.error('Error fetching validation events:', error)
      return []
    }

    return data || []
  }
}
