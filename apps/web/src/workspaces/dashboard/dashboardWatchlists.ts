import type { Trade, ViewKey } from '../../shared/models'

export const DASHBOARD_WATCHLIST_STORAGE_KEY = 'ectrm.dashboard.terminalWatchlist.v1'
export const DASHBOARD_WATCHLIST_ALERT_DELIVERY_STORAGE_KEY = 'ectrm.dashboard.terminalAlertDeliveries.v1'
export const DEFAULT_DASHBOARD_WATCHLIST_ID = 'terminal-live-desk-watchlist'

export const DASHBOARD_WATCHLIST_OBJECT_TYPES = [
  'price_index',
  'commodity_class',
  'desk_signal',
] as const

export const DASHBOARD_WATCHLIST_ALERT_CONDITIONS = [
  'price_move',
  'stale_market_data',
  'large_position_change',
  'pricing_exception',
  'settlement_exception',
] as const

export const DASHBOARD_WATCHLIST_ALERT_SEVERITIES = [
  'critical',
  'warning',
  'info',
] as const

export const DASHBOARD_WATCHLIST_ALERT_DELIVERY_CHANNELS = [
  'live_desk',
  'instrument_brief',
  'owning_workspace',
] as const

export type DashboardWatchlistObjectType = (typeof DASHBOARD_WATCHLIST_OBJECT_TYPES)[number]
export type DashboardWatchlistAlertConditionType = (typeof DASHBOARD_WATCHLIST_ALERT_CONDITIONS)[number]
export type DashboardWatchlistAlertSeverity = (typeof DASHBOARD_WATCHLIST_ALERT_SEVERITIES)[number]
export type DashboardWatchlistAlertDeliveryChannel = (typeof DASHBOARD_WATCHLIST_ALERT_DELIVERY_CHANNELS)[number]

export type DashboardWatchlistItem = {
  objectType: DashboardWatchlistObjectType
  objectId: string
  label: string
  commodityClass?: string | null
}

export type DashboardWatchlistAlertRule = {
  id: string
  conditionType: DashboardWatchlistAlertConditionType
  label: string
  severity: DashboardWatchlistAlertSeverity
  threshold?: number
}

export type DashboardWatchlist = {
  id: string
  name: string
  items: DashboardWatchlistItem[]
  alertRules: DashboardWatchlistAlertRule[]
  createdAt: string
  updatedAt: string
}

export type DashboardWatchlistAlert = {
  id: string
  ruleId: string
  conditionType: DashboardWatchlistAlertConditionType
  severity: DashboardWatchlistAlertSeverity
  title: string
  detail: string
  sourceLabel: string
  ownerView: ViewKey
  objectType: DashboardWatchlistObjectType
  objectId: string
  status: 'triggered'
  metricValue?: number | null
  threshold?: number | null
}

export type DashboardWatchlistAlertDeliveryRecord = {
  id: string
  alertId: string
  watchlistId: string
  ruleId: string
  conditionType: DashboardWatchlistAlertConditionType
  severity: DashboardWatchlistAlertSeverity
  title: string
  detail: string
  sourceLabel: string
  channel: DashboardWatchlistAlertDeliveryChannel
  ownerView: ViewKey
  routeView: ViewKey
  routeLabel: string
  actionLabel: string
  objectType: DashboardWatchlistObjectType
  objectId: string
  firstDeliveredAt: string
  lastDeliveredAt: string
  lastOpenedAt: string | null
  deliveryCount: number
  metricValue: number | null
  threshold: number | null
}

export type DashboardWatchlistAlertDeliverySnapshot = {
  records: DashboardWatchlistAlertDeliveryRecord[]
  activeRecords: DashboardWatchlistAlertDeliveryRecord[]
  emittedCount: number
  suppressedCount: number
}

type DashboardWatchlistPriceIndex = {
  code: string
  name: string
  provider: string
  is_active: boolean
  commodity_class?: string | null
  last_observed_at?: string | null
  day_change_percent?: number | null
  dayChangePercent?: number | null
  change_percent?: number | null
}

type DashboardWatchlistExposureBucket = {
  commodityClass: string
  unitLabel: string
  netVolume: number
  commodityCount: number
}

type DashboardWatchlistIssue = {
  label: string
  count: number
  detail: string
  candidateType?: string
  destinationView: ViewKey
}

