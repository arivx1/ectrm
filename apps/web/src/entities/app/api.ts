import { fetchJson } from '../../shared/api'
import { bootstrapQueryLimits } from '../../shared/config'
import type { TradeMetadata } from '../../shared/tradeMetadata'
import { loadWeatherLocations } from '../weather/api'
import type {
  AssistantRuntimeSettings,
  CounterpartyRecord,
  CounterpartyCreditProfileRecord,
  CounterpartyCreditReportRow,
  CounterpartyExternalCreditSnapshotRecord,
  CounterpartyStandards,
  CurrencyRecord,
  DeliveryRecord,
  EventRow,
  ExternalDataRunRecord,
  ExternalDataSyncStatusRecord,
  LocationStandards,
  LocationRecord,
  OptionExposureRow,
  PortfolioRecord,
  PositionRow,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  TradeConfirmationRecord,
  TradeInvoiceRecord,
  TradePaymentRecord,
  TradeWorkflowItemRecord,
  TradingSourceRecord,
  UnitRecord,
  WeatherLocationRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'

export type WorkspaceCollectionWindow = {
  loadedCount: number
  hasMore: boolean
}

export type WorkflowQueue = 'operations' | 'settlement'

export type WorkspaceCollectionCountSummary = {
  total_count: number
}

export type WorkspaceTradeSummary = WorkspaceCollectionCountSummary & {
  active_count: number
  priced_active_count: number
  pending_pricing_count: number
  pending_settlement_count: number
  tracked_book_count: number
  total_active_volume: number
}

export type WorkspaceWorkflowItemSummary = WorkspaceCollectionCountSummary & {
  operations_queue_count: number
  settlement_queue_count: number
}

export type WorkspaceDashboardPositionBucketSummary = {
  commodity_class: string
  unit_label: string
  net_volume: number
  commodity_count: number
}

export type WorkspaceDashboardPositionSummary = {
  gross_exposure: number
  position_count: number
  bucket_count: number
  buckets: WorkspaceDashboardPositionBucketSummary[]
  largest_bucket: WorkspaceDashboardPositionBucketSummary | null
}

export type WorkspaceDashboardAttentionSummary = {
  total_count: number
  confirmation_backlog_count: number
  nomination_backlog_count: number
  allocation_backlog_count: number
  invoice_backlog_count: number
  overdue_payment_count: number
  stale_pricing_count: number
  incomplete_ops_data_count: number
}

export type WorkspaceDashboardSummary = {
  positions: WorkspaceDashboardPositionSummary
  attention: WorkspaceDashboardAttentionSummary
}

export type WorkspaceSettlementBreakdownSummaryRow = {
  status: string
  count: number
}

export type WorkspaceSettlementSummary = {
  open_work_item_count: number
  invoice_pending_count: number
  payment_due_count: number
  settled_count: number
  trade_exception_count: number
  workflow_exception_count: number
  breakdown: WorkspaceSettlementBreakdownSummaryRow[]
}

export type OperationalResourceKey =
  | 'confirmations'
  | 'deliveries'
  | 'shipments'
  | 'invoices'
  | 'payments'
  | 'work_items'

export type OperationalResourcePrimaryAction = {
  key: string
  label: string
  detail: string
}

export type OperationalResourceSurfaceAction = {
  key: string
  label: string
  detail: string
  permission_message: string | null
  comment_required: boolean
  comment_hint: string | null
}

export type OperationalResourceSummaryStat = {
  key: string
  label: string
  detail: string
}

export type OperationalResourceEmptyState = {
  title: string
  detail: string
}

export type OperationalResourceSurface = {
  title: string
  description: string
  board_section: string
  actions?: OperationalResourceSurfaceAction[]
  primary_action: OperationalResourcePrimaryAction | null
  empty_state: OperationalResourceEmptyState | null
  summary_stats: OperationalResourceSummaryStat[]
}

export type OperationalResourceDescriptor = {
  resource_key: OperationalResourceKey
  filters: string[]
  sort_fields: string[]
  actions: string[]
  surface?: OperationalResourceSurface | null
}

export type WorkspaceBootstrapSummary = {
  generated_at: string
  trades: WorkspaceTradeSummary
  positions: WorkspaceCollectionCountSummary
  option_exposures: WorkspaceCollectionCountSummary
  deliveries: WorkspaceCollectionCountSummary
  confirmations: WorkspaceCollectionCountSummary
  work_items: WorkspaceWorkflowItemSummary
  invoices: WorkspaceCollectionCountSummary
  payments: WorkspaceCollectionCountSummary
  dashboard: WorkspaceDashboardSummary
  settlement: WorkspaceSettlementSummary
}

export type WindowedPage<T> = {
  rows: T[]
  window: WorkspaceCollectionWindow
}

export type CoreWorkspaceBootstrap = {
  health: { status?: string }
  workspaceSummary: WorkspaceBootstrapSummary | null
  operationalResourceDescriptors: OperationalResourceDescriptor[]
}

export type TradesWorkspaceBootstrap = {
  trades: Trade[]
  tradesWindow: WorkspaceCollectionWindow
}

export type EventsWorkspaceBootstrap = {
  events: EventRow[]
}

export type PositionsWorkspaceBootstrap = {
  positions: PositionRow[]
  positionsWindow: WorkspaceCollectionWindow
}

export type RiskWorkspaceBootstrap = {
  optionExposures: OptionExposureRow[]
  optionExposuresWindow: WorkspaceCollectionWindow
}

export type DeliveriesWorkspaceBootstrap = {
  deliveries: DeliveryRecord[]
  deliveriesWindow: WorkspaceCollectionWindow
}

export type OperationsWorkspaceBootstrap = {
  confirmations: TradeConfirmationRecord[]
  confirmationsWindow: WorkspaceCollectionWindow
  workItems: TradeWorkflowItemRecord[]
  workItemsWindow: WorkspaceCollectionWindow
}

export type SettlementWorkspaceBootstrap = {
  invoices: TradeInvoiceRecord[]
  invoicesWindow: WorkspaceCollectionWindow
  payments: TradePaymentRecord[]
  paymentsWindow: WorkspaceCollectionWindow
  workItems: TradeWorkflowItemRecord[]
  workItemsWindow: WorkspaceCollectionWindow
}

export type ReferenceWorkspaceBootstrap = {
  books: ReferenceRecord[]
  commodities: ReferenceRecord[]
  priceIndices: PriceIndexRecord[]
  currencies: CurrencyRecord[]
  units: UnitRecord[]
  locations: LocationRecord[]
  locationStandards: LocationStandards
  counterparties: CounterpartyRecord[]
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  counterpartyExternalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[]
  counterpartyStandards: CounterpartyStandards
  portfolios: PortfolioRecord[]
}

export type ReportsWorkspaceBootstrap = {
  counterpartyCreditReport: CounterpartyCreditReportRow[]
}

export type AdminWorkspaceBootstrap = {
  externalDataRuns: ExternalDataRunRecord[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  tradingSources: TradingSourceRecord[]
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
}

export type WorkspaceBootstrap = CoreWorkspaceBootstrap &
  TradesWorkspaceBootstrap &
  EventsWorkspaceBootstrap &
  PositionsWorkspaceBootstrap &
  RiskWorkspaceBootstrap &
  DeliveriesWorkspaceBootstrap &
  OperationsWorkspaceBootstrap &
  SettlementWorkspaceBootstrap &
  ReferenceWorkspaceBootstrap &
  ReportsWorkspaceBootstrap &
  AdminWorkspaceBootstrap

export type SystemOverview = {
  generated_at: string
  server_status: string
  database_status: string
  database: {
    dialect: string
    name: string
    size_bytes: number | null
    table_count: number
    record_count: number
  }
  uptime_seconds: number
  presence_window_seconds: number
  active_session_count: number
  active_user_count: number
  registered_user_count: number
  active_account_count: number
  open_trade_count: number
  events_last_hour: number
  last_event_recorded_at: string | null
  dependency_count: number
  healthy_dependency_count: number
  dependencies: Array<{
    key: string
    label: string
    provider: string
    run_status: string
    health_status: string
    success_sla_hours: number
    last_run_at: string | null
    last_success_at: string | null
    error_summary: string | null
  }>
}

export type PublicRuntimeSettings = {
  app_version: string
  database: {
    dialect: string
    name: string
    size_bytes: number | null
    table_count: number
    record_count: number
  }
  cors_allow_origins: string[]
  mutation_protection_enabled: boolean
  bootstrap_admin_enabled: boolean
  single_user_auth_enabled: boolean
  google_auth: {
    enabled: boolean
    client_id: string | null
    auto_create_users: boolean
  }
  session_ttl_hours: number
  eia_base_url: string
  eia_timeout_seconds: number
  assistant: AssistantRuntimeSettings
  pagination: {
    standard_default: number
    standard_max: number
    admin_default: number
    admin_max: number
  }
}

type ReadWorkspaceOptions = {
  readHeaders?: HeadersInit | null
}

function withLimit(path: string, limit: number): string {
  return `${path}${path.includes('?') ? '&' : '?'}limit=${limit}`
}

function withOffset(path: string, offset: number): string {
  return `${path}${path.includes('?') ? '&' : '?'}offset=${offset}`
}

function withQueue(path: string, queue: WorkflowQueue): string {
  return `${path}${path.includes('?') ? '&' : '?'}queue=${queue}`
}

function withReadHeaders(
  init: RequestInit | undefined,
  options?: ReadWorkspaceOptions,
): RequestInit | undefined {
  if (!options?.readHeaders) {
    return init
  }

  return {
    ...(init ?? {}),
    headers: options.readHeaders,
  }
}

function toSizedWindowedPage<T>(rows: T[], windowSize: number): WindowedPage<T> {
  const normalizedWindowSize = Math.max(1, windowSize)
  const hasMore = rows.length > normalizedWindowSize

  return {
    rows: hasMore ? rows.slice(0, normalizedWindowSize) : rows,
    window: {
      loadedCount: Math.min(rows.length, normalizedWindowSize),
      hasMore,
    },
  }
}

async function fetchWindowedPage<T>(
  apiBase: string,
  path: string,
  options?: ReadWorkspaceOptions,
  init?: RequestInit,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<T>> {
  const requestLimit = Math.max(1, windowSize) + 1
  const rows = await fetchJson<T[]>(
    `${apiBase}${withLimit(path, requestLimit)}`,
    withReadHeaders(init, options),
  )
  return toSizedWindowedPage(rows, windowSize)
}

export async function loadTradesWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<Trade>> {
  return fetchWindowedPage<Trade>(
    apiBase,
    offset > 0 ? withOffset('/trades', offset) : '/trades',
    options,
    undefined,
    windowSize,
  )
}

export async function loadPositionsWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<PositionRow>> {
  return fetchWindowedPage<PositionRow>(
    apiBase,
    offset > 0 ? withOffset('/positions', offset) : '/positions',
    options,
    undefined,
    windowSize,
  )
}

export async function loadOptionExposuresWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<OptionExposureRow>> {
  return fetchWindowedPage<OptionExposureRow>(
    apiBase,
    offset > 0 ? withOffset('/option-exposures', offset) : '/option-exposures',
    options,
    undefined,
    windowSize,
  )
}

export async function loadDeliveriesWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<DeliveryRecord>> {
  return fetchWindowedPage<DeliveryRecord>(
    apiBase,
    offset > 0 ? withOffset('/deliveries', offset) : '/deliveries',
    options,
    undefined,
    windowSize,
  )
}

export async function loadTradeConfirmationsWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<TradeConfirmationRecord>> {
  return fetchWindowedPage<TradeConfirmationRecord>(
    apiBase,
    offset > 0 ? withOffset('/confirmations', offset) : '/confirmations',
    options,
    { cache: 'no-store' },
    windowSize,
  )
}

export async function loadTradeWorkflowItemsWindow(
  apiBase: string,
  queue: WorkflowQueue,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<TradeWorkflowItemRecord>> {
  const workItemsPath = withQueue('/operations/work-items', queue)

  return fetchWindowedPage<TradeWorkflowItemRecord>(
    apiBase,
    offset > 0 ? withOffset(workItemsPath, offset) : workItemsPath,
    options,
    { cache: 'no-store' },
    windowSize,
  )
}

export async function loadTradeInvoicesWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<TradeInvoiceRecord>> {
  return fetchWindowedPage<TradeInvoiceRecord>(
    apiBase,
    offset > 0 ? withOffset('/settlement/invoices', offset) : '/settlement/invoices',
    options,
    { cache: 'no-store' },
    windowSize,
  )
}

export async function loadTradePaymentsWindow(
  apiBase: string,
  options?: ReadWorkspaceOptions,
  offset = 0,
  windowSize = bootstrapQueryLimits.workspaceRecords,
): Promise<WindowedPage<TradePaymentRecord>> {
  return fetchWindowedPage<TradePaymentRecord>(
    apiBase,
    offset > 0 ? withOffset('/settlement/payments', offset) : '/settlement/payments',
    options,
    { cache: 'no-store' },
    windowSize,
  )
}

async function loadWorkspaceBootstrapSummary(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<WorkspaceBootstrapSummary> {
  return fetchJson<WorkspaceBootstrapSummary>(
    `${apiBase}/operations/workspace-summary`,
    withReadHeaders({ cache: 'no-store' }, options),
  )
}

async function loadOperationalResourceDescriptors(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<OperationalResourceDescriptor[]> {
  return fetchJson<OperationalResourceDescriptor[]>(
    `${apiBase}/operations/resources`,
    withReadHeaders({ cache: 'no-store' }, options),
  )
}

export async function loadCoreWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<CoreWorkspaceBootstrap> {
  const healthPromise = fetchJson<{ status?: string }>(`${apiBase}/health`)

  if (!options?.readHeaders) {
    return {
      health: await healthPromise,
      workspaceSummary: null,
      operationalResourceDescriptors: [],
    }
  }

  const [health, workspaceSummary, operationalResourceDescriptors] = await Promise.all([
    healthPromise,
    loadWorkspaceBootstrapSummary(apiBase, options).catch(() => null),
    loadOperationalResourceDescriptors(apiBase, options).catch(() => []),
  ])

  return {
    health,
    workspaceSummary,
    operationalResourceDescriptors,
  }
}

export async function loadTradeMetadata(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<TradeMetadata> {
  return fetchJson<TradeMetadata>(
    `${apiBase}/trades/metadata`,
    withReadHeaders({ cache: 'no-store' }, options),
  )
}

export async function loadTradesWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<TradesWorkspaceBootstrap> {
  const tradesPage = await loadTradesWindow(apiBase, options)

  return {
    trades: tradesPage.rows,
    tradesWindow: tradesPage.window,
  }
}

export async function loadEventsWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<EventsWorkspaceBootstrap> {
  const events = await fetchJson<EventRow[]>(
    `${apiBase}${withLimit('/events', bootstrapQueryLimits.events)}`,
    withReadHeaders(undefined, options),
  )

  return {
    events,
  }
}

export async function loadPositionsWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<PositionsWorkspaceBootstrap> {
  const positionsPage = await loadPositionsWindow(apiBase, options)

  return {
    positions: positionsPage.rows,
    positionsWindow: positionsPage.window,
  }
}

export async function loadRiskWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<RiskWorkspaceBootstrap> {
  const optionExposuresPage = await loadOptionExposuresWindow(apiBase, options)
  return {
    optionExposures: optionExposuresPage.rows,
    optionExposuresWindow: optionExposuresPage.window,
  }
}

export async function loadDeliveriesWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<DeliveriesWorkspaceBootstrap> {
  const deliveriesPage = await loadDeliveriesWindow(apiBase, options)
  return {
    deliveries: deliveriesPage.rows,
    deliveriesWindow: deliveriesPage.window,
  }
}

export async function loadOperationsWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<OperationsWorkspaceBootstrap> {
  const [confirmationsPage, workItemsPage] = await Promise.all([
    loadTradeConfirmationsWindow(apiBase, options),
    loadTradeWorkflowItemsWindow(apiBase, 'operations', options),
  ])

  return {
    confirmations: confirmationsPage.rows,
    confirmationsWindow: confirmationsPage.window,
    workItems: workItemsPage.rows,
    workItemsWindow: workItemsPage.window,
  }
}

export async function loadSettlementWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<SettlementWorkspaceBootstrap> {
  const [invoicesPage, paymentsPage, workItemsPage] = await Promise.all([
    loadTradeInvoicesWindow(apiBase, options),
    loadTradePaymentsWindow(apiBase, options),
    loadTradeWorkflowItemsWindow(apiBase, 'settlement', options),
  ])

  return {
    invoices: invoicesPage.rows,
    invoicesWindow: invoicesPage.window,
    payments: paymentsPage.rows,
    paymentsWindow: paymentsPage.window,
    workItems: workItemsPage.rows,
    workItemsWindow: workItemsPage.window,
  }
}

export async function loadReferenceWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<ReferenceWorkspaceBootstrap> {
  const [
    books,
    commodities,
    priceIndices,
    currencies,
    units,
    locations,
    locationStandards,
    counterparties,
    counterpartyStandards,
    portfolios,
  ] = await Promise.all([
    fetchJson<ReferenceRecord[]>(
      `${apiBase}${withLimit('/reference/books', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<ReferenceRecord[]>(
      `${apiBase}${withLimit('/reference/commodities', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<PriceIndexRecord[]>(
      `${apiBase}${withLimit('/reference/price-indices', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<CurrencyRecord[]>(
      `${apiBase}${withLimit('/reference/currencies', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<UnitRecord[]>(
      `${apiBase}${withLimit('/reference/units', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<LocationRecord[]>(
      `${apiBase}${withLimit('/reference/locations', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<LocationStandards>(
      `${apiBase}/reference/locations/standards`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<CounterpartyRecord[]>(
      `${apiBase}${withLimit('/reference/counterparties', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<CounterpartyStandards>(
      `${apiBase}/reference/counterparties/standards`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<PortfolioRecord[]>(
      `${apiBase}${withLimit('/reference/portfolios', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
  ])

  let counterpartyCreditProfiles: CounterpartyCreditProfileRecord[] = []
  let counterpartyExternalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[] = []

  const [counterpartyCreditProfilesResult, counterpartyExternalCreditSnapshotsResult] = await Promise.allSettled([
      fetchJson<CounterpartyCreditProfileRecord[]>(
        `${apiBase}${withLimit('/reference/counterparties/credit-profiles', bootstrapQueryLimits.referenceData)}`,
        withReadHeaders(undefined, options),
      ),
      fetchJson<CounterpartyExternalCreditSnapshotRecord[]>(
        `${apiBase}${withLimit('/reference/counterparties/external-credit-snapshots', bootstrapQueryLimits.referenceData)}`,
        withReadHeaders(undefined, options),
      ),
    ])

  if (counterpartyCreditProfilesResult.status === 'fulfilled') {
    counterpartyCreditProfiles = counterpartyCreditProfilesResult.value
  }

  if (counterpartyExternalCreditSnapshotsResult.status === 'fulfilled') {
    counterpartyExternalCreditSnapshots = counterpartyExternalCreditSnapshotsResult.value
  }

  return {
    books,
    commodities,
    priceIndices,
    currencies,
    units,
    locations,
    locationStandards,
    counterparties,
    counterpartyCreditProfiles,
    counterpartyExternalCreditSnapshots,
    counterpartyStandards,
    portfolios,
  }
}

export async function loadReportsWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<ReportsWorkspaceBootstrap> {
  return {
    counterpartyCreditReport: await fetchJson<CounterpartyCreditReportRow[]>(
      `${apiBase}/reports/counterparty-credit`,
      withReadHeaders({ cache: 'no-store' }, options),
    ),
  }
}

export async function loadAdminWorkspaceBootstrap(
  apiBase: string,
  options?: { adminHeaders?: HeadersInit | null },
): Promise<AdminWorkspaceBootstrap> {
  if (!options?.adminHeaders) {
    return {
      externalDataRuns: [],
      externalDataSyncStatus: null,
      tradingSources: [],
      weatherLocations: [],
      weatherSyncStatus: null,
    }
  }

  let externalDataRuns: ExternalDataRunRecord[] = []
  let externalDataSyncStatus: ExternalDataSyncStatusRecord | null = null
  let tradingSources: TradingSourceRecord[] = []
  let weatherLocations: WeatherLocationRecord[] = []
  let weatherSyncStatus: WeatherSyncStatusRecord | null = null

  const [externalDataRunsResult, externalDataSyncStatusResult, tradingSourcesResult, weatherLocationsResult, weatherSyncStatusResult] =
    await Promise.allSettled([
      fetchJson<ExternalDataRunRecord[]>(
        `${apiBase}${withLimit('/admin/external-data/runs', bootstrapQueryLimits.externalDataRuns)}`,
        { headers: options.adminHeaders },
      ),
      fetchJson<ExternalDataSyncStatusRecord>(`${apiBase}/admin/external-data/status`, {
        headers: options.adminHeaders,
        cache: 'no-store',
      }),
      fetchJson<TradingSourceRecord[]>(
        `${apiBase}${withLimit('/admin/trading-sources', bootstrapQueryLimits.tradingSources)}`,
        { headers: options.adminHeaders },
      ),
      loadWeatherLocations(apiBase, {
        headers: options.adminHeaders,
      }),
      fetchJson<WeatherSyncStatusRecord>(`${apiBase}/admin/weather/sync/status?include_inactive=true`, {
        headers: options.adminHeaders,
        cache: 'no-store',
      }),
    ])

  if (externalDataRunsResult.status === 'fulfilled') {
    externalDataRuns = externalDataRunsResult.value
  }

  if (externalDataSyncStatusResult.status === 'fulfilled') {
    externalDataSyncStatus = externalDataSyncStatusResult.value
  }

  if (tradingSourcesResult.status === 'fulfilled') {
    tradingSources = tradingSourcesResult.value
  }

  if (weatherLocationsResult.status === 'fulfilled') {
    weatherLocations = weatherLocationsResult.value
  }

  if (weatherSyncStatusResult.status === 'fulfilled') {
    weatherSyncStatus = weatherSyncStatusResult.value
  }

  return {
    externalDataRuns,
    externalDataSyncStatus,
    tradingSources,
    weatherLocations,
    weatherSyncStatus,
  }
}

export async function loadWorkspaceBootstrap(
  apiBase: string,
  options?: { adminHeaders?: HeadersInit | null; readHeaders?: HeadersInit | null },
): Promise<WorkspaceBootstrap> {
  const [
    core,
    trades,
    events,
    positions,
    risk,
    deliveries,
    operations,
    settlement,
    reference,
    reports,
    admin,
  ] = await Promise.all([
    loadCoreWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadTradesWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadEventsWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadPositionsWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadRiskWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadDeliveriesWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadOperationsWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadSettlementWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadReferenceWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadReportsWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadAdminWorkspaceBootstrap(apiBase, options),
  ])
  const {
    workItems: settlementWorkItems,
    workItemsWindow: settlementWorkItemsWindow,
    ...settlementWorkspace
  } = settlement
  const combinedWorkItems = [...operations.workItems, ...settlementWorkItems]

  return {
    ...core,
    ...trades,
    ...events,
    ...positions,
    ...risk,
    ...deliveries,
    ...operations,
    ...settlementWorkspace,
    ...reference,
    ...reports,
    ...admin,
    workItems: combinedWorkItems,
    workItemsWindow: {
      loadedCount: operations.workItemsWindow.loadedCount + settlementWorkItemsWindow.loadedCount,
      hasMore: operations.workItemsWindow.hasMore || settlementWorkItemsWindow.hasMore,
    },
  }
}

export async function loadPublicRuntimeSettings(apiBase: string): Promise<PublicRuntimeSettings> {
  return fetchJson<PublicRuntimeSettings>(`${apiBase}/settings/public`)
}

export async function loadSystemOverview(apiBase: string): Promise<SystemOverview> {
  return fetchJson<SystemOverview>(`${apiBase}/operations/system-overview`, {
    cache: 'no-store',
  })
}
