import { parseRequiredNumber } from '../../shared/format'
import type { EventRow, Trade, TradeLegDraft } from '../../shared/models'
import {
  pricingTypeRequiresExplicitPrice,
  pricingTypeRequiresPriceIndex,
  tradeFormDefaults,
  tradeStructureRequiresTopLevelVolume,
  tradeStructureSupportsLegs,
} from '../../shared/trading'
import { parseLegsFromPayload } from './tradeDraftUtils'

export type TradeEditorValues = {
  tradeId?: string
  externalTradeId: string
  sourceSystem: string
  executionTimestamp: string
  tradeDate: string
  effectiveStartDate: string
  effectiveEndDate: string
  qualitySpec: string
  unitOfMeasure: string
  tradeCurrencyCode: string
  locationCode: string
  deliveryStart: string
  deliveryEnd: string
  priceUnitCode: string
  tradeNature: string
  tradeStructure: string
  tradeSide: string
  book: string
  portfolio: string
  counterparty: string
  commodityClass: string
  commodity: string
  pricingType: string
  pricingStatus: string
  priceIndexCode: string
  priceInput: string
  volumeInput: string
  settlementStatus: string
  traderUser: string
  legs: TradeLegDraft[]
}

type NormalizedTradeLeg = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: number
}

type NormalizedTradeValues = {
  tradeId: string
  externalTradeId: string | null
  sourceSystem: string | null
  executionTimestamp: string | null
  tradeDate: string | null
  effectiveStartDate: string | null
  effectiveEndDate: string | null
  qualitySpec: string | null
  unitOfMeasure: string | null
  tradeCurrencyCode: string | null
  locationCode: string | null
  deliveryStart: string | null
  deliveryEnd: string | null
  priceUnitCode: string | null
  tradeNature: string
  tradeStructure: string
  tradeSide: string | null
  book: string
  portfolio: string | null
  counterparty: string | null
  commodityClass: string
  commodity: string
  pricingType: string
  pricingStatus: string
  priceIndexCode: string | null
  price: number | null
  volume: number | null
  settlementStatus: string
  traderUser: string | null
  legs: NormalizedTradeLeg[]
}

type PreparedTradeSubmission = {
  tradeId: string
  payload: Record<string, unknown>
  validationError: string | null
}

type PreparedTradeAmendment = {
  payload: Record<string, unknown>
  changedFields: string[]
  validationError: string | null
}

const TRADE_FIELD_LABELS = {
  external_trade_id: 'External Trade ID',
  source_system: 'Source System',
  execution_timestamp: 'Execution Time',
  trade_date: 'Trade Date',
  effective_start_date: 'Effective Start',
  effective_end_date: 'Effective End',
  quality_spec: 'Quality Spec',
  unit_of_measure: 'Quantity Unit',
  trade_currency_code: 'Trade Currency',
  location_code: 'Location',
  delivery_start: 'Delivery Start',
  delivery_end: 'Delivery End',
  price_unit_code: 'Price Unit',
  trade_nature: 'Nature',
  trade_structure: 'Structure',
  trade_side: 'Side',
  book: 'Book',
  portfolio: 'Portfolio',
  counterparty: 'Counterparty',
  commodity_class: 'Commodity Class',
  commodity: 'Commodity',
  pricing_type: 'Pricing Type',
  pricing_status: 'Pricing Status',
  price_index_code: 'Price Index',
  price: 'Price Differential',
  volume: 'Volume',
  settlement_status: 'Settlement Status',
  trader_user: 'Trader User',
  legs: 'Swap Legs',
} as const

export function buildSuggestedTradeId(now: Date = new Date()): string {
  const pad = (segment: number) => String(segment).padStart(2, '0')
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const randomPart = crypto.randomUUID().slice(0, 8).toUpperCase()
  return `T-${datePart}-${randomPart}`
}

export function getPersistedTradeLegs(selectedTradeEvents: EventRow[]): TradeLegDraft[] {
  for (const event of selectedTradeEvents) {
    if (event.event_type !== 'TradeAmended' && event.event_type !== 'TradeCreated') {
      continue
    }

    const parsedLegs = parseLegsFromPayload(event.payload)
    if (parsedLegs.length > 0) {
      return parsedLegs
    }
  }

  return []
}

