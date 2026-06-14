import type { PriceIndexObservationRecord } from '../../shared/models'

export type PriceReportObservationSortField =
  | 'observationDateTime'
  | 'price'
  | 'frequency'
  | 'revision'
  | 'source'
  | 'downloaded'

export type PriceReportObservationSortDirection = 'asc' | 'desc'

export type PriceReportObservationSortState = {
  field: PriceReportObservationSortField
  direction: PriceReportObservationSortDirection
}

export type PriceReportObservationTableHeader = {
  field: PriceReportObservationSortField
  label: string
}

export const PRICE_REPORT_OBSERVATION_TABLE_HEADERS: PriceReportObservationTableHeader[] = [
  { field: 'observationDateTime', label: 'Observation Date/Time' },
  { field: 'price', label: 'Price' },
  { field: 'frequency', label: 'Frequency' },
  { field: 'revision', label: 'Revision' },
  { field: 'source', label: 'Source' },
  { field: 'downloaded', label: 'Downloaded' },
]

export const PRICE_REPORT_INITIAL_OBSERVATION_SORT: PriceReportObservationSortState = {
  field: 'observationDateTime',
  direction: 'desc',
}

const PRICE_REPORT_OBSERVATION_FIELD_SET = new Set<PriceReportObservationSortField>(
  PRICE_REPORT_OBSERVATION_TABLE_HEADERS.map((header) => header.field),
)

export const PRICE_REPORT_DEFAULT_COLUMN_ORDER: PriceReportObservationSortField[] =
  PRICE_REPORT_OBSERVATION_TABLE_HEADERS.map((header) => header.field)

export function isPriceReportObservationField(value: string): value is PriceReportObservationSortField {
  return PRICE_REPORT_OBSERVATION_FIELD_SET.has(value as PriceReportObservationSortField)
}

export function getPriceReportObservationHeader(
  field: PriceReportObservationSortField,
): PriceReportObservationTableHeader {
  return (
    PRICE_REPORT_OBSERVATION_TABLE_HEADERS.find((header) => header.field === field) ??
    PRICE_REPORT_OBSERVATION_TABLE_HEADERS[0]
  )
}

export function normalizePriceReportObservationColumns(
  fields: PriceReportObservationSortField[],
): PriceReportObservationSortField[] {
  const normalizedFields: PriceReportObservationSortField[] = []
  for (const field of fields) {
    if (!normalizedFields.includes(field) && isPriceReportObservationField(field)) {
      normalizedFields.push(field)
    }
  }

  return normalizedFields.length > 0 ? normalizedFields : [...PRICE_REPORT_DEFAULT_COLUMN_ORDER]
}

export function hiddenPriceReportObservationColumns(
  visibleFields: PriceReportObservationSortField[],
): PriceReportObservationSortField[] {
  const visibleFieldSet = new Set(normalizePriceReportObservationColumns(visibleFields))
  return PRICE_REPORT_DEFAULT_COLUMN_ORDER.filter((field) => !visibleFieldSet.has(field))
}

export function movePriceReportObservationColumn(
  visibleFields: PriceReportObservationSortField[],
  draggedField: PriceReportObservationSortField,
  targetField: PriceReportObservationSortField,
): PriceReportObservationSortField[] {
  const normalizedFields = normalizePriceReportObservationColumns(visibleFields)
  if (draggedField === targetField) {
    return normalizedFields
  }

  const withoutDraggedField = normalizedFields.filter((field) => field !== draggedField)
  const targetIndex = withoutDraggedField.indexOf(targetField)
  if (targetIndex < 0) {
    return normalizedFields.includes(draggedField)
      ? normalizedFields
      : [...withoutDraggedField, draggedField]
  }

  const nextFields = [...withoutDraggedField]
  nextFields.splice(targetIndex, 0, draggedField)
  return nextFields
}

export function hidePriceReportObservationColumn(
  visibleFields: PriceReportObservationSortField[],
  field: PriceReportObservationSortField,
): PriceReportObservationSortField[] {
  const normalizedFields = normalizePriceReportObservationColumns(visibleFields)
  if (normalizedFields.length <= 1) {
    return normalizedFields
  }

  return normalizedFields.filter((visibleField) => visibleField !== field)
}

