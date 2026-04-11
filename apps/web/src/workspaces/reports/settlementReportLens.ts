import type {
  SettlementReportFilterOptions,
  SettlementReportFilters as ApiSettlementReportFilters,
  SettlementReportPresetRecord,
} from '../../shared/models'
import { uniqueSorted } from './reportUtils'

export type SettlementReportLensFilters = {
  book: string
  counterparty: string
  currency: string
  exceptionType: string
  severity: string
}

export type SettlementReportPreset = {
  presetId: number | null
  name: string
  scope: 'PERSONAL' | 'SHARED'
  filters: SettlementReportLensFilters
  canEdit: boolean
  updatedAt: string | null
  updatedBy: string | null
}

export type SettlementReportFilterCatalog = {
  books: string[]
  counterparties: string[]
  currencies: string[]
  exceptionTypes: string[]
  severities: string[]
}

export const ALL_FILTER_VALUE = 'ALL'

const REPORT_FILTER_STORAGE_KEY = 'ectrm.reports.settlement-filters.v1'
const REPORT_PRESET_STORAGE_KEY = 'ectrm.reports.settlement-presets.v1'

export const DEFAULT_SETTLEMENT_REPORT_FILTERS: SettlementReportLensFilters = {
  book: ALL_FILTER_VALUE,
  counterparty: ALL_FILTER_VALUE,
  currency: ALL_FILTER_VALUE,
  exceptionType: ALL_FILTER_VALUE,
  severity: ALL_FILTER_VALUE,
}

export function normalizeSettlementReportFilters(value: unknown): SettlementReportLensFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_SETTLEMENT_REPORT_FILTERS
  }

  const candidate = value as Record<string, unknown>
  const rawExceptionType =
    typeof candidate.exceptionType === 'string'
      ? candidate.exceptionType
      : typeof candidate.exception_type === 'string'
        ? candidate.exception_type
        : null

  return {
    book: typeof candidate.book === 'string' && candidate.book.trim() ? candidate.book.trim() : ALL_FILTER_VALUE,
    counterparty:
      typeof candidate.counterparty === 'string' && candidate.counterparty.trim()
        ? candidate.counterparty.trim()
        : ALL_FILTER_VALUE,
    currency:
      typeof candidate.currency === 'string' && candidate.currency.trim()
        ? candidate.currency.trim().toUpperCase()
        : ALL_FILTER_VALUE,
    exceptionType: rawExceptionType && rawExceptionType.trim() ? rawExceptionType.trim().toUpperCase() : ALL_FILTER_VALUE,
    severity:
      typeof candidate.severity === 'string' && candidate.severity.trim()
        ? candidate.severity.trim().toLowerCase()
        : ALL_FILTER_VALUE,
  }
}

export function readStoredSettlementReportFilters(): SettlementReportLensFilters {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTLEMENT_REPORT_FILTERS
  }

  try {
    const rawValue = window.localStorage.getItem(REPORT_FILTER_STORAGE_KEY)
    return rawValue ? normalizeSettlementReportFilters(JSON.parse(rawValue)) : DEFAULT_SETTLEMENT_REPORT_FILTERS
  } catch {
    return DEFAULT_SETTLEMENT_REPORT_FILTERS
  }
}

export function writeStoredSettlementReportFilters(filters: SettlementReportLensFilters) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(REPORT_FILTER_STORAGE_KEY, JSON.stringify(filters))
}

export function readStoredSettlementReportPresets(): SettlementReportPreset[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(REPORT_PRESET_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          return null
        }

        const candidate = row as Record<string, unknown>
        const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
        if (!name) {
          return null
        }

        return {
          presetId:
            typeof candidate.presetId === 'number'
              ? candidate.presetId
              : typeof candidate.preset_id === 'number'
                ? candidate.preset_id
                : null,
          name,
          scope: candidate.scope === 'SHARED' ? 'SHARED' : 'PERSONAL',
          filters: normalizeSettlementReportFilters(candidate.filters),
          canEdit: candidate.canEdit === false || candidate.can_edit === false ? false : true,
          updatedAt:
            typeof candidate.updatedAt === 'string'
              ? candidate.updatedAt
              : typeof candidate.updated_at === 'string'
                ? candidate.updated_at
                : null,
          updatedBy:
            typeof candidate.updatedBy === 'string'
              ? candidate.updatedBy
              : typeof candidate.updated_by === 'string'
                ? candidate.updated_by
                : null,
        } satisfies SettlementReportPreset
      })
      .filter((row): row is SettlementReportPreset => Boolean(row))
  } catch {
    return []
  }
}

