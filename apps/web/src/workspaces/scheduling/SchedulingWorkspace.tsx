import { useEffect, useState } from 'react'

import { TileLayout } from '../../shared/ui/TileLayout'
import type { DeliveryRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import type { SchedulingWindowBand } from './schedulingHelpers'
import {
  ALLOCATION_COMPLETE_STATUSES,
  compareBySchedulerPriority,
  deliveryStartTimestamp,
  deliveryStatusTone,
  isDueWithinWindow,
  isReadyToSchedule,
  NOMINATION_COMPLETE_STATUSES,
  SCHEDULED_NOMINATION_STATUSES,
  SCHEDULING_WINDOW_HOURS,
  selectUpcomingSchedulingWindows,
  windowBandForDelivery,
} from './schedulingHelpers'

type SchedulingWorkspaceProps = {
  authSession: StoredAuthSession | null
  deliveries: DeliveryRecord[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
}

type SchedulingModeFilter = 'ALL' | DeliveryRecord['mode_family']
type SchedulingFocusFilter = 'ALL' | 'DUE_SOON' | 'BLOCKED' | 'READY_TO_SCHEDULE'

const MODE_LABELS: Record<DeliveryRecord['mode_family'], string> = {
  LOGISTICS: 'Logistics',
  NETWORK_FLOW: 'Network Flow',
  POWER_SCHEDULE: 'Power Schedule',
}

const MODE_DESCRIPTIONS: Record<DeliveryRecord['mode_family'], string> = {
  LOGISTICS: 'Discrete moves that still need clear truck, rail, barge, or vessel handling.',
  NETWORK_FLOW: 'Pipeline-style flow windows that stay sensitive to nomination and allocation readiness.',
  POWER_SCHEDULE: 'Interval-driven delivery windows where schedule timing matters more than discrete transport assets.',
}

const MODE_FILTER_OPTIONS: Array<{ value: SchedulingModeFilter; label: string }> = [
  { value: 'ALL', label: 'All Modes' },
  { value: 'LOGISTICS', label: MODE_LABELS.LOGISTICS },
  { value: 'NETWORK_FLOW', label: MODE_LABELS.NETWORK_FLOW },
  { value: 'POWER_SCHEDULE', label: MODE_LABELS.POWER_SCHEDULE },
]

const FOCUS_FILTER_OPTIONS: Array<{ value: SchedulingFocusFilter; label: string; detail: string }> = [
  { value: 'ALL', label: 'Full Queue', detail: 'Every open scheduling row.' },
  { value: 'DUE_SOON', label: '72h Window', detail: 'Rows whose delivery start is close.' },
  { value: 'BLOCKED', label: 'Exceptions', detail: 'Rows blocked by workflow or data gaps.' },
  { value: 'READY_TO_SCHEDULE', label: 'Ready', detail: 'Confirmed rows that can move into scheduling.' },
]

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
    description: 'The window starts inside the near-term scheduling window.',
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

export function SchedulingWorkspace({
  authSession,
  deliveries,
  formatCommodityClass,
  formatNumber,
  formatDate,
  formatDateOnly,
  onOpenTrade,
}: SchedulingWorkspaceProps) {
  const [modeFilter, setModeFilter] = useState<SchedulingModeFilter>('ALL')
  const [focusFilter, setFocusFilter] = useState<SchedulingFocusFilter>('ALL')
  const [now, setNow] = useState<number>(() => currentTimestamp())

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

  function matchesModeFilter(delivery: DeliveryRecord): boolean {
    return modeFilter === 'ALL' || delivery.mode_family === modeFilter
  }

  function matchesFocusFilter(delivery: DeliveryRecord): boolean {
    switch (focusFilter) {
      case 'DUE_SOON':
        return isDueWithinWindow(delivery, now, schedulingWindowMs)
      case 'BLOCKED':
        return delivery.status === 'BLOCKED'
      case 'READY_TO_SCHEDULE':
        return isReadyToSchedule(delivery)
      default:
        return true
    }
  }

  function resetFilters() {
    setModeFilter('ALL')
    setFocusFilter('ALL')
  }

  const filteredOpenDeliveries = openDeliveries.filter(
    (delivery) => matchesModeFilter(delivery) && matchesFocusFilter(delivery),
  )
  const focusScopedDeliveries = openDeliveries.filter((delivery) => matchesFocusFilter(delivery))
  const dueWithinWindow = filteredOpenDeliveries.filter((delivery) => isDueWithinWindow(delivery, now, schedulingWindowMs))
  const blockedDeliveries = filteredOpenDeliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const readyToSchedule = filteredOpenDeliveries.filter((delivery) => isReadyToSchedule(delivery))
  const schedulingAttention = [...filteredOpenDeliveries]
    .filter(
      (delivery) =>
        delivery.status === 'BLOCKED' ||
        !NOMINATION_COMPLETE_STATUSES.has(delivery.nomination_status) ||
        delivery.confirmation_status !== 'CONFIRMED',
    )
    .sort(compareBySchedulerPriority)
    .slice(0, 8)
  const upcomingWindows = selectUpcomingSchedulingWindows(filteredOpenDeliveries)
  const activeModeLabel = MODE_FILTER_OPTIONS.find((option) => option.value === modeFilter)?.label ?? 'All Modes'
  const activeFocusOption =
    FOCUS_FILTER_OPTIONS.find((option) => option.value === focusFilter) ?? FOCUS_FILTER_OPTIONS[0]
  const hasActiveFilters = modeFilter !== 'ALL' || focusFilter !== 'ALL'
  const matchingRatio = openDeliveries.length > 0 ? Math.round((filteredOpenDeliveries.length / openDeliveries.length) * 100) : 0
  const modeLanes = (Object.keys(MODE_LABELS) as DeliveryRecord['mode_family'][]).map((modeFamily) => {
    const rows = focusScopedDeliveries.filter((delivery) => delivery.mode_family === modeFamily)
    const nextWindow = [...rows]
      .filter((delivery) => deliveryStartTimestamp(delivery) !== null)
      .sort(compareBySchedulerPriority)[0] ?? null

    return {
      modeFamily,
      count: rows.length,
      blockedCount: rows.filter((delivery) => delivery.status === 'BLOCKED').length,
      dueSoonCount: rows.filter((delivery) => isDueWithinWindow(delivery, now, schedulingWindowMs)).length,
      scheduledCount: rows.filter((delivery) => SCHEDULED_NOMINATION_STATUSES.has(delivery.nomination_status)).length,
      nextWindow,
      isActive: modeFilter === modeFamily,
    }
  })
  const handoffRows = [
    {
      label: 'Confirmations Pending',
      count: filteredOpenDeliveries.filter((delivery) => delivery.confirmation_status !== 'CONFIRMED').length,
      detail: 'Rows still waiting on confirmed terms before a scheduler can trust the delivery window.',
    },
    {
      label: 'Scheduling Pending in 72h',
      count: dueWithinWindow.filter((delivery) => !NOMINATION_COMPLETE_STATUSES.has(delivery.nomination_status)).length,
      detail: 'Near-dated obligations whose windows are approaching without completed scheduling or nomination state.',
    },
    {
      label: 'Allocation Follow-Up',
      count: filteredOpenDeliveries.filter(
        (delivery) =>
          SCHEDULED_NOMINATION_STATUSES.has(delivery.nomination_status) &&
          !ALLOCATION_COMPLETE_STATUSES.has(delivery.allocation_status),
      ).length,
      detail: 'Rows already moved into schedule execution that still need allocation workflow to catch up.',
    },
    {
      label: 'Mode TBD',
      count: filteredOpenDeliveries.filter(
        (delivery) => delivery.mode_family === 'LOGISTICS' && delivery.transport_mode === 'UNSPECIFIED',
      ).length,
      detail: 'Discrete logistics obligations still missing explicit transport mode selection.',
    },
    {
      label: 'Window Data Gaps',
      count: filteredOpenDeliveries.filter((delivery) => !delivery.delivery_start || !delivery.delivery_end).length,
      detail: 'Delivery rows that still need a complete start and end window before schedulers can plan from them.',
    },
  ]

  return (
    <TileLayout
      workspaceId="scheduling"
      workspaceLabel="Scheduling"
      authSession={authSession}
      tiles={[
        {
          id: 'scheduling-board',
          eyebrow: 'Scheduler',
          title: 'Commodity Scheduling Board',
          description: 'A scheduler-first command surface for working windows, mode focus, and operational readiness.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            openDeliveries.length > 0 ? (
              <div className="scheduler-board">
                <div className="scheduler-board-head">
                  <div className="scheduler-board-copy">
                    <strong>Showing {formatNumber(filteredOpenDeliveries.length, 0)} of {formatNumber(openDeliveries.length, 0)} open rows</strong>
                    <p>
                      Filter the queue by operating mode and scheduler focus so the screen can pivot between exception clearing,
                      near-term windows, and rows that are actually ready to move.
                    </p>
                  </div>
                  <div className="scheduler-board-focus">
                    <span>Active View</span>
                    <strong>{activeFocusOption.label}</strong>
                    <small>{activeModeLabel}</small>
                  </div>
                </div>

                <div className="scheduler-filter-grid">
                  <div className="scheduler-filter-group">
                    <span className="scheduler-filter-label">Mode Focus</span>
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
                  </div>

                  <div className="scheduler-filter-group">
                    <span className="scheduler-filter-label">Scheduler Lens</span>
                    <div className="scheduler-filter-row">
                      {FOCUS_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`scheduler-filter-button ${focusFilter === option.value ? 'is-active' : ''}`}
                          aria-pressed={focusFilter === option.value}
                          onClick={() => setFocusFilter(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="scheduler-filter-detail">{activeFocusOption.detail}</p>
                  </div>
                </div>

                {filteredOpenDeliveries.length > 0 ? (
                  <>
                    <div className="scheduler-kpi-grid">
                      <article className="scheduler-kpi-card scheduler-kpi-card-open">
                        <span>Visible Queue</span>
                        <strong>{formatNumber(filteredOpenDeliveries.length, 0)}</strong>
                        <p>Rows currently in view after scheduler filters are applied.</p>
                      </article>
                      <article className="scheduler-kpi-card scheduler-kpi-card-window">
                        <span>Inside 72 Hours</span>
                        <strong>{formatNumber(dueWithinWindow.length, 0)}</strong>
                        <p>Windows close enough that scheduler attention should already be active.</p>
                      </article>
                      <article className="scheduler-kpi-card scheduler-kpi-card-ready">
                        <span>Ready to Schedule</span>
                        <strong>{formatNumber(readyToSchedule.length, 0)}</strong>
                        <p>Confirmed rows with no explicit blockers still waiting on scheduling completion.</p>
                      </article>
                      <article className="scheduler-kpi-card scheduler-kpi-card-risk">
                        <span>Exceptions</span>
                        <strong>{formatNumber(blockedDeliveries.length, 0)}</strong>
                        <p>Rows currently blocked by data quality, confirmation, or execution workflow gaps.</p>
                      </article>
                    </div>

                    <div className="scheduler-mode-strip">
                      {modeLanes.map((lane) => (
                        <article key={lane.modeFamily} className="scheduler-mode-signal">
                          <span>{MODE_LABELS[lane.modeFamily]}</span>
                          <strong>{formatNumber(lane.count, 0)}</strong>
                          <small>{formatNumber(lane.dueSoonCount, 0)} due soon</small>
                        </article>
                      ))}
                      <article className="scheduler-mode-signal scheduler-mode-signal-highlight">
                        <span>Coverage</span>
                        <strong>{matchingRatio}%</strong>
                        <small>of the full open queue matches this view</small>
                      </article>
                    </div>
                  </>
                ) : (
                  <div className="scheduler-filter-empty surface">
                    <strong>No rows match the current scheduler filters</strong>
                    <p>Clear the current mode or focus selection to return to the full scheduler queue.</p>
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
                <p>Create active physical trades to start populating the scheduling workspace.</p>
              </div>
            ),
        },
        {
          id: 'scheduling-attention',
          eyebrow: 'Attention',
          title: schedulingAttention.length > 0 ? 'Scheduler Exception Queue' : 'No active scheduling exceptions',
          description: 'Rows to clear first when commodity schedulers need the highest-signal queue of windows at risk.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: filteredOpenDeliveries.length > 0 ? (
            schedulingAttention.length > 0 ? (
              <div className="scheduler-attention-stack">
                <div className="scheduler-section-banner">
                  <div className="scheduler-section-copy">
                    <strong>{formatNumber(schedulingAttention.length, 0)} rows currently need scheduler attention</strong>
                    <p>
                      This queue stays biased toward blocked rows, incomplete nomination workflow, and any delivery window whose
                      confirmation state still makes it unsafe to trust.
                    </p>
                  </div>
                  {hasActiveFilters ? <span className="entity-chip entity-chip-soft">{activeModeLabel} • {activeFocusOption.label}</span> : null}
                </div>

                <div className="position-list">
                  {schedulingAttention.map((delivery) => (
                    <article
                      key={delivery.delivery_id}
                      className={`position-card shipment-card scheduler-attention-card scheduler-attention-card-${deliveryStatusTone(delivery.status)}`}
                    >
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{tradeReferenceLabel(delivery)}</strong>
                          <span>
                            {delivery.commodity} • {delivery.location_code ?? 'Location TBD'} • {MODE_LABELS[delivery.mode_family]}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${deliveryStatusTone(delivery.status)}`}>
                          {formatEnumLabel(delivery.status)}
                        </span>
                      </div>

                      <div className="shipment-card-meta">
                        <span className="entity-chip entity-chip-soft">{formatCommodityClass(delivery.commodity_class)}</span>
                        <span className="entity-chip entity-chip-soft">Nomination {delivery.nomination_status}</span>
                        <span className="entity-chip entity-chip-soft">Confirmation {delivery.confirmation_status}</span>
                        <span className="entity-chip entity-chip-soft">{delivery.direction}</span>
                      </div>

                      {delivery.blockers.length > 0 ? (
                        <div className="scheduler-blocker-cluster">
                          {delivery.blockers.map((blocker) => (
                            <span key={blocker} className="scheduler-blocker-chip">
                              {blocker}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="shipment-card-copy">
                          <p>Scheduling is still open on this row even though no explicit blocker has been projected yet.</p>
                        </div>
                      )}

                      <div className="scheduler-card-footer">
                        <div className="scheduler-card-footer-copy">
                          <span>{deliveryWindowLabel(delivery, formatDateOnly)}</span>
                          <small>Updated {formatDate(delivery.last_updated_at)}</small>
                        </div>
                        <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                          Open Trade
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No scheduler exceptions in this view</strong>
                <p>The current filter set is clear of blocked or incomplete scheduling rows.</p>
              </div>
            )
          ) : (
            <div className="empty-state">
              <strong>No matching scheduler rows</strong>
              <p>Clear the current filters to restore the broader exception queue.</p>
            </div>
          ),
        },
        {
          id: 'scheduling-lanes',
          eyebrow: 'Coverage',
          title: 'Scheduling Lanes',
          description: 'Use lanes to swing the screen between logistics, network flow, and power schedule work without losing context.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: openDeliveries.length > 0 ? (
            <div className="scheduler-lane-stack">
              <div className="scheduler-section-banner scheduler-section-banner-compact">
                <div className="scheduler-section-copy">
                  <strong>Mode lanes follow the current scheduler lens</strong>
                  <p>Pick a lane to focus the rest of the workspace, or return to all modes when you want the full desk view again.</p>
                </div>
                {modeFilter !== 'ALL' ? (
                  <button type="button" className="button button-ghost" onClick={() => setModeFilter('ALL')}>
                    Show All Modes
                  </button>
                ) : null}
              </div>

              <div className="scheduler-lane-grid">
                {modeLanes.map((lane) => {
                  const scheduledRatio = lane.count > 0 ? Math.round((lane.scheduledCount / lane.count) * 100) : 0

                  return (
                    <button
                      key={lane.modeFamily}
                      type="button"
                      className={`scheduler-lane-card ${lane.isActive ? 'is-active' : ''}`}
                      onClick={() => setModeFilter((current) => (current === lane.modeFamily ? 'ALL' : lane.modeFamily))}
                      aria-pressed={lane.isActive}
                    >
                      <div className="scheduler-lane-head">
                        <div className="scheduler-lane-copy">
                          <span>{MODE_LABELS[lane.modeFamily]}</span>
                          <strong>{formatNumber(lane.count, 0)}</strong>
                        </div>
                        <span className={`status-pill status-pill-${lane.blockedCount > 0 ? 'blocked' : 'active'}`}>
                          {lane.blockedCount > 0 ? `${formatNumber(lane.blockedCount, 0)} blocked` : 'Clear'}
                        </span>
                      </div>

                      <div className="scheduler-lane-meta">
                        <span>{formatNumber(lane.dueSoonCount, 0)} due soon</span>
                        <span>{formatNumber(lane.scheduledCount, 0)} scheduled</span>
                        <span>{lane.nextWindow ? deliveryWindowLabel(lane.nextWindow, formatDateOnly) : 'No dated window yet'}</span>
                      </div>

                      <div className="scheduler-lane-meter" aria-hidden="true">
                        <span className="scheduler-lane-meter-fill" style={{ width: `${scheduledRatio}%` }} />
                      </div>

                      <p>{MODE_DESCRIPTIONS[lane.modeFamily]}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No scheduling lanes yet</strong>
              <p>Mode coverage will appear once physical delivery obligations are projected.</p>
            </div>
          ),
        },
        {
          id: 'scheduling-windows',
          eyebrow: 'Windows',
          title: upcomingWindows.length > 0 ? 'Delivery Windows and Date Gaps' : 'No delivery windows yet',
          description: 'A more timeline-shaped scheduler board for seeing what is live, near, and still missing delivery dates.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: filteredOpenDeliveries.length > 0 ? (
            upcomingWindows.length > 0 ? (
              <div className="scheduler-window-list">
                {upcomingWindows.map((delivery) => {
                  const band = WINDOW_BAND_META[windowBandForDelivery(delivery, now)]

                  return (
                    <article key={delivery.delivery_id} className={`scheduler-window-card scheduler-window-card-${band.className}`}>
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
                        <span className="entity-chip entity-chip-soft">Nomination {delivery.nomination_status}</span>
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
          description: 'Keep upstream workflow gaps visible so schedulers can see which teams or controls still need to move first.',
          span: 'full',
          availableSpans: ['full', 'wide', 'half'],
          content: filteredOpenDeliveries.length > 0 ? (
            <div className="scheduler-handoff-grid">
              {handoffRows.map((row) => {
                const ratio = filteredOpenDeliveries.length > 0 ? Math.min(100, Math.round((row.count / filteredOpenDeliveries.length) * 100)) : 0

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
              <p>Once the filter set includes open scheduling rows again, the dependency board will repopulate.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
