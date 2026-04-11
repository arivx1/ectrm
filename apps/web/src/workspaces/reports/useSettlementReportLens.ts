import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import {
  createSettlementReportPreset,
  deleteSettlementReportPreset,
  loadCashForecastReport,
  loadSettlementAgingReport,
  loadSettlementExceptionReport,
  loadSettlementReportFilterOptions,
  loadSettlementReportPresets,
  updateSettlementReportPreset,
} from '../../entities/reports/api'
import { appConfig } from '../../shared/config'
import type {
  CashForecastReport,
  SettlementAgingReport,
  SettlementExceptionReport,
  SettlementReportFilterOptions,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { exportReportCsv, uniqueSorted } from './reportUtils'
import {
  DEFAULT_SETTLEMENT_REPORT_FILTERS,
  type SettlementReportFilterCatalog,
  type SettlementReportLensFilters,
  type SettlementReportPreset,
  filtersEqual,
  fromApiSettlementReportPreset,
  isSettlementFilterActive,
  mergeSettlementFilterCatalog,
  readStoredSettlementReportFilters,
  readStoredSettlementReportPresets,
  sanitizeFilters,
  settlementFilterChips,
  sortSettlementReportPresets,
  toApiSettlementReportFilters,
  writeStoredSettlementReportFilters,
  writeStoredSettlementReportPresets,
} from './settlementReportLens'

export type SettlementReportLensState = {
  settlementAging: SettlementAgingReport | null
  cashForecast: CashForecastReport | null
  settlementExceptions: SettlementExceptionReport | null
  settlementLoading: boolean
  settlementError: string
  settlementFilters: SettlementReportLensFilters
  filterOptions: SettlementReportFilterCatalog
  settlementFilterActive: boolean
  settlementFilterChips: string[]
  savedPresets: SettlementReportPreset[]
  activePreset: SettlementReportPreset | null
  activePresetName: string | null
  presetNameInput: string
  setPresetNameInput: Dispatch<SetStateAction<string>>
  presetScopeInput: 'PERSONAL' | 'SHARED'
  setPresetScopeInput: Dispatch<SetStateAction<'PERSONAL' | 'SHARED'>>
  presetError: string
  presetBusy: boolean
  agingRows: SettlementAgingReport['rows']
  agingCurrencySummaries: SettlementAgingReport['currency_summaries']
  cashCurrencySummaries: CashForecastReport['currency_summaries']
  cashPoints: CashForecastReport['points']
  exceptionSummaries: SettlementExceptionReport['summaries']
  exceptionRows: SettlementExceptionReport['rows']
  blockedExceptionCount: number
  warningExceptionCount: number
  updateSettlementFilter: <K extends keyof SettlementReportLensFilters>(
    key: K,
    value: SettlementReportLensFilters[K],
  ) => void
  clearPresetError: () => void
  resetSettlementFilters: () => void
  applyPreset: (preset: SettlementReportPreset) => void
  handleSavePreset: () => Promise<void>
  handleDeleteActivePreset: () => Promise<void>
  exportSettlementAging: () => void
  exportCashForecast: () => void
  exportSettlementExceptions: () => void
}

type UseSettlementReportLensOptions = {
  authSession: StoredAuthSession | null
  reportAccessToken?: string
}

export function useSettlementReportLens({
  authSession,
  reportAccessToken,
}: UseSettlementReportLensOptions): SettlementReportLensState {
  const [settlementAging, setSettlementAging] = useState<SettlementAgingReport | null>(null)
  const [cashForecast, setCashForecast] = useState<CashForecastReport | null>(null)
  const [settlementExceptions, setSettlementExceptions] = useState<SettlementExceptionReport | null>(null)
  const [settlementFilterOptions, setSettlementFilterOptions] = useState<SettlementReportFilterOptions | null>(null)
  const [settlementFilters, setSettlementFilters] = useState<SettlementReportLensFilters>(() =>
    readStoredSettlementReportFilters(),
  )
  const [savedPresets, setSavedPresets] = useState<SettlementReportPreset[]>(() =>
    sortSettlementReportPresets(readStoredSettlementReportPresets()),
  )
  const [presetNameInput, setPresetNameInput] = useState('')
  const [presetScopeInput, setPresetScopeInput] = useState<'PERSONAL' | 'SHARED'>('PERSONAL')
  const [presetError, setPresetError] = useState('')
  const [presetBusy, setPresetBusy] = useState(false)
  const [settlementLoading, setSettlementLoading] = useState(true)
  const [settlementError, setSettlementError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadFilterOptions() {
      try {
        const nextFilterOptions = await loadSettlementReportFilterOptions(appConfig.apiBase, {}, reportAccessToken)
        if (!cancelled) {
          setSettlementFilterOptions(nextFilterOptions)
        }
      } catch {
        if (!cancelled) {
          setSettlementFilterOptions(null)
        }
      }
    }

    void loadFilterOptions()

    return () => {
      cancelled = true
    }
  }, [reportAccessToken])

  useEffect(() => {
    writeStoredSettlementReportFilters(settlementFilters)
  }, [settlementFilters])

  useEffect(() => {
    if (!authSession) {
      writeStoredSettlementReportPresets(savedPresets)
    }
  }, [authSession, savedPresets])

  useEffect(() => {
    if (!authSession) {
      setSavedPresets(sortSettlementReportPresets(readStoredSettlementReportPresets()))
      return
    }

    const accessToken = authSession.accessToken
    let cancelled = false

    async function loadPresets() {
      setPresetError('')

      try {
        const nextPresets = await loadSettlementReportPresets(appConfig.apiBase, accessToken)
        if (!cancelled) {
          setSavedPresets(sortSettlementReportPresets(nextPresets.map(fromApiSettlementReportPreset)))
        }
      } catch (nextError) {
        if (!cancelled) {
          setSavedPresets([])
          setPresetError(nextError instanceof Error ? nextError.message : 'Unable to load settlement presets.')
        }
      }
    }

    void loadPresets()

    return () => {
      cancelled = true
    }
  }, [authSession])

  const apiSettlementFilters = useMemo(
    () => toApiSettlementReportFilters(settlementFilters),
    [settlementFilters],
  )

  useEffect(() => {
    let cancelled = false

    async function loadSettlementReports() {
      setSettlementLoading(true)
      setSettlementError('')

      try {
        const [nextSettlementAging, nextCashForecast, nextSettlementExceptions] = await Promise.all([
          loadSettlementAgingReport(appConfig.apiBase, apiSettlementFilters, reportAccessToken),
          loadCashForecastReport(appConfig.apiBase, apiSettlementFilters, reportAccessToken),
          loadSettlementExceptionReport(appConfig.apiBase, apiSettlementFilters, reportAccessToken),
        ])

        if (cancelled) {
          return
        }

        setSettlementAging(nextSettlementAging)
        setCashForecast(nextCashForecast)
        setSettlementExceptions(nextSettlementExceptions)
      } catch (nextError) {
        if (!cancelled) {
          setSettlementError(nextError instanceof Error ? nextError.message : 'Unable to load settlement reports.')
        }
      } finally {
        if (!cancelled) {
          setSettlementLoading(false)
        }
      }
    }

    void loadSettlementReports()

    return () => {
      cancelled = true
    }
  }, [apiSettlementFilters, reportAccessToken])

  const agingRows = useMemo(() => settlementAging?.rows ?? [], [settlementAging])
  const agingCurrencySummaries = useMemo(() => settlementAging?.currency_summaries ?? [], [settlementAging])
  const cashCurrencySummaries = useMemo(() => cashForecast?.currency_summaries ?? [], [cashForecast])
  const cashPoints = useMemo(() => cashForecast?.points ?? [], [cashForecast])
  const exceptionSummaries = useMemo(() => settlementExceptions?.summaries ?? [], [settlementExceptions])
  const exceptionRows = useMemo(() => settlementExceptions?.rows ?? [], [settlementExceptions])

  const fallbackFilterOptions = useMemo<SettlementReportFilterCatalog>(() => {
    return {
      books: uniqueSorted([...agingRows.map((row) => row.book), ...exceptionRows.map((row) => row.book)]),
      counterparties: uniqueSorted([
        ...agingRows.map((row) => row.counterparty_code),
        ...exceptionRows.map((row) => row.counterparty_code),
      ]),
      currencies: uniqueSorted([
        ...agingRows.map((row) => row.currency_code),
        ...cashPoints.map((row) => row.currency_code),
        ...cashCurrencySummaries.map((row) => row.currency_code),
        ...exceptionRows.map((row) => row.currency_code),
      ]),
      exceptionTypes: uniqueSorted(exceptionRows.map((row) => row.exception_type)),
      severities: uniqueSorted(exceptionRows.map((row) => row.severity)),
    }
  }, [agingRows, cashCurrencySummaries, cashPoints, exceptionRows])

  const filterOptions = useMemo(() => {
    return mergeSettlementFilterCatalog({
      apiOptions: settlementFilterOptions,
      fallbackOptions: fallbackFilterOptions,
      filters: settlementFilters,
    })
  }, [fallbackFilterOptions, settlementFilterOptions, settlementFilters])

  useEffect(() => {
    setSettlementFilters((current) => {
      const next = sanitizeFilters(current, filterOptions)
      return filtersEqual(current, next) ? current : next
    })
  }, [filterOptions])

  const activePreset = useMemo(() => {
    return savedPresets.find((preset) => filtersEqual(preset.filters, settlementFilters)) ?? null
  }, [savedPresets, settlementFilters])
  const activePresetName = activePreset?.name ?? null

  useEffect(() => {
    if (!activePreset) {
      return
    }

    setPresetScopeInput(activePreset.scope)
    setPresetNameInput((current) => (current.trim() ? current : activePreset.name))
  }, [activePreset])

  const blockedExceptionCount = settlementExceptions?.blocked_count ?? 0
  const warningExceptionCount = settlementExceptions?.warning_count ?? 0
  const settlementFilterActive = useMemo(() => isSettlementFilterActive(settlementFilters), [settlementFilters])
  const activeFilterChips = useMemo(() => settlementFilterChips(settlementFilters), [settlementFilters])

  function updateSettlementFilter<K extends keyof SettlementReportLensFilters>(
    key: K,
    value: SettlementReportLensFilters[K],
  ) {
    setSettlementFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function clearPresetError() {
    setPresetError('')
  }

  function resetSettlementFilters() {
    setSettlementFilters(DEFAULT_SETTLEMENT_REPORT_FILTERS)
    setPresetError('')
  }

  function applyPreset(preset: SettlementReportPreset) {
    setSettlementFilters(preset.filters)
    setPresetNameInput(preset.name)
    setPresetScopeInput(preset.scope)
    setPresetError('')
  }

  async function handleSavePreset() {
    const presetName = presetNameInput.trim()
    if (!presetName) {
      setPresetError('Preset name is required.')
      return
    }

    if (
      authSession &&
      activePreset &&
      !activePreset.canEdit &&
      activePreset.name.toLowerCase() === presetName.toLowerCase() &&
      activePreset.scope === presetScopeInput
    ) {
      setPresetError('Shared presets can only be updated by their owner. Choose another name or save it as Personal.')
      return
    }

    const nextPreset: SettlementReportPreset = {
      presetId:
        activePreset?.name.toLowerCase() === presetName.toLowerCase() && activePreset.scope === presetScopeInput
          ? activePreset.presetId
          : null,
      name: presetName,
      scope: presetScopeInput,
      filters: settlementFilters,
      canEdit: true,
      updatedAt: null,
      updatedBy: authSession?.user.user_id ?? null,
    }

    setPresetBusy(true)

    try {
      if (!authSession) {
        setSavedPresets((current) => {
          const remaining = current.filter(
            (preset) => !(preset.name.toLowerCase() === presetName.toLowerCase() && preset.scope === presetScopeInput),
          )
          return sortSettlementReportPresets([nextPreset, ...remaining])
        })
        setPresetError('')
        return
      }

      const existingEditablePreset = savedPresets.find(
        (preset) =>
          preset.canEdit &&
          preset.name.toLowerCase() === presetName.toLowerCase() &&
          preset.scope === presetScopeInput &&
          preset.presetId !== null,
      )

      const responsePreset =
        existingEditablePreset?.presetId !== undefined && existingEditablePreset?.presetId !== null
          ? await updateSettlementReportPreset(appConfig.apiBase, authSession.accessToken, existingEditablePreset.presetId, {
              name: presetName,
              scope: presetScopeInput,
              filters: toApiSettlementReportFilters(settlementFilters),
            })
          : await createSettlementReportPreset(appConfig.apiBase, authSession.accessToken, {
              name: presetName,
              scope: presetScopeInput,
              filters: toApiSettlementReportFilters(settlementFilters),
            })

      const normalizedPreset = fromApiSettlementReportPreset(responsePreset)
      setSavedPresets((current) =>
        sortSettlementReportPresets([
          normalizedPreset,
          ...current.filter((preset) => preset.presetId !== normalizedPreset.presetId),
        ]),
      )
      setPresetError('')
    } catch (nextError) {
      setPresetError(nextError instanceof Error ? nextError.message : 'Unable to save the settlement preset.')
    } finally {
      setPresetBusy(false)
    }
  }

  async function handleDeleteActivePreset() {
    if (!activePreset || !activePreset.canEdit) {
      return
    }

    setPresetBusy(true)

    try {
      if (authSession && activePreset.presetId !== null) {
        await deleteSettlementReportPreset(appConfig.apiBase, authSession.accessToken, activePreset.presetId)
      }

      setSavedPresets((current) =>
        current.filter((preset) => {
          if (activePreset.presetId !== null) {
            return preset.presetId !== activePreset.presetId
          }
          return !(preset.name === activePreset.name && preset.scope === activePreset.scope)
        }),
      )
      setPresetNameInput('')
      setPresetError('')
    } catch (nextError) {
      setPresetError(nextError instanceof Error ? nextError.message : 'Unable to delete the settlement preset.')
    } finally {
      setPresetBusy(false)
    }
  }

  function exportSettlementAging() {
    if (!settlementAging || agingRows.length === 0) {
      return
    }

    exportReportCsv(
      `settlement-aging-${settlementAging.as_of}.csv`,
      [
        'counterparty_code',
        'book',
        'currency_code',
        'invoice_count',
        'trade_count',
        'overdue_invoice_count',
        'disputed_invoice_count',
        'total_outstanding_amount',
        'current_amount',
        'past_due_1_7_amount',
        'past_due_8_30_amount',
        'past_due_31_plus_amount',
        'disputed_amount',
        'oldest_due_at',
        'latest_due_at',
      ],
      agingRows.map((row) => [
        row.counterparty_code,
        row.book,
        row.currency_code,
        row.invoice_count,
        row.trade_count,
        row.overdue_invoice_count,
        row.disputed_invoice_count,
        row.total_outstanding_amount,
        row.current_amount,
        row.past_due_1_7_amount,
        row.past_due_8_30_amount,
        row.past_due_31_plus_amount,
        row.disputed_amount,
        row.oldest_due_at,
        row.latest_due_at,
      ]),
    )
  }

  function exportCashForecast() {
    if (!cashForecast || cashPoints.length === 0) {
      return
    }

    exportReportCsv(
      `cash-forecast-${cashForecast.as_of}.csv`,
      [
        'forecast_date',
        'currency_code',
        'expected_amount',
        'received_amount',
        'expected_invoice_count',
        'received_payment_count',
      ],
      cashPoints.map((point) => [
        point.forecast_date,
        point.currency_code,
        point.expected_amount,
        point.received_amount,
        point.expected_invoice_count,
        point.received_payment_count,
      ]),
    )
  }

  function exportSettlementExceptions() {
    if (!settlementExceptions || exceptionRows.length === 0) {
      return
    }

    exportReportCsv(
      `settlement-exceptions-${settlementExceptions.as_of}.csv`,
      [
        'exception_type',
        'severity',
        'trade_id',
        'invoice_id',
        'invoice_number',
        'counterparty_code',
        'book',
        'commodity',
        'currency_code',
        'invoice_status',
        'payment_status',
        'settlement_status',
        'owner',
        'due_at',
        'last_received_at',
        'invoice_amount',
        'total_paid_amount',
        'outstanding_amount',
        'days_past_due',
        'summary',
      ],
      exceptionRows.map((row) => [
        row.exception_type,
        row.severity,
        row.trade_id,
        row.invoice_id,
        row.invoice_number,
        row.counterparty_code,
        row.book,
        row.commodity,
        row.currency_code,
        row.invoice_status,
        row.payment_status,
        row.settlement_status,
        row.owner,
        row.due_at,
        row.last_received_at,
        row.invoice_amount,
        row.total_paid_amount,
        row.outstanding_amount,
        row.days_past_due,
        row.summary,
      ]),
    )
  }

  return {
    settlementAging,
    cashForecast,
    settlementExceptions,
    settlementLoading,
    settlementError,
    settlementFilters,
    filterOptions,
    settlementFilterActive,
    settlementFilterChips: activeFilterChips,
    savedPresets,
    activePreset,
    activePresetName,
    presetNameInput,
    setPresetNameInput,
    presetScopeInput,
    setPresetScopeInput,
    presetError,
    presetBusy,
    agingRows,
    agingCurrencySummaries,
    cashCurrencySummaries,
    cashPoints,
    exceptionSummaries,
    exceptionRows,
    blockedExceptionCount,
    warningExceptionCount,
    updateSettlementFilter,
    clearPresetError,
    resetSettlementFilters,
    applyPreset,
    handleSavePreset,
    handleDeleteActivePreset,
    exportSettlementAging,
    exportCashForecast,
    exportSettlementExceptions,
  }
}
