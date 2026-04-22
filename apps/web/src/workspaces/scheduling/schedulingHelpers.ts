import type { DeliveryRecord, DeliverySchedulingWorkflowItemRecord } from '../../shared/models'

export type SchedulingWindowBand = 'LIVE' | 'NEXT_24' | 'NEXT_72' | 'LATER' | 'TBD'
export type SchedulingStage = 'BLOCKED' | 'READY' | 'IN_FLIGHT' | 'WATCHLIST'
export type SchedulingViewPreset =
  | 'DESK'
  | 'HOT_WINDOW'
  | 'BLOCKED'
  | 'READY'
  | 'IN_FLIGHT'
  | 'WATCHLIST'

export type SchedulingWorkbenchRow = {
  delivery: DeliveryRecord
  dueAt: string | null
  isDueSoon: boolean
  nextWorkflowItem: DeliverySchedulingWorkflowItemRecord | null
  openWorkflowItems: DeliverySchedulingWorkflowItemRecord[]
  owner: string | null
  stage: SchedulingStage
  workflowItems: DeliverySchedulingWorkflowItemRecord[]
  windowBand: SchedulingWindowBand
}

const DELIVERY_STATUS_RANK: Record<DeliveryRecord['status'], number> = {
  BLOCKED: 0,
  IN_PROGRESS: 1,
  READY: 2,
  COMPLETED: 3,
}
const WORKFLOW_TYPE_ORDER: Record<DeliverySchedulingWorkflowItemRecord['workflow_type'], number> = {
  CONFIRMATION: 0,
  NOMINATION: 1,
  ALLOCATION: 2,
}
const STAGE_RANK: Record<SchedulingStage, number> = {
  BLOCKED: 0,
  READY: 1,
  IN_FLIGHT: 2,
  WATCHLIST: 3,
}
export const SCHEDULED_NOMINATION_STATUSES = new Set(['SCHEDULED', 'NOMINATED', 'COMPLETED'])
export const NOMINATION_COMPLETE_STATUSES = new Set(['NOT_REQUIRED', 'SCHEDULED', 'NOMINATED', 'COMPLETED'])
export const ALLOCATION_COMPLETE_STATUSES = new Set(['NOT_REQUIRED', 'ALLOCATED', 'COMPLETED'])
export const SCHEDULING_WINDOW_HOURS = 72
export const NEXT_DAY_WINDOW_HOURS = 24

function parseDeliveryTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const trimmedValue = value.trim()
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime()
  }

  const parsed = Date.parse(trimmedValue)
  return Number.isNaN(parsed) ? null : parsed
}

export function deliveryStartTimestamp(delivery: Pick<DeliveryRecord, 'delivery_start'>): number | null {
  return parseDeliveryTimestamp(delivery.delivery_start)
}

export function isDueWithinWindow(
  delivery: Pick<DeliveryRecord, 'delivery_start'>,
  now: number,
  schedulingWindowMs: number,
): boolean {
  const start = deliveryStartTimestamp(delivery)
  return start !== null && start <= now + schedulingWindowMs
}

export function isReadyToSchedule(
  delivery: Pick<DeliveryRecord, 'confirmation_status' | 'nomination_status' | 'blocker_count'>,
): boolean {
  return (
    delivery.confirmation_status === 'CONFIRMED' &&
    !NOMINATION_COMPLETE_STATUSES.has(delivery.nomination_status) &&
    delivery.blocker_count === 0
  )
}

