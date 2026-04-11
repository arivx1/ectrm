import { useEffect, useMemo, useState } from 'react'

import { fetchJson } from '../../shared/api'
import { appConfig, bootstrapQueryLimits } from '../../shared/config'
import type { StoredAuthSession } from '../../shared/mutation'
import type {
  CounterpartyRecord,
  CurrencyRecord,
  EventRow,
  LocationRecord,
  PortfolioRecord,
  PositionRow,
  ReferenceRecord,
  Trade,
  UnitRecord,
} from '../../shared/models'
import { sessionHeaders } from './workspaceDataShared'
import type { WorkspaceBootstrapSummary } from './api'
import { classForCommodity } from '../../shared/reference'
import { tradeAggregateType, tradeStatusIsActive } from '../../shared/trading'
import { buildCounterpartyCreditRestrictionMessage } from '../../features/trades/counterpartyCredit'

type UseAppWorkspaceSummaryArgs = {
  authSession: StoredAuthSession | null
  bootstrapSummary: WorkspaceBootstrapSummary | null
  trades: Trade[]
  events: EventRow[]
  positions: PositionRow[]
  books: ReferenceRecord[]
  commodities: ReferenceRecord[]
  counterparties: CounterpartyRecord[]
  currencies: CurrencyRecord[]
  units: UnitRecord[]
  locations: LocationRecord[]
  portfolios: PortfolioRecord[]
  selectedTradeId: string | null
  setSelectedTradeId: (value: string | null) => void
  eventFilter: string
  commodityClassOrder: readonly string[]
}

