export function parseRequiredNumber(value: string): number | null {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatNumber(value: number | null, digits = 2): string {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatMoney(value: number | null): string {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatCommodityClass(value: string): string {
  return value.replaceAll('_', ' ')
}

export function statusTone(status: string): 'active' | 'cancelled' {
  return status === 'CANCELLED' ? 'cancelled' : 'active'
}
