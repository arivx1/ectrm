import { fetchJson } from '../../shared/api'

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
}

export async function loadWorkspaceBootstrap(apiBase: string): Promise<WorkspaceBootstrap> {
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
    externalDataRuns,
  ] = await Promise.all([
    fetchJson<{ status?: string }>(`${apiBase}/health`),
    fetchJson<unknown[]>(`${apiBase}/trades`),
    fetchJson<unknown[]>(`${apiBase}/events?limit=100`),
    fetchJson<unknown[]>(`${apiBase}/positions`),
    fetchJson<unknown[]>(`${apiBase}/reference/books?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/commodities?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/price-indices?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/currencies?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/units?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/locations?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/counterparties?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/reference/portfolios?limit=500`),
    fetchJson<unknown[]>(`${apiBase}/admin/external-data/runs?limit=10`),
  ])

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
  }
}
