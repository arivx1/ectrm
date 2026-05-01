import { useMemo, useState } from 'react'

import { useLatestPriceIndexMarks } from '../../entities/market-data/useLatestPriceIndexMarks'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import { formatCurrencyAmount } from '../../shared/format'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import { buildUnitLabelByCommodityClass, normalizeUnitLabel, summarizeUnitLabels } from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileSectionGrid, type TileSectionGridItem } from '../../shared/ui/TileSectionGrid'
import { TileLayout } from '../../shared/ui/TileLayout'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import {
  buildOpenOptionActionQueue,
  buildOpenOptionValuationSummary,
  buildOptionExposureSummary,
  buildOptionSettlementSummary,
  type OpenOptionValuation,
  type OptionSettlementValuation,
} from '../../shared/optionExposure'
import type { OptionExposureRow, Trade } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import type { OptionLifecycleEventType } from '../../shared/trading'

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

type RiskWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff?: AppRouteHandoff | null
  globalFilter: string
  trades: Trade[]
  activeTrades: Trade[]
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  positionsWithClass: PositionRow[]
  optionExposures: OptionExposureRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
  onOptionLifecycleEvent: (tradeId: string, eventType: OptionLifecycleEventType) => Promise<void>
  optionLifecycleSubmittingEvent: OptionLifecycleEventType | null
  optionLifecycleSubmittingTradeId: string | null
}

function absoluteVolume(value: number | null): number {
  return Math.abs(value ?? 0)
}

function cashflowSummaryLabel(
  value: number,
  formatMoney: RiskWorkspaceProps['formatMoney'],
): string {
  if (value > 0) {
    return `Paid ${formatMoney(Math.abs(value))}`
  }
  if (value < 0) {
    return `Received ${formatMoney(Math.abs(value))}`
  }
  return formatMoney(0)
}

