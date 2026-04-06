import type { OptionExposureRow } from './models'

function normalizeSideSign(tradeSide: string | null | undefined): number {
  return (tradeSide ?? 'BUY').trim().toUpperCase() === 'SELL' ? -1 : 1
}

function normalizeOptionSign(optionType: string | null | undefined): number {
  return (optionType ?? 'CALL').trim().toUpperCase() === 'PUT' ? -1 : 1
}

export function calculateUnderlyingEquivalentVolume(
  tradeSide: string | null | undefined,
  optionType: string | null | undefined,
  contractVolume: number | null | undefined,
): number {
  return (contractVolume ?? 0) * normalizeSideSign(tradeSide) * normalizeOptionSign(optionType)
}

export function calculatePremiumCashflow(
  tradeSide: string | null | undefined,
  premiumPrice: number | null | undefined,
  contractVolume: number | null | undefined,
): number | null {
  if (premiumPrice === null || premiumPrice === undefined) {
    return null
  }

  return premiumPrice * (contractVolume ?? 0) * normalizeSideSign(tradeSide)
}

export function calculateDaysToExpiration(
  optionExpirationDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const normalizedDate = optionExpirationDate?.trim()
  if (!normalizedDate) {
    return null
  }

  const [yearText, monthText, dayText] = normalizedDate.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const targetUtc = Date.UTC(year, month - 1, day)
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((targetUtc - todayUtc) / 86_400_000)
}

export function buildOptionExposureSummary(
  optionExposures: OptionExposureRow[],
  now: Date = new Date(),
): {
  optionCount: number
  grossContracts: number
  netUnderlyingEquivalentVolume: number
  grossPremiumAtRisk: number
  exposureByClass: Array<{ commodityClass: string; underlyingEquivalentVolume: number }>
  soonestExpirationTradeId: string | null
  soonestExpirationDate: string | null
  soonestExpirationDays: number | null
} {
  let grossContracts = 0
  let netUnderlyingEquivalentVolume = 0
  let grossPremiumAtRisk = 0
  let soonestExpirationTradeId: string | null = null
  let soonestExpirationDate: string | null = null
  let soonestExpirationDays: number | null = null

  const exposureByClass = new Map<string, number>()

  for (const row of optionExposures) {
    grossContracts += Math.abs(row.contract_volume)
    netUnderlyingEquivalentVolume += row.underlying_equivalent_volume
    grossPremiumAtRisk += Math.abs(row.premium_cashflow ?? 0)

    const currentClassExposure = exposureByClass.get(row.commodity_class) ?? 0
    exposureByClass.set(
      row.commodity_class,
      currentClassExposure + row.underlying_equivalent_volume,
    )

    const nextDays = calculateDaysToExpiration(row.option_expiration_date, now)
    if (nextDays === null) {
      continue
    }
    if (soonestExpirationDays === null || nextDays < soonestExpirationDays) {
      soonestExpirationTradeId = row.trade_id
      soonestExpirationDate = row.option_expiration_date
      soonestExpirationDays = nextDays
    }
  }

  return {
    optionCount: optionExposures.length,
    grossContracts,
    netUnderlyingEquivalentVolume,
    grossPremiumAtRisk,
    exposureByClass: [...exposureByClass.entries()]
      .map(([commodityClass, underlyingEquivalentVolume]) => ({
        commodityClass,
        underlyingEquivalentVolume,
      }))
      .sort(
        (left, right) =>
          Math.abs(right.underlyingEquivalentVolume) - Math.abs(left.underlyingEquivalentVolume),
      ),
    soonestExpirationTradeId,
    soonestExpirationDate,
    soonestExpirationDays,
  }
}
