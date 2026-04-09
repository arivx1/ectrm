import type { Trade } from '../../shared/models'
import {
  buildUnitLabelByCommodity,
  buildUnitLabelByCommodityClass,
  summarizeUnitLabels,
} from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'
import { buildPositionTradeContext } from './positionHelpers'

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

type PositionsWorkspaceProps = {
  activeTrades: Trade[]
  authSession: StoredAuthSession | null
  onOpenRisk: () => void
  onOpenTrade: (tradeId: string) => void
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  positionsWithClass: PositionRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

export function PositionsWorkspace({
  activeTrades,
  authSession,
  onOpenRisk,
  onOpenTrade,
  positionsByClass,
  positionsWithClass,
  formatCommodityClass,
  formatNumber,
  formatDate,
}: PositionsWorkspaceProps) {
  const positionRowsWithTradeContext = positionsWithClass.map((position) => ({
    ...position,
    tradeContext: buildPositionTradeContext(position, activeTrades),
  }))
  const commodityUnitLabels = buildUnitLabelByCommodity(activeTrades)
  const commodityClassUnitLabels = buildUnitLabelByCommodityClass(activeTrades)
  const grossExposure = positionsWithClass.reduce((total, position) => total + Math.abs(position.net_volume), 0)
  const grossExposureUnitLabel = summarizeUnitLabels(activeTrades.map((trade) => trade.unit_of_measure))
  const largestCommodityPosition = positionsWithClass.reduce<PositionRow | null>((largest, position) => {
    if (!largest || Math.abs(position.net_volume) > Math.abs(largest.net_volume)) {
      return position
    }

    return largest
  }, null)
  const largestCommodityClass = positionsByClass.reduce<{ commodityClass: string; netVolume: number } | null>(
    (largest, positionClass) => {
      if (!largest || Math.abs(positionClass.netVolume) > Math.abs(largest.netVolume)) {
        return positionClass
      }

      return largest
    },
    null,
  )
  const freshestPosition = positionsWithClass.reduce<PositionRow | null>((latest, position) => {
    if (!latest || position.updated_at > latest.updated_at) {
      return position
    }

    return latest
  }, null)
  const largestCommodityTrade = largestCommodityPosition
    ? buildPositionTradeContext(largestCommodityPosition, activeTrades).primaryTrade
    : null
  const largestCommodityClassUnitLabel = largestCommodityClass
    ? commodityClassUnitLabels.get(largestCommodityClass.commodityClass) ?? 'Unit TBD'
    : null

  return (
    <TileLayout
      workspaceId="positions"
      workspaceLabel="Positions"
      authSession={authSession}
      tiles={[
        {
          id: 'positions-summary',
          eyebrow: 'Snapshot',
          title: 'Exposure Snapshot',
          description: 'A fast read on how much exposure is open and where the biggest concentrations currently sit.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: positionsWithClass.length > 0 ? (
            <div className="stack">
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Gross Exposure</span>
                  <MetricValue value={formatNumber(grossExposure, 0)} unit={grossExposureUnitLabel} />
                  <p>Absolute net volume rolled up across every commodity row in the current positions projection.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Open Positions</span>
                  <strong>{formatNumber(positionsWithClass.length, 0)}</strong>
                  <p>Commodity rows now contributing to the live position projection.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Class</span>
                  {largestCommodityClass && largestCommodityClassUnitLabel ? (
                    <MetricValue
                      value={formatNumber(largestCommodityClass.netVolume, 0)}
                      unit={largestCommodityClassUnitLabel}
                    />
                  ) : (
                    <strong>—</strong>
                  )}
                  <p>
                    {largestCommodityClass
                      ? `${formatCommodityClass(largestCommodityClass.commodityClass)} is carrying the largest absolute exposure right now.`
                      : 'No class-level exposure is available yet.'}
                  </p>
                </article>
                <article className="dashboard-report-card">
                  <span>Freshest Update</span>
                  <strong>{freshestPosition ? formatDate(freshestPosition.updated_at) : '—'}</strong>
                  <p>
                    {freshestPosition
                      ? `${freshestPosition.commodity} was the latest commodity row updated in the projection.`
                      : 'There are no position updates to review yet.'}
                  </p>
                </article>
              </div>
              <div className="stack-actions">
                <button type="button" className="button button-secondary" onClick={onOpenRisk}>
                  Open Risk Workspace
                </button>
                {largestCommodityTrade ? (
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => onOpenTrade(largestCommodityTrade.trade_id)}
                  >
                    Open Largest Trade
                  </button>
                ) : null}
              </div>
            </div>
            ) : (
              <div className="empty-state">
                <strong>No positions</strong>
                <p>Create active trades to populate this risk surface.</p>
              </div>
            ),
        },
        {
          id: 'positions-by-class',
          eyebrow: 'Grouped View',
          title: 'Exposure by Commodity Class',
          description: 'A class-level view for seeing concentration before drilling into exact commodity rows.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: positionsByClass.length > 0 ? (
            <div className="position-class-grid">
              {positionsByClass.map((row) => (
                <article key={row.commodityClass} className="position-class-card">
                  <span>{formatCommodityClass(row.commodityClass)}</span>
                  <MetricValue
                    value={formatNumber(row.netVolume, 0)}
                    unit={commodityClassUnitLabels.get(row.commodityClass) ?? 'Unit TBD'}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No grouped exposure</strong>
              <p>The class summary will appear once positions are projected from active trades.</p>
            </div>
          ),
        },
        {
          id: 'positions-detail',
          eyebrow: 'Detailed View',
          title: largestCommodityPosition ? largestCommodityPosition.commodity : 'Commodity Rows',
          description: largestCommodityPosition
            ? `${formatCommodityClass(largestCommodityPosition.commodity_class)} currently carries the largest absolute commodity-level exposure, with a direct handoff into the trade creating it.`
            : 'Exact commodity-level net volume currently held in the projection.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: positionRowsWithTradeContext.length > 0 ? (
            <div className="position-list">
              {positionRowsWithTradeContext.map((position) => (
                <article key={position.commodity} className="position-card position-card-drilldown">
                  <div className="position-card-head">
                    <div className="position-card-copy">
                      <div>
                        <strong>{position.commodity}</strong>
                        <span>{formatCommodityClass(position.commodity_class)}</span>
                      </div>
                      <p>
                        {position.tradeContext.matchingTrades.length > 0
                          ? `${position.tradeContext.matchingTrades.length} active trade${position.tradeContext.matchingTrades.length === 1 ? '' : 's'} currently map into this projected row.`
                          : 'No active trade handoff is currently available for this projected row.'}
                      </p>
                    </div>
                    <div className="position-value">
                      <MetricValue
                        as="b"
                        value={formatNumber(position.net_volume, 0)}
                        unit={commodityUnitLabels.get(position.commodity) ?? 'Unit TBD'}
                      />
                      <span>{formatDate(position.updated_at)}</span>
                    </div>
                  </div>
                  <div className="position-card-actions">
                    <span>
                      {position.tradeContext.primaryTrade
                        ? `Largest active ticket: ${position.tradeContext.primaryTrade.trade_id} in ${position.tradeContext.primaryTrade.book}`
                        : 'Use the risk workspace to compare broader class-level concentration.'}
                    </span>
                    <div className="stack-actions">
                      {position.tradeContext.primaryTrade ? (
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => onOpenTrade(position.tradeContext.primaryTrade!.trade_id)}
                        >
                          Open Largest Trade
                        </button>
                      ) : null}
                      <button type="button" className="button button-secondary" onClick={onOpenRisk}>
                        Open Risk Workspace
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No commodity rows</strong>
              <p>Once positions exist, the exact commodity rows will be listed here with their latest update time.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
