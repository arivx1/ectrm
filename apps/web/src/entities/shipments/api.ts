import { fetchJson, patchJson, postJson, putJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'
import type {
  DeliveryEventType,
  DeliveryExecutionStatus,
  DeliveryRecord,
  DeliveryTrackingSignalIngestResultRecord,
  DeliveryTrackingSignalRecord,
  DeliveryVesselAisstreamRefreshRecord,
  DeliveryVesselDetailRecord,
  DeliveryVesselTrackingHealthRecord,
  DeliveryVesselTrackingSignalIngestResultRecord,
  DeliveryTruckMovementRecord,
  DeliveryTruckMovementSummaryRecord,
  DeliveryTruckMovementTrackingHealthRecord,
  DeliveryTruckTrackingExceptionRecord,
  TruckCheckpointCode,
  TruckMovementStatus,
  TruckStopStatus,
  TruckStopType,
} from '../../shared/models'

export type SaveDeliveryActualizationInput = {
  actual_quantity: number
  actualized_at: string
  source?: string | null
  notes?: string | null
}

export type UpdateDeliveryInput = {
  transport_mode?: DeliveryRecord['transport_mode']
  book?: string
  portfolio?: string | null
  counterparty?: string | null
  location_code?: string | null
  delivery_start?: string | null
  delivery_end?: string | null
  execution_status?: DeliveryExecutionStatus
  operations_owner?: string | null
  external_reference?: string | null
  ops_notes?: string | null
  reset_fields?: Array<
    | 'transport_mode'
    | 'book'
    | 'portfolio'
    | 'counterparty'
    | 'location_code'
    | 'delivery_window'
    | 'execution_status'
    | 'operations_owner'
    | 'external_reference'
    | 'ops_notes'
  >
}

export type UpdateDeliveryLogisticsDetailInput = {
  origin_location_code?: string | null
  destination_location_code?: string | null
  incoterm_code?: string | null
  carrier_name?: string | null
  carrier_reference?: string | null
  asset_reference?: string | null
  equipment_type?: string | null
  load_reference?: string | null
  discharge_reference?: string | null
  reset_fields?: Array<
    | 'origin_location_code'
    | 'destination_location_code'
    | 'incoterm_code'
    | 'carrier_name'
    | 'carrier_reference'
    | 'asset_reference'
    | 'equipment_type'
    | 'load_reference'
    | 'discharge_reference'
  >
}

export type UpdateDeliveryPipelineDetailInput = {
  pipeline_system?: string | null
  pipeline_path?: string | null
  receipt_location_code?: string | null
  delivery_location_code?: string | null
  pipeline_contract_number?: string | null
  pipeline_cycle_code?: string | null
  nomination_reference?: string | null
  reset_fields?: Array<
    | 'pipeline_system'
    | 'pipeline_path'
    | 'receipt_location_code'
    | 'delivery_location_code'
    | 'pipeline_contract_number'
    | 'pipeline_cycle_code'
    | 'nomination_reference'
  >
}

export type UpdateDeliveryRailDetailInput = {
  rail_route_code?: string | null
  origin_station_code?: string | null
  destination_station_code?: string | null
  waybill_reference?: string | null
  release_number?: string | null
  unit_train_id?: string | null
  railcar_count?: number | null
  reset_fields?: Array<
    | 'rail_route_code'
    | 'origin_station_code'
    | 'destination_station_code'
    | 'waybill_reference'
    | 'release_number'
    | 'unit_train_id'
    | 'railcar_count'
  >
}

export type UpdateDeliveryPowerDetailInput = {
  market_operator?: string | null
  pricing_node_code?: string | null
  delivery_node_code?: string | null
  profile_code?: string | null
  schedule_reference?: string | null
  interval_minutes?: number | null
  timezone_name?: string | null
  reset_fields?: Array<
    | 'market_operator'
    | 'pricing_node_code'
    | 'delivery_node_code'
    | 'profile_code'
    | 'schedule_reference'
    | 'interval_minutes'
    | 'timezone_name'
  >
}

export type UpdateDeliveryTruckDetailInput = {
  target_run_count?: number | null
  dispatcher_owner?: string | null
  tracking_provider?: string | null
  tracking_policy?: string | null
  default_carrier_name?: string | null
  default_external_carrier_reference?: string | null
  equipment_type?: string | null
  origin_geofence_code?: string | null
  destination_geofence_code?: string | null
}

export type UpdateDeliveryVesselDetailInput = {
  vessel_name?: string | null
  imo_number?: string | null
  mmsi_number?: string | null
  call_sign?: string | null
  voyage_number?: string | null
  tracking_provider?: string | null
  tracking_policy?: string | null
}

export type CreateDeliveryEventInput = {
  event_type: DeliveryEventType
  occurred_at: string
  location_code?: string | null
  reference_code?: string | null
  source?: string | null
  notes?: string | null
}

export type DeliveryTruckStopCreateInput = {
  stop_sequence?: number | null
  stop_type: TruckStopType
  location_code?: string | null
  planned_arrival_start?: string | null
  planned_arrival_end?: string | null
  planned_departure_start?: string | null
  planned_departure_end?: string | null
  appointment_reference?: string | null
  planned_quantity?: number | null
  status?: TruckStopStatus | null
}

export type DeliveryTruckMovementCreateInput = {
  sequence_no: number
  planned_quantity?: number | null
  planned_unit_of_measure?: string | null
  carrier_name?: string | null
  external_carrier_reference?: string | null
  dispatcher_owner?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  tractor_reference?: string | null
  trailer_reference?: string | null
  external_load_reference?: string | null
  bill_of_lading_number?: string | null
  truck_ticket_number?: string | null
  hold_reason_code?: string | null
  status?: Extract<TruckMovementStatus, 'PLANNED' | 'ASSIGNED' | 'ON_HOLD'> | null
  stops: DeliveryTruckStopCreateInput[]
}

export type UpdateDeliveryTruckMovementInput = {
  sequence_no?: number | null
  planned_quantity?: number | null
  planned_unit_of_measure?: string | null
  carrier_name?: string | null
  external_carrier_reference?: string | null
  dispatcher_owner?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  tractor_reference?: string | null
  trailer_reference?: string | null
  external_load_reference?: string | null
  bill_of_lading_number?: string | null
  truck_ticket_number?: string | null
  hold_reason_code?: string | null
  status?: Extract<TruckMovementStatus, 'PLANNED' | 'ASSIGNED' | 'ON_HOLD'> | null
  status_reason?: string | null
}

export type CancelDeliveryTruckMovementInput = {
  cancel_reason: string
}

export type UpdateDeliveryTruckStopInput = {
  stop_sequence?: number | null
  stop_type?: TruckStopType | null
  location_code?: string | null
  planned_arrival_start?: string | null
  planned_arrival_end?: string | null
  planned_departure_start?: string | null
  planned_departure_end?: string | null
  appointment_reference?: string | null
  planned_quantity?: number | null
  actual_quantity?: number | null
  actual_arrived_at?: string | null
  actual_departed_at?: string | null
  status?: TruckStopStatus | null
  status_reason?: string | null
}

export type SkipDeliveryTruckStopInput = {
  skip_reason: string
}

export type CancelDeliveryTruckStopInput = {
  cancel_reason: string
}

export type RecordDeliveryTruckStopCheckpointInput = {
  checkpoint_code: TruckCheckpointCode
  occurred_at: string
  notes?: string | null
}

export type ReverseDeliveryTruckStopCheckpointInput = {
  reversal_reason: string
  reversed_at?: string | null
  notes?: string | null
}

export type DeliveryTrackingSignalCreateInput = {
  source_system?: string | null
  source_event_id?: string | null
  signal_type: string
  occurred_at: string
  received_at?: string | null
  stop_id?: string | null
  latitude?: number | null
  longitude?: number | null
  speed_knots?: number | null
  course_degrees?: number | null
  heading_degrees?: number | null
  draught_meters?: number | null
  location_code?: string | null
  destination?: string | null
  external_status?: string | null
  normalized_status?: string | null
  match_confidence?: number | null
  eta_at_destination?: string | null
  raw_payload?: Record<string, unknown>
}

export type DeliverySyncResult = {
  synced_at: string
  created_count: number
  updated_count: number
  deleted_count: number
  total_count: number
  logistics_count: number
  network_flow_count: number
  power_schedule_count: number
}

function shipmentHeaders(): Headers {
  return buildMutationHeaders()
}

export async function saveDeliveryActualization(
  apiBase: string,
  args: {
    tradeId: string
    legNo?: number | null
    payload: SaveDeliveryActualizationInput
  },
): Promise<unknown> {
  const { tradeId, legNo, payload } = args
  const path =
    legNo === null || legNo === undefined
      ? `${apiBase}/shipments/${tradeId}/actualization`
      : `${apiBase}/shipments/${tradeId}/legs/${legNo}/actualization`

  return putJson(path, payload, {
    headers: shipmentHeaders(),
  })
}

export async function syncDeliveriesFromTrades(apiBase: string): Promise<DeliverySyncResult> {
  return postJson<DeliverySyncResult>(
    `${apiBase}/deliveries/sync-from-trades`,
    {},
    {
      headers: shipmentHeaders(),
    },
  )
}

export async function updateDelivery(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryInput
  },
): Promise<unknown> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryLogisticsDetails(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryLogisticsDetailInput
  },
): Promise<unknown> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}/logistics-details`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryPipelineDetails(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryPipelineDetailInput
  },
): Promise<unknown> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}/pipeline-details`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryPowerDetails(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryPowerDetailInput
  },
): Promise<unknown> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}/power-details`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryTruckDetails(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryTruckDetailInput
  },
): Promise<DeliveryRecord> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}/truck-details`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryVesselDetails(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryVesselDetailInput
  },
): Promise<DeliveryVesselDetailRecord> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}/vessel-detail`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryRailDetails(
  apiBase: string,
  args: {
    deliveryId: string
    payload: UpdateDeliveryRailDetailInput
  },
): Promise<unknown> {
  const { deliveryId, payload } = args

  return patchJson(`${apiBase}/deliveries/${deliveryId}/rail-details`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function getDeliveryVesselDetail(
  apiBase: string,
  deliveryId: string,
): Promise<DeliveryVesselDetailRecord> {
  return fetchJson(`${apiBase}/deliveries/${deliveryId}/vessel-detail`, {
    headers: shipmentHeaders(),
  })
}

export async function getDeliveryVesselTrackingHealth(
  apiBase: string,
  deliveryId: string,
): Promise<DeliveryVesselTrackingHealthRecord> {
  return fetchJson(`${apiBase}/deliveries/${deliveryId}/vessel-tracking-health`, {
    headers: shipmentHeaders(),
  })
}

export async function listDeliveryVesselTrackingSignals(
  apiBase: string,
  deliveryId: string,
): Promise<DeliveryTrackingSignalRecord[]> {
  return fetchJson(`${apiBase}/deliveries/${deliveryId}/vessel-tracking-signals`, {
    headers: shipmentHeaders(),
  })
}

export async function recordDeliveryVesselTrackingSignal(
  apiBase: string,
  args: {
    deliveryId: string
    payload: DeliveryTrackingSignalCreateInput
  },
): Promise<DeliveryVesselTrackingSignalIngestResultRecord> {
  const { deliveryId, payload } = args

  return postJson(`${apiBase}/deliveries/${deliveryId}/vessel-tracking-signals`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function refreshDeliveryVesselTrackingFromAisstream(
  apiBase: string,
  args: {
    deliveryId: string
    timeoutSeconds?: number
  },
): Promise<DeliveryVesselAisstreamRefreshRecord> {
  const { deliveryId, timeoutSeconds } = args
  const params = new URLSearchParams()
  if (timeoutSeconds !== undefined) {
    params.set('timeout_seconds', String(timeoutSeconds))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  return postJson(
    `${apiBase}/deliveries/${deliveryId}/vessel-tracking-signals/aisstream-refresh${suffix}`,
    {},
    {
      headers: shipmentHeaders(),
    },
  )
}

export async function createDeliveryEvent(
  apiBase: string,
  args: {
    deliveryId: string
    payload: CreateDeliveryEventInput
  },
): Promise<unknown> {
  const { deliveryId, payload } = args

  return postJson(`${apiBase}/deliveries/${deliveryId}/events`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function listDeliveryTruckMovements(
  apiBase: string,
  deliveryId: string,
): Promise<DeliveryTruckMovementSummaryRecord[]> {
  return fetchJson(`${apiBase}/deliveries/${deliveryId}/truck-movements`, {
    headers: shipmentHeaders(),
  })
}

export async function getDeliveryTruckMovement(
  apiBase: string,
  movementId: string,
): Promise<DeliveryTruckMovementRecord> {
  return fetchJson(`${apiBase}/truck-movements/${movementId}`, {
    headers: shipmentHeaders(),
  })
}

export async function createDeliveryTruckMovement(
  apiBase: string,
  args: {
    deliveryId: string
    payload: DeliveryTruckMovementCreateInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { deliveryId, payload } = args

  return postJson(`${apiBase}/deliveries/${deliveryId}/truck-movements`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryTruckMovement(
  apiBase: string,
  args: {
    movementId: string
    payload: UpdateDeliveryTruckMovementInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { movementId, payload } = args

  return patchJson(`${apiBase}/truck-movements/${movementId}`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function cancelDeliveryTruckMovement(
  apiBase: string,
  args: {
    movementId: string
    payload: CancelDeliveryTruckMovementInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { movementId, payload } = args

  return postJson(`${apiBase}/truck-movements/${movementId}/cancel`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function createDeliveryTruckStop(
  apiBase: string,
  args: {
    movementId: string
    payload: DeliveryTruckStopCreateInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { movementId, payload } = args

  return postJson(`${apiBase}/truck-movements/${movementId}/stops`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function updateDeliveryTruckStop(
  apiBase: string,
  args: {
    stopId: string
    payload: UpdateDeliveryTruckStopInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { stopId, payload } = args

  return patchJson(`${apiBase}/truck-stops/${stopId}`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function skipDeliveryTruckStop(
  apiBase: string,
  args: {
    stopId: string
    payload: SkipDeliveryTruckStopInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { stopId, payload } = args

  return postJson(`${apiBase}/truck-stops/${stopId}/skip`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function cancelDeliveryTruckStop(
  apiBase: string,
  args: {
    stopId: string
    payload: CancelDeliveryTruckStopInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { stopId, payload } = args

  return postJson(`${apiBase}/truck-stops/${stopId}/cancel`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function recordDeliveryTruckStopCheckpoint(
  apiBase: string,
  args: {
    stopId: string
    payload: RecordDeliveryTruckStopCheckpointInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { stopId, payload } = args

  return postJson(`${apiBase}/truck-stops/${stopId}/checkpoints`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function reverseDeliveryTruckStopCheckpoint(
  apiBase: string,
  args: {
    stopId: string
    eventId: number
    payload: ReverseDeliveryTruckStopCheckpointInput
  },
): Promise<DeliveryTruckMovementRecord> {
  const { stopId, eventId, payload } = args

  return postJson(`${apiBase}/truck-stops/${stopId}/checkpoints/${eventId}/reverse`, payload, {
    headers: shipmentHeaders(),
  })
}

export async function listDeliveryTruckTrackingSignals(
  apiBase: string,
  movementId: string,
): Promise<DeliveryTrackingSignalRecord[]> {
  return fetchJson(`${apiBase}/truck-movements/${movementId}/tracking-signals`, {
    headers: shipmentHeaders(),
  })
}

export async function getDeliveryTruckMovementTrackingHealth(
  apiBase: string,
  movementId: string,
): Promise<DeliveryTruckMovementTrackingHealthRecord> {
  return fetchJson(`${apiBase}/truck-movements/${movementId}/tracking-health`, {
    headers: shipmentHeaders(),
  })
}

export async function listDeliveryTruckTrackingExceptions(
  apiBase: string,
  options?: {
    includeClear?: boolean
    severity?: DeliveryTruckMovementTrackingHealthRecord['exception_severity']
    asOf?: string
    limit?: number
  },
): Promise<DeliveryTruckTrackingExceptionRecord[]> {
  const params = new URLSearchParams()
  if (options?.includeClear) {
    params.set('include_clear', 'true')
  }
  if (options?.severity) {
    params.set('severity', options.severity)
  }
  if (options?.asOf) {
    params.set('as_of', options.asOf)
  }
  if (typeof options?.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  const queryString = params.toString()
  return fetchJson(`${apiBase}/truck-tracking/exceptions${queryString ? `?${queryString}` : ''}`, {
    headers: shipmentHeaders(),
  })
}

export async function recordDeliveryTruckTrackingSignal(
  apiBase: string,
  args: {
    movementId: string
    payload: DeliveryTrackingSignalCreateInput
  },
): Promise<DeliveryTrackingSignalIngestResultRecord> {
  const { movementId, payload } = args

  return postJson(`${apiBase}/truck-movements/${movementId}/tracking-signals`, payload, {
    headers: shipmentHeaders(),
  })
}