const WATCHLIST_VERSION = 1
const WATCHLIST_ALERT_DELIVERY_VERSION = 1
const DEFAULT_ALERT_DELIVERY_COOLDOWN_MINUTES = 30
const DEFAULT_ALERT_DELIVERY_MAX_RECORDS = 24
const MS_PER_DAY = 86_400_000
const MS_PER_MINUTE = 60_000

const ALERT_SEVERITY_RANK: Record<DashboardWatchlistAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const WATCHLIST_OBJECT_TYPE_SET = new Set<string>(DASHBOARD_WATCHLIST_OBJECT_TYPES)
const WATCHLIST_ALERT_CONDITION_SET = new Set<string>(DASHBOARD_WATCHLIST_ALERT_CONDITIONS)
const WATCHLIST_ALERT_SEVERITY_SET = new Set<string>(DASHBOARD_WATCHLIST_ALERT_SEVERITIES)
const WATCHLIST_ALERT_DELIVERY_CHANNEL_SET = new Set<string>(DASHBOARD_WATCHLIST_ALERT_DELIVERY_CHANNELS)
const WATCHLIST_ALERT_ROUTE_VIEW_SET = new Set<string>([
  'prompt',
  'dashboard',
  'pretrade',
  'trades',
  'events',
  'risk',
  'positions',
  'shipments',
  'scheduling',
  'operations',
  'settlement',
  'messages',
  'reports',
  'library',
  'map',
  'reference',
  'admin',
  'settings',
  'assistant',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : null
}

function parseDateString(value: unknown): string | null {
  const parsedValue = parseNonEmptyString(value)
  if (!parsedValue) {
    return null
  }

  return Number.isNaN(Date.parse(parsedValue)) ? null : parsedValue
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  return parseNonEmptyString(value)
}

function parseOptionalNumber(value: unknown): number | undefined | null {
  if (value === undefined || value === null) {
    return undefined
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseWatchlistItem(value: unknown): DashboardWatchlistItem | null {
  if (!isRecord(value)) {
    return null
  }

  const objectType = parseNonEmptyString(value.objectType)
  const objectId = parseNonEmptyString(value.objectId)
  const label = parseNonEmptyString(value.label)
  const commodityClass = parseOptionalString(value.commodityClass)

  if (!objectType || !WATCHLIST_OBJECT_TYPE_SET.has(objectType) || !objectId || !label) {
    return null
  }

  if (commodityClass === null && value.commodityClass !== null) {
    return null
  }

  return {
    objectType: objectType as DashboardWatchlistObjectType,
    objectId,
    label,
    commodityClass: commodityClass ?? null,
  }
}

function parseWatchlistAlertRule(value: unknown): DashboardWatchlistAlertRule | null {
  if (!isRecord(value)) {
    return null
  }

  const id = parseNonEmptyString(value.id)
  const conditionType = parseNonEmptyString(value.conditionType)
  const label = parseNonEmptyString(value.label)
  const severity = parseNonEmptyString(value.severity)
  const threshold = parseOptionalNumber(value.threshold)

  if (
    !id ||
    !conditionType ||
    !WATCHLIST_ALERT_CONDITION_SET.has(conditionType) ||
    !label ||
    !severity ||
    !WATCHLIST_ALERT_SEVERITY_SET.has(severity) ||
    threshold === null
  ) {
    return null
  }

  return {
    id,
    conditionType: conditionType as DashboardWatchlistAlertConditionType,
    label,
    severity: severity as DashboardWatchlistAlertSeverity,
    ...(threshold === undefined ? {} : { threshold }),
  }
}

function parseNullableDateString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null
  }

  return parseDateString(value) ?? undefined
}

function parseNullableNumberValue(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return null
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return null
  }

  return Math.floor(value)
}

