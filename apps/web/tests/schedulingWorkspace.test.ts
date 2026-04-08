import { afterEach, describe, expect, it } from 'vitest'

import type { DeliveryRecord } from '../src/shared/models'
import {
  deliveryStartTimestamp,
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
    portfolio: 'PHYSICAL',
    counterparty: 'SHELL_TRADING',
    commodity_class: 'CRUDE_OIL',
    commodity: 'WTI',
    volume: 1000,
    unit_of_measure: 'BBL',
    trade_currency_code: 'USD',
    price_unit_code: 'USD/BBL',
    location_code: 'CUSHING',
    delivery_start: '2026-04-07',
    delivery_end: '2026-04-08',
    booked_at: '2026-04-01T12:00:00Z',
    last_updated_at: '2026-04-01T12:00:00Z',
    age_days: 1,
    pricing_status: 'PRICED',
    confirmation_status: 'CONFIRMED',
    nomination_status: 'PENDING',
    allocation_status: 'PENDING',
    invoice_status: 'NOT_REQUIRED',
    payment_status: 'NOT_REQUIRED',
    settlement_status: 'OPEN',
    blocker_count: 0,
    blockers: [],
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
})
