import { useEffect, useRef, useState } from 'react'

import { loadCurrentSession, sendSessionHeartbeat } from '../auth/api'
import { updateTradeWorkflowItem, type UpdateTradeWorkflowItemInput } from '../operations/api'
import {
  createTradeInvoice,
  createTradePayment,
  updateTradeInvoice,
  updateTradePayment,
  type CreateTradeInvoiceInput,
  type CreateTradePaymentInput,
  type UpdateTradeInvoiceInput,
  type UpdateTradePaymentInput,
} from '../settlement/api'
import {
  loadAdminWorkspaceBootstrap,
  loadCoreWorkspaceBootstrap,
  loadDeliveriesWorkspaceBootstrap,
  loadOperationsWorkspaceBootstrap,
  loadReferenceWorkspaceBootstrap,
  loadReportsWorkspaceBootstrap,
  loadRiskWorkspaceBootstrap,
  loadSettlementWorkspaceBootstrap,
} from './api'
import {
  buildRequestedGroups,
  EMPTY_GROUP_ERRORS,
  EMPTY_GROUP_FLAGS,
  VIEW_DATA_GROUPS,
  type AppDataGroup,
  type AppDataGroupErrors,
  type AppDataGroupFlags,
} from './workspaceLoading'
import { buildMutationRefreshGroups } from './workspaceRefresh'
import { ApiError, postJson } from '../../shared/api'
import { appConfig } from '../../shared/config'
import {
  buildMutationHeaders,
  clearStoredAuthSession,
  getMutationContext,
  getStoredAuthSession,
  saveStoredAuthSession,
  type StoredAuthSession,
} from '../../shared/mutation'
import {
  DEFAULT_COUNTERPARTY_STANDARDS,
  DEFAULT_LOCATION_STANDARDS,
} from '../../shared/models'
import type {
  CounterpartyCreditPreviewRecord,
  CounterpartyCreditProfileRecord,
  CounterpartyCreditReportRow,
  CounterpartyExternalCreditSnapshotRecord,
  CounterpartyStandards,
  CounterpartyRecord,
  CurrencyRecord,
  EventRow,
  ExternalDataRunRecord,
  ExternalDataSyncStatusRecord,
  LocationRecord,
  LocationStandards,
  OptionExposureRow,
  PositionRow,
  DeliveryRecord,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  TradeInvoiceRecord,
  TradePaymentRecord,
  TradeWorkflowItemRecord,
  TradingSourceRecord,
  UnitRecord,
  ViewKey,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import { buildTradeCreditHoldSummary } from '../../shared/trading'

type ExternalDataSyncProvider = 'EIA' | 'EIA_FUNDAMENTALS' | 'FRED' | 'CFTC' | 'CAISO' | 'ERCOT' | 'KALSHI'

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function sessionHeaders(session: StoredAuthSession): Headers {
  return new Headers({ Authorization: `Bearer ${session.accessToken}` })
}

function creditApprovalItemsByTradeId(items: TradeWorkflowItemRecord[]): Map<string, TradeWorkflowItemRecord> {
  return new Map(
    items
      .filter((item) => item.workflow_type === 'CREDIT_APPROVAL')
      .map((item) => [item.trade_id, item] as const),
  )
}

function decorateTradesWithWorkflowItems(rows: Trade[], items: TradeWorkflowItemRecord[]): Trade[] {
  const itemsByTradeId = creditApprovalItemsByTradeId(items)

  return rows.map((trade) => ({
    ...trade,
    active_credit_exception: itemsByTradeId.get(trade.trade_id)?.active_credit_exception ?? null,
    ...buildTradeCreditHoldSummary(itemsByTradeId.get(trade.trade_id)),
  }))
}

function decorateWorkflowItems(rows: TradeWorkflowItemRecord[]): TradeWorkflowItemRecord[] {
  const itemsByTradeId = creditApprovalItemsByTradeId(rows)

  return rows.map((item) => ({
    ...item,
    active_credit_exception: itemsByTradeId.get(item.trade_id)?.active_credit_exception ?? null,
    ...buildTradeCreditHoldSummary(itemsByTradeId.get(item.trade_id)),
  }))
}

function apiReachabilityMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }

  return `Could not reach API. Make sure backend is running on ${appConfig.apiDisplayHost} and CORS is enabled.`
}

