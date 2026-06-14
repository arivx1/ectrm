import type {
  DeliveryTrackingSignalCreateInput,
  DeliveryTruckMovementCreateInput,
  DeliveryTruckStopCreateInput,
  RecordDeliveryTruckStopCheckpointInput,
  ReverseDeliveryTruckStopCheckpointInput,
  UpdateDeliveryTruckDetailInput,
  UpdateDeliveryTruckMovementInput,
  UpdateDeliveryTruckStopInput,
} from '../../entities/shipments/api'
import type {
  DeliveryRecord,
  DeliveryEventRecord,
  DeliveryTruckMovementRecord,
  DeliveryTruckStopRecord,
  TruckCheckpointCode,
  TruckMovementStatus,
  TruckStopStatus,
  TruckStopType,
} from '../../shared/models'

export type TruckDetailDraft = {
  targetRunCount: string
  dispatcherOwner: string
  trackingProvider: string
  trackingPolicy: string
  defaultCarrierName: string
  defaultExternalCarrierReference: string
  equipmentType: string
  originGeofenceCode: string
  destinationGeofenceCode: string
}

export type TruckMovementDraft = {
  sequenceNo: string
  plannedQuantity: string
  plannedUnitOfMeasure: string
  carrierName: string
  externalCarrierReference: string
  dispatcherOwner: string
  driverName: string
  driverPhone: string
  tractorReference: string
  trailerReference: string
  externalLoadReference: string
  billOfLadingNumber: string
  truckTicketNumber: string
  holdReasonCode: string
  status: Extract<TruckMovementStatus, 'PLANNED' | 'ASSIGNED' | 'ON_HOLD'>
  statusReason: string
}

export type TruckStopDraft = {
  stopSequence: string
  stopType: TruckStopType
  locationCode: string
  plannedArrivalStart: string
  plannedArrivalEnd: string
  plannedDepartureStart: string
  plannedDepartureEnd: string
  appointmentReference: string
  plannedQuantity: string
  actualQuantity: string
  actualArrivedAt: string
  actualDepartedAt: string
  status: TruckStopStatus
  statusReason: string
}

export type TruckCheckpointDraft = {
  checkpointCode: TruckCheckpointCode
  occurredAt: string
  notes: string
  reversalReason: string
}

export type TruckTrackingSignalDraft = {
  sourceSystem: string
  sourceEventId: string
  signalType: string
  occurredAt: string
  stopId: string
  locationCode: string
  externalStatus: string
  normalizedStatus: string
  matchConfidence: string
  etaAtDestination: string
  dispatcherNote: string
}

export type TruckCheckpointEventRecord = DeliveryEventRecord & {
  checkpoint_code: TruckCheckpointCode
  movement_id: string
  stop_id: string
}

export type TruckCheckpointTimelineDescriptor = {
  kind: 'checkpoint' | 'correction'
  checkpoint_code: TruckCheckpointCode
  movement_id: string
  stop_id: string
  is_reversed: boolean
  title: string
  summary: string
  correction_reason: string | null
}

export const TRUCK_MOVEMENT_STATUS_OPTIONS: Array<
  Extract<TruckMovementStatus, 'PLANNED' | 'ASSIGNED' | 'ON_HOLD'>
> = ['PLANNED', 'ASSIGNED', 'ON_HOLD']

export const TRUCK_STOP_STATUS_OPTIONS: TruckStopStatus[] = [
  'PLANNED',
  'EN_ROUTE',
  'ARRIVED',
  'WORKING',
  'DEPARTED',
  'SKIPPED',
  'CANCELLED',
]

export const TRUCK_STOP_TYPE_OPTIONS: TruckStopType[] = ['PICKUP', 'WAYPOINT', 'DROPOFF']

export const TRUCK_CHECKPOINT_SOURCE = 'TRUCK_MANUAL_DISPATCH'

export const TRUCK_TRACKING_SIGNAL_SOURCE = 'TRUCK_MANUAL_DISPATCH'

export const TRUCK_CHECKPOINT_CODE_OPTIONS: TruckCheckpointCode[] = [
  'ARRIVED_PICKUP',
  'DEPARTED_PICKUP',
  'ARRIVED_DESTINATION',
]

export function formatEnumLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

