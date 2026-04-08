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
import { DocumentIngestionPanel } from './DocumentIngestionPanel'
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
  const activeCreditExceptions = operationsWorkItems
    .filter(
      (item) =>
        item.workflow_type === 'CREDIT_APPROVAL' &&
        item.active_credit_exception &&
        !item.active_credit_exception.released_at,
    )
    .sort((left, right) => {
      const leftExpiry = Date.parse(left.active_credit_exception?.expires_at ?? '')
      const rightExpiry = Date.parse(right.active_credit_exception?.expires_at ?? '')
      if (!Number.isNaN(leftExpiry) && !Number.isNaN(rightExpiry) && leftExpiry !== rightExpiry) {
        return leftExpiry - rightExpiry
      }
      return left.trade_id.localeCompare(right.trade_id)
    })
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
    <div className="stack operations-workspace">
      <TileLayout
        workspaceId="operations"
        workspaceLabel="Operations"
        authSession={authSession}
        toolbarDescription={`Drag tiles to reorder, resize, or hide them for your control loop. ${
          authSession ? 'Layout changes save to your account.' : 'Layouts stay in this browser until you sign in.'
        }`}
        tiles={[
          {
            id: 'operations-system',
            eyebrow: 'Operations',
            title: 'System Snapshot',
            description: 'Connectivity, platform health, and feed freshness in one compact tile.',
            span: 'half',
            availableSpans: ['full', 'wide', 'half'],
            content: <SystemStatusPanel variant="compact" />,
          },
          {
            id: 'operations-snapshot',
            eyebrow: 'Workflow',
            title: 'Operations Snapshot',
            description: 'The counts that matter right now across open handoffs and blockers.',
            span: 'half',
            availableSpans: ['full', 'wide', 'half'],
            content:
              openDeliveries.length > 0 || openOperationsWorkItems.length > 0 ? (
                <div className="dashboard-report-grid">
                  <article className="dashboard-report-card">
                    <span>Open Workflow</span>
                    <strong>{formatNumber(openOperationsWorkItems.length, 0)}</strong>
                    <p>Confirmation, nomination, allocation, and option settlement tasks still open on the live book.</p>
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
                  <article className="dashboard-report-card">
                    <span>Active Credit Exceptions</span>
                    <strong>{formatNumber(activeCreditExceptions.length, 0)}</strong>
                    <p>Trades running under an approved credit envelope that still need expiry and headroom monitoring.</p>
                  </article>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No operational queue</strong>
                  <p>Create active physical trades or close options through exercise and assignment to populate the operations workspace.</p>
                </div>
              ),
          },
          {
            id: 'operations-queue',
            eyebrow: 'Critical Path',
            title: openOperationsWorkItems.length > 0 ? 'Operational Work Queue' : 'No open work queue',
            description: 'Editable queue items for confirmation, nomination, allocation, and settlement follow-up.',
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
            id: 'operations-documents',
            eyebrow: 'Document Intake',
            title: 'Document Intake',
            description: 'Upload and review confirmations, invoices, and transport documents.',
            span: 'half',
            availableSpans: ['full', 'wide', 'half'],
            content: (
              <DocumentIngestionPanel
                authSession={authSession}
                formatDate={formatDate}
                compact
              />
            ),
          },
          {
            id: 'operations-credit-exceptions',
            eyebrow: 'Credit',
            title: activeCreditExceptions.length > 0 ? 'Active Credit Exceptions' : 'No active credit exceptions',
            description: 'Approved exceptions still on the book with expiry and headroom monitoring.',
            span: 'half',
            availableSpans: ['full', 'wide', 'half'],
            content: activeCreditExceptions.length > 0 ? (
              <div className="position-list">
                {activeCreditExceptions.map((item) => {
                  const exception = item.active_credit_exception
                  if (!exception) {
                    return null
                  }
                  return (
                    <article key={`credit-exception-${item.item_id}`} className="position-card shipment-card">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{item.trade_id}</strong>
                          <span>
                            {item.commodity} • {item.counterparty ?? 'Counterparty TBD'} • {item.book}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${exception.revalidation_required ? 'blocked' : 'active'}`}>
                          {exception.revalidation_required ? 'REVIEW AGAIN' : 'WITHIN ENVELOPE'}
                        </span>
                      </div>
                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">
                          Expires {formatDateOnly(exception.expires_at)}
                        </span>
                        <span className="entity-chip entity-chip-soft">
                          Ceiling {exception.limit_currency_code} {formatNumber(exception.approved_projected_exposure_amount, 2)}
                        </span>
                        <span className="entity-chip entity-chip-soft">
                          Headroom{' '}
                          {exception.remaining_headroom_amount !== null
                            ? `${exception.limit_currency_code} ${formatNumber(exception.remaining_headroom_amount, 2)}`
                            : '—'}
                        </span>
                      </div>
                      <div className="shipment-card-copy">
                        <p>{exception.approval_comment}</p>
                        <p>
                          Approved by {exception.approved_by} on {formatDate(exception.approved_at)}.
                        </p>
                        {exception.revalidation_required ? (
                          <p className="field-error">
                            Revalidation reason: {exception.revalidation_reason?.replaceAll('_', ' ') ?? 'Credit review required'}.
                          </p>
                        ) : null}
                      </div>
                      <div className="shipment-card-actions">
                        <span>{formatCommodityClass(item.commodity_class)}</span>
                        <button type="button" className="button button-ghost" onClick={() => onOpenTrade(item.trade_id)}>
                          Open Trade
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No live exception envelopes</strong>
                <p>Approved credit exceptions will appear here until they are revalidated, cleared, or expire.</p>
              </div>
            ),
          },
          {
            id: 'operations-coverage',
            eyebrow: 'Coverage',
            title: 'Operational Coverage',
            description: 'Active delivery obligations by operating mode.',
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
            title: 'Feed Support',
            description: 'Freshness and source coverage behind the operational surface.',
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
