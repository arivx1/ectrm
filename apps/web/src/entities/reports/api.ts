import { fetchJson } from '../../shared/api'
import type {
  ActivitySummaryRow,
  CashForecastReport,
  ExposureSummaryRow,
  PnlHistoryReport,
  ReportingOverview,
  SettlementExceptionReport,
  SettlementAgingReport,
} from '../../shared/models'

type LoadPnlHistoryReportOptions = {
  book?: string
  commodityClass?: string
  dateFrom?: string
  dateTo?: string
}

export async function loadPnlHistoryReport(
  apiBase: string,
  options: LoadPnlHistoryReportOptions = {},
): Promise<PnlHistoryReport> {
  const params = new URLSearchParams()
  if (options.book) {
    params.set('book', options.book)
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
  })
}

export async function loadReportingOverview(apiBase: string): Promise<ReportingOverview> {
  return fetchJson<ReportingOverview>(`${apiBase}/reports/overview`, {
    cache: 'no-store',
  })
}

export async function loadExposureSummary(apiBase: string): Promise<ExposureSummaryRow[]> {
  return fetchJson<ExposureSummaryRow[]>(`${apiBase}/reports/exposure-summary`, {
    cache: 'no-store',
  })
}

export async function loadActivitySummary(apiBase: string): Promise<ActivitySummaryRow[]> {
  return fetchJson<ActivitySummaryRow[]>(`${apiBase}/reports/activity-summary`, {
    cache: 'no-store',
  })
}

export async function loadSettlementAgingReport(apiBase: string): Promise<SettlementAgingReport> {
  return fetchJson<SettlementAgingReport>(`${apiBase}/reports/settlement-aging`, {
    cache: 'no-store',
  })
}

export async function loadCashForecastReport(apiBase: string): Promise<CashForecastReport> {
  return fetchJson<CashForecastReport>(`${apiBase}/reports/cash-forecast`, {
    cache: 'no-store',
  })
}

export async function loadSettlementExceptionReport(apiBase: string): Promise<SettlementExceptionReport> {
  return fetchJson<SettlementExceptionReport>(`${apiBase}/reports/settlement-exceptions`, {
    cache: 'no-store',
  })
}