export function buildCreateTradeSubmission(values: TradeEditorValues): PreparedTradeSubmission {
  const tradeId = values.tradeId?.trim() || buildSuggestedTradeId()
  const normalizedValues = normalizeTradeValues({ ...values, tradeId })
  const validationError = validateTradeValues(normalizedValues, values)

  return {
    tradeId,
    payload: buildTradePayload(normalizedValues),
    validationError,
  }
}

export function previewTradeAmendment(
  selectedTrade: Trade,
  selectedTradeEvents: EventRow[],
  values: TradeEditorValues,
): PreparedTradeAmendment {
  const normalizedValues = normalizeTradeValues({
    ...values,
    tradeId: selectedTrade.trade_id,
  })

  return buildTradeAmendment(selectedTrade, selectedTradeEvents, normalizedValues)
}

export function buildAmendTradeSubmission(
  selectedTrade: Trade,
  selectedTradeEvents: EventRow[],
  values: TradeEditorValues,
): PreparedTradeAmendment {
  const normalizedValues = normalizeTradeValues({
    ...values,
    tradeId: selectedTrade.trade_id,
  })
  const validationError = validateTradeValues(normalizedValues, values)
  const amendment = buildTradeAmendment(selectedTrade, selectedTradeEvents, normalizedValues)

  if (validationError) {
    return {
      ...amendment,
      validationError,
    }
  }

  if (amendment.changedFields.length === 0) {
    return {
      ...amendment,
      validationError: 'No changes are staged for this amendment.',
    }
  }

  return amendment
}

function buildTradeAmendment(
  selectedTrade: Trade,
  selectedTradeEvents: EventRow[],
  values: NormalizedTradeValues,
): PreparedTradeAmendment {
  const payload: Record<string, unknown> = {}
  const changedFields: string[] = []
  const currentSwapLegs = getPersistedTradeLegs(selectedTradeEvents)
  const nextSupportsLegs = tradeStructureSupportsLegs(values.tradeStructure)
  const currentSupportsLegs = tradeStructureSupportsLegs(selectedTrade.trade_structure)

  compareField(payload, changedFields, 'external_trade_id', values.externalTradeId, selectedTrade.external_trade_id)
  compareField(payload, changedFields, 'source_system', values.sourceSystem, selectedTrade.source_system)
  compareField(
    payload,
    changedFields,
    'execution_timestamp',
    values.executionTimestamp,
    normalizeExistingExecutionTimestamp(selectedTrade.execution_timestamp),
  )
  compareField(payload, changedFields, 'trade_date', values.tradeDate, selectedTrade.trade_date)
  compareField(
    payload,
    changedFields,
    'effective_start_date',
    values.effectiveStartDate,
    selectedTrade.effective_start_date,
  )
  compareField(
    payload,
    changedFields,
    'effective_end_date',
    values.effectiveEndDate,
    selectedTrade.effective_end_date,
  )
  compareField(payload, changedFields, 'quality_spec', values.qualitySpec, selectedTrade.quality_spec)
  compareField(payload, changedFields, 'unit_of_measure', values.unitOfMeasure, selectedTrade.unit_of_measure)
  compareField(
    payload,
    changedFields,
    'trade_currency_code',
    values.tradeCurrencyCode,
    selectedTrade.trade_currency_code,
  )
  compareField(payload, changedFields, 'location_code', values.locationCode, selectedTrade.location_code)
  compareField(payload, changedFields, 'delivery_start', values.deliveryStart, selectedTrade.delivery_start)
  compareField(payload, changedFields, 'delivery_end', values.deliveryEnd, selectedTrade.delivery_end)
  compareField(payload, changedFields, 'price_unit_code', values.priceUnitCode, selectedTrade.price_unit_code)
  compareField(payload, changedFields, 'trade_nature', values.tradeNature, selectedTrade.trade_nature)
  compareField(payload, changedFields, 'trade_structure', values.tradeStructure, selectedTrade.trade_structure)

  if (nextSupportsLegs) {
    if (!currentSupportsLegs) {
      payload.trade_side = null
      changedFields.push(TRADE_FIELD_LABELS.trade_side)
    }
  } else if (
    !valuesEqual(
      values.tradeSide,
      currentSupportsLegs ? null : (selectedTrade.trade_side ?? tradeFormDefaults.side),
    )
  ) {
    payload.trade_side = values.tradeSide
    changedFields.push(TRADE_FIELD_LABELS.trade_side)
  }

  compareField(payload, changedFields, 'book', values.book, selectedTrade.book)
  compareField(payload, changedFields, 'portfolio', values.portfolio, selectedTrade.portfolio)
  compareField(payload, changedFields, 'counterparty', values.counterparty, selectedTrade.counterparty)
  compareField(payload, changedFields, 'commodity_class', values.commodityClass, selectedTrade.commodity_class)
  compareField(payload, changedFields, 'commodity', values.commodity, selectedTrade.commodity)
  compareField(payload, changedFields, 'pricing_type', values.pricingType, selectedTrade.pricing_type)
  compareField(payload, changedFields, 'pricing_status', values.pricingStatus, selectedTrade.pricing_status)
  compareField(payload, changedFields, 'price_index_code', values.priceIndexCode, selectedTrade.price_index_code)
  compareField(payload, changedFields, 'price', values.price, selectedTrade.price)
  compareField(payload, changedFields, 'volume', values.volume, selectedTrade.volume)
  compareField(payload, changedFields, 'settlement_status', values.settlementStatus, selectedTrade.settlement_status)
  compareField(payload, changedFields, 'trader_user', values.traderUser, selectedTrade.trader_user)

  if (nextSupportsLegs) {
    const normalizedCurrentLegs = normalizeExistingLegs(currentSwapLegs)
    if (!legsEqual(values.legs, normalizedCurrentLegs)) {
      payload.legs = values.legs.map((leg) => ({ ...leg }))
      changedFields.push(TRADE_FIELD_LABELS.legs)
    }
  }

  return {
    payload,
    changedFields: dedupeChangedFields(changedFields),
    validationError: null,
  }
}

