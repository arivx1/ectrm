import type { Trade } from './models'

export const UNIT_TBD_LABEL = 'Unit TBD'
export const MIXED_UOM_LABEL = 'Mixed UOM'

type SummarizeLabelsOptions = {
  emptyLabel: string
  mixedLabel: string
}

function normalizeDisplayLabel(value: string | null | undefined, emptyLabel: string): string {
  return value?.trim().toUpperCase() || emptyLabel
}

function summarizeLabels(
  values: Iterable<string | null | undefined>,
  { emptyLabel, mixedLabel }: SummarizeLabelsOptions,
): string {
  const normalized = new Set<string>()
  let hasValues = false

  for (const value of values) {
    normalized.add(normalizeDisplayLabel(value, emptyLabel))
    hasValues = true
  }

  if (!hasValues) {
    return emptyLabel
  }

  return normalized.size === 1 ? [...normalized][0] : mixedLabel
}

function buildLabelMap<Key extends string>(
  rows: Iterable<{ key: Key; label: string | null | undefined }>,
  options: SummarizeLabelsOptions,
): Map<Key, string> {
  const labelsByKey = new Map<Key, Set<string>>()

  for (const row of rows) {
    const nextLabels = labelsByKey.get(row.key) ?? new Set<string>()
    nextLabels.add(normalizeDisplayLabel(row.label, options.emptyLabel))
    labelsByKey.set(row.key, nextLabels)
  }

  return new Map(
    [...labelsByKey.entries()].map(([key, labels]) => [
      key,
      labels.size === 1 ? [...labels][0] : options.mixedLabel,
    ]),
  )
}

export function normalizeUnitLabel(value: string | null | undefined): string {
  return normalizeDisplayLabel(value, UNIT_TBD_LABEL)
}

export function summarizeUnitLabels(values: Iterable<string | null | undefined>): string {
  return summarizeLabels(values, {
    emptyLabel: UNIT_TBD_LABEL,
    mixedLabel: MIXED_UOM_LABEL,
  })
}

export function buildUnitLabelByCommodity(
  trades: Array<Pick<Trade, 'commodity' | 'unit_of_measure'>>,
): Map<string, string> {
  return buildLabelMap(
    trades.map((trade) => ({
      key: trade.commodity,
      label: trade.unit_of_measure,
    })),
    {
      emptyLabel: UNIT_TBD_LABEL,
      mixedLabel: MIXED_UOM_LABEL,
    },
  )
}

export function buildUnitLabelByCommodityClass(
  trades: Array<Pick<Trade, 'commodity_class' | 'unit_of_measure'>>,
): Map<string, string> {
  return buildLabelMap(
    trades.map((trade) => ({
      key: trade.commodity_class,
      label: trade.unit_of_measure,
    })),
    {
      emptyLabel: UNIT_TBD_LABEL,
      mixedLabel: MIXED_UOM_LABEL,
    },
  )
}
