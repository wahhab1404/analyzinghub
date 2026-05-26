export type MarketState = 'Strong_Up' | 'Up' | 'Sideways' | 'Down' | 'Strong_Down'

export const STATES: MarketState[] = ['Strong_Up', 'Up', 'Sideways', 'Down', 'Strong_Down']

export const STATE_CONFIG: Record<MarketState, { label: string; labelAr: string; color: string; bgColor: string; threshold: string }> = {
  Strong_Up:   { label: 'Strong Up',   labelAr: 'صعود قوي',   color: '#10b981', bgColor: '#10b98120', threshold: '> +2%' },
  Up:          { label: 'Up',          labelAr: 'صعود',        color: '#34d399', bgColor: '#34d39920', threshold: '+0.8% to +2%' },
  Sideways:    { label: 'Sideways',    labelAr: 'محايد',       color: '#94a3b8', bgColor: '#94a3b820', threshold: '-0.8% to +0.8%' },
  Down:        { label: 'Down',        labelAr: 'هبوط',        color: '#f87171', bgColor: '#f8717120', threshold: '-0.8% to -2%' },
  Strong_Down: { label: 'Strong Down', labelAr: 'هبوط قوي',   color: '#ef4444', bgColor: '#ef444420', threshold: '< -2%' },
}

export interface CandleData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoricalPoint {
  date: string
  close: number
  return: number
  state: MarketState
  stateIndex: number
}

export interface FeatureResult {
  value: number | null
  stationary: boolean
  adfStatistic: number
  pValue: number
}

export interface AdaptiveThresholds {
  mean: number
  std: number
  upStrong: number
  up: number
  down: number
  downStrong: number
}

// Number of bars used to compute the rolling return for current-state regime detection.
// Single-bar returns are too noisy; a rolling window captures actual market direction.
export const REGIME_WINDOW: Record<string, number> = {
  '1d':  5,   // 1 week
  '4h':  5,   // ~3 trading days
  '1h':  7,   // 1 trading day
  '15m': 16,  // half a trading day
}

export interface NeuralAnalysisResult {
  symbol: string
  timeframe: string
  dataPoints: number
  dateRange: { start: string; end: string }
  currentState: MarketState
  currentReturn: number       // rolling N-bar return used for state classification
  lastBarReturn: number       // single last-bar return (raw signal)
  currentStateWindow: number  // how many bars were used for rolling return
  transitionMatrix: number[][]
  steadyState: number[]
  nextStateProbabilities: number[]
  monteCarloDistribution: number[]
  historicalStates: HistoricalPoint[]
  features: Record<string, FeatureResult>
  stateDistribution: number[]
  adaptiveThresholds: AdaptiveThresholds
  error?: string
}

export function getState(ret: number): MarketState {
  if (ret > 0.02) return 'Strong_Up'
  if (ret > 0.008) return 'Up'
  if (ret > -0.008) return 'Sideways'
  if (ret > -0.02) return 'Down'
  return 'Strong_Down'
}

export function computeReturnStats(returns: number[]): { mean: number; std: number } {
  const n = returns.length
  if (n === 0) return { mean: 0, std: 0.001 }
  const mean = returns.reduce((a, b) => a + b, 0) / n
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return { mean, std: Math.sqrt(variance) || 0.001 }
}

// Classifies a return using z-score thresholds so state distribution is
// meaningful regardless of timeframe (1H, 4H, 1D all produce ~38% Sideways,
// ~24% Up/Down, ~7% Strong states instead of 96% Sideways on sub-daily frames).
export function classifyReturn(ret: number, mean: number, std: number): MarketState {
  const z = (ret - mean) / std
  if (z > 1.5) return 'Strong_Up'
  if (z > 0.5) return 'Up'
  if (z > -0.5) return 'Sideways'
  if (z > -1.5) return 'Down'
  return 'Strong_Down'
}

export function buildTransitionMatrix(states: MarketState[]): number[][] {
  const n = STATES.length
  const counts: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  for (let i = 0; i < states.length - 1; i++) {
    const from = STATES.indexOf(states[i])
    const to = STATES.indexOf(states[i + 1])
    if (from >= 0 && to >= 0) counts[from][to]++
  }

  return counts.map(row => {
    const total = row.reduce((a, b) => a + b, 0)
    if (total === 0) return Array(n).fill(1 / n)
    return row.map(c => c / total)
  })
}

export function computeSteadyState(matrix: number[][]): number[] {
  const n = matrix.length
  let pi = Array(n).fill(1 / n)

  for (let iter = 0; iter < 2000; iter++) {
    const newPi = Array(n).fill(0)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        newPi[j] += pi[i] * matrix[i][j]
      }
    }
    const diff = newPi.reduce((acc, v, i) => acc + Math.abs(v - pi[i]), 0)
    pi = newPi
    if (diff < 1e-10) break
  }

  const sum = pi.reduce((a, b) => a + b, 0)
  return pi.map(v => v / sum)
}

