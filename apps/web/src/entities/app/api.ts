import { fetchJson } from '../../shared/api'
import { bootstrapQueryLimits } from '../../shared/config'
import { loadWeatherLocations } from '../weather/api'
import type {
  AssistantRuntimeSettings,
  CounterpartyCreditProfileRecord,
  CounterpartyCreditReportRow,
  CounterpartyExternalCreditSnapshotRecord,
  CounterpartyStandards,
  ExternalDataSyncStatusRecord,
  LocationStandards,
  TradeConfirmationRecord,
  TradeInvoiceRecord,
  TradePaymentRecord,
  TradeWorkflowItemRecord,
  WeatherLocationRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'

export type CoreWorkspaceBootstrap = {
  health: { status?: string }
  trades: unknown[]
  events: unknown[]
  positions: unknown[]
}

export type RiskWorkspaceBootstrap = {
  optionExposures: unknown[]
}

export type DeliveriesWorkspaceBootstrap = {
  deliveries: unknown[]
}

export type OperationsWorkspaceBootstrap = {
  confirmations: TradeConfirmationRecord[]
  workItems: TradeWorkflowItemRecord[]
}

export type SettlementWorkspaceBootstrap = {
  invoices: TradeInvoiceRecord[]
  payments: TradePaymentRecord[]
}

export type ReferenceWorkspaceBootstrap = {
  books: unknown[]
  commodities: unknown[]
  priceIndices: unknown[]
  currencies: unknown[]
  units: unknown[]
  locations: unknown[]
  locationStandards: LocationStandards
  counterparties: unknown[]
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  counterpartyExternalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[]
  counterpartyStandards: CounterpartyStandards
  portfolios: unknown[]
}

export type ReportsWorkspaceBootstrap = {
  counterpartyCreditReport: CounterpartyCreditReportRow[]
}

export type AdminWorkspaceBootstrap = {
  externalDataRuns: unknown[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  tradingSources: unknown[]
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
}

export type WorkspaceBootstrap = CoreWorkspaceBootstrap &
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

export async function loadCoreWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<CoreWorkspaceBootstrap> {
  const [health, trades, events, positions] = await Promise.all([
    fetchJson<{ status?: string }>(`${apiBase}/health`),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/trades', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/events', bootstrapQueryLimits.events)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/positions', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders(undefined, options),
    ),
  ])

  return {
    health,
    trades,
    events,
    positions,
  }
}

export async function loadRiskWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<RiskWorkspaceBootstrap> {
  return {
    optionExposures: await fetchJson<unknown[]>(
      `${apiBase}${withLimit('/option-exposures', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders(undefined, options),
    ),
  }
}

export async function loadDeliveriesWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<DeliveriesWorkspaceBootstrap> {
  return {
    deliveries: await fetchJson<unknown[]>(
      `${apiBase}${withLimit('/deliveries', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders(undefined, options),
    ),
  }
}

export async function loadOperationsWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<OperationsWorkspaceBootstrap> {
  const [confirmations, workItems] = await Promise.all([
    fetchJson<TradeConfirmationRecord[]>(
      `${apiBase}${withLimit('/confirmations', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders({ cache: 'no-store' }, options),
    ),
    fetchJson<TradeWorkflowItemRecord[]>(
      `${apiBase}${withLimit('/operations/work-items', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders({ cache: 'no-store' }, options),
    ),
  ])

  return {
    confirmations,
    workItems,
  }
}

export async function loadSettlementWorkspaceBootstrap(
  apiBase: string,
  options?: ReadWorkspaceOptions,
): Promise<SettlementWorkspaceBootstrap> {
  const [invoices, payments] = await Promise.all([
    fetchJson<TradeInvoiceRecord[]>(
      `${apiBase}${withLimit('/settlement/invoices', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders({ cache: 'no-store' }, options),
    ),
    fetchJson<TradePaymentRecord[]>(
      `${apiBase}${withLimit('/settlement/payments', bootstrapQueryLimits.workspaceRecords)}`,
      withReadHeaders({ cache: 'no-store' }, options),
    ),
  ])

  return {
    invoices,
    payments,
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
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/books', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/commodities', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/price-indices', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/currencies', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/units', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/locations', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<LocationStandards>(
      `${apiBase}/reference/locations/standards`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
      `${apiBase}${withLimit('/reference/counterparties', bootstrapQueryLimits.referenceData)}`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<CounterpartyStandards>(
      `${apiBase}/reference/counterparties/standards`,
      withReadHeaders(undefined, options),
    ),
    fetchJson<unknown[]>(
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

  let externalDataRuns: unknown[] = []
  let externalDataSyncStatus: ExternalDataSyncStatusRecord | null = null
  let tradingSources: unknown[] = []
  let weatherLocations: WeatherLocationRecord[] = []
  let weatherSyncStatus: WeatherSyncStatusRecord | null = null

  const [externalDataRunsResult, externalDataSyncStatusResult, tradingSourcesResult, weatherLocationsResult, weatherSyncStatusResult] =
    await Promise.allSettled([
      fetchJson<unknown[]>(
        `${apiBase}${withLimit('/admin/external-data/runs', bootstrapQueryLimits.externalDataRuns)}`,
        { headers: options.adminHeaders },
      ),
      fetchJson<ExternalDataSyncStatusRecord>(`${apiBase}/admin/external-data/status`, {
        headers: options.adminHeaders,
        cache: 'no-store',
      }),
      fetchJson<unknown[]>(
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
    risk,
    deliveries,
    operations,
    settlement,
    reference,
    reports,
    admin,
  ] = await Promise.all([
    loadCoreWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadRiskWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadDeliveriesWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadOperationsWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadSettlementWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadReferenceWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadReportsWorkspaceBootstrap(apiBase, { readHeaders: options?.readHeaders }),
    loadAdminWorkspaceBootstrap(apiBase, options),
  ])

  return {
    ...core,
    ...risk,
    ...deliveries,
    ...operations,
    ...settlement,
    ...reference,
    ...reports,
    ...admin,
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
