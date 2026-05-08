import { patchJson, postJson, putJson } from '../../shared/api'
import { buildMutationHeaders } from '../../shared/mutation'
import type { DeliveryEventType, DeliveryExecutionStatus, DeliveryRecord } from '../../shared/models'

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

export type CreateDeliveryEventInput = {
  event_type: DeliveryEventType
  occurred_at: string
  location_code?: string | null
  reference_code?: string | null
  source?: string | null
  notes?: string | null
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