function buildTradePayload(values: NormalizedTradeValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    external_trade_id: values.externalTradeId,
    source_system: values.sourceSystem,
    execution_timestamp: values.executionTimestamp,
    trade_date: values.tradeDate,
    effective_start_date: values.effectiveStartDate,
    effective_end_date: values.effectiveEndDate,
    quality_spec: values.qualitySpec,
    unit_of_measure: values.unitOfMeasure,
    trade_currency_code: values.tradeCurrencyCode,
    location_code: values.locationCode,
    delivery_start: values.deliveryStart,
    delivery_end: values.deliveryEnd,
    price_unit_code: values.priceUnitCode,
    trade_nature: values.tradeNature,
    trade_structure: values.tradeStructure,
    book: values.book,
    portfolio: values.portfolio,
    counterparty: values.counterparty,
    commodity_class: values.commodityClass,
    commodity: values.commodity,
    pricing_type: values.pricingType,
    pricing_status: values.pricingStatus,
    price: values.price,
    volume: values.volume,
    settlement_status: values.settlementStatus,
    trader_user: values.traderUser,
  }

  if (tradeStructureSupportsLegs(values.tradeStructure)) {
    payload.legs = values.legs.map((leg) => ({ ...leg }))
  } else {
    payload.trade_side = values.tradeSide
  }

  if (values.priceIndexCode !== null) {
    payload.price_index_code = values.priceIndexCode
  }

  return payload
}

function compareField(
  payload: Record<string, unknown>,
  changedFields: string[],
  key: keyof typeof TRADE_FIELD_LABELS,
  nextValue: string | number | null,
  currentValue: string | number | null,
) {
  if (valuesEqual(nextValue, currentValue)) {
    return
  }

  payload[key] = nextValue
  changedFields.push(TRADE_FIELD_LABELS[key])
}