export function monteCarloSimulation(transitionMatrix: number[][], currentStateIdx: number, nSims = 5000): number[] {
  const n = transitionMatrix.length
  const counts = Array(n).fill(0)
  const probs = transitionMatrix[currentStateIdx]

  for (let i = 0; i < nSims; i++) {
    const rand = Math.random()
    let cumulative = 0
    for (let j = 0; j < n; j++) {
      cumulative += probs[j]
      if (rand <= cumulative) {
        counts[j]++
        break
      }
    }
  }

  return counts.map(c => c / nSims)
}

export function adfTest(series: number[]): { statistic: number; pValue: number; stationary: boolean } {
  const n = series.length
  if (n < 15) return { statistic: 0, pValue: 0.5, stationary: false }

  const dy: number[] = []
  const yLag: number[] = []

  for (let i = 1; i < n; i++) {
    if (isFinite(series[i]) && isFinite(series[i - 1])) {
      dy.push(series[i] - series[i - 1])
      yLag.push(series[i - 1])
    }
  }

  const m = dy.length
  if (m < 10) return { statistic: 0, pValue: 0.5, stationary: false }

  const meanDy = dy.reduce((a, b) => a + b, 0) / m
  const meanYLag = yLag.reduce((a, b) => a + b, 0) / m

  let sxy = 0, sxx = 0
  for (let i = 0; i < m; i++) {
    sxy += (yLag[i] - meanYLag) * (dy[i] - meanDy)
    sxx += (yLag[i] - meanYLag) ** 2
  }

  if (sxx < 1e-15) return { statistic: -50, pValue: 0.01, stationary: true }

  const beta = sxy / sxx
  const alpha = meanDy - beta * meanYLag

  let sse = 0
  for (let i = 0; i < m; i++) {
    const residual = dy[i] - alpha - beta * yLag[i]
    sse += residual ** 2
  }

  const sigma2 = sse / (m - 2)
  const seBeta = Math.sqrt(sigma2 / sxx)
  if (seBeta < 1e-15) return { statistic: -50, pValue: 0.01, stationary: true }

  const tStat = beta / seBeta

  let pValue: number
  if (tStat < -3.96) pValue = 0.001
  else if (tStat < -3.43) pValue = 0.01
  else if (tStat < -2.86) pValue = 0.05
  else if (tStat < -2.57) pValue = 0.10
  else pValue = 0.50

  return { statistic: tStat, pValue, stationary: tStat < -2.86 }
}

function rollingMean(arr: number[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    if (i < window - 1) return null
    const slice = arr.slice(i - window + 1, i + 1)
    return slice.reduce((a, b) => a + b, 0) / window
  })
}

function rollingStd(arr: number[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    if (i < window - 1) return null
    const slice = arr.slice(i - window + 1, i + 1)
    const m = slice.reduce((a, b) => a + b, 0) / window
    return Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / window)
  })
}

export function computeFeatures(candles: CandleData[]): Record<string, (number | null)[]> {
  const n = candles.length
  const closes = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  const returns: (number | null)[] = [null]
  for (let i = 1; i < n; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }

  const returns5d: (number | null)[] = Array(5).fill(null)
  for (let i = 5; i < n; i++) returns5d.push((closes[i] - closes[i - 5]) / closes[i - 5])

  const returns20d: (number | null)[] = Array(20).fill(null)
  for (let i = 20; i < n; i++) returns20d.push((closes[i] - closes[i - 20]) / closes[i - 20])

  const returnsClean = returns.map(r => (r !== null && isFinite(r) ? r : 0))
  const vol5 = rollingStd(returnsClean, 5)
  const vol20 = rollingStd(returnsClean, 20)

  const volMean20 = rollingMean(volumes, 20)
  const volStd20 = rollingStd(volumes, 20)

  const sma5 = rollingMean(closes, 5)
  const sma20 = rollingMean(closes, 20)

  const range = candles.map((c, i) => closes[i] > 0 ? (c.high - c.low) / closes[i] : 0)
  const rangeMean20 = rollingMean(range, 20)

  return {
    return_1d: returns,
    return_5d: returns5d,
    return_20d: returns20d,
    vol_ratio: vol5.map((v5, i) => {
      const v20 = vol20[i]
      return v5 !== null && v20 !== null && v20 > 0 ? v5 / v20 : null
    }),
    momentum_norm: returns.map((r, i) => {
      const v20 = vol20[i]
      return r !== null && v20 !== null && v20 > 0 ? r / v20 : null
    }),
    volume_zscore: volumes.map((v, i) => {
      const m = volMean20[i]
      const s = volStd20[i]
      return m !== null && s !== null && s > 0 ? (v - m) / s : null
    }),
    sma_ratio: sma5.map((s5, i) => {
      const s20 = sma20[i]
      return s5 !== null && s20 !== null && s20 > 0 ? s5 / s20 - 1 : null
    }),
    range_norm: range.map((r, i) => {
      const rm = rangeMean20[i]
      return rm !== null && rm > 0 ? r / rm : null
    }),
  }
}