export function normalizedNullableText(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

export function formatLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const parsedValue = new Date(value)
  if (Number.isNaN(parsedValue.getTime())) {
    return ''
  }

  const year = parsedValue.getFullYear()
  const month = String(parsedValue.getMonth() + 1).padStart(2, '0')
  const day = String(parsedValue.getDate()).padStart(2, '0')
  const hours = String(parsedValue.getHours()).padStart(2, '0')
  const minutes = String(parsedValue.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function defaultTruckCheckpointOccurredAt(): string {
  return formatLocalDateTimeInput(new Date().toISOString())
}

export function truckCheckpointReferenceCode(args: {
  checkpointCode: TruckCheckpointCode
  movementId: string
  stopId: string
}): string {
  return `TRUCK:${args.checkpointCode}:M:${args.movementId}:S:${args.stopId}`
}

export function parseTruckCheckpointReferenceCode(
  referenceCode: string | null,
): { checkpointCode: TruckCheckpointCode; movementId: string; stopId: string } | null {
  if (!referenceCode) {
    return null
  }
  const match = /^TRUCK:([A-Z_]+):M:([^:]+):S:([^:]+)$/.exec(referenceCode)
  if (!match) {
    return null
  }
  const checkpointCode = match[1] as TruckCheckpointCode
  if (!TRUCK_CHECKPOINT_CODE_OPTIONS.includes(checkpointCode)) {
    return null
  }
  return {
    checkpointCode,
    movementId: match[2],
    stopId: match[3],
  }
}

export function formatTruckCheckpointLabel(checkpointCode: TruckCheckpointCode): string {
  switch (checkpointCode) {
    case 'ARRIVED_PICKUP':
      return 'Arrived pickup'
    case 'DEPARTED_PICKUP':
      return 'Departed pickup'
    case 'ARRIVED_DESTINATION':
      return 'Arrived destination'
    default:
      return formatEnumLabel(checkpointCode)
  }
}

export function truckCheckpointCodeForEvent(
  event: DeliveryEventRecord,
  args: {
    movementId: string
    stopId: string
  },
): TruckCheckpointCode | null {
  if (event.event_type !== 'CHECKPOINT_RECORDED' || event.source !== TRUCK_CHECKPOINT_SOURCE) {
    return null
  }
  const parsedReference = parseTruckCheckpointReferenceCode(event.reference_code)
  if (
    parsedReference &&
    parsedReference.movementId === args.movementId &&
    parsedReference.stopId === args.stopId
  ) {
    return parsedReference.checkpointCode
  }
  return null
}

export function activeTruckCheckpointEvents(
  delivery: DeliveryRecord,
  args: {
    movementId: string
    stopId: string
  } | {
    movementId: string
  } | null = null,
): TruckCheckpointEventRecord[] {
  const reversedEventIds = new Set(
    delivery.delivery_events
      .map((event) => event.reversal_of_event_id)
      .filter((eventId): eventId is number => eventId !== null),
  )
  return delivery.delivery_events
    .filter((event) => event.reversal_of_event_id === null && !reversedEventIds.has(event.event_id))
    .map((event) => ({
      event,
      parsedReference:
        event.event_type === 'CHECKPOINT_RECORDED' && event.source === TRUCK_CHECKPOINT_SOURCE
          ? parseTruckCheckpointReferenceCode(event.reference_code)
          : null,
    }))
    .filter((row): row is {
      event: DeliveryEventRecord
      parsedReference: { checkpointCode: TruckCheckpointCode; movementId: string; stopId: string }
    } =>
      row.parsedReference !== null &&
      (args === null ||
        row.parsedReference.movementId === args.movementId) &&
      (!args || !('stopId' in args) || row.parsedReference.stopId === args.stopId),
    )
    .map(({ event, parsedReference }) => ({
      ...event,
      checkpoint_code: parsedReference.checkpointCode,
      movement_id: parsedReference.movementId,
      stop_id: parsedReference.stopId,
    }))
    .sort((left, right) => {
      const rightTime = new Date(right.occurred_at).getTime()
      const leftTime = new Date(left.occurred_at).getTime()
      if (rightTime !== leftTime) {
        return rightTime - leftTime
      }
      return right.event_id - left.event_id
    })
}

export function activeTruckCheckpointEventsForStop(
  delivery: DeliveryRecord,
  args: {
    movementId: string
    stopId: string
  },
): TruckCheckpointEventRecord[] {
  return activeTruckCheckpointEvents(delivery, args)
}

export function latestActiveTruckCheckpointEvent(
  delivery: DeliveryRecord,
  args: {
    movementId: string
  } | null = null,
): TruckCheckpointEventRecord | null {
  return activeTruckCheckpointEvents(delivery, args)[0] ?? null
}

export function describeTruckCheckpointTimelineEvent(
  delivery: DeliveryRecord,
  event: DeliveryEventRecord,
): TruckCheckpointTimelineDescriptor | null {
  const eventsById = new Map(delivery.delivery_events.map((row) => [row.event_id, row]))
  const reversalEvent = delivery.delivery_events.find((row) => row.reversal_of_event_id === event.event_id)

  if (event.event_type === 'CHECKPOINT_RECORDED' && event.source === TRUCK_CHECKPOINT_SOURCE) {
    const parsedReference = parseTruckCheckpointReferenceCode(event.reference_code)
    if (!parsedReference) {
      return null
    }
    const label = formatTruckCheckpointLabel(parsedReference.checkpointCode)
    const isReversed = reversalEvent !== undefined
    return {
      kind: 'checkpoint',
      checkpoint_code: parsedReference.checkpointCode,
      movement_id: parsedReference.movementId,
      stop_id: parsedReference.stopId,
      is_reversed: isReversed,
      title: isReversed ? `Corrected truck checkpoint: ${label}` : `Truck checkpoint: ${label}`,
      summary: `Run ${parsedReference.movementId} / Stop ${parsedReference.stopId}`,
      correction_reason: reversalEvent?.reversal_reason ?? null,
    }
  }

  if (event.event_type === 'EVENT_REVERSED' && event.reversal_of_event_id !== null) {
    const targetEvent = eventsById.get(event.reversal_of_event_id)
    if (!targetEvent || targetEvent.source !== TRUCK_CHECKPOINT_SOURCE) {
      return null
    }
    const parsedReference = parseTruckCheckpointReferenceCode(targetEvent.reference_code)
    if (!parsedReference) {
      return null
    }
    const label = formatTruckCheckpointLabel(parsedReference.checkpointCode)
    return {
      kind: 'correction',
      checkpoint_code: parsedReference.checkpointCode,
      movement_id: parsedReference.movementId,
      stop_id: parsedReference.stopId,
      is_reversed: false,
      title: `Truck checkpoint correction: ${label}`,
      summary: `Corrected event ${targetEvent.event_id} / Run ${parsedReference.movementId} / Stop ${parsedReference.stopId}`,
      correction_reason: event.reversal_reason,
    }
  }

  return null
}

export function checkpointOptionsForStop(stop: DeliveryTruckStopRecord): TruckCheckpointCode[] {
  if (stop.stop_type === 'PICKUP') {
    return ['ARRIVED_PICKUP', 'DEPARTED_PICKUP']
  }
  if (stop.stop_type === 'DROPOFF') {
    return ['ARRIVED_DESTINATION']
  }
  return []
}

export function buildTruckCheckpointDraft(
  stop: DeliveryTruckStopRecord,
  current?: TruckCheckpointDraft | null,
): TruckCheckpointDraft {
  const options = checkpointOptionsForStop(stop)
  return {
    checkpointCode: current?.checkpointCode ?? options[0] ?? 'ARRIVED_PICKUP',
    occurredAt: current?.occurredAt ?? defaultTruckCheckpointOccurredAt(),
    notes: current?.notes ?? '',
    reversalReason: current?.reversalReason ?? '',
  }
}

export function buildTruckTrackingSignalDraft(
  movement?: DeliveryTruckMovementRecord | null,
  current?: TruckTrackingSignalDraft | null,
): TruckTrackingSignalDraft {
  return {
    sourceSystem: current?.sourceSystem ?? TRUCK_TRACKING_SIGNAL_SOURCE,
    sourceEventId: current?.sourceEventId ?? '',
    signalType: current?.signalType ?? 'POSITION',
    occurredAt: current?.occurredAt ?? defaultTruckCheckpointOccurredAt(),
    stopId: current?.stopId ?? '',
    locationCode: current?.locationCode ?? movement?.current_location_code ?? '',
    externalStatus: current?.externalStatus ?? '',
    normalizedStatus: current?.normalizedStatus ?? '',
    matchConfidence: current?.matchConfidence ?? '',
    etaAtDestination: current?.etaAtDestination ?? formatLocalDateTimeInput(movement?.current_eta_at_destination),
    dispatcherNote: current?.dispatcherNote ?? '',
  }
}

function normalizedPositiveInt(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parsedValue = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

function normalizedPositiveNumber(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parsedValue = Number(normalized)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

function normalizedBoundedNumber(
  value: string,
  {
    minimum,
    maximum,
  }: {
    minimum: number
    maximum: number
  },
): number | null {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parsedValue = Number(normalized)
  if (!Number.isFinite(parsedValue) || parsedValue < minimum || parsedValue > maximum) {
    return null
  }
  return parsedValue
}

function normalizedIsoDateTime(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parsedValue = new Date(normalized)
  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }
  return parsedValue.toISOString()
}

function validateStopChronology(draft: TruckStopDraft): string | null {
  const plannedArrivalStart = normalizedIsoDateTime(draft.plannedArrivalStart)
  const plannedArrivalEnd = normalizedIsoDateTime(draft.plannedArrivalEnd)
  const plannedDepartureStart = normalizedIsoDateTime(draft.plannedDepartureStart)
  const plannedDepartureEnd = normalizedIsoDateTime(draft.plannedDepartureEnd)
  const actualArrivedAt = normalizedIsoDateTime(draft.actualArrivedAt)
  const actualDepartedAt = normalizedIsoDateTime(draft.actualDepartedAt)

  if (plannedArrivalStart && plannedArrivalEnd && plannedArrivalStart > plannedArrivalEnd) {
    return 'Truck stop planned arrival start must be on or before planned arrival end.'
  }
  if (plannedDepartureStart && plannedDepartureEnd && plannedDepartureStart > plannedDepartureEnd) {
    return 'Truck stop planned departure start must be on or before planned departure end.'
  }
  if (actualArrivedAt && actualDepartedAt && actualArrivedAt > actualDepartedAt) {
    return 'Truck stop actual arrival must be on or before actual departure.'
  }
  return null
}

export function buildTruckDetailDraft(delivery: DeliveryRecord): TruckDetailDraft {
  return {
    targetRunCount:
      delivery.truck_detail?.target_run_count == null ? '' : String(delivery.truck_detail.target_run_count),
    dispatcherOwner:
      delivery.truck_detail?.dispatcher_owner ?? delivery.operations_owner ?? '',
    trackingProvider: delivery.truck_detail?.tracking_provider ?? '',
    trackingPolicy: delivery.truck_detail?.tracking_policy ?? '',
    defaultCarrierName:
      delivery.truck_detail?.default_carrier_name ?? delivery.carrier_name ?? '',
    defaultExternalCarrierReference:
      delivery.truck_detail?.default_external_carrier_reference ?? delivery.carrier_reference ?? '',
    equipmentType:
      delivery.truck_detail?.equipment_type ?? delivery.equipment_type ?? '',
    originGeofenceCode: delivery.truck_detail?.origin_geofence_code ?? '',
    destinationGeofenceCode: delivery.truck_detail?.destination_geofence_code ?? '',
  }
}

export function buildTruckDetailPayload(
  delivery: DeliveryRecord,
  draft: TruckDetailDraft,
): {
  payload: UpdateDeliveryTruckDetailInput
  hasChanges: boolean
  validationMessage: string | null
} {
  const payload: UpdateDeliveryTruckDetailInput = {}
  const normalizedTargetRunCount = draft.targetRunCount.trim()
  const targetRunCount =
    normalizedTargetRunCount === '' ? null : normalizedPositiveInt(normalizedTargetRunCount)

  if (normalizedTargetRunCount !== '' && targetRunCount === null) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'Target run count must be a positive whole number.',
    }
  }

  const dispatcherOwner = normalizedNullableText(draft.dispatcherOwner)
  const trackingProvider = normalizedNullableText(draft.trackingProvider)
  const trackingPolicy = normalizedNullableText(draft.trackingPolicy)
  const defaultCarrierName = normalizedNullableText(draft.defaultCarrierName)
  const defaultExternalCarrierReference = normalizedNullableText(draft.defaultExternalCarrierReference)
  const equipmentType = normalizedNullableText(draft.equipmentType)
  const originGeofenceCode = normalizedNullableText(draft.originGeofenceCode)
  const destinationGeofenceCode = normalizedNullableText(draft.destinationGeofenceCode)

  if (targetRunCount !== (delivery.truck_detail?.target_run_count ?? null)) {
    payload.target_run_count = targetRunCount
  }
  if (dispatcherOwner !== (delivery.truck_detail?.dispatcher_owner ?? delivery.operations_owner ?? null)) {
    payload.dispatcher_owner = dispatcherOwner
  }
  if (trackingProvider !== (delivery.truck_detail?.tracking_provider ?? null)) {
    payload.tracking_provider = trackingProvider
  }
  if (trackingPolicy !== (delivery.truck_detail?.tracking_policy ?? null)) {
    payload.tracking_policy = trackingPolicy
  }
  if (defaultCarrierName !== (delivery.truck_detail?.default_carrier_name ?? delivery.carrier_name ?? null)) {
    payload.default_carrier_name = defaultCarrierName
  }
  if (
    defaultExternalCarrierReference !==
    (delivery.truck_detail?.default_external_carrier_reference ?? delivery.carrier_reference ?? null)
  ) {
    payload.default_external_carrier_reference = defaultExternalCarrierReference
  }
  if (equipmentType !== (delivery.truck_detail?.equipment_type ?? delivery.equipment_type ?? null)) {
    payload.equipment_type = equipmentType
  }
  if (originGeofenceCode !== (delivery.truck_detail?.origin_geofence_code ?? null)) {
    payload.origin_geofence_code = originGeofenceCode
  }
  if (destinationGeofenceCode !== (delivery.truck_detail?.destination_geofence_code ?? null)) {
    payload.destination_geofence_code = destinationGeofenceCode
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
    validationMessage: null,
  }
}

export function buildTruckMovementDraft(
  delivery: DeliveryRecord,
  movement?: DeliveryTruckMovementRecord | null,
): TruckMovementDraft {
  return {
    sequenceNo: movement ? String(movement.sequence_no) : String((delivery.truck_movement_count ?? 0) + 1),
    plannedQuantity: movement?.planned_quantity == null ? '' : String(movement.planned_quantity),
    plannedUnitOfMeasure: movement?.planned_unit_of_measure ?? delivery.unit_of_measure ?? '',
    carrierName: movement?.carrier_name ?? delivery.truck_detail?.default_carrier_name ?? '',
    externalCarrierReference:
      movement?.external_carrier_reference ?? delivery.truck_detail?.default_external_carrier_reference ?? '',
    dispatcherOwner: movement?.dispatcher_owner ?? delivery.truck_detail?.dispatcher_owner ?? delivery.operations_owner ?? '',
    driverName: movement?.driver_name ?? '',
    driverPhone: movement?.driver_phone ?? '',
    tractorReference: movement?.tractor_reference ?? '',
    trailerReference: movement?.trailer_reference ?? '',
    externalLoadReference: movement?.external_load_reference ?? '',
    billOfLadingNumber: movement?.bill_of_lading_number ?? '',
    truckTicketNumber: movement?.truck_ticket_number ?? '',
    holdReasonCode: movement?.hold_reason_code ?? '',
    status:
      movement?.status === 'ASSIGNED' || movement?.status === 'ON_HOLD'
        ? movement.status
        : 'PLANNED',
    statusReason: movement?.status_reason ?? '',
  }
}

export function buildTruckStopDraft(stop?: DeliveryTruckStopRecord | null): TruckStopDraft {
  return {
    stopSequence: stop ? String(stop.stop_sequence) : '',
    stopType: stop?.stop_type ?? 'WAYPOINT',
    locationCode: stop?.location_code ?? '',
    plannedArrivalStart: formatLocalDateTimeInput(stop?.planned_arrival_start),
    plannedArrivalEnd: formatLocalDateTimeInput(stop?.planned_arrival_end),
    plannedDepartureStart: formatLocalDateTimeInput(stop?.planned_departure_start),
    plannedDepartureEnd: formatLocalDateTimeInput(stop?.planned_departure_end),
    appointmentReference: stop?.appointment_reference ?? '',
    plannedQuantity: stop?.planned_quantity == null ? '' : String(stop.planned_quantity),
    actualQuantity: stop?.actual_quantity == null ? '' : String(stop.actual_quantity),
    actualArrivedAt: formatLocalDateTimeInput(stop?.actual_arrived_at),
    actualDepartedAt: formatLocalDateTimeInput(stop?.actual_departed_at),
    status: stop?.status ?? 'PLANNED',
    statusReason: stop?.status_reason ?? '',
  }
}

export function buildDefaultMovementCreateStops(): TruckStopDraft[] {
  return [
    {
      ...buildTruckStopDraft(),
      stopSequence: '1',
      stopType: 'PICKUP',
    },
    {
      ...buildTruckStopDraft(),
      stopSequence: '2',
      stopType: 'DROPOFF',
    },
  ]
}

function buildTruckStopPayloadFromDraft(
  draft: TruckStopDraft,
  {
    includeActuals,
    includeStatus,
  }: {
    includeActuals: boolean
    includeStatus: boolean
  },
): {
  payload: DeliveryTruckStopCreateInput | UpdateDeliveryTruckStopInput
  validationMessage: string | null
} {
  const chronologyMessage = validateStopChronology(draft)
  if (chronologyMessage) {
    return {
      payload: {},
      validationMessage: chronologyMessage,
    }
  }

  const stopSequence = normalizedPositiveInt(draft.stopSequence)
  const normalizedStopSequence = draft.stopSequence.trim()
  if (normalizedStopSequence !== '' && stopSequence === null) {
    return {
      payload: {},
      validationMessage: 'Truck stop sequence must be a positive whole number.',
    }
  }

  const plannedQuantity = normalizedPositiveNumber(draft.plannedQuantity)
  if (draft.plannedQuantity.trim() !== '' && plannedQuantity === null) {
    return {
      payload: {},
      validationMessage: 'Truck stop planned quantity must be a positive number.',
    }
  }

  const actualQuantity = normalizedPositiveNumber(draft.actualQuantity)
  if (includeActuals && draft.actualQuantity.trim() !== '' && actualQuantity === null) {
    return {
      payload: {},
      validationMessage: 'Truck stop actual quantity must be a positive number.',
    }
  }

  const payload: DeliveryTruckStopCreateInput & UpdateDeliveryTruckStopInput = {
    stop_type: draft.stopType,
    location_code: normalizedNullableText(draft.locationCode),
    planned_arrival_start: normalizedIsoDateTime(draft.plannedArrivalStart),
    planned_arrival_end: normalizedIsoDateTime(draft.plannedArrivalEnd),
    planned_departure_start: normalizedIsoDateTime(draft.plannedDepartureStart),
    planned_departure_end: normalizedIsoDateTime(draft.plannedDepartureEnd),
    appointment_reference: normalizedNullableText(draft.appointmentReference),
    planned_quantity: plannedQuantity,
  }

  if (stopSequence !== null) {
    payload.stop_sequence = stopSequence
  }
  if (includeActuals) {
    payload.actual_quantity = actualQuantity
    payload.actual_arrived_at = normalizedIsoDateTime(draft.actualArrivedAt)
    payload.actual_departed_at = normalizedIsoDateTime(draft.actualDepartedAt)
  }
  if (includeStatus) {
    payload.status = draft.status
    payload.status_reason = normalizedNullableText(draft.statusReason)
  }

  return {
    payload,
    validationMessage: null,
  }
}

export function buildTruckMovementCreatePayload(
  delivery: DeliveryRecord,
  draft: TruckMovementDraft,
  stops: TruckStopDraft[],
): {
  payload: DeliveryTruckMovementCreateInput
  validationMessage: string | null
} {
  const sequenceNo = normalizedPositiveInt(draft.sequenceNo)
  if (sequenceNo === null) {
    return {
      payload: {
        sequence_no: 1,
        stops: [],
      },
      validationMessage: 'Movement sequence must be a positive whole number.',
    }
  }

  const plannedQuantity = normalizedPositiveNumber(draft.plannedQuantity)
  if (draft.plannedQuantity.trim() !== '' && plannedQuantity === null) {
    return {
      payload: {
        sequence_no: sequenceNo,
        stops: [],
      },
      validationMessage: 'Movement planned quantity must be a positive number.',
    }
  }

  if (draft.status === 'ON_HOLD' && !normalizedNullableText(draft.holdReasonCode)) {
    return {
      payload: {
        sequence_no: sequenceNo,
        stops: [],
      },
      validationMessage: 'Hold reason is required when the truck run starts on hold.',
    }
  }

  if (stops.length < 2) {
    return {
      payload: {
        sequence_no: sequenceNo,
        stops: [],
      },
      validationMessage: 'Truck run creation requires at least two stops.',
    }
  }

  const stopPayloads: DeliveryTruckStopCreateInput[] = []
  for (let index = 0; index < stops.length; index += 1) {
    const stopDraft = stops[index]
    const { payload, validationMessage } = buildTruckStopPayloadFromDraft(stopDraft, {
      includeActuals: false,
      includeStatus: true,
    })
    if (validationMessage) {
      return {
        payload: {
          sequence_no: sequenceNo,
          stops: [],
        },
        validationMessage: `Stop ${index + 1}: ${validationMessage}`,
      }
    }
    stopPayloads.push({
      ...payload,
      stop_sequence: index + 1,
    } as DeliveryTruckStopCreateInput)
  }

  if (stopPayloads[0]?.stop_type !== 'PICKUP') {
    return {
      payload: {
        sequence_no: sequenceNo,
        stops: stopPayloads,
      },
      validationMessage: 'The first truck stop must be a pickup.',
    }
  }
  if (stopPayloads[stopPayloads.length - 1]?.stop_type !== 'DROPOFF') {
    return {
      payload: {
        sequence_no: sequenceNo,
        stops: stopPayloads,
      },
      validationMessage: 'The last truck stop must be a dropoff.',
    }
  }

  return {
    payload: {
      sequence_no: sequenceNo,
      planned_quantity: plannedQuantity,
      planned_unit_of_measure: normalizedNullableText(draft.plannedUnitOfMeasure) ?? delivery.unit_of_measure,
      carrier_name: normalizedNullableText(draft.carrierName),
      external_carrier_reference: normalizedNullableText(draft.externalCarrierReference),
      dispatcher_owner: normalizedNullableText(draft.dispatcherOwner),
      driver_name: normalizedNullableText(draft.driverName),
      driver_phone: normalizedNullableText(draft.driverPhone),
      tractor_reference: normalizedNullableText(draft.tractorReference),
      trailer_reference: normalizedNullableText(draft.trailerReference),
      external_load_reference: normalizedNullableText(draft.externalLoadReference),
      bill_of_lading_number: normalizedNullableText(draft.billOfLadingNumber),
      truck_ticket_number: normalizedNullableText(draft.truckTicketNumber),
      hold_reason_code: normalizedNullableText(draft.holdReasonCode),
      status: draft.status,
      stops: stopPayloads,
    },
    validationMessage: null,
  }
}

export function buildTruckMovementUpdatePayload(
  movement: DeliveryTruckMovementRecord,
  draft: TruckMovementDraft,
): {
  payload: UpdateDeliveryTruckMovementInput
  hasChanges: boolean
  validationMessage: string | null
} {
  const payload: UpdateDeliveryTruckMovementInput = {}
  const sequenceNo = normalizedPositiveInt(draft.sequenceNo)
  if (draft.sequenceNo.trim() !== '' && sequenceNo === null) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'Movement sequence must be a positive whole number.',
    }
  }

  const plannedQuantity = normalizedPositiveNumber(draft.plannedQuantity)
  if (draft.plannedQuantity.trim() !== '' && plannedQuantity === null) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'Movement planned quantity must be a positive number.',
    }
  }

  if (draft.status === 'ON_HOLD' && !normalizedNullableText(draft.holdReasonCode)) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'Hold reason is required when a truck run is on hold.',
    }
  }

  if (sequenceNo !== movement.sequence_no) {
    payload.sequence_no = sequenceNo
  }
  if (plannedQuantity !== movement.planned_quantity) {
    payload.planned_quantity = plannedQuantity
  }

  const plannedUnitOfMeasure = normalizedNullableText(draft.plannedUnitOfMeasure)
  const carrierName = normalizedNullableText(draft.carrierName)
  const externalCarrierReference = normalizedNullableText(draft.externalCarrierReference)
  const dispatcherOwner = normalizedNullableText(draft.dispatcherOwner)
  const driverName = normalizedNullableText(draft.driverName)
  const driverPhone = normalizedNullableText(draft.driverPhone)
  const tractorReference = normalizedNullableText(draft.tractorReference)
  const trailerReference = normalizedNullableText(draft.trailerReference)
  const externalLoadReference = normalizedNullableText(draft.externalLoadReference)
  const billOfLadingNumber = normalizedNullableText(draft.billOfLadingNumber)
  const truckTicketNumber = normalizedNullableText(draft.truckTicketNumber)
  const holdReasonCode = normalizedNullableText(draft.holdReasonCode)
  const statusReason = normalizedNullableText(draft.statusReason)

  if (plannedUnitOfMeasure !== movement.planned_unit_of_measure) {
    payload.planned_unit_of_measure = plannedUnitOfMeasure
  }
  if (carrierName !== movement.carrier_name) {
    payload.carrier_name = carrierName
  }
  if (externalCarrierReference !== movement.external_carrier_reference) {
    payload.external_carrier_reference = externalCarrierReference
  }
  if (dispatcherOwner !== movement.dispatcher_owner) {
    payload.dispatcher_owner = dispatcherOwner
  }
  if (driverName !== movement.driver_name) {
    payload.driver_name = driverName
  }
  if (driverPhone !== movement.driver_phone) {
    payload.driver_phone = driverPhone
  }
  if (tractorReference !== movement.tractor_reference) {
    payload.tractor_reference = tractorReference
  }
  if (trailerReference !== movement.trailer_reference) {
    payload.trailer_reference = trailerReference
  }
  if (externalLoadReference !== movement.external_load_reference) {
    payload.external_load_reference = externalLoadReference
  }
  if (billOfLadingNumber !== movement.bill_of_lading_number) {
    payload.bill_of_lading_number = billOfLadingNumber
  }
  if (truckTicketNumber !== movement.truck_ticket_number) {
    payload.truck_ticket_number = truckTicketNumber
  }
  if (holdReasonCode !== movement.hold_reason_code) {
    payload.hold_reason_code = holdReasonCode
  }
  if (draft.status !== movement.status && TRUCK_MOVEMENT_STATUS_OPTIONS.includes(draft.status)) {
    payload.status = draft.status
  }
  if (statusReason !== movement.status_reason) {
    payload.status_reason = statusReason
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
    validationMessage: null,
  }
}

