import {
  getAppRouteHandoffFilterValue,
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
} from '../../shared/appRouteHandoff'

export const PRICE_INDEX_BI_REPORT_ID = 'reports-price-bi'
export const PRICE_INDEX_BI_REPORT_TITLE = 'Price Dashboard'

type PriceIndexBiReportHandoffInput = {
  priceIndexCode: string
  priceIndexName?: string | null
}

export function buildPriceIndexBiReportHandoff({
  priceIndexCode,
  priceIndexName = null,
}: PriceIndexBiReportHandoffInput): AppRouteHandoff {
  const normalizedCode = priceIndexCode.trim().toUpperCase()
  const priceIndexLabel = priceIndexName?.trim() || normalizedCode

  return {
    source: 'home',
    tradeId: `${PRICE_INDEX_BI_REPORT_ID}:${normalizedCode}`,
    focus: {
      type: 'report',
      id: PRICE_INDEX_BI_REPORT_ID,
      label: PRICE_INDEX_BI_REPORT_TITLE,
    },
    tradeInspectorTab: null,
    eventType: null,
    label: `Open ${priceIndexLabel} price dashboard`,
    rationale:
      'The Home price card opened the reusable price dashboard filtered to this price index so the analyst can review price observations without creating a separate page per curve.',
    filter: normalizedCode,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  }
}

export function resolvePriceIndexBiReportFilter(handoff: AppRouteHandoff | null | undefined): string | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  if (
    normalizedHandoff?.source !== 'home' ||
    normalizedHandoff?.focus.type !== 'report' ||
    normalizedHandoff.focus.id !== PRICE_INDEX_BI_REPORT_ID
  ) {
    return null
  }

  return getAppRouteHandoffFilterValue(normalizedHandoff)
}