export function analyzeMarket(candles: CandleData[], symbol: string, timeframe: string): NeuralAnalysisResult {
  const defaultThresholds: AdaptiveThresholds = { mean: 0, std: 0.001, upStrong: 0.02, up: 0.008, down: -0.008, downStrong: -0.02 }
  const regimeWindow = REGIME_WINDOW[timeframe] ?? 5

  if (candles.length < 30) {
    return {
      symbol, timeframe, dataPoints: candles.length,
      dateRange: { start: '', end: '' },
      currentState: 'Sideways', currentReturn: 0, lastBarReturn: 0, currentStateWindow: regimeWindow,
      transitionMatrix: Array(5).fill(Array(5).fill(0.2)),
      steadyState: Array(5).fill(0.2),
      nextStateProbabilities: Array(5).fill(0.2),
      monteCarloDistribution: Array(5).fill(0.2),
      historicalStates: [], features: {}, stateDistribution: Array(5).fill(0.2),
      adaptiveThresholds: defaultThresholds,
      error: 'Insufficient data (minimum 30 candles required)',
    }
  }

  const closes = candles.map(c => c.close)

  // ── Single-bar returns: used to build the Markov transition matrix ──
  const barReturns: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    barReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  const lastBarReturn = barReturns[barReturns.length - 1]

  // ── Adaptive thresholds from single-bar return distribution ──
  const cleanBarReturns = barReturns.slice(1).filter(r => isFinite(r))
  const { mean: retMean, std: retStd } = computeReturnStats(cleanBarReturns)
  const adaptiveThresholds: AdaptiveThresholds = {
    mean: retMean,
    std: retStd,
    upStrong: retMean + 1.5 * retStd,
    up: retMean + 0.5 * retStd,
    down: retMean - 0.5 * retStd,
    downStrong: retMean - 1.5 * retStd,
  }

  // ── Transition matrix: built from individual bar states (z-score) ──
  const stateSequence = barReturns.slice(1).map(r => classifyReturn(r, retMean, retStd))
  const historicalStates: HistoricalPoint[] = candles.slice(1).map((c, i) => ({
    date: new Date(c.timestamp).toISOString().split('T')[0],
    close: c.close,
    return: barReturns[i + 1],
    state: stateSequence[i],
    stateIndex: STATES.indexOf(stateSequence[i]),
  }))

  const transitionMatrix = buildTransitionMatrix(stateSequence)
  const steadyState = computeSteadyState(transitionMatrix)

  // ── Current state: rolling N-bar return for regime detection ──
  // A single bar's return (e.g. -0.02% in 1H) is noise; a rolling window
  // (e.g. last 7 hours = 1 trading day) captures actual market direction.
  const rollingReturns: number[] = []
  for (let i = regimeWindow; i < closes.length; i++) {
    rollingReturns.push((closes[i] - closes[i - regimeWindow]) / closes[i - regimeWindow])
  }
  const { mean: rollingMean, std: rollingStd } = computeReturnStats(
    rollingReturns.filter(r => isFinite(r))
  )
  const currentRollingReturn = rollingReturns[rollingReturns.length - 1] ?? lastBarReturn
  const currentState = classifyReturn(currentRollingReturn, rollingMean, rollingStd)

  const currentStateIdx = STATES.indexOf(currentState)
  const nextStateProbabilities = transitionMatrix[currentStateIdx]
  const monteCarloDistribution = monteCarloSimulation(transitionMatrix, currentStateIdx)

  // State distribution (actual historical)
  const stateCounts = Array(5).fill(0)
  stateSequence.forEach(s => stateCounts[STATES.indexOf(s)]++)
  const stateDistribution = stateCounts.map(c => c / stateSequence.length)

  // Feature computation
  const featureArrays = computeFeatures(candles)
  const features: Record<string, FeatureResult> = {}

  const featureLabels: Record<string, string> = {
    return_1d: '1-Day Return',
    return_5d: '5-Day Return',
    return_20d: '20-Day Return',
    vol_ratio: 'Volatility Ratio (5/20)',
    momentum_norm: 'Normalized Momentum',
    volume_zscore: 'Volume Z-Score',
    sma_ratio: 'SMA Ratio (5/20)',
    range_norm: 'Normalized Range',
  }

  for (const [key, values] of Object.entries(featureArrays)) {
    const clean = values.filter(v => v !== null && isFinite(v)) as number[]
    const lastValue = values.filter(v => v !== null).slice(-1)[0] ?? null
    const adf = adfTest(clean)
    features[key] = {
      value: lastValue,
      stationary: adf.stationary,
      adfStatistic: adf.statistic,
      pValue: adf.pValue,
    }
  }

  const dateFormat = (ts: number) => new Date(ts).toISOString().split('T')[0]

  return {
    symbol, timeframe,
    dataPoints: candles.length,
    dateRange: {
      start: dateFormat(candles[0].timestamp),
      end: dateFormat(candles[candles.length - 1].timestamp),
    },
    currentState,
    currentReturn: currentRollingReturn,
    lastBarReturn,
    currentStateWindow: regimeWindow,
    transitionMatrix,
    steadyState,
    nextStateProbabilities,
    monteCarloDistribution,
    historicalStates,
    features,
    stateDistribution,
    adaptiveThresholds,
  }
}
