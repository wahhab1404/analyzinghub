export function formatNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatCurrency(value: number, decimals: number = 0): string {
  const formatted = formatNumber(Math.abs(value), decimals)
  const sign = value >= 0 ? '+' : '-'
  return `${sign}$${formatted}`
}

export function formatCurrencySimple(value: number, decimals: number = 0): string {
  const formatted = formatNumber(Math.abs(value), decimals)
  return value >= 0 ? `$${formatted}` : `-$${formatted}`
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${formatNumber(value, decimals)}%`
}
