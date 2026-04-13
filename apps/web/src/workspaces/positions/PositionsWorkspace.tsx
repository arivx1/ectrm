import { useMemo, useState } from 'react'

import { matchesTextFilter } from '../../shared/filtering'
import type { Trade } from '../../shared/models'
import {
  buildUnitLabelByCommodity,
  buildUnitLabelByCommodityClass,
  summarizeUnitLabels,
} from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileSectionGrid, type TileSectionGridItem } from '../../shared/ui/TileSectionGrid'
import { TileLayout } from '../../shared/ui/TileLayout'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import type { StoredAuthSession } from '../../shared/mutation'
import { buildPositionTradeContext } from './positionHelpers'

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

function matchesPositionScreenFilter(
  position: PositionRow & { tradeContext: ReturnType<typeof buildPositionTradeContext> },
  query: string,
): boolean {
  return matchesTextFilter(query, [
    position.commodity,
    position.commodity_class,
    position.updated_at,
    ...position.tradeContext.matchingTrades.flatMap((trade) => [
      trade.trade_id,
      trade.book,
      trade.portfolio,
      trade.counterparty,
      trade.commodity,
      trade.commodity_class,
      trade.status,
    ]),
  ])
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
  const [screenFilter, setScreenFilter] = useState('')
  const positionRowsWithTradeContext = useMemo(
    () =>
      positionsWithClass.map((position) => ({
        ...position,
        tradeContext: buildPositionTradeContext(position, activeTrades),
      })),
    [activeTrades, positionsWithClass],
  )
  const filteredPositionRows = useMemo(
    () =>
      positionRowsWithTradeContext.filter((position) => matchesPositionScreenFilter(position, screenFilter)),
    [positionRowsWithTradeContext, screenFilter],
  )
  const visiblePositionsWithClass = screenFilter.trim().length > 0 ? filteredPositionRows : positionRowsWithTradeContext
  const visiblePositionsByClass = useMemo(() => {
    if (screenFilter.trim().length === 0) {
      return positionsByClass
    }

    const visibleCommodityClasses = new Set(visiblePositionsWithClass.map((position) => position.commodity_class))
    const totals = new Map<string, number>()
    for (const position of visiblePositionsWithClass) {
      totals.set(position.commodity_class, (totals.get(position.commodity_class) ?? 0) + position.net_volume)
    }

    return positionsByClass.filter((row) => visibleCommodityClasses.has(row.commodityClass)).map((row) => ({
      commodityClass: row.commodityClass,
      netVolume: totals.get(row.commodityClass) ?? 0,
    }))
  }, [positionsByClass, screenFilter, visiblePositionsWithClass])
  const commodityUnitLabels = buildUnitLabelByCommodity(activeTrades)
  const commodityClassUnitLabels = buildUnitLabelByCommodityClass(activeTrades)
  const grossExposure = visiblePositionsWithClass.reduce((total, position) => total + Math.abs(position.net_volume), 0)
  const grossExposureUnitLabel = summarizeUnitLabels(activeTrades.map((trade) => trade.unit_of_measure))
  const largestCommodityPosition = visiblePositionsWithClass.reduce<(typeof visiblePositionsWithClass)[number] | null>((largest, position) => {
    if (!largest || Math.abs(position.net_volume) > Math.abs(largest.net_volume)) {
      return position
    }

    return largest
  }, null)
  const largestCommodityClass = visiblePositionsByClass.reduce<{ commodityClass: string; netVolume: number } | null>(
    (largest, positionClass) => {
      if (!largest || Math.abs(positionClass.netVolume) > Math.abs(largest.netVolume)) {
        return positionClass
      }

      return largest
    },
    null,
  )
  const freshestPosition = visiblePositionsWithClass.reduce<(typeof visiblePositionsWithClass)[number] | null>((latest, position) => {
    if (!latest || position.updated_at > latest.updated_at) {
      return position
    }

    return latest
  }, null)
  const largestCommodityTrade = largestCommodityPosition?.tradeContext.primaryTrade ?? null
  const largestCommodityClassUnitLabel = largestCommodityClass
    ? commodityClassUnitLabels.get(largestCommodityClass.commodityClass) ?? 'Unit TBD'
    : null
  const positionsSummaryCards: TileSectionGridItem[] = [
    {
      id: 'gross-exposure',
      title: 'Gross Exposure',
      content: (
        <>
          <span>Gross Exposure</span>
          <MetricValue value={formatNumber(grossExposure, 0)} unit={grossExposureUnitLabel} />
          <p>Absolute net volume rolled up across every commodity row in the current positions projection.</p>
        </>
      ),
    },
    {
      id: 'open-positions',
      title: 'Open Positions',
      content: (
        <>
          <span>Open Positions</span>
          <strong>{formatNumber(visiblePositionsWithClass.length, 0)}</strong>
          <p>Commodity rows now contributing to the live position projection.</p>
        </>
      ),
    },
    {
      id: 'largest-class',
      title: 'Largest Class',
      content: (
        <>
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
        </>
      ),
    },
    {
      id: 'freshest-update',
      title: 'Freshest Update',
      content: (
        <>
          <span>Freshest Update</span>
          <strong>{freshestPosition ? formatDate(freshestPosition.updated_at) : '—'}</strong>
          <p>
            {freshestPosition
              ? `${freshestPosition.commodity} was the latest commodity row updated in the projection.`
              : 'There are no position updates to review yet.'}
          </p>
        </>
      ),
    },
  ]

  return (
    <TileLayout
      workspaceId="positions"
      workspaceLabel="Positions"
      authSession={authSession}
      headerContent={
        <WorkspaceLocalFilterBar
          value={screenFilter}
          onChange={setScreenFilter}
          placeholder="Commodity, class, trade ID, book, or counterparty"
          description="Narrow the positions view locally without changing the rest of the desk surfaces."
          totalCount={positionRowsWithTradeContext.length}
          matchedCount={visiblePositionsWithClass.length}
          resultLabel="commodity rows"
        />
      }
      sections={[
        {
          id: 'positions-summary-cards',
          itemIds: positionsSummaryCards.map((card) => card.id),
        },
      ]}
      tiles={[
        {
          id: 'positions-summary',
          eyebrow: 'Snapshot',
          title: 'Exposure Snapshot',
          description: 'A fast read on how much exposure is open and where the biggest concentrations currently sit.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: visiblePositionsWithClass.length > 0 ? (
            <div className="stack">
              <TileSectionGrid sectionId="positions-summary-cards" items={positionsSummaryCards} />
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
          content: visiblePositionsByClass.length > 0 ? (
            <div className="position-class-grid">
              {visiblePositionsByClass.map((row) => (
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
          content: visiblePositionsWithClass.length > 0 ? (
            <div className="position-list">
              {visiblePositionsWithClass.map((position) => (
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
