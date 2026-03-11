import { fetchJson } from '../../shared/api'
import { bootstrapQueryLimits } from '../../shared/config'

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
  counterparties: unknown[]
  portfolios: unknown[]
  externalDataRuns: unknown[]
  tradingSources: unknown[]
}

export type PublicRuntimeSettings = {
  app_version: string
  cors_allow_origins: string[]
  mutation_protection_enabled: boolean
  bootstrap_admin_enabled: boolean
  session_ttl_hours: number
  eia_base_url: string
  eia_timeout_seconds: number
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
    counterparties,
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
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/counterparties', bootstrapQueryLimits.referenceData)}`),
    fetchJson<unknown[]>(`${apiBase}${withLimit('/reference/portfolios', bootstrapQueryLimits.referenceData)}`),
  ])

  let externalDataRuns: unknown[] = []
  let tradingSources: unknown[] = []

  if (options?.adminHeaders) {
    try {
      ;[externalDataRuns, tradingSources] = await Promise.all([
        fetchJson<unknown[]>(
          `${apiBase}${withLimit('/admin/external-data/runs', bootstrapQueryLimits.externalDataRuns)}`,
          { headers: options.adminHeaders },
        ),
        fetchJson<unknown[]>(
          `${apiBase}${withLimit('/admin/trading-sources', bootstrapQueryLimits.tradingSources)}`,
          { headers: options.adminHeaders },
        ),
      ])
    } catch {
      externalDataRuns = []
      tradingSources = []
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
    counterparties,
    portfolios,
    externalDataRuns,
    tradingSources,
  }
}

export async function loadPublicRuntimeSettings(apiBase: string): Promise<PublicRuntimeSettings> {
  return fetchJson<PublicRuntimeSettings>(`${apiBase}/settings/public`)
}
