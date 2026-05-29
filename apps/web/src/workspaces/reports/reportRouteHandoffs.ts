import {
  getAppRouteHandoffFilterValue,
  normalizeAppRouteHandoff,
  type AppRouteHandoff,
} from '../../shared/appRouteHandoff'

export const PRICE_INDEX_BI_REPORT_ID = 'reports-price-bi'
export const PRICE_INDEX_BI_REPORT_TITLE = 'Price Report'

type PriceIndexBiReportHandoffInput = {
  priceIndexCode: string
  priceIndexName?: string | null
  product?: string | null
  location?: string | null
  dateTime?: string | null
  source?: string | null
}

function normalizePriceReportTitlePart(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim()
  if (!trimmedValue) {
    return null
  }

  const normalizedValue = trimmedValue.toLowerCase()
  if (
    trimmedValue === '-' ||
    trimmedValue === '—' ||
    normalizedValue === 'n/a' ||
    normalizedValue === 'no mark yet'
  ) {
    return null
  }

  return trimmedValue
}

export function buildPriceIndexBiReportHeroTitle({
  priceIndexCode,
  priceIndexName = null,
  product = null,
  location = null,
  source = null,
}: PriceIndexBiReportHandoffInput): string {
  const normalizedCode = priceIndexCode.trim().toUpperCase()
  const priceIndexLabel = priceIndexName?.trim() || normalizedCode
  const normalizedProduct = normalizePriceReportTitlePart(product)
  const normalizedLocation = normalizePriceReportTitlePart(location) ?? (normalizedProduct ? priceIndexLabel : null)
  const titleParts = [
    normalizedProduct,
    normalizedLocation,
    normalizePriceReportTitlePart(source),
  ].filter((part): part is string => Boolean(part))

  return titleParts.length > 0 ? titleParts.join(', ') : priceIndexLabel
}

export function buildPriceIndexBiReportHandoff({
  priceIndexCode,
  priceIndexName = null,
  product = null,
  location = null,
  source = null,
}: PriceIndexBiReportHandoffInput): AppRouteHandoff {
  const normalizedCode = priceIndexCode.trim().toUpperCase()
  const priceIndexLabel = priceIndexName?.trim() || normalizedCode
  const heroTitle = buildPriceIndexBiReportHeroTitle({
    priceIndexCode: normalizedCode,
    priceIndexName,
    product,
    location,
    source,
  })

  return {
    source: 'home',
    tradeId: `${PRICE_INDEX_BI_REPORT_ID}:${normalizedCode}`,
    focus: {
      type: 'report',
      id: PRICE_INDEX_BI_REPORT_ID,
      label: heroTitle,
    },
    tradeInspectorTab: null,
    eventType: null,
    label: `Open ${priceIndexLabel} price report`,
    rationale:
      'The Home price card opened the reusable price report filtered to this price index so the analyst can review price observations without creating a separate page per curve.',
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

export function resolvePriceIndexReportRouteFocus(
  handoff: AppRouteHandoff | null | undefined,
): {
  priceIndexCode: string
  heroTitle: string
  heroBody: string
  badgeLabel: string
  badgeDetail: string
} | null {
  const normalizedHandoff = normalizeAppRouteHandoff(handoff)
  const priceIndexCode = resolvePriceIndexBiReportFilter(normalizedHandoff)
  if (!priceIndexCode) {
    return null
  }
  const focusLabel = normalizePriceReportTitlePart(normalizedHandoff?.focus.label)
  const heroTitle = focusLabel && focusLabel !== PRICE_INDEX_BI_REPORT_TITLE
    ? focusLabel
    : `Price Report · ${priceIndexCode}`

  return {
    priceIndexCode,
    heroTitle,
    heroBody:
      'Review price observation history, latest mark context, source provenance, and freshness for this selected price index.',
    badgeLabel: 'Price Report',
    badgeDetail: `Filtered to ${priceIndexCode}`,
  }
}
