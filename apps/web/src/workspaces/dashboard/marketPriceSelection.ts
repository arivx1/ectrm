type DashboardTradePriceLink = {
  price_index_code: string | null
}

type DashboardPriceIndexRecord = {
  code: string
  name: string
  provider: string
  unit_code: string
  currency_code: string
  is_active: boolean
}

const MAX_PRICE_CANDIDATES = 8

export function selectPriceIndexCandidates(
  activeTrades: DashboardTradePriceLink[],
  priceIndices: DashboardPriceIndexRecord[],
): DashboardPriceIndexRecord[] {
  const activeIndexMap = new Map(
    priceIndices.filter((priceIndex) => priceIndex.is_active).map((priceIndex) => [priceIndex.code, priceIndex]),
  )
  const activityByCode = new Map<string, number>()

  for (const trade of activeTrades) {
    if (!trade.price_index_code) {
      continue
    }

    const nextCount = (activityByCode.get(trade.price_index_code) ?? 0) + 1
    activityByCode.set(trade.price_index_code, nextCount)
  }

  const selected: DashboardPriceIndexRecord[] = []
  const seenCodes = new Set<string>()

  const rankedTradeCodes = [...activityByCode.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([code]) => code)

  for (const code of rankedTradeCodes) {
    const priceIndex = activeIndexMap.get(code)
    if (!priceIndex || seenCodes.has(priceIndex.code)) {
      continue
    }

    selected.push(priceIndex)
    seenCodes.add(priceIndex.code)
  }

  const fallbacks = [...activeIndexMap.values()].sort((left, right) => {
    const providerCompare = left.provider.localeCompare(right.provider)
    if (providerCompare !== 0) {
      return providerCompare
    }

    return left.name.localeCompare(right.name)
  })

  for (const priceIndex of fallbacks) {
    if (seenCodes.has(priceIndex.code)) {
      continue
    }

    selected.push(priceIndex)
    seenCodes.add(priceIndex.code)

    if (selected.length >= MAX_PRICE_CANDIDATES) {
      break
    }
  }

  return selected.slice(0, MAX_PRICE_CANDIDATES)
}