export function buildTruckStopCreatePayload(
  draft: TruckStopDraft,
): {
  payload: DeliveryTruckStopCreateInput
  validationMessage: string | null
} {
  const { payload, validationMessage } = buildTruckStopPayloadFromDraft(draft, {
    includeActuals: false,
    includeStatus: false,
  })
  return {
    payload: payload as DeliveryTruckStopCreateInput,
    validationMessage,
  }
}

export function buildTruckStopUpdatePayload(
  stop: DeliveryTruckStopRecord,
  draft: TruckStopDraft,
): {
  payload: UpdateDeliveryTruckStopInput
  hasChanges: boolean
  validationMessage: string | null
} {
  const { payload, validationMessage } = buildTruckStopPayloadFromDraft(draft, {
    includeActuals: true,
    includeStatus: true,
  })
  if (validationMessage) {
    return {
      payload: {},
      hasChanges: false,
      validationMessage,
    }
  }

  const normalizedPayload = payload as UpdateDeliveryTruckStopInput
  const nextPayload: UpdateDeliveryTruckStopInput = {}
  const comparisons: Array<[keyof UpdateDeliveryTruckStopInput, unknown, unknown]> = [
    ['stop_sequence', normalizedPayload.stop_sequence ?? null, stop.stop_sequence],
    ['stop_type', normalizedPayload.stop_type ?? null, stop.stop_type],
    ['location_code', normalizedPayload.location_code ?? null, stop.location_code],
    ['planned_arrival_start', normalizedPayload.planned_arrival_start ?? null, stop.planned_arrival_start],
    ['planned_arrival_end', normalizedPayload.planned_arrival_end ?? null, stop.planned_arrival_end],
    ['planned_departure_start', normalizedPayload.planned_departure_start ?? null, stop.planned_departure_start],
    ['planned_departure_end', normalizedPayload.planned_departure_end ?? null, stop.planned_departure_end],
    ['appointment_reference', normalizedPayload.appointment_reference ?? null, stop.appointment_reference],
    ['planned_quantity', normalizedPayload.planned_quantity ?? null, stop.planned_quantity],
    ['actual_quantity', normalizedPayload.actual_quantity ?? null, stop.actual_quantity],
    ['actual_arrived_at', normalizedPayload.actual_arrived_at ?? null, stop.actual_arrived_at],
    ['actual_departed_at', normalizedPayload.actual_departed_at ?? null, stop.actual_departed_at],
    ['status', normalizedPayload.status ?? null, stop.status],
    ['status_reason', normalizedPayload.status_reason ?? null, stop.status_reason],
  ]

  for (const [fieldName, nextValue, currentValue] of comparisons) {
    if (nextValue !== currentValue) {
      nextPayload[fieldName] = nextValue as never
    }
  }

  return {
    payload: nextPayload,
    hasChanges: Object.keys(nextPayload).length > 0,
    validationMessage: null,
  }
}

