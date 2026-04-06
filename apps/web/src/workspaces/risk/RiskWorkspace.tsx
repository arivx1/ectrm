import { TileLayout } from '../../shared/ui/TileLayout'
import { buildOptionExposureSummary } from '../../shared/optionExposure'
import type { OptionExposureRow, Trade } from '../../shared/models'
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
  optionExposures: OptionExposureRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
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
  optionExposures,
  formatCommodityClass,
  formatNumber,
  formatMoney,
  formatDate,
  formatDateOnly,
  onOpenTrade,
}: RiskWorkspaceProps) {
  const linearActiveTrades = activeTrades.filter((trade) => trade.instrument_type !== 'OPTION')
  const grossExposure = positionsWithClass.reduce((total, position) => total + Math.abs(position.net_volume), 0)
  const pricedTradeCount = activeTrades.filter((trade) => trade.pricing_status === 'PRICED').length
  const pricingCoverage =
    activeTrades.length > 0 ? Math.round((pricedTradeCount / activeTrades.length) * 100) : null
  const optionExposureSummary = buildOptionExposureSummary(optionExposures)
  const pricingAttentionTrades = [...activeTrades]
    .filter((trade) => trade.pricing_status !== 'PRICED')
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  const largestExposureClass = positionsByClass.reduce<{ commodityClass: string; netVolume: number } | null>(
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

  const optionBookConcentration = optionExposures.reduce<
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
          description: 'Keep linear exposure and option delta-proxy risk visible side by side without mixing barrels and contracts.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            activeTrades.length > 0 || positionsWithClass.length > 0 || optionExposures.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Gross Linear Exposure</span>
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
                  <span>Largest Linear Class</span>
                  <strong>
                    {largestExposureClass
                      ? `${formatNumber(largestExposureClass.netVolume, 0)} ${formatCommodityClass(largestExposureClass.commodityClass)}`
                      : '—'}
                  </strong>
                  <p>
                    {largestExposureClass
                      ? 'The biggest class-level concentration by absolute linear exposure.'
                      : 'Class-level linear exposure will appear as positions are projected.'}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Linear Ticket</span>
                  <strong>
                    {largestLinearTrade
                      ? `${largestLinearTrade.trade_id} · ${formatNumber(absoluteVolume(largestLinearTrade.volume), 0)}`
                      : '—'}
                  </strong>
                  <p>
                    {largestLinearTrade
                      ? `${largestLinearTrade.commodity} in ${largestLinearTrade.book} currently carries the largest linear ticket volume.`
                      : 'No open linear trade ticket is available yet.'}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Open Option Tickets</span>
                  <strong>{formatNumber(optionExposureSummary.optionCount, 0)}</strong>
                  <p>Active option trades currently represented in the dedicated optionality projection.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Net Option Delta Proxy</span>
                  <strong>{formatNumber(optionExposureSummary.netUnderlyingEquivalentVolume, 0)}</strong>
                  <p>A simple underlying-equivalent direction view based on trade side, call-put, and contracts.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Premium at Risk</span>
                  <strong>{formatMoney(optionExposureSummary.grossPremiumAtRisk)}</strong>
                  <p>Absolute premium cashflow proxy across currently open option tickets.</p>
                </article>
                <article className="dashboard-report-card">
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
          description: 'Read linear net exposure first, then compare the option delta proxy by commodity class.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: positionsByClass.length > 0 || optionExposureSummary.exposureByClass.length > 0 ? (
            <div className="detail-list">
              <div>
                <strong>Linear Net Exposure</strong>
                {positionsByClass.length > 0 ? (
                  <div className="position-class-grid">
                    {positionsByClass.map((row) => (
                      <article key={row.commodityClass} className="position-class-card">
                        <span>{formatCommodityClass(row.commodityClass)}</span>
                        <strong>{formatNumber(row.netVolume, 0)}</strong>
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
                        <strong>{formatNumber(row.underlyingEquivalentVolume, 0)}</strong>
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
              <p>Linear and option class rollups will appear once exposure is projected.</p>
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
