import { describe, expect, it } from 'vitest'

import type { DeliveryRecord } from '../src/shared/models'
import {
  buildSharedDeliveryResetOptions,
  buildLogisticsDetailPayload,
  buildPipelineDetailPayload,
  buildPowerDetailPayload,
} from '../src/workspaces/shipments/deliveryModeDetailHelpers'

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

describe('delivery mode detail helpers', () => {
  it('includes transport mode in shared reset options when the mode is explicitly overridden', () => {
    const delivery = buildDelivery({
      transport_mode: 'TRUCK',
      transport_mode_source: 'EXPLICIT',
      book_source: 'MANUAL',
    })

    expect(buildSharedDeliveryResetOptions(delivery)).toEqual([
      {
        field: 'transport_mode',
        label: 'Transport Mode',
        source: 'EXPLICIT',
      },
      {
        field: 'book',
        label: 'Book',
        source: 'MANUAL',
      },
    ])
  })

  it('builds a minimal logistics payload from changed fields', () => {
    const delivery = buildDelivery({
      mode_family: 'LOGISTICS',
      origin_location_code: 'MIDLAND',
      carrier_name: 'Acme Trucking',
    })

    const result = buildLogisticsDetailPayload(delivery, {
      originLocationCode: 'MIDLAND',
      destinationLocationCode: 'CUSHING',
      incotermCode: '',
      carrierName: 'Acme Trucking',
      carrierReference: '',
      assetReference: 'TRUCK-17',
      equipmentType: '',
      loadReference: '',
      dischargeReference: '',
    })

    expect(result.hasChanges).toBe(true)
    expect(result.payload).toEqual({
      destination_location_code: 'CUSHING',
      asset_reference: 'TRUCK-17',
    })
  })

  it('maps pipeline receipt and delivery points to the pipeline detail endpoint payload', () => {
    const delivery = buildDelivery({
      mode_family: 'NETWORK_FLOW',
      transport_mode: 'PIPELINE',
      receipt_location_code: 'REC-100',
      delivery_location_code: 'DEL-100',
      pipeline_system: 'NGPL',
    })

    const result = buildPipelineDetailPayload(delivery, {
      pipelineSystem: 'NGPL',
      pipelinePath: 'PATH-A',
      receiptLocationCode: 'REC-200',
      deliveryLocationCode: 'DEL-100',
      pipelineContractNumber: 'FT-100',
      pipelineCycleCode: '',
      nominationReference: '',
    })

    expect(result.hasChanges).toBe(true)
    expect(result.payload).toEqual({
      pipeline_path: 'PATH-A',
      receipt_location_code: 'REC-200',
      pipeline_contract_number: 'FT-100',
    })
  })

  it('validates power interval minutes before building a payload', () => {
    const delivery = buildDelivery({
      mode_family: 'POWER_SCHEDULE',
      transport_mode: 'POWER_GRID',
    })

    const invalid = buildPowerDetailPayload(delivery, {
      marketOperator: 'PJM',
      pricingNodeCode: '',
      deliveryNodeCode: '',
      profileCode: '',
      scheduleReference: '',
      intervalMinutes: '0',
      timezoneName: '',
    })

    expect(invalid.hasChanges).toBe(false)
    expect(invalid.validationMessage).toBe('Interval minutes must be a positive whole number.')

    const valid = buildPowerDetailPayload(delivery, {
      marketOperator: 'PJM',
      pricingNodeCode: '',
      deliveryNodeCode: '',
      profileCode: '',
      scheduleReference: '',
      intervalMinutes: '60',
      timezoneName: 'America/New_York',
    })

    expect(valid.validationMessage).toBeNull()
    expect(valid.payload).toEqual({
      market_operator: 'PJM',
      interval_minutes: 60,
      timezone_name: 'America/New_York',
    })
  })
})