function normalizeTradeValues(values: TradeEditorValues): NormalizedTradeValues {
  const normalizedLegs = normalizeDraftLegs(values.legs)
  const legsDriveTrade = tradeStructureSupportsLegs(values.tradeStructure)
  const primaryLeg = normalizedLegs[0]

  return {
    tradeId: values.tradeId?.trim() || '',
    externalTradeId: normalizeOptionalText(values.externalTradeId),
    sourceSystem: normalizeOptionalUppercaseText(values.sourceSystem),
    executionTimestamp: normalizeOptionalDateTimeInput(values.executionTimestamp),
    tradeDate: normalizeOptionalDateInput(values.tradeDate),
    effectiveStartDate: normalizeOptionalDateInput(values.effectiveStartDate),
    effectiveEndDate: normalizeOptionalDateInput(values.effectiveEndDate),
    qualitySpec: normalizeOptionalText(values.qualitySpec),
    unitOfMeasure: normalizeOptionalUppercaseText(values.unitOfMeasure),
    tradeCurrencyCode: normalizeOptionalUppercaseText(values.tradeCurrencyCode),
    locationCode: normalizeOptionalUppercaseText(values.locationCode),
    deliveryStart: normalizeOptionalDateInput(values.deliveryStart),
    deliveryEnd: normalizeOptionalDateInput(values.deliveryEnd),
    priceUnitCode: normalizeOptionalUppercaseText(values.priceUnitCode),
    tradeNature: values.tradeNature,
    tradeStructure: values.tradeStructure,
    tradeSide: legsDriveTrade ? null : values.tradeSide,
    book: values.book,
    portfolio: normalizeOptionalText(values.portfolio),
    counterparty: normalizeOptionalUppercaseText(values.counterparty),
    commodityClass: legsDriveTrade ? (primaryLeg?.commodity_class ?? values.commodityClass) : values.commodityClass,
    commodity: legsDriveTrade ? (primaryLeg?.commodity ?? values.commodity.trim()) : values.commodity.trim(),
    pricingType: values.pricingType,
    pricingStatus: values.pricingStatus,
    priceIndexCode: normalizeOptionalUppercaseText(values.priceIndexCode),
    price: parseRequiredNumber(values.priceInput),
    volume: legsDriveTrade ? null : parseRequiredNumber(values.volumeInput),
    settlementStatus: values.settlementStatus,
    traderUser: normalizeOptionalText(values.traderUser),
    legs: normalizedLegs,
  }
}

function validateTradeValues(values: NormalizedTradeValues, rawValues: TradeEditorValues): string | null {
  if (!values.tradeId) {
    return 'Trade ID could not be generated. Please try again.'
  }
  if (!values.book || !values.commodityClass || !values.commodity) {
    return 'Book, commodity class, and commodity are required.'
  }
  if (
    rawValues.executionTimestamp.trim() !== '' &&
    values.executionTimestamp === rawValues.executionTimestamp.trim()
  ) {
    return 'Execution timestamp must be a valid date and time.'
  }
  if (rawValues.tradeDate.trim() !== '' && !isValidDateOnlyInput(rawValues.tradeDate)) {
    return 'Trade date must be a valid date.'
  }
  if (
    rawValues.effectiveStartDate.trim() !== '' &&
    !isValidDateOnlyInput(rawValues.effectiveStartDate)
  ) {
    return 'Effective start date must be a valid date.'
  }
  if (
    rawValues.effectiveEndDate.trim() !== '' &&
    !isValidDateOnlyInput(rawValues.effectiveEndDate)
  ) {
    return 'Effective end date must be a valid date.'
  }
  if (rawValues.deliveryStart.trim() !== '' && !isValidDateOnlyInput(rawValues.deliveryStart)) {
    return 'Delivery start must be a valid date.'
  }
  if (rawValues.deliveryEnd.trim() !== '' && !isValidDateOnlyInput(rawValues.deliveryEnd)) {
    return 'Delivery end must be a valid date.'
  }
  if (rawValues.priceInput.trim() !== '' && values.price === null) {
    return 'Price Differential must be a valid number.'
  }
  if (rawValues.volumeInput.trim() !== '' && values.volume === null) {
    return 'Volume must be a valid number.'
  }
  if (pricingTypeRequiresExplicitPrice(values.pricingType) && values.price === null) {
    return 'Price Differential is required when pricing type is FIXED or HYBRID.'
  }
  if (pricingTypeRequiresPriceIndex(values.pricingType) && values.priceIndexCode === null) {
    return 'Price index is required when pricing type is INDEX or HYBRID.'
  }
  if (
    tradeStructureRequiresTopLevelVolume(values.tradeStructure) &&
    values.volume === null
  ) {
    return 'Volume is required for single-leg trades.'
  }
  if (
    values.effectiveStartDate !== null &&
    values.effectiveEndDate !== null &&
    values.effectiveEndDate < values.effectiveStartDate
  ) {
    return 'Effective end date must be on or after effective start date.'
  }
  if (
    values.deliveryStart !== null &&
    values.deliveryEnd !== null &&
    values.deliveryEnd < values.deliveryStart
  ) {
    return 'Delivery end must be on or after delivery start.'
  }

  if (!tradeStructureSupportsLegs(values.tradeStructure)) {
    return null
  }

  const completedLegCount = values.legs.length
  const hasPartialLeg = rawValues.legs.some(isPartiallyCompletedLeg)
  if (completedLegCount < 2 || hasPartialLeg) {
    return 'Swap trades require at least two complete legs.'
  }

  return null
}

