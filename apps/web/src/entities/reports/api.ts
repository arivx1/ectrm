import { fetchJson, patchJson, postJson, requestOk } from '../../shared/api'
import type {
  ActivitySummaryRow,
  CashForecastReport,
  ExposureSummaryRow,
  PnlComparisonReport,
  PnlHistoryReport,
  ReportingOverview,
  SettlementReportFilterOptions,
  SettlementReportFilters,
  SettlementReportPresetRecord,
  SettlementExceptionReport,
  SettlementAgingReport,
} from '../../shared/models'

type LoadPnlHistoryReportOptions = {
  asOf?: string
  book?: string
  portfolio?: string
  commodityClass?: string
  dateFrom?: string
  dateTo?: string
}

type LoadSettlementReportOptions = SettlementReportFilters & {
  asOf?: string
}

type LoadCashForecastReportOptions = LoadSettlementReportOptions & {
  horizonDays?: number
}

type SettlementReportPresetScope = 'PERSONAL' | 'SHARED'

type CreateSettlementReportPresetPayload = {
  name: string
  scope: SettlementReportPresetScope
  filters: SettlementReportFilters
}

type UpdateSettlementReportPresetPayload = {
  name?: string
  scope?: SettlementReportPresetScope
  filters?: SettlementReportFilters
}

function authorizationHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

function authenticatedRequestInit(accessToken?: string): RequestInit | undefined {
  if (!accessToken) {
    return undefined
  }

  return {
    headers: authorizationHeaders(accessToken),
  }
}

function buildSettlementReportParams(options: LoadSettlementReportOptions = {}): URLSearchParams {
  const params = new URLSearchParams()
  if (options.asOf) {
    params.set('as_of', options.asOf)
  }
  if (options.book) {
    params.set('book', options.book)
  }
  if (options.counterparty) {
    params.set('counterparty', options.counterparty)
  }
  if (options.currency) {
    params.set('currency', options.currency)
  }
  if (options.exception_type) {
    params.set('exception_type', options.exception_type)
  }
  if (options.severity) {
    params.set('severity', options.severity)
  }

  return params
}

function buildSettlementReportQueryString(options: LoadSettlementReportOptions = {}): string {
  const params = buildSettlementReportParams(options)
  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

export async function loadPnlHistoryReport(
  apiBase: string,
  options: LoadPnlHistoryReportOptions = {},
  accessToken?: string,
): Promise<PnlHistoryReport> {
  const params = new URLSearchParams()
  if (options.asOf) {
    params.set('as_of', options.asOf)
  }
  if (options.book) {
    params.set('book', options.book)
  }
  if (options.portfolio) {
    params.set('portfolio', options.portfolio)
  }
  if (options.commodityClass) {
    params.set('commodity_class', options.commodityClass)
  }
  if (options.dateFrom) {
    params.set('date_from', options.dateFrom)
  }
  if (options.dateTo) {
    params.set('date_to', options.dateTo)
  }

  const queryString = params.toString()
  return fetchJson<PnlHistoryReport>(`${apiBase}/reports/pnl-history${queryString ? `?${queryString}` : ''}`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadPnlComparisonReport(
  apiBase: string,
  options: {
    fromAsOf: string
    toAsOf: string
    portfolio?: string
    book?: string
    commodityClass?: string
  },
  accessToken?: string,
): Promise<PnlComparisonReport> {
  const params = new URLSearchParams()
  params.set('from_as_of', options.fromAsOf)
  params.set('to_as_of', options.toAsOf)
  if (options.portfolio) {
    params.set('portfolio', options.portfolio)
  }
  if (options.book) {
    params.set('book', options.book)
  }
  if (options.commodityClass) {
    params.set('commodity_class', options.commodityClass)
  }

  return fetchJson<PnlComparisonReport>(`${apiBase}/reports/pnl-compare?${params.toString()}`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadReportingOverview(apiBase: string, accessToken?: string): Promise<ReportingOverview> {
  return fetchJson<ReportingOverview>(`${apiBase}/reports/overview`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadExposureSummary(apiBase: string, accessToken?: string): Promise<ExposureSummaryRow[]> {
  return fetchJson<ExposureSummaryRow[]>(`${apiBase}/reports/exposure-summary`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadActivitySummary(apiBase: string, accessToken?: string): Promise<ActivitySummaryRow[]> {
  return fetchJson<ActivitySummaryRow[]>(`${apiBase}/reports/activity-summary`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadSettlementAgingReport(
  apiBase: string,
  options: LoadSettlementReportOptions = {},
  accessToken?: string,
): Promise<SettlementAgingReport> {
  return fetchJson<SettlementAgingReport>(`${apiBase}/reports/settlement-aging${buildSettlementReportQueryString(options)}`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadCashForecastReport(
  apiBase: string,
  options: LoadCashForecastReportOptions = {},
  accessToken?: string,
): Promise<CashForecastReport> {
  const params = buildSettlementReportParams(options)
  if (options.horizonDays) {
    params.set('horizon_days', String(options.horizonDays))
  }

  const queryString = params.toString()
  return fetchJson<CashForecastReport>(`${apiBase}/reports/cash-forecast${queryString ? `?${queryString}` : ''}`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadSettlementExceptionReport(
  apiBase: string,
  options: LoadSettlementReportOptions = {},
  accessToken?: string,
): Promise<SettlementExceptionReport> {
  return fetchJson<SettlementExceptionReport>(`${apiBase}/reports/settlement-exceptions${buildSettlementReportQueryString(options)}`, {
    cache: 'no-store',
    ...authenticatedRequestInit(accessToken),
  })
}

export async function loadSettlementReportFilterOptions(
  apiBase: string,
  options: Pick<LoadSettlementReportOptions, 'asOf'> = {},
  accessToken?: string,
): Promise<SettlementReportFilterOptions> {
  return fetchJson<SettlementReportFilterOptions>(
    `${apiBase}/reports/settlement-filter-options${buildSettlementReportQueryString(options)}`,
    {
      cache: 'no-store',
      ...authenticatedRequestInit(accessToken),
    },
  )
}

export async function loadSettlementReportPresets(
  apiBase: string,
  accessToken: string,
): Promise<SettlementReportPresetRecord[]> {
  return fetchJson<SettlementReportPresetRecord[]>(`${apiBase}/reports/settlement-presets`, {
    headers: authorizationHeaders(accessToken),
    cache: 'no-store',
  })
}

export async function createSettlementReportPreset(
  apiBase: string,
  accessToken: string,
  payload: CreateSettlementReportPresetPayload,
): Promise<SettlementReportPresetRecord> {
  return postJson<SettlementReportPresetRecord>(`${apiBase}/reports/settlement-presets`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function updateSettlementReportPreset(
  apiBase: string,
  accessToken: string,
  presetId: number,
  payload: UpdateSettlementReportPresetPayload,
): Promise<SettlementReportPresetRecord> {
  return patchJson<SettlementReportPresetRecord>(`${apiBase}/reports/settlement-presets/${presetId}`, payload, {
    headers: authorizationHeaders(accessToken),
  })
}

export async function deleteSettlementReportPreset(
  apiBase: string,
  accessToken: string,
  presetId: number,
): Promise<void> {
  await requestOk(`${apiBase}/reports/settlement-presets/${presetId}`, {
    method: 'DELETE',
    headers: authorizationHeaders(accessToken),
  })
}
