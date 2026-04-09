import type {
  UpdateDeliveryInput,
  UpdateDeliveryLogisticsDetailInput,
  UpdateDeliveryPipelineDetailInput,
  UpdateDeliveryPowerDetailInput,
} from '../../entities/shipments/api'
import type { DeliveryFieldSource, DeliveryRecord } from '../../shared/models'

export type LogisticsResetField = NonNullable<UpdateDeliveryLogisticsDetailInput['reset_fields']>[number]
export type PipelineResetField = NonNullable<UpdateDeliveryPipelineDetailInput['reset_fields']>[number]
export type PowerResetField = NonNullable<UpdateDeliveryPowerDetailInput['reset_fields']>[number]
export type SharedDeliveryResetField = NonNullable<UpdateDeliveryInput['reset_fields']>[number]

type SharedDeliveryResetSource = DeliveryFieldSource | DeliveryRecord['transport_mode_source']

export type LogisticsResetOption = {
  field: LogisticsResetField
  label: string
  source: DeliveryFieldSource | null
}

export type PipelineResetOption = {
  field: PipelineResetField
  label: string
  source: DeliveryFieldSource | null
}

export type PowerResetOption = {
  field: PowerResetField
  label: string
  source: DeliveryFieldSource | null
}

export type SharedDeliveryResetOption = {
  field: SharedDeliveryResetField
  label: string
  source: SharedDeliveryResetSource
}

export type LogisticsDetailDraft = {
  originLocationCode: string
  destinationLocationCode: string
  incotermCode: string
  carrierName: string
  carrierReference: string
  assetReference: string
  equipmentType: string
  loadReference: string
  dischargeReference: string
}

export type PipelineDetailDraft = {
  pipelineSystem: string
  pipelinePath: string
  receiptLocationCode: string
  deliveryLocationCode: string
  pipelineContractNumber: string
  pipelineCycleCode: string
  nominationReference: string
}

export type PowerDetailDraft = {
  marketOperator: string
  pricingNodeCode: string
  deliveryNodeCode: string
  profileCode: string
  scheduleReference: string
  intervalMinutes: string
  timezoneName: string
}

