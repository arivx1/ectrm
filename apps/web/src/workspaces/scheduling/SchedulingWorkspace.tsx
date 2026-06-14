import { useEffect, useMemo, useState } from 'react'

import type { CreateTradeWorkflowItemInput, UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { SaveDeliveryActualizationInput } from '../../entities/shipments/api'
import {
  getAppRouteHandoffFilterValue,
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
} from '../../shared/appRouteHandoff'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import type {
  DeliveryRecord,
  DeliverySchedulingWorkflowItemRecord,
  RailRouteRecord,
  ReferenceRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  formatTransportModeLabel,
  resolveAllowedTransportModes,
} from '../../shared/transportModes'
import { TileLayout } from '../../shared/ui/TileLayout'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import { OperationalBoardController } from '../operations/OperationalBoardController'
import { renderOperationalActionPanel } from '../operations/operationalActionPanelRegistry'
import { resolveOperationalWorkboardDefinition } from '../operations/operationalWorkboardRegistry'
import { TruckTrackingExceptionQueue } from '../operations/TruckTrackingExceptionQueue'
import type {
  SchedulingAllocationFilter,
  SchedulingLifecycleFilter,
  SchedulingStage,
  SchedulingShipmentFilter,
  SchedulingWindowBand,
  SchedulingWorkbenchRow,
} from './schedulingHelpers'
import {
  ALLOCATION_COMPLETE_STATUSES,
  buildSchedulingWorkbenchRows,
  isAllocatedSchedulingDelivery,
  isClosedSchedulingDelivery,
  isShippedSchedulingDelivery,
  matchesSchedulingAllocationFilter,
  matchesSchedulingLifecycleFilter,
  matchesSchedulingShipmentFilter,
  SCHEDULED_NOMINATION_STATUSES,
  SCHEDULING_WINDOW_HOURS,
} from './schedulingHelpers'

type SchedulingWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff: AppRouteHandoff | null
  globalFilter: string
  commodities: ReferenceRecord[]
  deliveries: DeliveryRecord[]
  railRoutes: RailRouteRecord[]
  operationalResourceDescriptors: OperationalResourceDescriptor[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  actualizationMutationError: string
  actualizationMutationPendingDeliveryId: string | null
  workflowMutationError: string
  workflowCreationPendingTradeId: string | null
  workflowMutationPendingId: number | null
  onCreateWorkflowItem: (
    tradeId: string,
    payload: Omit<CreateTradeWorkflowItemInput, 'trade_id'>,
  ) => Promise<void>
  onClearHandoff: () => void
  onOpenTrade: (tradeId: string) => void
  onSaveActualization: (
    delivery: Pick<DeliveryRecord, 'delivery_id' | 'trade_id' | 'leg_no'>,
    payload: SaveDeliveryActualizationInput,
  ) => Promise<void>
  onSaveWorkflowItem: (itemId: number, payload: UpdateTradeWorkflowItemInput) => Promise<void>
}

type SchedulingTransportFilter = 'ALL' | DeliveryRecord['transport_mode']
type SchedulingStateSection = SchedulingStage | 'CLOSED'

const MODE_LABELS: Record<DeliveryRecord['mode_family'], string> = {
  LOGISTICS: 'Logistics',
  NETWORK_FLOW: 'Network Flow',
  POWER_SCHEDULE: 'Power Schedule',
}

const LIFECYCLE_FILTER_OPTIONS: Array<{ value: SchedulingLifecycleFilter; label: string }> = [
  { value: 'ALL', label: 'All Rows' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
]

const ALLOCATION_FILTER_OPTIONS: Array<{ value: SchedulingAllocationFilter; label: string }> = [
  { value: 'ALL', label: 'All Allocation' },
  { value: 'UNALLOCATED', label: 'Unallocated' },
  { value: 'ALLOCATED', label: 'Allocated' },
]

const SHIPMENT_FILTER_OPTIONS: Array<{ value: SchedulingShipmentFilter; label: string }> = [
  { value: 'ALL', label: 'All Shipment' },
  { value: 'UNSHIPPED', label: 'Unshipped' },
  { value: 'SHIPPED', label: 'Shipped' },
]

const SECTION_ORDER: SchedulingStateSection[] = ['BLOCKED', 'READY', 'IN_FLIGHT', 'WATCHLIST', 'CLOSED']

const SECTION_META: Record<
  SchedulingStateSection,
  {
    label: string
    description: string
    tone: 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped'
  }
> = {
  BLOCKED: {
    label: 'Blocked',
    description: 'Cannot move until confirmations, data gaps, or workflow blockers are cleared.',
    tone: 'blocked',
  },
  READY: {
    label: 'Ready',
    description: 'Commercially clean rows waiting for the next schedule action.',
    tone: 'active',
  },
  IN_FLIGHT: {
    label: 'In Flight',
    description: 'Rows already being worked, submitted, or handed into follow-up.',
    tone: 'in-progress',
  },
  WATCHLIST: {
    label: 'Watchlist',
    description: 'Still open, but not the scheduler’s next click.',
    tone: 'planned',
  },
  CLOSED: {
    label: 'Closed',
    description: 'Completed rows kept visible for closure and audit checks.',
    tone: 'shipped',
  },
}

const WINDOW_BAND_META: Record<
  SchedulingWindowBand,
  {
    label: string
    description: string
    className: string
  }
> = {
  LIVE: {
    label: 'Live / Overdue',
    description: 'The delivery window has started or is already past due.',
    className: 'live',
  },
  NEXT_24: {
    label: 'Next 24h',
    description: 'The window starts within the next day.',
    className: 'next-24',
  },
  NEXT_72: {
    label: 'Next 72h',
    description: 'The window starts inside the near-term scheduler horizon.',
    className: 'next-72',
  },
  LATER: {
    label: 'Later',
    description: 'The delivery window is beyond the immediate scheduler horizon.',
    className: 'later',
  },
  TBD: {
    label: 'Date Missing',
    description: 'The delivery window is incomplete and needs master-data cleanup.',
    className: 'tbd',
  },
}

const SCHEDULING_CLOCK_TICK_MS = 60_000

function currentTimestamp(): number {
  return Date.now()
}

function formatEnumLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function workflowTypeLabel(value: DeliverySchedulingWorkflowItemRecord['workflow_type']): string {
  return value.replaceAll('_', ' ')
}

function tradeReferenceLabel(delivery: DeliveryRecord): string {
  return delivery.leg_no === null ? delivery.trade_id : `${delivery.trade_id} · leg ${delivery.leg_no}`
}

function deliveryRouteLabel(
  delivery: Pick<
    DeliveryRecord,
    | 'location_code'
    | 'origin_location_code'
    | 'destination_location_code'
    | 'receipt_location_code'
    | 'delivery_location_code'
  >,
): string {
  if (delivery.origin_location_code && delivery.destination_location_code) {
    return `${delivery.origin_location_code} -> ${delivery.destination_location_code}`
  }

  if (delivery.receipt_location_code && delivery.delivery_location_code) {
    return `${delivery.receipt_location_code} -> ${delivery.delivery_location_code}`
  }

  return (
    delivery.location_code ??
    delivery.delivery_location_code ??
    delivery.receipt_location_code ??
    delivery.destination_location_code ??
    delivery.origin_location_code ??
    'Location TBD'
  )
}

function deliveryWindowLabel(
  delivery: DeliveryRecord,
  formatDateOnly: SchedulingWorkspaceProps['formatDateOnly'],
): string {
  if (!delivery.delivery_start && !delivery.delivery_end) {
    return 'Window TBD'
  }

  if (delivery.delivery_start && delivery.delivery_end && delivery.delivery_start === delivery.delivery_end) {
    return formatDateOnly(delivery.delivery_start)
  }

  return `${formatDateOnly(delivery.delivery_start)} to ${formatDateOnly(delivery.delivery_end)}`
}

function nextActionText(row: SchedulingWorkbenchRow): string {
  if (row.nextWorkflowItem) {
    return `${workflowTypeLabel(row.nextWorkflowItem.workflow_type)} • ${formatEnumLabel(row.nextWorkflowItem.status)}`
  }
  if (row.delivery.blockers.length > 0) {
    return 'Clear blockers before scheduling can advance'
  }
  return 'No open scheduling workflow items'
}

function schedulerOwnerLabel(row: SchedulingWorkbenchRow): string {
  return row.owner?.trim() || 'Unassigned'
}

function lifecycleStateLabel(delivery: Pick<DeliveryRecord, 'status'>): string {
  return isClosedSchedulingDelivery(delivery) ? 'Closed' : 'Open'
}

function allocationStateLabel(delivery: Pick<DeliveryRecord, 'allocation_status'>): string {
  return isAllocatedSchedulingDelivery(delivery) ? 'Allocated' : 'Unallocated'
}

function shipmentStateLabel(
  delivery: Pick<DeliveryRecord, 'actualization_status' | 'execution_status' | 'status'>,
): string {
  return isShippedSchedulingDelivery(delivery) ? 'Shipped' : 'Unshipped'
}

function lifecycleStateTone(delivery: Pick<DeliveryRecord, 'status'>): 'attention' | 'complete' {
  return isClosedSchedulingDelivery(delivery) ? 'complete' : 'attention'
}

function allocationStateTone(delivery: Pick<DeliveryRecord, 'allocation_status'>): 'attention' | 'complete' {
  return isAllocatedSchedulingDelivery(delivery) ? 'complete' : 'attention'
}

function shipmentStateTone(
  delivery: Pick<DeliveryRecord, 'actualization_status' | 'execution_status' | 'status'>,
): 'attention' | 'complete' {
  return isShippedSchedulingDelivery(delivery) ? 'complete' : 'attention'
}

function sectionKeyForRow(row: SchedulingWorkbenchRow): SchedulingStateSection {
  return isClosedSchedulingDelivery(row.delivery) ? 'CLOSED' : row.stage
}

function matchesSchedulingWorkbenchFilter(row: SchedulingWorkbenchRow, query: string): boolean {
  return matchesTextFilter(query, [
    row.delivery.delivery_id,
    row.delivery.trade_id,
    row.delivery.external_trade_id,
    row.delivery.book,
    row.delivery.portfolio,
    row.delivery.counterparty,
    row.delivery.commodity_class,
    row.delivery.commodity,
    row.delivery.mode_family,
    row.delivery.transport_mode,
    row.delivery.status,
    row.delivery.location_code,
    row.delivery.origin_location_code,
    row.delivery.destination_location_code,
    row.delivery.rail_route_code,
    row.delivery.rail_line_code,
    row.delivery.railroad_code,
    row.delivery.rail_route_direction,
    row.delivery.rail_service_calendar_code,
    row.delivery.receipt_location_code,
    row.delivery.delivery_location_code,
    row.delivery.pipeline_system,
    row.delivery.pipeline_path,
    row.delivery.nomination_reference,
    row.delivery.schedule_reference,
    row.delivery.market_operator,
    row.delivery.pricing_node_code,
    row.delivery.delivery_node_code,
    row.delivery.scheduling_stage,
    row.delivery.scheduling_owner,
    row.delivery.confirmation_status,
    row.delivery.nomination_status,
    row.delivery.allocation_status,
    row.delivery.actualization_status,
    ...row.delivery.blockers,
    row.nextWorkflowItem?.workflow_type,
    row.nextWorkflowItem?.status,
    row.owner,
    ...row.openWorkflowItems.flatMap((item) => [item.workflow_type, item.status, item.owner, item.notes]),
  ])
}

export function SchedulingWorkspace({
  authSession,
  routeHandoff,
  globalFilter,
  commodities,
  deliveries,
  railRoutes,
  operationalResourceDescriptors,
  formatCommodityClass,
  formatNumber,
  formatDate,
  formatDateOnly,
  actualizationMutationError,
  actualizationMutationPendingDeliveryId,
  workflowMutationError,
  workflowCreationPendingTradeId,
  workflowMutationPendingId,
  onCreateWorkflowItem,
  onClearHandoff,
  onOpenTrade,
  onSaveActualization,
  onSaveWorkflowItem,
}: SchedulingWorkspaceProps) {
  const [lifecycleFilter, setLifecycleFilter] = useState<SchedulingLifecycleFilter>('OPEN')
  const [allocationFilter, setAllocationFilter] = useState<SchedulingAllocationFilter>('ALL')
  const [shipmentFilter, setShipmentFilter] = useState<SchedulingShipmentFilter>('ALL')
  const [selectedCommodityCode, setSelectedCommodityCode] = useState('ALL')
  const [transportFilter, setTransportFilter] = useState<SchedulingTransportFilter>('ALL')
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [selectedRailRouteFilterCode, setSelectedRailRouteFilterCode] = useState('')
  const [now, setNow] = useState<number>(() => currentTimestamp())
  const normalizedRouteHandoff = normalizeAppRouteHandoff(routeHandoff)
  const focusedRailRouteCode =
    normalizedRouteHandoff?.focus.type === 'reference_record'
      ? normalizedRouteHandoff.focus.id.trim().toUpperCase()
      : null
  const localRailRouteCode = selectedRailRouteFilterCode.trim().toUpperCase() || null
  const appliedRailRouteCode = focusedRailRouteCode ?? localRailRouteCode
  const handoffGlobalFilter = focusedRailRouteCode ? '' : getAppRouteHandoffFilterValue(normalizedRouteHandoff) ?? ''
  const effectiveGlobalFilter = combineTextFilters(globalFilter, handoffGlobalFilter)
  const hasGlobalFilter = globalFilter.trim().length > 0
  const sortedRailRoutes = useMemo(
    () =>
      [...railRoutes].sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.code.localeCompare(right.code),
      ),
    [railRoutes],
  )
  const railRouteFilterOptions = useMemo(() => {
    const activeRoutes = sortedRailRoutes.filter((route) => route.is_active)
    if (!appliedRailRouteCode || activeRoutes.some((route) => route.code === appliedRailRouteCode)) {
      return activeRoutes
    }

    const focusedRoute = sortedRailRoutes.find((route) => route.code === appliedRailRouteCode)
    return focusedRoute ? [...activeRoutes, focusedRoute] : activeRoutes
  }, [appliedRailRouteCode, sortedRailRoutes])
  const appliedRailRoute =
    railRouteFilterOptions.find((route) => route.code === appliedRailRouteCode) ??
    sortedRailRoutes.find((route) => route.code === appliedRailRouteCode) ??
    null

  useEffect(() => {
    function refreshNow() {
      setNow(currentTimestamp())
    }

    const intervalId = window.setInterval(refreshNow, SCHEDULING_CLOCK_TICK_MS)

    function handleFocus() {
      refreshNow()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshNow()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const schedulingWindowMs = SCHEDULING_WINDOW_HOURS * 60 * 60 * 1000
  const scopedDeliveries = appliedRailRouteCode
    ? deliveries.filter((delivery) => delivery.rail_route_code === appliedRailRouteCode)
    : deliveries
  const workbenchRows = useMemo(
    () => buildSchedulingWorkbenchRows(scopedDeliveries, now, schedulingWindowMs),
    [now, scopedDeliveries, schedulingWindowMs],
  )
  const textFilteredRows = useMemo(
    () => workbenchRows.filter((row) => matchesSchedulingWorkbenchFilter(row, effectiveGlobalFilter)),
    [effectiveGlobalFilter, workbenchRows],
  )
  const commodityFilterOptions = useMemo(() => {
    const optionsByCode = new Map<string, { value: string; label: string }>()
    for (const row of textFilteredRows) {
      if (optionsByCode.has(row.delivery.commodity)) {
        continue
      }
      const commodityRecord = commodities.find((record) => record.code === row.delivery.commodity)
      optionsByCode.set(row.delivery.commodity, {
        value: row.delivery.commodity,
        label: commodityRecord?.name ?? row.delivery.commodity,
      })
    }
    return [...optionsByCode.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [commodities, textFilteredRows])
  const effectiveSelectedCommodityCode =
    selectedCommodityCode !== 'ALL' &&
    !commodityFilterOptions.some((option) => option.value === selectedCommodityCode)
      ? 'ALL'
      : selectedCommodityCode
  const selectedCommodityRecord =
    effectiveSelectedCommodityCode === 'ALL'
      ? null
      : commodities.find((record) => record.code === effectiveSelectedCommodityCode) ?? null
  const commodityScopedRows =
    effectiveSelectedCommodityCode === 'ALL'
      ? textFilteredRows
      : textFilteredRows.filter((row) => row.delivery.commodity === effectiveSelectedCommodityCode)
  const transportFilterOptions = useMemo(() => {
    const constrainedModes = resolveAllowedTransportModes(selectedCommodityRecord)
    const visibleModes = new Set<DeliveryRecord['transport_mode']>()
    for (const row of commodityScopedRows) {
      visibleModes.add(row.delivery.transport_mode)
    }

    const orderedModes: DeliveryRecord['transport_mode'][] = []
    for (const mode of constrainedModes) {
      orderedModes.push(mode)
    }
    for (const mode of visibleModes) {
      if (!orderedModes.includes(mode)) {
        orderedModes.push(mode)
      }
    }
    return orderedModes
  }, [commodityScopedRows, selectedCommodityRecord])
  const effectiveTransportFilter =
    transportFilter !== 'ALL' && !transportFilterOptions.includes(transportFilter) ? 'ALL' : transportFilter
  const transportScopedRows =
    effectiveTransportFilter === 'ALL'
      ? commodityScopedRows
      : commodityScopedRows.filter((row) => row.delivery.transport_mode === effectiveTransportFilter)
  const lifecycleScopedRows = transportScopedRows
  const filteredRows = lifecycleScopedRows
    .filter((row) => matchesSchedulingLifecycleFilter(row, lifecycleFilter))
    .filter((row) => matchesSchedulingAllocationFilter(row, allocationFilter))
    .filter((row) => matchesSchedulingShipmentFilter(row, shipmentFilter))

  useEffect(() => {
    if (filteredRows.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Drop the selection when the filtered workbench no longer has rows.
      setSelectedDeliveryId(null)
      return
    }

    if (!selectedDeliveryId || !filteredRows.some((row) => row.delivery.delivery_id === selectedDeliveryId)) {
      setSelectedDeliveryId(filteredRows[0].delivery.delivery_id)
    }
  }, [filteredRows, selectedDeliveryId])

  const selectedRow =
    filteredRows.find((row) => row.delivery.delivery_id === selectedDeliveryId) ?? filteredRows[0] ?? null
  const filteredQueueCount = lifecycleScopedRows.length
  const activeCommodityLabel = selectedCommodityRecord?.name ?? 'All Products'
  const activeTransportLabel =
    effectiveTransportFilter === 'ALL' ? 'All Modes' : formatTransportModeLabel(effectiveTransportFilter)
  const activeLifecycleLabel =
    LIFECYCLE_FILTER_OPTIONS.find((option) => option.value === lifecycleFilter)?.label ?? 'Open'
  const activeAllocationLabel =
    ALLOCATION_FILTER_OPTIONS.find((option) => option.value === allocationFilter)?.label ?? 'All Allocation'
  const activeShipmentLabel =
    SHIPMENT_FILTER_OPTIONS.find((option) => option.value === shipmentFilter)?.label ?? 'All Shipment'
  const openCount = lifecycleScopedRows.filter((row) => !isClosedSchedulingDelivery(row.delivery)).length
  const closedCount = lifecycleScopedRows.filter((row) => isClosedSchedulingDelivery(row.delivery)).length
  const allocatedCount = lifecycleScopedRows.filter((row) => isAllocatedSchedulingDelivery(row.delivery)).length
  const unallocatedCount = lifecycleScopedRows.length - allocatedCount
  const shippedCount = lifecycleScopedRows.filter((row) => isShippedSchedulingDelivery(row.delivery)).length
  const unshippedCount = lifecycleScopedRows.length - shippedCount
  const dueSoonRows = lifecycleScopedRows.filter((row) => row.isDueSoon && !isClosedSchedulingDelivery(row.delivery))
  const blockedRows = lifecycleScopedRows.filter((row) => row.stage === 'BLOCKED' && !isClosedSchedulingDelivery(row.delivery))
  const unassignedRows = filteredRows.filter((row) =>
    row.openWorkflowItems.some((item) => !item.owner?.trim()),
  )
  const stageSections = SECTION_ORDER.map((section) => ({
    section,
    rows: filteredRows.filter((row) => sectionKeyForRow(row) === section),
  })).filter((section) => section.rows.length > 0)
  const confirmationPendingCount = lifecycleScopedRows.filter(
    (row) => row.delivery.confirmation_status !== 'CONFIRMED' && !isClosedSchedulingDelivery(row.delivery),
  ).length
  const allocationFollowUpCount = lifecycleScopedRows.filter(
    (row) =>
      !isClosedSchedulingDelivery(row.delivery) &&
      SCHEDULED_NOMINATION_STATUSES.has(row.delivery.nomination_status) &&
      !ALLOCATION_COMPLETE_STATUSES.has(row.delivery.allocation_status),
  ).length
  const selectedRowAllowedTransportModes = selectedRow
    ? resolveAllowedTransportModes(
        commodities.find((record) => record.code === selectedRow.delivery.commodity) ?? null,
      )
    : []
  const schedulingWorkbenchWorkboard = resolveOperationalWorkboardDefinition(
    'schedulingWorkbench',
    operationalResourceDescriptors,
  )
  const workbenchFilterChips = [
    selectedCommodityRecord?.name ?? null,
    effectiveTransportFilter !== 'ALL' ? formatTransportModeLabel(effectiveTransportFilter) : null,
    lifecycleFilter !== 'OPEN' ? activeLifecycleLabel : 'Open queue',
    allocationFilter !== 'ALL' ? activeAllocationLabel : null,
    shipmentFilter !== 'ALL' ? activeShipmentLabel : null,
    appliedRailRouteCode ? `Route ${appliedRailRoute?.code ?? appliedRailRouteCode}` : null,
  ].filter((value): value is string => Boolean(value))
  const hasActiveBoardFilters =
    effectiveSelectedCommodityCode !== 'ALL' ||
    effectiveTransportFilter !== 'ALL' ||
    lifecycleFilter !== 'OPEN' ||
    allocationFilter !== 'ALL' ||
    shipmentFilter !== 'ALL' ||
    localRailRouteCode !== null

  function resetFilters() {
    setLifecycleFilter('OPEN')
    setAllocationFilter('ALL')
    setShipmentFilter('ALL')
    setSelectedCommodityCode('ALL')
    setTransportFilter('ALL')
  }

  function handleRailRouteFocusChange(nextCode: string) {
    if (normalizedRouteHandoff) {
      onClearHandoff()
    }
    setSelectedRailRouteFilterCode(nextCode.trim().toUpperCase())
  }

  function clearRailRouteFocus() {
    if (normalizedRouteHandoff) {
      onClearHandoff()
    }
    setSelectedRailRouteFilterCode('')
  }

  return (
    <TileLayout
      workspaceId="scheduling"
      workspaceLabel="Scheduling"
      authSession={authSession}
      headerContent={
        normalizedRouteHandoff || hasGlobalFilter ? (
          <>
            {normalizedRouteHandoff ? (
              <WorkspaceHandoffFocusBanner
                currentView="scheduling"
                handoff={normalizedRouteHandoff}
                onClear={onClearHandoff}
                clearLabel="Show Full Board"
              />
            ) : null}
            {hasGlobalFilter ? (
              <section className="surface workspace-local-filter">
                <div className="workspace-local-filter-copy">
                  <div>
                    <span className="eyebrow">Filter</span>
                    <h3>Global Scheduler Filter</h3>
                  </div>
                  <p>
                    Global nav filter “{globalFilter.trim()}” is also narrowing the scheduler queue inside this workspace.
                  </p>
                </div>
              </section>
            ) : null}
          </>
        ) : undefined
      }
      tiles={[
        {
          id: 'scheduling-board',
          eyebrow: 'Scheduler',
          title: 'Scheduling Board',
          description: 'A tighter control surface for answering the desk’s key questions first: what is open, allocated, and shipped.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            scopedDeliveries.length > 0 ? (
              <div className="scheduler-board">
                <div className="scheduler-board-hero">
                  <div className="scheduler-board-hero-copy">
                    <span className="eyebrow">Operator View</span>
                    <strong>{formatNumber(openCount, 0)} open rows still need scheduling attention</strong>
                    <p>
                      {formatNumber(filteredRows.length, 0)} visible rows from a {formatNumber(filteredQueueCount, 0)} row product slice. Start with blocked, unallocated, and unshipped work.
                    </p>
                    <div className="shipment-card-meta scheduler-board-hero-meta">
                      <span className="entity-chip entity-chip-soft">{activeCommodityLabel}</span>
                      <span className="entity-chip entity-chip-soft">{activeTransportLabel}</span>
                      {appliedRailRouteCode ? (
                        <span className="entity-chip entity-chip-soft">
                          Route {appliedRailRoute?.code ?? appliedRailRouteCode}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="scheduler-board-focus">
                    <span>Visible Queue</span>
                    <strong>{formatNumber(filteredRows.length, 0)}</strong>
                    <small>
                      {lifecycleFilter === 'OPEN'
                        ? 'open rows in the current workbench'
                        : `${activeLifecycleLabel.toLowerCase()} rows in the current workbench`}
                    </small>
                  </div>
                </div>

                <div className="scheduler-control-grid">
                  <section className="scheduler-control-panel">
                    <div className="scheduler-control-head">
                      <div className="scheduler-section-copy">
                        <strong>Scope the board</strong>
                        <p>Set the product, mode, and route before working the queue.</p>
                      </div>
                    </div>
                    <div className="scheduler-select-grid">
                      <label className="field">
                        <span>Commodity</span>
                        <select
                          className="control control-compact"
                          value={effectiveSelectedCommodityCode}
                          onChange={(event) => setSelectedCommodityCode(event.target.value)}
                        >
                          <option value="ALL">All Products</option>
                          {commodityFilterOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Transport</span>
                        <select
                          className="control control-compact"
                          value={effectiveTransportFilter}
                          onChange={(event) => setTransportFilter(event.target.value as SchedulingTransportFilter)}
                        >
                          <option value="ALL">All Modes</option>
                          {transportFilterOptions.map((option) => (
                            <option key={option} value={option}>
                              {formatTransportModeLabel(option)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Rail Route</span>
                        <select
                          className="control control-compact"
                          value={appliedRailRouteCode ?? ''}
                          onChange={(event) => handleRailRouteFocusChange(event.target.value)}
                          disabled={railRouteFilterOptions.length === 0}
                        >
                          <option value="">All Rail Routes</option>
                          {railRouteFilterOptions.map((route) => (
                            <option key={route.code} value={route.code}>
                              {route.code} - {route.name}
                              {route.is_active ? '' : ' (Inactive)'}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="scheduler-filter-detail">
                      {selectedCommodityRecord && selectedCommodityRecord.allowed_transport_modes?.length
                        ? `Transport options are constrained by the ${selectedCommodityRecord.name} commodity master.`
                        : 'Choose a product first when you want transport choices constrained to that product.'}
                    </p>
                    {appliedRailRouteCode ? (
                      <p className="scheduler-filter-detail">
                        Rail route {appliedRailRoute?.code ?? appliedRailRouteCode}
                        {appliedRailRoute ? ` · ${appliedRailRoute.name}` : ''} is currently in focus. Clear the route focus to return to the full scheduler board.
                      </p>
                    ) : railRouteFilterOptions.length === 0 ? (
                      <p className="scheduler-filter-detail">
                        No governed rail routes are loaded yet for native scheduler focus.
                      </p>
                    ) : (
                      <p className="scheduler-filter-detail">
                        Use a governed rail route when you need lane-specific focus without relying on text search.
                      </p>
                    )}
                  </section>

                  <section className="scheduler-control-panel">
                    <div className="scheduler-control-head">
                      <div className="scheduler-section-copy">
                        <strong>Filter by operational state</strong>
                        <p>Isolate the work that still needs scheduling decisions.</p>
                      </div>
                      <div className="scheduler-filter-row">
                        {appliedRailRouteCode ? (
                          <button type="button" className="button button-ghost" onClick={clearRailRouteFocus}>
                            Clear Route
                          </button>
                        ) : null}
                        {hasActiveBoardFilters ? (
                          <button type="button" className="button button-secondary" onClick={resetFilters}>
                            Reset View
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="scheduler-state-filter-stack">
                      <div className="scheduler-state-filter-group">
                        <span className="scheduler-filter-label">Open / Closed</span>
                        <div className="scheduler-filter-row">
                          {LIFECYCLE_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`scheduler-filter-button ${lifecycleFilter === option.value ? 'is-active' : ''}`}
                              aria-pressed={lifecycleFilter === option.value}
                              onClick={() => setLifecycleFilter(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="scheduler-state-filter-group">
                        <span className="scheduler-filter-label">Allocation</span>
                        <div className="scheduler-filter-row">
                          {ALLOCATION_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`scheduler-filter-button ${allocationFilter === option.value ? 'is-active' : ''}`}
                              aria-pressed={allocationFilter === option.value}
                              onClick={() => setAllocationFilter(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="scheduler-state-filter-group">
                        <span className="scheduler-filter-label">Shipment</span>
                        <div className="scheduler-filter-row">
                          {SHIPMENT_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`scheduler-filter-button ${shipmentFilter === option.value ? 'is-active' : ''}`}
                              aria-pressed={shipmentFilter === option.value}
                              onClick={() => setShipmentFilter(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="scheduler-filter-detail">
                      Open, allocation, and shipment states stay visible here so operators do not have to scan every row to find the real exceptions.
                    </p>
                  </section>
                </div>

                {filteredQueueCount > 0 ? (
                  <div className="scheduler-kpi-grid">
                    <article className="scheduler-kpi-card scheduler-kpi-card-open">
                      <span>Open</span>
                      <strong>{formatNumber(openCount, 0)}</strong>
                      <small>{formatNumber(closedCount, 0)} closed</small>
                    </article>
                    <article className="scheduler-kpi-card scheduler-kpi-card-ready">
                      <span>Unallocated</span>
                      <strong>{formatNumber(unallocatedCount, 0)}</strong>
                      <small>{formatNumber(allocatedCount, 0)} allocated</small>
                    </article>
                    <article className="scheduler-kpi-card scheduler-kpi-card-window">
                      <span>Unshipped</span>
                      <strong>{formatNumber(unshippedCount, 0)}</strong>
                      <small>{formatNumber(shippedCount, 0)} shipped</small>
                    </article>
                    <article className="scheduler-kpi-card scheduler-kpi-card-risk">
                      <span>Blocked</span>
                      <strong>{formatNumber(blockedRows.length, 0)}</strong>
                      <small>{formatNumber(dueSoonRows.length, 0)} in hot window</small>
                    </article>
                  </div>
                ) : (
                  <div className="scheduler-filter-empty surface">
                    <strong>No rows match the current scheduler filters</strong>
                    <p>Clear the current product or lifecycle filters to return to the broader scheduler queue.</p>
                    <div className="stack-actions">
                      <button type="button" className="button button-secondary" onClick={resetFilters}>
                        Clear Filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No scheduler queue yet</strong>
                <p>Create active physical trades to start populating the scheduler workbench.</p>
              </div>
            ),
        },
        {
          id: 'scheduling-attention',
          eyebrow: 'Workbench',
          title: filteredRows.length > 0 ? 'Scheduling Workbench' : 'No visible scheduling rows',
          description: 'A stage-first queue on the left and a selected-row action panel on the right.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <OperationalBoardController
              workboard={schedulingWorkbenchWorkboard}
              className="scheduler-workbench"
              mainClassName="scheduler-workbench-queue"
              detailClassName="scheduler-detail-panel"
              isEmpty={filteredRows.length === 0}
              summary={
                filteredRows.length > 0 ? (
                  <div className="scheduler-workbench-summary">
                    <strong>{formatNumber(filteredRows.length, 0)} rows in the active scheduler workbench</strong>
                    <div className="shipment-card-meta">
                      {workbenchFilterChips.map((chip) => (
                        <span key={chip} className="entity-chip entity-chip-soft">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <></>
                )
              }
              detail={
                filteredRows.length > 0 ? (
                  selectedRow ? (
                    <div className="scheduler-detail-stack">
                      <div className="scheduler-detail-card">
                        <div className="scheduler-detail-head">
                          <div className="scheduler-detail-copy">
                            <strong>{tradeReferenceLabel(selectedRow.delivery)}</strong>
                            <span>
                              {selectedRow.delivery.commodity} • {selectedRow.delivery.counterparty ?? 'Counterparty TBD'} • {selectedRow.delivery.book}
                            </span>
                          </div>
                          <span className={`status-pill status-pill-${SECTION_META[sectionKeyForRow(selectedRow)].tone}`}>
                            {SECTION_META[sectionKeyForRow(selectedRow)].label}
                          </span>
                        </div>

                        <div className="scheduler-detail-context">
                          <span>{deliveryRouteLabel(selectedRow.delivery)}</span>
                          <span>{deliveryWindowLabel(selectedRow.delivery, formatDateOnly)}</span>
                          <span>{MODE_LABELS[selectedRow.delivery.mode_family]}</span>
                        </div>

                        <div className="shipment-card-meta">
                          <span className="entity-chip entity-chip-soft">{formatTransportModeLabel(selectedRow.delivery.transport_mode)}</span>
                          <span className="entity-chip entity-chip-soft">{formatCommodityClass(selectedRow.delivery.commodity_class)}</span>
                          <span className={`scheduler-window-band scheduler-window-band-${WINDOW_BAND_META[selectedRow.windowBand].className}`}>
                            {WINDOW_BAND_META[selectedRow.windowBand].label}
                          </span>
                        </div>

                        <article className="scheduler-next-step">
                          <span>Next Step</span>
                          <strong>{nextActionText(selectedRow)}</strong>
                          <p>
                            {selectedRow.dueAt
                              ? `Due ${formatDateOnly(selectedRow.dueAt)}`
                              : 'No due date has been set'} • {schedulerOwnerLabel(selectedRow)}
                          </p>
                        </article>

                        <div className="scheduler-state-ledger">
                          <article className={`scheduler-state-ledger-card scheduler-state-ledger-card-${lifecycleStateTone(selectedRow.delivery)}`}>
                            <span>Lifecycle</span>
                            <strong>{lifecycleStateLabel(selectedRow.delivery)}</strong>
                            <small>{SECTION_META[sectionKeyForRow(selectedRow)].label} queue state</small>
                          </article>
                          <article className={`scheduler-state-ledger-card scheduler-state-ledger-card-${allocationStateTone(selectedRow.delivery)}`}>
                            <span>Allocation</span>
                            <strong>{allocationStateLabel(selectedRow.delivery)}</strong>
                            <small>
                              {isAllocatedSchedulingDelivery(selectedRow.delivery)
                                ? 'Allocation coverage is already in place.'
                                : 'This row still needs allocation follow-through.'}
                            </small>
                          </article>
                          <article className={`scheduler-state-ledger-card scheduler-state-ledger-card-${shipmentStateTone(selectedRow.delivery)}`}>
                            <span>Shipment</span>
                            <strong>{shipmentStateLabel(selectedRow.delivery)}</strong>
                            <small>
                              {isShippedSchedulingDelivery(selectedRow.delivery)
                                ? 'Movement execution is already reflected as shipped.'
                                : 'Movement execution still needs to be completed.'}
                            </small>
                          </article>
                        </div>

                        <div className="scheduler-detail-grid">
                          <article className="scheduler-detail-stat">
                            <span>Window</span>
                            <strong>{deliveryWindowLabel(selectedRow.delivery, formatDateOnly)}</strong>
                            <p>{WINDOW_BAND_META[selectedRow.windowBand].description}</p>
                          </article>
                          <article className="scheduler-detail-stat">
                            <span>Workflow Owner</span>
                            <strong>{schedulerOwnerLabel(selectedRow)}</strong>
                            <p>
                              {selectedRow.openWorkflowItems.length > 0
                                ? `${formatNumber(selectedRow.openWorkflowItems.length, 0)} open workflow item(s).`
                                : 'No open scheduling workflow items on this row.'}
                            </p>
                          </article>
                          <article className="scheduler-detail-stat">
                            <span>Transport Guardrail</span>
                            <strong>{formatTransportModeLabel(selectedRow.delivery.transport_mode)}</strong>
                            <p>
                              {selectedRowAllowedTransportModes.length > 0
                                ? `Allowed: ${selectedRowAllowedTransportModes.map(formatTransportModeLabel).join(', ')}`
                                : 'No product-specific transport constraint is loaded for this row.'}
                            </p>
                          </article>
                          <article className="scheduler-detail-stat">
                            <span>Counterparty</span>
                            <strong>{selectedRow.delivery.counterparty ?? 'Counterparty TBD'}</strong>
                            <p>
                              {selectedRow.delivery.book} • {formatCommodityClass(selectedRow.delivery.commodity_class)}
                            </p>
                          </article>
                        </div>

                        {selectedRow.delivery.blockers.length > 0 ? (
                          <div className="scheduler-detail-blockers">
                            <strong>Active blockers</strong>
                            <div className="scheduler-blocker-cluster">
                              {selectedRow.delivery.blockers.map((blocker) => (
                                <span key={blocker} className="scheduler-blocker-chip">
                                  {blocker}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="scheduler-detail-blockers scheduler-detail-blockers-clear">
                            <strong>No explicit blockers</strong>
                            <p>This row can be worked directly from the scheduling workflow items below.</p>
                          </div>
                        )}

                        <div className="shipment-card-actions">
                          <span>
                            Slice watchlist: {formatNumber(unassignedRows.length, 0)} unassigned, {formatNumber(confirmationPendingCount, 0)} confirmation gap(s), and {formatNumber(allocationFollowUpCount, 0)} allocation follow-up row(s).
                          </span>
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => onOpenTrade(selectedRow.delivery.trade_id)}
                          >
                            Open Trade
                          </button>
                        </div>
                      </div>

                      {renderOperationalActionPanel('deliveryActualization', operationalResourceDescriptors, {
                        authSession,
                        delivery: selectedRow.delivery,
                        saveError: actualizationMutationError,
                        savingDeliveryId: actualizationMutationPendingDeliveryId,
                        formatDate,
                        formatNumber,
                        onSave: onSaveActualization,
                      })}

                      {renderOperationalActionPanel('schedulerWorkflow', operationalResourceDescriptors, {
                        authSession,
                        delivery: selectedRow.delivery,
                        items: selectedRow.openWorkflowItems,
                        creationPendingTradeId: workflowCreationPendingTradeId,
                        savingItemId: workflowMutationPendingId,
                        saveError: workflowMutationError,
                        formatDate,
                        formatDateOnly,
                        onCreateItem: onCreateWorkflowItem,
                        onOpenTrade,
                        onSaveItem: onSaveWorkflowItem,
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>No row selected</strong>
                      <p>Choose a row from the queue to inspect its scheduler detail and workflow actions.</p>
                    </div>
                  )
                ) : undefined
              }
              emptyStateTitle="No scheduler rows in this view"
              emptyStateDetail="Clear the current filters to reopen the broader scheduler workbench."
            >
              {filteredRows.length > 0 ? (
                <div className="scheduler-stage-stack">
                  {stageSections.map((section) => (
                    <section key={section.section} className="scheduler-stage-section">
                      <div className="scheduler-stage-head">
                        <div className="scheduler-stage-copy">
                          <strong>{SECTION_META[section.section].label}</strong>
                          <p>{SECTION_META[section.section].description}</p>
                        </div>
                        <span className={`status-pill status-pill-${SECTION_META[section.section].tone}`}>
                          {formatNumber(section.rows.length, 0)}
                        </span>
                      </div>

                      <div className="scheduler-stage-list">
                        {section.rows.map((row) => {
                          const band = WINDOW_BAND_META[row.windowBand]
                          const rowSectionKey = sectionKeyForRow(row)
                          const isSelected = selectedRow?.delivery.delivery_id === row.delivery.delivery_id

                          return (
                            <button
                              key={row.delivery.delivery_id}
                              type="button"
                              className={`scheduler-queue-card ${isSelected ? 'is-active' : ''}`}
                              onClick={() => setSelectedDeliveryId(row.delivery.delivery_id)}
                              aria-pressed={isSelected}
                            >
                              <div className="scheduler-queue-card-head">
                                <div className="scheduler-queue-card-copy">
                                  <strong>{tradeReferenceLabel(row.delivery)}</strong>
                                  <span>
                                    {row.delivery.commodity} • {deliveryRouteLabel(row.delivery)}
                                  </span>
                                </div>
                                <span className={`status-pill status-pill-${SECTION_META[rowSectionKey].tone}`}>
                                  {SECTION_META[rowSectionKey].label}
                                </span>
                              </div>

                              <div className="shipment-card-meta">
                                <span className={`scheduler-window-band scheduler-window-band-${band.className}`}>{band.label}</span>
                                <span className="entity-chip entity-chip-soft">{formatTransportModeLabel(row.delivery.transport_mode)}</span>
                                <span className="entity-chip entity-chip-soft">{MODE_LABELS[row.delivery.mode_family]}</span>
                              </div>

                              <div className="scheduler-queue-state-strip">
                                <span className={`scheduler-state-token scheduler-state-token-${lifecycleStateTone(row.delivery)}`}>
                                  {lifecycleStateLabel(row.delivery)}
                                </span>
                                <span className={`scheduler-state-token scheduler-state-token-${allocationStateTone(row.delivery)}`}>
                                  {allocationStateLabel(row.delivery)}
                                </span>
                                <span className={`scheduler-state-token scheduler-state-token-${shipmentStateTone(row.delivery)}`}>
                                  {shipmentStateLabel(row.delivery)}
                                </span>
                              </div>

                              {row.delivery.blockers.length > 0 ? (
                                <div className="scheduler-blocker-cluster">
                                  {row.delivery.blockers.slice(0, 2).map((blocker) => (
                                    <span key={blocker} className="scheduler-blocker-chip">
                                      {blocker}
                                    </span>
                                  ))}
                                </div>
                              ) : null}

                              <div className="scheduler-card-footer">
                                <div className="scheduler-card-footer-copy">
                                  <span>{nextActionText(row)}</span>
                                  <small>
                                    {deliveryWindowLabel(row.delivery, formatDateOnly)}
                                    {row.dueAt ? ` • due ${formatDateOnly(row.dueAt)}` : ''}
                                  </small>
                                </div>
                                <small>{schedulerOwnerLabel(row)}</small>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </OperationalBoardController>
          ),
        },
        {
          id: 'scheduling-truck-tracking-exceptions',
          eyebrow: 'Truck Tracking',
          title: 'Truck Tracking Exceptions',
          description: 'Read-only ETA, freshness, and dwell exceptions before they become workflow automation.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <TruckTrackingExceptionQueue
              authSession={authSession}
              formatDate={formatDate}
              formatDateOnly={formatDateOnly}
              formatNumber={formatNumber}
              onOpenTrade={onOpenTrade}
            />
          ),
        },
      ]}
    />
  )
}
