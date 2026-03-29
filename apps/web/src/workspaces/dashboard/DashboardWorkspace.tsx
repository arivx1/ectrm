import { useMemo } from 'react'

import { MarketPricesPanel } from './MarketPricesPanel'

type EventRow = {
  event_id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  recorded_at: string
}

type Trade = {
  trade_id: string
  trade_side: string | null
  commodity: string
  commodity_class: string
  unit_of_measure: string | null
  price_index_code: string | null
  price: number | null
  volume: number | null
  pricing_status: string
  settlement_status: string
  execution_timestamp: string | null
  external_trade_id: string | null
  counterparty: string | null
}

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
}

type PriceIndexRecord = {
  code: string
  name: string
  provider: string
  unit_code: string
  currency_code: string
  is_active: boolean
}

type DashboardWorkspaceProps = {
  appLoading: boolean
  activeTrades: Trade[]
  priceIndices: PriceIndexRecord[]
  positionsWithClass: PositionRow[]
  events: EventRow[]
  formatCommodityClass: (value: string) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

function normalizeUnit(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || 'Unit TBD'
}

function ageInDays(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }

  return Math.floor((Date.now() - timestamp) / 86_400_000)
}

function tradeDirection(trade: Trade): number {
  if (typeof trade.volume === 'number' && trade.volume < 0) {
    return -1
  }

  return trade.trade_side === 'SELL' ? -1 : 1
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const {
    appLoading,
    activeTrades,
    priceIndices,
    positionsWithClass,
    events,
    formatCommodityClass,
    formatMoney,
    formatNumber,
    formatDate,
  } = props

  const exposureByClass = useMemo(() => {
    const unitsByCommodity = new Map<string, Set<string>>()
    for (const trade of activeTrades) {
      const existing = unitsByCommodity.get(trade.commodity) ?? new Set<string>()
      existing.add(normalizeUnit(trade.unit_of_measure))
      unitsByCommodity.set(trade.commodity, existing)
    }

    const totals = new Map<string, { commodityClass: string; unitLabel: string; netVolume: number; commodityCount: number }>()
    for (const position of positionsWithClass) {
      const unitCandidates = unitsByCommodity.get(position.commodity)
      const unitLabel =
        !unitCandidates || unitCandidates.size === 0
          ? 'Unit TBD'
          : unitCandidates.size === 1
            ? [...unitCandidates][0]
            : 'Mixed UOM'
      const key = `${position.commodity_class}::${unitLabel}`
      const current = totals.get(key) ?? {
        commodityClass: position.commodity_class,
        unitLabel,
        netVolume: 0,
        commodityCount: 0,
      }

      current.netVolume += position.net_volume
      current.commodityCount += 1
      totals.set(key, current)
    }

    return [...totals.values()].sort((left, right) => {
      const classCompare = left.commodityClass.localeCompare(right.commodityClass)
      if (classCompare !== 0) {
        return classCompare
      }

      return left.unitLabel.localeCompare(right.unitLabel)
    })
  }, [activeTrades, positionsWithClass])

  const markedPnlProxy = useMemo(
    () =>
      activeTrades.reduce((sum, trade) => {
        if (trade.price === null || trade.volume === null) {
          return sum
        }

        return sum + trade.price * Math.abs(trade.volume) * tradeDirection(trade)
      }, 0),
    [activeTrades],
  )

  const pricedTradeCount = useMemo(
    () => activeTrades.filter((trade) => trade.price !== null && trade.volume !== null).length,
    [activeTrades],
  )

  const grossExposure = useMemo(
    () => positionsWithClass.reduce((sum, position) => sum + Math.abs(position.net_volume), 0),
    [positionsWithClass],
  )

  const largestExposureBucket = useMemo(
    () =>
      exposureByClass.reduce<{ commodityClass: string; unitLabel: string; netVolume: number } | null>(
        (current, row) =>
          current === null || Math.abs(row.netVolume) > Math.abs(current.netVolume)
            ? {
                commodityClass: row.commodityClass,
                unitLabel: row.unitLabel,
                netVolume: row.netVolume,
              }
            : current,
        null,
      ),
    [exposureByClass],
  )

  const dashboardIssues = useMemo(() => {
    const overdueSettlement = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 5 && trade.settlement_status !== 'SETTLED'
    })
    const stalePricing = activeTrades.filter((trade) => {
      const ageDays = ageInDays(trade.execution_timestamp)
      return ageDays !== null && ageDays >= 2 && trade.pricing_status === 'PENDING'
    })
    const incompleteOperationalData = activeTrades.filter(
      (trade) =>
        !trade.execution_timestamp ||
        !trade.external_trade_id ||
        !trade.counterparty ||
        !trade.unit_of_measure,
    )

    const openIssueTradeIds = new Set(
      [...overdueSettlement, ...stalePricing, ...incompleteOperationalData].map((trade) => trade.trade_id),
    )

    return {
      total: openIssueTradeIds.size,
      rows: [
        {
          label: 'Overdue settlement',
          count: overdueSettlement.length,
          detail: 'Active trades still pending settlement 5+ days after execution.',
          tone: overdueSettlement.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Stale pricing',
          count: stalePricing.length,
          detail: 'Trades still marked PENDING pricing 2+ days after execution.',
          tone: stalePricing.length > 0 ? 'blocked' : 'active',
        },
        {
          label: 'Incomplete ops data',
          count: incompleteOperationalData.length,
          detail: 'Active trades missing execution time, external ID, counterparty, or UOM.',
          tone: incompleteOperationalData.length > 0 ? 'blocked' : 'active',
        },
      ] as Array<{ label: string; count: number; detail: string; tone: 'active' | 'blocked' }>,
    }
  }, [activeTrades])

  return (
    <section className="stack">
      <article className="surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Reporting</span>
            <h3>Desk Snapshot</h3>
          </div>
          <p>P&L proxy, gross exposure, and operational attention points from the live trade and position set.</p>
        </div>

        {appLoading ? (
          <div className="skeleton-stack">
            <div className="skeleton-block" />
            <div className="skeleton-block" />
          </div>
        ) : (
          <div className="dashboard-report-grid">
            <article className="dashboard-report-card">
              <span>P&amp;L Proxy</span>
              <strong>{formatMoney(markedPnlProxy)}</strong>
              <p>
                Based on {pricedTradeCount} priced trade{pricedTradeCount === 1 ? '' : 's'} using stored price differential
                times current volume. True P&amp;L will need market marks and settlements.
              </p>
            </article>
            <article className="dashboard-report-card">
              <span>Gross Exposure</span>
              <strong>{formatNumber(grossExposure, 0)}</strong>
              <p>
                Across {positionsWithClass.length} commodity position{positionsWithClass.length === 1 ? '' : 's'} and{' '}
                {exposureByClass.length} reporting bucket{exposureByClass.length === 1 ? '' : 's'} with UOM coverage.
              </p>
            </article>
            <article className="dashboard-report-card">
              <span>Needs Attention</span>
              <strong>{formatNumber(dashboardIssues.total, 0)}</strong>
              <p>
                Trade-driven operational watchlist. Shipment and invoice exceptions can slot in here once those workflows
                are modeled in the platform.
              </p>
            </article>
            <article className="dashboard-report-card">
              <span>Largest Bucket</span>
              <strong>
                {largestExposureBucket
                  ? `${formatNumber(largestExposureBucket.netVolume, 0)} ${largestExposureBucket.unitLabel}`
                  : '—'}
              </strong>
              <p>
                {largestExposureBucket
                  ? `${formatCommodityClass(largestExposureBucket.commodityClass)} currently leads the dashboard exposure view.`
                  : 'No open exposure bucket is available yet.'}
              </p>
            </article>
          </div>
        )}
      </article>

      <MarketPricesPanel
        appLoading={appLoading}
        activeTrades={activeTrades}
        priceIndices={priceIndices}
        formatNumber={formatNumber}
      />

      <article className="surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Exposure</span>
            <h3>Position Snapshot</h3>
          </div>
          <p>Class-level overview first, detailed rows later.</p>
        </div>

        {appLoading ? (
          <div className="skeleton-stack">
            <div className="skeleton-block" />
            <div className="skeleton-block" />
          </div>
        ) : exposureByClass.length > 0 ? (
          <div className="position-class-grid">
            {exposureByClass.map((row) => (
              <article key={`${row.commodityClass}-${row.unitLabel}`} className="position-class-card">
                <span>{formatCommodityClass(row.commodityClass)}</span>
                <strong>
                  {formatNumber(row.netVolume, 0)} <small>{row.unitLabel}</small>
                </strong>
                <p>
                  {row.commodityCount} commodit{row.commodityCount === 1 ? 'y' : 'ies'} contributing to this reporting
                  bucket.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No open exposure</strong>
            <p>The system is healthy, but there are no active trades contributing exposure yet.</p>
          </div>
        )}
      </article>

      <article className="surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Watchlist</span>
            <h3>Operational Attention</h3>
          </div>
          <p>Current issues are derived from trade aging and completeness until shipment and invoice workflows land.</p>
        </div>

        {appLoading ? (
          <div className="skeleton-stack">
            <div className="skeleton-block" />
          </div>
        ) : dashboardIssues.rows.some((row) => row.count > 0) ? (
          <div className="dashboard-issue-list">
            {dashboardIssues.rows.map((row) => (
              <article key={row.label} className="dashboard-issue-row">
                <div>
                  <strong>{row.label}</strong>
                  <p>{row.detail}</p>
                </div>
                <div className="dashboard-issue-meta">
                  <span className={`status-pill status-pill-${row.tone}`}>{row.count} open</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No active operational issues</strong>
            <p>The live trades are priced, settled, and populated well enough that nothing is currently flagged here.</p>
          </div>
        )}
      </article>

      <article className="surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Activity</span>
            <h3>Recent Timeline</h3>
          </div>
          <p>The latest event flow without leaving the dashboard.</p>
        </div>
        <div className="timeline">
          {appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : events.slice(0, 5).length > 0 ? (
            events.slice(0, 5).map((event) => (
              <article key={event.event_id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <strong>{event.event_type}</strong>
                    <span>{formatDate(event.recorded_at)}</span>
                  </div>
                  <p>
                    {event.aggregate_id} • {event.aggregate_type}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>No recent events</strong>
              <p>Create or amend a trade to start building the operational timeline.</p>
            </div>
          )}
        </div>
      </article>
    </section>
  )
}
