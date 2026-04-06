import { TileLayout } from '../../shared/ui/TileLayout'
import type { DeliveryRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type SchedulingWorkspaceProps = {
  authSession: StoredAuthSession | null
  deliveries: DeliveryRecord[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
}

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

const DELIVERY_STATUS_RANK: Record<DeliveryRecord['status'], number> = {
  BLOCKED: 0,
  IN_PROGRESS: 1,
  READY: 2,
  COMPLETED: 3,
}

const SCHEDULED_NOMINATION_STATUSES = new Set(['SCHEDULED', 'NOMINATED', 'COMPLETED'])
const NOMINATION_COMPLETE_STATUSES = new Set(['NOT_REQUIRED', 'SCHEDULED', 'NOMINATED', 'COMPLETED'])
const ALLOCATION_COMPLETE_STATUSES = new Set(['NOT_REQUIRED', 'ALLOCATED', 'COMPLETED'])
const SCHEDULING_WINDOW_HOURS = 72

function tradeReferenceLabel(delivery: DeliveryRecord): string {
  return delivery.leg_no === null ? delivery.trade_id : `${delivery.trade_id} · leg ${delivery.leg_no}`
}

function deliveryStartTimestamp(delivery: DeliveryRecord): number | null {
  if (!delivery.delivery_start) {
    return null
  }

  const parsed = Date.parse(delivery.delivery_start)
  return Number.isNaN(parsed) ? null : parsed
}

function compareBySchedulerPriority(left: DeliveryRecord, right: DeliveryRecord): number {
  const leftRank = DELIVERY_STATUS_RANK[left.status]
  const rightRank = DELIVERY_STATUS_RANK[right.status]
  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  const leftStart = deliveryStartTimestamp(left) ?? Number.POSITIVE_INFINITY
  const rightStart = deliveryStartTimestamp(right) ?? Number.POSITIVE_INFINITY
  if (leftStart !== rightStart) {
    return leftStart - rightStart
  }

  if (left.blocker_count !== right.blocker_count) {
    return right.blocker_count - left.blocker_count
  }

  return left.trade_id.localeCompare(right.trade_id)
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

function deliveryStatusTone(status: DeliveryRecord['status']): 'active' | 'blocked' | 'in-progress' | 'shipped' {
  switch (status) {
    case 'BLOCKED':
      return 'blocked'
    case 'READY':
      return 'active'
    case 'COMPLETED':
      return 'shipped'
    default:
      return 'in-progress'
  }
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
  const now = Date.now()
  const schedulingWindowMs = SCHEDULING_WINDOW_HOURS * 60 * 60 * 1000
  const openDeliveries = deliveries.filter((delivery) => delivery.status !== 'COMPLETED')
  const blockedDeliveries = openDeliveries.filter((delivery) => delivery.status === 'BLOCKED')
  const dueWithinWindow = openDeliveries.filter((delivery) => {
    const start = deliveryStartTimestamp(delivery)
    return start !== null && start <= now + schedulingWindowMs
  })
  const readyToSchedule = openDeliveries.filter(
    (delivery) =>
      delivery.confirmation_status === 'CONFIRMED' &&
      !NOMINATION_COMPLETE_STATUSES.has(delivery.nomination_status) &&
      delivery.blocker_count === 0,
  )
  const schedulingAttention = [...openDeliveries]
    .filter(
      (delivery) =>
        delivery.status === 'BLOCKED' ||
        !NOMINATION_COMPLETE_STATUSES.has(delivery.nomination_status) ||
        delivery.confirmation_status !== 'CONFIRMED',
    )
    .sort(compareBySchedulerPriority)
    .slice(0, 8)
  const upcomingWindows = [...openDeliveries]
    .filter((delivery) => deliveryStartTimestamp(delivery) !== null)
    .sort(compareBySchedulerPriority)
    .slice(0, 6)
  const modeLanes = (Object.keys(MODE_LABELS) as DeliveryRecord['mode_family'][]).map((modeFamily) => {
    const rows = openDeliveries.filter((delivery) => delivery.mode_family === modeFamily)
    const nextWindow = [...rows]
      .filter((delivery) => deliveryStartTimestamp(delivery) !== null)
      .sort(compareBySchedulerPriority)[0] ?? null

    return {
      modeFamily,
      count: rows.length,
      blockedCount: rows.filter((delivery) => delivery.status === 'BLOCKED').length,
      dueSoonCount: rows.filter((delivery) => {
        const start = deliveryStartTimestamp(delivery)
        return start !== null && start <= now + schedulingWindowMs
      }).length,
      scheduledCount: rows.filter((delivery) => SCHEDULED_NOMINATION_STATUSES.has(delivery.nomination_status)).length,
      nextWindow,
    }
  })
  const handoffRows = [
    {
      label: 'Confirmations Pending',
      count: openDeliveries.filter((delivery) => delivery.confirmation_status !== 'CONFIRMED').length,
      detail: 'Rows still waiting on confirmed terms before a scheduler can trust the delivery window.',
    },
    {
      label: 'Scheduling Pending in 72h',
      count: dueWithinWindow.filter((delivery) => !NOMINATION_COMPLETE_STATUSES.has(delivery.nomination_status)).length,
      detail: 'Near-dated obligations whose windows are approaching without completed scheduling or nomination state.',
    },
    {
      label: 'Allocation Follow-Up',
      count: openDeliveries.filter(
        (delivery) =>
          SCHEDULED_NOMINATION_STATUSES.has(delivery.nomination_status) &&
          !ALLOCATION_COMPLETE_STATUSES.has(delivery.allocation_status),
      ).length,
      detail: 'Rows already moved into schedule execution that still need allocation workflow to catch up.',
    },
    {
      label: 'Mode TBD',
      count: openDeliveries.filter(
        (delivery) => delivery.mode_family === 'LOGISTICS' && delivery.transport_mode === 'UNSPECIFIED',
      ).length,
      detail: 'Discrete logistics obligations still missing explicit transport mode selection.',
    },
    {
      label: 'Window Data Gaps',
      count: openDeliveries.filter((delivery) => !delivery.delivery_start || !delivery.delivery_end).length,
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
          description: 'A first-pass scheduler cockpit for delivery windows, nomination readiness, and blocker clearing across commodities.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content:
            openDeliveries.length > 0 ? (
              <div className="dashboard-report-grid">
                <article className="dashboard-report-card">
                  <span>Open Schedule Rows</span>
                  <strong>{formatNumber(openDeliveries.length, 0)}</strong>
                  <p>Delivery obligations still inside the scheduler loop across logistics, flows, and power windows.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Inside 72 Hours</span>
                  <strong>{formatNumber(dueWithinWindow.length, 0)}</strong>
                  <p>Rows whose delivery start is close enough that scheduler attention should already be visible.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Ready to Schedule</span>
                  <strong>{formatNumber(readyToSchedule.length, 0)}</strong>
                  <p>Confirmed rows with no remaining blockers that still need scheduling or nomination completion.</p>
                </article>
                <article className="dashboard-report-card">
                  <span>Exceptions</span>
                  <strong>{formatNumber(blockedDeliveries.length, 0)}</strong>
                  <p>Rows currently blocked by confirmation, data quality, or execution workflow gaps.</p>
                </article>
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
          description: 'The queue to clear first when a commodity scheduler needs the highest-signal list of windows at risk.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: schedulingAttention.length > 0 ? (
            <div className="position-list">
              {schedulingAttention.map((delivery) => (
                <article key={delivery.delivery_id} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{tradeReferenceLabel(delivery)}</strong>
                      <span>
                        {delivery.commodity} • {delivery.location_code ?? 'Location TBD'} • {MODE_LABELS[delivery.mode_family]}
                      </span>
                    </div>
                    <span className={`status-pill status-pill-${deliveryStatusTone(delivery.status)}`}>
                      {delivery.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">{formatCommodityClass(delivery.commodity_class)}</span>
                    <span className="entity-chip entity-chip-soft">Nomination {delivery.nomination_status}</span>
                    <span className="entity-chip entity-chip-soft">Confirmation {delivery.confirmation_status}</span>
                    <span className="entity-chip entity-chip-soft">{delivery.direction}</span>
                  </div>
                  {delivery.blockers.length > 0 ? (
                    <ul className="shipment-blocker-list">
                      {delivery.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="shipment-card-copy">
                      <p>Scheduling is still open on this row even though no explicit blocker has been projected yet.</p>
                    </div>
                  )}
                  <div className="shipment-card-actions">
                    <span>{deliveryWindowLabel(delivery, formatDateOnly)}</span>
                    <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
                      Open Trade
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No scheduler queue right now</strong>
              <p>The current delivery set is either clear, completed, or no longer waiting on scheduling action.</p>
            </div>
          ),
        },
        {
          id: 'scheduling-lanes',
          eyebrow: 'Coverage',
          title: 'Scheduling Lanes',
          description: 'Break the scheduler workload into the operating modes that commodity schedulers actually manage day to day.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: modeLanes.some((lane) => lane.count > 0) ? (
            <div className="position-class-grid">
              {modeLanes.map((lane) => (
                <article key={lane.modeFamily} className="position-class-card">
                  <span>{MODE_LABELS[lane.modeFamily]}</span>
                  <strong>{formatNumber(lane.count, 0)}</strong>
                  <small>
                    {formatNumber(lane.dueSoonCount, 0)} due soon • {formatNumber(lane.blockedCount, 0)} blocked
                  </small>
                  <p>
                    {lane.nextWindow
                      ? `Next window ${deliveryWindowLabel(lane.nextWindow, formatDateOnly)}. ${formatNumber(lane.scheduledCount, 0)} already scheduled or nominated.`
                      : MODE_DESCRIPTIONS[lane.modeFamily]}
                  </p>
                </article>
              ))}
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
          title: upcomingWindows.length > 0 ? 'Upcoming Delivery Windows' : 'No upcoming windows',
          description: 'An early scaffold for the scheduler timeline: what is coming up next and which rows sit closest to execution.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: upcomingWindows.length > 0 ? (
            <div className="position-list">
              {upcomingWindows.map((delivery) => (
                <article key={delivery.delivery_id} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{tradeReferenceLabel(delivery)}</strong>
                      <span>{deliveryWindowLabel(delivery, formatDateOnly)}</span>
                    </div>
                    <span className={`status-pill status-pill-${deliveryStatusTone(delivery.status)}`}>
                      {delivery.nomination_status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">{MODE_LABELS[delivery.mode_family]}</span>
                    <span className="entity-chip entity-chip-soft">{delivery.location_code ?? 'Location TBD'}</span>
                    <span className="entity-chip entity-chip-soft">Updated {formatDate(delivery.last_updated_at)}</span>
                  </div>
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
              <strong>No dated windows yet</strong>
              <p>The scheduler timeline will appear once delivery start dates are available on open rows.</p>
            </div>
          ),
        },
        {
          id: 'scheduling-handoffs',
          eyebrow: 'Dependencies',
          title: 'Scheduler Handoffs and Data Gaps',
          description: 'A compact handoff panel showing which upstream workflow steps are still keeping the scheduling loop noisy.',
          span: 'full',
          availableSpans: ['full', 'wide', 'half'],
          content: openDeliveries.length > 0 ? (
            <div className="shipment-kpi-stack">
              {handoffRows.map((row) => (
                <div key={row.label} className="shipment-kpi-row">
                  <div className="shipment-card-copy">
                    <span>{row.label}</span>
                    <p>{row.detail}</p>
                  </div>
                  <strong>{formatNumber(row.count, 0)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No scheduler dependencies yet</strong>
              <p>Once deliveries are live, this panel will show the upstream workflow gaps schedulers are absorbing.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
