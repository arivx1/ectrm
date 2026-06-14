import type { Trade, ViewKey } from '../../shared/models'

export type DashboardDeskHeadlineSeverity = 'critical' | 'warning' | 'info'
export type DashboardDeskHeadlineConcern =
  | 'market'
  | 'pricing'
  | 'operations'
  | 'settlement'
  | 'exposure'
  | 'activity'

export type DashboardDeskHeadlineSourceType =
  | 'trade'
  | 'workflow'
  | 'position'
  | 'event'
  | 'price_index'

type DashboardHeadlinePriceIndex = {
  code: string
  name: string
  provider: string
  is_active: boolean
  commodity_class?: string | null
  commodity_code?: string | null
}

type DashboardHeadlineExposureBucket = {
  commodityClass: string
  unitLabel: string
  netVolume: number
  commodityCount: number
}

type DashboardHeadlineIssue = {
  label: string
  count: number
  detail: string
  candidateType?: string
  destinationView: ViewKey
}

type DashboardHeadlineEvent = {
  event_id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  recorded_at: string
}

export type DashboardDeskHeadlineItem = {
  id: string
  severity: DashboardDeskHeadlineSeverity
  concern: DashboardDeskHeadlineConcern
  title: string
  detail: string
  commodityClass: string | null
  ownerView: ViewKey
  source: {
    type: DashboardDeskHeadlineSourceType
    label: string
    id: string
  }
  timestamp: string | null
}

export const DASHBOARD_DESK_HEADLINE_CONCERNS: DashboardDeskHeadlineConcern[] = [
  'market',
  'pricing',
  'operations',
  'settlement',
  'exposure',
  'activity',
]

export const DASHBOARD_DESK_HEADLINE_SEVERITIES: DashboardDeskHeadlineSeverity[] = [
  'critical',
  'warning',
  'info',
]

const HEADLINE_SEVERITY_RANK: Record<DashboardDeskHeadlineSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function issueConcern(candidateType: string | undefined): DashboardDeskHeadlineConcern {
  switch (candidateType) {
    case 'stale_pricing':
      return 'pricing'
    case 'invoice_backlog':
    case 'overdue_payment':
      return 'settlement'
    case 'confirmation_backlog':
    case 'nomination_backlog':
    case 'allocation_backlog':
    case 'incomplete_ops_data':
      return 'operations'
    default:
      return 'operations'
  }
}

function issueSeverity(count: number): DashboardDeskHeadlineSeverity {
  return count >= 5 ? 'critical' : 'warning'
}

function parseTime(value: string | null): number {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function daysUntil(value: string | null | undefined, now: Date): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return null
  }

  return Math.ceil((parsed - now.getTime()) / 86_400_000)
}

function titleCaseConcern(value: DashboardDeskHeadlineConcern): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function buildTradeDetail(trade: Trade): string {
  return `${trade.book} / ${trade.portfolio} - ${trade.counterparty || 'counterparty TBD'}`
}

