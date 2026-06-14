import { useState } from 'react'

import type {
  CancelDeliveryTruckMovementInput,
  CancelDeliveryTruckStopInput,
  CreateDeliveryEventInput,
  DeliveryTruckMovementCreateInput,
  DeliveryTruckStopCreateInput,
  RecordDeliveryTruckStopCheckpointInput,
  ReverseDeliveryTruckStopCheckpointInput,
  SkipDeliveryTruckStopInput,
  UpdateDeliveryInput,
  UpdateDeliveryLogisticsDetailInput,
  UpdateDeliveryPipelineDetailInput,
  UpdateDeliveryPowerDetailInput,
  UpdateDeliveryTruckDetailInput,
  UpdateDeliveryVesselDetailInput,
  UpdateDeliveryTruckMovementInput,
  UpdateDeliveryTruckStopInput,
} from '../../entities/shipments/api'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import {
  getAppRouteHandoffFilterValue,
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
} from '../../shared/appRouteHandoff'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import type { DeliveryRecord, ReferenceRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { TileLayout } from '../../shared/ui/TileLayout'
import { TileSectionGrid, type TileSectionGridItem } from '../../shared/ui/TileSectionGrid'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import { OperationalBoardController } from '../operations/OperationalBoardController'
import { renderOperationalActionPanel } from '../operations/operationalActionPanelRegistry'
import { resolveOperationalWorkboardDefinition } from '../operations/operationalWorkboardRegistry'
import {
  formatTruckCheckpointLabel,
  latestActiveTruckCheckpointEvent,
} from './deliveryTruckWorkflowHelpers'

type DeliveryWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff: AppRouteHandoff | null
  globalFilter: string
  commodities: ReferenceRecord[]
  deliveries: DeliveryRecord[]
  operationalResourceDescriptors: OperationalResourceDescriptor[]
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
  deliveryMutationError: string
  deliveryMutationPendingId: string | null
  deliverySyncError: string
  deliverySyncSuccess: string
  deliveriesSyncing: boolean
  onOpenTrade: (tradeId: string) => void
  onClearHandoff: () => void
  onSyncDeliveriesFromTrades: () => Promise<void>
  onSaveDelivery: (deliveryId: string, payload: UpdateDeliveryInput) => Promise<void>
  onSaveDeliveryLogisticsDetails: (
    deliveryId: string,
    payload: UpdateDeliveryLogisticsDetailInput,
  ) => Promise<void>
  onSaveDeliveryPipelineDetails: (
    deliveryId: string,
    payload: UpdateDeliveryPipelineDetailInput,
  ) => Promise<void>
  onSaveDeliveryPowerDetails: (
    deliveryId: string,
    payload: UpdateDeliveryPowerDetailInput,
  ) => Promise<void>
  onSaveDeliveryTruckDetails: (
    deliveryId: string,
    payload: UpdateDeliveryTruckDetailInput,
  ) => Promise<void>
  onSaveDeliveryVesselDetails: (
    deliveryId: string,
    payload: UpdateDeliveryVesselDetailInput,
  ) => Promise<void>
  onCreateDeliveryTruckMovement: (
    deliveryId: string,
    payload: DeliveryTruckMovementCreateInput,
  ) => Promise<void>
  onSaveDeliveryTruckMovement: (
    deliveryId: string,
    movementId: string,
    payload: UpdateDeliveryTruckMovementInput,
  ) => Promise<void>
  onCancelDeliveryTruckMovement: (
    deliveryId: string,
    movementId: string,
    payload: CancelDeliveryTruckMovementInput,
  ) => Promise<void>
  onCreateDeliveryTruckStop: (
    deliveryId: string,
    movementId: string,
    payload: DeliveryTruckStopCreateInput,
  ) => Promise<void>
  onSaveDeliveryTruckStop: (
    deliveryId: string,
    stopId: string,
    payload: UpdateDeliveryTruckStopInput,
  ) => Promise<void>
  onSkipDeliveryTruckStop: (
    deliveryId: string,
    stopId: string,
    payload: SkipDeliveryTruckStopInput,
  ) => Promise<void>
  onCancelDeliveryTruckStop: (
    deliveryId: string,
    stopId: string,
    payload: CancelDeliveryTruckStopInput,
  ) => Promise<void>
  onRecordDeliveryTruckStopCheckpoint: (
    deliveryId: string,
    stopId: string,
    payload: RecordDeliveryTruckStopCheckpointInput,
  ) => Promise<string | null>
  onReverseDeliveryTruckStopCheckpoint: (
    deliveryId: string,
    stopId: string,
    eventId: number,
    payload: ReverseDeliveryTruckStopCheckpointInput,
  ) => Promise<string | null>
  onCreateDeliveryEvent: (deliveryId: string, payload: CreateDeliveryEventInput) => Promise<void>
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

function latestTruckCheckpointLabel(
  delivery: DeliveryRecord,
  formatDate: DeliveryWorkspaceProps['formatDate'],
): string | null {
  if (delivery.transport_mode !== 'TRUCK') {
    return null
  }
  const checkpoint = latestActiveTruckCheckpointEvent(delivery)
  if (!checkpoint) {
    return null
  }
  return `${formatTruckCheckpointLabel(checkpoint.checkpoint_code)} at ${formatDate(checkpoint.occurred_at)}`
}

function latestVesselTrackingLabel(
  delivery: DeliveryRecord,
  formatDate: DeliveryWorkspaceProps['formatDate'],
): string | null {
  if (delivery.transport_mode !== 'VESSEL') {
    return null
  }

  const detail = delivery.vessel_detail
  if (!detail?.last_signal_at && !detail?.last_position_at) {
    return null
  }

  const health = delivery.vessel_tracking_health ?? detail.tracking_health
  const signalTime = detail.last_position_at ?? detail.last_signal_at
  const vesselName = detail.vessel_name ?? detail.imo_number ?? detail.mmsi_number ?? 'Vessel'
  const statusLabel = health?.primary_exception ?? health?.exception_severity ?? 'TRACKING'

  return `${vesselName} ${statusLabel.replaceAll('_', ' ').toLowerCase()} at ${formatDate(signalTime)}`
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

function hasManualSharedOverrides(delivery: DeliveryRecord): boolean {
  return (
    delivery.book_source === 'MANUAL' ||
    delivery.portfolio_source === 'MANUAL' ||
    delivery.counterparty_source === 'MANUAL' ||
    delivery.location_source === 'MANUAL' ||
    delivery.delivery_window_source === 'MANUAL' ||
    delivery.execution_status_source === 'MANUAL' ||
    delivery.operations_owner_source === 'MANUAL' ||
    delivery.external_reference_source === 'MANUAL' ||
    delivery.ops_notes_source === 'MANUAL'
  )
}

function matchesDeliveryScreenFilter(delivery: DeliveryRecord, query: string): boolean {
  return matchesTextFilter(query, [
    delivery.delivery_id,
    delivery.trade_id,
    delivery.external_trade_id,
    delivery.book,
    delivery.portfolio,
    delivery.counterparty,
    delivery.commodity_class,
    delivery.commodity,
    delivery.status,
    delivery.mode_family,
    delivery.transport_mode,
    delivery.delivery_profile,
    delivery.location_code,
    delivery.origin_location_code,
    delivery.destination_location_code,
    delivery.rail_route_code,
    delivery.rail_line_code,
    delivery.railroad_code,
    delivery.rail_route_direction,
    delivery.rail_service_calendar_code,
    delivery.vessel_detail?.vessel_name,
    delivery.vessel_detail?.imo_number,
    delivery.vessel_detail?.mmsi_number,
    delivery.vessel_detail?.call_sign,
    delivery.vessel_detail?.voyage_number,
    delivery.vessel_detail?.tracking_provider,
    delivery.vessel_detail?.current_destination,
    delivery.vessel_tracking_health?.primary_exception,
    delivery.vessel_tracking_health?.exception_severity,
    delivery.receipt_location_code,
    delivery.delivery_location_code,
    delivery.pipeline_system,
    delivery.market_operator,
    delivery.execution_status,
    delivery.pricing_status,
    delivery.confirmation_status,
    delivery.nomination_status,
    delivery.allocation_status,
    delivery.actualization_status,
    delivery.invoice_status,
    delivery.payment_status,
    delivery.settlement_status,
    delivery.operations_owner,
    delivery.external_reference,
    delivery.ops_notes,
  ])
}

export function DeliveryWorkspace({
  authSession,
  routeHandoff,
  globalFilter,
  commodities,
  deliveries,
  operationalResourceDescriptors,
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatNumber,
  deliveryMutationError,
  deliveryMutationPendingId,
  deliverySyncError,
  deliverySyncSuccess,
  deliveriesSyncing,
  onOpenTrade,
  onClearHandoff,
  onSyncDeliveriesFromTrades,
  onSaveDelivery,
  onSaveDeliveryLogisticsDetails,
  onSaveDeliveryPipelineDetails,
  onSaveDeliveryPowerDetails,
  onSaveDeliveryTruckDetails,
  onSaveDeliveryVesselDetails,
  onCreateDeliveryTruckMovement,
  onSaveDeliveryTruckMovement,
  onCancelDeliveryTruckMovement,
  onCreateDeliveryTruckStop,
  onSaveDeliveryTruckStop,
  onSkipDeliveryTruckStop,
  onCancelDeliveryTruckStop,
  onRecordDeliveryTruckStopCheckpoint,
  onReverseDeliveryTruckStopCheckpoint,
  onCreateDeliveryEvent,
}: DeliveryWorkspaceProps) {
  const [screenFilter, setScreenFilter] = useState('')
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const normalizedRouteHandoff = normalizeAppRouteHandoff(routeHandoff)
  const focusedRailRouteCode =
    normalizedRouteHandoff?.focus.type === 'reference_record'
      ? normalizedRouteHandoff.focus.id.trim().toUpperCase()
      : null
  const handoffScreenFilter = focusedRailRouteCode ? '' : getAppRouteHandoffFilterValue(normalizedRouteHandoff) ?? ''
  const effectiveScreenFilter = combineTextFilters(globalFilter, handoffScreenFilter, screenFilter)
  const visibleDeliveries = deliveries.filter(
    (delivery) =>
      (!focusedRailRouteCode || delivery.rail_route_code === focusedRailRouteCode) &&
      matchesDeliveryScreenFilter(delivery, effectiveScreenFilter),
  )

  const openDeliveries = visibleDeliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const blockedDeliveries = visibleDeliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const readyDeliveries = visibleDeliveries.filter((delivery) => delivery.status === 'READY')
  const inProgressDeliveries = visibleDeliveries.filter((delivery) => delivery.status === 'IN_PROGRESS')
  const logisticsDeliveries = visibleDeliveries.filter((delivery) => delivery.mode_family === 'LOGISTICS')
  const networkDeliveries = visibleDeliveries.filter((delivery) => delivery.mode_family === 'NETWORK_FLOW')
  const powerDeliveries = visibleDeliveries.filter((delivery) => delivery.mode_family === 'POWER_SCHEDULE')
  const vesselDeliveries = logisticsDeliveries.filter((delivery) => delivery.transport_mode === 'VESSEL')
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
  const manualOverrideCount = visibleDeliveries.filter((delivery) => hasManualSharedOverrides(delivery)).length
  const nearestWindow = openDeliveries.reduce<DeliveryRecord | null>((earliest, delivery) => {
    if (!delivery.delivery_start) {
      return earliest
    }
    if (!earliest || !earliest.delivery_start || delivery.delivery_start < earliest.delivery_start) {
      return delivery
    }
    return earliest
  }, null)
  const latestDeliveryUpdate = visibleDeliveries.reduce<DeliveryRecord | null>((latest, delivery) => {
    if (!latest || delivery.last_updated_at > latest.last_updated_at) {
      return delivery
    }
    return latest
  }, null)
  const defaultSelectedDeliveryId = blockedDeliveries[0]?.delivery_id ?? visibleDeliveries[0]?.delivery_id ?? null
  const effectiveSelectedDeliveryId =
    selectedDeliveryId && visibleDeliveries.some((delivery) => delivery.delivery_id === selectedDeliveryId)
      ? selectedDeliveryId
      : defaultSelectedDeliveryId
  const selectedDelivery =
    visibleDeliveries.find((delivery) => delivery.delivery_id === effectiveSelectedDeliveryId) ??
    blockedDeliveries[0] ??
    visibleDeliveries[0] ??
    null
  const deliveryBoardWorkboard = resolveOperationalWorkboardDefinition(
    'deliveryBoard',
    operationalResourceDescriptors,
  )
  function clearWorkspaceHandoff() {
    setScreenFilter('')
    onClearHandoff()
  }
  const shipmentSummaryCards: TileSectionGridItem[] = [
    {
      id: 'tracked-deliveries',
      title: 'Tracked Deliveries',
      content: (
        <>
          <span>Tracked Deliveries</span>
          <strong>{formatNumber(visibleDeliveries.length, 0)}</strong>
          <p>Every active physical obligation currently surfaced from trades and trade legs.</p>
        </>
      ),
    },
    {
      id: 'logistics-moves',
      title: 'Logistics Moves',
      content: (
        <>
          <span>Logistics Moves</span>
          <strong>{formatNumber(logisticsDeliveries.length, 0)}</strong>
          <p>Discrete physical deliveries that still need an explicit truck, rail, barge, or vessel mode.</p>
        </>
      ),
    },
    {
      id: 'vessel-moves',
      title: 'Vessel Moves',
      content: (
        <>
          <span>Vessel Moves</span>
          <strong>{formatNumber(vesselDeliveries.length, 0)}</strong>
          <p>Waterborne obligations with vessel identity, AIS-style signals, and ETA health visible to ops.</p>
        </>
      ),
    },
    {
      id: 'pipeline-flows',
      title: 'Pipeline Flows',
      content: (
        <>
          <span>Pipeline Flows</span>
          <strong>{formatNumber(networkDeliveries.length, 0)}</strong>
          <p>Network-style flow obligations inferred from gas-style delivery characteristics.</p>
        </>
      ),
    },
    {
      id: 'power-schedules',
      title: 'Power Schedules',
      content: (
        <>
          <span>Power Schedules</span>
          <strong>{formatNumber(powerDeliveries.length, 0)}</strong>
          <p>Grid-delivery obligations shaped around delivery windows rather than physical shipment assets.</p>
        </>
      ),
    },
    {
      id: 'manual-overrides',
      title: 'Manual Overrides',
      content: (
        <>
          <span>Manual Overrides</span>
          <strong>{formatNumber(manualOverrideCount, 0)}</strong>
          <p>Delivery records where ops has taken ownership of shared fields beyond the trade-derived defaults.</p>
        </>
      ),
    },
  ]

  return (
    <TileLayout
      workspaceId="shipments"
      workspaceLabel="Deliveries"
      authSession={authSession}
      headerContent={
        <>
          <WorkspaceHandoffFocusBanner
            handoff={routeHandoff}
            currentView="shipments"
            clearLabel="Show Full Board"
            onClear={clearWorkspaceHandoff}
          />
          <WorkspaceLocalFilterBar
            value={screenFilter}
            onChange={setScreenFilter}
            placeholder="Delivery ID, trade ID, commodity, book, mode, status, location, or rail route"
            description="Keep delivery filtering local to this execution screen so you can tighten the queue without changing any other workspace."
            totalCount={deliveries.length}
            matchedCount={visibleDeliveries.length}
            resultLabel="deliveries"
            globalValue={globalFilter}
            hasExternalFilter={focusedRailRouteCode !== null}
            note={
              focusedRailRouteCode
                ? `Rail route ${focusedRailRouteCode} is currently in focus. Clear the route focus when you want to widen back to the full delivery board.`
                : undefined
            }
          />
        </>
      }
      sections={[
        {
          id: 'shipment-summary-cards',
          itemIds: shipmentSummaryCards.map((card) => card.id),
        },
      ]}
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
            visibleDeliveries.length > 0 ? (
              <TileSectionGrid sectionId="shipment-summary-cards" items={shipmentSummaryCards} />
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
            visibleDeliveries.length > 0 ? (
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
	                      <div className="workflow-item-button-row">
	                        <button
	                          type="button"
	                          className="button button-ghost"
	                          onClick={() => setSelectedDeliveryId(delivery.delivery_id)}
	                        >
	                          Edit Controls
	                        </button>
	                        <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
	                          Open Trade
	                        </button>
	                      </div>
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
          title: selectedDelivery ? `${tradeReferenceLabel(selectedDelivery)} in focus` : 'Delivery Queue',
          description:
            'A cross-mode operational board ordered so the riskiest delivery obligations surface first, paired with a persisted control editor for the selected delivery.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <OperationalBoardController
              workboard={deliveryBoardWorkboard}
              className="shipment-queue-stack shipment-workbench"
              detailClassName="shipment-editor-panel"
              isEmpty={visibleDeliveries.length === 0}
              summary={
                visibleDeliveries.length > 0 ? (
                  <>
                    <div className="shipment-card-actions shipment-sync-actions">
                      <span>Resync obligations after trade capture, amendments, or leg changes reshape the physical delivery book.</span>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void onSyncDeliveriesFromTrades()}
                        disabled={!authSession || deliveriesSyncing}
                      >
                        {deliveriesSyncing ? 'Syncing…' : 'Sync From Trades'}
                      </button>
                    </div>
                    {deliverySyncError ? <p className="field-error workflow-item-save-error">{deliverySyncError}</p> : null}
                    {deliverySyncSuccess ? <p className="workflow-editor-note">{deliverySyncSuccess}</p> : null}
                  </>
                ) : (
                  <></>
                )
              }
              detail={
                visibleDeliveries.length > 0 ? (
                  selectedDelivery ? (
                    renderOperationalActionPanel('deliveryControl', operationalResourceDescriptors, {
                      authSession,
                      commodities,
                      delivery: selectedDelivery,
                      saveError: deliveryMutationError,
                      savingDeliveryId: deliveryMutationPendingId,
                      formatDate,
                      onOpenTrade,
                      onSaveShared: onSaveDelivery,
                      onSaveLogisticsDetails: onSaveDeliveryLogisticsDetails,
                      onSavePipelineDetails: onSaveDeliveryPipelineDetails,
                      onSavePowerDetails: onSaveDeliveryPowerDetails,
                      onSaveTruckDetails: onSaveDeliveryTruckDetails,
                      onSaveVesselDetails: onSaveDeliveryVesselDetails,
                      onCreateTruckMovement: onCreateDeliveryTruckMovement,
                      onSaveTruckMovement: onSaveDeliveryTruckMovement,
                      onCancelTruckMovement: onCancelDeliveryTruckMovement,
                      onCreateTruckStop: onCreateDeliveryTruckStop,
                      onSaveTruckStop: onSaveDeliveryTruckStop,
                      onSkipTruckStop: onSkipDeliveryTruckStop,
                      onCancelTruckStop: onCancelDeliveryTruckStop,
                      onRecordTruckStopCheckpoint: onRecordDeliveryTruckStopCheckpoint,
                      onReverseTruckStopCheckpoint: onReverseDeliveryTruckStopCheckpoint,
                      onCreateEvent: onCreateDeliveryEvent,
                    })
                  ) : (
                    <div className="empty-state">
                      <strong>No delivery selected</strong>
                      <p>Pick a delivery from the queue to edit controls, mode-specific instructions, and manual overrides.</p>
                    </div>
                  )
                ) : undefined
              }
              emptyStateTitle="No delivery queue"
              emptyStateDetail="The board will populate automatically from active physical trades once obligations are captured."
            >
              <div className="position-list">
                {visibleDeliveries.map((delivery) => {
                  const isSelected = selectedDelivery?.delivery_id === delivery.delivery_id
                  const latestTruckCheckpoint = latestTruckCheckpointLabel(delivery, formatDate)
                  const latestVesselTracking = latestVesselTrackingLabel(delivery, formatDate)

                  return (
                    <article
                      key={delivery.delivery_id}
                      className={`position-card shipment-card ${isSelected ? 'shipment-card-selected' : ''}`}
                    >
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
                        <span className="entity-chip entity-chip-soft">
                          Execution {delivery.execution_status.replaceAll('_', ' ')}
                        </span>
                        {hasManualSharedOverrides(delivery) ? (
                          <span className="entity-chip entity-chip-soft">Manual Overrides</span>
                        ) : null}
                        {latestTruckCheckpoint ? (
                          <span className="entity-chip entity-chip-soft">Truck {latestTruckCheckpoint}</span>
                        ) : null}
                        {latestVesselTracking ? (
                          <span className="entity-chip entity-chip-soft">Vessel {latestVesselTracking}</span>
                        ) : null}
                        <span className="entity-chip entity-chip-soft">Pricing {delivery.pricing_status}</span>
                        <span className="entity-chip entity-chip-soft">Confirmation {delivery.confirmation_status}</span>
                        <span className="entity-chip entity-chip-soft">Nomination {delivery.nomination_status}</span>
                        <span className="entity-chip entity-chip-soft">Allocation {delivery.allocation_status}</span>
                        <span className="entity-chip entity-chip-soft">
                          Actualization {delivery.actualization_status.replaceAll('_', ' ')}
                        </span>
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
                          {delivery.actualized_quantity !== null
                            ? `Actualized ${formatNumber(delivery.actualized_quantity, 2)} ${delivery.unit_of_measure ?? ''} on ${formatDate(delivery.actualized_at)}`
                            : 'Execution actuals have not been recorded yet.'}
                        </p>
                        {latestTruckCheckpoint ? <p>Latest truck checkpoint: {latestTruckCheckpoint}</p> : null}
                        {latestVesselTracking ? <p>Latest vessel tracking: {latestVesselTracking}</p> : null}
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
                        <div className="workflow-item-button-row">
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => setSelectedDeliveryId(delivery.delivery_id)}
                          >
                            {isSelected ? 'Editing' : 'Edit Controls'}
                          </button>
                          <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                            Open Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </OperationalBoardController>
          ),
        },
      ]}
    />
  )
}
