import { describe, expect, it } from 'vitest'

import type {
  DeliveryRecord,
  DeliveryTruckMovementRecord,
  DeliveryTruckStopRecord,
} from '../src/shared/models'
import {
  buildDefaultMovementCreateStops,
  activeTruckCheckpointEventsForStop,
  buildTruckCheckpointPayload,
  buildTruckCheckpointReversePayload,
  buildTruckDetailPayload,
  buildTruckMovementCreatePayload,
  buildTruckMovementUpdatePayload,
  buildTruckTrackingSignalDraft,
  buildTruckTrackingSignalPayload,
  buildTruckStopUpdatePayload,
  checkpointOptionsForStop,
  describeTruckCheckpointTimelineEvent,
  latestActiveTruckCheckpointEvent,
  truckCheckpointReferenceCode,
} from '../src/workspaces/shipments/deliveryTruckWorkflowHelpers'

function buildDelivery(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    delivery_id: 'DLV-TRUCK-1001',
    trade_id: 'TRD-TRUCK-1001',
    leg_no: null,
    external_trade_id: null,
    status: 'READY',
    direction: 'OUTBOUND',
    mode_family: 'LOGISTICS',
    transport_mode: 'TRUCK',
    transport_mode_source: 'EXPLICIT',
    delivery_profile: 'LOAD_DISCHARGE_WINDOW',
    book: 'CRUDE_PHYS',
    book_source: 'TRADE_DERIVED',
    portfolio: 'PHYSICAL',
    portfolio_source: 'TRADE_DERIVED',
    counterparty: 'Truck Buyer',
    counterparty_source: 'TRADE_DERIVED',
    commodity_class: 'CRUDE_OIL',
    commodity: 'WTI',
    volume: 500,
    unit_of_measure: 'BBL',
    trade_currency_code: 'USD',
    price_unit_code: 'USD/BBL',
    location_code: 'MIDLAND',
    location_source: 'TRADE_DERIVED',
    delivery_start: '2026-05-10',
    delivery_end: '2026-05-11',
    delivery_window_source: 'TRADE_DERIVED',
    origin_location_code: 'MIDLAND',
    origin_location_code_source: 'TRADE_DERIVED',
    destination_location_code: 'HOUSTON',
    destination_location_code_source: 'TRADE_DERIVED',
    carrier_name: 'Acme Hauling',
    carrier_name_source: 'MANUAL',
    carrier_reference: null,
    carrier_reference_source: null,
    asset_reference: null,
    asset_reference_source: null,
    incoterm_code: null,
    incoterm_code_source: null,
    equipment_type: 'TANK_TRUCK',
    equipment_type_source: 'MANUAL',
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
    execution_status: 'SCHEDULED',
    execution_status_source: 'MANUAL',
    event_count: 0,
    latest_event_type: null,
    latest_event_at: null,
    operations_owner: 'Dispatch West',
    operations_owner_source: 'MANUAL',
    external_reference: null,
    external_reference_source: 'SYSTEM_GENERATED',
    ops_notes: null,
    ops_notes_source: 'SYSTEM_GENERATED',
    booked_at: '2026-05-01T12:00:00Z',
    last_updated_at: '2026-05-09T12:00:00Z',
    age_days: 8,
    pricing_status: 'PRICED',
    confirmation_status: 'CONFIRMED',
    nomination_status: 'NOT_REQUIRED',
    allocation_status: 'NOT_REQUIRED',
    actualization_status: 'PENDING',
    actualized_quantity: null,
    actualized_at: null,
    actualization_source: null,
    actualization_notes: null,
    actualization_updated_at: null,
    actualization_variance_quantity: null,
    invoice_status: 'NOT_REQUIRED',
    payment_status: 'CURRENT',
    settlement_status: 'OPEN',
    blocker_count: 0,
    blockers: [],
    scheduling_stage: 'READY',
    scheduling_owner: 'Dispatch West',
    scheduling_due_at: null,
    open_scheduling_work_item_count: 0,
    next_scheduling_workflow_type: null,
    next_scheduling_workflow_status: null,
    scheduling_work_items: [],
    delivery_events: [],
    truck_detail: {
      delivery_id: 'DLV-TRUCK-1001',
      target_run_count: 2,
      dispatcher_owner: 'Dispatch West',
      tracking_provider: 'MANUAL',
      tracking_policy: 'Check in every 2h',
      default_carrier_name: 'Acme Hauling',
      default_carrier_name_source: 'MANUAL',
      default_external_carrier_reference: 'CARRIER-7',
      default_external_carrier_reference_source: 'MANUAL',
      equipment_type: 'TANK_TRUCK',
      equipment_type_source: 'MANUAL',
      origin_geofence_code: 'MIDLAND_GF',
      origin_geofence_code_source: 'MANUAL',
      destination_geofence_code: 'HOUSTON_GF',
      destination_geofence_code_source: 'MANUAL',
      created_at: '2026-05-01T12:00:00Z',
      created_by: 'ops@example.com',
      updated_at: '2026-05-01T12:00:00Z',
      updated_by: 'ops@example.com',
      version: 1,
    },
    truck_movement_count: 1,
    active_truck_movement_count: 1,
    rail_route_code: null,
    rail_route_code_source: null,
    rail_line_code: null,
    railroad_code: null,
    rail_route_direction: null,
    rail_schedule_timezone: null,
    rail_service_calendar_code: null,
    rail_placement_cutoff_time_local: null,
    rail_release_cutoff_time_local: null,
    rail_placement_free_time_hours: null,
    rail_release_free_time_hours: null,
    origin_station_code: null,
    origin_station_code_source: null,
    destination_station_code: null,
    destination_station_code_source: null,
    waybill_reference: null,
    waybill_reference_source: null,
    release_number: null,
    release_number_source: null,
    unit_train_id: null,
    unit_train_id_source: null,
    railcar_count: null,
    railcar_count_source: null,
    ...overrides,
  }
}