function effectiveUnitPriceLabel(
  valuation: OptionSettlementValuation,
): string {
  if (valuation.effectiveUnitPrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.effectiveUnitPrice, valuation.referenceCurrencyCode)} ${
    (valuation.underlyingDirection ?? 'BUY').trim().toUpperCase() === 'SELL' ? 'received/unit' : 'paid/unit'
  }`
}

function referenceMarkLabel(
  valuation: OptionSettlementValuation,
): string {
  if (valuation.referencePrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.referencePrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function markToMarketLabel(
  value: number | null,
  currencyCode: string | null | undefined,
): string {
  if (value === null) {
    return '—'
  }
  if (value > 0) {
    return `Gain ${formatCurrencyAmount(Math.abs(value), currencyCode)}`
  }
  if (value < 0) {
    return `Loss ${formatCurrencyAmount(Math.abs(value), currencyCode)}`
  }
  return formatCurrencyAmount(0, currencyCode)
}

function valuationStatusTone(
  valuation: OptionSettlementValuation,
): 'active' | 'blocked' {
  return valuation.markStatus === 'VALUED' ? 'active' : 'blocked'
}

function valuationStatusLabel(
  valuation: OptionSettlementValuation,
): string {
  if (valuation.markStatus === 'VALUED') {
    return valuation.moneyness
      ? `${valuation.moneyness} @ ${referenceMarkLabel(valuation)}`
      : `Marked @ ${referenceMarkLabel(valuation)}`
  }
  if (valuation.markStatus === 'UNPRICED_MISSING_PRICE_INDEX') {
    return 'No Price Index'
  }
  return 'Awaiting Mark'
}

function openOptionReferenceMarkLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.referencePrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.referencePrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionValuationStatusTone(
  valuation: OpenOptionValuation,
): 'active' | 'blocked' {
  return valuation.markStatus === 'VALUED' ? 'active' : 'blocked'
}

function openOptionValuationStatusLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.markStatus === 'VALUED') {
    return valuation.moneyness
      ? `${valuation.moneyness} @ ${openOptionReferenceMarkLabel(valuation)}`
      : `Marked @ ${openOptionReferenceMarkLabel(valuation)}`
  }
  if (valuation.markStatus === 'UNPRICED_MISSING_PRICE_INDEX') {
    return 'No Price Index'
  }
  return 'Awaiting Mark'
}

function openOptionIntrinsicExposureLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.intrinsicExposure === null) {
    return '—'
  }
  if (valuation.intrinsicExposure < 0) {
    return `Liability ${formatCurrencyAmount(Math.abs(valuation.intrinsicExposure), valuation.referenceCurrencyCode)}`
  }
  if (valuation.intrinsicExposure > 0) {
    return `Value ${formatCurrencyAmount(valuation.intrinsicExposure, valuation.referenceCurrencyCode)}`
  }
  return formatCurrencyAmount(0, valuation.referenceCurrencyCode)
}

function openOptionBreakEvenLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.breakEvenPrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.breakEvenPrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionExpiryPnlLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.expiryPnlAtMark === null) {
    return '—'
  }
  if (valuation.expiryPnlAtMark > 0) {
    return `Gain ${formatCurrencyAmount(Math.abs(valuation.expiryPnlAtMark), valuation.referenceCurrencyCode)}`
  }
  if (valuation.expiryPnlAtMark < 0) {
    return `Loss ${formatCurrencyAmount(Math.abs(valuation.expiryPnlAtMark), valuation.referenceCurrencyCode)}`
  }
  return 'Break-even'
}

function openOptionExpiryStateLabel(
  valuation: OpenOptionValuation,
): string {
  switch (valuation.expiryState) {
    case 'PAST_EXPIRY_UNRESOLVED':
      return 'Past expiry unresolved'
    case 'EXPIRING_TODAY':
      return 'Expiring today'
    case 'EXPIRING_SOON':
      return 'Expiring soon'
    default:
      return 'Open'
  }
}

function optionLifecycleActionLabel(action: OptionLifecycleEventType): string {
  switch (action) {
    case 'OptionExercised':
      return 'Exercise'
    case 'OptionAssigned':
      return 'Assign'
    case 'OptionExpired':
      return 'Expire'
  }
}

function optionLifecyclePendingLabel(action: OptionLifecycleEventType): string {
  switch (action) {
    case 'OptionExercised':
      return 'Exercising...'
    case 'OptionAssigned':
      return 'Assigning...'
    case 'OptionExpired':
      return 'Expiring...'
  }
}

function matchesRiskTradeFilter(trade: Trade, query: string): boolean {
  return matchesTextFilter(query, [
    trade.trade_id,
    trade.book,
    trade.portfolio,
    trade.counterparty,
    trade.commodity_class,
    trade.commodity,
    trade.trade_side,
    trade.instrument_type,
    trade.option_type,
    trade.option_style,
    trade.price_index_code,
    trade.pricing_status,
    trade.settlement_status,
    trade.status,
  ])
}

function matchesRiskPositionFilter(position: PositionRow, relatedTrades: Trade[], query: string): boolean {
  return matchesTextFilter(query, [
    position.commodity,
    position.commodity_class,
    position.updated_at,
    ...relatedTrades.flatMap((trade) => [
      trade.trade_id,
      trade.book,
      trade.portfolio,
      trade.counterparty,
      trade.status,
    ]),
  ])
}

function matchesRiskOptionExposureFilter(exposure: OptionExposureRow, query: string): boolean {
  return matchesTextFilter(query, [
    exposure.trade_id,
    exposure.book,
    exposure.portfolio,
    exposure.counterparty,
    exposure.commodity_class,
    exposure.commodity,
    exposure.trade_side,
    exposure.option_type,
    exposure.option_style,
    exposure.option_expiration_date,
    exposure.trade_currency_code,
    exposure.price_unit_code,
  ])
}

export function RiskWorkspace({
  authSession,
  globalFilter,
  trades,
  activeTrades,
  positionsByClass,
  positionsWithClass,
  optionExposures,
  formatCommodityClass,
  formatNumber,
  formatMoney,
  formatDate,
  formatDateOnly,
  onOpenTrade,
  onOptionLifecycleEvent,
  optionLifecycleSubmittingEvent,
  optionLifecycleSubmittingTradeId,
}: RiskWorkspaceProps) {
  const [screenFilter, setScreenFilter] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)
  const directlyMatchedTrades = useMemo(
    () => trades.filter((trade) => matchesRiskTradeFilter(trade, effectiveScreenFilter)),
    [effectiveScreenFilter, trades],
  )
  const directlyMatchedOptionExposures = useMemo(
    () => optionExposures.filter((exposure) => matchesRiskOptionExposureFilter(exposure, effectiveScreenFilter)),
    [effectiveScreenFilter, optionExposures],
  )
  const visibleTradeIds = useMemo(
    () =>
      new Set([
        ...directlyMatchedTrades.map((trade) => trade.trade_id),
        ...directlyMatchedOptionExposures.map((exposure) => exposure.trade_id),
      ]),
    [directlyMatchedOptionExposures, directlyMatchedTrades],
  )
  const visibleTrades = useMemo(
    () => trades.filter((trade) => visibleTradeIds.has(trade.trade_id)),
    [trades, visibleTradeIds],
  )
  const visibleActiveTrades = useMemo(
    () => activeTrades.filter((trade) => visibleTradeIds.has(trade.trade_id)),
    [activeTrades, visibleTradeIds],
  )
  const visiblePositionRows = useMemo(
    () =>
      positionsWithClass.filter((position) => {
        const relatedTrades = visibleActiveTrades.filter(
          (trade) => trade.commodity === position.commodity && trade.commodity_class === position.commodity_class,
        )
        return matchesRiskPositionFilter(position, relatedTrades, effectiveScreenFilter)
      }),
    [effectiveScreenFilter, positionsWithClass, visibleActiveTrades],
  )
  const visiblePositionsByClass = useMemo(() => {
    const visiblePositionClasses = new Set(visiblePositionRows.map((position) => position.commodity_class))
    const totals = new Map<string, number>()
    for (const position of visiblePositionRows) {
      totals.set(position.commodity_class, (totals.get(position.commodity_class) ?? 0) + position.net_volume)
    }

    return positionsByClass
      .filter((row) => visiblePositionClasses.has(row.commodityClass))
      .map((row) => ({
        commodityClass: row.commodityClass,
        netVolume: totals.get(row.commodityClass) ?? 0,
      }))
  }, [positionsByClass, visiblePositionRows])
  const visibleOptionExposures = useMemo(
    () => optionExposures.filter((exposure) => visibleTradeIds.has(exposure.trade_id)),
    [optionExposures, visibleTradeIds],
  )
  const linearActiveTrades = visibleActiveTrades.filter((trade) => trade.instrument_type !== 'OPTION')
  const activeOptionTrades = visibleActiveTrades.filter((trade) => trade.instrument_type === 'OPTION')
  const {
    latestMarksByCode,
    loading: latestMarksLoading,
    error: latestMarksError,
  } = useLatestPriceIndexMarks(
    visibleTrades
      .filter((trade) => trade.instrument_type === 'OPTION' || trade.originating_option_trade_id !== null)
      .map((trade) => trade.price_index_code),
  )
  const grossExposure = visiblePositionRows.reduce((total, position) => total + Math.abs(position.net_volume), 0)
  const pricedTradeCount = visibleActiveTrades.filter((trade) => trade.pricing_status === 'PRICED').length
  const pricingCoverage =
    visibleActiveTrades.length > 0 ? Math.round((pricedTradeCount / visibleActiveTrades.length) * 100) : null
  const optionExposureSummary = buildOptionExposureSummary(visibleOptionExposures)
  const openOptionValuationSummary = buildOpenOptionValuationSummary(activeOptionTrades, latestMarksByCode)
  const openOptionActionQueue = buildOpenOptionActionQueue(activeOptionTrades, latestMarksByCode)
  const optionSettlementSummary = buildOptionSettlementSummary(visibleTrades, latestMarksByCode)
  const tradesById = new Map(visibleTrades.map((trade) => [trade.trade_id, trade] as const))
  const linearUnitLabelsByClass = buildUnitLabelByCommodityClass(linearActiveTrades)
  const optionUnitLabelsByClass = buildUnitLabelByCommodityClass(activeOptionTrades)
  const grossLinearExposureUnitLabel = summarizeUnitLabels(linearActiveTrades.map((trade) => trade.unit_of_measure))
  const netOptionExposureUnitLabel = summarizeUnitLabels(activeOptionTrades.map((trade) => trade.unit_of_measure))
  const pricingAttentionTrades = [...visibleActiveTrades]
    .filter((trade) => trade.pricing_status !== 'PRICED')
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  const largestExposureClass = visiblePositionsByClass.reduce<{ commodityClass: string; netVolume: number } | null>(
    (largest, row) =>
      largest === null || Math.abs(row.netVolume) > Math.abs(largest.netVolume) ? row : largest,
    null,
  )
  const largestLinearTrade = linearActiveTrades.reduce<Trade | null>(
    (largest, trade) =>
      largest === null || absoluteVolume(trade.volume) > absoluteVolume(largest.volume) ? trade : largest,
    null,
  )
  const linearBookConcentration = [...linearActiveTrades].reduce<
    Array<{ book: string; tradeCount: number; grossVolume: number; pricedNotional: number }>
  >((rows, trade) => {
    const existing = rows.find((row) => row.book === trade.book)
    const nextNotional = trade.price !== null && trade.volume !== null ? Math.abs(trade.price * trade.volume) : 0

    if (existing) {
      existing.tradeCount += 1
      existing.grossVolume += absoluteVolume(trade.volume)
      existing.pricedNotional += nextNotional
      return rows
    }

    rows.push({
      book: trade.book,
      tradeCount: 1,
      grossVolume: absoluteVolume(trade.volume),
      pricedNotional: nextNotional,
    })
    return rows
  }, [])
  linearBookConcentration.sort((left, right) => right.grossVolume - left.grossVolume)

  const optionBookConcentration = visibleOptionExposures.reduce<
    Array<{
      book: string
      tradeCount: number
      grossContracts: number
      netUnderlyingEquivalentVolume: number
      grossPremiumAtRisk: number
    }>
  >((rows, row) => {
    const existing = rows.find((candidate) => candidate.book === row.book)
    if (existing) {
      existing.tradeCount += 1
      existing.grossContracts += Math.abs(row.contract_volume)
      existing.netUnderlyingEquivalentVolume += row.underlying_equivalent_volume
      existing.grossPremiumAtRisk += Math.abs(row.premium_cashflow ?? 0)
      return rows
    }

    rows.push({
      book: row.book,
      tradeCount: 1,
      grossContracts: Math.abs(row.contract_volume),
      netUnderlyingEquivalentVolume: row.underlying_equivalent_volume,
      grossPremiumAtRisk: Math.abs(row.premium_cashflow ?? 0),
    })
    return rows
  }, [])
  optionBookConcentration.sort((left, right) => right.grossContracts - left.grossContracts)
  const markedOptionSettlementCount = optionSettlementSummary.valuations.filter(
    (valuation) => valuation.markStatus === 'VALUED',
  ).length
  const largestLinearClassUnitLabel = largestExposureClass
    ? linearUnitLabelsByClass.get(largestExposureClass.commodityClass) ?? 'Unit TBD'
    : null
  const settledUnderlyingUnitLabel = summarizeUnitLabels(
    optionSettlementSummary.valuations.map(
      (valuation) => tradesById.get(valuation.linkedTradeId)?.unit_of_measure,
    ),
  )
  const netPackageMarkToMarket = optionSettlementSummary.valuations.reduce(
    (sum, valuation) => sum + (valuation.packageMarkToMarket ?? 0),
    0,
  )
  const riskSummaryCards: TileSectionGridItem[] = [
    {
      id: 'gross-linear-exposure',
      title: 'Gross Linear Exposure',
      content: (
        <>
          <span>Gross Linear Exposure</span>
          <MetricValue value={formatNumber(grossExposure, 0)} unit={grossLinearExposureUnitLabel} />
          <p>Absolute net volume across every currently projected commodity row.</p>
        </>
      ),
    },
    {
      id: 'pricing-coverage',
      title: 'Pricing Coverage',
      content: (
        <>
          <span>Pricing Coverage</span>
          <strong>{pricingCoverage === null ? '—' : `${pricingCoverage}%`}</strong>
          <p>
            {pricedTradeCount} of {visibleActiveTrades.length} active trade
            {visibleActiveTrades.length === 1 ? '' : 's'} are fully marked as priced.
          </p>
        </>
      ),
    },
    {
      id: 'largest-linear-class',
      title: 'Largest Linear Class',
      content: (
        <>
          <span>Largest Linear Class</span>
          {largestExposureClass && largestLinearClassUnitLabel ? (
            <MetricValue value={formatNumber(largestExposureClass.netVolume, 0)} unit={largestLinearClassUnitLabel} />
          ) : (
            <strong>—</strong>
          )}
          <p>
            {largestExposureClass
              ? `${formatCommodityClass(largestExposureClass.commodityClass)} is the biggest class-level concentration by absolute linear exposure.`
              : 'Class-level linear exposure will appear as positions are projected.'}
          </p>
        </>
      ),
    },
    {
      id: 'largest-linear-ticket',
      title: 'Largest Linear Ticket',
      content: (
        <>
          <span>Largest Linear Ticket</span>
          {largestLinearTrade ? (
            <MetricValue
              value={`${largestLinearTrade.trade_id} · ${formatNumber(absoluteVolume(largestLinearTrade.volume), 0)}`}
              unit={normalizeUnitLabel(largestLinearTrade.unit_of_measure)}
            />
          ) : (
            <strong>—</strong>
          )}
          <p>
            {largestLinearTrade
              ? `${largestLinearTrade.commodity} in ${largestLinearTrade.book} currently carries the largest linear ticket volume.`
              : 'No open linear trade ticket is available yet.'}
          </p>
        </>
      ),
    },
    {
      id: 'open-option-tickets',
      title: 'Open Option Tickets',
      content: (
        <>
          <span>Open Option Tickets</span>
          <strong>{formatNumber(optionExposureSummary.optionCount, 0)}</strong>
          <p>Active option trades currently represented in the dedicated optionality projection.</p>
        </>
      ),
    },
    {
      id: 'net-option-delta-proxy',
      title: 'Net Option Delta Proxy',
      content: (
        <>
          <span>Net Option Delta Proxy</span>
          <MetricValue
            value={formatNumber(optionExposureSummary.netUnderlyingEquivalentVolume, 0)}
            unit={netOptionExposureUnitLabel}
          />
          <p>A simple underlying-equivalent direction view based on trade side, call-put, and contracts.</p>
        </>
      ),
    },
    {
      id: 'premium-at-risk',
      title: 'Premium at Risk',
      content: (
        <>
          <span>Premium at Risk</span>
          <strong>{formatMoney(optionExposureSummary.grossPremiumAtRisk)}</strong>
          <p>Absolute premium cashflow proxy across currently open option tickets.</p>
        </>
      ),
    },
    {
      id: 'marked-open-options',
      title: 'Marked Open Options',
      content: (
        <>
          <span>Marked Open Options</span>
          <strong>{`${formatNumber(openOptionValuationSummary.markedCount, 0)} / ${formatNumber(openOptionValuationSummary.optionCount, 0)}`}</strong>
          <p>Open option tickets that already have a live linked reference mark available.</p>
        </>
      ),
    },
    {
      id: 'itm-open-options',
      title: 'ITM Open Options',
      content: (
        <>
          <span>ITM Open Options</span>
          <strong>{formatNumber(openOptionValuationSummary.inTheMoneyCount, 0)}</strong>
          <p>Active option tickets currently in the money on the latest linked market mark.</p>
        </>
      ),
    },
    {
      id: 'profitable-at-mark',
      title: 'Profitable at Mark',
      content: (
        <>
          <span>Profitable at Mark</span>
          <strong>{formatNumber(openOptionValuationSummary.profitableCount, 0)}</strong>
          <p>Open options whose expiry payoff currently clears premium cost at the live mark.</p>
        </>
      ),
    },
    {
      id: 'expiry-alerts',
      title: 'Expiry Alerts',
      content: (
        <>
          <span>Expiry Alerts</span>
          <strong>{formatNumber(openOptionActionQueue.length, 0)}</strong>
          <p>Open options inside the expiry management window or already past expiry.</p>
        </>
      ),
    },
    {
      id: 'booked-option-pairs',
      title: 'Booked Option Pairs',
      content: (
        <>
          <span>Booked Option Pairs</span>
          <strong>{formatNumber(optionSettlementSummary.pairCount, 0)}</strong>
          <p>Closed exercised or assigned options that already have a linked resulting underlying trade.</p>
        </>
      ),
    },
    {
      id: 'net-package-cashflow',
      title: 'Net Package Cashflow',
      content: (
        <>
          <span>Net Package Cashflow</span>
          <strong>{cashflowSummaryLabel(optionSettlementSummary.netPackageCashflow, formatMoney)}</strong>
          <p>Premium plus linked underlying booking cashflow across the currently linked option settlement pairs.</p>
        </>
      ),
    },
    {
      id: 'next-option-expiry',
      title: 'Next Option Expiry',
      content: (
        <>
          <span>Next Option Expiry</span>
          <strong>
            {optionExposureSummary.soonestExpirationTradeId
              ? `${optionExposureSummary.soonestExpirationTradeId} · ${optionExposureSummary.soonestExpirationDays}d`
              : '—'}
          </strong>
          <p>
            {optionExposureSummary.soonestExpirationTradeId
              ? `Expires ${formatDateOnly(optionExposureSummary.soonestExpirationDate)} and should be reviewed first for exercise, expiry, or roll decisions.`
              : 'No active option expiry is currently loaded.'}
          </p>
        </>
      ),
    },
  ]

  return (
    <TileLayout
      workspaceId="risk"
      workspaceLabel="Risk"
      authSession={authSession}
      headerContent={
        <WorkspaceLocalFilterBar
          value={screenFilter}
          onChange={setScreenFilter}
          placeholder="Trade ID, commodity, class, book, counterparty, or option style"
          description="Focus this risk screen locally so you can narrow exposure analysis without changing any other workspace."
          totalCount={trades.length + positionsWithClass.length + optionExposures.length}
          matchedCount={visibleTrades.length + visiblePositionRows.length + visibleOptionExposures.length}
          resultLabel="risk records"
          globalValue={globalFilter}
        />
      }
      sections={[
        {
          id: 'risk-summary-cards',
          itemIds: riskSummaryCards.map((card) => card.id),
        },
      ]}
      tiles={[
        {
          id: 'risk-summary',
          eyebrow: 'Snapshot',
          title: 'Risk Snapshot',
          description: 'Keep linear exposure and option delta-proxy risk visible side by side without mixing barrels and contracts.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            visibleActiveTrades.length > 0 || visiblePositionRows.length > 0 || visibleOptionExposures.length > 0 ? (
              <TileSectionGrid sectionId="risk-summary-cards" items={riskSummaryCards} />
            ) : (
              <div className="empty-state">
                <strong>No risk surface yet</strong>
                <p>Book a trade to populate exposure, pricing attention, and option expiry decisions here.</p>
              </div>
            ),
        },
        {
          id: 'risk-exposure',
          eyebrow: 'Concentration',
          title: 'Exposure by Class',
          description: 'Read linear net exposure first, then compare the option delta proxy by commodity class.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: visiblePositionsByClass.length > 0 || optionExposureSummary.exposureByClass.length > 0 ? (
            <div className="detail-list">
              <div>
                <strong>Linear Net Exposure</strong>
                {visiblePositionsByClass.length > 0 ? (
                  <div className="position-class-grid">
                    {visiblePositionsByClass.map((row) => (
                      <article key={row.commodityClass} className="position-class-card">
                        <span>{formatCommodityClass(row.commodityClass)}</span>
                        <MetricValue
                          value={formatNumber(row.netVolume, 0)}
                          unit={linearUnitLabelsByClass.get(row.commodityClass) ?? 'Unit TBD'}
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No linear positions are currently projected.</p>
                )}
              </div>
              <div>
                <strong>Option Underlying-Equivalent Exposure</strong>
                {optionExposureSummary.exposureByClass.length > 0 ? (
                  <div className="position-class-grid">
                    {optionExposureSummary.exposureByClass.map((row) => (
                      <article key={row.commodityClass} className="position-class-card">
                        <span>{formatCommodityClass(row.commodityClass)}</span>
                        <MetricValue
                          value={formatNumber(row.underlyingEquivalentVolume, 0)}
                          unit={optionUnitLabelsByClass.get(row.commodityClass) ?? 'Unit TBD'}
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No option delta-proxy exposure is currently projected.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No grouped exposure</strong>
              <p>Linear and option rollups appear once open trades project into positions or option-equivalent exposure.</p>
            </div>
          ),
        },
        {
          id: 'risk-pricing',
          eyebrow: 'Attention',
          title: pricingAttentionTrades.length > 0 ? 'Pricing and Marking Attention' : 'Pricing is in line',
          description: 'The fastest way to spot risk rows still waiting on price discovery or mark resolution.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: pricingAttentionTrades.length > 0 ? (
            <div className="position-list">
              {pricingAttentionTrades.slice(0, 8).map((trade) => (
                <article key={trade.trade_id} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{trade.trade_id}</strong>
                      <span>
                        {trade.commodity} • {trade.book}
                      </span>
                    </div>
                    <span className="status-pill status-pill-blocked">{trade.pricing_status}</span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">{trade.pricing_type}</span>
                    <span className="entity-chip entity-chip-soft">{trade.trade_side ?? 'LEG-DEFINED'}</span>
                    <span className="entity-chip entity-chip-soft">
                      {trade.instrument_type === 'OPTION' ? 'Contracts' : 'Volume'} {formatNumber(trade.volume, 0)}
                    </span>
                  </div>
                  <div className="shipment-card-actions">
                    <span>Updated {formatDate(trade.updated_at)}</span>
                    <button type="button" className="button button-ghost" onClick={() => onOpenTrade(trade.trade_id)}>
                      Open Trade
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No pricing exceptions</strong>
              <p>The active trade set is fully marked as priced right now.</p>
            </div>
          ),
        },
        {
          id: 'risk-option-expiry-queue',
          eyebrow: 'Decisions',
          title: openOptionActionQueue.length > 0 ? 'Option Expiry Queue' : 'No option expiry queue',
          description: 'Prioritize active options that are nearing expiry, on expiry day, or still open past expiry with direct lifecycle actions.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: openOptionActionQueue.length > 0 ? (
            <div className="detail-list">
              {latestMarksError ? (
                <p className="field-error">Live marks unavailable: {latestMarksError}</p>
              ) : latestMarksLoading ? (
                <p className="form-note">Refreshing latest price index marks for the option expiry queue.</p>
              ) : null}
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Past Expiry</span>
                  <strong>{formatNumber(openOptionValuationSummary.pastExpiryCount, 0)}</strong>
                  <p>Options whose expiration date has passed but still remain active in the trade projection.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Expiring Today</span>
                  <strong>{formatNumber(openOptionValuationSummary.expiringTodayCount, 0)}</strong>
                  <p>Open options that need a same-day lifecycle decision on the current desk date.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Expiring Soon</span>
                  <strong>{formatNumber(openOptionValuationSummary.expiringSoonCount, 0)}</strong>
                  <p>Open options inside the five-day expiry watch window.</p>
                </article>
              </div>
              <div className="position-list">
                {openOptionActionQueue.slice(0, 8).map((valuation) => (
                  <article key={valuation.tradeId} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{valuation.tradeId}</strong>
                        <span>
                          {valuation.commodity} • {valuation.book} • {valuation.tradeSide ?? 'BUY'} {valuation.optionType ?? 'CALL'}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${valuation.decisionTone}`}>
                        {valuation.decisionLabel}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">{openOptionExpiryStateLabel(valuation)}</span>
                      <span className="entity-chip entity-chip-soft">
                        {valuation.optionStyle ?? 'AMERICAN'} • {valuation.moneyness ?? 'Unmarked'}
                      </span>
                      {valuation.daysToExpiration !== null ? (
                        <span className="entity-chip entity-chip-soft">{valuation.daysToExpiration}d to expiry</span>
                      ) : null}
                      {valuation.referencePriceIndexCode ? (
                        <span className="entity-chip entity-chip-soft">{valuation.referencePriceIndexCode}</span>
                      ) : null}
                    </div>
                    <div className="shipment-card-copy">
                      <p>{valuation.decisionReason}</p>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">
                        Strike {formatCurrencyAmount(valuation.strikePrice, valuation.referenceCurrencyCode)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Live mark {openOptionReferenceMarkLabel(valuation)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Break-even {openOptionBreakEvenLabel(valuation)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Expiry P&L {openOptionExpiryPnlLabel(valuation)}
                      </span>
                    </div>
                    <div className="shipment-card-actions">
                      <span>Updated {formatDate(valuation.updatedAt)}</span>
                      <div className="workflow-item-button-row">
                        {valuation.availableActions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            className="button button-secondary"
                            onClick={() => void onOptionLifecycleEvent(valuation.tradeId, action)}
                            disabled={!authSession || optionLifecycleSubmittingTradeId !== null}
                          >
                            {optionLifecycleSubmittingTradeId === valuation.tradeId &&
                            optionLifecycleSubmittingEvent === action
                              ? optionLifecyclePendingLabel(action)
                              : optionLifecycleActionLabel(action)}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => onOpenTrade(valuation.tradeId)}
                          disabled={optionLifecycleSubmittingTradeId !== null}
                        >
                          Open Option
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No expiry alerts</strong>
              <p>Active options inside the five-day window, on expiry day, or past expiry will appear here.</p>
            </div>
          ),
        },
        {
          id: 'risk-open-option-marks',
          eyebrow: 'Optionality',
          title: openOptionValuationSummary.optionCount > 0 ? 'Live Open Option Marks' : 'No open option marks',
          description: 'Read the latest underlying mark, moneyness, and intrinsic exposure for active options before exercise, assignment, expiry, or roll decisions.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: openOptionValuationSummary.optionCount > 0 ? (
            <div className="detail-list">
              {latestMarksError ? (
                <p className="field-error">Live marks unavailable: {latestMarksError}</p>
              ) : latestMarksLoading ? (
                <p className="form-note">Refreshing latest price index marks for active options.</p>
              ) : null}
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Marked Tickets</span>
                  <strong>{formatNumber(openOptionValuationSummary.markedCount, 0)}</strong>
                  <p>Open options with a latest linked market observation available right now.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Awaiting Marks</span>
                  <strong>{formatNumber(openOptionValuationSummary.awaitingMarkCount, 0)}</strong>
                  <p>Open options still missing a price index link or a fresh market observation.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>ITM Tickets</span>
                  <strong>{formatNumber(openOptionValuationSummary.inTheMoneyCount, 0)}</strong>
                  <p>Active options currently in the money on the latest linked underlying mark.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Gross Intrinsic Exposure</span>
                  <strong>{formatMoney(openOptionValuationSummary.grossIntrinsicExposure)}</strong>
                  <p>Absolute intrinsic exposure proxy across the currently open option book.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Net Expiry P&L @ Mark</span>
                  <strong>{formatMoney(openOptionValuationSummary.netExpiryPnlAtMark)}</strong>
                  <p>Premium-adjusted expiry payoff proxy if current underlying marks held through expiry.</p>
                </article>
              </div>
              <div className="position-list">
                {openOptionValuationSummary.valuations.slice(0, 6).map((valuation) => (
                  <article key={valuation.tradeId} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{valuation.tradeId}</strong>
                        <span>
                          {valuation.commodity} • {valuation.book} • {valuation.lifecycleStatus}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${openOptionValuationStatusTone(valuation)}`}>
                        {openOptionValuationStatusLabel(valuation)}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      {valuation.referencePriceIndexCode ? (
                        <span className="entity-chip entity-chip-soft">{valuation.referencePriceIndexCode}</span>
                      ) : null}
                      <span className="entity-chip entity-chip-soft">
                        {valuation.tradeSide ?? 'BUY'} {formatNumber(valuation.contracts, 0)} contracts
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Underlying {formatNumber(valuation.underlyingEquivalentVolume, 0)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Break-even {openOptionBreakEvenLabel(valuation)}
                      </span>
                      {valuation.daysToExpiration !== null ? (
                        <span className="entity-chip entity-chip-soft">{valuation.daysToExpiration}d to expiry</span>
                      ) : null}
                    </div>
                    <div className="shipment-card-copy">
                      {valuation.markStatus === 'VALUED' ? (
                        <p>
                          Live mark {openOptionReferenceMarkLabel(valuation)} versus strike{' '}
                          {formatCurrencyAmount(valuation.strikePrice, valuation.referenceCurrencyCode)}.
                          Intrinsic exposure {openOptionIntrinsicExposureLabel(valuation)}.
                          Expiry P&L {openOptionExpiryPnlLabel(valuation)}.
                          {valuation.referenceObservationDate ? ` Mark date ${formatDateOnly(valuation.referenceObservationDate)}.` : ''}
                        </p>
                      ) : (
                        <p>{valuation.markStatusReason ?? 'Awaiting linked market mark.'}</p>
                      )}
                    </div>
                    <div className="shipment-card-actions">
                      <span>Updated {formatDate(valuation.updatedAt)}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(valuation.tradeId)}>
                        Open Option
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No open option marks</strong>
              <p>Active option tickets with linked price indices will show live mark context here.</p>
            </div>
          ),
        },
        {
          id: 'risk-option-settlements',
          eyebrow: 'Settlement',
          title:
            optionSettlementSummary.pairCount > 0 ? 'Linked Option Settlement Valuation' : 'No linked option settlements',
          description: 'Read the booked underlying, premium cashflow, and effective package price once an option lifecycle handoff has been captured.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: optionSettlementSummary.pairCount > 0 ? (
            <div className="detail-list">
              {latestMarksError ? (
                <p className="field-error">Live marks unavailable: {latestMarksError}</p>
              ) : latestMarksLoading ? (
                <p className="form-note">Refreshing latest price index marks for linked option settlements.</p>
              ) : null}
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Gross Settled Contracts</span>
                  <MetricValue value={formatNumber(optionSettlementSummary.grossContracts, 0)} unit="Contracts" />
                  <p>Total option contracts that have already rolled into a linked underlying trade.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Net Underlying Booked</span>
                  <MetricValue
                    value={formatNumber(optionSettlementSummary.netUnderlyingVolume, 0)}
                    unit={settledUnderlyingUnitLabel}
                  />
                  <p>Signed underlying volume generated by the currently linked exercise and assignment pairs.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Gross Package Cashflow</span>
                  <strong>{formatMoney(optionSettlementSummary.grossPackageCashflow)}</strong>
                  <p>Absolute premium-plus-underlying economics across the linked settlement package.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Marked Packages</span>
                  <strong>{formatNumber(markedOptionSettlementCount, 0)}</strong>
                  <p>
                    {markedOptionSettlementCount > 0
                      ? 'Linked option settlements with a live market reference mark available right now.'
                      : 'Awaiting price-index marks before linked package MTM can be shown.'}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Net Package MTM</span>
                  <strong>
                    {markedOptionSettlementCount > 0
                      ? markToMarketLabel(netPackageMarkToMarket, optionSettlementSummary.valuations[0]?.referenceCurrencyCode)
                      : '—'}
                  </strong>
                  <p>
                    Signed package mark-to-market across the linked option settlements that have live reference prices.
                  </p>
                </article>
              </div>
              <div className="position-list">
                {optionSettlementSummary.valuations.slice(0, 6).map((valuation) => (
                  <article key={valuation.optionTradeId} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{valuation.optionTradeId}</strong>
                        <span>
                          {valuation.commodity} • {valuation.book} • {valuation.lifecycleStatus}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${valuationStatusTone(valuation)}`}>
                        {valuationStatusLabel(valuation)}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">Underlying {valuation.linkedTradeId}</span>
                      {valuation.referencePriceIndexCode ? (
                        <span className="entity-chip entity-chip-soft">{valuation.referencePriceIndexCode}</span>
                      ) : null}
                      <span className="entity-chip entity-chip-soft">
                        {valuation.underlyingDirection ?? 'BUY'} {formatNumber(valuation.underlyingVolume, 0)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Premium {cashflowSummaryLabel(valuation.premiumCashflow ?? 0, formatMoney)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Package {cashflowSummaryLabel(valuation.netPackageCashflow ?? 0, formatMoney)}
                      </span>
                    </div>
                    <div className="shipment-card-copy">
                      {valuation.markStatus === 'VALUED' ? (
                        <p>
                          Booked underlying at {formatCurrencyAmount(valuation.linkedPrice, valuation.referenceCurrencyCode)}.
                          Live mark {referenceMarkLabel(valuation)}
                          {valuation.referenceObservationDate ? ` on ${formatDateOnly(valuation.referenceObservationDate)}.` : '.'}{' '}
                          Package MTM {markToMarketLabel(valuation.packageMarkToMarket, valuation.referenceCurrencyCode)}.
                          Underlying MTM {markToMarketLabel(valuation.underlyingMarkToMarket, valuation.referenceCurrencyCode)}.
                          {valuation.intrinsicValue !== null
                            ? ` Intrinsic value at mark ${formatCurrencyAmount(valuation.intrinsicValue, valuation.referenceCurrencyCode)}.`
                            : ''}
                        </p>
                      ) : (
                        <p>{valuation.markStatusReason ?? 'Awaiting linked market mark.'}</p>
                      )}
                      <p>Effective package price {effectiveUnitPriceLabel(valuation)}.</p>
                    </div>
                    <div className="shipment-card-actions">
                      <span>Updated {formatDate(valuation.updatedAt)}</span>
                      <div className="workflow-item-button-row">
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => onOpenTrade(valuation.optionTradeId)}
                        >
                          Open Option
                        </button>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => onOpenTrade(valuation.linkedTradeId)}
                        >
                          Open Underlying
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No linked option settlements</strong>
              <p>Book a resulting underlying trade from an exercised or assigned option to see package valuation here.</p>
            </div>
          ),
        },
        {
          id: 'risk-books',
          eyebrow: 'Books',
          title: 'Book Concentration',
          description: 'Keep the linear volume view separate from option books, contracts, and premium at risk.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: linearBookConcentration.length > 0 || optionBookConcentration.length > 0 ? (
            <div className="detail-list">
              <div>
                <strong>Linear Books</strong>
                {linearBookConcentration.length > 0 ? (
                  <div className="position-list">
                    {linearBookConcentration.map((row) => (
                      <article key={`linear-${row.book}`} className="position-card">
                        <div>
                          <strong>{row.book}</strong>
                          <span>{row.tradeCount} open trade{row.tradeCount === 1 ? '' : 's'}</span>
                        </div>
                        <div className="position-value">
                          <b>{formatNumber(row.grossVolume, 0)}</b>
                          <span>{formatMoney(row.pricedNotional)} priced notional proxy</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No linear book exposure is currently open.</p>
                )}
              </div>
              <div>
                <strong>Option Books</strong>
                {optionBookConcentration.length > 0 ? (
                  <div className="position-list">
                    {optionBookConcentration.map((row) => (
                      <article key={`option-${row.book}`} className="position-card">
                        <div>
                          <strong>{row.book}</strong>
                          <span>{row.tradeCount} open option{row.tradeCount === 1 ? '' : 's'}</span>
                        </div>
                        <div className="position-value">
                          <b>{formatNumber(row.grossContracts, 0)} contracts</b>
                          <span>
                            {formatNumber(row.netUnderlyingEquivalentVolume, 0)} delta proxy · {formatMoney(row.grossPremiumAtRisk)} premium at risk
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No option book exposure is currently open.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No book concentration</strong>
              <p>Once active trades exist, this ranking will show where open risk is sitting.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