export function showPriceReportObservationColumn(
  visibleFields: PriceReportObservationSortField[],
  field: PriceReportObservationSortField,
  targetField?: PriceReportObservationSortField,
): PriceReportObservationSortField[] {
  const normalizedFields = normalizePriceReportObservationColumns(visibleFields)
  if (normalizedFields.includes(field)) {
    return targetField ? movePriceReportObservationColumn(normalizedFields, field, targetField) : normalizedFields
  }

  if (!targetField) {
    return [...normalizedFields, field]
  }

  const targetIndex = normalizedFields.indexOf(targetField)
  if (targetIndex < 0) {
    return [...normalizedFields, field]
  }

  const nextFields = [...normalizedFields]
  nextFields.splice(targetIndex, 0, field)
  return nextFields
}

function formatPriceObservationTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

function formatPriceObservationUtcTime(value: Date): string {
  return [
    formatPriceObservationTimePart(value.getUTCHours()),
    formatPriceObservationTimePart(value.getUTCMinutes()),
    formatPriceObservationTimePart(value.getUTCSeconds()),
  ].join(':')
}

function formatPriceObservationClockTime(value: string): string | null {
  const normalizedValue = value.trim()
  const compactTimeMatch = /^(\d{1,2})(\d{2})$/.exec(normalizedValue)
  if (!compactTimeMatch) {
    return null
  }

  const hour = Number.parseInt(compactTimeMatch[1], 10)
  const minute = Number.parseInt(compactTimeMatch[2], 10)
  if (hour > 23 || minute > 59) {
    return null
  }

  return `${formatPriceObservationTimePart(hour)}:${formatPriceObservationTimePart(minute)}:00`
}

function parsePriceObservationTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp
}

function parsePriceObservationIsoRevision(value: string): Date | null {
  const isoTimestampMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value.trim())
  return isoTimestampMatch?.[1] ? parsePriceObservationTimestamp(`${isoTimestampMatch[1]}Z`) : null
}

function parsePriceObservationDeliveryRevision(value: string): Date | null {
  const deliveryTimestampMatch = /(?:^|:)delivery:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value.trim())
  return deliveryTimestampMatch?.[1] ? parsePriceObservationTimestamp(`${deliveryTimestampMatch[1]}Z`) : null
}

function formatPriceObservationRevisionTime(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    return null
  }

  const deliveryRevisionTimestamp = parsePriceObservationDeliveryRevision(normalizedValue)
  if (deliveryRevisionTimestamp) {
    return formatPriceObservationUtcTime(deliveryRevisionTimestamp)
  }

  const isoRevisionTimestamp = parsePriceObservationIsoRevision(normalizedValue)
  if (isoRevisionTimestamp) {
    return formatPriceObservationUtcTime(isoRevisionTimestamp)
  }

  const caisoMatch = /^\d{4}-\d{2}-\d{2}:HE(\d{2}):I(\d{2})$/i.exec(normalizedValue)
  if (caisoMatch) {
    return `HE${caisoMatch[1]} I${caisoMatch[2]}`
  }

  const ercotMatch = /^\d{4}-\d{2}-\d{2}:IE(.+)$/i.exec(normalizedValue)
  if (ercotMatch?.[1]) {
    return formatPriceObservationClockTime(ercotMatch[1]) ?? ercotMatch[1].trim()
  }

  return null
}

export function formatPriceObservationDateTime(
  observation: PriceIndexObservationRecord,
  formatDateOnly: (value: string | null | undefined) => string,
): string {
  const observationDate = formatDateOnly(observation.observation_date)
  const observationTime = formatPriceObservationRevisionTime(observation.source_revision)
  return observationTime ? `${observationDate} ${observationTime}` : observationDate
}

function defaultPriceReportObservationSortDirection(
  field: PriceReportObservationSortField,
): PriceReportObservationSortDirection {
  return field === 'observationDateTime' || field === 'price' || field === 'downloaded'
    ? 'desc'
    : 'asc'
}