export function useAppWorkspaceSummary({
  authSession,
  bootstrapSummary,
  trades,
  events,
  positions,
  books,
  commodities,
  counterparties,
  currencies,
  units,
  locations,
  portfolios,
  selectedTradeId,
  setSelectedTradeId,
  eventFilter,
  commodityClassOrder,
}: UseAppWorkspaceSummaryArgs) {
  const [storedSelectedTradeEvents, setStoredSelectedTradeEvents] = useState<EventRow[]>([])
  const knownTotalTradeCount = bootstrapSummary?.trades.total_count ?? null

  useEffect(() => {
    if (trades.length === 0) {
      if (knownTotalTradeCount === 0 && selectedTradeId !== null) {
        setSelectedTradeId(null)
      }
      return
    }

    if (selectedTradeId && trades.some((trade) => trade.trade_id === selectedTradeId)) {
      return
    }

    setSelectedTradeId(trades[0].trade_id)
  }, [knownTotalTradeCount, selectedTradeId, setSelectedTradeId, trades])

  const selectedTrade = useMemo(
    () => trades.find((trade) => trade.trade_id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  )

  useEffect(() => {
    if (!selectedTradeId) {
      return
    }

    const tradeId = selectedTradeId
    let cancelled = false

    async function loadSelectedTradeEvents() {
      try {
        const rows = await fetchJson<EventRow[]>(
          `${appConfig.apiBase}/events?aggregate_type=${tradeAggregateType}&aggregate_id=${encodeURIComponent(tradeId)}&limit=${bootstrapQueryLimits.selectedTradeEvents}`,
          authSession ? { headers: sessionHeaders(authSession) } : undefined,
        )
        if (!cancelled) {
          setStoredSelectedTradeEvents(rows)
        }
      } catch {
        if (!cancelled) {
          setStoredSelectedTradeEvents([])
        }
      }
    }

    loadSelectedTradeEvents()

    return () => {
      cancelled = true
    }
  }, [authSession, selectedTrade?.last_event_id, selectedTradeId])

  const selectedTradeEvents = selectedTradeId ? storedSelectedTradeEvents : []

  const activeBooks = useMemo(() => books.filter((book) => book.is_active), [books])
  const activeCommodities = useMemo(() => commodities.filter((commodity) => commodity.is_active), [commodities])
  const activeCounterparties = useMemo(
    () => counterparties.filter((counterparty) => counterparty.is_active),
    [counterparties],
  )
  const activeCurrencies = useMemo(() => currencies.filter((currency) => currency.is_active), [currencies])
  const activeUnits = useMemo(() => units.filter((unit) => unit.is_active), [units])
  const activeLocations = useMemo(() => locations.filter((location) => location.is_active), [locations])
  const activePortfolios = useMemo(() => portfolios.filter((portfolio) => portfolio.is_active), [portfolios])
  const hasReferenceOptions = activeBooks.length > 0 && activeCommodities.length > 0

  const activeTrades = useMemo(
    () => trades.filter((trade) => tradeStatusIsActive(trade.status)),
    [trades],
  )

  const activeTradeCount = useMemo(
    () => bootstrapSummary?.trades.active_count ?? activeTrades.length,
    [activeTrades.length, bootstrapSummary],
  )

  const totalActiveVolume = useMemo(
    () => bootstrapSummary?.trades.total_active_volume ?? activeTrades.reduce((sum, trade) => sum + (trade.volume ?? 0), 0),
    [activeTrades, bootstrapSummary],
  )

  const pricedActiveTrades = useMemo(
    () => bootstrapSummary?.trades.priced_active_count ?? activeTrades.filter((trade) => trade.price !== null).length,
    [activeTrades, bootstrapSummary],
  )

  const pendingPricingTrades = useMemo(
    () =>
      bootstrapSummary?.trades.pending_pricing_count ??
      activeTrades.filter((trade) => trade.pricing_status === 'PENDING').length,
    [activeTrades, bootstrapSummary],
  )

  const pendingSettlementTrades = useMemo(
    () =>
      bootstrapSummary?.trades.pending_settlement_count ??
      activeTrades.filter((trade) => trade.settlement_status !== 'SETTLED').length,
    [activeTrades, bootstrapSummary],
  )

  const trackedBooks = useMemo(
    () => bootstrapSummary?.trades.tracked_book_count ?? new Set(activeTrades.map((trade) => trade.book)).size,
    [activeTrades, bootstrapSummary],
  )

  const commodityClassOptions = useMemo(
    () =>
      commodityClassOrder.filter((commodityClass) =>
        activeCommodities.some((commodity) => commodity.commodity_class === commodityClass),
      ),
    [activeCommodities, commodityClassOrder],
  )

  const positionsWithClass = useMemo(
    () =>
      positions.map((position) => ({
        ...position,
        commodity_class: classForCommodity(commodities, position.commodity),
      })),
    [commodities, positions],
  )

  const positionsByClass = useMemo(() => {
    const totals = new Map<string, number>()

    for (const position of positionsWithClass) {
      const current = totals.get(position.commodity_class) ?? 0
      totals.set(position.commodity_class, current + position.net_volume)
    }

    return commodityClassOrder.map((commodityClass) => ({
      commodityClass,
      netVolume: totals.get(commodityClass) ?? 0,
    }))
  }, [commodityClassOrder, positionsWithClass])

  const pricingCoverage = useMemo(() => {
    if (activeTradeCount === 0) {
      return null
    }

    return Math.round((pricedActiveTrades / activeTradeCount) * 100)
  }, [activeTradeCount, pricedActiveTrades])

  const largestPositionRow = useMemo(
    () =>
      positionsWithClass.reduce<PositionRow | null>(
        (current, position) =>
          current === null || Math.abs(position.net_volume) > Math.abs(current.net_volume) ? position : current,
        null,
      ),
    [positionsWithClass],
  )

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'SELECTED') {
      return selectedTradeEvents
    }

    return events
  }, [eventFilter, events, selectedTradeEvents])

  function findCounterpartyCreditRestriction(counterpartyCode: string): string | null {
    const normalizedCode = counterpartyCode.trim().toUpperCase()
    if (!normalizedCode) {
      return null
    }

    return buildCounterpartyCreditRestrictionMessage(
      counterparties.find((counterparty) => counterparty.code === normalizedCode) ?? null,
    )
  }

  return {
    activeBooks,
    activeCommodities,
    activeCounterparties,
    activeCurrencies,
    activeLocations,
    activePortfolios,
    activeTradeCount,
    activeTrades,
    activeUnits,
    commodityClassOptions,
    filteredEvents,
    findCounterpartyCreditRestriction,
    hasReferenceOptions,
    largestPositionRow,
    pendingPricingTrades,
    pendingSettlementTrades,
    positionsByClass,
    positionsWithClass,
    pricedActiveTrades,
    pricingCoverage,
    selectedTrade,
    selectedTradeEvents,
    totalActiveVolume,
    trackedBooks,
  }
}
