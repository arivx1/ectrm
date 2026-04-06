import { fetchJson } from '../../shared/api'
import { bootstrapQueryLimits } from '../../shared/config'
import type {
  AssistantRuntimeSettings,
  CounterpartyStandards,
  ExternalDataSyncStatusRecord,
  LocationStandards,
  WeatherSyncStatusRecord,
} from '../../shared/models'

export type WorkspaceBootstrap = {
  health: { status?: string }
  trades: unknown[]
  events: unknown[]
  positions: unknown[]
  books: unknown[]
  commodities: unknown[]
  priceIndices: unknown[]
  currencies: unknown[]
  units: unknown[]
  locations: unknown[]
  locationStandards: LocationStandards
  counterparties: unknown[]
  counterpartyStandards: CounterpartyStandards
  portfolios: unknown[]
  externalDataRuns: unknown[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  tradingSources: unknown[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
}

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

function withLimit(path: string, limit: number): string {
  return `${path}?limit=${limit}`
}

export async function loadWorkspaceBootstrap(
  apiBase: string,
  options?: { adminHeaders?: HeadersInit | null },
): Promise<WorkspaceBootstrap> {
  const [
    health,
    trades,
    events,
    positions,
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
    fetchJson<{ status?: string }>(`${apiBase}/health`),
    fetchJson<unknown[]>(`${apiBase}/trades`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/events', bootstrapQueryLimits.events)}`),
    fetchJson<unknown[]>(`${apiBase}/positions`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/books', bootstrapQueryLimits.referenceData)}`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/commodities', bootstrapQueryLimits.referenceData)}`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/price-indices', bootstrapQueryLimits.referenceData)}`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/currencies', bootstrapQueryLimits.referenceData)}`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/units', bootstrapQueryLimits.referenceData)}`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/locations', bootstrapQueryLimits.referenceData)}`),
    fetchJson<LocationStandards>(`${apiBase}/reference/locations/standards`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/counterparties', bootstrapQueryLimits.referenceData)}`),
    fetchJson<CounterpartyStandards>(`${apiBase}/reference/counterparties/standards`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/portfolios', bootstrapQueryLimits.referenceData)}`),
  ])

  let externalDataRuns: unknown[] = []
  let externalDataSyncStatus: ExternalDataSyncStatusRecord | null = null
  let tradingSources: unknown[] = []
  let weatherSyncStatus: WeatherSyncStatusRecord | null = null

  if (options?.adminHeaders) {
    const [externalDataRunsResult, externalDataSyncStatusResult, tradingSourcesResult, weatherSyncStatusResult] =
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
      fetchJson<WeatherSyncStatusRecord>(`${apiBase}/admin/weather/sync/status`, {
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

    if (weatherSyncStatusResult.status === 'fulfilled') {
      weatherSyncStatus = weatherSyncStatusResult.value
    }
  }

  return {
    health,
    trades,
    events,
    positions,
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
    externalDataRuns,
    externalDataSyncStatus,
    tradingSources,
    weatherSyncStatus,
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