export function nextPriceReportObservationSortState(
  currentSort: PriceReportObservationSortState,
  field: PriceReportObservationSortField,
): PriceReportObservationSortState {
  if (currentSort.field !== field) {
    return {
      field,
      direction: defaultPriceReportObservationSortDirection(field),
    }
  }

  return {
    field,
    direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
  }
}

function priceObservationDateSortValue(value: string): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dateMatch) {
    const [, year, month, day] = dateMatch
    return Date.UTC(Number(year), Number(month) - 1, Number(day))
  }

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime()
}

function priceObservationRevisionTimeSortSeconds(value: string | null | undefined): number {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    return 0
  }

  const deliveryRevisionTimestamp = parsePriceObservationDeliveryRevision(normalizedValue)
  const isoRevisionTimestamp = deliveryRevisionTimestamp ?? parsePriceObservationIsoRevision(normalizedValue)
  if (isoRevisionTimestamp) {
    return (
      isoRevisionTimestamp.getUTCHours() * 60 * 60 +
      isoRevisionTimestamp.getUTCMinutes() * 60 +
      isoRevisionTimestamp.getUTCSeconds()
    )
  }

  const caisoMatch = /^\d{4}-\d{2}-\d{2}:HE(\d{2}):I(\d{2})$/i.exec(normalizedValue)
  if (caisoMatch) {
    return Number(caisoMatch[1]) * 60 * 60 + Number(caisoMatch[2])
  }

  const ercotMatch = /^\d{4}-\d{2}-\d{2}:IE(.+)$/i.exec(normalizedValue)
  const ercotClockTime = ercotMatch?.[1] ? formatPriceObservationClockTime(ercotMatch[1]) : null
  if (ercotClockTime) {
    const [hour, minute, second] = ercotClockTime.split(':').map((part) => Number.parseInt(part, 10))
    return hour * 60 * 60 + minute * 60 + second
  }

  return 0
}

function priceObservationDateTimeSortValue(observation: PriceIndexObservationRecord): number {
  return (
    priceObservationDateSortValue(observation.observation_date) +
    priceObservationRevisionTimeSortSeconds(observation.source_revision) * 1000
  )
}

function priceObservationTextSortValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function priceObservationSortValue(
  observation: PriceIndexObservationRecord,
  field: PriceReportObservationSortField,
): string | number {
  switch (field) {
    case 'observationDateTime':
      return priceObservationDateTimeSortValue(observation)
    case 'price':
      return observation.value
    case 'frequency':
      return priceObservationTextSortValue(observation.source_frequency)
    case 'revision':
      return priceObservationTextSortValue(observation.source_revision)
    case 'source':
      return priceObservationTextSortValue(`${observation.source_provider} ${observation.source_series_id}`)
    case 'downloaded': {
      const downloadedAt = parsePriceObservationTimestamp(observation.downloaded_at)
      return downloadedAt?.getTime() ?? 0
    }
    default:
      return 0
  }
}

export function sortPriceReportObservations(
  observations: PriceIndexObservationRecord[],
  sortState: PriceReportObservationSortState,
): PriceIndexObservationRecord[] {
  return [...observations].sort((left, right) => {
    const leftValue = priceObservationSortValue(left, sortState.field)
    const rightValue = priceObservationSortValue(right, sortState.field)
    const directionMultiplier = sortState.direction === 'asc' ? 1 : -1

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      const numericComparison = leftValue - rightValue
      if (Math.abs(numericComparison) > 0.0001) {
        return numericComparison * directionMultiplier
      }
    } else {
      const textComparison = String(leftValue).localeCompare(String(rightValue))
      if (textComparison !== 0) {
        return textComparison * directionMultiplier
      }
    }

    return (right.id - left.id) * directionMultiplier
  })
}

export function priceReportObservationAriaSort(
  sortState: PriceReportObservationSortState,
  field: PriceReportObservationSortField,
): 'ascending' | 'descending' | 'none' {
  if (sortState.field !== field) {
    return 'none'
  }

  return sortState.direction === 'asc' ? 'ascending' : 'descending'
}