function parseWatchlistAlertDeliveryRecord(value: unknown): DashboardWatchlistAlertDeliveryRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const id = parseNonEmptyString(value.id)
  const alertId = parseNonEmptyString(value.alertId)
  const watchlistId = parseNonEmptyString(value.watchlistId)
  const ruleId = parseNonEmptyString(value.ruleId)
  const conditionType = parseNonEmptyString(value.conditionType)
  const severity = parseNonEmptyString(value.severity)
  const title = parseNonEmptyString(value.title)
  const detail = parseNonEmptyString(value.detail)
  const sourceLabel = parseNonEmptyString(value.sourceLabel)
  const channel = parseNonEmptyString(value.channel)
  const ownerView = parseNonEmptyString(value.ownerView)
  const routeView = parseNonEmptyString(value.routeView)
  const routeLabel = parseNonEmptyString(value.routeLabel)
  const actionLabel = parseNonEmptyString(value.actionLabel)
  const objectType = parseNonEmptyString(value.objectType)
  const objectId = parseNonEmptyString(value.objectId)
  const firstDeliveredAt = parseDateString(value.firstDeliveredAt)
  const lastDeliveredAt = parseDateString(value.lastDeliveredAt)
  const lastOpenedAt = parseNullableDateString(value.lastOpenedAt)
  const deliveryCount = parsePositiveInteger(value.deliveryCount)
  const metricValue = parseNullableNumberValue(value.metricValue)
  const threshold = parseNullableNumberValue(value.threshold)

  if (
    !id ||
    !alertId ||
    !watchlistId ||
    !ruleId ||
    !conditionType ||
    !WATCHLIST_ALERT_CONDITION_SET.has(conditionType) ||
    !severity ||
    !WATCHLIST_ALERT_SEVERITY_SET.has(severity) ||
    !title ||
    !detail ||
    !sourceLabel ||
    !channel ||
    !WATCHLIST_ALERT_DELIVERY_CHANNEL_SET.has(channel) ||
    !ownerView ||
    !WATCHLIST_ALERT_ROUTE_VIEW_SET.has(ownerView) ||
    !routeView ||
    !WATCHLIST_ALERT_ROUTE_VIEW_SET.has(routeView) ||
    !routeLabel ||
    !actionLabel ||
    !objectType ||
    !WATCHLIST_OBJECT_TYPE_SET.has(objectType) ||
    !objectId ||
    !firstDeliveredAt ||
    !lastDeliveredAt ||
    lastOpenedAt === undefined ||
    !deliveryCount ||
    metricValue === undefined ||
    threshold === undefined
  ) {
    return null
  }

  return {
    id,
    alertId,
    watchlistId,
    ruleId,
    conditionType: conditionType as DashboardWatchlistAlertConditionType,
    severity: severity as DashboardWatchlistAlertSeverity,
    title,
    detail,
    sourceLabel,
    channel: channel as DashboardWatchlistAlertDeliveryChannel,
    ownerView: ownerView as ViewKey,
    routeView: routeView as ViewKey,
    routeLabel,
    actionLabel,
    objectType: objectType as DashboardWatchlistObjectType,
    objectId,
    firstDeliveredAt,
    lastDeliveredAt,
    lastOpenedAt,
    deliveryCount,
    metricValue,
    threshold,
  }
}

function parseWatchlistValue(value: unknown): DashboardWatchlist | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.version !== WATCHLIST_VERSION) {
    return null
  }

  const id = parseNonEmptyString(value.id)
  const name = parseNonEmptyString(value.name)
  const createdAt = parseDateString(value.createdAt)
  const updatedAt = parseDateString(value.updatedAt)

  if (!id || !name || !createdAt || !updatedAt || !Array.isArray(value.items) || !Array.isArray(value.alertRules)) {
    return null
  }

  const items = value.items.map(parseWatchlistItem)
  const alertRules = value.alertRules.map(parseWatchlistAlertRule)
  if (items.some((item) => item === null) || alertRules.some((rule) => rule === null)) {
    return null
  }

  return {
    id,
    name,
    items: items as DashboardWatchlistItem[],
    alertRules: alertRules as DashboardWatchlistAlertRule[],
    createdAt,
    updatedAt,
  }
}

function parseWatchlistAlertDeliveryValue(value: unknown): DashboardWatchlistAlertDeliveryRecord[] | null {
  if (!isRecord(value) || value.version !== WATCHLIST_ALERT_DELIVERY_VERSION || !Array.isArray(value.records)) {
    return null
  }

  const records = value.records.map(parseWatchlistAlertDeliveryRecord)
  if (records.some((record) => record === null)) {
    return null
  }

  return sortDashboardWatchlistAlertDeliveryRecords(records as DashboardWatchlistAlertDeliveryRecord[])
}

