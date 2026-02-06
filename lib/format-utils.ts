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

export function formatPercentageRounded(value: number): string {
  if (Math.abs(value) >= 10) {
    return `${Math.round(value)}%`;
  } else if (Math.abs(value) >= 1) {
    return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
  } else {
    return `${(Math.round(value * 100) / 100).toFixed(2)}%`;
  }
}

export function formatPercent(value: number, policy: 'standard' | 'rounded' | 'precise' = 'rounded'): string {
  switch (policy) {
    case 'precise':
      return formatPercentage(value, 2);
    case 'standard':
      return formatPercentage(value, 1);
    case 'rounded':
    default:
      return formatPercentageRounded(value);
  }
}
