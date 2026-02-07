import { createClient } from '@/lib/supabase/server';

export type PointEventType = 'target_hit' | 'trade_win' | 'trade_loss' | 'stop_loss';

export interface PointsAward {
  eventType: PointEventType;
  points: number;
  description: string;
}

export interface PointsLedgerEntry {
  id: string;
  analyzerId: string;
  eventType: PointEventType;
  pointsAwarded: number;
  referenceType: string;
  referenceId: string;
  description: string;
  metadata: any;
  createdAt: string;
}

export class PointsService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient?: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient || createClient();
  }

  async awardPointsForEvent(params: {
    analyzerId: string;
    eventType: PointEventType;
    referenceType: string;
    referenceId: string;
    metadata?: any;
  }): Promise<number> {
    const { analyzerId, eventType, referenceType, referenceId, metadata = {} } = params;

    console.log('[PointsService] Awarding points:', {
      analyzerId,
      eventType,
      referenceType,
      referenceId,
      metadata,
    });

    const { data, error } = await this.supabase.rpc('award_points_for_event', {
      p_analyzer_id: analyzerId,
      p_event_type: eventType,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_metadata: metadata,
    });

    if (error) {
      console.error('[PointsService] Error awarding points:', error);
      throw new Error(`Failed to award points: ${error.message}`);
    }

    const pointsAwarded = data as number;

    if (pointsAwarded !== 0) {
      console.log(`[PointsService] Awarded ${pointsAwarded} points to ${analyzerId} for ${eventType}`);
    } else {
      console.log(`[PointsService] Points already awarded or not applicable for ${eventType}`);
    }

    return pointsAwarded;
  }

  async awardTargetHitPoints(analyzerId: string, analysisId: string, targetNumber: number): Promise<number> {
    return this.awardPointsForEvent({
      analyzerId,
      eventType: 'target_hit',
      referenceType: 'analysis',
      referenceId: analysisId,
      metadata: { target_number: targetNumber },
    });
  }

  async awardTradeWinPoints(analyzerId: string, tradeId: string, profitUsd: number): Promise<number> {
    const pointsPerHundred = Math.floor(profitUsd / 100) * 10;

    return this.awardPointsForEvent({
      analyzerId,
      eventType: 'trade_win',
      referenceType: 'trade',
      referenceId: tradeId,
      metadata: { profit_usd: profitUsd, points_calculation: `floor(${profitUsd}/100) * 10 = ${pointsPerHundred}` },
    });
  }

  async awardTradeLossPoints(analyzerId: string, tradeId: string): Promise<number> {
    return this.awardPointsForEvent({
      analyzerId,
      eventType: 'trade_loss',
      referenceType: 'trade',
      referenceId: tradeId,
      metadata: {},
    });
  }

  async awardStopLossPoints(analyzerId: string, tradeId: string): Promise<number> {
    return this.awardPointsForEvent({
      analyzerId,
      eventType: 'stop_loss',
      referenceType: 'trade',
      referenceId: tradeId,
      metadata: {},
    });
  }

  async processTradeOutcomePoints(params: {
    tradeId: string;
    analyzerId: string;
    isWin: boolean;
    profitUsd: number;
    isStopLoss: boolean;
  }): Promise<{ totalPoints: number; breakdown: PointsAward[] }> {
    const { tradeId, analyzerId, isWin, profitUsd, isStopLoss } = params;

    const breakdown: PointsAward[] = [];
    let totalPoints = 0;

    if (isWin) {
      const points = await this.awardTradeWinPoints(analyzerId, tradeId, profitUsd);
      if (points > 0) {
        breakdown.push({
          eventType: 'trade_win',
          points,
          description: `Winning trade: +${points} points ($${profitUsd.toFixed(2)} profit)`,
        });
        totalPoints += points;
      }
    } else {
      if (isStopLoss) {
        const points = await this.awardStopLossPoints(analyzerId, tradeId);
        if (points !== 0) {
          breakdown.push({
            eventType: 'stop_loss',
            points,
            description: `Stop loss hit: ${points} points`,
          });
          totalPoints += points;
        }
      } else {
        const points = await this.awardTradeLossPoints(analyzerId, tradeId);
        if (points !== 0) {
          breakdown.push({
            eventType: 'trade_loss',
            points,
            description: `Losing trade: ${points} points`,
          });
          totalPoints += points;
        }
      }
    }

    console.log('[PointsService] Trade outcome points processed:', {
      tradeId,
      analyzerId,
      isWin,
      profitUsd,
      isStopLoss,
      totalPoints,
      breakdown,
    });

    return { totalPoints, breakdown };
  }

  async getAnalyzerTotalPoints(analyzerId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_analyzer_total_points', {
      p_analyzer_id: analyzerId,
    });

    if (error) {
      console.error('[PointsService] Error getting total points:', error);
      return 0;
    }

    return data as number;
  }

  async getPointsLedger(analyzerId: string, limit = 50): Promise<PointsLedgerEntry[]> {
    const { data, error } = await this.supabase
      .from('points_ledger')
      .select('*')
      .eq('analyzer_id', analyzerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[PointsService] Error fetching points ledger:', error);
      return [];
    }

    return (data || []).map((entry) => ({
      id: entry.id,
      analyzerId: entry.analyzer_id,
      eventType: entry.event_type as PointEventType,
      pointsAwarded: entry.points_awarded,
      referenceType: entry.reference_type,
      referenceId: entry.reference_id,
      description: entry.description,
      metadata: entry.metadata,
      createdAt: entry.created_at,
    }));
  }

  calculateWinPoints(profitUsd: number): number {
    const points = Math.floor(profitUsd / 100) * 10;
    console.log(`[PointsService] Win points calculation: floor($${profitUsd}/100) * 10 = ${points} points`);
    return points;
  }

  async recalculateAnalyzerPoints(analyzerId: string): Promise<{
    oldTotal: number;
    newTotal: number;
    recalculated: boolean;
  }> {
    const oldTotal = await this.getAnalyzerTotalPoints(analyzerId);

    const { data: trades } = await this.supabase
      .from('index_trades')
      .select('id, author_id, is_win, computed_profit_usd, status, loss_condition_met')
      .eq('author_id', analyzerId)
      .in('status', ['closed']);

    const { data: analyses } = await this.supabase
      .from('analyses')
      .select('id, analyzer_id, targets_hit_data')
      .eq('analyzer_id', analyzerId);

    await this.supabase.from('points_ledger').delete().eq('analyzer_id', analyzerId);

    let recalculatedPoints = 0;

    for (const trade of trades || []) {
      if (trade.is_win) {
        const points = await this.awardTradeWinPoints(analyzerId, trade.id, trade.computed_profit_usd || 0);
        recalculatedPoints += points;
      } else {
        const isStopLoss = trade.loss_condition_met === 'stop_loss';
        if (isStopLoss) {
          const points = await this.awardStopLossPoints(analyzerId, trade.id);
          recalculatedPoints += points;
        } else {
          const points = await this.awardTradeLossPoints(analyzerId, trade.id);
          recalculatedPoints += points;
        }
      }
    }

    for (const analysis of analyses || []) {
      const targetsHit = analysis.targets_hit_data || [];
      for (const target of targetsHit) {
        const points = await this.awardTargetHitPoints(analyzerId, analysis.id, target.target);
        recalculatedPoints += points;
      }
    }

    const newTotal = await this.getAnalyzerTotalPoints(analyzerId);

    console.log('[PointsService] Recalculated points for analyzer:', {
      analyzerId,
      oldTotal,
      newTotal,
      difference: newTotal - oldTotal,
    });

    return {
      oldTotal,
      newTotal,
      recalculated: true,
    };
  }
}

export const pointsService = new PointsService();