function buildLargePositionThreshold(netVolume: number | null | undefined): number {
  if (typeof netVolume !== 'number' || !Number.isFinite(netVolume) || netVolume === 0) {
    return 10_000
  }

  const magnitude = Math.abs(netVolume)
  if (magnitude < 1_000) {
    return 1_000
  }

  return Math.max(1_000, Math.floor(magnitude * 0.75))
}

function addWatchlistItem(items: DashboardWatchlistItem[], item: DashboardWatchlistItem): void {
  if (items.some((candidate) => candidate.objectType === item.objectType && candidate.objectId === item.objectId)) {
    return
  }

  items.push(item)
}

function issueCount(
  issues: readonly DashboardWatchlistIssue[],
  candidateTypes: readonly string[],
  labelPattern: RegExp,
): number {
  const candidateTypeSet = new Set(candidateTypes)
  return issues.reduce((sum, issue) => {
    if (candidateTypeSet.has(issue.candidateType ?? '') || labelPattern.test(issue.label)) {
      return sum + Math.max(0, issue.count)
    }

    return sum
  }, 0)
}

function pricingExceptionTradeCount(activeTrades: readonly Trade[]): number {
  return activeTrades.filter(
    (trade) => ['PENDING', 'PARTIALLY_PRICED'].includes(trade.pricing_status) || trade.price === null,
  ).length
}

function settlementExceptionTradeCount(activeTrades: readonly Trade[]): number {
  return activeTrades.filter(
    (trade) =>
      trade.payment_status === 'OVERDUE' ||
      trade.settlement_status === 'PARTIALLY_SETTLED' ||
      (
        trade.trade_nature === 'PHYSICAL' &&
        !['NOT_REQUIRED', 'ISSUED', 'APPROVED'].includes(trade.invoice_status)
      ),
  ).length
}

function alertThresholdCount(rule: DashboardWatchlistAlertRule): number {
  return Math.max(1, Math.floor(rule.threshold ?? 1))
}

function thresholdLabel(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'the saved threshold'
}

function daysOld(value: string | null | undefined, now: Date): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }

  return Math.floor((now.getTime() - timestamp) / MS_PER_DAY)
}

