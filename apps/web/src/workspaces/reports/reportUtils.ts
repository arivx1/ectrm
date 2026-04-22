export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  )
}

export function formatCodeLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ')
}

export function deltaTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if ((value ?? 0) > 0) {
    return 'up'
  }
  if ((value ?? 0) < 0) {
    return 'down'
  }
  return 'flat'
}

export function formatSignedMoney(value: number, formatMoney: (value: number | null) => string): string {
  const formattedValue = formatMoney(Math.abs(value))
  if (value > 0) {
    return `+${formattedValue}`
  }
  if (value < 0) {
    return `-${formattedValue}`
  }
  return formattedValue
}

export function formatLifecycleEventLabel(eventType: string): string {
  return eventType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .trim()
}

function toCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const normalized = String(value).replaceAll('"', '""')
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized
}

export function exportReportCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(objectUrl)
}
