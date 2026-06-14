import type { ViewKey } from '../../shared/models'

type DashboardMonitorTrade = {
  commodity_class: string
  price: number | null
  volume: number | null
  price_index_code: string | null
}

type DashboardMonitorExposureBucket = {
  commodityClass: string
  unitLabel: string
  netVolume: number
  commodityCount: number
}

type DashboardMonitorIssue = {
  label: string
  count: number
  detail: string
  tone: 'active' | 'blocked'
  destinationView: ViewKey
}

type DashboardMonitorEvent = {
  recorded_at: string
}

export type DashboardMarketMonitorFocusRow = {
  commodityClass: string
  tradeCount: number
  pricedTradeCount: number
  linkedPriceIndexCount: number
  commodityCount: number
  leadExposureNetVolume: number | null
  leadExposureUnitLabel: string | null
}

export type DashboardMarketMonitorSummary = {
  activeTradeCount: number
  pricedTradeCount: number
  pricedTradeCoveragePercent: number | null
  eventCount: number
  issueCount: number
  positionBucketCount: number
  latestEventAt: string | null
  focusRows: DashboardMarketMonitorFocusRow[]
  priorityRows: DashboardMonitorIssue[]
}

export function buildDashboardMarketMonitorSummary({
  activeTrades,
  exposureByClass,
  issues,
  events,
}: {
  activeTrades: DashboardMonitorTrade[]
  exposureByClass: DashboardMonitorExposureBucket[]
  issues: DashboardMonitorIssue[]
  events: DashboardMonitorEvent[]
}): DashboardMarketMonitorSummary {
  const tradeCountByClass = new Map<
    string,
    {
      tradeCount: number
      pricedTradeCount: number
      linkedPriceIndices: Set<string>
    }
  >()

  for (const trade of activeTrades) {
    const current = tradeCountByClass.get(trade.commodity_class) ?? {
      tradeCount: 0,
      pricedTradeCount: 0,
      linkedPriceIndices: new Set<string>(),
    }

    current.tradeCount += 1
    if (trade.price !== null && trade.volume !== null) {
      current.pricedTradeCount += 1
    }
    if (trade.price_index_code) {
      current.linkedPriceIndices.add(trade.price_index_code)
    }

    tradeCountByClass.set(trade.commodity_class, current)
  }

  const exposureByClassMap = new Map<
    string,
    {
      commodityCount: number
      leadExposureNetVolume: number | null
      leadExposureUnitLabel: string | null
    }
  >()

  for (const row of exposureByClass) {
    const current = exposureByClassMap.get(row.commodityClass) ?? {
      commodityCount: 0,
      leadExposureNetVolume: null,
      leadExposureUnitLabel: null,
    }

    current.commodityCount += row.commodityCount
    if (
      current.leadExposureNetVolume === null ||
      Math.abs(row.netVolume) > Math.abs(current.leadExposureNetVolume)
    ) {
      current.leadExposureNetVolume = row.netVolume
      current.leadExposureUnitLabel = row.unitLabel
    }

    exposureByClassMap.set(row.commodityClass, current)
  }

  const focusCommodityClasses = new Set<string>([
    ...tradeCountByClass.keys(),
    ...exposureByClassMap.keys(),
  ])

  const focusRows = [...focusCommodityClasses]
    .map<DashboardMarketMonitorFocusRow>((commodityClass) => {
      const tradeSummary = tradeCountByClass.get(commodityClass)
      const exposureSummary = exposureByClassMap.get(commodityClass)
      return {
        commodityClass,
        tradeCount: tradeSummary?.tradeCount ?? 0,
        pricedTradeCount: tradeSummary?.pricedTradeCount ?? 0,
        linkedPriceIndexCount: tradeSummary?.linkedPriceIndices.size ?? 0,
        commodityCount: exposureSummary?.commodityCount ?? 0,
        leadExposureNetVolume: exposureSummary?.leadExposureNetVolume ?? null,
        leadExposureUnitLabel: exposureSummary?.leadExposureUnitLabel ?? null,
      }
    })
    .sort((left, right) => {
      if (right.tradeCount !== left.tradeCount) {
        return right.tradeCount - left.tradeCount
      }

      const rightExposure = Math.abs(right.leadExposureNetVolume ?? 0)
      const leftExposure = Math.abs(left.leadExposureNetVolume ?? 0)
      if (rightExposure !== leftExposure) {
        return rightExposure - leftExposure
      }

      if (right.pricedTradeCount !== left.pricedTradeCount) {
        return right.pricedTradeCount - left.pricedTradeCount
      }

      return left.commodityClass.localeCompare(right.commodityClass)
    })

  const priorityRows = [...issues]
    .filter((issue) => issue.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))

  const pricedTradeCount = activeTrades.filter(
    (trade) => trade.price !== null && trade.volume !== null,
  ).length
  const activeTradeCount = activeTrades.length
  const latestEventAt =
    events
      .map((event) => event.recorded_at)
      .filter((value) => value.trim() !== '')
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null

  return {
    activeTradeCount,
    pricedTradeCount,
    pricedTradeCoveragePercent:
      activeTradeCount > 0 ? Math.round((pricedTradeCount / activeTradeCount) * 100) : null,
    eventCount: events.length,
    issueCount: issues.reduce((sum, issue) => sum + issue.count, 0),
    positionBucketCount: exposureByClass.length,
    latestEventAt,
    focusRows,
    priorityRows,
  }
}