function buildStop(overrides: Partial<DeliveryTruckStopRecord> = {}): DeliveryTruckStopRecord {
  return {
    stop_id: 'STOP-1',
    movement_id: 'MOVE-1',
    stop_sequence: 1,
    stop_type: 'PICKUP',
    status: 'PLANNED',
    status_reason: null,
    location_code: 'MIDLAND',
    location_code_source: 'MANUAL',
    planned_arrival_start: '2026-05-10T12:00:00Z',
    planned_arrival_end: '2026-05-10T13:00:00Z',
    planned_departure_start: '2026-05-10T13:00:00Z',
    planned_departure_end: '2026-05-10T14:00:00Z',
    appointment_reference: null,
    planned_quantity: 500,
    actual_quantity: null,
    actual_arrived_at: null,
    actual_departed_at: null,
    created_at: '2026-05-09T12:00:00Z',
    created_by: 'ops@example.com',
    updated_at: '2026-05-09T12:00:00Z',
    updated_by: 'ops@example.com',
    version: 1,
    ...overrides,
  }
}

function buildMovement(overrides: Partial<DeliveryTruckMovementRecord> = {}): DeliveryTruckMovementRecord {
  return {
    movement_id: 'MOVE-1',
    delivery_id: 'DLV-TRUCK-1001',
    sequence_no: 1,
    status: 'ASSIGNED',
    status_reason: null,
    planned_quantity: 500,
    planned_unit_of_measure: 'BBL',
    carrier_name: 'Acme Hauling',
    carrier_name_source: 'MANUAL',
    external_carrier_reference: 'CARRIER-7',
    external_carrier_reference_source: 'MANUAL',
    dispatcher_owner: 'Dispatch West',
    dispatcher_owner_source: 'MANUAL',
    current_stop_sequence: 1,
    current_location_code: 'MIDLAND',
    last_signal_at: null,
    current_eta_at_destination: null,
    hold_reason_code: null,
    hold_reason_code_source: 'SYSTEM_GENERATED',
    stop_count: 2,
    active_stop_count: 2,
    created_at: '2026-05-09T12:00:00Z',
    created_by: 'ops@example.com',
    updated_at: '2026-05-09T12:00:00Z',
    updated_by: 'ops@example.com',
    version: 1,
    driver_name: null,
    driver_name_source: 'SYSTEM_GENERATED',
    driver_phone: null,
    driver_phone_source: 'SYSTEM_GENERATED',
    tractor_reference: null,
    tractor_reference_source: 'SYSTEM_GENERATED',
    trailer_reference: null,
    trailer_reference_source: 'SYSTEM_GENERATED',
    external_load_reference: null,
    external_load_reference_source: 'SYSTEM_GENERATED',
    bill_of_lading_number: null,
    bill_of_lading_number_source: 'SYSTEM_GENERATED',
    truck_ticket_number: null,
    truck_ticket_number_source: 'SYSTEM_GENERATED',
    stops: [buildStop(), buildStop({ stop_id: 'STOP-2', stop_sequence: 2, stop_type: 'DROPOFF', location_code: 'HOUSTON' })],
    ...overrides,
  }
}