function normalizeDraftLegs(legs: TradeLegDraft[]): NormalizedTradeLeg[] {
  return legs
    .map((leg, index) => ({
      leg_no: index + 1,
      side: leg.side,
      commodity_class: leg.commodity_class,
      commodity: leg.commodity,
      volume: parseRequiredNumber(leg.volume),
    }))
    .filter((leg): leg is NormalizedTradeLeg => leg.volume !== null && leg.commodity_class !== '' && leg.commodity !== '')
}

function normalizeExistingLegs(legs: TradeLegDraft[]): NormalizedTradeLeg[] {
  return legs
    .map((leg, index) => ({
      leg_no: index + 1,
      side: leg.side,
      commodity_class: leg.commodity_class,
      commodity: leg.commodity,
      volume: parseRequiredNumber(leg.volume),
    }))
    .filter((leg): leg is NormalizedTradeLeg => leg.volume !== null && leg.commodity_class !== '' && leg.commodity !== '')
}

function isPartiallyCompletedLeg(leg: TradeLegDraft): boolean {
  const hasCommodityClass = leg.commodity_class.trim() !== ''
  const hasCommodity = leg.commodity.trim() !== ''
  const hasVolume = leg.volume.trim() !== ''

  return hasCommodityClass || hasCommodity || hasVolume
    ? !(hasCommodityClass && hasCommodity && parseRequiredNumber(leg.volume) !== null)
    : false
}

function normalizeOptionalText(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

function normalizeOptionalUppercaseText(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  return normalized || null
}

function normalizeOptionalDateTimeInput(value: string): string | null {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  const parsedValue = new Date(trimmedValue)
  if (Number.isNaN(parsedValue.getTime())) {
    return trimmedValue
  }

  return parsedValue.toISOString()
}

function normalizeOptionalDateInput(value: string): string | null {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }

  return trimmedValue
}

function normalizeExistingExecutionTimestamp(value: string | null): string | null {
  if (!value) {
    return null
  }

  const parsedValue = new Date(value)
  if (Number.isNaN(parsedValue.getTime())) {
    return value
  }

  return parsedValue.toISOString()
}

function isValidDateOnlyInput(value: string): boolean {
  const trimmedValue = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue)
  if (!match) {
    return false
  }

  const [, yearSegment, monthSegment, daySegment] = match
  const year = Number(yearSegment)
  const month = Number(monthSegment)
  const day = Number(daySegment)
  const parsedValue = new Date(Date.UTC(year, month - 1, day))

  return (
    !Number.isNaN(parsedValue.getTime()) &&
    parsedValue.getUTCFullYear() === year &&
    parsedValue.getUTCMonth() === month - 1 &&
    parsedValue.getUTCDate() === day
  )
}

function valuesEqual(
  left: string | number | null,
  right: string | number | null,
): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    return Number(left) === Number(right)
  }

  return left === right
}

function legsEqual(left: NormalizedTradeLeg[], right: NormalizedTradeLeg[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((leg, index) => {
    const candidate = right[index]
    return (
      candidate !== undefined &&
      leg.leg_no === candidate.leg_no &&
      leg.side === candidate.side &&
      leg.commodity_class === candidate.commodity_class &&
      leg.commodity === candidate.commodity &&
      leg.volume === candidate.volume
    )
  })
}

function dedupeChangedFields(values: string[]): string[] {
  return Array.from(new Set(values))
}
