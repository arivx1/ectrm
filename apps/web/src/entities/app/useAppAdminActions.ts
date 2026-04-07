import { useEffect, useState } from 'react'

import { type CounterpartyCreditPreviewRecord, type ExternalDataRunRecord } from '../../shared/models'
import { postJson } from '../../shared/api'
import { appConfig } from '../../shared/config'
import { buildMutationHeaders, getMutationContext } from '../../shared/mutation'
import { type ExternalDataSyncProvider } from './workspaceDataShared'

type RefreshMutationData = (
  mutation:
    | 'admin-external-data'
    | 'admin-counterparty-credit'
    | 'admin-weather-sync',
) => Promise<void>

export function useAppAdminActions(args: {
  refreshMutationData: RefreshMutationData
  resetKey: string
}) {
  const { refreshMutationData, resetKey } = args
  const [externalDataError, setExternalDataError] = useState<string>('')
  const [externalDataSuccess, setExternalDataSuccess] = useState<string>('')
  const [counterpartyCreditImportDraft, setCounterpartyCreditImportDraft] = useState('')
  const [counterpartyCreditPreview, setCounterpartyCreditPreview] = useState<CounterpartyCreditPreviewRecord | null>(null)
  const [counterpartyCreditPreviewing, setCounterpartyCreditPreviewing] = useState(false)
  const [counterpartyCreditPreviewError, setCounterpartyCreditPreviewError] = useState('')
  const [counterpartyCreditPreviewSuccess, setCounterpartyCreditPreviewSuccess] = useState('')
  const [counterpartyCreditImporting, setCounterpartyCreditImporting] = useState(false)
  const [counterpartyCreditImportError, setCounterpartyCreditImportError] = useState('')
  const [counterpartyCreditImportSuccess, setCounterpartyCreditImportSuccess] = useState('')
  const [tradingSourcesError, setTradingSourcesError] = useState<string>('')
  const [tradingSourcesSuccess, setTradingSourcesSuccess] = useState<string>('')
  const [weatherSyncError, setWeatherSyncError] = useState<string>('')
  const [weatherSyncSuccess, setWeatherSyncSuccess] = useState<string>('')
  const [externalDataSyncing, setExternalDataSyncing] = useState(false)
  const [externalDataSyncingProvider, setExternalDataSyncingProvider] = useState<string | null>(null)
  const [tradingSourcesSyncing, setTradingSourcesSyncing] = useState(false)
  const [weatherSyncing, setWeatherSyncing] = useState(false)

  useEffect(() => {
    setExternalDataError('')
    setExternalDataSuccess('')
    setCounterpartyCreditImportDraft('')
    setCounterpartyCreditPreview(null)
    setCounterpartyCreditPreviewing(false)
    setCounterpartyCreditPreviewError('')
    setCounterpartyCreditPreviewSuccess('')
    setCounterpartyCreditImporting(false)
    setCounterpartyCreditImportError('')
    setCounterpartyCreditImportSuccess('')
    setTradingSourcesError('')
    setTradingSourcesSuccess('')
    setWeatherSyncError('')
    setWeatherSyncSuccess('')
    setExternalDataSyncing(false)
    setExternalDataSyncingProvider(null)
    setTradingSourcesSyncing(false)
    setWeatherSyncing(false)
  }, [resetKey])

  async function handleRunExternalDataSync(provider: ExternalDataSyncProvider) {
    setExternalDataSyncing(true)
    setExternalDataSyncingProvider(provider)
    setExternalDataError('')
    setExternalDataSuccess('')
    try {
      const { actorId } = getMutationContext()
      const routeByProvider: Record<typeof provider, string> = {
        EIA: 'eia',
        EIA_FUNDAMENTALS: 'eia-fundamentals',
        FRED: 'fred',
        CFTC: 'cftc',
        CAISO: 'caiso',
        ERCOT: 'ercot',
        KALSHI: 'kalshi',
      }
      const response = await fetch(`${appConfig.apiBase}/admin/external-data/${routeByProvider[provider]}/sync`, {
        method: 'POST',
        headers: buildMutationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requested_by: actorId }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Failed to run ${provider} sync.`)
      }

      const payload = (await response.json()) as ExternalDataRunRecord
      await refreshMutationData('admin-external-data')
      setExternalDataSuccess(
        `${provider} sync run ${payload.id} finished ${payload.status.toLowerCase()} with ${payload.observation_count} observations.`,
      )
    } catch (nextError) {
      setExternalDataError(nextError instanceof Error ? nextError.message : `Failed to run ${provider} sync.`)
    } finally {
      setExternalDataSyncing(false)
      setExternalDataSyncingProvider(null)
    }
  }

  async function handlePreviewCounterpartyCreditImport() {
    const draft = counterpartyCreditImportDraft.trim()
    if (!draft) {
      setCounterpartyCreditPreviewError('Paste a JSON array of D&B rows before previewing.')
      setCounterpartyCreditPreviewSuccess('')
      return
    }

    let rows: unknown
    try {
      rows = JSON.parse(draft)
    } catch {
      setCounterpartyCreditPreviewError('D&B preview payload must be valid JSON.')
      setCounterpartyCreditPreviewSuccess('')
      return
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      setCounterpartyCreditPreviewError('D&B preview payload must be a non-empty JSON array.')
      setCounterpartyCreditPreviewSuccess('')
      return
    }

    setCounterpartyCreditPreviewing(true)
    setCounterpartyCreditPreviewError('')
    setCounterpartyCreditPreviewSuccess('')
    setCounterpartyCreditImportError('')
    setCounterpartyCreditImportSuccess('')
    try {
      const payload = await postJson<CounterpartyCreditPreviewRecord>(
        `${appConfig.apiBase}/admin/external-data/dnb/counterparty-credit/preview`,
        {
          rows,
          default_limit_currency_code: 'USD',
        },
        { headers: buildMutationHeaders() },
      )

      setCounterpartyCreditPreview(payload)
      setCounterpartyCreditPreviewSuccess(
        `D&B preview analyzed ${payload.total_rows} row${payload.total_rows === 1 ? '' : 's'}: ${payload.ready_rows} ready, ${payload.blocked_rows} blocked.`,
      )
    } catch (nextError) {
      setCounterpartyCreditPreview(null)
      setCounterpartyCreditPreviewError(
        nextError instanceof Error ? nextError.message : 'Failed to preview D&B counterparty credit rows.',
      )
    } finally {
      setCounterpartyCreditPreviewing(false)
    }
  }

  function handleCounterpartyCreditImportDraftChange(value: string) {
    setCounterpartyCreditImportDraft(value)
    setCounterpartyCreditPreview(null)
    setCounterpartyCreditPreviewError('')
    setCounterpartyCreditPreviewSuccess('')
    setCounterpartyCreditImportError('')
    setCounterpartyCreditImportSuccess('')
  }

  async function handleImportCounterpartyCreditSnapshots() {
    const snapshots =
      counterpartyCreditPreview?.rows
        .filter((row) => row.ready_to_import && row.snapshot)
        .map((row) => row.snapshot) ?? []

    if (snapshots.length === 0) {
      setCounterpartyCreditImportError('Preview D&B rows first and make sure at least one row is ready to import.')
      setCounterpartyCreditImportSuccess('')
      return
    }

    setCounterpartyCreditImporting(true)
    setCounterpartyCreditImportError('')
    setCounterpartyCreditImportSuccess('')
    try {
      const { actorId } = getMutationContext()
      const payload = await postJson<ExternalDataRunRecord>(
        `${appConfig.apiBase}/admin/external-data/counterparty-credit/import`,
        {
          provider: 'DNB',
          snapshots,
          requested_by: actorId,
        },
        { headers: buildMutationHeaders() },
      )

      await refreshMutationData('admin-counterparty-credit')
      if (payload.status === 'FAILED') {
        setCounterpartyCreditImportError(
          payload.error_summary || `DNB counterparty credit import run ${payload.id} failed.`,
        )
        return
      }

      setCounterpartyCreditImportSuccess(
        `DNB counterparty credit import run ${payload.id} loaded ${payload.observation_count} snapshot${payload.observation_count === 1 ? '' : 's'}.`,
      )
    } catch (nextError) {
      setCounterpartyCreditImportError(
        nextError instanceof Error ? nextError.message : 'Failed to import counterparty credit snapshots.',
      )
    } finally {
      setCounterpartyCreditImporting(false)
    }
  }

  async function handleSeedTradingSources() {
    setTradingSourcesSyncing(true)
    setTradingSourcesError('')
    setTradingSourcesSuccess('')
    try {
      const { actorId } = getMutationContext()
      const payload = await postJson<{ total_rows: number; created_count: number; updated_count: number }>(
        `${appConfig.apiBase}/admin/trading-sources/seed`,
        { requested_by: actorId, replace_existing: true },
        { headers: buildMutationHeaders() },
      )

      await refreshMutationData('admin-external-data')
      setTradingSourcesSuccess(
        `Trading source register loaded: ${payload.created_count} created, ${payload.updated_count} updated, ${payload.total_rows} total rows.`,
      )
    } catch (nextError) {
      setTradingSourcesError(nextError instanceof Error ? nextError.message : 'Failed to seed trading sources.')
    } finally {
      setTradingSourcesSyncing(false)
    }
  }

  async function handleRunNwsWeatherSync() {
    setWeatherSyncing(true)
    setWeatherSyncError('')
    setWeatherSyncSuccess('')
    try {
      const { actorId } = getMutationContext()
      const response = await fetch(`${appConfig.apiBase}/admin/weather/sync/nws`, {
        method: 'POST',
        headers: buildMutationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requested_by: actorId }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to run NWS weather sync.')
      }

      const payload = (await response.json()) as ExternalDataRunRecord
      await refreshMutationData('admin-weather-sync')
      setWeatherSyncSuccess(
        `NWS sync run ${payload.id} finished ${payload.status.toLowerCase()} with ${payload.series_count} series and ${payload.observation_count} observations.`,
      )
    } catch (nextError) {
      setWeatherSyncError(nextError instanceof Error ? nextError.message : 'Failed to run NWS weather sync.')
    } finally {
      setWeatherSyncing(false)
    }
  }

  return {
    counterpartyCreditImportDraft,
    counterpartyCreditImportError,
    counterpartyCreditImporting,
    counterpartyCreditImportSuccess,
    counterpartyCreditPreview,
    counterpartyCreditPreviewError,
    counterpartyCreditPreviewing,
    counterpartyCreditPreviewSuccess,
    externalDataError,
    externalDataSuccess,
    externalDataSyncing,
    externalDataSyncingProvider,
    handleCounterpartyCreditImportDraftChange,
    handleImportCounterpartyCreditSnapshots,
    handlePreviewCounterpartyCreditImport,
    handleRunExternalDataSync,
    handleRunNwsWeatherSync,
    handleSeedTradingSources,
    tradingSourcesError,
    tradingSourcesSuccess,
    tradingSourcesSyncing,
    weatherSyncError,
    weatherSyncSuccess,
    weatherSyncing,
  }
}
