import type { ReferenceRecord } from './models'

export function ensureCurrentOption<T extends ReferenceRecord>(
  options: T[],
  currentValue: string,
  currentClass: string,
  fallbackLabel: string,
): T[] {
  if (!currentValue || options.some((option) => option.code === currentValue)) {
    return options
  }

  return [
    {
      code: currentValue,
      commodity_class: currentClass,
      name: fallbackLabel,
      is_active: false,
    } as unknown as T,
    ...options,
  ]
}

export function classForCommodity(commodities: ReferenceRecord[], commodity: string): string {
  return commodities.find((row) => row.code === commodity)?.commodity_class ?? 'OTHER'
}