export function normalizedNullableText(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

export function buildSharedDeliveryResetOptions(delivery: DeliveryRecord): SharedDeliveryResetOption[] {
  const options: SharedDeliveryResetOption[] = []

  if (delivery.transport_mode_source === 'EXPLICIT') {
    options.push({
      field: 'transport_mode',
      label: 'Transport Mode',
      source: delivery.transport_mode_source,
    })
  }
  if (delivery.book_source === 'MANUAL') {
    options.push({ field: 'book', label: 'Book', source: delivery.book_source })
  }
  if (delivery.portfolio_source === 'MANUAL') {
    options.push({ field: 'portfolio', label: 'Portfolio', source: delivery.portfolio_source })
  }
  if (delivery.counterparty_source === 'MANUAL') {
    options.push({ field: 'counterparty', label: 'Counterparty', source: delivery.counterparty_source })
  }
  if (delivery.location_source === 'MANUAL') {
    options.push({ field: 'location_code', label: 'Location', source: delivery.location_source })
  }
  if (delivery.delivery_window_source === 'MANUAL') {
    options.push({
      field: 'delivery_window',
      label: 'Window',
      source: delivery.delivery_window_source,
    })
  }
  if (delivery.execution_status_source === 'MANUAL') {
    options.push({
      field: 'execution_status',
      label: 'Execution Status',
      source: delivery.execution_status_source,
    })
  }
  if (delivery.operations_owner_source === 'MANUAL') {
    options.push({
      field: 'operations_owner',
      label: 'Operations Owner',
      source: delivery.operations_owner_source,
    })
  }
  if (delivery.external_reference_source === 'MANUAL') {
    options.push({
      field: 'external_reference',
      label: 'External Ref',
      source: delivery.external_reference_source,
    })
  }
  if (delivery.ops_notes_source === 'MANUAL') {
    options.push({
      field: 'ops_notes',
      label: 'Ops Notes',
      source: delivery.ops_notes_source,
    })
  }

  return options
}

export function buildLogisticsDetailDraft(delivery: DeliveryRecord): LogisticsDetailDraft {
  return {
    originLocationCode: delivery.origin_location_code ?? '',
    destinationLocationCode: delivery.destination_location_code ?? '',
    incotermCode: delivery.incoterm_code ?? '',
    carrierName: delivery.carrier_name ?? '',
    carrierReference: delivery.carrier_reference ?? '',
    assetReference: delivery.asset_reference ?? '',
    equipmentType: delivery.equipment_type ?? '',
    loadReference: delivery.load_reference ?? '',
    dischargeReference: delivery.discharge_reference ?? '',
  }
}

export function buildPipelineDetailDraft(delivery: DeliveryRecord): PipelineDetailDraft {
  return {
    pipelineSystem: delivery.pipeline_system ?? '',
    pipelinePath: delivery.pipeline_path ?? '',
    receiptLocationCode: delivery.receipt_location_code ?? '',
    deliveryLocationCode: delivery.delivery_location_code ?? '',
    pipelineContractNumber: delivery.pipeline_contract_number ?? '',
    pipelineCycleCode: delivery.pipeline_cycle_code ?? '',
    nominationReference: delivery.nomination_reference ?? '',
  }
}

export function buildPowerDetailDraft(delivery: DeliveryRecord): PowerDetailDraft {
  return {
    marketOperator: delivery.market_operator ?? '',
    pricingNodeCode: delivery.pricing_node_code ?? '',
    deliveryNodeCode: delivery.delivery_node_code ?? '',
    profileCode: delivery.profile_code ?? '',
    scheduleReference: delivery.schedule_reference ?? '',
    intervalMinutes: delivery.interval_minutes === null ? '' : String(delivery.interval_minutes),
    timezoneName: delivery.timezone_name ?? '',
  }
}

export function buildLogisticsDetailPayload(
  delivery: DeliveryRecord,
  draft: LogisticsDetailDraft,
): { payload: UpdateDeliveryLogisticsDetailInput; hasChanges: boolean } {
  const payload: UpdateDeliveryLogisticsDetailInput = {}
  const originLocationCode = normalizedNullableText(draft.originLocationCode)
  const destinationLocationCode = normalizedNullableText(draft.destinationLocationCode)
  const incotermCode = normalizedNullableText(draft.incotermCode)
  const carrierName = normalizedNullableText(draft.carrierName)
  const carrierReference = normalizedNullableText(draft.carrierReference)
  const assetReference = normalizedNullableText(draft.assetReference)
  const equipmentType = normalizedNullableText(draft.equipmentType)
  const loadReference = normalizedNullableText(draft.loadReference)
  const dischargeReference = normalizedNullableText(draft.dischargeReference)

  if (originLocationCode !== delivery.origin_location_code) {
    payload.origin_location_code = originLocationCode
  }
  if (destinationLocationCode !== delivery.destination_location_code) {
    payload.destination_location_code = destinationLocationCode
  }
  if (incotermCode !== delivery.incoterm_code) {
    payload.incoterm_code = incotermCode
  }
  if (carrierName !== delivery.carrier_name) {
    payload.carrier_name = carrierName
  }
  if (carrierReference !== delivery.carrier_reference) {
    payload.carrier_reference = carrierReference
  }
  if (assetReference !== delivery.asset_reference) {
    payload.asset_reference = assetReference
  }
  if (equipmentType !== delivery.equipment_type) {
    payload.equipment_type = equipmentType
  }
  if (loadReference !== delivery.load_reference) {
    payload.load_reference = loadReference
  }
  if (dischargeReference !== delivery.discharge_reference) {
    payload.discharge_reference = dischargeReference
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
  }
}

export function buildPipelineDetailPayload(
  delivery: DeliveryRecord,
  draft: PipelineDetailDraft,
): { payload: UpdateDeliveryPipelineDetailInput; hasChanges: boolean } {
  const payload: UpdateDeliveryPipelineDetailInput = {}
  const pipelineSystem = normalizedNullableText(draft.pipelineSystem)
  const pipelinePath = normalizedNullableText(draft.pipelinePath)
  const receiptLocationCode = normalizedNullableText(draft.receiptLocationCode)
  const deliveryLocationCode = normalizedNullableText(draft.deliveryLocationCode)
  const pipelineContractNumber = normalizedNullableText(draft.pipelineContractNumber)
  const pipelineCycleCode = normalizedNullableText(draft.pipelineCycleCode)
  const nominationReference = normalizedNullableText(draft.nominationReference)

  if (pipelineSystem !== delivery.pipeline_system) {
    payload.pipeline_system = pipelineSystem
  }
  if (pipelinePath !== delivery.pipeline_path) {
    payload.pipeline_path = pipelinePath
  }
  if (receiptLocationCode !== delivery.receipt_location_code) {
    payload.receipt_location_code = receiptLocationCode
  }
  if (deliveryLocationCode !== delivery.delivery_location_code) {
    payload.delivery_location_code = deliveryLocationCode
  }
  if (pipelineContractNumber !== delivery.pipeline_contract_number) {
    payload.pipeline_contract_number = pipelineContractNumber
  }
  if (pipelineCycleCode !== delivery.pipeline_cycle_code) {
    payload.pipeline_cycle_code = pipelineCycleCode
  }
  if (nominationReference !== delivery.nomination_reference) {
    payload.nomination_reference = nominationReference
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
  }
}

export function buildPowerDetailPayload(
  delivery: DeliveryRecord,
  draft: PowerDetailDraft,
): {
  payload: UpdateDeliveryPowerDetailInput
  hasChanges: boolean
  validationMessage: string | null
} {
  const payload: UpdateDeliveryPowerDetailInput = {}
  const marketOperator = normalizedNullableText(draft.marketOperator)
  const pricingNodeCode = normalizedNullableText(draft.pricingNodeCode)
  const deliveryNodeCode = normalizedNullableText(draft.deliveryNodeCode)
  const profileCode = normalizedNullableText(draft.profileCode)
  const scheduleReference = normalizedNullableText(draft.scheduleReference)
  const timezoneName = normalizedNullableText(draft.timezoneName)
  const normalizedInterval = draft.intervalMinutes.trim()
  let intervalMinutes: number | null = null

  if (normalizedInterval) {
    if (!/^\d+$/.test(normalizedInterval)) {
      return {
        payload,
        hasChanges: false,
        validationMessage: 'Interval minutes must be a positive whole number.',
      }
    }

    intervalMinutes = Number(normalizedInterval)
    if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
      return {
        payload,
        hasChanges: false,
        validationMessage: 'Interval minutes must be a positive whole number.',
      }
    }
  }

  if (marketOperator !== delivery.market_operator) {
    payload.market_operator = marketOperator
  }
  if (pricingNodeCode !== delivery.pricing_node_code) {
    payload.pricing_node_code = pricingNodeCode
  }
  if (deliveryNodeCode !== delivery.delivery_node_code) {
    payload.delivery_node_code = deliveryNodeCode
  }
  if (profileCode !== delivery.profile_code) {
    payload.profile_code = profileCode
  }
  if (scheduleReference !== delivery.schedule_reference) {
    payload.schedule_reference = scheduleReference
  }
  if (intervalMinutes !== delivery.interval_minutes) {
    payload.interval_minutes = intervalMinutes
  }
  if (timezoneName !== delivery.timezone_name) {
    payload.timezone_name = timezoneName
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
    validationMessage: null,
  }
}

