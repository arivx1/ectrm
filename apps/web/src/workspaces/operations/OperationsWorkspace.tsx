import { useMemo, useState } from 'react'

import { useLatestPriceIndexMarks } from '../../entities/market-data/useLatestPriceIndexMarks'
import type {
  CreateTradeConfirmationInput,
  IssueTradeConfirmationInput,
  RespondTradeConfirmationInput,
  UpdateTradeConfirmationInput,
} from '../../entities/confirmations/api'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import type { CreateTradeWorkflowItemInput, UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import { normalizeAppRouteHandoff, type AppRouteHandoff } from '../../shared/appRouteHandoff'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import { formatCurrencyAmount } from '../../shared/format'
import { buildOpenOptionActionQueue, type OpenOptionValuation } from '../../shared/optionExposure'
import { TileLayout } from '../../shared/ui/TileLayout'
import { TileSectionGrid, type TileSectionGridItem } from '../../shared/ui/TileSectionGrid'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import type {
  DeliveryRecord,
  ExternalDataSyncStatusRecord,
  Trade,
  TradeConfirmationRecord,
  TradeWorkflowItemRecord,
  TradingSourceRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import type { OptionLifecycleEventType } from '../../shared/trading'
import { SystemStatusPanel } from '../dashboard/SystemStatusPanel'
import { DocumentIngestionPanel } from './DocumentIngestionPanel'
import { OperationalBoardController } from './OperationalBoardController'
import { renderOperationalInlineBoard } from './operationalInlineBoardRegistry'
import { resolveOperationalWorkboardDefinition } from './operationalWorkboardRegistry'

type OperationsWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff: AppRouteHandoff | null
  globalFilter: string
  activeTrades: Trade[]
  confirmations: TradeConfirmationRecord[]
  deliveries: DeliveryRecord[]
  workItems: TradeWorkflowItemRecord[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  weatherSyncStatus: WeatherSyncStatusRecord | null
  tradingSources: TradingSourceRecord[]
  operationalResourceDescriptors: OperationalResourceDescriptor[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  confirmationMutationError: string
  confirmationMutationPendingKey: string | null
  workflowMutationError: string
  workflowCreationPendingTradeId: string | null
  workflowMutationPendingId: number | null
  onCreateConfirmation: (tradeId: string, payload: CreateTradeConfirmationInput) => Promise<void>
  onIssueConfirmation: (confirmationId: number, payload: IssueTradeConfirmationInput) => Promise<void>
  onRespondConfirmation: (confirmationId: number, payload: RespondTradeConfirmationInput) => Promise<void>
  onCreateWorkflowItem: (
    tradeId: string,
    payload: Omit<CreateTradeWorkflowItemInput, 'trade_id'>,
  ) => Promise<void>
  onClearHandoff: () => void
  onOpenTrade: (tradeId: string) => void
  onOptionLifecycleEvent: (tradeId: string, eventType: OptionLifecycleEventType) => Promise<void>
  optionLifecycleSubmittingEvent: OptionLifecycleEventType | null
  optionLifecycleSubmittingTradeId: string | null
  onBookUnderlyingTrade: (itemId: number) => Promise<void>
  onSaveConfirmation: (confirmationId: number, payload: UpdateTradeConfirmationInput) => Promise<void>
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

function openOptionReferenceMarkLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.referencePrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.referencePrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionBreakEvenLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.breakEvenPrice === null) {
    return '—'
  }

  return `${formatCurrencyAmount(valuation.breakEvenPrice, valuation.referenceCurrencyCode)}${
    valuation.referenceUnitCode ? ` / ${valuation.referenceUnitCode}` : ''
  }`
}

function openOptionExpiryPnlLabel(
  valuation: OpenOptionValuation,
): string {
  if (valuation.expiryPnlAtMark === null) {
    return '—'
  }
  if (valuation.expiryPnlAtMark > 0) {
    return `Gain ${formatCurrencyAmount(Math.abs(valuation.expiryPnlAtMark), valuation.referenceCurrencyCode)}`
  }
  if (valuation.expiryPnlAtMark < 0) {
    return `Loss ${formatCurrencyAmount(Math.abs(valuation.expiryPnlAtMark), valuation.referenceCurrencyCode)}`
  }
  return 'Break-even'
}

function openOptionExpiryStateLabel(
  valuation: OpenOptionValuation,
): string {
  switch (valuation.expiryState) {
    case 'PAST_EXPIRY_UNRESOLVED':
      return 'Past expiry unresolved'
    case 'EXPIRING_TODAY':
      return 'Expiring today'
    case 'EXPIRING_SOON':
      return 'Expiring soon'
    default:
      return 'Open'
  }
}

function optionLifecycleActionLabel(action: OptionLifecycleEventType): string {
  switch (action) {
    case 'OptionExercised':
      return 'Exercise'
    case 'OptionAssigned':
      return 'Assign'
    case 'OptionExpired':
      return 'Expire'
  }
}

function optionLifecyclePendingLabel(action: OptionLifecycleEventType): string {
  switch (action) {
    case 'OptionExercised':
      return 'Exercising...'
    case 'OptionAssigned':
      return 'Assigning...'
    case 'OptionExpired':
      return 'Expiring...'
  }
}

function matchesOperationsTradeFilter(trade: Trade, query: string): boolean {
  return matchesTextFilter(query, [
    trade.trade_id,
    trade.book,
    trade.portfolio,
    trade.counterparty,
    trade.commodity_class,
    trade.commodity,
    trade.instrument_type,
    trade.pricing_status,
    trade.confirmation_status,
    trade.nomination_status,
    trade.allocation_status,
    trade.actualization_status,
    trade.settlement_status,
    trade.status,
  ])
}

function matchesConfirmationScreenFilter(confirmation: TradeConfirmationRecord, query: string): boolean {
  return matchesTextFilter(query, [
    confirmation.confirmation_id,
    confirmation.trade_id,
    confirmation.confirmation_number,
    confirmation.status,
    confirmation.receipt_status,
    confirmation.comparison_status,
    confirmation.book,
    confirmation.portfolio,
    confirmation.counterparty,
    confirmation.commodity_class,
    confirmation.commodity,
    confirmation.workflow_owner,
    confirmation.source_document_display_name,
    confirmation.last_issue_recipient,
    confirmation.notes,
  ])
}

function matchesDeliveryScreenFilter(delivery: DeliveryRecord, query: string): boolean {
  return matchesTextFilter(query, [
    delivery.delivery_id,
    delivery.trade_id,
    delivery.book,
    delivery.portfolio,
    delivery.counterparty,
    delivery.commodity_class,
    delivery.commodity,
    delivery.mode_family,
    delivery.transport_mode,
    delivery.status,
    delivery.execution_status,
    delivery.location_code,
    delivery.operations_owner,
    delivery.external_reference,
    delivery.ops_notes,
  ])
}

function matchesWorkflowItemScreenFilter(item: TradeWorkflowItemRecord, query: string): boolean {
  return matchesTextFilter(query, [
    item.item_id,
    item.trade_id,
    item.linked_trade_id,
    item.queue,
    item.workflow_type,
    item.status,
    item.owner,
    item.book,
    item.portfolio,
    item.counterparty,
    item.commodity_class,
    item.commodity,
    item.notes,
    item.credit_approval_status,
    item.credit_hold_reason,
  ])
}

function matchesTradingSourceScreenFilter(source: TradingSourceRecord, query: string): boolean {
  return matchesTextFilter(query, [
    source.source_id,
    source.source_name,
    source.source_category,
    source.dataset_name,
    source.business_purpose,
    source.asset_classes,
    source.products_or_regions,
    source.system_owner,
    source.business_owner,
    source.vendor_or_origin,
    source.criticality,
    source.status,
  ])
}

export function OperationsWorkspace({
  authSession,
  routeHandoff,
  globalFilter,
  activeTrades,
  confirmations,
  deliveries,
  workItems,
  externalDataSyncStatus,
  weatherSyncStatus,
  tradingSources,
  operationalResourceDescriptors,
  formatCommodityClass,
  formatNumber,
  formatDate,
  formatDateOnly,
  confirmationMutationError,
  confirmationMutationPendingKey,
  workflowMutationError,
  workflowCreationPendingTradeId,
  workflowMutationPendingId,
  onCreateConfirmation,
  onIssueConfirmation,
  onRespondConfirmation,
  onCreateWorkflowItem,
  onClearHandoff,
  onOpenTrade,
  onOptionLifecycleEvent,
  optionLifecycleSubmittingEvent,
  optionLifecycleSubmittingTradeId,
  onBookUnderlyingTrade,
  onSaveConfirmation,
  onSaveWorkflowItem,
}: OperationsWorkspaceProps) {
  const [screenFilter, setScreenFilter] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)
  const directlyMatchedTrades = useMemo(
    () => activeTrades.filter((trade) => matchesOperationsTradeFilter(trade, effectiveScreenFilter)),
    [activeTrades, effectiveScreenFilter],
  )
  const directlyMatchedConfirmations = useMemo(
    () =>
      confirmations.filter((confirmation) => matchesConfirmationScreenFilter(confirmation, effectiveScreenFilter)),
    [confirmations, effectiveScreenFilter],
  )
  const directlyMatchedDeliveries = useMemo(
    () => deliveries.filter((delivery) => matchesDeliveryScreenFilter(delivery, effectiveScreenFilter)),
    [deliveries, effectiveScreenFilter],
  )
  const directlyMatchedWorkItems = useMemo(
    () => workItems.filter((item) => matchesWorkflowItemScreenFilter(item, effectiveScreenFilter)),
    [effectiveScreenFilter, workItems],
  )
  const visibleTradeIds = useMemo(
    () =>
      new Set([
        ...directlyMatchedTrades.map((trade) => trade.trade_id),
        ...directlyMatchedConfirmations.map((confirmation) => confirmation.trade_id),
        ...directlyMatchedDeliveries.map((delivery) => delivery.trade_id),
        ...directlyMatchedWorkItems.map((item) => item.trade_id),
      ]),
    [directlyMatchedConfirmations, directlyMatchedDeliveries, directlyMatchedTrades, directlyMatchedWorkItems],
  )
  const visibleActiveTrades = useMemo(
    () => activeTrades.filter((trade) => visibleTradeIds.has(trade.trade_id)),
    [activeTrades, visibleTradeIds],
  )
  const visibleConfirmations = useMemo(
    () => confirmations.filter((confirmation) => visibleTradeIds.has(confirmation.trade_id)),
    [confirmations, visibleTradeIds],
  )
  const visibleDeliveries = useMemo(
    () => deliveries.filter((delivery) => visibleTradeIds.has(delivery.trade_id)),
    [deliveries, visibleTradeIds],
  )
  const visibleWorkItems = useMemo(
    () => workItems.filter((item) => visibleTradeIds.has(item.trade_id)),
    [visibleTradeIds, workItems],
  )
  const visibleTradingSources = useMemo(
    () => tradingSources.filter((source) => matchesTradingSourceScreenFilter(source, effectiveScreenFilter)),
    [effectiveScreenFilter, tradingSources],
  )
  const activeOptionTrades = visibleActiveTrades.filter((trade) => trade.instrument_type === 'OPTION')
  const {
    latestMarksByCode,
    loading: latestMarksLoading,
    error: latestMarksError,
  } = useLatestPriceIndexMarks(activeOptionTrades.map((trade) => trade.price_index_code))
  const openOptionActionQueue = buildOpenOptionActionQueue(activeOptionTrades, latestMarksByCode)
  const openDeliveries = visibleDeliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const blockedDeliveries = visibleDeliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const operationsWorkItems = visibleWorkItems.filter((item) => item.queue === 'operations')
  const confirmationWorkItems = operationsWorkItems.filter((item) => item.workflow_type === 'CONFIRMATION')
  const openOperationsWorkItems = operationsWorkItems.filter((item) => !item.is_closed)
  const managedConfirmationTradeIds = visibleConfirmations
    .filter((confirmation) => confirmation.is_current)
    .map((confirmation) => confirmation.trade_id)
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
      count: visibleDeliveries.filter((delivery) => delivery.mode_family === modeFamily).length,
    }))
    .filter((row) => row.count > 0)
  const tradingSourceCounts = ['tier_0', 'tier_1', 'tier_2', 'tier_3']
    .map((criticality) => ({
      criticality,
      count: visibleTradingSources.filter((source) => source.criticality === criticality).length,
    }))
    .filter((row) => row.count > 0)
  const confirmationLedgerWorkboard = resolveOperationalWorkboardDefinition(
    'confirmationLedger',
    operationalResourceDescriptors,
  )
  const workflowQueueWorkboard = resolveOperationalWorkboardDefinition(
    'workflowQueue',
    operationalResourceDescriptors,
  )
  const normalizedRouteHandoff = normalizeAppRouteHandoff(routeHandoff)
  const routeHandoffFocusTradeId =
    normalizedRouteHandoff?.focus.type === 'trade'
      ? normalizedRouteHandoff.focus.id
      : normalizedRouteHandoff && normalizedRouteHandoff.tradeId !== normalizedRouteHandoff.focus.id
        ? normalizedRouteHandoff.tradeId
        : null
  function clearWorkspaceHandoff() {
    setScreenFilter('')
    onClearHandoff()
  }
  const operationsSnapshotCards: TileSectionGridItem[] = [
    {
      id: 'open-workflow',
      title: 'Open Workflow',
      content: (
        <>
          <span>Open Workflow</span>
          <strong>{formatNumber(openOperationsWorkItems.length, 0)}</strong>
          <p>Confirmation, nomination, allocation, and option settlement tasks still open on the live book.</p>
        </>
      ),
    },
    {
      id: 'unassigned',
      title: 'Unassigned',
      content: (
        <>
          <span>Unassigned</span>
          <strong>{formatNumber(unassignedWorkflowItems, 0)}</strong>
          <p>Open post-trade tickets that still need a named owner.</p>
        </>
      ),
    },
    {
      id: 'due-next-48h',
      title: 'Due Next 48h',
      content: (
        <>
          <span>Due Next 48h</span>
          <strong>{formatNumber(dueSoonWorkflowItems, 0)}</strong>
          <p>Near-term operational handoffs likely to hit the desk this week.</p>
        </>
      ),
    },
    {
      id: 'blocked-queue',
      title: 'Blocked Queue',
      content: (
        <>
          <span>Blocked Queue</span>
          <strong>{formatNumber(Math.max(blockedDeliveries.length, blockedWorkflowItems), 0)}</strong>
          <p>Either the delivery projection or the workflow queue is currently carrying an execution blocker.</p>
        </>
      ),
    },
    {
      id: 'active-credit-exceptions',
      title: 'Active Credit Exceptions',
      content: (
        <>
          <span>Active Credit Exceptions</span>
          <strong>{formatNumber(activeCreditExceptions.length, 0)}</strong>
          <p>Trades running under an approved credit envelope that still need expiry and headroom monitoring.</p>
        </>
      ),
    },
    {
      id: 'option-expiry-alerts',
      title: 'Option Expiry Alerts',
      content: (
        <>
          <span>Option Expiry Alerts</span>
          <strong>{formatNumber(openOptionActionQueue.length, 0)}</strong>
          <p>Open options inside the expiry window or still unresolved after expiry.</p>
        </>
      ),
    },
  ]

  return (
    <div className="stack operations-workspace">
      <TileLayout
        workspaceId="operations"
        workspaceLabel="Operations"
        authSession={authSession}
        headerContent={
          <>
            <WorkspaceHandoffFocusBanner
              handoff={routeHandoff}
              currentView="operations"
              clearLabel="Show Full Queue"
              onClear={clearWorkspaceHandoff}
              actions={
                routeHandoffFocusTradeId
                  ? [
                      {
                        label: 'Open Focused Trade',
                        onClick: () => onOpenTrade(routeHandoffFocusTradeId),
                      },
                    ]
                  : []
              }
            />
            <WorkspaceLocalFilterBar
              value={screenFilter}
              onChange={setScreenFilter}
              placeholder="Trade ID, workflow owner, queue status, delivery mode, or source"
              description="Filter the operations control loop locally so confirmations, deliveries, and queue work stay in sync on this screen only."
              totalCount={activeTrades.length + confirmations.length + deliveries.length + workItems.length + tradingSources.length}
              matchedCount={
                visibleActiveTrades.length +
                visibleConfirmations.length +
                visibleDeliveries.length +
                visibleWorkItems.length +
                visibleTradingSources.length
              }
              resultLabel="operations records"
              globalValue={globalFilter}
            />
          </>
        }
        sections={[
          {
            id: 'operations-snapshot-cards',
            itemIds: operationsSnapshotCards.map((card) => card.id),
          },
        ]}
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
              openDeliveries.length > 0 || openOperationsWorkItems.length > 0 || openOptionActionQueue.length > 0 ? (
                <TileSectionGrid sectionId="operations-snapshot-cards" items={operationsSnapshotCards} />
              ) : (
                <div className="empty-state">
                  <strong>No operational queue</strong>
                  <p>Once trades need confirmations, blocker clearing, or expiry decisions, the operational control loop will fill in here.</p>
                </div>
              ),
          },
          {
            id: 'operations-option-expiry',
            eyebrow: 'Option Control',
            title: openOptionActionQueue.length > 0 ? 'Option Expiry Queue' : 'No option expiry queue',
            description: 'Keep expiry-day and near-expiry option decisions visible beside the operational handoff queue.',
            span: 'full',
            availableSpans: ['full', 'wide'],
            content: openOptionActionQueue.length > 0 ? (
              <div className="detail-list">
                {latestMarksError ? (
                  <p className="field-error">Live marks unavailable: {latestMarksError}</p>
                ) : latestMarksLoading ? (
                  <p className="form-note">Refreshing latest price index marks for the option expiry queue.</p>
                ) : null}
                <div className="position-list">
                  {openOptionActionQueue.slice(0, 8).map((valuation) => (
                    <article key={valuation.tradeId} className="position-card shipment-card">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{valuation.tradeId}</strong>
                          <span>
                            {valuation.commodity} • {valuation.book} • {valuation.tradeSide ?? 'BUY'} {valuation.optionType ?? 'CALL'}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${valuation.decisionTone}`}>
                          {valuation.decisionLabel}
                        </span>
                      </div>
                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">{openOptionExpiryStateLabel(valuation)}</span>
                        <span className="entity-chip entity-chip-soft">
                          {valuation.optionStyle ?? 'AMERICAN'} • {valuation.moneyness ?? 'Unmarked'}
                        </span>
                        {valuation.daysToExpiration !== null ? (
                          <span className="entity-chip entity-chip-soft">{valuation.daysToExpiration}d to expiry</span>
                        ) : null}
                        {valuation.referencePriceIndexCode ? (
                          <span className="entity-chip entity-chip-soft">{valuation.referencePriceIndexCode}</span>
                        ) : null}
                      </div>
                      <div className="shipment-card-copy">
                        <p>{valuation.decisionReason}</p>
                      </div>
                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">
                          Strike {formatCurrencyAmount(valuation.strikePrice, valuation.referenceCurrencyCode)}
                        </span>
                        <span className="entity-chip entity-chip-soft">
                          Live mark {openOptionReferenceMarkLabel(valuation)}
                        </span>
                        <span className="entity-chip entity-chip-soft">
                          Break-even {openOptionBreakEvenLabel(valuation)}
                        </span>
                        <span className="entity-chip entity-chip-soft">
                          Expiry P&L {openOptionExpiryPnlLabel(valuation)}
                        </span>
                      </div>
                      <div className="shipment-card-actions">
                        <span>Updated {formatDate(valuation.updatedAt)}</span>
                        <div className="workflow-item-button-row">
                          {valuation.availableActions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="button button-secondary"
                              onClick={() => void onOptionLifecycleEvent(valuation.tradeId, action)}
                              disabled={!authSession || optionLifecycleSubmittingTradeId !== null}
                            >
                              {optionLifecycleSubmittingTradeId === valuation.tradeId &&
                              optionLifecycleSubmittingEvent === action
                                ? optionLifecyclePendingLabel(action)
                                : optionLifecycleActionLabel(action)}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => onOpenTrade(valuation.tradeId)}
                            disabled={optionLifecycleSubmittingTradeId !== null}
                          >
                            Open Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No option expiry alerts</strong>
                <p>Active options inside the five-day window, on expiry day, or past expiry will appear here.</p>
              </div>
            ),
          },
          {
            id: 'operations-confirmation-ledger',
            eyebrow: 'Trade Confirmation',
            title: managedConfirmationTradeIds.length > 0 ? 'Confirmation Ledger' : 'Trade Confirmation Ledger',
            description:
              'Manage drafted, confirmed, disputed, and amended confirmation records. Trade capture and booked economic amendments now auto-open a fresh draft version automatically.',
            span: 'full',
            availableSpans: ['full', 'wide'],
            content: (
              <OperationalBoardController
                workboard={confirmationLedgerWorkboard}
                bannerVariant="chips"
                isEmpty={visibleActiveTrades.length === 0}
              >
                {renderOperationalInlineBoard(
                  'confirmationLedger',
                  {
                  authSession,
                  trades: visibleActiveTrades,
                  confirmations: visibleConfirmations,
                  confirmationWorkItems,
                  saveError: confirmationMutationError,
                  savingKey: confirmationMutationPendingKey,
                  operationalResourceDescriptor: confirmationLedgerWorkboard.resources[0] ?? null,
                  formatCommodityClass,
                  formatDate,
                  formatDateOnly,
                  onCreateConfirmation,
                  onIssueConfirmation,
                  onRespondConfirmation,
                  onOpenTrade,
                  onSaveConfirmation,
                  },
                  [
                    visibleActiveTrades.map((trade) => trade.trade_id).join('|'),
                    visibleConfirmations.map((confirmation) => `${confirmation.confirmation_id}:${confirmation.version}`).join('|'),
                    confirmationWorkItems.map((item) => `${item.item_id}:${item.version}`).join('|'),
                  ].join('|'),
                )}
              </OperationalBoardController>
            ),
          },
          {
            id: 'operations-queue',
            eyebrow: 'Critical Path',
            title: openOperationsWorkItems.length > 0 ? 'Operational Work Queue' : 'No open work queue',
            description: 'Use the queue for owners, due dates, and downstream handoffs after confirmation records set the lifecycle status.',
            span: 'full',
            availableSpans: ['full', 'wide'],
            content: (
              <OperationalBoardController
                workboard={workflowQueueWorkboard}
                bannerVariant="chips"
                isEmpty={visibleActiveTrades.length === 0}
              >
                {renderOperationalInlineBoard(
                  'workflowQueue',
                  {
                  authSession,
                  activeTrades: visibleActiveTrades,
                  items: openOperationsWorkItems,
                  managedConfirmationTradeIds,
                  creationPendingTradeId: workflowCreationPendingTradeId,
                  savingItemId: workflowMutationPendingId,
                  saveError: workflowMutationError,
                  operationalResourceDescriptor: workflowQueueWorkboard.resources[0] ?? null,
                  formatCommodityClass,
                  formatDate,
                  formatDateOnly,
                  onCreateItem: onCreateWorkflowItem,
                  onOpenTrade,
                  onBookUnderlyingTrade,
                  onSaveItem: onSaveWorkflowItem,
                  },
                  openOperationsWorkItems.map((item) => `${item.item_id}:${item.version}`).join('|'),
                )}
              </OperationalBoardController>
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
                  <strong>{formatNumber(visibleTradingSources.length, 0)}</strong>
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