export function writeStoredSettlementReportPresets(presets: SettlementReportPreset[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(REPORT_PRESET_STORAGE_KEY, JSON.stringify(presets))
}

export function toApiSettlementReportFilters(filters: SettlementReportLensFilters): ApiSettlementReportFilters {
  return {
    book: filters.book !== ALL_FILTER_VALUE ? filters.book : undefined,
    counterparty: filters.counterparty !== ALL_FILTER_VALUE ? filters.counterparty : undefined,
    currency: filters.currency !== ALL_FILTER_VALUE ? filters.currency : undefined,
    exception_type: filters.exceptionType !== ALL_FILTER_VALUE ? filters.exceptionType : undefined,
    severity: filters.severity !== ALL_FILTER_VALUE ? (filters.severity as 'blocked' | 'in-progress') : undefined,
  }
}

export function fromApiSettlementReportFilters(
  filters: ApiSettlementReportFilters | null | undefined,
): SettlementReportLensFilters {
  return {
    book: filters?.book ?? ALL_FILTER_VALUE,
    counterparty: filters?.counterparty ?? ALL_FILTER_VALUE,
    currency: filters?.currency ?? ALL_FILTER_VALUE,
    exceptionType: filters?.exception_type ?? ALL_FILTER_VALUE,
    severity: filters?.severity ?? ALL_FILTER_VALUE,
  }
}

export function fromApiSettlementReportPreset(record: SettlementReportPresetRecord): SettlementReportPreset {
  return {
    presetId: record.preset_id,
    name: record.name,
    scope: record.scope,
    filters: fromApiSettlementReportFilters(record.filters),
    canEdit: record.can_edit,
    updatedAt: record.updated_at,
    updatedBy: record.updated_by,
  }
}

export function sortSettlementReportPresets(presets: SettlementReportPreset[]): SettlementReportPreset[] {
  return [...presets].sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === 'SHARED' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

export function filtersEqual(left: SettlementReportLensFilters, right: SettlementReportLensFilters): boolean {
  return (
    left.book === right.book &&
    left.counterparty === right.counterparty &&
    left.currency === right.currency &&
    left.exceptionType === right.exceptionType &&
    left.severity === right.severity
  )
}

export function sanitizeFilters(
  filters: SettlementReportLensFilters,
  options: SettlementReportFilterCatalog,
): SettlementReportLensFilters {
  return {
    book: filters.book !== ALL_FILTER_VALUE && !options.books.includes(filters.book) ? ALL_FILTER_VALUE : filters.book,
    counterparty:
      filters.counterparty !== ALL_FILTER_VALUE && !options.counterparties.includes(filters.counterparty)
        ? ALL_FILTER_VALUE
        : filters.counterparty,
    currency:
      filters.currency !== ALL_FILTER_VALUE && !options.currencies.includes(filters.currency)
        ? ALL_FILTER_VALUE
        : filters.currency,
    exceptionType:
      filters.exceptionType !== ALL_FILTER_VALUE && !options.exceptionTypes.includes(filters.exceptionType)
        ? ALL_FILTER_VALUE
        : filters.exceptionType,
    severity:
      filters.severity !== ALL_FILTER_VALUE && !options.severities.includes(filters.severity)
        ? ALL_FILTER_VALUE
        : filters.severity,
  }
}

export function mergeSettlementFilterCatalog(args: {
  apiOptions: SettlementReportFilterOptions | null
  fallbackOptions: SettlementReportFilterCatalog
  filters: SettlementReportLensFilters
}): SettlementReportFilterCatalog {
  const { apiOptions, fallbackOptions, filters } = args

  return {
    books: uniqueSorted([
      ...(apiOptions?.books ?? []),
      ...fallbackOptions.books,
      filters.book !== ALL_FILTER_VALUE ? filters.book : null,
    ]),
    counterparties: uniqueSorted([
      ...(apiOptions?.counterparties ?? []),
      ...fallbackOptions.counterparties,
      filters.counterparty !== ALL_FILTER_VALUE ? filters.counterparty : null,
    ]),
    currencies: uniqueSorted([
      ...(apiOptions?.currencies ?? []),
      ...fallbackOptions.currencies,
      filters.currency !== ALL_FILTER_VALUE ? filters.currency : null,
    ]),
    exceptionTypes: uniqueSorted([
      ...(apiOptions?.exception_types ?? []),
      ...fallbackOptions.exceptionTypes,
      filters.exceptionType !== ALL_FILTER_VALUE ? filters.exceptionType : null,
    ]),
    severities: uniqueSorted([
      ...(apiOptions?.severities ?? []),
      ...fallbackOptions.severities,
      filters.severity !== ALL_FILTER_VALUE ? filters.severity : null,
    ]),
  }
}

export function settlementFilterChips(filters: SettlementReportLensFilters): string[] {
  const chips: string[] = []
  if (filters.book !== ALL_FILTER_VALUE) {
    chips.push(`Book ${filters.book}`)
  }
  if (filters.counterparty !== ALL_FILTER_VALUE) {
    chips.push(`Counterparty ${filters.counterparty}`)
  }
  if (filters.currency !== ALL_FILTER_VALUE) {
    chips.push(`Currency ${filters.currency}`)
  }
  if (filters.exceptionType !== ALL_FILTER_VALUE) {
    chips.push(filters.exceptionType.replaceAll('_', ' '))
  }
  if (filters.severity !== ALL_FILTER_VALUE) {
    chips.push(filters.severity === 'blocked' ? 'Blocked only' : 'In-progress only')
  }
  return chips
}

export function isSettlementFilterActive(filters: SettlementReportLensFilters): boolean {
  return Object.values(filters).some((value) => value !== ALL_FILTER_VALUE)
}