export function buildLogisticsResetOptions(delivery: DeliveryRecord): LogisticsResetOption[] {
  const options: LogisticsResetOption[] = []

  if (delivery.origin_location_code_source === 'MANUAL') {
    options.push({ field: 'origin_location_code', label: 'Origin', source: delivery.origin_location_code_source })
  }
  if (delivery.destination_location_code_source === 'MANUAL') {
    options.push({
      field: 'destination_location_code',
      label: 'Destination',
      source: delivery.destination_location_code_source,
    })
  }
  if (delivery.incoterm_code_source === 'MANUAL') {
    options.push({ field: 'incoterm_code', label: 'Incoterm', source: delivery.incoterm_code_source })
  }
  if (delivery.carrier_name_source === 'MANUAL') {
    options.push({ field: 'carrier_name', label: 'Carrier', source: delivery.carrier_name_source })
  }
  if (delivery.carrier_reference_source === 'MANUAL') {
    options.push({
      field: 'carrier_reference',
      label: 'Carrier Ref',
      source: delivery.carrier_reference_source,
    })
  }
  if (delivery.asset_reference_source === 'MANUAL') {
    options.push({ field: 'asset_reference', label: 'Asset Ref', source: delivery.asset_reference_source })
  }
  if (delivery.equipment_type_source === 'MANUAL') {
    options.push({ field: 'equipment_type', label: 'Equipment', source: delivery.equipment_type_source })
  }
  if (delivery.load_reference_source === 'MANUAL') {
    options.push({ field: 'load_reference', label: 'Load Ref', source: delivery.load_reference_source })
  }
  if (delivery.discharge_reference_source === 'MANUAL') {
    options.push({
      field: 'discharge_reference',
      label: 'Discharge Ref',
      source: delivery.discharge_reference_source,
    })
  }

  return options
}

