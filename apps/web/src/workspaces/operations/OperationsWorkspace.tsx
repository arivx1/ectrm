import type { UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import { TileLayout } from '../../shared/ui/TileLayout'
import type {
  DeliveryRecord,
  ExternalDataSyncStatusRecord,
  TradeWorkflowItemRecord,
  TradingSourceRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { SystemStatusPanel } from '../dashboard/SystemStatusPanel'
import { WorkflowQueueEditor } from './WorkflowQueueEditor'

type OperationsWorkspaceProps = {
  authSession: StoredAuthSession | null
  deliveries: DeliveryRecord[]
  workItems: TradeWorkflowItemRecord[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  weatherSyncStatus: WeatherSyncStatusRecord | null
  tradingSources: TradingSourceRecord[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  workflowMutationError: string
  workflowMutationPendingId: number | null
  onOpenTrade: (tradeId: string) => void
  onSaveWorkflowItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

function formatModeFamily(value: DeliveryRecord['mode_family']): string {
  return value.replaceAll('_', ' ')
}

function dueWithinDays(value: string | null | undefined, days: number): boolean {
  if (!value) {
    return false
  }

  const dueAt = Date.parse(value)
  if (Number.isNaN(dueAt)) {
    return false
  }

  const differenceMs = dueAt - Date.now()
  return differenceMs >= 0 && differenceMs <= days * 86_400_000
}

export function OperationsWorkspace({
  authSession,
  deliveries,
  workItems,
  externalDataSyncStatus,
  weatherSyncStatus,
  tradingSources,
  formatCommodityClass,
  formatNumber,
  formatDate,
  formatDateOnly,
  workflowMutationError,
  workflowMutationPendingId,
  onOpenTrade,
  onSaveWorkflowItem,
}: OperationsWorkspaceProps) {
  const openDeliveries = deliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const blockedDeliveries = deliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const operationsWorkItems = workItems.filter((item) => item.queue === 'operations')
  const openOperationsWorkItems = operationsWorkItems.filter((item) => !item.is_closed)
  const unassignedWorkflowItems = openOperationsWorkItems.filter((item) => !item.owner?.trim()).length
  const dueSoonWorkflowItems = openOperationsWorkItems.filter((item) => dueWithinDays(item.due_at, 2)).length
  const blockedWorkflowItems = openOperationsWorkItems.filter(
    (item) => item.credit_hold_active || item.is_overdue || item.status === 'DISPUTED' || item.status === 'PENDING_REVIEW',
  ).length
  const modeCoverage = ['LOGISTICS', 'NETWORK_FLOW', 'POWER_SCHEDULE']
    .map((modeFamily) => ({
      modeFamily,
      count: deliveries.filter((delivery) => delivery.mode_family === modeFamily).length,
    }))
    .filter((row) => row.count > 0)
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
              openDeliveries.length > 0 || openOperationsWorkItems.length > 0 ? (
                <div className="dashboard-report-grid">
                  <article className="dashboard-report-card">
                    <span>Open Workflow</span>
                    <strong>{formatNumber(openOperationsWorkItems.length, 0)}</strong>
                    <p>Confirmation, nomination, and allocation tasks still open on the live book.</p>
                  </article>
                  <article className="dashboard-report-card">
                    <span>Unassigned</span>
                    <strong>{formatNumber(unassignedWorkflowItems, 0)}</strong>
                    <p>Open post-trade tickets that still need a named owner.</p>
                  </article>
                  <article className="dashboard-report-card">
                    <span>Due Next 48h</span>
                    <strong>{formatNumber(dueSoonWorkflowItems, 0)}</strong>
                    <p>Near-term operational handoffs likely to hit the desk this week.</p>
                  </article>
                  <article className="dashboard-report-card">
                    <span>Blocked Queue</span>
                    <strong>{formatNumber(Math.max(blockedDeliveries.length, blockedWorkflowItems), 0)}</strong>
                    <p>Either the delivery projection or the workflow queue is currently carrying an execution blocker.</p>
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
            title: openOperationsWorkItems.length > 0 ? 'Operational Work Queue' : 'No open work queue',
            description: 'Editable queue cards for confirmation, nomination, and allocation follow-up across the active physical book.',
            span: 'full',
            availableSpans: ['full', 'wide'],
            content: openOperationsWorkItems.length > 0 ? (
              <WorkflowQueueEditor
                key={openOperationsWorkItems.map((item) => `${item.item_id}:${item.version}`).join('|')}
                authSession={authSession}
                items={openOperationsWorkItems}
                savingItemId={workflowMutationPendingId}
                saveError={workflowMutationError}
                formatCommodityClass={formatCommodityClass}
                formatDate={formatDate}
                formatDateOnly={formatDateOnly}
                onOpenTrade={onOpenTrade}
                onSaveItem={onSaveWorkflowItem}
              />
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