export function buildDashboardDeskHeadlines({
  activeTrades,
  priceIndices,
  exposureByClass,
  issues,
  events,
  now = new Date(),
}: {
  activeTrades: Trade[]
  priceIndices: DashboardHeadlinePriceIndex[]
  exposureByClass: DashboardHeadlineExposureBucket[]
  issues: DashboardHeadlineIssue[]
  events: DashboardHeadlineEvent[]
  now?: Date
}): DashboardDeskHeadlineItem[] {
  const headlines: DashboardDeskHeadlineItem[] = []

  for (const issue of issues) {
    if (issue.count <= 0) {
      continue
    }

    headlines.push({
      id: `issue:${issue.candidateType ?? issue.label}`,
      severity: issueSeverity(issue.count),
      concern: issueConcern(issue.candidateType),
      title: `${issue.label}: ${issue.count} open`,
      detail: issue.detail,
      commodityClass: null,
      ownerView: issue.destinationView,
      source: {
        type: 'workflow',
        label: `Dashboard attention - ${issue.label}`,
        id: issue.candidateType ?? issue.label,
      },
      timestamp: null,
    })
  }

  for (const trade of activeTrades) {
    if (['PENDING', 'PARTIALLY_PRICED'].includes(trade.pricing_status) || trade.price === null) {
      headlines.push({
        id: `pricing:${trade.trade_id}`,
        severity: trade.price === null ? 'critical' : 'warning',
        concern: 'pricing',
        title: `Pricing gap on ${trade.trade_id}`,
        detail: `${buildTradeDetail(trade)} is ${trade.pricing_status.toLowerCase().replaceAll('_', ' ')}.`,
        commodityClass: trade.commodity_class,
        ownerView: 'trades',
        source: {
          type: 'trade',
          label: `Trade ${trade.trade_id}`,
          id: trade.trade_id,
        },
        timestamp: trade.updated_at ?? trade.execution_timestamp,
      })
    }

    const optionDaysUntilExpiry = daysUntil(trade.option_expiration_date, now)
    if (optionDaysUntilExpiry !== null && optionDaysUntilExpiry <= 14) {
      headlines.push({
        id: `option-expiry:${trade.trade_id}`,
        severity: optionDaysUntilExpiry <= 3 ? 'critical' : 'warning',
        concern: 'market',
        title: `Option expiry approaching on ${trade.trade_id}`,
        detail: `${buildTradeDetail(trade)} expires in ${Math.max(optionDaysUntilExpiry, 0)} day${
          optionDaysUntilExpiry === 1 ? '' : 's'
        }.`,
        commodityClass: trade.commodity_class,
        ownerView: 'risk',
        source: {
          type: 'trade',
          label: `Trade ${trade.trade_id}`,
          id: trade.trade_id,
        },
        timestamp: trade.option_expiration_date,
      })
    }

    if (trade.payment_status === 'OVERDUE' || trade.settlement_status === 'PARTIALLY_SETTLED') {
      headlines.push({
        id: `settlement:${trade.trade_id}`,
        severity: trade.payment_status === 'OVERDUE' ? 'critical' : 'warning',
        concern: 'settlement',
        title: `Settlement follow-through needed on ${trade.trade_id}`,
        detail: `${buildTradeDetail(trade)} has invoice ${trade.invoice_status} and payment ${trade.payment_status}.`,
        commodityClass: trade.commodity_class,
        ownerView: 'settlement',
        source: {
          type: 'trade',
          label: `Trade ${trade.trade_id}`,
          id: trade.trade_id,
        },
        timestamp: trade.updated_at ?? trade.execution_timestamp,
      })
    }
  }

  const largestExposure = [...exposureByClass].sort(
    (left, right) => Math.abs(right.netVolume) - Math.abs(left.netVolume),
  )[0]
  if (largestExposure) {
    headlines.push({
      id: `exposure:${largestExposure.commodityClass}:${largestExposure.unitLabel}`,
      severity: 'info',
      concern: 'exposure',
      title: `${largestExposure.commodityClass} exposure leads the board`,
      detail: `${Math.abs(largestExposure.netVolume).toLocaleString()} ${largestExposure.unitLabel} across ${
        largestExposure.commodityCount
      } position bucket${largestExposure.commodityCount === 1 ? '' : 's'}.`,
      commodityClass: largestExposure.commodityClass,
      ownerView: 'positions',
      source: {
        type: 'position',
        label: `Position bucket ${largestExposure.commodityClass}`,
        id: largestExposure.commodityClass,
      },
      timestamp: null,
    })
  }

  for (const priceIndex of priceIndices.filter((row) => row.is_active).slice(0, 3)) {
    headlines.push({
      id: `price-index:${priceIndex.code}`,
      severity: 'info',
      concern: 'market',
      title: `${priceIndex.name} curve is on the desk tape`,
      detail: `${priceIndex.provider} reference data is available for terminal drill-downs.`,
      commodityClass: priceIndex.commodity_class ?? null,
      ownerView: 'reference',
      source: {
        type: 'price_index',
        label: `Reference price index ${priceIndex.code}`,
        id: priceIndex.code,
      },
      timestamp: null,
    })
  }

  const latestEvent = [...events].sort(
    (left, right) => parseTime(right.recorded_at) - parseTime(left.recorded_at),
  )[0]
  if (latestEvent) {
    headlines.push({
      id: `event:${latestEvent.event_id}`,
      severity: 'info',
      concern: 'activity',
      title: `${latestEvent.event_type} posted to the activity tape`,
      detail: `${latestEvent.aggregate_id} - ${latestEvent.aggregate_type}`,
      commodityClass: null,
      ownerView: 'events',
      source: {
        type: 'event',
        label: `Event ${latestEvent.event_id}`,
        id: latestEvent.event_id,
      },
      timestamp: latestEvent.recorded_at,
    })
  }

  return headlines.sort((left, right) => {
    const severityCompare = HEADLINE_SEVERITY_RANK[left.severity] - HEADLINE_SEVERITY_RANK[right.severity]
    if (severityCompare !== 0) {
      return severityCompare
    }

    const timeCompare = parseTime(right.timestamp) - parseTime(left.timestamp)
    if (timeCompare !== 0) {
      return timeCompare
    }

    return left.title.localeCompare(right.title)
  })
}

export function filterDashboardDeskHeadlines(
  items: DashboardDeskHeadlineItem[],
  filters: {
    commodityClass?: string | null
    concern?: DashboardDeskHeadlineConcern | 'ALL' | null
    severity?: DashboardDeskHeadlineSeverity | 'ALL' | null
  },
): DashboardDeskHeadlineItem[] {
  return items.filter((item) => {
    if (filters.commodityClass && filters.commodityClass !== 'ALL') {
      if (item.commodityClass !== filters.commodityClass) {
        return false
      }
    }

    if (filters.concern && filters.concern !== 'ALL' && item.concern !== filters.concern) {
      return false
    }

    if (filters.severity && filters.severity !== 'ALL' && item.severity !== filters.severity) {
      return false
    }

    return true
  })
}

export function formatDashboardDeskHeadlineConcern(value: DashboardDeskHeadlineConcern): string {
  return titleCaseConcern(value)
}

export function formatDashboardDeskHeadlineSeverity(value: DashboardDeskHeadlineSeverity): string {
  switch (value) {
    case 'critical':
      return 'Critical'
    case 'warning':
      return 'Warning'
    case 'info':
      return 'Info'
  }
}
