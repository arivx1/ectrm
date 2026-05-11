import { useEffect, useMemo, useState } from 'react'

import type { CreateTradeWorkflowItemInput, UpdateTradeWorkflowItemInput } from '../../entities/operations/api'
import type { SaveDeliveryActualizationInput } from '../../entities/shipments/api'
import {
  getAppRouteHandoffFilterValue,
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
} from '../../shared/appRouteHandoff'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import type { DeliveryRecord, DeliverySchedulingWorkflowItemRecord, RailRouteRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { TileLayout } from '../../shared/ui/TileLayout'
import { WorkspaceHandoffFocusBanner } from '../../shared/ui/WorkspaceHandoffFocusBanner'
import type { OperationalResourceDescriptor } from '../../entities/app/api'
import { OperationalBoardController } from '../operations/OperationalBoardController'
import { renderOperationalActionPanel } from '../operations/operationalActionPanelRegistry'
import { OperationalWorkboardBanner } from '../operations/OperationalWorkboardBanner'
import { resolveOperationalWorkboardDefinition } from '../operations/operationalWorkboardRegistry'
import type {
  SchedulingStage,
  SchedulingViewPreset,
  SchedulingWindowBand,
  SchedulingWorkbenchRow,
} from './schedulingHelpers'
import {
  ALLOCATION_COMPLETE_STATUSES,
  buildSchedulingWorkbenchRows,
  deliveryStartTimestamp,
  matchesSchedulingView,
  SCHEDULED_NOMINATION_STATUSES,
  SCHEDULING_WINDOW_HOURS,
  selectUpcomingSchedulingWindows,
  windowBandForDelivery,
} from './schedulingHelpers'

type SchedulingWorkspaceProps = {
  authSession: StoredAuthSession | null
  routeHandoff: AppRouteHandoff | null
  globalFilter: string
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

type SchedulingModeFilter = 'ALL' | DeliveryRecord['mode_family']

const MODE_LABELS: Record<DeliveryRecord['mode_family'], string> = {
  LOGISTICS: 'Logistics',
  NETWORK_FLOW: 'Network Flow',
  POWER_SCHEDULE: 'Power Schedule',
}

const MODE_DESCRIPTIONS: Record<DeliveryRecord['mode_family'], string> = {
  LOGISTICS: 'Discrete moves that still need explicit transport, terminal, or vessel handling.',
  NETWORK_FLOW: 'Pipeline-style flow work where path, nomination, and allocation handoffs matter most.',
  POWER_SCHEDULE: 'Interval-driven obligations where scheduler confidence is shaped by hourly completeness.',
}

const MODE_FILTER_OPTIONS: Array<{ value: SchedulingModeFilter; label: string }> = [
  { value: 'ALL', label: 'All Modes' },
  { value: 'LOGISTICS', label: MODE_LABELS.LOGISTICS },
  { value: 'NETWORK_FLOW', label: MODE_LABELS.NETWORK_FLOW },
  { value: 'POWER_SCHEDULE', label: MODE_LABELS.POWER_SCHEDULE },
]

const VIEW_PRESET_OPTIONS: Array<{
  value: SchedulingViewPreset
  label: string
  detail: string
}> = [
  {
    value: 'DESK',
    label: 'Desk View',
    detail: 'The full scheduler queue across every stage.',
  },
  {
    value: 'HOT_WINDOW',
    label: 'Hot Window',
    detail: 'Rows whose delivery window is already live or inside the next 72 hours.',
  },
  {
    value: 'BLOCKED',
    label: 'Blocked',
    detail: 'Rows blocked by upstream controls, data quality, or overdue workflow items.',
  },
  {
    value: 'READY',
    label: 'Ready',
    detail: 'Commercially ready rows that can move into scheduling now.',
  },
  {
    value: 'IN_FLIGHT',
    label: 'In Flight',
    detail: 'Rows already being worked by a scheduler or waiting on downstream acknowledgement.',
  },
  {
    value: 'WATCHLIST',
    label: 'Watchlist',
    detail: 'Later-dated obligations that still need visibility but not immediate schedule action.',
  },
]

const STAGE_ORDER: SchedulingStage[] = ['BLOCKED', 'READY', 'IN_FLIGHT', 'WATCHLIST']

const STAGE_META: Record<
  SchedulingStage,
  {
    label: string
    description: string
    tone: 'active' | 'blocked' | 'in-progress' | 'planned'
  }
> = {
  BLOCKED: {
    label: 'Blocked',
    description: 'Rows waiting on upstream confirmation, data repair, or overdue workflow cleanup.',
    tone: 'blocked',
  },
  READY: {
    label: 'Ready',
    description: 'Rows that are commercially clean and ready for schedule action.',
    tone: 'active',
  },
  IN_FLIGHT: {
    label: 'In Flight',
    description: 'Rows already being worked, submitted, or handed off into follow-up.',
    tone: 'in-progress',
  },
  WATCHLIST: {
    label: 'Watchlist',
    description: 'Rows that still matter, but do not require the scheduler’s next click yet.',
    tone: 'planned',
  },
}

const STAGE_TO_VIEW_PRESET: Record<SchedulingStage, SchedulingViewPreset> = {
  BLOCKED: 'BLOCKED',
  READY: 'READY',
  IN_FLIGHT: 'IN_FLIGHT',
  WATCHLIST: 'WATCHLIST',
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
  const [modeFilter, setModeFilter] = useState<SchedulingModeFilter>('ALL')
  const [viewPreset, setViewPreset] = useState<SchedulingViewPreset>('DESK')
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
  const openDeliveries = deliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const scopedOpenDeliveries = appliedRailRouteCode
    ? openDeliveries.filter((delivery) => delivery.rail_route_code === appliedRailRouteCode)
    : openDeliveries
  const workbenchRows = useMemo(
    () => buildSchedulingWorkbenchRows(scopedOpenDeliveries, now, schedulingWindowMs),
    [now, scopedOpenDeliveries, schedulingWindowMs],
  )
  const globallyVisibleRows = useMemo(
    () => workbenchRows.filter((row) => matchesSchedulingWorkbenchFilter(row, effectiveGlobalFilter)),
    [effectiveGlobalFilter, workbenchRows],
  )
  const modeScopedRows = globallyVisibleRows.filter((row) => modeFilter === 'ALL' || row.delivery.mode_family === modeFilter)
  const filteredRows = modeScopedRows.filter((row) => matchesSchedulingView(row, viewPreset))
  const filteredOpenDeliveries = filteredRows.map((row) => row.delivery)

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
  const activeViewOption =
    VIEW_PRESET_OPTIONS.find((option) => option.value === viewPreset) ?? VIEW_PRESET_OPTIONS[0]
  const activeModeLabel = MODE_FILTER_OPTIONS.find((option) => option.value === modeFilter)?.label ?? 'All Modes'
  const matchingRatio = scopedOpenDeliveries.length > 0 ? Math.round((filteredRows.length / scopedOpenDeliveries.length) * 100) : 0
  const dueSoonRows = filteredRows.filter((row) => row.isDueSoon)
  const blockedRows = filteredRows.filter((row) => row.stage === 'BLOCKED')
  const readyRows = filteredRows.filter((row) => row.stage === 'READY')
  const unassignedRows = filteredRows.filter((row) =>
    row.openWorkflowItems.some((item) => !item.owner?.trim()),
  )
  const stageSections = STAGE_ORDER.map((stage) => ({
    stage,
    rows: filteredRows.filter((row) => row.stage === stage),
  })).filter((section) => section.rows.length > 0)
  const stageLanes = STAGE_ORDER.map((stage) => {
    const rows = modeScopedRows.filter((row) => row.stage === stage)
    const nextRow =
      [...rows].sort((left, right) => {
        const leftStart = deliveryStartTimestamp(left.delivery) ?? Number.POSITIVE_INFINITY
        const rightStart = deliveryStartTimestamp(right.delivery) ?? Number.POSITIVE_INFINITY
        return leftStart - rightStart
      })[0] ?? null

    return {
      stage,
      count: rows.length,
      dueSoonCount: rows.filter((row) => row.isDueSoon).length,
      nextRow,
      isActive: viewPreset === STAGE_TO_VIEW_PRESET[stage],
    }
  })
  const presetCounts = Object.fromEntries(
    VIEW_PRESET_OPTIONS.map((option) => [
      option.value,
      modeScopedRows.filter((row) => matchesSchedulingView(row, option.value)).length,
    ]),
  ) as Record<SchedulingViewPreset, number>
  const handoffRows = [
    {
      label: 'Unassigned Scheduling Work',
      count: unassignedRows.length,
      detail: 'Open scheduling workflow items that still need an explicit owner.',
    },
    {
      label: 'Overdue Workflow',
      count: filteredRows.filter((row) => row.openWorkflowItems.some((item) => item.is_overdue)).length,
      detail: 'Rows carrying overdue confirmation, nomination, or allocation follow-up.',
    },
    {
      label: 'Confirmation Pending',
      count: filteredRows.filter((row) => row.delivery.confirmation_status !== 'CONFIRMED').length,
      detail: 'Rows still waiting on confirmed commercial terms before the schedule can be trusted.',
    },
    {
      label: 'Allocation Follow-Up',
      count: filteredRows.filter(
        (row) =>
          SCHEDULED_NOMINATION_STATUSES.has(row.delivery.nomination_status) &&
          !ALLOCATION_COMPLETE_STATUSES.has(row.delivery.allocation_status),
      ).length,
      detail: 'Rows that have moved into schedule execution but still need downstream allocation closure.',
    },
    {
      label: 'Window Data Gaps',
      count: filteredRows.filter(
        (row) => !row.delivery.delivery_start || !row.delivery.delivery_end,
      ).length,
      detail: 'Rows that still need complete delivery-window data before schedulers can plan confidently.',
    },
    {
      label: 'Actualization Gaps',
      count: filteredRows.filter((row) => row.delivery.actualization_status !== 'ACTUALIZED').length,
      detail: 'Rows that still need executed quantity and final delivery timing captured before downstream settlement is trusted.',
    },
  ]
  const upcomingWindows = selectUpcomingSchedulingWindows(filteredOpenDeliveries)
  const schedulingWorkbenchWorkboard = resolveOperationalWorkboardDefinition(
    'schedulingWorkbench',
    operationalResourceDescriptors,
  )

  function resetFilters() {
    setModeFilter('ALL')
    setViewPreset('DESK')
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
                    Global nav filter “{globalFilter.trim()}” is also narrowing the scheduler queue. Saved views and the
                    mode lens still apply inside this workspace.
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
          title: 'Scheduler Command Deck',
          description: 'A stage-first command surface for mixed-commodity schedule work, saved views, and queue health.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            openDeliveries.length > 0 ? (
              <div className="scheduler-board">
                <OperationalWorkboardBanner workboard={schedulingWorkbenchWorkboard} />
                <div className="scheduler-board-head">
                  <div className="scheduler-board-copy">
                    <strong>
                      Showing {formatNumber(filteredRows.length, 0)} of {formatNumber(scopedOpenDeliveries.length, 0)} open rows
                    </strong>
                    <p>
                      Work the mixed-commodity scheduler queue by saved view first, then narrow by mode when you need a
                      commodity-specific slice.
                    </p>
                    {appliedRailRouteCode ? (
                      <p>
                        Rail route {appliedRailRoute?.code ?? appliedRailRouteCode}
                        {appliedRailRoute ? ` · ${appliedRailRoute.name}` : ''} is currently in focus. Clear the
                        route focus to return to the full scheduler board.
                      </p>
                    ) : null}
                  </div>
                  <div className="scheduler-board-focus">
                    <span>Active View</span>
                    <strong>{activeViewOption.label}</strong>
                    <small>{activeModeLabel}</small>
                  </div>
                </div>

                <div className="scheduler-filter-grid">
                  <div className="scheduler-filter-group">
                    <span className="scheduler-filter-label">Saved Views</span>
                    <div className="scheduler-filter-row">
                      {VIEW_PRESET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`scheduler-filter-button ${viewPreset === option.value ? 'is-active' : ''}`}
                          aria-pressed={viewPreset === option.value}
                          onClick={() => setViewPreset(option.value)}
                        >
                          {option.label} ({formatNumber(presetCounts[option.value], 0)})
                        </button>
                      ))}
                    </div>
                    <p className="scheduler-filter-detail">{activeViewOption.detail}</p>
                  </div>

                  <div className="scheduler-filter-group">
                    <span className="scheduler-filter-label">Mode Lens</span>
                    <div className="scheduler-filter-row">
                      {MODE_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`scheduler-filter-button ${modeFilter === option.value ? 'is-active' : ''}`}
                          aria-pressed={modeFilter === option.value}
                          onClick={() => setModeFilter(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="scheduler-filter-detail">
                      Keep mode family as a secondary lens while the main queue stays organized by work stage.
                    </p>
                  </div>

                  <div className="scheduler-filter-group">
                    <span className="scheduler-filter-label">Rail Route Focus</span>
                    <div className="scheduler-filter-row">
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
                      {appliedRailRouteCode ? (
                        <button type="button" className="button button-ghost" onClick={clearRailRouteFocus}>
                          Clear Route
                        </button>
                      ) : null}
                    </div>
                    <p className="scheduler-filter-detail">
                      {railRouteFilterOptions.length > 0
                        ? 'Use a governed rail route to narrow the scheduler board by lane without relying on text search.'
                        : 'No governed rail routes are loaded yet for native scheduler focus.'}
                    </p>
                  </div>
                </div>

                {filteredRows.length > 0 ? (
                  <div className="scheduler-kpi-grid">
                    <article className="scheduler-kpi-card scheduler-kpi-card-open">
                      <span>Visible Queue</span>
                      <strong>{formatNumber(filteredRows.length, 0)}</strong>
                      <p>Rows currently in view after saved-view and mode filters are applied.</p>
                    </article>
                    <article className="scheduler-kpi-card scheduler-kpi-card-window">
                      <span>Hot Window</span>
                      <strong>{formatNumber(dueSoonRows.length, 0)}</strong>
                      <p>Rows whose delivery window is already live or inside the next 72 hours.</p>
                    </article>
                    <article className="scheduler-kpi-card scheduler-kpi-card-ready">
                      <span>Ready Now</span>
                      <strong>{formatNumber(readyRows.length, 0)}</strong>
                      <p>Rows ready for scheduler action without waiting on new upstream cleanup.</p>
                    </article>
                    <article className="scheduler-kpi-card scheduler-kpi-card-risk">
                      <span>Blocked</span>
                      <strong>{formatNumber(blockedRows.length, 0)}</strong>
                      <p>Rows currently blocked by data quality, confirmation, or workflow exception gaps.</p>
                    </article>
                  </div>
                ) : (
                  <div className="scheduler-filter-empty surface">
                    <strong>No rows match the current scheduler filters</strong>
                    <p>Clear the current saved view or mode lens to return to the broader scheduler queue.</p>
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
                  <div className="shipment-card-actions">
                    <span>{formatNumber(filteredRows.length, 0)} rows in the active scheduler workbench</span>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">
                        {activeViewOption.label} • {activeModeLabel}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        {formatNumber(blockedRows.length, 0)} blocked
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        {formatNumber(dueSoonRows.length, 0)} hot window
                      </span>
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
                              {selectedRow.delivery.commodity} • {selectedRow.delivery.counterparty ?? 'Counterparty TBD'} •{' '}
                              {selectedRow.delivery.book}
                            </span>
                          </div>
                          <span className={`status-pill status-pill-${STAGE_META[selectedRow.stage].tone}`}>
                            {STAGE_META[selectedRow.stage].label}
                          </span>
                        </div>

                        <div className="shipment-card-meta">
                          <span className="entity-chip entity-chip-soft">{MODE_LABELS[selectedRow.delivery.mode_family]}</span>
                          <span className="entity-chip entity-chip-soft">
                            Confirmation {selectedRow.delivery.confirmation_status}
                          </span>
                          <span className="entity-chip entity-chip-soft">
                            Nomination {selectedRow.delivery.nomination_status}
                          </span>
                          <span className="entity-chip entity-chip-soft">
                            Allocation {selectedRow.delivery.allocation_status}
                          </span>
                          <span className="entity-chip entity-chip-soft">
                            Actualization {selectedRow.delivery.actualization_status.replaceAll('_', ' ')}
                          </span>
                        </div>

                        <div className="scheduler-detail-grid">
                          <article className="scheduler-detail-stat">
                            <span>Window</span>
                            <strong>{deliveryWindowLabel(selectedRow.delivery, formatDateOnly)}</strong>
                            <p>{WINDOW_BAND_META[selectedRow.windowBand].description}</p>
                          </article>
                          <article className="scheduler-detail-stat">
                            <span>Next Action</span>
                            <strong>{nextActionText(selectedRow)}</strong>
                            <p>
                              {selectedRow.dueAt
                                ? `Workflow due ${formatDateOnly(selectedRow.dueAt)}`
                                : 'No due date has been set on the current workflow path.'}
                            </p>
                          </article>
                          <article className="scheduler-detail-stat">
                            <span>Owner</span>
                            <strong>{schedulerOwnerLabel(selectedRow)}</strong>
                            <p>
                              {selectedRow.openWorkflowItems.length > 0
                                ? `${formatNumber(selectedRow.openWorkflowItems.length, 0)} open workflow item(s).`
                                : 'No open scheduling workflow items on this row.'}
                            </p>
                          </article>
                          <article className="scheduler-detail-stat">
                            <span>Coverage</span>
                            <strong>{matchingRatio}%</strong>
                            <p>
                              of the {appliedRailRouteCode ? 'focused rail route queue' : 'full scheduler queue'} matches
                              the active view.
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
                          <span>{MODE_DESCRIPTIONS[selectedRow.delivery.mode_family]}</span>
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
                    <p>Choose a row from the stage queue to inspect its scheduler detail and workflow actions.</p>
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
                    <section key={section.stage} className="scheduler-stage-section">
                      <div className="scheduler-stage-head">
                        <div className="scheduler-stage-copy">
                          <strong>{STAGE_META[section.stage].label}</strong>
                          <p>{STAGE_META[section.stage].description}</p>
                        </div>
                        <span className={`status-pill status-pill-${STAGE_META[section.stage].tone}`}>
                          {formatNumber(section.rows.length, 0)}
                        </span>
                      </div>

                      <div className="scheduler-stage-list">
                        {section.rows.map((row) => {
                          const band = WINDOW_BAND_META[row.windowBand]
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
                                    {row.delivery.commodity} • {row.delivery.location_code ?? 'Location TBD'} •{' '}
                                    {MODE_LABELS[row.delivery.mode_family]}
                                  </span>
                                </div>
                                <span className={`status-pill status-pill-${STAGE_META[row.stage].tone}`}>
                                  {STAGE_META[row.stage].label}
                                </span>
                              </div>

                              <div className="shipment-card-meta">
                                <span className="entity-chip entity-chip-soft">
                                  {formatCommodityClass(row.delivery.commodity_class)}
                                </span>
                                <span className={`scheduler-window-band scheduler-window-band-${band.className}`}>
                                  {band.label}
                                </span>
                                <span className="entity-chip entity-chip-soft">{nextActionText(row)}</span>
                                <span className="entity-chip entity-chip-soft">
                                  {schedulerOwnerLabel(row)}
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
                                  <span>{deliveryWindowLabel(row.delivery, formatDateOnly)}</span>
                                  <small>
                                    {row.dueAt ? `Workflow due ${formatDateOnly(row.dueAt)}` : 'No workflow due date'}
                                  </small>
                                </div>
                                <small>Updated {formatDate(row.delivery.last_updated_at)}</small>
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
          id: 'scheduling-lanes',
          eyebrow: 'Stages',
          title: 'Stage Coverage',
          description: 'Use stage coverage to pivot the scheduler workbench without losing the secondary mode lens.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: modeScopedRows.length > 0 ? (
            <div className="scheduler-lane-stack">
              <div className="scheduler-section-banner scheduler-section-banner-compact">
                <div className="scheduler-section-copy">
                  <strong>Stage lanes stay stable while mode acts as a secondary filter</strong>
                  <p>Click a stage to jump the workbench straight into that slice of the scheduler queue.</p>
                </div>
                {viewPreset !== 'DESK' ? (
                  <button type="button" className="button button-ghost" onClick={() => setViewPreset('DESK')}>
                    Show Full Desk
                  </button>
                ) : null}
              </div>

              <div className="scheduler-lane-grid scheduler-stage-lane-grid">
                {stageLanes.map((lane) => (
                  <button
                    key={lane.stage}
                    type="button"
                    className={`scheduler-lane-card ${lane.isActive ? 'is-active' : ''}`}
                    onClick={() =>
                      setViewPreset((current) =>
                        current === STAGE_TO_VIEW_PRESET[lane.stage] ? 'DESK' : STAGE_TO_VIEW_PRESET[lane.stage],
                      )
                    }
                    aria-pressed={lane.isActive}
                  >
                    <div className="scheduler-lane-head">
                      <div className="scheduler-lane-copy">
                        <span>{STAGE_META[lane.stage].label}</span>
                        <strong>{formatNumber(lane.count, 0)}</strong>
                      </div>
                      <span className={`status-pill status-pill-${STAGE_META[lane.stage].tone}`}>
                        {formatNumber(lane.dueSoonCount, 0)} hot
                      </span>
                    </div>

                    <div className="scheduler-lane-meta">
                      <span>{activeModeLabel}</span>
                      <span>{lane.nextRow ? schedulerOwnerLabel(lane.nextRow) : 'No owner yet'}</span>
                      <span>
                        {lane.nextRow ? deliveryWindowLabel(lane.nextRow.delivery, formatDateOnly) : 'No dated row yet'}
                      </span>
                    </div>

                    <div className="scheduler-lane-meter" aria-hidden="true">
                      <span
                        className="scheduler-lane-meter-fill"
                        style={{
                          width: `${modeScopedRows.length > 0 ? Math.round((lane.count / modeScopedRows.length) * 100) : 0}%`,
                        }}
                      />
                    </div>

                    <p>{STAGE_META[lane.stage].description}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No stage coverage in this view</strong>
              <p>Clear the current filters to rebuild the stage lanes.</p>
            </div>
          ),
        },
        {
          id: 'scheduling-windows',
          eyebrow: 'Windows',
          title: upcomingWindows.length > 0 ? 'Delivery Windows and Date Gaps' : 'No delivery windows yet',
          description: 'A time-aware board for seeing what is live, near, and still missing usable delivery dates.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: filteredOpenDeliveries.length > 0 ? (
            upcomingWindows.length > 0 ? (
              <div className="scheduler-window-list">
                {upcomingWindows.map((delivery) => {
                  const band = WINDOW_BAND_META[windowBandForDelivery(delivery, now)]

                  return (
                    <article
                      key={delivery.delivery_id}
                      className={`scheduler-window-card scheduler-window-card-${band.className}`}
                    >
                      <div className="scheduler-window-head">
                        <div className="scheduler-window-copy">
                          <strong>{tradeReferenceLabel(delivery)}</strong>
                          <span>{deliveryWindowLabel(delivery, formatDateOnly)}</span>
                        </div>
                        <span className={`scheduler-window-band scheduler-window-band-${band.className}`}>{band.label}</span>
                      </div>

                      <div className="scheduler-window-meta">
                        <span className="entity-chip entity-chip-soft">{MODE_LABELS[delivery.mode_family]}</span>
                        <span className="entity-chip entity-chip-soft">{delivery.location_code ?? 'Location TBD'}</span>
                        <span className="entity-chip entity-chip-soft">
                          Nomination {delivery.nomination_status}
                        </span>
                      </div>

                      <p className="scheduler-window-description">{band.description}</p>

                      <div className="scheduler-window-footer">
                        <div className="scheduler-card-footer-copy">
                          <span>{delivery.counterparty ?? 'Counterparty TBD'}</span>
                          <small>Updated {formatDate(delivery.last_updated_at)}</small>
                        </div>
                        <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                          Open Trade
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No dated windows in this view</strong>
                <p>The current filter set only contains rows without a usable delivery start date.</p>
              </div>
            )
          ) : (
            <div className="empty-state">
              <strong>No matching scheduler rows</strong>
              <p>Clear the current filters to restore the broader window board.</p>
            </div>
          ),
        },
        {
          id: 'scheduling-handoffs',
          eyebrow: 'Dependencies',
          title: 'Scheduler Handoffs and Data Gaps',
          description: 'Keep the next operational blockers visible while the desk works the stage queue.',
          span: 'full',
          availableSpans: ['full', 'wide', 'half'],
          content: filteredRows.length > 0 ? (
            <div className="scheduler-handoff-grid">
              {handoffRows.map((row) => {
                const ratio =
                  filteredRows.length > 0
                    ? Math.min(100, Math.round((row.count / filteredRows.length) * 100))
                    : 0

                return (
                  <article key={row.label} className="scheduler-handoff-card">
                    <div className="scheduler-handoff-head">
                      <div>
                        <span>{row.label}</span>
                        <strong>{formatNumber(row.count, 0)}</strong>
                      </div>
                      <small>{ratio}%</small>
                    </div>
                    <p>{row.detail}</p>
                    <div className="scheduler-handoff-meter" aria-hidden="true">
                      <span className="scheduler-handoff-meter-fill" style={{ width: `${ratio}%` }} />
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No scheduler dependencies in this view</strong>
              <p>Once the current filters include visible rows again, the dependency board will repopulate.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
