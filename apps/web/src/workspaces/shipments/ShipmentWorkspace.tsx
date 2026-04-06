import { TileLayout } from '../../shared/ui/TileLayout'
import type { ShipmentRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type ShipmentWorkspaceProps = {
  authSession: StoredAuthSession | null
  shipments: ShipmentRecord[]
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
  onOpenTrade: (tradeId: string) => void
}

function shipmentTone(status: ShipmentRecord['status']): 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped' {
  switch (status) {
    case 'BLOCKED':
      return 'blocked'
    case 'IN_PROGRESS':
      return 'in-progress'
    case 'COMPLETED':
      return 'shipped'
    case 'READY':
      return 'active'
    default:
      return 'planned'
  }
}

function formatShipmentStatus(status: ShipmentRecord['status']): string {
  return status.replaceAll('_', ' ')
}

function volumeLabel(shipment: ShipmentRecord, formatNumber: ShipmentWorkspaceProps['formatNumber']): string {
  if (shipment.volume === null) {
    return 'Volume TBD'
  }

  return `${formatNumber(shipment.volume, 0)} ${shipment.unit_of_measure ?? ''}`.trim()
}

function shipmentNarrative(shipment: ShipmentRecord): string {
  if (shipment.status === 'COMPLETED') {
    return 'Operationally closed from the current settlement projection.'
  }

  if (shipment.status === 'READY') {
    return 'Core shipment details are in place and the trade is ready for the next logistics step.'
  }

  if (shipment.status === 'BLOCKED') {
    return 'Operator attention is needed before the shipment can move cleanly through readiness.'
  }

  return 'The shipment is in flight operationally, but pricing or downstream workflow is still catching up.'
}