function extractPriceMovePercent(priceIndex: DashboardWatchlistPriceIndex): number | null {
  const candidates = [
    priceIndex.dayChangePercent,
    priceIndex.day_change_percent,
    priceIndex.change_percent,
  ]

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function watchedItemsByType(
  watchlist: DashboardWatchlist,
  objectType: DashboardWatchlistObjectType,
): DashboardWatchlistItem[] {
  return watchlist.items.filter((item) => item.objectType === objectType)
}

export function serializeDashboardWatchlist(watchlist: DashboardWatchlist): string {
  return JSON.stringify({
    version: WATCHLIST_VERSION,
    ...watchlist,
  })
}

export function parseDashboardWatchlist(rawValue: string | null | undefined): DashboardWatchlist | null {
  if (!rawValue) {
    return null
  }

  try {
    return parseWatchlistValue(JSON.parse(rawValue))
  } catch {
    return null
  }
}

export function serializeDashboardWatchlistAlertDeliveries(
  records: DashboardWatchlistAlertDeliveryRecord[],
): string {
  return JSON.stringify({
    version: WATCHLIST_ALERT_DELIVERY_VERSION,
    records,
  })
}

export function parseDashboardWatchlistAlertDeliveries(
  rawValue: string | null | undefined,
): DashboardWatchlistAlertDeliveryRecord[] {
  if (!rawValue) {
    return []
  }

  try {
    return parseWatchlistAlertDeliveryValue(JSON.parse(rawValue)) ?? []
  } catch {
    return []
  }
}

export function buildDefaultDashboardWatchlist({
  activeTrades,
  priceIndices,
  exposureByClass,
  now = new Date(),
}: {
  activeTrades: readonly Trade[]
  priceIndices: readonly DashboardWatchlistPriceIndex[]
  exposureByClass: readonly DashboardWatchlistExposureBucket[]
  now?: Date
}): DashboardWatchlist {
  const linkedPriceIndexCodes = new Set(
    activeTrades.map((trade) => trade.price_index_code).filter((value): value is string => Boolean(value)),
  )
  const items: DashboardWatchlistItem[] = []
  const timestamp = now.toISOString()
  const largestExposure = [...exposureByClass].sort(
    (left, right) => Math.abs(right.netVolume) - Math.abs(left.netVolume),
  )[0]

  for (const priceIndex of [...priceIndices]
    .filter((row) => row.is_active)
    .sort((left, right) => {
      const linkedCompare = Number(linkedPriceIndexCodes.has(right.code)) - Number(linkedPriceIndexCodes.has(left.code))
      if (linkedCompare !== 0) {
        return linkedCompare
      }

      return left.name.localeCompare(right.name)
    })
    .slice(0, 3)) {
    addWatchlistItem(items, {
      objectType: 'price_index',
      objectId: priceIndex.code,
      label: priceIndex.name,
      commodityClass: priceIndex.commodity_class ?? null,
    })
  }

  if (largestExposure) {
    addWatchlistItem(items, {
      objectType: 'commodity_class',
      objectId: largestExposure.commodityClass,
      label: `${largestExposure.commodityClass} exposure`,
      commodityClass: largestExposure.commodityClass,
    })
  }

  addWatchlistItem(items, {
    objectType: 'desk_signal',
    objectId: 'pricing_exception',
    label: 'Pricing exceptions',
    commodityClass: null,
  })
  addWatchlistItem(items, {
    objectType: 'desk_signal',
    objectId: 'settlement_exception',
    label: 'Settlement exceptions',
    commodityClass: null,
  })

  return {
    id: DEFAULT_DASHBOARD_WATCHLIST_ID,
    name: 'Live Desk Watchlist',
    items,
    alertRules: [
      {
        id: 'price-move-5pct',
        conditionType: 'price_move',
        label: 'Price move >= 5%',
        severity: 'warning',
        threshold: 5,
      },
      {
        id: 'stale-market-data-3d',
        conditionType: 'stale_market_data',
        label: 'Market data stale > 3d',
        severity: 'warning',
        threshold: 3,
      },
      {
        id: 'large-position-threshold',
        conditionType: 'large_position_change',
        label: 'Large position threshold',
        severity: 'warning',
        threshold: buildLargePositionThreshold(largestExposure?.netVolume),
      },
      {
        id: 'pricing-exception-open',
        conditionType: 'pricing_exception',
        label: 'Pricing exception open',
        severity: 'warning',
        threshold: 1,
      },
      {
        id: 'settlement-exception-open',
        conditionType: 'settlement_exception',
        label: 'Settlement exception open',
        severity: 'critical',
        threshold: 1,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function evaluateDashboardWatchlistAlerts({
  watchlist,
  priceIndices,
  exposureByClass,
  issues,
  activeTrades,
  now = new Date(),
}: {
  watchlist: DashboardWatchlist
  priceIndices: readonly DashboardWatchlistPriceIndex[]
  exposureByClass: readonly DashboardWatchlistExposureBucket[]
  issues: readonly DashboardWatchlistIssue[]
  activeTrades: readonly Trade[]
  now?: Date
}): DashboardWatchlistAlert[] {
  const alerts: DashboardWatchlistAlert[] = []
  const priceIndexByCode = new Map(priceIndices.map((priceIndex) => [priceIndex.code, priceIndex]))
  const exposureByCommodityClass = new Map(exposureByClass.map((row) => [row.commodityClass, row]))
  const priceIndexItems = watchedItemsByType(watchlist, 'price_index')
  const commodityClassItems = watchedItemsByType(watchlist, 'commodity_class')
  const deskSignalIds = new Set(watchedItemsByType(watchlist, 'desk_signal').map((item) => item.objectId))

  for (const rule of watchlist.alertRules) {
    if (rule.conditionType === 'price_move') {
      for (const item of priceIndexItems) {
        const priceIndex = priceIndexByCode.get(item.objectId)
        if (!priceIndex) {
          continue
        }

        const movePercent = extractPriceMovePercent(priceIndex)
        const threshold = rule.threshold ?? 0
        if (movePercent === null || Math.abs(movePercent) < threshold) {
          continue
        }

        alerts.push({
          id: `${watchlist.id}:${rule.id}:${item.objectId}`,
          ruleId: rule.id,
          conditionType: rule.conditionType,
          severity: rule.severity,
          title: `${item.label} moved ${movePercent.toFixed(1)}%`,
          detail: `The saved price-move rule is ${thresholdLabel(rule.threshold)}% and the current move is ${movePercent.toFixed(1)}%.`,
          sourceLabel: `${priceIndex.provider} ${priceIndex.code}`,
          ownerView: 'reference',
          objectType: item.objectType,
          objectId: item.objectId,
          status: 'triggered',
          metricValue: movePercent,
          threshold,
        })
      }
    }

    if (rule.conditionType === 'stale_market_data') {
      for (const item of priceIndexItems) {
        const priceIndex = priceIndexByCode.get(item.objectId)
        const thresholdDays = rule.threshold ?? 3
        if (!priceIndex) {
          alerts.push({
            id: `${watchlist.id}:${rule.id}:missing:${item.objectId}`,
            ruleId: rule.id,
            conditionType: rule.conditionType,
            severity: 'critical',
            title: `${item.label} is missing from market data`,
            detail: 'The saved watchlist curve is no longer available in the loaded reference data.',
            sourceLabel: item.objectId,
            ownerView: 'reference',
            objectType: item.objectType,
            objectId: item.objectId,
            status: 'triggered',
            metricValue: null,
            threshold: thresholdDays,
          })
          continue
        }

        if (!priceIndex.is_active) {
          alerts.push({
            id: `${watchlist.id}:${rule.id}:inactive:${item.objectId}`,
            ruleId: rule.id,
            conditionType: rule.conditionType,
            severity: rule.severity,
            title: `${item.label} is inactive`,
            detail: 'The saved watchlist curve is no longer active in reference data.',
            sourceLabel: `${priceIndex.provider} ${priceIndex.code}`,
            ownerView: 'reference',
            objectType: item.objectType,
            objectId: item.objectId,
            status: 'triggered',
            metricValue: null,
            threshold: thresholdDays,
          })
          continue
        }

        const staleDays = daysOld(priceIndex.last_observed_at, now)
        if (staleDays === null || staleDays <= thresholdDays) {
          continue
        }

        alerts.push({
          id: `${watchlist.id}:${rule.id}:stale:${item.objectId}`,
          ruleId: rule.id,
          conditionType: rule.conditionType,
          severity: rule.severity,
          title: `${item.label} is ${staleDays}d stale`,
          detail: `The saved market-data recency rule is ${thresholdLabel(rule.threshold)} day(s).`,
          sourceLabel: `${priceIndex.provider} ${priceIndex.code}`,
          ownerView: 'reference',
          objectType: item.objectType,
          objectId: item.objectId,
          status: 'triggered',
          metricValue: staleDays,
          threshold: thresholdDays,
        })
      }
    }

    if (rule.conditionType === 'large_position_change') {
      for (const item of commodityClassItems) {
        const exposure = exposureByCommodityClass.get(item.objectId)
        const threshold = rule.threshold ?? 0
        if (!exposure || Math.abs(exposure.netVolume) < threshold) {
          continue
        }

        alerts.push({
          id: `${watchlist.id}:${rule.id}:${item.objectId}`,
          ruleId: rule.id,
          conditionType: rule.conditionType,
          severity: rule.severity,
          title: `${item.label} crossed ${thresholdLabel(rule.threshold)} ${exposure.unitLabel}`,
          detail: `Current net exposure is ${exposure.netVolume.toLocaleString()} ${exposure.unitLabel} across ${exposure.commodityCount.toLocaleString()} bucket item(s).`,
          sourceLabel: `Position bucket ${exposure.commodityClass}`,
          ownerView: 'positions',
          objectType: item.objectType,
          objectId: item.objectId,
          status: 'triggered',
          metricValue: exposure.netVolume,
          threshold,
        })
      }
    }

    if (rule.conditionType === 'pricing_exception' && deskSignalIds.has('pricing_exception')) {
      const summaryCount = issueCount(issues, ['stale_pricing'], /pricing/i)
      const count = summaryCount > 0 ? summaryCount : pricingExceptionTradeCount(activeTrades)
      const threshold = alertThresholdCount(rule)

      if (count >= threshold) {
        alerts.push({
          id: `${watchlist.id}:${rule.id}:pricing-exception`,
          ruleId: rule.id,
          conditionType: rule.conditionType,
          severity: rule.severity,
          title: `Pricing exceptions: ${count.toLocaleString()} open`,
          detail: `The saved pricing exception rule triggers at ${threshold.toLocaleString()} open item(s).`,
          sourceLabel: 'Dashboard attention - Stale pricing',
          ownerView: 'trades',
          objectType: 'desk_signal',
          objectId: 'pricing_exception',
          status: 'triggered',
          metricValue: count,
          threshold,
        })
      }
    }

    if (rule.conditionType === 'settlement_exception' && deskSignalIds.has('settlement_exception')) {
      const summaryCount = issueCount(issues, ['invoice_backlog', 'overdue_payment'], /invoice|payment|settlement/i)
      const count = summaryCount > 0 ? summaryCount : settlementExceptionTradeCount(activeTrades)
      const threshold = alertThresholdCount(rule)

      if (count >= threshold) {
        alerts.push({
          id: `${watchlist.id}:${rule.id}:settlement-exception`,
          ruleId: rule.id,
          conditionType: rule.conditionType,
          severity: rule.severity,
          title: `Settlement exceptions: ${count.toLocaleString()} open`,
          detail: `The saved settlement exception rule triggers at ${threshold.toLocaleString()} open item(s).`,
          sourceLabel: 'Dashboard attention - Settlement',
          ownerView: 'settlement',
          objectType: 'desk_signal',
          objectId: 'settlement_exception',
          status: 'triggered',
          metricValue: count,
          threshold,
        })
      }
    }
  }

  return alerts.sort((left, right) => {
    const severityCompare = ALERT_SEVERITY_RANK[left.severity] - ALERT_SEVERITY_RANK[right.severity]
    if (severityCompare !== 0) {
      return severityCompare
    }

    return left.title.localeCompare(right.title)
  })
}

function alertDeliveryId(alertId: string): string {
  return `delivery:${alertId}`
}

function alertDeliveryRoute(alert: DashboardWatchlistAlert): {
  channel: DashboardWatchlistAlertDeliveryChannel
  routeView: ViewKey
  routeLabel: string
  actionLabel: string
} {
  if (alert.objectType === 'price_index' || alert.objectType === 'commodity_class') {
    return {
      channel: 'instrument_brief',
      routeView: 'dashboard',
      routeLabel: 'Instrument Brief',
      actionLabel: 'Open Brief',
    }
  }

  return {
    channel: 'owning_workspace',
    routeView: alert.ownerView,
    routeLabel: `${alert.ownerView} workspace`,
    actionLabel: `Open ${alert.ownerView}`,
  }
}

function sortDashboardWatchlistAlertDeliveryRecords(
  records: DashboardWatchlistAlertDeliveryRecord[],
): DashboardWatchlistAlertDeliveryRecord[] {
  return [...records].sort((left, right) => {
    const deliveredCompare = Date.parse(right.lastDeliveredAt) - Date.parse(left.lastDeliveredAt)
    if (deliveredCompare !== 0) {
      return deliveredCompare
    }

    const severityCompare = ALERT_SEVERITY_RANK[left.severity] - ALERT_SEVERITY_RANK[right.severity]
    if (severityCompare !== 0) {
      return severityCompare
    }

    return left.title.localeCompare(right.title)
  })
}

export function reconcileDashboardWatchlistAlertDeliveries({
  watchlistId,
  alerts,
  existingRecords,
  now = new Date(),
  minimumIntervalMinutes = DEFAULT_ALERT_DELIVERY_COOLDOWN_MINUTES,
  maxRecords = DEFAULT_ALERT_DELIVERY_MAX_RECORDS,
}: {
  watchlistId: string
  alerts: readonly DashboardWatchlistAlert[]
  existingRecords: readonly DashboardWatchlistAlertDeliveryRecord[]
  now?: Date
  minimumIntervalMinutes?: number
  maxRecords?: number
}): DashboardWatchlistAlertDeliverySnapshot {
  const nowIso = now.toISOString()
  const deliveryCooldownMs = Math.max(0, minimumIntervalMinutes) * MS_PER_MINUTE
  const activeAlertIds = new Set(alerts.map((alert) => alert.id))
  const existingByAlertId = new Map(existingRecords.map((record) => [record.alertId, record]))
  const nextByRecordId = new Map(existingRecords.map((record) => [record.id, record]))
  let emittedCount = 0
  let suppressedCount = 0

  for (const alert of alerts) {
    const existingRecord = existingByAlertId.get(alert.id)
    const route = alertDeliveryRoute(alert)
    const lastDeliveredAt = existingRecord ? Date.parse(existingRecord.lastDeliveredAt) : Number.NaN
    const withinCooldown =
      existingRecord !== undefined &&
      !Number.isNaN(lastDeliveredAt) &&
      now.getTime() - lastDeliveredAt < deliveryCooldownMs

    if (withinCooldown) {
      suppressedCount += 1
    } else {
      emittedCount += 1
    }

    const nextRecord: DashboardWatchlistAlertDeliveryRecord = {
      id: existingRecord?.id ?? alertDeliveryId(alert.id),
      alertId: alert.id,
      watchlistId,
      ruleId: alert.ruleId,
      conditionType: alert.conditionType,
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail,
      sourceLabel: alert.sourceLabel,
      channel: route.channel,
      ownerView: alert.ownerView,
      routeView: route.routeView,
      routeLabel: route.routeLabel,
      actionLabel: route.actionLabel,
      objectType: alert.objectType,
      objectId: alert.objectId,
      firstDeliveredAt: existingRecord?.firstDeliveredAt ?? nowIso,
      lastDeliveredAt: withinCooldown && existingRecord ? existingRecord.lastDeliveredAt : nowIso,
      lastOpenedAt: existingRecord?.lastOpenedAt ?? null,
      deliveryCount: withinCooldown && existingRecord
        ? existingRecord.deliveryCount
        : (existingRecord?.deliveryCount ?? 0) + 1,
      metricValue: alert.metricValue ?? null,
      threshold: alert.threshold ?? null,
    }

    nextByRecordId.set(nextRecord.id, nextRecord)
  }

  const records = sortDashboardWatchlistAlertDeliveryRecords([...nextByRecordId.values()]).slice(
    0,
    Math.max(1, Math.floor(maxRecords)),
  )
  const activeRecords = records.filter((record) => activeAlertIds.has(record.alertId))

  return {
    records,
    activeRecords,
    emittedCount,
    suppressedCount,
  }
}

export function markDashboardWatchlistAlertDeliveryOpened({
  records,
  deliveryId,
  now = new Date(),
}: {
  records: readonly DashboardWatchlistAlertDeliveryRecord[]
  deliveryId: string
  now?: Date
}): DashboardWatchlistAlertDeliveryRecord[] {
  let changed = false
  const nextRecords = records.map((record) => {
    if (record.id !== deliveryId) {
      return record
    }

    changed = true
    return {
      ...record,
      lastOpenedAt: now.toISOString(),
    }
  })

  return changed ? nextRecords : [...records]
}

export function formatDashboardWatchlistAlertCondition(value: DashboardWatchlistAlertConditionType): string {
  switch (value) {
    case 'price_move':
      return 'Price Move'
    case 'stale_market_data':
      return 'Stale Market Data'
    case 'large_position_change':
      return 'Large Position Change'
    case 'pricing_exception':
      return 'Pricing Exception'
    case 'settlement_exception':
      return 'Settlement Exception'
  }
}

export function formatDashboardWatchlistAlertDeliveryChannel(
  value: DashboardWatchlistAlertDeliveryChannel,
): string {
  switch (value) {
    case 'live_desk':
      return 'Live Desk'
    case 'instrument_brief':
      return 'Instrument Brief'
    case 'owning_workspace':
      return 'Owning Workspace'
  }
}

export function formatDashboardWatchlistAlertSeverity(value: DashboardWatchlistAlertSeverity): string {
  switch (value) {
    case 'critical':
      return 'Critical'
    case 'warning':
      return 'Warning'
    case 'info':
      return 'Info'
  }
}

export function formatDashboardWatchlistObjectType(value: DashboardWatchlistObjectType): string {
  switch (value) {
    case 'price_index':
      return 'Price Index'
    case 'commodity_class':
      return 'Commodity Class'
    case 'desk_signal':
      return 'Desk Signal'
  }
}
