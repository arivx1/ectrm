import { fetchJson } from '../../shared/api'
import type { PnlHistoryReport } from '../../shared/models'

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