export function buildTruckCheckpointPayload(
  stop: DeliveryTruckStopRecord,
  draft: TruckCheckpointDraft,
): {
  payload: RecordDeliveryTruckStopCheckpointInput
  validationMessage: string | null
} {
  const options = checkpointOptionsForStop(stop)
  if (!options.includes(draft.checkpointCode)) {
    return {
      payload: {
        checkpoint_code: draft.checkpointCode,
        occurred_at: new Date().toISOString(),
      },
      validationMessage: `${formatEnumLabel(draft.checkpointCode)} is not valid for a ${formatEnumLabel(stop.stop_type)} stop.`,
    }
  }
  const occurredAt = normalizedIsoDateTime(draft.occurredAt)
  if (!occurredAt) {
    return {
      payload: {
        checkpoint_code: draft.checkpointCode,
        occurred_at: new Date().toISOString(),
      },
      validationMessage: 'Checkpoint occurred at is required.',
    }
  }
  return {
    payload: {
      checkpoint_code: draft.checkpointCode,
      occurred_at: occurredAt,
      notes: normalizedNullableText(draft.notes),
    },
    validationMessage: null,
  }
}

export function buildTruckCheckpointReversePayload(
  draft: TruckCheckpointDraft,
): {
  payload: ReverseDeliveryTruckStopCheckpointInput
  validationMessage: string | null
} {
  const reversalReason = normalizedNullableText(draft.reversalReason)
  if (!reversalReason) {
    return {
      payload: {
        reversal_reason: '',
      },
      validationMessage: 'Correction reason is required before reversing a truck checkpoint.',
    }
  }
  return {
    payload: {
      reversal_reason: reversalReason,
    },
    validationMessage: null,
  }
}

