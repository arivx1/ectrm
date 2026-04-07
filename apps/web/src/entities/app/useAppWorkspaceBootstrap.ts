import { useEffect, useRef, useState } from 'react'

import { loadCurrentSession, sendSessionHeartbeat } from '../auth/api'
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
import { buildMutationRefreshGroups, type WorkspaceMutationKind } from './workspaceRefresh'
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
  sessionHeaders,
} from './workspaceDataShared'
import { appConfig } from '../../shared/config'
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  saveStoredAuthSession,
  type StoredAuthSession,
} from '../../shared/mutation'
import {
  DEFAULT_COUNTERPARTY_STANDARDS,
  DEFAULT_LOCATION_STANDARDS,
} from '../../shared/models'
import type {
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

type LoadDataOptions = {
  sessionOverride?: StoredAuthSession | null
  groups?: AppDataGroup[]
  force?: boolean
}

export function useAppWorkspaceBootstrap(currentView: ViewKey) {
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
  const [error, setError] = useState<string>('')
  const [appLoading, setAppLoading] = useState(true)
  const [groupLoaded, setGroupLoaded] = useState<AppDataGroupFlags>(() => ({ ...EMPTY_GROUP_FLAGS }))
  const [groupLoading, setGroupLoading] = useState<AppDataGroupFlags>(() => ({ ...EMPTY_GROUP_FLAGS }))
  const [groupErrors, setGroupErrors] = useState<AppDataGroupErrors>(() => ({ ...EMPTY_GROUP_ERRORS }))
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
    setGroupLoaded({ ...EMPTY_GROUP_FLAGS })
    setGroupLoading({ ...EMPTY_GROUP_FLAGS })
    setGroupErrors({ ...EMPTY_GROUP_ERRORS })
  }

  async function loadData(options?: LoadDataOptions) {
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

  async function refreshMutationData(mutation: WorkspaceMutationKind) {
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
    health,
    loadData,
    locationStandards,
    locations,
    optionExposures,
    portfolios,
    positions,
    priceIndices,
    refreshMutationData,
    sessionResetKey: authSession?.sessionId ?? 'anonymous',
    setError,
    tradeInvoices,
    tradePayments,
    tradeWorkflowItems,
    trades,
    tradingSources,
    units,
    weatherSyncStatus,
  }
}
