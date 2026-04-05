import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'

type PositionRow = {
  commodity: string
  commodity_class: string
  net_volume: number
  updated_at: string
}

type PositionsWorkspaceProps = {
  authSession: StoredAuthSession | null
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  positionsWithClass: PositionRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

export function PositionsWorkspace({
  authSession,
  positionsByClass,
  positionsWithClass,
  formatCommodityClass,
  formatNumber,
  formatDate,
}: PositionsWorkspaceProps) {
  const grossExposure = positionsWithClass.reduce((total, position) => total + Math.abs(position.net_volume), 0)
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
          content:
            positionsWithClass.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Gross Exposure</span>
                  <strong>{formatNumber(grossExposure, 0)}</strong>
                  <p>Absolute net volume rolled up across every commodity row in the current positions projection.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Commodity Rows</span>
                  <strong>{formatNumber(positionsWithClass.length, 0)}</strong>
                  <p>Distinct commodity positions currently represented in the live projection.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Largest Class</span>
                  <strong>
                    {largestCommodityClass
                      ? `${formatNumber(largestCommodityClass.netVolume, 0)} ${formatCommodityClass(largestCommodityClass.commodityClass)}`
                      : '—'}
                  </strong>
                  <p>
                    {largestCommodityClass
                      ? 'The class carrying the largest absolute exposure right now.'
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
                  <strong>{formatNumber(row.netVolume, 0)}</strong>
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
            ? `${formatCommodityClass(largestCommodityPosition.commodity_class)} currently carries the largest absolute commodity-level exposure.`
            : 'Exact commodity-level net volume currently held in the projection.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: positionsWithClass.length > 0 ? (
            <div className="position-list">
              {positionsWithClass.map((position) => (
                <article key={position.commodity} className="position-card">
                  <div>
                    <strong>{position.commodity}</strong>
                    <span>{formatCommodityClass(position.commodity_class)}</span>
                  </div>
                  <div className="position-value">
                    <b>{formatNumber(position.net_volume, 0)}</b>
                    <span>{formatDate(position.updated_at)}</span>
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
