import { TileLayout } from '../../shared/ui/TileLayout'
import type { DeliveryRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type DeliveryWorkspaceProps = {
  authSession: StoredAuthSession | null
  deliveries: DeliveryRecord[]
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
  onOpenTrade: (tradeId: string) => void
}

function deliveryTone(status: DeliveryRecord['status']): 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped' {
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

function formatDeliveryStatus(status: DeliveryRecord['status']): string {
  return status.replaceAll('_', ' ')
}

function formatModeFamily(modeFamily: DeliveryRecord['mode_family']): string {
  return modeFamily.replaceAll('_', ' ')
}

function formatTransportMode(transportMode: DeliveryRecord['transport_mode']): string {
  return transportMode.replaceAll('_', ' ')
}

function formatDeliveryProfile(deliveryProfile: DeliveryRecord['delivery_profile']): string {
  return deliveryProfile.replaceAll('_', ' ')
}

function volumeLabel(delivery: DeliveryRecord, formatNumber: DeliveryWorkspaceProps['formatNumber']): string {
  if (delivery.volume === null) {
    return 'Volume TBD'
  }

  return `${formatNumber(delivery.volume, 0)} ${delivery.unit_of_measure ?? ''}`.trim()
}

function windowLabel(
  delivery: DeliveryRecord,
  formatDateOnly: DeliveryWorkspaceProps['formatDateOnly'],
): string {
  if (!delivery.delivery_start && !delivery.delivery_end) {
    return 'Window TBD'
  }

  if (delivery.delivery_start && delivery.delivery_end && delivery.delivery_start === delivery.delivery_end) {
    return formatDateOnly(delivery.delivery_start)
  }

  return `${formatDateOnly(delivery.delivery_start)} to ${formatDateOnly(delivery.delivery_end)}`
}

function deliveryNarrative(delivery: DeliveryRecord): string {
  if (delivery.mode_family === 'POWER_SCHEDULE') {
    if (delivery.status === 'READY') {
      return 'Grid schedule inputs are lined up and the delivery window is operationally ready.'
    }
    if (delivery.status === 'BLOCKED') {
      return 'The power schedule still has confirmation, scheduling, or control gaps before the delivery window can be trusted.'
    }
    return 'The power schedule exists, but pricing, invoicing, or downstream controls are still progressing.'
  }

  if (delivery.mode_family === 'NETWORK_FLOW') {
    if (delivery.status === 'READY') {
      return 'Flow details are consistent enough for pipeline-style operational handling.'
    }
    if (delivery.status === 'BLOCKED') {
      return 'The network flow is missing required operational controls, confirmation, or scheduling context.'
    }
    return 'The network delivery is active, with readiness and downstream settlement workflow still converging.'
  }

  if (delivery.transport_mode === 'UNSPECIFIED') {
    return 'The delivery is logistics-shaped, but the exact transport mode and downstream workflow still need to be captured.'
  }

  return 'The delivery is structured as a discrete logistics movement with explicit mode context and visible post-trade workflow.'
}

function tradeReferenceLabel(delivery: DeliveryRecord): string {
  return delivery.leg_no === null ? delivery.trade_id : `${delivery.trade_id} · leg ${delivery.leg_no}`
}

export function DeliveryWorkspace({
  authSession,
  deliveries,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatNumber,
  onOpenTrade,
}: DeliveryWorkspaceProps) {
  const openDeliveries = deliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const blockedDeliveries = deliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const readyDeliveries = deliveries.filter((delivery) => delivery.status === 'READY')
  const inProgressDeliveries = deliveries.filter((delivery) => delivery.status === 'IN_PROGRESS')
  const logisticsDeliveries = deliveries.filter((delivery) => delivery.mode_family === 'LOGISTICS')
  const networkDeliveries = deliveries.filter((delivery) => delivery.mode_family === 'NETWORK_FLOW')
  const powerDeliveries = deliveries.filter((delivery) => delivery.mode_family === 'POWER_SCHEDULE')
  const pricingPendingOpen = openDeliveries.filter((delivery) => delivery.pricing_status !== 'PRICED').length
  const confirmationPendingOpen = openDeliveries.filter((delivery) => delivery.confirmation_status !== 'CONFIRMED').length
  const nominationPendingOpen = openDeliveries.filter(
    (delivery) => !['NOT_REQUIRED', 'SCHEDULED', 'NOMINATED', 'COMPLETED'].includes(delivery.nomination_status),
  ).length
  const invoicePendingOpen = openDeliveries.filter(
    (delivery) => !['NOT_REQUIRED', 'ISSUED', 'APPROVED'].includes(delivery.invoice_status),
  ).length
  const overduePayments = openDeliveries.filter((delivery) => delivery.payment_status === 'OVERDUE').length
  const explicitModeMissing = logisticsDeliveries.filter((delivery) => delivery.transport_mode === 'UNSPECIFIED').length
  const nearestWindow = openDeliveries.reduce<DeliveryRecord | null>((earliest, delivery) => {
    if (!delivery.delivery_start) {
      return earliest
    }
    if (!earliest || !earliest.delivery_start || delivery.delivery_start < earliest.delivery_start) {
      return delivery
    }
    return earliest
  }, null)
  const latestDeliveryUpdate = deliveries.reduce<DeliveryRecord | null>((latest, delivery) => {
    if (!latest || delivery.last_updated_at > latest.last_updated_at) {
      return delivery
    }
    return latest
  }, null)

  return (
    <TileLayout
      workspaceId="shipments"
      workspaceLabel="Deliveries"
      authSession={authSession}
      tiles={[
        {
          id: 'shipment-summary',
          eyebrow: 'Readiness',
          title: 'Cross-Mode Delivery Board',
          description:
            'A generalized post-trade surface for discrete logistics, network flows, and scheduled power delivery obligations.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            deliveries.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Tracked Deliveries</span>
                  <strong>{formatNumber(deliveries.length, 0)}</strong>
                  <p>Every active physical obligation currently surfaced from trades and trade legs.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Logistics Moves</span>
                  <strong>{formatNumber(logisticsDeliveries.length, 0)}</strong>
                  <p>Discrete physical deliveries that still need an explicit truck, rail, barge, or vessel mode.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Pipeline Flows</span>
                  <strong>{formatNumber(networkDeliveries.length, 0)}</strong>
                  <p>Network-style flow obligations inferred from gas-style delivery characteristics.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Power Schedules</span>
                  <strong>{formatNumber(powerDeliveries.length, 0)}</strong>
                  <p>Grid-delivery obligations shaped around delivery windows rather than physical shipment assets.</p>
                </article>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No delivery activity</strong>
                <p>Create active physical trades to start populating the cross-mode delivery board.</p>
              </div>
            ),
        },
        {
          id: 'shipment-readiness',
          eyebrow: 'Pipeline',
          title: nearestWindow ? `${tradeReferenceLabel(nearestWindow)} has the nearest open window` : 'Pipeline Health',
          description:
            'A compact pulse on readiness, pricing, post-trade workflow, and the remaining places where the model still needs more explicit transport detail.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content:
            deliveries.length > 0 ? (
              <div className="shipment-kpi-stack">
                <div className="shipment-kpi-row">
                  <span>In Progress</span>
                  <strong>{formatNumber(inProgressDeliveries.length, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Ready Queue</span>
                  <strong>{formatNumber(readyDeliveries.length, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Blocked</span>
                  <strong>{formatNumber(blockedDeliveries.length, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Pricing Pending</span>
                  <strong>{formatNumber(pricingPendingOpen, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Confirmation Pending</span>
                  <strong>{formatNumber(confirmationPendingOpen, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Nomination Open</span>
                  <strong>{formatNumber(nominationPendingOpen, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Invoice Pending</span>
                  <strong>{formatNumber(invoicePendingOpen, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Overdue Payments</span>
                  <strong>{formatNumber(overduePayments, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Mode TBD</span>
                  <strong>{formatNumber(explicitModeMissing, 0)}</strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Latest Update</span>
                  <strong>{latestDeliveryUpdate ? formatDate(latestDeliveryUpdate.last_updated_at) : '—'}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No pipeline yet</strong>
                <p>The readiness pulse will appear once delivery obligations exist.</p>
              </div>
            ),
        },
        {
          id: 'shipment-blockers',
          eyebrow: 'Attention',
          title: blockedDeliveries.length > 0 ? 'Operational Blockers' : 'No blockers in queue',
          description:
            'The fastest way to see which obligations are waiting on transport mode, confirmation, scheduling, allocation, or control completeness.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content:
            blockedDeliveries.length > 0 ? (
              <div className="position-list">
                {blockedDeliveries.map((delivery) => (
                  <article key={delivery.delivery_id} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{tradeReferenceLabel(delivery)}</strong>
                        <span>
                          {delivery.commodity} • {formatModeFamily(delivery.mode_family)} • {delivery.book}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${deliveryTone(delivery.status)}`}>
                        {formatDeliveryStatus(delivery.status)}
                      </span>
                    </div>
                    <ul className="shipment-blocker-list">
                      {delivery.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                    <div className="shipment-card-actions">
                      <span>{windowLabel(delivery, formatDateOnly)}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                        Open Trade
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>Queue is clear</strong>
                <p>No active delivery obligations are currently blocked by missing operational inputs.</p>
              </div>
            ),
        },
        {
          id: 'shipment-queue',
          eyebrow: 'Board',
          title: 'Delivery Queue',
          description:
            'A cross-mode operational board ordered so the riskiest delivery obligations surface first, regardless of whether they are logistics, pipeline, or power.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            deliveries.length > 0 ? (
              <div className="position-list">
                {deliveries.map((delivery) => (
                  <article key={delivery.delivery_id} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{delivery.commodity}</strong>
                        <span>
                          {tradeReferenceLabel(delivery)}
                          {delivery.external_trade_id ? ` • ${delivery.external_trade_id}` : ''}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${deliveryTone(delivery.status)}`}>
                        {formatDeliveryStatus(delivery.status)}
                      </span>
                    </div>

                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">{formatCommodityClass(delivery.commodity_class)}</span>
                      <span className="entity-chip entity-chip-soft">{formatModeFamily(delivery.mode_family)}</span>
                      <span className="entity-chip entity-chip-soft">
                        {delivery.transport_mode === 'UNSPECIFIED' ? 'Mode TBD' : formatTransportMode(delivery.transport_mode)}
                      </span>
                      <span className="entity-chip entity-chip-soft">{formatDeliveryProfile(delivery.delivery_profile)}</span>
                      <span className="entity-chip entity-chip-soft">Pricing {delivery.pricing_status}</span>
                      <span className="entity-chip entity-chip-soft">Confirmation {delivery.confirmation_status}</span>
                      <span className="entity-chip entity-chip-soft">Nomination {delivery.nomination_status}</span>
                      <span className="entity-chip entity-chip-soft">Allocation {delivery.allocation_status}</span>
                      <span className="entity-chip entity-chip-soft">Invoice {delivery.invoice_status}</span>
                      <span className="entity-chip entity-chip-soft">Payment {delivery.payment_status}</span>
                      <span className="entity-chip entity-chip-soft">Settlement {delivery.settlement_status}</span>
                    </div>

                    <div className="shipment-card-copy">
                      <p>{deliveryNarrative(delivery)}</p>
                      <p>
                        {volumeLabel(delivery, formatNumber)} • {delivery.location_code ?? 'Location TBD'} •{' '}
                        {windowLabel(delivery, formatDateOnly)}
                      </p>
                      <p>
                        Booked {formatDate(delivery.booked_at)} • Updated {formatDate(delivery.last_updated_at)} • Open{' '}
                        {delivery.age_days}d
                      </p>
                    </div>

                    {delivery.blockers.length > 0 ? (
                      <ul className="shipment-blocker-list">
                        {delivery.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="shipment-card-actions">
                      <span>{delivery.counterparty ?? 'Counterparty TBD'}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                        Open Trade
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No delivery queue</strong>
                <p>The board will populate automatically from active physical trades once obligations are captured.</p>
              </div>
            ),
        },
      ]}
    />
  )
}
