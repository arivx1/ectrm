import { ApiError } from '../../shared/api'
import { appConfig } from '../../shared/config'
import type { StoredAuthSession } from '../../shared/mutation'
import type { Trade, TradeWorkflowItemRecord } from '../../shared/models'
import { buildTradeCreditHoldSummary } from '../../shared/trading'

export type ExternalDataSyncProvider =
  | 'EIA'
  | 'EIA_FUNDAMENTALS'
  | 'FRED'
  | 'BLS_PPI'
  | 'WORLD_BANK'
  | 'USDA_NASS'
  | 'EIA_WHOLESALE_POWER'
  | 'CFTC'
  | 'CAISO'
  | 'ERCOT'
  | 'MISO'
  | 'NYISO'
  | 'KALSHI'

export function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

export function sessionHeaders(session: StoredAuthSession): Headers {
  return new Headers({ Authorization: `Bearer ${session.accessToken}` })
}

function creditApprovalItemsByTradeId(items: TradeWorkflowItemRecord[]): Map<string, TradeWorkflowItemRecord> {
  return new Map(
    items
      .filter((item) => item.workflow_type === 'CREDIT_APPROVAL')
      .map((item) => [item.trade_id, item] as const),
  )
}

export function decorateTradesWithWorkflowItems(rows: Trade[], items: TradeWorkflowItemRecord[]): Trade[] {
  const itemsByTradeId = creditApprovalItemsByTradeId(items)

  return rows.map((trade) => ({
    ...trade,
    active_credit_exception: itemsByTradeId.get(trade.trade_id)?.active_credit_exception ?? null,
    ...buildTradeCreditHoldSummary(itemsByTradeId.get(trade.trade_id)),
  }))
}

export function decorateWorkflowItems(rows: TradeWorkflowItemRecord[]): TradeWorkflowItemRecord[] {
  const itemsByTradeId = creditApprovalItemsByTradeId(rows)

  return rows.map((item) => ({
    ...item,
    active_credit_exception: itemsByTradeId.get(item.trade_id)?.active_credit_exception ?? null,
    ...buildTradeCreditHoldSummary(itemsByTradeId.get(item.trade_id)),
  }))
}

export function apiReachabilityMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }

  return `Could not reach API. Make sure backend is running on ${appConfig.apiDisplayHost} and CORS is enabled.`
}

export function isAuthenticationError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || /authentication is required|session expired|unauthorized/i.test(error.message)
  }

  if (error instanceof Error) {
    return /authentication is required|session expired|unauthorized/i.test(error.message)
  }

  return false
}