export function compareBySchedulerPriority(
  left: Pick<DeliveryRecord, 'status' | 'delivery_start' | 'blocker_count' | 'trade_id'>,
  right: Pick<DeliveryRecord, 'status' | 'delivery_start' | 'blocker_count' | 'trade_id'>,
): number {
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

export function deliveryStatusTone(
  status: DeliveryRecord['status'],
): 'active' | 'blocked' | 'in-progress' | 'shipped' {
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

export function windowBandForDelivery(
  delivery: Pick<DeliveryRecord, 'delivery_start'>,
  now: number,
): SchedulingWindowBand {
  const start = deliveryStartTimestamp(delivery)
  if (start === null) {
    return 'TBD'
  }
  if (start <= now) {
    return 'LIVE'
  }
  if (start <= now + NEXT_DAY_WINDOW_HOURS * 60 * 60 * 1000) {
    return 'NEXT_24'
  }
  if (start <= now + SCHEDULING_WINDOW_HOURS * 60 * 60 * 1000) {
    return 'NEXT_72'
  }
  return 'LATER'
}

export function selectUpcomingSchedulingWindows(
  deliveries: DeliveryRecord[],
  limit = 8,
): DeliveryRecord[] {
  return [...deliveries].sort(compareBySchedulerPriority).slice(0, limit)
}

function workflowDueTimestamp(item: Pick<DeliverySchedulingWorkflowItemRecord, 'due_at'>): number {
  const parsed = Date.parse(item.due_at ?? '')
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

export function compareSchedulingWorkflowItems(
  left: Pick<DeliverySchedulingWorkflowItemRecord, 'workflow_type' | 'due_at' | 'updated_at' | 'item_id'>,
  right: Pick<DeliverySchedulingWorkflowItemRecord, 'workflow_type' | 'due_at' | 'updated_at' | 'item_id'>,
): number {
  const leftTypeRank = WORKFLOW_TYPE_ORDER[left.workflow_type]
  const rightTypeRank = WORKFLOW_TYPE_ORDER[right.workflow_type]
  if (leftTypeRank !== rightTypeRank) {
    return leftTypeRank - rightTypeRank
  }

  const leftDue = workflowDueTimestamp(left)
  const rightDue = workflowDueTimestamp(right)
  if (leftDue !== rightDue) {
    return leftDue - rightDue
  }

  const updatedAtComparison = right.updated_at.localeCompare(left.updated_at)
  if (updatedAtComparison !== 0) {
    return updatedAtComparison
  }

  return left.item_id - right.item_id
}

export function compareSchedulingWorkbenchRows(
  left: SchedulingWorkbenchRow,
  right: SchedulingWorkbenchRow,
): number {
  const leftStageRank = STAGE_RANK[left.stage]
  const rightStageRank = STAGE_RANK[right.stage]
  if (leftStageRank !== rightStageRank) {
    return leftStageRank - rightStageRank
  }

  if (left.isDueSoon !== right.isDueSoon) {
    return left.isDueSoon ? -1 : 1
  }

  const leftDue = left.dueAt ? workflowDueTimestamp({ due_at: left.dueAt }) : Number.POSITIVE_INFINITY
  const rightDue = right.dueAt ? workflowDueTimestamp({ due_at: right.dueAt }) : Number.POSITIVE_INFINITY
  if (leftDue !== rightDue) {
    return leftDue - rightDue
  }

  return compareBySchedulerPriority(left.delivery, right.delivery)
}

export function buildSchedulingWorkbenchRows(
  deliveries: DeliveryRecord[],
  now: number,
  schedulingWindowMs: number,
): SchedulingWorkbenchRow[] {
  return deliveries
    .map((delivery) => {
      const workflowItemsForTrade = [...delivery.scheduling_work_items].sort(compareSchedulingWorkflowItems)
      const openWorkflowItems = workflowItemsForTrade.filter((item) => !item.is_closed)

      return {
        delivery,
        dueAt: delivery.scheduling_due_at,
        isDueSoon: isDueWithinWindow(delivery, now, schedulingWindowMs),
        nextWorkflowItem: openWorkflowItems[0] ?? null,
        openWorkflowItems,
        owner: delivery.scheduling_owner,
        stage: delivery.scheduling_stage,
        workflowItems: workflowItemsForTrade,
        windowBand: windowBandForDelivery(delivery, now),
      }
    })
    .sort(compareSchedulingWorkbenchRows)
}

export function matchesSchedulingView(
  row: SchedulingWorkbenchRow,
  preset: SchedulingViewPreset,
): boolean {
  switch (preset) {
    case 'HOT_WINDOW':
      return row.isDueSoon || row.windowBand === 'LIVE'
    case 'BLOCKED':
      return row.stage === 'BLOCKED'
    case 'READY':
      return row.stage === 'READY'
    case 'IN_FLIGHT':
      return row.stage === 'IN_FLIGHT'
    case 'WATCHLIST':
      return row.stage === 'WATCHLIST'
    default:
      return true
  }
}