export function useAppWorkspaceData(currentView: ViewKey) {
  const [health, setHealth] = useState<string>('checking...')
  const [trades, setTrades] = useState<Trade[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [optionExposures, setOptionExposures] = useState<OptionExposureRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  const [tradeWorkflowItems, setTradeWorkflowItems] = useState<TradeWorkflowItemRecord[]>([])
  const [tradeInvoices, setTradeInvoices] = useState<TradeInvoiceRecord[]>([])
  const [tradePayments, setTradePayments] = useState<TradePaymentRecord[]>([])
  const [books, setBooks] = useState<ReferenceRecord[]>([])
  const [commodities, setCommodities] = useState<ReferenceRecord[]>([])
  const [priceIndices, setPriceIndices] = useState<PriceIndexRecord[]>([])
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([])
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [locationStandards, setLocationStandards] = useState<LocationStandards>(DEFAULT_LOCATION_STANDARDS)
  const [counterpartyStandards, setCounterpartyStandards] = useState<CounterpartyStandards>(
    DEFAULT_COUNTERPARTY_STANDARDS,
  )
  const [counterparties, setCounterparties] = useState<CounterpartyRecord[]>([])
  const [counterpartyCreditProfiles, setCounterpartyCreditProfiles] = useState<CounterpartyCreditProfileRecord[]>([])
  const [counterpartyExternalCreditSnapshots, setCounterpartyExternalCreditSnapshots] = useState<CounterpartyExternalCreditSnapshotRecord[]>([])
  const [counterpartyCreditReport, setCounterpartyCreditReport] = useState<CounterpartyCreditReportRow[]>([])
  const [portfolios, setPortfolios] = useState<PortfolioRecord[]>([])
  const [externalDataRuns, setExternalDataRuns] = useState<ExternalDataRunRecord[]>([])
  const [externalDataSyncStatus, setExternalDataSyncStatus] = useState<ExternalDataSyncStatusRecord | null>(null)
  const [tradingSources, setTradingSources] = useState<TradingSourceRecord[]>([])
  const [weatherSyncStatus, setWeatherSyncStatus] = useState<WeatherSyncStatusRecord | null>(null)
  const [workflowMutationError, setWorkflowMutationError] = useState('')
  const [workflowMutationPendingId, setWorkflowMutationPendingId] = useState<number | null>(null)
  const [invoiceMutationError, setInvoiceMutationError] = useState('')
  const [invoiceMutationPendingKey, setInvoiceMutationPendingKey] = useState<string | null>(null)
  const [paymentMutationError, setPaymentMutationError] = useState('')
  const [paymentMutationPendingKey, setPaymentMutationPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
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
  const [appLoading, setAppLoading] = useState(true)
  const [groupLoaded, setGroupLoaded] = useState<AppDataGroupFlags>(() => ({ ...EMPTY_GROUP_FLAGS }))
  const [groupLoading, setGroupLoading] = useState<AppDataGroupFlags>(() => ({ ...EMPTY_GROUP_FLAGS }))
  const [groupErrors, setGroupErrors] = useState<AppDataGroupErrors>(() => ({ ...EMPTY_GROUP_ERRORS }))
  const [externalDataSyncing, setExternalDataSyncing] = useState(false)
  const [externalDataSyncingProvider, setExternalDataSyncingProvider] = useState<string | null>(null)
  const [tradingSourcesSyncing, setTradingSourcesSyncing] = useState(false)
  const [weatherSyncing, setWeatherSyncing] = useState(false)
  const [authSession, setAuthSession] = useState<StoredAuthSession | null>(() => getStoredAuthSession())

  const tradeWorkflowItemsRef = useRef(tradeWorkflowItems)
  tradeWorkflowItemsRef.current = tradeWorkflowItems
  const groupLoadedRef = useRef(groupLoaded)
  groupLoadedRef.current = groupLoaded

  function markGroupLoaded(group: AppDataGroup, loaded: boolean) {
    setGroupLoaded((current) => ({ ...current, [group]: loaded }))
  }

  function markGroupLoading(group: AppDataGroup, loading: boolean) {
    setGroupLoading((current) => ({ ...current, [group]: loading }))
  }

  function setGroupError(group: AppDataGroup, message: string) {
    setGroupErrors((current) => ({ ...current, [group]: message }))
  }

  function resetDeferredWorkspaceData() {
    setOptionExposures([])
    setDeliveries([])
    tradeWorkflowItemsRef.current = []
    setTradeWorkflowItems([])
    setTradeInvoices([])
    setTradePayments([])
    setTrades((current) => decorateTradesWithWorkflowItems(current, []))
    setBooks([])
    setCommodities([])
    setPriceIndices([])
    setCurrencies([])
    setUnits([])
    setLocations([])
    setLocationStandards(DEFAULT_LOCATION_STANDARDS)
    setCounterparties([])
    setCounterpartyCreditProfiles([])
    setCounterpartyExternalCreditSnapshots([])
    setCounterpartyCreditReport([])
    setCounterpartyStandards(DEFAULT_COUNTERPARTY_STANDARDS)
    setPortfolios([])
    setExternalDataRuns([])
    setExternalDataSyncStatus(null)
    setTradingSources([])
    setWeatherSyncStatus(null)
    setCounterpartyCreditImportDraft('')
    setCounterpartyCreditPreview(null)
    setCounterpartyCreditPreviewError('')
    setCounterpartyCreditPreviewSuccess('')
    setCounterpartyCreditImportError('')
    setCounterpartyCreditImportSuccess('')
    setExternalDataError('')
    setExternalDataSuccess('')
    setTradingSourcesError('')
    setTradingSourcesSuccess('')
    setWeatherSyncError('')
    setWeatherSyncSuccess('')
    setGroupLoaded({ ...EMPTY_GROUP_FLAGS })
    setGroupLoading({ ...EMPTY_GROUP_FLAGS })
    setGroupErrors({ ...EMPTY_GROUP_ERRORS })
  }

  async function loadData(options?: {
    sessionOverride?: StoredAuthSession | null
    groups?: AppDataGroup[]
    force?: boolean
  }) {
    const currentSession = options?.sessionOverride ?? authSession
    const force = options?.force ?? true
    const requestedGroups = buildRequestedGroups({
      currentView,
      force,
      groupLoaded,
      groupLoading,
      groups: options?.groups,
    })

    if (requestedGroups.length === 0) {
      return
    }

    async function loadGroup(group: AppDataGroup) {
      markGroupLoading(group, true)
      setGroupError(group, '')

      try {
        switch (group) {
          case 'core': {
            const { health: healthJson, trades: tradesJson, events: eventsJson, positions: positionsJson } =
              await loadCoreWorkspaceBootstrap(appConfig.apiBase)
            const nextTrades = decorateTradesWithWorkflowItems(
              tradesJson as Trade[],
              tradeWorkflowItemsRef.current,
            )

            setHealth(healthJson.status ?? 'unknown')
            setTrades(nextTrades)
            setEvents(eventsJson as EventRow[])
            setPositions(positionsJson as PositionRow[])
            setError('')
            markGroupLoaded(group, true)
            return
          }
          case 'reference': {
            const payload = await loadReferenceWorkspaceBootstrap(appConfig.apiBase)
            setBooks(payload.books as ReferenceRecord[])
            setCommodities(payload.commodities as ReferenceRecord[])
            setPriceIndices(payload.priceIndices as PriceIndexRecord[])
            setCurrencies(payload.currencies as CurrencyRecord[])
            setUnits(payload.units as UnitRecord[])
            setLocations(payload.locations as LocationRecord[])
            setLocationStandards(payload.locationStandards as LocationStandards)
            setCounterparties(payload.counterparties as CounterpartyRecord[])
            setCounterpartyCreditProfiles(payload.counterpartyCreditProfiles as CounterpartyCreditProfileRecord[])
            setCounterpartyExternalCreditSnapshots(
              payload.counterpartyExternalCreditSnapshots as CounterpartyExternalCreditSnapshotRecord[],
            )
            setCounterpartyStandards(payload.counterpartyStandards as CounterpartyStandards)
            setPortfolios(payload.portfolios as PortfolioRecord[])
            markGroupLoaded(group, true)
            return
          }
          case 'risk': {
            const payload = await loadRiskWorkspaceBootstrap(appConfig.apiBase)
            setOptionExposures(payload.optionExposures as OptionExposureRow[])
            markGroupLoaded(group, true)
            return
          }
          case 'deliveries': {
            const payload = await loadDeliveriesWorkspaceBootstrap(appConfig.apiBase)
            setDeliveries(payload.deliveries as DeliveryRecord[])
            markGroupLoaded(group, true)
            return
          }
          case 'operations': {
            const payload = await loadOperationsWorkspaceBootstrap(appConfig.apiBase)
            const nextTradeWorkflowItems = decorateWorkflowItems(payload.workItems as TradeWorkflowItemRecord[])
            tradeWorkflowItemsRef.current = nextTradeWorkflowItems
            setTradeWorkflowItems(nextTradeWorkflowItems)
            setTrades((current) => decorateTradesWithWorkflowItems(current, nextTradeWorkflowItems))
            markGroupLoaded(group, true)
            return
          }
          case 'settlement': {
            const payload = await loadSettlementWorkspaceBootstrap(appConfig.apiBase)
            setTradeInvoices(payload.invoices as TradeInvoiceRecord[])
            setTradePayments(payload.payments as TradePaymentRecord[])
            markGroupLoaded(group, true)
            return
          }
          case 'reports': {
            const payload = await loadReportsWorkspaceBootstrap(appConfig.apiBase)
            setCounterpartyCreditReport(payload.counterpartyCreditReport as CounterpartyCreditReportRow[])
            markGroupLoaded(group, true)
            return
          }
          case 'admin': {
            const payload = await loadAdminWorkspaceBootstrap(appConfig.apiBase, {
              adminHeaders:
                currentSession && hasAdministrativeAccess(currentSession)
                  ? sessionHeaders(currentSession)
                  : null,
            })
            setExternalDataRuns(payload.externalDataRuns as ExternalDataRunRecord[])
            setExternalDataSyncStatus(payload.externalDataSyncStatus as ExternalDataSyncStatusRecord | null)
            setTradingSources(payload.tradingSources as TradingSourceRecord[])
            setWeatherSyncStatus(payload.weatherSyncStatus as WeatherSyncStatusRecord | null)
            markGroupLoaded(group, true)
          }
        }
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : `Could not load ${group === 'core' ? 'the app shell' : `${group} workspace data`}.`
        setGroupError(group, message)
        if (group === 'core') {
          setError(message)
        }
        throw nextError instanceof Error ? nextError : new Error(message)
      } finally {
        markGroupLoading(group, false)
        if (group === 'core') {
          setAppLoading(false)
        }
      }
    }

    if (requestedGroups.includes('core')) {
      await loadGroup('core')
    }

    const deferredGroups = requestedGroups.filter((group) => group !== 'core')
    await Promise.allSettled(deferredGroups.map((group) => loadGroup(group)))
  }

  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  function mutationRefreshGroups(mutation: Parameters<typeof buildMutationRefreshGroups>[0]['mutation']) {
    return buildMutationRefreshGroups({
      currentView,
      groupLoaded: groupLoadedRef.current,
      mutation,
    })
  }

  async function handleSaveWorkflowItem(itemId: number, payload: UpdateTradeWorkflowItemInput) {
    setWorkflowMutationError('')
    setWorkflowMutationPendingId(itemId)

    try {
      await updateTradeWorkflowItem(appConfig.apiBase, itemId, payload)
      await loadDataRef.current({
        groups: mutationRefreshGroups('workflow-item'),
        force: true,
      })
    } catch (nextError) {
      setWorkflowMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to update workflow item.',
      )
    } finally {
      setWorkflowMutationPendingId((current) => (current === itemId ? null : current))
    }
  }

  async function handleIssueTradeInvoice(tradeId: string, payload: CreateTradeInvoiceInput) {
    const pendingKey = `trade:${tradeId}`
    setInvoiceMutationError('')
    setInvoiceMutationPendingKey(pendingKey)

    try {
      await createTradeInvoice(appConfig.apiBase, payload)
      await loadDataRef.current({
        groups: mutationRefreshGroups('invoice'),
        force: true,
      })
    } catch (nextError) {
      setInvoiceMutationError(nextError instanceof Error ? nextError.message : 'Failed to issue invoice.')
    } finally {
      setInvoiceMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleUpdateTradeInvoice(invoiceId: number, payload: UpdateTradeInvoiceInput) {
    const pendingKey = `invoice:${invoiceId}`
    setInvoiceMutationError('')
    setInvoiceMutationPendingKey(pendingKey)

    try {
      await updateTradeInvoice(appConfig.apiBase, invoiceId, payload)
      await loadDataRef.current({
        groups: mutationRefreshGroups('invoice'),
        force: true,
      })
    } catch (nextError) {
      setInvoiceMutationError(nextError instanceof Error ? nextError.message : 'Failed to update invoice.')
    } finally {
      setInvoiceMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleCreateTradePayment(invoiceId: number, payload: CreateTradePaymentInput) {
    const pendingKey = `invoice:${invoiceId}:new`
    setPaymentMutationError('')
    setPaymentMutationPendingKey(pendingKey)

    try {
      await createTradePayment(appConfig.apiBase, payload)
      await loadDataRef.current({
        groups: mutationRefreshGroups('payment'),
        force: true,
      })
    } catch (nextError) {
      setPaymentMutationError(nextError instanceof Error ? nextError.message : 'Failed to create payment.')
    } finally {
      setPaymentMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleUpdateTradePayment(paymentId: number, payload: UpdateTradePaymentInput) {
    const pendingKey = `payment:${paymentId}`
    setPaymentMutationError('')
    setPaymentMutationPendingKey(pendingKey)

    try {
      await updateTradePayment(appConfig.apiBase, paymentId, payload)
      await loadDataRef.current({
        groups: mutationRefreshGroups('payment'),
        force: true,
      })
    } catch (nextError) {
      setPaymentMutationError(nextError instanceof Error ? nextError.message : 'Failed to update payment.')
    } finally {
      setPaymentMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function refreshAuthSession(): Promise<StoredAuthSession | null> {
    const storedSession = getStoredAuthSession()
    if (!storedSession) {
      setAuthSession(null)
      return null
    }

    try {
      const current = await loadCurrentSession(appConfig.apiBase)
      const nextSession: StoredAuthSession = {
        sessionId: current.session_id,
        accessToken: storedSession.accessToken,
        expiresAt: current.expires_at,
        user: current.user,
      }
      saveStoredAuthSession(nextSession)
      setAuthSession(nextSession)
      return nextSession
    } catch {
      clearStoredAuthSession()
      setAuthSession(null)
      return null
    }
  }

  async function handleSessionChange(nextSession: StoredAuthSession | null) {
    if (nextSession) {
      saveStoredAuthSession(nextSession)
    } else {
      clearStoredAuthSession()
    }

    setAppLoading(true)
    resetDeferredWorkspaceData()
    setAuthSession(nextSession)

    try {
      await loadData({
        sessionOverride: nextSession,
        groups: ['core'],
        force: true,
      })
    } catch (nextError) {
      setError(apiReachabilityMessage(nextError))
    }
  }

  async function refreshTradingSources(sessionOverride?: StoredAuthSession | null) {
    const currentSession = sessionOverride ?? authSession
    if (!currentSession || !hasAdministrativeAccess(currentSession)) {
      setTradingSources([])
      return []
    }

    const payload = await loadAdminWorkspaceBootstrap(appConfig.apiBase, {
      adminHeaders: sessionHeaders(currentSession),
    })
    const rows = payload.tradingSources as TradingSourceRecord[]
    setTradingSources(rows)
    return rows
  }

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
      await loadDataRef.current({
        groups: mutationRefreshGroups('admin-external-data'),
        force: true,
      })
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

      await loadDataRef.current({
        groups: mutationRefreshGroups('admin-counterparty-credit'),
        force: true,
      })
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
      setTradingSourcesSuccess(
        `Trading source register loaded: ${payload.created_count} created, ${payload.updated_count} updated, ${payload.total_rows} total rows.`,
      )

      try {
        await refreshTradingSources()
      } catch (refreshError) {
        setTradingSourcesError(
          refreshError instanceof Error
            ? `Trading sources were seeded, but the follow-up refresh failed: ${refreshError.message}`
            : 'Trading sources were seeded, but the follow-up refresh failed.',
        )
      }
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
      await loadDataRef.current({
        groups: mutationRefreshGroups('admin-weather-sync'),
        force: true,
      })
      setWeatherSyncSuccess(
        `NWS sync run ${payload.id} finished ${payload.status.toLowerCase()} with ${payload.series_count} series and ${payload.observation_count} observations.`,
      )
    } catch (nextError) {
      setWeatherSyncError(nextError instanceof Error ? nextError.message : 'Failed to run NWS weather sync.')
    } finally {
      setWeatherSyncing(false)
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const session = await refreshAuthSession()
        await loadDataRef.current({
          sessionOverride: session,
          groups: ['core'],
          force: true,
        })
      } catch (nextError) {
        setAppLoading(false)
        setError(apiReachabilityMessage(nextError))
      }
    }

    void init()
  }, [])

  useEffect(() => {
    if (appLoading || error) {
      return
    }

    void loadDataRef.current({
      groups: VIEW_DATA_GROUPS[currentView],
      force: false,
    })
  }, [appLoading, currentView, error])

  useEffect(() => {
    if (!authSession) {
      return
    }

    let cancelled = false

    async function heartbeat() {
      try {
        await sendSessionHeartbeat(appConfig.apiBase)
      } catch {
        if (!cancelled) {
          // Presence refresh should stay quiet; the authenticated workspace already surfaces session failures elsewhere.
        }
      }
    }

    function handleFocus() {
      void heartbeat()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void heartbeat()
      }
    }

    void heartbeat()
    const intervalId = window.setInterval(() => {
      void heartbeat()
    }, 45000)

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authSession])

  return {
    authSession,
    appLoading,
    books,
    commodities,
    counterparties,
    counterpartyCreditImportDraft,
    counterpartyCreditImportError,
    counterpartyCreditImporting,
    counterpartyCreditImportSuccess,
    counterpartyCreditPreview,
    counterpartyCreditPreviewError,
    counterpartyCreditPreviewing,
    counterpartyCreditPreviewSuccess,
    counterpartyCreditProfiles,
    counterpartyCreditReport,
    counterpartyExternalCreditSnapshots,
    counterpartyStandards,
    currencies,
    deliveries,
    error,
    events,
    externalDataError,
    externalDataRuns,
    externalDataSuccess,
    externalDataSyncStatus,
    externalDataSyncing,
    externalDataSyncingProvider,
    groupErrors,
    groupLoaded,
    groupLoading,
    handleCounterpartyCreditImportDraftChange,
    handleCreateTradePayment,
    handleImportCounterpartyCreditSnapshots,
    handleIssueTradeInvoice,
    handlePreviewCounterpartyCreditImport,
    handleRunExternalDataSync,
    handleRunNwsWeatherSync,
    handleSaveWorkflowItem,
    handleSeedTradingSources,
    handleSessionChange,
    handleUpdateTradeInvoice,
    handleUpdateTradePayment,
    health,
    invoiceMutationError,
    invoiceMutationPendingKey,
    loadData,
    locationStandards,
    locations,
    optionExposures,
    paymentMutationError,
    paymentMutationPendingKey,
    portfolios,
    positions,
    priceIndices,
    setError,
    tradeInvoices,
    tradePayments,
    tradeWorkflowItems,
    trades,
    tradingSources,
    tradingSourcesError,
    tradingSourcesSuccess,
    tradingSourcesSyncing,
    units,
    weatherSyncError,
    weatherSyncStatus,
    weatherSyncSuccess,
    weatherSyncing,
    workflowMutationError,
    workflowMutationPendingId,
  }
}
