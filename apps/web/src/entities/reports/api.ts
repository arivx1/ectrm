import { fetchJson } from '../../shared/api'
import type { PnlHistoryReport } from '../../shared/models'

export async function loadPnlHistoryReport(apiBase: string): Promise<PnlHistoryReport> {
  return fetchJson<PnlHistoryReport>(`${apiBase}/reports/pnl-history`, {
    cache: 'no-store',
  })
}
