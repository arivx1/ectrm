import { loadPnlHistoryReport } from '../../entities/reports/api'
import { appConfig } from '../../shared/config'
import type { PnlHistoryReport } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

export type DashboardPnlHistoryFilters = {
  book: string
  commodityClass: string
  dateFrom: string
  dateTo: string
}

export async function loadDashboardPnlHistory(
  filters: DashboardPnlHistoryFilters,
  authSession: StoredAuthSession | null,
): Promise<PnlHistoryReport> {
  return loadPnlHistoryReport(
    appConfig.apiBase,
    {
      book: filters.book || undefined,
      commodityClass: filters.commodityClass || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    },
    authSession?.accessToken,
  )
}