export function buildTruckTrackingSignalPayload(
  draft: TruckTrackingSignalDraft,
): {
  payload: DeliveryTrackingSignalCreateInput
  validationMessage: string | null
} {
  const signalType = normalizedNullableText(draft.signalType)?.toUpperCase()
  if (!signalType) {
    return {
      payload: {
        signal_type: '',
        occurred_at: new Date().toISOString(),
      },
      validationMessage: 'Tracking signal type is required.',
    }
  }

  const occurredAt = normalizedIsoDateTime(draft.occurredAt)
  if (!occurredAt) {
    return {
      payload: {
        signal_type: signalType,
        occurred_at: new Date().toISOString(),
      },
      validationMessage: 'Tracking signal occurred at is required.',
    }
  }

  const matchConfidence = normalizedBoundedNumber(draft.matchConfidence, {
    minimum: 0,
    maximum: 1,
  })
  if (draft.matchConfidence.trim() !== '' && matchConfidence === null) {
    return {
      payload: {
        signal_type: signalType,
        occurred_at: occurredAt,
      },
      validationMessage: 'Tracking signal match confidence must be between 0 and 1.',
    }
  }

  const etaAtDestination = normalizedIsoDateTime(draft.etaAtDestination)
  if (draft.etaAtDestination.trim() !== '' && etaAtDestination === null) {
    return {
      payload: {
        signal_type: signalType,
        occurred_at: occurredAt,
      },
      validationMessage: 'Tracking signal destination ETA must be a valid date/time.',
    }
  }

  const dispatcherNote = normalizedNullableText(draft.dispatcherNote)
  return {
    payload: {
      source_system: normalizedNullableText(draft.sourceSystem)?.toUpperCase() ?? null,
      source_event_id: normalizedNullableText(draft.sourceEventId),
      signal_type: signalType,
      occurred_at: occurredAt,
      stop_id: normalizedNullableText(draft.stopId),
      location_code: normalizedNullableText(draft.locationCode),
      external_status: normalizedNullableText(draft.externalStatus),
      normalized_status: normalizedNullableText(draft.normalizedStatus)?.toUpperCase() ?? null,
      match_confidence: matchConfidence,
      eta_at_destination: etaAtDestination,
      raw_payload: dispatcherNote ? { dispatcher_note: dispatcherNote } : {},
    },
    validationMessage: null,
  }
}

export function truckTrackingSignalTone(
  status: string,
): 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped' {
  switch (status) {
    case 'MATCHED':
      return 'active'
    case 'UNRESOLVED':
      return 'in-progress'
    case 'REJECTED':
    case 'ERROR':
      return 'blocked'
    default:
      return 'planned'
  }
}
