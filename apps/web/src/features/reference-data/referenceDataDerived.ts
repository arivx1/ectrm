import { useMemo } from 'react'

import type {
  CounterpartyCreditProfileRecord,
  CounterpartyCreditReportRow,
  CounterpartyExternalCreditSnapshotRecord,
  PriceIndexRecord,
  Trade,
} from '../../shared/models'
import { tradeStatusIsActive } from '../../shared/trading'

export type TradeUsage = {
  activeTrades: number
  totalTrades: number
}

export type ChildUsage = {
  activeChildren: number
  totalChildren: number
}

function buildTradeUsageByCode(trades: Trade[], resolveCode: (trade: Trade) => string | null | undefined): Map<string, TradeUsage> {
  const usage = new Map<string, TradeUsage>()
  for (const trade of trades) {
    const code = resolveCode(trade)
    if (!code) {
      continue
    }

    const current = usage.get(code) ?? { activeTrades: 0, totalTrades: 0 }
    current.totalTrades += 1
    if (tradeStatusIsActive(trade.status)) {
      current.activeTrades += 1
    }
    usage.set(code, current)
  }
  return usage
}

function buildChildUsageByCode(
  priceIndices: PriceIndexRecord[],
  resolveCode: (priceIndex: PriceIndexRecord) => string | null | undefined,
): Map<string, ChildUsage> {
  const usage = new Map<string, ChildUsage>()
  for (const priceIndex of priceIndices) {
    const code = resolveCode(priceIndex)
    if (!code) {
      continue
    }

    const current = usage.get(code) ?? { activeChildren: 0, totalChildren: 0 }
    current.totalChildren += 1
    if (priceIndex.is_active) {
      current.activeChildren += 1
    }
    usage.set(code, current)
  }
  return usage
}

export function useReferenceDataDerivedState({
  trades,
  priceIndices,
  counterpartyCreditProfiles,
  counterpartyExternalCreditSnapshots,
  counterpartyCreditReport,
}: {
  trades: Trade[]
  priceIndices: PriceIndexRecord[]
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  counterpartyExternalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[]
  counterpartyCreditReport: CounterpartyCreditReportRow[]
}) {
  const counterpartyCreditProfileByCode = useMemo(
    () =>
      new Map(
        counterpartyCreditProfiles.map((profile) => [
          profile.counterparty_code,
          profile,
        ]),
      ),
    [counterpartyCreditProfiles],
  )

  const counterpartyCreditReportByCode = useMemo(
    () =>
      new Map(
        counterpartyCreditReport.map((row) => [
          row.counterparty_code,
          row,
        ]),
      ),
    [counterpartyCreditReport],
  )

  const counterpartyExternalCreditSnapshotsByCode = useMemo(() => {
    const grouped = new Map<string, CounterpartyExternalCreditSnapshotRecord[]>()
    for (const snapshot of counterpartyExternalCreditSnapshots) {
      const current = grouped.get(snapshot.counterparty_code) ?? []
      current.push(snapshot)
      grouped.set(snapshot.counterparty_code, current)
    }

    for (const entries of grouped.values()) {
      entries.sort((left, right) => {
        const leftTime = new Date(left.downloaded_at).getTime()
        const rightTime = new Date(right.downloaded_at).getTime()
        return rightTime - leftTime
      })
    }

    return grouped
  }, [counterpartyExternalCreditSnapshots])

  const bookUsageByCode = useMemo(
    () => buildTradeUsageByCode(trades, (trade) => trade.book),
    [trades],
  )

  const commodityUsageByCode = useMemo(
    () => buildTradeUsageByCode(trades, (trade) => trade.commodity),
    [trades],
  )

  const priceIndexUsageByCode = useMemo(
    () => buildTradeUsageByCode(trades, (trade) => trade.price_index_code),
    [trades],
  )

  const currencyUsageByCode = useMemo(
    () => buildChildUsageByCode(priceIndices, (priceIndex) => priceIndex.currency_code),
    [priceIndices],
  )

  const unitUsageByCode = useMemo(
    () => buildChildUsageByCode(priceIndices, (priceIndex) => priceIndex.unit_code),
    [priceIndices],
  )

  const locationUsageByCode = useMemo(
    () => buildChildUsageByCode(priceIndices, (priceIndex) => priceIndex.location_code),
    [priceIndices],
  )

  return {
    counterpartyCreditProfileByCode,
    counterpartyCreditReportByCode,
    counterpartyExternalCreditSnapshotsByCode,
    bookUsageByCode,
    commodityUsageByCode,
    priceIndexUsageByCode,
    currencyUsageByCode,
    unitUsageByCode,
    locationUsageByCode,
  }
}