export function buildPipelineResetOptions(delivery: DeliveryRecord): PipelineResetOption[] {
  const options: PipelineResetOption[] = []

  if (delivery.pipeline_system_source === 'MANUAL') {
    options.push({ field: 'pipeline_system', label: 'System', source: delivery.pipeline_system_source })
  }
  if (delivery.pipeline_path_source === 'MANUAL') {
    options.push({ field: 'pipeline_path', label: 'Path', source: delivery.pipeline_path_source })
  }
  if (delivery.receipt_location_code_source === 'MANUAL') {
    options.push({
      field: 'receipt_location_code',
      label: 'Receipt',
      source: delivery.receipt_location_code_source,
    })
  }
  if (delivery.delivery_location_code_source === 'MANUAL') {
    options.push({
      field: 'delivery_location_code',
      label: 'Delivery',
      source: delivery.delivery_location_code_source,
    })
  }
  if (delivery.pipeline_contract_number_source === 'MANUAL') {
    options.push({
      field: 'pipeline_contract_number',
      label: 'Contract',
      source: delivery.pipeline_contract_number_source,
    })
  }
  if (delivery.pipeline_cycle_code_source === 'MANUAL') {
    options.push({
      field: 'pipeline_cycle_code',
      label: 'Cycle',
      source: delivery.pipeline_cycle_code_source,
    })
  }
  if (delivery.nomination_reference_source === 'MANUAL') {
    options.push({
      field: 'nomination_reference',
      label: 'Nomination Ref',
      source: delivery.nomination_reference_source,
    })
  }

  return options
}

export function buildPowerResetOptions(delivery: DeliveryRecord): PowerResetOption[] {
  const options: PowerResetOption[] = []

  if (delivery.market_operator_source === 'MANUAL') {
    options.push({ field: 'market_operator', label: 'Market Operator', source: delivery.market_operator_source })
  }
  if (delivery.pricing_node_code_source === 'MANUAL') {
    options.push({
      field: 'pricing_node_code',
      label: 'Pricing Node',
      source: delivery.pricing_node_code_source,
    })
  }
  if (delivery.delivery_node_code_source === 'MANUAL') {
    options.push({
      field: 'delivery_node_code',
      label: 'Delivery Node',
      source: delivery.delivery_node_code_source,
    })
  }
  if (delivery.profile_code_source === 'MANUAL') {
    options.push({ field: 'profile_code', label: 'Profile', source: delivery.profile_code_source })
  }
  if (delivery.schedule_reference_source === 'MANUAL') {
    options.push({
      field: 'schedule_reference',
      label: 'Schedule Ref',
      source: delivery.schedule_reference_source,
    })
  }
  if (delivery.interval_minutes_source === 'MANUAL') {
    options.push({
      field: 'interval_minutes',
      label: 'Interval',
      source: delivery.interval_minutes_source,
    })
  }
  if (delivery.timezone_name_source === 'MANUAL') {
    options.push({ field: 'timezone_name', label: 'Timezone', source: delivery.timezone_name_source })
  }

  return options
}
