import { afterEach, describe, expect, it } from 'vitest'

import type { DeliveryRecord, DeliverySchedulingWorkflowItemRecord } from '../src/shared/models'
import {
  buildSchedulingWorkbenchRows,
  deliveryStartTimestamp,
  matchesSchedulingView,
  selectUpcomingSchedulingWindows,
  windowBandForDelivery,
} from '../src/workspaces/scheduling/schedulingHelpers'

const ORIGINAL_TZ = process.env.TZ

function buildDelivery(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    delivery_id: 'DLV-10001',
    trade_id: 'TRD-10001',
    leg_no: null,
    external_trade_id: null,
    status: 'READY',
    direction: 'BUY',
    mode_family: 'LOGISTICS',
    transport_mode: 'TRUCK',
    transport_mode_source: 'EXPLICIT',
    delivery_profile: 'LOAD_DISCHARGE_WINDOW',
    book: 'CRUDE_PHYS',
    book_source: 'TRADE_DERIVED',
    portfolio: 'PHYSICAL',
    portfolio_source: 'TRADE_DERIVED',
    counterparty: 'SHELL_TRADING',
    counterparty_source: 'TRADE_DERIVED',
    commodity_class: 'CRUDE_OIL',
    commodity: 'WTI',
    volume: 1000,
    unit_of_measure: 'BBL',
    trade_currency_code: 'USD',
    price_unit_code: 'USD/BBL',
    location_code: 'CUSHING',
    location_source: 'TRADE_DERIVED',
    delivery_start: '2026-04-07',
    delivery_end: '2026-04-08',
    delivery_window_source: 'TRADE_DERIVED',
    origin_location_code: null,
    origin_location_code_source: null,
    destination_location_code: null,
    destination_location_code_source: null,
    carrier_name: null,
    carrier_name_source: null,
    carrier_reference: null,
    carrier_reference_source: null,
    asset_reference: null,
    asset_reference_source: null,
    incoterm_code: null,
    incoterm_code_source: null,
    equipment_type: null,
    equipment_type_source: null,
    load_reference: null,
    load_reference_source: null,
    discharge_reference: null,
    discharge_reference_source: null,
    receipt_location_code: null,
    receipt_location_code_source: null,
    delivery_location_code: null,
    delivery_location_code_source: null,
    pipeline_system: null,
    pipeline_system_source: null,
    pipeline_path: null,
    pipeline_path_source: null,
    pipeline_contract_number: null,
    pipeline_contract_number_source: null,
    pipeline_cycle_code: null,
    pipeline_cycle_code_source: null,
    nomination_reference: null,
    nomination_reference_source: null,
    market_operator: null,
    market_operator_source: null,
    pricing_node_code: null,
    pricing_node_code_source: null,
    delivery_node_code: null,
    delivery_node_code_source: null,
    profile_code: null,
    profile_code_source: null,
    schedule_reference: null,
    schedule_reference_source: null,
    interval_minutes: null,
    interval_minutes_source: null,
    timezone_name: null,
    timezone_name_source: null,
    execution_status: 'PLANNED',
    execution_status_source: 'SYSTEM_GENERATED',
    event_count: 0,
    latest_event_type: null,
    latest_event_at: null,
    operations_owner: null,
    operations_owner_source: 'SYSTEM_GENERATED',
    external_reference: null,
    external_reference_source: 'SYSTEM_GENERATED',
    ops_notes: null,
    ops_notes_source: 'SYSTEM_GENERATED',
    booked_at: '2026-04-01T12:00:00Z',
    last_updated_at: '2026-04-01T12:00:00Z',
    age_days: 1,
    pricing_status: 'PRICED',
    confirmation_status: 'CONFIRMED',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    actualization_status: 'PENDING',
    actualized_quantity: null,
    actualized_at: null,
    actualization_source: null,
    actualization_notes: null,
    actualization_updated_at: null,
    actualization_variance_quantity: null,
    invoice_status: 'NOT_REQUIRED',
    payment_status: 'NOT_REQUIRED',
    settlement_status: 'OPEN',
    blocker_count: 0,
    blockers: [],
    scheduling_stage: 'READY',
    scheduling_owner: null,
    scheduling_due_at: null,
    open_scheduling_work_item_count: 0,
    next_scheduling_workflow_type: null,
    next_scheduling_workflow_status: null,
    scheduling_work_items: [],
    delivery_events: [],
    ...overrides,
  }
}

