import { TileLayout } from '../../shared/ui/TileLayout'
import type {
  DeliveryRecord,
  ExternalDataSyncStatusRecord,
  TradingSourceRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { SystemStatusPanel } from '../dashboard/SystemStatusPanel'

type OperationsWorkspaceProps = {
  authSession: StoredAuthSession | null
  deliveries: DeliveryRecord[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  weatherSyncStatus: WeatherSyncStatusRecord | null
  tradingSources: TradingSourceRecord[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
}

function formatModeFamily(value: DeliveryRecord['mode_family']): string {
  return value.replaceAll('_', ' ')
}

export function OperationsWorkspace({
  authSession,
  deliveries,
  externalDataSyncStatus,
  weatherSyncStatus,
  tradingSources,
  formatCommodityClass,
  formatNumber,
  formatDate,
  onOpenTrade,
}: OperationsWorkspaceProps) {
  const openDeliveries = deliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const blockedDeliveries = deliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const confirmationPending = openDeliveries.filter((delivery) => delivery.confirmation_status !== 'CONFIRMED').length
  const invoicePending = openDeliveries.filter(
    (delivery) => !['NOT_REQUIRED', 'ISSUED', 'APPROVED'].includes(delivery.invoice_status),
  ).length
  const overduePayments = openDeliveries.filter((delivery) => delivery.payment_status === 'OVERDUE').length
  const modeCoverage = ['LOGISTICS', 'NETWORK_FLOW', 'POWER_SCHEDULE']
    .map((modeFamily) => ({
      modeFamily,
      count: deliveries.filter((delivery) => delivery.mode_family === modeFamily).length,
    }))
    .filter((row) => row.count > 0)
  const workflowQueue = [...openDeliveries]
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status.localeCompare(right.status)
      }
      return right.blocker_count - left.blocker_count
    })
    .slice(0, 8)
  const tradingSourceCounts = ['tier_0', 'tier_1', 'tier_2', 'tier_3']
    .map((criticality) => ({
      criticality,
      count: tradingSources.filter((source) => source.criticality === criticality).length,
    }))
    .filter((row) => row.count > 0)

  return (
    <div className="stack">
      <SystemStatusPanel />

      <TileLayout
        workspaceId="operations"
        workspaceLabel="Operations"
        authSession={authSession}
        tiles={[
          {
            id: 'operations-snapshot',
            eyebrow: 'Workflow',
            title: 'Operations Snapshot',
            description: 'Operational control counts that sit closer to the trader and scheduler loop than raw telemetry alone.',
            span: 'full',
            availableSpans: ['full', 'wide'],
            content:
              deliveries.length > 0 ? (
                <div className="dashboard-report-grid">
                  <article className="dashboard-report-card">
                    <span>Open Deliveries</span>
                    <strong>{formatNumber(openDeliveries.length, 0)}</strong>
                    <p>Live physical obligations still moving through execution or post-trade workflow.</p>
                  </article>
                  <article className="dashboard-report-card">
                    <span>Blocked Queue</span>
                    <strong>{formatNumber(blockedDeliveries.length, 0)}</strong>
                    <p>Rows currently held up by missing operational data or incomplete workflow steps.</p>
                  </article>
                  <article className="dashboard-report-card">
                    <span>Confirmation Pending</span>
                    <strong>{formatNumber(confirmationPending, 0)}</strong>
                    <p>Open obligations still waiting on completed confirmation state.</p>
                  </article>
                  <article className="dashboard-report-card">
                    <span>Settlement Attention</span>
                    <strong>{formatNumber(invoicePending + overduePayments, 0)}</strong>
                    <p>Invoice-pending plus overdue-payment rows visible from the live delivery set.</p>
                  </article>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No operational queue</strong>
                  <p>Create active physical trades to populate the operations workspace.</p>
                </div>
              ),
          },
          {
            id: 'operations-queue',
            eyebrow: 'Critical Path',
            title: workflowQueue.length > 0 ? 'Operational Work Queue' : 'No open work queue',
            description: 'Blocked and in-flight delivery rows ordered to surface the most actionable operational tickets first.',
            span: 'full',
            availableSpans: ['full', 'wide'],
            content: workflowQueue.length > 0 ? (
              <div className="position-list">
                {workflowQueue.map((delivery) => (
                  <article key={delivery.delivery_id} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{delivery.trade_id}</strong>
                        <span>
                          {delivery.commodity} • {formatModeFamily(delivery.mode_family)} • {delivery.book}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${delivery.status === 'BLOCKED' ? 'blocked' : 'active'}`}>
                        {delivery.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">{formatCommodityClass(delivery.commodity_class)}</span>
                      <span className="entity-chip entity-chip-soft">Confirmation {delivery.confirmation_status}</span>
                      <span className="entity-chip entity-chip-soft">Nomination {delivery.nomination_status}</span>
                      <span className="entity-chip entity-chip-soft">Invoice {delivery.invoice_status}</span>
                      <span className="entity-chip entity-chip-soft">Payment {delivery.payment_status}</span>
                    </div>
                    {delivery.blockers.length > 0 ? (
                      <ul className="shipment-blocker-list">
                        {delivery.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="shipment-card-copy">
                        <p>No explicit blockers are currently projected on this row.</p>
                      </div>
                    )}
                    <div className="shipment-card-actions">
                      <span>Updated {formatDate(delivery.last_updated_at)}</span>
                      <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                        Open Trade
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No active delivery work</strong>
                <p>The work queue will appear once delivery obligations exist.</p>
              </div>
            ),
          },
          {
            id: 'operations-coverage',
            eyebrow: 'Coverage',
            title: 'Operational Coverage',
            description: 'Cross-mode visibility so logistics, network flow, and power scheduling obligations stay on one page.',
            span: 'half',
            availableSpans: ['full', 'wide', 'half'],
            content: modeCoverage.length > 0 ? (
              <div className="position-class-grid">
                {modeCoverage.map((row) => (
                  <article key={row.modeFamily} className="position-class-card">
                    <span>{formatModeFamily(row.modeFamily as DeliveryRecord['mode_family'])}</span>
                    <strong>{formatNumber(row.count, 0)}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No operational coverage yet</strong>
                <p>Mode coverage will appear once active deliveries are loaded.</p>
              </div>
            ),
          },
          {
            id: 'operations-feeds',
            eyebrow: 'Support Systems',
            title: 'Feed and Registry Support',
            description: 'Operational context that keeps the workflow surface grounded in data freshness and source coverage.',
            span: 'half',
            availableSpans: ['full', 'wide', 'half'],
            content: (
              <div className="shipment-kpi-stack">
                <div className="shipment-kpi-row">
                  <span>External Data Health</span>
                  <strong>
                    {externalDataSyncStatus
                      ? `${formatNumber(externalDataSyncStatus.healthy_provider_count, 0)}/${formatNumber(externalDataSyncStatus.provider_count, 0)}`
                      : '—'}
                  </strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Weather Coverage</span>
                  <strong>
                    {weatherSyncStatus
                      ? `${formatNumber(weatherSyncStatus.healthy_location_count, 0)}/${formatNumber(weatherSyncStatus.active_location_count, 0)}`
                      : '—'}
                  </strong>
                </div>
                <div className="shipment-kpi-row">
                  <span>Trading Sources</span>
                  <strong>{formatNumber(tradingSources.length, 0)}</strong>
                </div>
                {tradingSourceCounts.length > 0 ? tradingSourceCounts.map((row) => (
                  <div key={row.criticality} className="shipment-kpi-row">
                    <span>{row.criticality.replaceAll('_', ' ').toUpperCase()}</span>
                    <strong>{formatNumber(row.count, 0)}</strong>
                  </div>
                )) : (
                  <div className="shipment-kpi-row">
                    <span>Registry Detail</span>
                    <strong>Awaiting admin snapshot</strong>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
