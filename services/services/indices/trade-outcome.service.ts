import { createClient } from '@/lib/supabase/server';

export interface TradeOutcome {
  isWin: boolean;
  computedProfitUsd: number;
  peakProfitUsd: number;
  shouldAwardPoints: boolean;
}

export interface TargetHitResult {
  isHit: boolean;
  hitPrice?: number;
  hitAt?: Date;
}

export interface SameStrikeCheck {
  hasSameStrike: boolean;
  existingTradeId?: string;
  existingTrade?: {
    id: string;
    entryPrice: number;
    currentPrice: number;
    highestPrice: number;
    entryCost: number;
    status: string;
  };
}

export class TradeOutcomeService {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseClient?: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient || createClient();
  }

  async computeTradeOutcome(tradeId: string): Promise<TradeOutcome> {
    const { data, error } = await this.supabase
      .rpc('compute_trade_outcome', { p_trade_id: tradeId })
      .single();

    if (error) {
      console.error('[TradeOutcomeService] Error computing outcome:', error);
      throw new Error(`Failed to compute trade outcome: ${error.message}`);
    }

    return {
      isWin: data.is_win,
      computedProfitUsd: parseFloat(data.computed_profit_usd),
      peakProfitUsd: parseFloat(data.peak_profit_usd),
      shouldAwardPoints: data.should_award_points,
    };
  }

  async updateTradeOutcome(tradeId: string): Promise<void> {
    const outcome = await this.computeTradeOutcome(tradeId);

    const { error } = await this.supabase
      .from('index_trades')
      .update({
        is_win: outcome.isWin,
        computed_profit_usd: outcome.computedProfitUsd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId);

    if (error) {
      console.error('[TradeOutcomeService] Error updating trade:', error);
      throw new Error(`Failed to update trade outcome: ${error.message}`);
    }

    console.log(`[TradeOutcomeService] Updated trade ${tradeId}: win=${outcome.isWin}, profit=$${outcome.computedProfitUsd}`);
  }

  checkTargetHit(params: {
    currentPrice: number;
    currentHigh?: number;
    currentLow?: number;
    targetPrice: number;
    direction: 'LONG' | 'SHORT';
    requireClose?: boolean;
  }): TargetHitResult {
    const {
      currentPrice,
      currentHigh,
      currentLow,
      targetPrice,
      direction,
      requireClose = false,
    } = params;

    let isHit = false;

    if (requireClose) {
      if (direction === 'LONG') {
        isHit = currentPrice >= targetPrice;
      } else if (direction === 'SHORT') {
        isHit = currentPrice <= targetPrice;
      }
    } else {
      if (direction === 'LONG') {
        const highToCheck = currentHigh ?? currentPrice;
        isHit = highToCheck >= targetPrice;
      } else if (direction === 'SHORT') {
        const lowToCheck = currentLow ?? currentPrice;
        isHit = lowToCheck <= targetPrice;
      }
    }

    console.log('[TradeOutcomeService] Target hit check:', {
      direction,
      targetPrice,
      currentPrice,
      currentHigh,
      currentLow,
      requireClose,
      isHit,
    });

    return {
      isHit,
      hitPrice: isHit ? (direction === 'LONG' ? (currentHigh ?? currentPrice) : (currentLow ?? currentPrice)) : undefined,
      hitAt: isHit ? new Date() : undefined,
    };
  }

  async checkTargetHitForAnalysis(params: {
    analysisId: string;
    targetNumber: number;
    currentPrice: number;
    currentHigh?: number;
    currentLow?: number;
  }): Promise<TargetHitResult> {
    const { analysisId, targetNumber, currentPrice, currentHigh, currentLow } = params;

    const { data: analysis, error } = await this.supabase
      .from('analyses')
      .select('direction, extended_targets, targets_hit_data')
      .eq('id', analysisId)
      .single();

    if (error || !analysis) {
      console.error('[TradeOutcomeService] Error fetching analysis:', error);
      return { isHit: false };
    }

    const targets = analysis.extended_targets || [];
    const target = targets.find((t: any) => t.number === targetNumber);

    if (!target) {
      return { isHit: false };
    }

    const targetsHitData = analysis.targets_hit_data || [];
    const alreadyHit = targetsHitData.some((t: any) => t.target === targetNumber);

    if (alreadyHit) {
      return { isHit: true };
    }

    return this.checkTargetHit({
      currentPrice,
      currentHigh,
      currentLow,
      targetPrice: target.price,
      direction: analysis.direction,
      requireClose: target.requireClose || false,
    });
  }

  async markTargetAsHit(params: {
    analysisId: string;
    targetNumber: number;
    hitPrice: number;
    hitHigh?: number;
    hitLow?: number;
  }): Promise<void> {
    const { analysisId, targetNumber, hitPrice, hitHigh, hitLow } = params;

    const { data: analysis } = await this.supabase
      .from('analyses')
      .select('targets_hit_data')
      .eq('id', analysisId)
      .single();

    const targetsHitData = analysis?.targets_hit_data || [];

    const alreadyHit = targetsHitData.some((t: any) => t.target === targetNumber);
    if (alreadyHit) {
      console.log(`[TradeOutcomeService] Target ${targetNumber} already marked as hit for analysis ${analysisId}`);
      return;
    }

    targetsHitData.push({
      target: targetNumber,
      hitAt: new Date().toISOString(),
      price: hitPrice,
      high: hitHigh,
      low: hitLow,
    });

    const { error } = await this.supabase
      .from('analyses')
      .update({
        targets_hit_data: targetsHitData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysisId);

    if (error) {
      console.error('[TradeOutcomeService] Error marking target as hit:', error);
      throw new Error(`Failed to mark target as hit: ${error.message}`);
    }

    console.log(`[TradeOutcomeService] Marked target ${targetNumber} as hit for analysis ${analysisId}`);
  }

  async checkSameStrikeActiveTrade(params: {
    analyzerId: string;
    symbol: string;
    strike: number;
    expiry: string;
    optionType: string;
    excludeTradeId?: string;
  }): Promise<SameStrikeCheck> {
    const { analyzerId, symbol, strike, expiry, optionType, excludeTradeId } = params;

    const { data, error } = await this.supabase.rpc('check_same_strike_active_trade', {
      p_analyzer_id: analyzerId,
      p_symbol: symbol,
      p_strike: strike,
      p_expiry: expiry,
      p_option_type: optionType,
      p_exclude_trade_id: excludeTradeId || null,
    });

    if (error) {
      console.error('[TradeOutcomeService] Error checking same strike:', error);
      return { hasSameStrike: false };
    }

    if (!data || data.length === 0) {
      return { hasSameStrike: false };
    }

    const existingTrade = data[0];

    console.log('[TradeOutcomeService] Found same strike active trade:', existingTrade);

    return {
      hasSameStrike: true,
      existingTradeId: existingTrade.trade_id,
      existingTrade: {
        id: existingTrade.trade_id,
        entryPrice: parseFloat(existingTrade.entry_price),
        currentPrice: parseFloat(existingTrade.current_price),
        highestPrice: parseFloat(existingTrade.highest_price),
        entryCost: parseFloat(existingTrade.entry_cost),
        status: existingTrade.status,
      },
    };
  }

  async closeTradeAtPeak(tradeId: string, reason: string): Promise<void> {
    const { data: trade } = await this.supabase
      .from('index_trades')
      .select('contract_high_since, peak_price_after_entry, contract_multiplier, qty, entry_contract_snapshot')
      .eq('id', tradeId)
      .single();

    if (!trade) {
      throw new Error('Trade not found');
    }

    const peakPrice = trade.peak_price_after_entry || trade.contract_high_since;
    const entryPrice = parseFloat(trade.entry_contract_snapshot?.mark || trade.entry_contract_snapshot?.last || '0');
    const multiplier = trade.contract_multiplier || 100;
    const qty = trade.qty || 1;

    const pnlUsd = (peakPrice - entryPrice) * multiplier * qty;

    const { error } = await this.supabase
      .from('index_trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closure_reason: reason,
        pnl_usd: pnlUsd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId);

    if (error) {
      console.error('[TradeOutcomeService] Error closing trade:', error);
      throw new Error(`Failed to close trade: ${error.message}`);
    }

    await this.updateTradeOutcome(tradeId);

    console.log(`[TradeOutcomeService] Closed trade ${tradeId} at peak price ${peakPrice}, P&L: $${pnlUsd}`);
  }

  async averageTradeEntry(params: {
    tradeId: string;
    newEntryPrice: number;
    newEntryAmount: number;
    notes?: string;
  }): Promise<void> {
    const { tradeId, newEntryPrice, newEntryAmount, notes } = params;

    const { data: trade } = await this.supabase
      .from('index_trades')
      .select('entry_contract_snapshot, entries_data, qty')
      .eq('id', tradeId)
      .single();

    if (!trade) {
      throw new Error('Trade not found');
    }

    const currentEntryPrice = parseFloat(
      trade.entry_contract_snapshot?.mark || trade.entry_contract_snapshot?.last || '0'
    );

    const entriesData = trade.entries_data || [];
    const entryNumber = entriesData.length + 1;

    if (entriesData.length === 0) {
      entriesData.push({
        entry_number: 1,
        entry_price: currentEntryPrice,
        entry_time: new Date().toISOString(),
        notes: 'Original entry',
      });
    }

    entriesData.push({
      entry_number: entryNumber,
      entry_price: newEntryPrice,
      entry_amount: newEntryAmount,
      entry_time: new Date().toISOString(),
      notes: notes || 'Additional entry',
    });

    const totalEntries = entriesData.length;
    const avgEntryPrice = entriesData.reduce((sum: number, entry: any) => sum + entry.entry_price, 0) / totalEntries;

    const updatedSnapshot = {
      ...trade.entry_contract_snapshot,
      mark: avgEntryPrice,
      originalMark: currentEntryPrice,
      averaged: true,
      entries: entriesData.length,
    };

    const { error } = await this.supabase
      .from('index_trades')
      .update({
        entry_contract_snapshot: updatedSnapshot,
        entries_data: entriesData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId);

    if (error) {
      console.error('[TradeOutcomeService] Error averaging entry:', error);
      throw new Error(`Failed to average entry: ${error.message}`);
    }

    const { error: entryError } = await this.supabase.from('trade_entries').insert({
      trade_id: tradeId,
      entry_number: entryNumber,
      entry_price: newEntryPrice,
      entry_amount: newEntryAmount,
      notes,
    });

    if (entryError) {
      console.error('[TradeOutcomeService] Error inserting trade entry:', entryError);
    }

    console.log(`[TradeOutcomeService] Averaged entry for trade ${tradeId}: ${currentEntryPrice} + ${newEntryPrice} = ${avgEntryPrice}`);
  }

  calculateWinLossForTrade(params: {
    entryPrice: number;
    peakPrice: number;
    multiplier: number;
    qty: number;
  }): { isWin: boolean; peakProfit: number } {
    const { entryPrice, peakPrice, multiplier, qty } = params;
    const peakProfit = (peakPrice - entryPrice) * multiplier * qty;
    const isWin = peakProfit > 100;

    console.log('[TradeOutcomeService] Win/Loss calculation:', {
      entryPrice,
      peakPrice,
      multiplier,
      qty,
      peakProfit,
      isWin,
      rule: 'Peak profit > $100 = WIN',
    });

    return { isWin, peakProfit };
  }
}

export const tradeOutcomeService = new TradeOutcomeService();
