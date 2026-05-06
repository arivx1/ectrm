import { useEffect, useRef, useState } from 'react'

import { loadCurrentSession, sendSessionHeartbeat } from '../auth/api'
import {
  loadAdminWorkspaceBootstrap,
  loadCoreWorkspaceBootstrap,
  loadDeliveriesWindow,
  loadDeliveriesWorkspaceBootstrap,
  loadEventsWorkspaceBootstrap,
  loadOptionExposuresWindow,
  loadOperationsWorkspaceBootstrap,
  loadPositionsWorkspaceBootstrap,
  loadPositionsWindow,
  loadReferenceWorkspaceBootstrap,
  loadReportsWorkspaceBootstrap,
  loadTradeConfirmationsWindow,
  loadTradeInvoicesWindow,
  loadTradeMetadata,
  loadTradePaymentsWindow,
  loadTradesWorkspaceBootstrap,
  loadTradesWindow,
  loadTradeWorkflowItemsWindow,
  loadRiskWorkspaceBootstrap,
  loadSettlementWorkspaceBootstrap,
  loadWeatherWorkspaceBootstrap,
  type WorkspaceBootstrapSummary,
  type WorkspaceCollectionWindow,
  type OperationalResourceDescriptor,
} from './api'
import {
  buildMutationRefreshGroups,
  buildTargetedMutationRefreshPlan,
  type WorkspaceCollectionKey,
  type WorkspaceMutationKind,
} from './workspaceRefresh'
import {
  buildRequestedGroups,
  EMPTY_GROUP_ERRORS,
  EMPTY_GROUP_FLAGS,
  VIEW_DATA_GROUPS,
  type AppDataGroup,
  type AppDataGroupErrors,
  type AppDataGroupFlags,
} from './workspaceLoading'
import {
  apiReachabilityMessage,
  decorateTradesWithWorkflowItems,
  decorateWorkflowItems,
  hasAdministrativeAccess,
  isAuthenticationError,
  sessionHeaders,
} from './workspaceDataShared'
import { appConfig, bootstrapQueryLimits } from '../../shared/config'
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  saveStoredAuthSession,
  type StoredAuthSession,
} from '../../shared/mutation'
import { buildFallbackTradeMetadata, type TradeMetadata } from '../../shared/tradeMetadata'
import {
  DEFAULT_ASSET_STANDARDS,
  DEFAULT_COUNTERPARTY_STANDARDS,
  DEFAULT_LOCATION_STANDARDS,
  DEFAULT_SPATIAL_FEATURE_STANDARDS,
} from '../../shared/models'
import type {
  AssetRecord,
  AssetStandards,
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
  SpatialFeatureRecord,
  SpatialFeatureStandards,
  Trade,
  TradeConfirmationRecord,
  TradeInvoiceRecord,
  TradePaymentRecord,
  TradeWorkflowItemRecord,
  TradingSourceRecord,
  UnitRecord,
  ViewKey,
  WeatherLocationRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import type { AuthInterruptionReason } from '../../shared/authInterruptionResume'

type LoadDataOptions = {
  sessionOverride?: StoredAuthSession | null
  groups?: AppDataGroup[]
  force?: boolean
}

type WorkspaceCollectionWindows = Record<WorkspaceCollectionKey, WorkspaceCollectionWindow>
type WorkspaceCollectionLoadingFlags = Record<WorkspaceCollectionKey, boolean>
type WorkspaceCollectionErrors = Record<WorkspaceCollectionKey, string>

function createEmptyCollectionWindows(): WorkspaceCollectionWindows {
  return {
    trades: { loadedCount: 0, hasMore: false },
    positions: { loadedCount: 0, hasMore: false },
    optionExposures: { loadedCount: 0, hasMore: false },
    deliveries: { loadedCount: 0, hasMore: false },
    confirmations: { loadedCount: 0, hasMore: false },
    operationsWorkItems: { loadedCount: 0, hasMore: false },
    settlementWorkItems: { loadedCount: 0, hasMore: false },
    invoices: { loadedCount: 0, hasMore: false },
    payments: { loadedCount: 0, hasMore: false },
  }
}

const EMPTY_COLLECTION_LOADING: WorkspaceCollectionLoadingFlags = {
  trades: false,
  positions: false,
  optionExposures: false,
  deliveries: false,
  confirmations: false,
  operationsWorkItems: false,
  settlementWorkItems: false,
  invoices: false,
  payments: false,
}

const EMPTY_COLLECTION_ERRORS: WorkspaceCollectionErrors = {
  trades: '',
  positions: '',
  optionExposures: '',
  deliveries: '',
  confirmations: '',
  operationsWorkItems: '',
  settlementWorkItems: '',
  invoices: '',
  payments: '',
}

function mergeCollectionRows<T>(
  currentRows: T[],
  nextRows: T[],
  getKey: (row: T) => PropertyKey,
): T[] {
  const seenKeys = new Set(currentRows.map((row) => getKey(row)))
  const appendedRows = nextRows.filter((row) => {
    const key = getKey(row)
    if (seenKeys.has(key)) {
      return false
    }
    seenKeys.add(key)
    return true
  })

  return [...currentRows, ...appendedRows]
}

export function useAppWorkspaceBootstrap(currentView: ViewKey) {
  const [health, setHealth] = useState<string>('checking...')
  const [trades, setTrades] = useState<Trade[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [optionExposures, setOptionExposures] = useState<OptionExposureRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  const [tradeConfirmations, setTradeConfirmations] = useState<TradeConfirmationRecord[]>([])
  const [operationsTradeWorkflowItems, setOperationsTradeWorkflowItems] = useState<TradeWorkflowItemRecord[]>([])
  const [settlementTradeWorkflowItems, setSettlementTradeWorkflowItems] = useState<TradeWorkflowItemRecord[]>([])
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
  const [spatialFeatures, setSpatialFeatures] = useState<SpatialFeatureRecord[]>([])
  const [spatialFeatureStandards, setSpatialFeatureStandards] = useState<SpatialFeatureStandards>(
    DEFAULT_SPATIAL_FEATURE_STANDARDS,
  )
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [assetStandards, setAssetStandards] = useState<AssetStandards>(DEFAULT_ASSET_STANDARDS)
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
  const [weatherLocations, setWeatherLocations] = useState<WeatherLocationRecord[]>([])
  const [weatherSyncStatus, setWeatherSyncStatus] = useState<WeatherSyncStatusRecord | null>(null)
  const [workspaceBootstrapSummary, setWorkspaceBootstrapSummary] = useState<WorkspaceBootstrapSummary | null>(null)
  const [operationalResourceDescriptors, setOperationalResourceDescriptors] = useState<OperationalResourceDescriptor[]>([])
  const [tradeMetadata, setTradeMetadata] = useState<TradeMetadata>(() => buildFallbackTradeMetadata())
  const [tradeMetadataSource, setTradeMetadataSource] = useState<'server' | 'fallback'>('fallback')
  const [tradeMetadataError, setTradeMetadataError] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [appLoading, setAppLoading] = useState(true)
  const [groupLoaded, setGroupLoaded] = useState<AppDataGroupFlags>(() => ({ ...EMPTY_GROUP_FLAGS }))
  const [groupLoading, setGroupLoading] = useState<AppDataGroupFlags>(() => ({ ...EMPTY_GROUP_FLAGS }))
  const [groupErrors, setGroupErrors] = useState<AppDataGroupErrors>(() => ({ ...EMPTY_GROUP_ERRORS }))
  const [authSession, setAuthSession] = useState<StoredAuthSession | null>(() => getStoredAuthSession())
  const [authInterruptionReason, setAuthInterruptionReason] = useState<AuthInterruptionReason | null>(null)
  const [collectionWindows, setCollectionWindows] = useState<WorkspaceCollectionWindows>(() =>
    createEmptyCollectionWindows(),
  )
  const [collectionLoadingMore, setCollectionLoadingMore] = useState<WorkspaceCollectionLoadingFlags>(() => ({
    ...EMPTY_COLLECTION_LOADING,
  }))
  const [collectionErrors, setCollectionErrors] = useState<WorkspaceCollectionErrors>(() => ({
    ...EMPTY_COLLECTION_ERRORS,
  }))

  const collectionWindowsRef = useRef(collectionWindows)
  collectionWindowsRef.current = collectionWindows

  const operationsTradeWorkflowItemsRef = useRef(operationsTradeWorkflowItems)
  operationsTradeWorkflowItemsRef.current = operationsTradeWorkflowItems

  const settlementTradeWorkflowItemsRef = useRef(settlementTradeWorkflowItems)
  settlementTradeWorkflowItemsRef.current = settlementTradeWorkflowItems

  const tradeWorkflowItemsRef = useRef(tradeWorkflowItems)
  tradeWorkflowItemsRef.current = tradeWorkflowItems

  const groupLoadedRef = useRef(groupLoaded)
  groupLoadedRef.current = groupLoaded

  function buildTradeWorkflowItems(
    operationsRows: TradeWorkflowItemRecord[],
    settlementRows: TradeWorkflowItemRecord[],
  ): TradeWorkflowItemRecord[] {
    return decorateWorkflowItems(
      mergeCollectionRows(operationsRows, settlementRows, (item) => item.item_id),
    )
  }

  function syncTradeWorkflowItems(
    nextOperationsRows: TradeWorkflowItemRecord[],
    nextSettlementRows: TradeWorkflowItemRecord[],
  ): TradeWorkflowItemRecord[] {
    operationsTradeWorkflowItemsRef.current = nextOperationsRows
    settlementTradeWorkflowItemsRef.current = nextSettlementRows
    setOperationsTradeWorkflowItems(nextOperationsRows)
    setSettlementTradeWorkflowItems(nextSettlementRows)

    const nextTradeWorkflowItems = buildTradeWorkflowItems(nextOperationsRows, nextSettlementRows)
    tradeWorkflowItemsRef.current = nextTradeWorkflowItems
    setTradeWorkflowItems(nextTradeWorkflowItems)
    setTrades((current) => decorateTradesWithWorkflowItems(current, nextTradeWorkflowItems))

    return nextTradeWorkflowItems
  }

  function refreshWindowSize(key: WorkspaceCollectionKey): number {
    return Math.max(
      bootstrapQueryLimits.workspaceRecords,
      collectionWindowsRef.current[key].loadedCount,
    )
  }

  function markGroupLoaded(group: AppDataGroup, loaded: boolean) {
    setGroupLoaded((current) => ({ ...current, [group]: loaded }))
  }

  function markGroupLoading(group: AppDataGroup, loading: boolean) {
    setGroupLoading((current) => ({ ...current, [group]: loading }))
  }

  function setGroupError(group: AppDataGroup, message: string) {
    setGroupErrors((current) => ({ ...current, [group]: message }))
  }

  function logWorkspaceGroupError(group: AppDataGroup, message: string) {
    if (typeof console === 'undefined' || !message.trim()) {
      return
    }

    console.error(`[WorkspaceData] ${group} group error: ${message}`)
  }

  function setCollectionWindow(key: WorkspaceCollectionKey, window: WorkspaceCollectionWindow) {
    setCollectionWindows((current) => ({ ...current, [key]: window }))
  }

  function setCollectionLoading(key: WorkspaceCollectionKey, loading: boolean) {
    setCollectionLoadingMore((current) => ({ ...current, [key]: loading }))
  }

  function setCollectionError(key: WorkspaceCollectionKey, message: string) {
    setCollectionErrors((current) => ({ ...current, [key]: message }))
  }

  function resetWorkspaceData() {
    setTrades([])
    setEvents([])
    setPositions([])
    setOptionExposures([])
    setDeliveries([])
    setTradeConfirmations([])
    syncTradeWorkflowItems([], [])
    setTradeInvoices([])
    setTradePayments([])
    setBooks([])
    setCommodities([])
    setPriceIndices([])
    setCurrencies([])
    setUnits([])
    setLocations([])
    setLocationStandards(DEFAULT_LOCATION_STANDARDS)
    setSpatialFeatures([])
    setSpatialFeatureStandards(DEFAULT_SPATIAL_FEATURE_STANDARDS)
    setAssets([])
    setAssetStandards(DEFAULT_ASSET_STANDARDS)
    setCounterparties([])
    setCounterpartyCreditProfiles([])
    setCounterpartyExternalCreditSnapshots([])
    setCounterpartyCreditReport([])
    setCounterpartyStandards(DEFAULT_COUNTERPARTY_STANDARDS)
    setPortfolios([])
    setExternalDataRuns([])
    setExternalDataSyncStatus(null)
    setTradingSources([])
    setWeatherLocations([])
    setWeatherSyncStatus(null)
    setWorkspaceBootstrapSummary(null)
    setOperationalResourceDescriptors([])
    setTradeMetadata(buildFallbackTradeMetadata())
    setTradeMetadataSource('fallback')
    setTradeMetadataError('')
    setError('')
    setGroupLoaded({ ...EMPTY_GROUP_FLAGS })
    setGroupLoading({ ...EMPTY_GROUP_FLAGS })
    setGroupErrors({ ...EMPTY_GROUP_ERRORS })
    setCollectionWindows(createEmptyCollectionWindows())
    setCollectionLoadingMore({ ...EMPTY_COLLECTION_LOADING })
    setCollectionErrors({ ...EMPTY_COLLECTION_ERRORS })
  }

  function handleAuthenticationInterruption(reason: AuthInterruptionReason) {
    clearStoredAuthSession()
    resetWorkspaceData()
    setAuthSession(null)
    setAuthInterruptionReason(reason)
    setAppLoading(false)
  }

  const handleAuthenticationInterruptionRef = useRef(handleAuthenticationInterruption)
  handleAuthenticationInterruptionRef.current = handleAuthenticationInterruption

  async function loadData(options?: LoadDataOptions) {
    const currentSession = options?.sessionOverride ?? authSession
    const force = options?.force ?? true
    const readHeaders = currentSession ? sessionHeaders(currentSession) : null
    const adminHeaders =
      currentSession && hasAdministrativeAccess(currentSession)
        ? sessionHeaders(currentSession)
        : null
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

    const groupLoaders: Record<AppDataGroup, () => Promise<void>> = {
      core: async () => {
        const [coreBootstrap, nextTradeMetadata] = await Promise.all([
          loadCoreWorkspaceBootstrap(appConfig.apiBase, { readHeaders }),
          readHeaders
            ? loadTradeMetadata(appConfig.apiBase, { readHeaders })
                .then((payload) => ({
                  payload,
                  source: 'server' as const,
                  error: '',
                }))
                .catch((nextError) => ({
                  payload: buildFallbackTradeMetadata(),
                  source: 'fallback' as const,
                  error:
                    nextError instanceof Error
                      ? nextError.message
                      : 'Could not load server-owned trade metadata.',
                }))
            : Promise.resolve({
                payload: buildFallbackTradeMetadata(),
                source: 'fallback' as const,
                error: '',
              }),
        ])
        const {
          health: healthJson,
          workspaceSummary,
          operationalResourceDescriptors: nextOperationalDescriptors,
        } = coreBootstrap
        setHealth(healthJson.status ?? 'unknown')
        setWorkspaceBootstrapSummary(workspaceSummary)
        setOperationalResourceDescriptors(nextOperationalDescriptors)
        setTradeMetadata(nextTradeMetadata.payload)
        setTradeMetadataSource(nextTradeMetadata.source)
        setTradeMetadataError(nextTradeMetadata.error)
        setError('')
        markGroupLoaded('core', true)
      },
      trades: async () => {
        const payload = await loadTradesWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        const nextTrades = decorateTradesWithWorkflowItems(
          payload.trades,
          tradeWorkflowItemsRef.current,
        )
        setTrades(nextTrades)
        setCollectionWindow('trades', {
          loadedCount: nextTrades.length,
          hasMore: payload.tradesWindow.hasMore,
        })
        setCollectionError('trades', '')
        markGroupLoaded('trades', true)
      },
      events: async () => {
        const payload = await loadEventsWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setEvents(payload.events as EventRow[])
        markGroupLoaded('events', true)
      },
      positions: async () => {
        const payload = await loadPositionsWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setPositions(payload.positions)
        setCollectionWindow('positions', payload.positionsWindow)
        setCollectionError('positions', '')
        markGroupLoaded('positions', true)
      },
      reference: async () => {
        const payload = await loadReferenceWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setBooks(payload.books as ReferenceRecord[])
        setCommodities(payload.commodities as ReferenceRecord[])
        setPriceIndices(payload.priceIndices as PriceIndexRecord[])
        setCurrencies(payload.currencies as CurrencyRecord[])
        setUnits(payload.units as UnitRecord[])
        setLocations(payload.locations as LocationRecord[])
        setLocationStandards(payload.locationStandards as LocationStandards)
        setSpatialFeatures(payload.spatialFeatures as SpatialFeatureRecord[])
        setSpatialFeatureStandards(payload.spatialFeatureStandards as SpatialFeatureStandards)
        setAssets(payload.assets as AssetRecord[])
        setAssetStandards(payload.assetStandards as AssetStandards)
        setCounterparties(payload.counterparties as CounterpartyRecord[])
        setCounterpartyCreditProfiles(payload.counterpartyCreditProfiles as CounterpartyCreditProfileRecord[])
        setCounterpartyExternalCreditSnapshots(
          payload.counterpartyExternalCreditSnapshots as CounterpartyExternalCreditSnapshotRecord[],
        )
        setCounterpartyStandards(payload.counterpartyStandards as CounterpartyStandards)
        setPortfolios(payload.portfolios as PortfolioRecord[])
        markGroupLoaded('reference', true)
      },
      risk: async () => {
        const payload = await loadRiskWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setOptionExposures(payload.optionExposures)
        setCollectionWindow('optionExposures', payload.optionExposuresWindow)
        setCollectionError('optionExposures', '')
        markGroupLoaded('risk', true)
      },
      deliveries: async () => {
        const payload = await loadDeliveriesWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setDeliveries(payload.deliveries)
        setCollectionWindow('deliveries', payload.deliveriesWindow)
        setCollectionError('deliveries', '')
        markGroupLoaded('deliveries', true)
      },
      operations: async () => {
        const payload = await loadOperationsWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setTradeConfirmations(payload.confirmations)
        setCollectionWindow('confirmations', payload.confirmationsWindow)
        setCollectionError('confirmations', '')
        syncTradeWorkflowItems(payload.workItems, settlementTradeWorkflowItemsRef.current)
        setCollectionWindow('operationsWorkItems', {
          loadedCount: payload.workItems.length,
          hasMore: payload.workItemsWindow.hasMore,
        })
        setCollectionError('operationsWorkItems', '')
        markGroupLoaded('operations', true)
      },
      settlement: async () => {
        const payload = await loadSettlementWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setTradeInvoices(payload.invoices)
        setCollectionWindow('invoices', payload.invoicesWindow)
        setCollectionError('invoices', '')
        setTradePayments(payload.payments)
        setCollectionWindow('payments', payload.paymentsWindow)
        setCollectionError('payments', '')
        syncTradeWorkflowItems(operationsTradeWorkflowItemsRef.current, payload.workItems)
        setCollectionWindow('settlementWorkItems', {
          loadedCount: payload.workItems.length,
          hasMore: payload.workItemsWindow.hasMore,
        })
        setCollectionError('settlementWorkItems', '')
        markGroupLoaded('settlement', true)
      },
      reports: async () => {
        const payload = await loadReportsWorkspaceBootstrap(appConfig.apiBase, { readHeaders })
        setCounterpartyCreditReport(payload.counterpartyCreditReport as CounterpartyCreditReportRow[])
        markGroupLoaded('reports', true)
      },
      weather: async () => {
        const payload = await loadWeatherWorkspaceBootstrap(appConfig.apiBase, {
          adminHeaders,
          readHeaders,
        })
        setWeatherLocations(payload.weatherLocations as WeatherLocationRecord[])
        setWeatherSyncStatus(payload.weatherSyncStatus as WeatherSyncStatusRecord | null)
        markGroupLoaded('weather', true)
      },
      admin: async () => {
        const payload = await loadAdminWorkspaceBootstrap(appConfig.apiBase, { adminHeaders })
        setExternalDataRuns(payload.externalDataRuns as ExternalDataRunRecord[])
        setExternalDataSyncStatus(payload.externalDataSyncStatus as ExternalDataSyncStatusRecord | null)
        setTradingSources(payload.tradingSources as TradingSourceRecord[])
        setWeatherLocations(payload.weatherLocations as WeatherLocationRecord[])
        setWeatherSyncStatus(payload.weatherSyncStatus as WeatherSyncStatusRecord | null)
        markGroupLoaded('admin', true)
      },
    }

    async function loadGroup(group: AppDataGroup) {
      markGroupLoading(group, true)
      setGroupError(group, '')

      try {
        await groupLoaders[group]()
      } catch (nextError) {
        if (currentSession && isAuthenticationError(nextError)) {
          handleAuthenticationInterruption('session_expired')
          return
        }

        const message =
          nextError instanceof Error
            ? nextError.message
            : `Could not load ${group === 'core' ? 'the app shell' : `${group} workspace data`}.`
        logWorkspaceGroupError(group, message)
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

  async function refreshWorkspaceCollection(
    key: WorkspaceCollectionKey,
    readHeaders: HeadersInit | null,
  ) {
    const refreshLoaders: Record<WorkspaceCollectionKey, () => Promise<void>> = {
      trades: async () => {
        const payload = await loadTradesWindow(appConfig.apiBase, { readHeaders }, 0, refreshWindowSize('trades'))
        const nextTrades = decorateTradesWithWorkflowItems(payload.rows, tradeWorkflowItemsRef.current)
        setTrades(nextTrades)
        setCollectionWindow('trades', payload.window)
        setCollectionError('trades', '')
        markGroupLoaded('trades', true)
      },
      positions: async () => {
        const payload = await loadPositionsWindow(
          appConfig.apiBase,
          { readHeaders },
          0,
          refreshWindowSize('positions'),
        )
        setPositions(payload.rows)
        setCollectionWindow('positions', payload.window)
        setCollectionError('positions', '')
        markGroupLoaded('positions', true)
      },
      optionExposures: async () => {
        const payload = await loadOptionExposuresWindow(
          appConfig.apiBase,
          { readHeaders },
          0,
          refreshWindowSize('optionExposures'),
        )
        setOptionExposures(payload.rows)
        setCollectionWindow('optionExposures', payload.window)
        setCollectionError('optionExposures', '')
        markGroupLoaded('risk', true)
      },
      deliveries: async () => {
        const payload = await loadDeliveriesWindow(
          appConfig.apiBase,
          { readHeaders },
          0,
          refreshWindowSize('deliveries'),
        )
        setDeliveries(payload.rows)
        setCollectionWindow('deliveries', payload.window)
        setCollectionError('deliveries', '')
        markGroupLoaded('deliveries', true)
      },
      confirmations: async () => {
        const payload = await loadTradeConfirmationsWindow(
          appConfig.apiBase,
          { readHeaders },
          0,
          refreshWindowSize('confirmations'),
        )
        setTradeConfirmations(payload.rows)
        setCollectionWindow('confirmations', payload.window)
        setCollectionError('confirmations', '')
        markGroupLoaded('operations', true)
      },
      operationsWorkItems: async () => {
        const payload = await loadTradeWorkflowItemsWindow(
          appConfig.apiBase,
          'operations',
          { readHeaders },
          0,
          refreshWindowSize('operationsWorkItems'),
        )
        syncTradeWorkflowItems(payload.rows, settlementTradeWorkflowItemsRef.current)
        setCollectionWindow('operationsWorkItems', payload.window)
        setCollectionError('operationsWorkItems', '')
        markGroupLoaded('operations', true)
      },
      settlementWorkItems: async () => {
        const payload = await loadTradeWorkflowItemsWindow(
          appConfig.apiBase,
          'settlement',
          { readHeaders },
          0,
          refreshWindowSize('settlementWorkItems'),
        )
        syncTradeWorkflowItems(operationsTradeWorkflowItemsRef.current, payload.rows)
        setCollectionWindow('settlementWorkItems', payload.window)
        setCollectionError('settlementWorkItems', '')
        markGroupLoaded('settlement', true)
      },
      invoices: async () => {
        const payload = await loadTradeInvoicesWindow(
          appConfig.apiBase,
          { readHeaders },
          0,
          refreshWindowSize('invoices'),
        )
        setTradeInvoices(payload.rows)
        setCollectionWindow('invoices', payload.window)
        setCollectionError('invoices', '')
        markGroupLoaded('settlement', true)
      },
      payments: async () => {
        const payload = await loadTradePaymentsWindow(
          appConfig.apiBase,
          { readHeaders },
          0,
          refreshWindowSize('payments'),
        )
        setTradePayments(payload.rows)
        setCollectionWindow('payments', payload.window)
        setCollectionError('payments', '')
        markGroupLoaded('settlement', true)
      },
    }

    try {
      await refreshLoaders[key]()
    } catch (nextError) {
      if (authSession && isAuthenticationError(nextError)) {
        handleAuthenticationInterruption('session_expired')
        return
      }

      throw nextError
    }
  }

  async function handleLoadMoreWorkspaceCollection(key: WorkspaceCollectionKey) {
    if (collectionLoadingMore[key] || !collectionWindows[key].hasMore) {
      return
    }

    const readHeaders = authSession ? sessionHeaders(authSession) : null
    setCollectionLoading(key, true)
    setCollectionError(key, '')

    const collectionLoaders: Record<WorkspaceCollectionKey, () => Promise<void>> = {
      trades: async () => {
        const payload = await loadTradesWindow(appConfig.apiBase, { readHeaders }, trades.length)
        const nextTrades = decorateTradesWithWorkflowItems(
          mergeCollectionRows(trades, payload.rows, (trade) => trade.trade_id),
          tradeWorkflowItemsRef.current,
        )
        setTrades(nextTrades)
        setCollectionWindow('trades', {
          loadedCount: nextTrades.length,
          hasMore: payload.window.hasMore,
        })
      },
      positions: async () => {
        const payload = await loadPositionsWindow(appConfig.apiBase, { readHeaders }, positions.length)
        const nextPositions = mergeCollectionRows(positions, payload.rows, (position) => position.commodity)
        setPositions(nextPositions)
        setCollectionWindow('positions', {
          loadedCount: nextPositions.length,
          hasMore: payload.window.hasMore,
        })
      },
      optionExposures: async () => {
        const payload = await loadOptionExposuresWindow(
          appConfig.apiBase,
          { readHeaders },
          optionExposures.length,
        )
        const nextOptionExposures = mergeCollectionRows(
          optionExposures,
          payload.rows,
          (optionExposure) => optionExposure.trade_id,
        )
        setOptionExposures(nextOptionExposures)
        setCollectionWindow('optionExposures', {
          loadedCount: nextOptionExposures.length,
          hasMore: payload.window.hasMore,
        })
      },
      deliveries: async () => {
        const payload = await loadDeliveriesWindow(appConfig.apiBase, { readHeaders }, deliveries.length)
        const nextDeliveries = mergeCollectionRows(
          deliveries,
          payload.rows,
          (delivery) => delivery.delivery_id,
        )
        setDeliveries(nextDeliveries)
        setCollectionWindow('deliveries', {
          loadedCount: nextDeliveries.length,
          hasMore: payload.window.hasMore,
        })
      },
      confirmations: async () => {
        const payload = await loadTradeConfirmationsWindow(
          appConfig.apiBase,
          { readHeaders },
          tradeConfirmations.length,
        )
        const nextTradeConfirmations = mergeCollectionRows(
          tradeConfirmations,
          payload.rows,
          (confirmation) => confirmation.confirmation_id,
        )
        setTradeConfirmations(nextTradeConfirmations)
        setCollectionWindow('confirmations', {
          loadedCount: nextTradeConfirmations.length,
          hasMore: payload.window.hasMore,
        })
      },
      operationsWorkItems: async () => {
        const currentRows = operationsTradeWorkflowItemsRef.current
        const payload = await loadTradeWorkflowItemsWindow(
          appConfig.apiBase,
          'operations',
          { readHeaders },
          currentRows.length,
        )
        const nextQueueRows = mergeCollectionRows(currentRows, payload.rows, (item) => item.item_id)
        syncTradeWorkflowItems(nextQueueRows, settlementTradeWorkflowItemsRef.current)
        setCollectionWindow('operationsWorkItems', {
          loadedCount: nextQueueRows.length,
          hasMore: payload.window.hasMore,
        })
      },
      settlementWorkItems: async () => {
        const currentRows = settlementTradeWorkflowItemsRef.current
        const payload = await loadTradeWorkflowItemsWindow(
          appConfig.apiBase,
          'settlement',
          { readHeaders },
          currentRows.length,
        )
        const nextQueueRows = mergeCollectionRows(currentRows, payload.rows, (item) => item.item_id)
        syncTradeWorkflowItems(operationsTradeWorkflowItemsRef.current, nextQueueRows)
        setCollectionWindow('settlementWorkItems', {
          loadedCount: nextQueueRows.length,
          hasMore: payload.window.hasMore,
        })
      },
      invoices: async () => {
        const payload = await loadTradeInvoicesWindow(appConfig.apiBase, { readHeaders }, tradeInvoices.length)
        const nextTradeInvoices = mergeCollectionRows(
          tradeInvoices,
          payload.rows,
          (invoice) => invoice.invoice_id,
        )
        setTradeInvoices(nextTradeInvoices)
        setCollectionWindow('invoices', {
          loadedCount: nextTradeInvoices.length,
          hasMore: payload.window.hasMore,
        })
      },
      payments: async () => {
        const payload = await loadTradePaymentsWindow(appConfig.apiBase, { readHeaders }, tradePayments.length)
        const nextTradePayments = mergeCollectionRows(
          tradePayments,
          payload.rows,
          (payment) => payment.payment_id,
        )
        setTradePayments(nextTradePayments)
        setCollectionWindow('payments', {
          loadedCount: nextTradePayments.length,
          hasMore: payload.window.hasMore,
        })
      },
    }

    try {
      await collectionLoaders[key]()
    } catch (nextError) {
      if (authSession && isAuthenticationError(nextError)) {
        handleAuthenticationInterruption('session_expired')
        return
      }

      setCollectionError(
        key,
        nextError instanceof Error
          ? nextError.message
          : `Could not load more ${key.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}.`,
      )
    } finally {
      setCollectionLoading(key, false)
    }
  }

  async function refreshMutationData(mutation: WorkspaceMutationKind) {
    const targetedPlan = buildTargetedMutationRefreshPlan({
      currentView,
      mutation,
    })

    if (targetedPlan) {
      const readHeaders = authSession ? sessionHeaders(authSession) : null
      await loadDataRef.current({
        groups: targetedPlan.groups,
        force: true,
      })
      await Promise.all(
        targetedPlan.collections.map((key) => refreshWorkspaceCollection(key, readHeaders)),
      )
      return
    }

    await loadDataRef.current({
      groups: buildMutationRefreshGroups({
        currentView,
        groupLoaded: groupLoadedRef.current,
        mutation,
      }),
      force: true,
    })
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
      setAuthInterruptionReason(null)
      return nextSession
    } catch (error) {
      if (isAuthenticationError(error)) {
        handleAuthenticationInterruption('session_expired')
        return null
      }

      clearStoredAuthSession()
      setAuthSession(null)
      return null
    }
  }

  const refreshAuthSessionRef = useRef(refreshAuthSession)
  refreshAuthSessionRef.current = refreshAuthSession

  async function handleSessionChange(nextSession: StoredAuthSession | null) {
    if (nextSession) {
      saveStoredAuthSession(nextSession)
    } else {
      clearStoredAuthSession()
    }

    setAppLoading(true)
    resetWorkspaceData()
    setAuthSession(nextSession)
    setAuthInterruptionReason(null)

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

  useEffect(() => {
    async function init() {
      try {
        const session = await refreshAuthSessionRef.current()
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
    if (appLoading || error || !authSession) {
      return
    }

    void loadDataRef.current({
      groups: VIEW_DATA_GROUPS[currentView],
      force: false,
    })
  }, [appLoading, authSession, currentView, error])

  useEffect(() => {
    if (!authSession) {
      return
    }

    let cancelled = false

    async function heartbeat() {
      try {
        await sendSessionHeartbeat(appConfig.apiBase)
      } catch (error) {
        if (!cancelled && isAuthenticationError(error)) {
          handleAuthenticationInterruptionRef.current('session_expired')
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
    authInterruptionReason,
    authSession,
    appLoading,
    assetStandards,
    assets,
    books,
    collectionErrors,
    collectionLoadingMore,
    collectionWindows,
    commodities,
    counterparties,
    counterpartyCreditProfiles,
    counterpartyCreditReport,
    counterpartyExternalCreditSnapshots,
    counterpartyStandards,
    currencies,
    deliveries,
    error,
    events,
    externalDataRuns,
    externalDataSyncStatus,
    groupErrors,
    groupLoaded,
    groupLoading,
    handleSessionChange,
    handleLoadMoreWorkspaceCollection,
    health,
    loadData,
    locationStandards,
    locations,
    optionExposures,
    portfolios,
    positions,
    priceIndices,
    refreshMutationData,
    operationalResourceDescriptors,
    spatialFeatures,
    spatialFeatureStandards,
    tradeMetadata,
    tradeMetadataError,
    tradeMetadataSource,
    sessionResetKey: authSession?.sessionId ?? 'anonymous',
    setError,
    tradeInvoices,
    tradeConfirmations,
    tradePayments,
    tradeWorkflowItems,
    trades,
    tradingSources,
    units,
    weatherLocations,
    workspaceBootstrapSummary,
    weatherSyncStatus,
  }
}
