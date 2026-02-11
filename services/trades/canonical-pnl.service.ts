/**
 * Canonical P/L Calculation Service
 *
 * Enforces the $100 win threshold rule across all contract trades.
 *
 * RULES:
 * 1. WIN: If (max_price - entry_price) * qty * multiplier >= $100
 *    - is_win = true
 *    - pnl_value = (max_price - entry_price) * qty * multiplier
 *
 * 2. LOSS: If max_profit < $100
 *    - is_win = false
 *    - pnl_value = -(entry_price * qty * multiplier) [FULL ENTRY LOSS]
 *
 * 3. EXPIRED: Follow same rules - if never reached $100, it's a full loss
 *
 * 4. NO BREAKEVENS: Only WIN or LOSS outcomes
 */

export interface TradeMetrics {
  entryPrice: number
  maxPriceSinceEntry: number
  contractsQty: number
  contractMultiplier: number
}

export interface CanonicalPnLResult {
  pnlValue: number
  isWin: boolean
  maxProfitValue: number
  entryCostTotal: number
  outcome: 'WIN' | 'LOSS'
}

const WIN_THRESHOLD = 100

/**
 * Calculate canonical P/L for a contract trade
 */
export function calculateCanonicalPnL(metrics: TradeMetrics): CanonicalPnLResult {
  const { entryPrice, maxPriceSinceEntry, contractsQty, contractMultiplier } = metrics

  // Calculate total entry cost
  const entryCostTotal = entryPrice * contractsQty * contractMultiplier

  // Calculate maximum profit achieved
  const maxProfitValue = (maxPriceSinceEntry - entryPrice) * contractsQty * contractMultiplier

  // Apply $100 threshold rule
  if (maxProfitValue >= WIN_THRESHOLD) {
    // WIN: Use the maximum profit achieved
    return {
      pnlValue: maxProfitValue,
      isWin: true,
      maxProfitValue,
      entryCostTotal,
      outcome: 'WIN'
    }
  } else {
    // LOSS: Full entry cost is lost
    return {
      pnlValue: -entryCostTotal,
      isWin: false,
      maxProfitValue,
      entryCostTotal,
      outcome: 'LOSS'
    }
  }
}

/**
 * Check if a trade has met the win threshold
 */
export function hasMetWinThreshold(metrics: TradeMetrics): boolean {
  const maxProfit = (metrics.maxPriceSinceEntry - metrics.entryPrice) *
                    metrics.contractsQty *
                    metrics.contractMultiplier
  return maxProfit >= WIN_THRESHOLD
}

/**
 * Calculate current profit (not canonical - just current state)
 */
export function calculateCurrentProfit(
  entryPrice: number,
  currentPrice: number,
  qty: number,
  multiplier: number
): number {
  return (currentPrice - entryPrice) * qty * multiplier
}

/**
 * Update high watermark if current price is higher
 */
export function updateHighWatermark(
  currentPrice: number,
  previousHigh: number
): { newHigh: number; isNewHigh: boolean } {
  if (currentPrice > previousHigh) {
    return {
      newHigh: currentPrice,
      isNewHigh: true
    }
  }
  return {
    newHigh: previousHigh,
    isNewHigh: false
  }
}

/**
 * Calculate weighted average entry price for trade averaging
 */
export function calculateAverageEntry(
  existingEntry: { price: number; qty: number },
  newEntry: { price: number; qty: number }
): { averagePrice: number; totalQty: number } {
  const totalCost = (existingEntry.price * existingEntry.qty) + (newEntry.price * newEntry.qty)
  const totalQty = existingEntry.qty + newEntry.qty
  const averagePrice = totalCost / totalQty

  return {
    averagePrice,
    totalQty
  }
}

/**
 * Format P/L for display
 */
export function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? '+' : ''
  return `${sign}$${pnl.toFixed(2)}`
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * Calculate P/L percentage
 */
export function calculatePnLPercentage(pnl: number, entryCost: number): number {
  if (entryCost === 0) return 0
  return (pnl / entryCost) * 100
}

/**
 * Determine trade outcome based on status and P/L
 */
export function determineTradeOutcome(
  status: 'ACTIVE' | 'CLOSED' | 'EXPIRED',
  isWin: boolean
): 'ACTIVE' | 'WIN' | 'LOSS' | 'EXPIRED_WIN' | 'EXPIRED_LOSS' {
  if (status === 'ACTIVE') {
    return 'ACTIVE'
  }

  if (status === 'EXPIRED') {
    return isWin ? 'EXPIRED_WIN' : 'EXPIRED_LOSS'
  }

  return isWin ? 'WIN' : 'LOSS'
}

/**
 * Validate trade metrics
 */
export function validateTradeMetrics(metrics: TradeMetrics): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (metrics.entryPrice <= 0) {
    errors.push('Entry price must be greater than 0')
  }

  if (metrics.maxPriceSinceEntry < 0) {
    errors.push('Max price cannot be negative')
  }

  if (metrics.contractsQty <= 0) {
    errors.push('Contracts quantity must be greater than 0')
  }

  if (metrics.contractMultiplier <= 0) {
    errors.push('Contract multiplier must be greater than 0')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get outcome label for display
 */
export function getOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'WIN':
      return 'Win'
    case 'LOSS':
      return 'Loss'
    case 'ACTIVE':
      return 'Active'
    case 'EXPIRED_WIN':
      return 'Expired (Win)'
    case 'EXPIRED_LOSS':
      return 'Expired (Loss)'
    default:
      return outcome
  }
}

/**
 * Get outcome color for UI
 */
export function getOutcomeColor(outcome: string): string {
  switch (outcome) {
    case 'WIN':
    case 'EXPIRED_WIN':
      return 'green'
    case 'LOSS':
    case 'EXPIRED_LOSS':
      return 'red'
    case 'ACTIVE':
      return 'blue'
    default:
      return 'gray'
  }
}

export default {
  calculateCanonicalPnL,
  hasMetWinThreshold,
  calculateCurrentProfit,
  updateHighWatermark,
  calculateAverageEntry,
  formatPnL,
  formatPercentage,
  calculatePnLPercentage,
  determineTradeOutcome,
  validateTradeMetrics,
  getOutcomeLabel,
  getOutcomeColor,
  WIN_THRESHOLD
}