function buildWorkflowItem(
  overrides: Partial<DeliverySchedulingWorkflowItemRecord> = {},
): DeliverySchedulingWorkflowItemRecord {
  return {
    item_id: 101,
    workflow_type: 'NOMINATION',
    status: 'PENDING',
    owner: null,
    due_at: '2026-04-07T12:00:00.000Z',
    notes: null,
    updated_at: '2026-04-01T12:00:00Z',
    version: 1,
    is_closed: false,
    is_overdue: false,
    ...overrides,
  }
}

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
})

describe('scheduling workspace helpers', () => {
  it('treats date-only delivery starts as local calendar midnights for scheduling comparisons', () => {
    process.env.TZ = 'America/Los_Angeles'

    const delivery = buildDelivery({ delivery_start: '2026-04-07' })
    const schedulerNow = new Date(2026, 3, 6, 18, 0, 0).getTime()

    expect(deliveryStartTimestamp(delivery)).toBe(new Date(2026, 3, 7).getTime())
    expect(windowBandForDelivery(delivery, schedulerNow)).toBe('NEXT_24')
  })

  it('keeps undated rows visible on the delivery windows board', () => {
    process.env.TZ = 'America/Los_Angeles'

    const rows = selectUpcomingSchedulingWindows([
      buildDelivery({
        delivery_id: 'DLV-10002',
        trade_id: 'TRD-10002',
        delivery_start: '2026-04-09',
        delivery_end: '2026-04-09',
      }),
      buildDelivery({
        delivery_id: 'DLV-10003',
        trade_id: 'TRD-10003',
        delivery_start: null,
        delivery_end: null,
      }),
    ])

    expect(rows.map((row) => row.trade_id)).toEqual(['TRD-10002', 'TRD-10003'])
    expect(windowBandForDelivery(rows[1], new Date(2026, 3, 6, 12, 0, 0).getTime())).toBe('TBD')
  })

  it('builds stage-first workbench rows from deliveries and scheduling workflow items', () => {
    const now = new Date(2026, 3, 6, 10, 0, 0).getTime()
    const rows = buildSchedulingWorkbenchRows(
      [
        buildDelivery({
          delivery_id: 'DLV-READY',
          trade_id: 'TRD-READY',
          delivery_start: '2026-04-08',
          blocker_count: 0,
          blockers: [],
          confirmation_status: 'CONFIRMED',
          nomination_status: 'PENDING',
          allocation_status: 'PENDING',
          status: 'READY',
          scheduling_stage: 'READY',
          scheduling_due_at: '2026-04-08T12:00:00.000Z',
          open_scheduling_work_item_count: 1,
          next_scheduling_workflow_type: 'NOMINATION',
          next_scheduling_workflow_status: 'PENDING',
          scheduling_work_items: [
            buildWorkflowItem({
              item_id: 201,
              due_at: '2026-04-08T12:00:00.000Z',
            }),
          ],
        }),
        buildDelivery({
          delivery_id: 'DLV-FLOW',
          trade_id: 'TRD-FLOW',
          delivery_start: '2026-04-09',
          nomination_status: 'SCHEDULED',
          allocation_status: 'PENDING',
          status: 'IN_PROGRESS',
          scheduling_stage: 'IN_FLIGHT',
          scheduling_owner: 'scheduler.gas',
          scheduling_due_at: '2026-04-09T12:00:00.000Z',
          open_scheduling_work_item_count: 1,
          next_scheduling_workflow_type: 'ALLOCATION',
          next_scheduling_workflow_status: 'PENDING',
          scheduling_work_items: [
            buildWorkflowItem({
              item_id: 202,
              workflow_type: 'ALLOCATION',
              owner: 'scheduler.gas',
              due_at: '2026-04-09T12:00:00.000Z',
            }),
          ],
        }),
        buildDelivery({
          delivery_id: 'DLV-BLOCKED',
          trade_id: 'TRD-BLOCKED',
          status: 'BLOCKED',
          blockers: ['Trade confirmation is not complete.'],
          blocker_count: 1,
          confirmation_status: 'PENDING',
          scheduling_stage: 'BLOCKED',
          scheduling_due_at: '2026-04-05T12:00:00.000Z',
          open_scheduling_work_item_count: 1,
          next_scheduling_workflow_type: 'CONFIRMATION',
          next_scheduling_workflow_status: 'PENDING',
          scheduling_work_items: [
            buildWorkflowItem({
              item_id: 203,
              workflow_type: 'CONFIRMATION',
              status: 'PENDING',
              is_overdue: true,
              due_at: '2026-04-05T12:00:00.000Z',
            }),
          ],
        }),
      ],
      now,
      72 * 60 * 60 * 1000,
    )

    expect(rows.map((row) => [row.delivery.trade_id, row.stage])).toEqual([
      ['TRD-BLOCKED', 'BLOCKED'],
      ['TRD-READY', 'READY'],
      ['TRD-FLOW', 'IN_FLIGHT'],
    ])
    expect(rows[0].nextWorkflowItem?.workflow_type).toBe('CONFIRMATION')
    expect(rows[1].owner).toBeNull()
    expect(rows[2].owner).toBe('scheduler.gas')
  })

  it('supports saved-view matching for hot-window and stage slices', () => {
    const [blockedRow, readyRow, watchlistRow] = buildSchedulingWorkbenchRows(
      [
        buildDelivery({
          delivery_id: 'DLV-BLOCKED',
          trade_id: 'TRD-BLOCKED',
          status: 'BLOCKED',
          blockers: ['Delivery window is incomplete.'],
          blocker_count: 1,
          delivery_start: '2026-04-07',
          scheduling_stage: 'BLOCKED',
          scheduling_due_at: '2026-04-07T12:00:00.000Z',
          open_scheduling_work_item_count: 1,
          next_scheduling_workflow_type: 'CONFIRMATION',
          next_scheduling_workflow_status: 'PENDING',
          scheduling_work_items: [
            buildWorkflowItem({
              item_id: 300,
              workflow_type: 'CONFIRMATION',
              status: 'PENDING',
              due_at: '2026-04-07T12:00:00.000Z',
            }),
          ],
        }),
        buildDelivery({
          delivery_id: 'DLV-READY',
          trade_id: 'TRD-READY',
          status: 'READY',
          blockers: [],
          blocker_count: 0,
          confirmation_status: 'CONFIRMED',
          nomination_status: 'PENDING',
          allocation_status: 'PENDING',
          delivery_start: '2026-04-08',
          scheduling_stage: 'READY',
          scheduling_due_at: '2026-04-08T12:00:00.000Z',
          open_scheduling_work_item_count: 1,
          next_scheduling_workflow_type: 'NOMINATION',
          next_scheduling_workflow_status: 'PENDING',
          scheduling_work_items: [buildWorkflowItem({ item_id: 301 })],
        }),
        buildDelivery({
          delivery_id: 'DLV-LATER',
          trade_id: 'TRD-LATER',
          status: 'IN_PROGRESS',
          blockers: [],
          blocker_count: 0,
          confirmation_status: 'CONFIRMED',
          nomination_status: 'COMPLETED',
          allocation_status: 'COMPLETED',
          delivery_start: '2026-04-20',
          scheduling_stage: 'WATCHLIST',
          open_scheduling_work_item_count: 0,
          scheduling_work_items: [
            buildWorkflowItem({
              item_id: 302,
              workflow_type: 'ALLOCATION',
              is_closed: true,
              status: 'COMPLETED',
            }),
          ],
        }),
      ],
      new Date(2026, 3, 6, 12, 0, 0).getTime(),
      72 * 60 * 60 * 1000,
    )

    expect(matchesSchedulingView(blockedRow, 'BLOCKED')).toBe(true)
    expect(matchesSchedulingView(blockedRow, 'HOT_WINDOW')).toBe(true)
    expect(matchesSchedulingView(readyRow, 'READY')).toBe(true)
    expect(matchesSchedulingView(readyRow, 'HOT_WINDOW')).toBe(true)
    expect(matchesSchedulingView(watchlistRow, 'WATCHLIST')).toBe(true)
    expect(matchesSchedulingView(watchlistRow, 'HOT_WINDOW')).toBe(false)
  })
})
