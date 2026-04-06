import { TileLayout } from '../../shared/ui/TileLayout'
import type { Trade } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

type RiskWorkspaceProps = {
  authSession: StoredAuthSession | null
  activeTrades: Trade[]
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  positionsWithClass: PositionRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
}

function absoluteVolume(value: number | null): number {
  return Math.abs(value ?? 0)
}

export function RiskWorkspace({
  authSession,
  activeTrades,
  positionsByClass,
  positionsWithClass,
  formatCommodityClass,
  formatNumber,
  formatMoney,
  formatDate,
  onOpenTrade,
}: RiskWorkspaceProps) {
  const grossExposure = positionsWithClass.reduce((total, position) => total + Math.abs(position.net_volume), 0)
  const pricedTradeCount = activeTrades.filter((trade) => trade.pricing_status === 'PRICED').length
  const pricingCoverage =
    activeTrades.length > 0 ? Math.round((pricedTradeCount / activeTrades.length) * 100) : null
  const pricingAttentionTrades = [...activeTrades]
    .filter((trade) => trade.pricing_status !== 'PRICED')
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  const largestExposureClass = positionsByClass.reduce<{ commodityClass: string; netVolume: number } | null>(
    (largest, row) =>
      largest === null || Math.abs(row.netVolume) > Math.abs(largest.netVolume) ? row : largest,
    null,
  )
  const largestTrade = activeTrades.reduce<Trade | null>(
    (largest, trade) =>
      largest === null || absoluteVolume(trade.volume) > absoluteVolume(largest.volume) ? trade : largest,
    null,
  )
  const bookConcentration = [...activeTrades].reduce<
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
  bookConcentration.sort((left, right) => right.grossVolume - left.grossVolume)

  return (
    <TileLayout
      workspaceId="risk"
      workspaceLabel="Risk"
      authSession={authSession}
      tiles={[
        {
          id: 'risk-summary',
          eyebrow: 'Snapshot',
          title: 'Risk Snapshot',
          description: 'Exposure concentration, pricing quality, and largest open tickets in one desk-facing view.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            activeTrades.length > 0 || positionsWithClass.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Gross Exposure</span>
                  <strong>{formatNumber(grossExposure, 0)}</strong>
                  <p>Absolute net volume across every currently projected commodity row.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Pricing Coverage</span>
                  <strong>{pricingCoverage === null ? '—' : `${pricingCoverage}%`}</strong>
                  <p>
                    {pricedTradeCount} of {activeTrades.length} active trade
                    {activeTrades.length === 1 ? '' : 's'} are fully marked as priced.
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Class</span>
                  <strong>
                    {largestExposureClass
                      ? `${formatNumber(largestExposureClass.netVolume, 0)} ${formatCommodityClass(largestExposureClass.commodityClass)}`
                      : '—'}
                  </strong>
                  <p>
                    {largestExposureClass
                      ? 'The biggest class-level concentration by absolute exposure.'
                      : 'Class-level exposure will appear as positions are projected.'}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Ticket</span>
                  <strong>
                    {largestTrade ? `${largestTrade.trade_id} · ${formatNumber(absoluteVolume(largestTrade.volume), 0)}` : '—'}
                  </strong>
                  <p>
                    {largestTrade
                      ? `${largestTrade.commodity} in ${largestTrade.book} currently carries the largest absolute ticket volume.`
                      : 'No open trade ticket is available yet.'}
                  </p>
                </article>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No risk surface yet</strong>
                <p>Create active trades to populate the risk workspace.</p>
              </div>
            ),
        },
        {
          id: 'risk-exposure',
          eyebrow: 'Concentration',
          title: 'Exposure by Class',
          description: 'Use the class rollup first, then drill into the exact commodities carrying the risk.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: positionsByClass.length > 0 ? (
            <div className="position-class-grid">
              {positionsByClass.map((row) => (
                <article key={row.commodityClass} className="position-class-card">
                  <span>{formatCommodityClass(row.commodityClass)}</span>
                  <strong>{formatNumber(row.netVolume, 0)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No grouped exposure</strong>
              <p>The class breakdown will appear once live positions are available.</p>
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
                    <span className="entity-chip entity-chip-soft">Volume {formatNumber(trade.volume, 0)}</span>
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
          id: 'risk-books',
          eyebrow: 'Books',
          title: 'Book Concentration',
          description: 'A compact ranking of which books currently carry the heaviest risk load.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: bookConcentration.length > 0 ? (
            <div className="position-list">
              {bookConcentration.map((row) => (
                <article key={row.book} className="position-card">
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