export function ShipmentWorkspace({
  authSession,
  shipments,
  formatCommodityClass,
  formatDate,
  formatNumber,
  onOpenTrade,
}: ShipmentWorkspaceProps) {
  const openShipments = shipments.filter((shipment) => shipment.status !== 'COMPLETED')
  const blockedShipments = shipments.filter((shipment) => shipment.status === 'BLOCKED')
  const readyShipments = shipments.filter((shipment) => shipment.status === 'READY')
  const inProgressShipments = shipments.filter((shipment) => shipment.status === 'IN_PROGRESS')
  const completedShipments = shipments.filter((shipment) => shipment.status === 'COMPLETED')
  const pricingPendingOpen = openShipments.filter((shipment) => shipment.pricing_status !== 'PRICED').length
  const openVolume = openShipments.reduce((sum, shipment) => sum + Math.abs(shipment.volume ?? 0), 0)
  const oldestOpenShipment = openShipments.reduce<ShipmentRecord | null>((oldest, shipment) => {
    if (!oldest || shipment.age_days > oldest.age_days) {
      return shipment
    }

    return oldest
  }, null)
  const latestShipmentUpdate = shipments.reduce<ShipmentRecord | null>((latest, shipment) => {
    if (!latest || shipment.last_updated_at > latest.last_updated_at) {
      return shipment
    }

    return latest
  }, null)

  return (
    <TileLayout
      workspaceId="shipments"
      workspaceLabel="Shipments"
      authSession={authSession}
      tiles={[
        {
          id: 'shipment-summary',
          eyebrow: 'Readiness',
          title: 'Shipment Readiness Board',
          description:
            'A first operational slice derived from active physical trades so logistics work can start before a dedicated shipment ledger exists.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            shipments.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Tracked Shipments</span>
                  <strong>{formatNumber(shipments.length, 0)}</strong>
                  <p>Every active physical trade currently materialized into the shipment queue.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Open Volume</span>
                  <strong>{formatNumber(openVolume, 0)}</strong>
                  <p>Absolute shipment volume still open across non-completed logistics tickets.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Ready Now</span>
                  <strong>{formatNumber(readyShipments.length, 0)}</strong>
                  <p>Physical trades with clean operational details and pricing already in place.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Blocked</span>
                  <strong>{formatNumber(blockedShipments.length, 0)}</strong>
                  <p>Shipments currently missing data that an operator would need to finish the handoff.</p>
                </article>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No shipment activity</strong>
                <p>Create active physical trades to start populating the shipment readiness queue.</p>
              </div>
            ),
        },
        {
          id: 'shipment-readiness',
          eyebrow: 'Pipeline',
          title: oldestOpenShipment ? `${oldestOpenShipment.trade_id} is the oldest open ticket` : 'Pipeline Health',
          description:
            'A compact operational pulse on what is moving, what is waiting on pricing, and what has already closed.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content:
            shipments.length > 0 ? (
              <div className="shipment-kpi-stack">
                <div className="shipment-kpi-row">
                  <span>In Progress</span>
                  <strong>{formatNumber(inProgressShipments.length, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Ready Queue</span>
                  <strong>{formatNumber(readyShipments.length, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Completed</span>
                  <strong>{formatNumber(completedShipments.length, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Pricing Pending</span>
                  <strong>{formatNumber(pricingPendingOpen, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Oldest Open Age</span>
                  <strong>{oldestOpenShipment ? `${oldestOpenShipment.age_days}d` : '—'}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Latest Update</span>
                  <strong>{latestShipmentUpdate ? formatDate(latestShipmentUpdate.last_updated_at) : '—'}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No pipeline yet</strong>
                <p>The readiness pulse will appear once shipment candidates exist.</p>
              </div>
            ),
        },
        {
          id: 'shipment-blockers',
          eyebrow: 'Attention',
          title: blockedShipments.length > 0 ? 'Operational Blockers' : 'No blockers in queue',
          description:
            'The fastest way to see which tickets are waiting on missing trade data before logistics can proceed.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content:
            blockedShipments.length > 0 ? (
              <div className="position-list">
                {blockedShipments.map((shipment) => (
                  <article key={shipment.shipment_id} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{shipment.trade_id}</strong>
                        <span>
                          {shipment.commodity} • {shipment.direction} • {shipment.book}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${shipmentTone(shipment.status)}`}>
                        {formatShipmentStatus(shipment.status)}
                      </span>
                    </div>
                    <ul className="shipment-blocker-list">
                      {shipment.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                    <div className="shipment-card-actions">
                      <span>{volumeLabel(shipment, formatNumber)}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(shipment.trade_id)}>
                        Open Trade
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>Queue is clear</strong>
                <p>No active shipment tickets are currently blocked by missing operational inputs.</p>
              </div>
            ),
        },
        {
          id: 'shipment-queue',
          eyebrow: 'Board',
          title: 'Shipment Queue',
          description:
            'A logistics-facing board over the source trades, ordered so blocked tickets surface first and completed flows drop to the bottom.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            shipments.length > 0 ? (
              <div className="position-list">
                {shipments.map((shipment) => (
                  <article key={shipment.shipment_id} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{shipment.commodity}</strong>
                        <span>
                          {shipment.trade_id}
                          {shipment.external_trade_id ? ` • ${shipment.external_trade_id}` : ''}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${shipmentTone(shipment.status)}`}>
                        {formatShipmentStatus(shipment.status)}
                      </span>
                    </div>

                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">{formatCommodityClass(shipment.commodity_class)}</span>
                      <span className="entity-chip entity-chip-soft">{shipment.direction}</span>
                      <span className="entity-chip entity-chip-soft">Pricing {shipment.pricing_status}</span>
                      <span className="entity-chip entity-chip-soft">Settlement {shipment.settlement_status}</span>
                      <span className="entity-chip entity-chip-soft">{shipment.book}</span>
                    </div>

                    <div className="shipment-card-copy">
                      <p>{shipmentNarrative(shipment)}</p>
                      <p>
                        {volumeLabel(shipment, formatNumber)} • Booked {formatDate(shipment.booked_at)} • Updated{' '}
                        {formatDate(shipment.last_updated_at)} • Open {shipment.age_days}d
                      </p>
                    </div>

                    {shipment.blockers.length > 0 ? (
                      <ul className="shipment-blocker-list">
                        {shipment.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="shipment-card-actions">
                      <span>{shipment.counterparty ?? 'Counterparty TBD'}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(shipment.trade_id)}>
                        Open Trade
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No shipment queue</strong>
                <p>The board will populate automatically from active physical trades once tickets are captured.</p>
              </div>
            ),
        },
      ]}
    />
  )
}