describe('delivery truck workflow helpers', () => {
  it('seeds a two-stop point-to-point create shape by default', () => {
    expect(buildDefaultMovementCreateStops()).toEqual([
      expect.objectContaining({ stopSequence: '1', stopType: 'PICKUP' }),
      expect.objectContaining({ stopSequence: '2', stopType: 'DROPOFF' }),
    ])
  })

  it('builds a minimal truck default payload from changed fields', () => {
    const delivery = buildDelivery()

    const result = buildTruckDetailPayload(delivery, {
      targetRunCount: '3',
      dispatcherOwner: 'Dispatch West',
      trackingProvider: 'BROKER_PORTAL',
      trackingPolicy: 'Check in every 2h',
      defaultCarrierName: 'Acme Hauling',
      defaultExternalCarrierReference: 'CARRIER-7',
      equipmentType: 'PNEUMATIC',
      originGeofenceCode: 'MIDLAND_GF',
      destinationGeofenceCode: 'HOUSTON_GF',
    })

    expect(result.validationMessage).toBeNull()
    expect(result.hasChanges).toBe(true)
    expect(result.payload).toEqual({
      target_run_count: 3,
      tracking_provider: 'BROKER_PORTAL',
      equipment_type: 'PNEUMATIC',
    })
  })

  it('requires a hold reason when a new truck run starts on hold', () => {
    const delivery = buildDelivery()
    const stops = buildDefaultMovementCreateStops()
    const result = buildTruckMovementCreatePayload(
      delivery,
      {
        sequenceNo: '2',
        plannedQuantity: '500',
        plannedUnitOfMeasure: 'BBL',
        carrierName: 'Acme Hauling',
        externalCarrierReference: '',
        dispatcherOwner: 'Dispatch West',
        driverName: '',
        driverPhone: '',
        tractorReference: '',
        trailerReference: '',
        externalLoadReference: '',
        billOfLadingNumber: '',
        truckTicketNumber: '',
        holdReasonCode: '',
        status: 'ON_HOLD',
        statusReason: '',
      },
      stops,
    )

    expect(result.validationMessage).toBe('Hold reason is required when the truck run starts on hold.')
  })

  it('enforces pickup-first and dropoff-last on run creation', () => {
    const delivery = buildDelivery()
    const stops = buildDefaultMovementCreateStops()
    stops[0] = { ...stops[0], stopType: 'WAYPOINT' }

    const result = buildTruckMovementCreatePayload(
      delivery,
      {
        sequenceNo: '2',
        plannedQuantity: '500',
        plannedUnitOfMeasure: 'BBL',
        carrierName: 'Acme Hauling',
        externalCarrierReference: '',
        dispatcherOwner: 'Dispatch West',
        driverName: '',
        driverPhone: '',
        tractorReference: '',
        trailerReference: '',
        externalLoadReference: '',
        billOfLadingNumber: '',
        truckTicketNumber: '',
        holdReasonCode: '',
        status: 'PLANNED',
        statusReason: '',
      },
      stops,
    )

    expect(result.validationMessage).toBe('The first truck stop must be a pickup.')
  })

  it('builds stop update payloads from changed fields only', () => {
    const stop = buildStop()
    const draft = {
      stopSequence: '2',
      stopType: 'WAYPOINT' as const,
      locationCode: 'ODESSA',
      plannedArrivalStart: '2026-05-10T08:30',
      plannedArrivalEnd: '2026-05-10T09:30',
      plannedDepartureStart: '2026-05-10T10:00',
      plannedDepartureEnd: '2026-05-10T11:00',
      appointmentReference: 'APT-7',
      plannedQuantity: '450',
      actualQuantity: '445',
      actualArrivedAt: '2026-05-10T08:45',
      actualDepartedAt: '2026-05-10T10:45',
      status: 'ARRIVED' as const,
      statusReason: 'Checked in',
    }
    const plannedArrivalStart = new Date(draft.plannedArrivalStart).toISOString()
    const plannedArrivalEnd = new Date(draft.plannedArrivalEnd).toISOString()
    const plannedDepartureStart = new Date(draft.plannedDepartureStart).toISOString()
    const plannedDepartureEnd = new Date(draft.plannedDepartureEnd).toISOString()
    const actualArrivedAt = new Date(draft.actualArrivedAt).toISOString()
    const actualDepartedAt = new Date(draft.actualDepartedAt).toISOString()

    const result = buildTruckStopUpdatePayload(stop, draft)

    expect(result.validationMessage).toBeNull()
    expect(result.hasChanges).toBe(true)
    expect(result.payload).toEqual({
      stop_sequence: 2,
      stop_type: 'WAYPOINT',
      location_code: 'ODESSA',
      planned_arrival_start: plannedArrivalStart,
      planned_arrival_end: plannedArrivalEnd,
      planned_departure_start: plannedDepartureStart,
      planned_departure_end: plannedDepartureEnd,
      appointment_reference: 'APT-7',
      planned_quantity: 450,
      actual_quantity: 445,
      actual_arrived_at: actualArrivedAt,
      actual_departed_at: actualDepartedAt,
      status: 'ARRIVED',
      status_reason: 'Checked in',
    })
  })

  it('validates stop chronology before building an update payload', () => {
    const stop = buildStop()
    const result = buildTruckStopUpdatePayload(stop, {
      stopSequence: '1',
      stopType: 'PICKUP',
      locationCode: 'MIDLAND',
      plannedArrivalStart: '2026-05-10T10:00',
      plannedArrivalEnd: '2026-05-10T09:00',
      plannedDepartureStart: '',
      plannedDepartureEnd: '',
      appointmentReference: '',
      plannedQuantity: '500',
      actualQuantity: '',
      actualArrivedAt: '',
      actualDepartedAt: '',
      status: 'PLANNED',
      statusReason: '',
    })

    expect(result.hasChanges).toBe(false)
    expect(result.validationMessage).toBe(
      'Truck stop planned arrival start must be on or before planned arrival end.',
    )
  })

  it('treats unchanged run drafts as no-op payloads', () => {
    const movement = buildMovement()
    const draft = {
      sequenceNo: '1',
      plannedQuantity: '500',
      plannedUnitOfMeasure: 'BBL',
      carrierName: 'Acme Hauling',
      externalCarrierReference: 'CARRIER-7',
      dispatcherOwner: 'Dispatch West',
      driverName: '',
      driverPhone: '',
      tractorReference: '',
      trailerReference: '',
      externalLoadReference: '',
      billOfLadingNumber: '',
      truckTicketNumber: '',
      holdReasonCode: '',
      status: 'ASSIGNED' as const,
      statusReason: '',
    }

    expect(buildTruckMovementUpdatePayload(movement, draft)).toEqual({
      payload: {},
      hasChanges: false,
      validationMessage: null,
    })
  })

  it('builds truck checkpoint payloads only for valid stop types', () => {
    const pickupStop = buildStop({ stop_id: 'STOP-PICKUP', stop_type: 'PICKUP' })
    const destinationStop = buildStop({ stop_id: 'STOP-DROP', stop_type: 'DROPOFF' })

    expect(checkpointOptionsForStop(pickupStop)).toEqual(['ARRIVED_PICKUP', 'DEPARTED_PICKUP'])
    expect(checkpointOptionsForStop(destinationStop)).toEqual(['ARRIVED_DESTINATION'])

    const valid = buildTruckCheckpointPayload(pickupStop, {
      checkpointCode: 'ARRIVED_PICKUP',
      occurredAt: '2026-05-10T08:15',
      notes: 'Driver checked in.',
      reversalReason: '',
    })
    expect(valid.validationMessage).toBeNull()
    expect(valid.payload).toEqual({
      checkpoint_code: 'ARRIVED_PICKUP',
      occurred_at: new Date('2026-05-10T08:15').toISOString(),
      notes: 'Driver checked in.',
    })

    const invalid = buildTruckCheckpointPayload(destinationStop, {
      checkpointCode: 'DEPARTED_PICKUP',
      occurredAt: '2026-05-10T08:15',
      notes: '',
      reversalReason: '',
    })
    expect(invalid.validationMessage).toBe('DEPARTED PICKUP is not valid for a DROPOFF stop.')
  })

  it('filters active truck checkpoint events for a stop and hides reversed events', () => {
    const referenceCode = truckCheckpointReferenceCode({
      checkpointCode: 'ARRIVED_PICKUP',
      movementId: 'MOVE-1',
      stopId: 'STOP-1',
    })
    const delivery = buildDelivery({
      delivery_events: [
        {
          event_id: 2,
          delivery_id: 'DLV-TRUCK-1001',
          trade_id: 'TRD-TRUCK-1001',
          leg_no: null,
          event_type: 'EVENT_REVERSED',
          execution_status: 'IN_PROGRESS',
          occurred_at: '2026-05-10T09:00:00Z',
          reversal_of_event_id: 1,
          reversal_reason: 'Wrong stop.',
          location_code: null,
          reference_code: null,
          source: 'TRUCK_MANUAL_DISPATCH',
          notes: null,
          created_at: '2026-05-10T09:00:00Z',
          created_by: 'ops@example.com',
          updated_at: '2026-05-10T09:00:00Z',
          updated_by: 'ops@example.com',
          version: 1,
        },
        {
          event_id: 1,
          delivery_id: 'DLV-TRUCK-1001',
          trade_id: 'TRD-TRUCK-1001',
          leg_no: null,
          event_type: 'CHECKPOINT_RECORDED',
          execution_status: 'IN_PROGRESS',
          occurred_at: '2026-05-10T08:15:00Z',
          reversal_of_event_id: null,
          reversal_reason: null,
          location_code: 'MIDLAND',
          reference_code: referenceCode,
          source: 'TRUCK_MANUAL_DISPATCH',
          notes: 'Driver checked in.',
          created_at: '2026-05-10T08:15:00Z',
          created_by: 'ops@example.com',
          updated_at: '2026-05-10T08:15:00Z',
          updated_by: 'ops@example.com',
          version: 1,
        },
      ],
    })

    expect(
      activeTruckCheckpointEventsForStop(delivery, {
        movementId: 'MOVE-1',
        stopId: 'STOP-1',
      }),
    ).toEqual([])
  })

  it('describes truck checkpoint timeline entries and latest active checkpoints', () => {
    const arrivedReferenceCode = truckCheckpointReferenceCode({
      checkpointCode: 'ARRIVED_PICKUP',
      movementId: 'MOVE-1',
      stopId: 'STOP-1',
    })
    const departedReferenceCode = truckCheckpointReferenceCode({
      checkpointCode: 'DEPARTED_PICKUP',
      movementId: 'MOVE-1',
      stopId: 'STOP-1',
    })
    const delivery = buildDelivery({
      delivery_events: [
        {
          event_id: 3,
          delivery_id: 'DLV-TRUCK-1001',
          trade_id: 'TRD-TRUCK-1001',
          leg_no: null,
          event_type: 'CHECKPOINT_RECORDED',
          execution_status: 'IN_PROGRESS',
          occurred_at: '2026-05-10T09:00:00Z',
          reversal_of_event_id: null,
          reversal_reason: null,
          location_code: 'MIDLAND',
          reference_code: departedReferenceCode,
          source: 'TRUCK_MANUAL_DISPATCH',
          notes: 'Driver departed.',
          created_at: '2026-05-10T09:00:00Z',
          created_by: 'ops@example.com',
          updated_at: '2026-05-10T09:00:00Z',
          updated_by: 'ops@example.com',
          version: 1,
        },
        {
          event_id: 2,
          delivery_id: 'DLV-TRUCK-1001',
          trade_id: 'TRD-TRUCK-1001',
          leg_no: null,
          event_type: 'EVENT_REVERSED',
          execution_status: 'IN_PROGRESS',
          occurred_at: '2026-05-10T08:30:00Z',
          reversal_of_event_id: 1,
          reversal_reason: 'Wrong timestamp.',
          location_code: null,
          reference_code: null,
          source: 'TRUCK_MANUAL_DISPATCH',
          notes: null,
          created_at: '2026-05-10T08:30:00Z',
          created_by: 'ops@example.com',
          updated_at: '2026-05-10T08:30:00Z',
          updated_by: 'ops@example.com',
          version: 1,
        },
        {
          event_id: 1,
          delivery_id: 'DLV-TRUCK-1001',
          trade_id: 'TRD-TRUCK-1001',
          leg_no: null,
          event_type: 'CHECKPOINT_RECORDED',
          execution_status: 'IN_PROGRESS',
          occurred_at: '2026-05-10T08:15:00Z',
          reversal_of_event_id: null,
          reversal_reason: null,
          location_code: 'MIDLAND',
          reference_code: arrivedReferenceCode,
          source: 'TRUCK_MANUAL_DISPATCH',
          notes: 'Driver checked in.',
          created_at: '2026-05-10T08:15:00Z',
          created_by: 'ops@example.com',
          updated_at: '2026-05-10T08:15:00Z',
          updated_by: 'ops@example.com',
          version: 1,
        },
      ],
    })

    expect(latestActiveTruckCheckpointEvent(delivery, { movementId: 'MOVE-1' })?.checkpoint_code).toBe(
      'DEPARTED_PICKUP',
    )
    expect(describeTruckCheckpointTimelineEvent(delivery, delivery.delivery_events[0])?.title).toBe(
      'Truck checkpoint: Departed pickup',
    )
    expect(describeTruckCheckpointTimelineEvent(delivery, delivery.delivery_events[1])).toEqual(
      expect.objectContaining({
        kind: 'correction',
        title: 'Truck checkpoint correction: Arrived pickup',
        correction_reason: 'Wrong timestamp.',
      }),
    )
    expect(describeTruckCheckpointTimelineEvent(delivery, delivery.delivery_events[2])).toEqual(
      expect.objectContaining({
        kind: 'checkpoint',
        is_reversed: true,
        title: 'Corrected truck checkpoint: Arrived pickup',
      }),
    )
  })

  it('requires a correction reason before reversing a truck checkpoint', () => {
    expect(
      buildTruckCheckpointReversePayload({
        checkpointCode: 'ARRIVED_PICKUP',
        occurredAt: '',
        notes: '',
        reversalReason: '',
      }).validationMessage,
    ).toBe('Correction reason is required before reversing a truck checkpoint.')

    expect(
      buildTruckCheckpointReversePayload({
        checkpointCode: 'ARRIVED_PICKUP',
        occurredAt: '',
        notes: '',
        reversalReason: 'Wrong stop.',
      }).payload,
    ).toEqual({ reversal_reason: 'Wrong stop.' })
  })

  it('seeds and builds manual truck tracking signal payloads as evidence', () => {
    const movement = buildMovement({
      current_eta_at_destination: '2026-05-10T14:30:00Z',
    })
    const draft = {
      ...buildTruckTrackingSignalDraft(movement),
      sourceSystem: ' manual_dispatch ',
      sourceEventId: 'CALL-1',
      signalType: ' eta_update ',
      occurredAt: '2026-05-10T10:00',
      stopId: 'STOP-1',
      locationCode: 'MIDLAND',
      externalStatus: 'Driver called from gate',
      normalizedStatus: ' at_stop ',
      matchConfidence: '0.75',
      etaAtDestination: '2026-05-10T14:45',
      dispatcherNote: 'Driver called from gate.',
    }
    const result = buildTruckTrackingSignalPayload(draft)

    expect(buildTruckTrackingSignalDraft(movement)).toEqual(
      expect.objectContaining({
        sourceSystem: 'TRUCK_MANUAL_DISPATCH',
        signalType: 'POSITION',
        locationCode: 'MIDLAND',
      }),
    )
    expect(result.validationMessage).toBeNull()
    expect(result.payload).toEqual({
      source_system: 'MANUAL_DISPATCH',
      source_event_id: 'CALL-1',
      signal_type: 'ETA_UPDATE',
      occurred_at: new Date('2026-05-10T10:00').toISOString(),
      stop_id: 'STOP-1',
      location_code: 'MIDLAND',
      external_status: 'Driver called from gate',
      normalized_status: 'AT_STOP',
      match_confidence: 0.75,
      eta_at_destination: new Date('2026-05-10T14:45').toISOString(),
      raw_payload: {
        dispatcher_note: 'Driver called from gate.',
      },
    })
  })

  it('validates required truck tracking signal fields and confidence bounds', () => {
    expect(
      buildTruckTrackingSignalPayload({
        ...buildTruckTrackingSignalDraft(),
        signalType: '',
      }).validationMessage,
    ).toBe('Tracking signal type is required.')

    expect(
      buildTruckTrackingSignalPayload({
        ...buildTruckTrackingSignalDraft(),
        matchConfidence: '1.5',
      }).validationMessage,
    ).toBe('Tracking signal match confidence must be between 0 and 1.')
  })
})
