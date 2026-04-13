import { postJson } from '../../shared/api'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import type {
  CounterpartyCreditPreviewRecord,
  CounterpartyCreditSnapshotCandidate,
  ExternalDataRunRecord,
} from '../../shared/models'
import type { ExternalDataSyncProvider } from './workspaceDataShared'

export type TradingSourceSeedResult = {
  total_rows: number
  created_count: number
  updated_count: number
}

const externalDataSyncRouteByProvider = {
  EIA: 'eia',
  EIA_FUNDAMENTALS: 'eia-fundamentals',
  FRED: 'fred',
  CFTC: 'cftc',
  CAISO: 'caiso',
  ERCOT: 'ercot',
  KALSHI: 'kalshi',
} as const satisfies Record<ExternalDataSyncProvider, string>

function adminMutationHeaders(): Headers {
  return buildMutationHeaders()
}

export async function runExternalDataSync(
  apiBase: string,
  provider: ExternalDataSyncProvider,
): Promise<ExternalDataRunRecord> {
  const { actorId } = getMutationContext()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/external-data/${externalDataSyncRouteByProvider[provider]}/sync`,
    { requested_by: actorId },
    { headers: adminMutationHeaders() },
  )
}

export async function previewCounterpartyCreditImport(
  apiBase: string,
  rows: unknown[],
  options?: { defaultLimitCurrencyCode?: string },
): Promise<CounterpartyCreditPreviewRecord> {
  return postJson<CounterpartyCreditPreviewRecord>(
    `${apiBase}/admin/external-data/dnb/counterparty-credit/preview`,
    {
      rows,
      default_limit_currency_code: options?.defaultLimitCurrencyCode ?? 'USD',
    },
    { headers: adminMutationHeaders() },
  )
}

export async function importCounterpartyCreditSnapshots(
  apiBase: string,
  snapshots: CounterpartyCreditSnapshotCandidate[],
): Promise<ExternalDataRunRecord> {
  const { actorId } = getMutationContext()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/external-data/counterparty-credit/import`,
    {
      provider: 'DNB',
      snapshots,
      requested_by: actorId,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function seedTradingSources(
  apiBase: string,
  options?: { replaceExisting?: boolean },
): Promise<TradingSourceSeedResult> {
  const { actorId } = getMutationContext()

  return postJson<TradingSourceSeedResult>(
    `${apiBase}/admin/trading-sources/seed`,
    {
      requested_by: actorId,
      replace_existing: options?.replaceExisting ?? true,
    },
    { headers: adminMutationHeaders() },
  )
}

export async function runNwsWeatherSync(apiBase: string): Promise<ExternalDataRunRecord> {
  const { actorId } = getMutationContext()

  return postJson<ExternalDataRunRecord>(
    `${apiBase}/admin/weather/sync/nws`,
    { requested_by: actorId },
    { headers: adminMutationHeaders() },
  )
}
