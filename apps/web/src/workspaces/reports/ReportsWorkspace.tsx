import { useEffect, useMemo, useState } from 'react'

import {
  createSettlementReportPreset,
  deleteSettlementReportPreset,
  loadActivitySummary,
  loadCashForecastReport,
  loadPnlComparisonReport,
  loadExposureSummary,
  loadPnlHistoryReport,
  loadReportingOverview,
  loadSettlementAgingReport,
  loadSettlementExceptionReport,
  loadSettlementReportFilterOptions,
  loadSettlementReportPresets,
  updateSettlementReportPreset,
} from '../../entities/reports/api'
import { appConfig } from '../../shared/config'
import { formatCurrencyAmount } from '../../shared/format'
import type {
  ActivitySummaryRow,
  CashForecastReport,
  CounterpartyCreditReportRow,
  ExposureSummaryRow,
  PnlComparisonReport,
  PnlTradeAttributionRow,
  PnlTradeValuation,
  PnlHistoryReport,
  PortfolioRecord,
  ReportingOverview,
  SettlementReportFilterOptions,
  SettlementReportFilters as ApiSettlementReportFilters,
  SettlementReportPresetRecord,
  SettlementAgingReport,
  SettlementExceptionReport,
  Trade,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { buildUnitLabelByCommodity, summarizeUnitLabels } from '../../shared/unitDisplay'
import { MetricValue } from '../../shared/ui/MetricValue'
import { TileLayout } from '../../shared/ui/TileLayout'

type ReportsWorkspaceProps = {
  activeTrades: Trade[]
  authSession: StoredAuthSession | null
  counterpartyCreditReport: CounterpartyCreditReportRow[]
  portfolios: PortfolioRecord[]
  formatNumber: (value: number | null, digits?: number) => string
  formatMoney: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenSettlement: () => void
  onOpenTrade: (tradeId: string) => void
}

type SettlementReportFilters = {
  book: string
  counterparty: string
  currency: string
  exceptionType: string
  severity: string
}

type SettlementReportPreset = {
  presetId: number | null
  name: string
  scope: 'PERSONAL' | 'SHARED'
  filters: SettlementReportFilters
  canEdit: boolean
  updatedAt: string | null
  updatedBy: string | null
}

type PortfolioValuationRollup = {
  portfolio: string
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  pricedTradeCount: number
}

type TradeAttributionDisplayRow = PnlTradeAttributionRow & {
  portfolio: string
  book: string
}

const ALL_FILTER_VALUE = 'ALL'
const REPORT_FILTER_STORAGE_KEY = 'ectrm.reports.settlement-filters.v1'
const REPORT_PRESET_STORAGE_KEY = 'ectrm.reports.settlement-presets.v1'
const DEFAULT_SETTLEMENT_REPORT_FILTERS: SettlementReportFilters = {
  book: ALL_FILTER_VALUE,
  counterparty: ALL_FILTER_VALUE,
  currency: ALL_FILTER_VALUE,
  exceptionType: ALL_FILTER_VALUE,
  severity: ALL_FILTER_VALUE,
}

function normalizeSettlementReportFilters(value: unknown): SettlementReportFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_SETTLEMENT_REPORT_FILTERS
  }

  const candidate = value as Record<string, unknown>
  const rawExceptionType =
    typeof candidate.exceptionType === 'string'
      ? candidate.exceptionType
      : typeof candidate.exception_type === 'string'
        ? candidate.exception_type
        : null
  return {
    book: typeof candidate.book === 'string' && candidate.book.trim() ? candidate.book.trim() : ALL_FILTER_VALUE,
    counterparty:
      typeof candidate.counterparty === 'string' && candidate.counterparty.trim()
        ? candidate.counterparty.trim()
        : ALL_FILTER_VALUE,
    currency:
      typeof candidate.currency === 'string' && candidate.currency.trim()
        ? candidate.currency.trim().toUpperCase()
        : ALL_FILTER_VALUE,
    exceptionType: rawExceptionType && rawExceptionType.trim() ? rawExceptionType.trim().toUpperCase() : ALL_FILTER_VALUE,
    severity:
      typeof candidate.severity === 'string' && candidate.severity.trim()
        ? candidate.severity.trim().toLowerCase()
        : ALL_FILTER_VALUE,
  }
}

function readStoredSettlementReportFilters(): SettlementReportFilters {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTLEMENT_REPORT_FILTERS
  }

  try {
    const rawValue = window.localStorage.getItem(REPORT_FILTER_STORAGE_KEY)
    return rawValue ? normalizeSettlementReportFilters(JSON.parse(rawValue)) : DEFAULT_SETTLEMENT_REPORT_FILTERS
  } catch {
    return DEFAULT_SETTLEMENT_REPORT_FILTERS
  }
}

function writeStoredSettlementReportFilters(filters: SettlementReportFilters) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(REPORT_FILTER_STORAGE_KEY, JSON.stringify(filters))
}

function readStoredSettlementReportPresets(): SettlementReportPreset[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(REPORT_PRESET_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          return null
        }
        const candidate = row as Record<string, unknown>
        const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
        if (!name) {
          return null
        }

        return {
          presetId:
            typeof candidate.presetId === 'number'
              ? candidate.presetId
              : typeof candidate.preset_id === 'number'
                ? candidate.preset_id
                : null,
          name,
          scope: candidate.scope === 'SHARED' ? 'SHARED' : 'PERSONAL',
          filters: normalizeSettlementReportFilters(candidate.filters),
          canEdit: candidate.canEdit === false || candidate.can_edit === false ? false : true,
          updatedAt:
            typeof candidate.updatedAt === 'string'
              ? candidate.updatedAt
              : typeof candidate.updated_at === 'string'
                ? candidate.updated_at
                : null,
          updatedBy:
            typeof candidate.updatedBy === 'string'
              ? candidate.updatedBy
              : typeof candidate.updated_by === 'string'
                ? candidate.updated_by
                : null,
        } satisfies SettlementReportPreset
      })
      .filter((row): row is SettlementReportPreset => Boolean(row))
  } catch {
    return []
  }
}

function writeStoredSettlementReportPresets(presets: SettlementReportPreset[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(REPORT_PRESET_STORAGE_KEY, JSON.stringify(presets))
}

function toApiSettlementReportFilters(filters: SettlementReportFilters): ApiSettlementReportFilters {
  return {
    book: filters.book !== ALL_FILTER_VALUE ? filters.book : undefined,
    counterparty: filters.counterparty !== ALL_FILTER_VALUE ? filters.counterparty : undefined,
    currency: filters.currency !== ALL_FILTER_VALUE ? filters.currency : undefined,
    exception_type: filters.exceptionType !== ALL_FILTER_VALUE ? filters.exceptionType : undefined,
    severity: filters.severity !== ALL_FILTER_VALUE ? (filters.severity as 'blocked' | 'in-progress') : undefined,
  }
}

function fromApiSettlementReportFilters(filters: ApiSettlementReportFilters | null | undefined): SettlementReportFilters {
  return {
    book: filters?.book ?? ALL_FILTER_VALUE,
    counterparty: filters?.counterparty ?? ALL_FILTER_VALUE,
    currency: filters?.currency ?? ALL_FILTER_VALUE,
    exceptionType: filters?.exception_type ?? ALL_FILTER_VALUE,
    severity: filters?.severity ?? ALL_FILTER_VALUE,
  }
}

function fromApiSettlementReportPreset(record: SettlementReportPresetRecord): SettlementReportPreset {
  return {
    presetId: record.preset_id,
    name: record.name,
    scope: record.scope,
    filters: fromApiSettlementReportFilters(record.filters),
    canEdit: record.can_edit,
    updatedAt: record.updated_at,
    updatedBy: record.updated_by,
  }
}

function sortSettlementReportPresets(presets: SettlementReportPreset[]): SettlementReportPreset[] {
  return [...presets].sort((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope === 'SHARED' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

function filtersEqual(left: SettlementReportFilters, right: SettlementReportFilters): boolean {
  return (
    left.book === right.book &&
    left.counterparty === right.counterparty &&
    left.currency === right.currency &&
    left.exceptionType === right.exceptionType &&
    left.severity === right.severity
  )
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  )
}

function formatCodeLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ')
}

function deltaTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if ((value ?? 0) > 0) {
    return 'up'
  }
  if ((value ?? 0) < 0) {
    return 'down'
  }
  return 'flat'
}

function formatSignedMoney(value: number, formatMoney: (value: number | null) => string): string {
  const formattedValue = formatMoney(Math.abs(value))
  if (value > 0) {
    return `+${formattedValue}`
  }
  if (value < 0) {
    return `-${formattedValue}`
  }
  return formattedValue
}

function sanitizeFilters(
  filters: SettlementReportFilters,
  options: {
    books: string[]
    counterparties: string[]
    currencies: string[]
    exceptionTypes: string[]
    severities: string[]
  },
): SettlementReportFilters {
  return {
    book: filters.book !== ALL_FILTER_VALUE && !options.books.includes(filters.book) ? ALL_FILTER_VALUE : filters.book,
    counterparty:
      filters.counterparty !== ALL_FILTER_VALUE && !options.counterparties.includes(filters.counterparty)
        ? ALL_FILTER_VALUE
        : filters.counterparty,
    currency:
      filters.currency !== ALL_FILTER_VALUE && !options.currencies.includes(filters.currency)
        ? ALL_FILTER_VALUE
        : filters.currency,
    exceptionType:
      filters.exceptionType !== ALL_FILTER_VALUE && !options.exceptionTypes.includes(filters.exceptionType)
        ? ALL_FILTER_VALUE
        : filters.exceptionType,
    severity:
      filters.severity !== ALL_FILTER_VALUE && !options.severities.includes(filters.severity)
        ? ALL_FILTER_VALUE
        : filters.severity,
  }
}

function toCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const normalized = String(value).replaceAll('"', '""')
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized
}

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const objectUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(objectUrl)
}

function reportErrorState(message: string) {
  return (
    <div className="empty-state">
      <strong>Reporting is unavailable</strong>
      <p>{message}</p>
    </div>
  )
}

function valuationCoverageTone(valuation: PnlTradeValuation): 'active' | 'in-progress' {
  return valuation.included_in_totals ? 'active' : 'in-progress'
}

function attributionTone(category: string): 'active' | 'in-progress' | 'blocked' {
  switch (category) {
    case 'REALIZATION':
    case 'MARK_CHANGE':
    case 'CARRY':
      return 'active'
    case 'NEW_POSITION':
    case 'REMOVED_POSITION':
    case 'POSITION_CHANGE':
    case 'ENTERED_TOTALS':
    case 'EXITED_TOTALS':
    case 'REOPENED':
      return 'in-progress'
    default:
      return 'blocked'
  }
}

function attributionLabel(category: string): string {
  switch (category) {
    case 'NEW_POSITION':
      return 'New position'
    case 'REMOVED_POSITION':
      return 'Removed position'
    case 'ENTERED_TOTALS':
      return 'Entered totals'
    case 'EXITED_TOTALS':
      return 'Exited totals'
    case 'REALIZATION':
      return 'Realization'
    case 'REOPENED':
      return 'Reopened'
    case 'POSITION_CHANGE':
      return 'Position change'
    case 'MARK_CHANGE':
      return 'Mark change'
    case 'CARRY':
      return 'Carry'
    case 'OUTSIDE_TOTALS':
      return 'Outside totals'
    default:
      return formatCodeLabel(category)
  }
}

function formatLifecycleEventLabel(eventType: string): string {
  return eventType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .trim()
}

export function ReportsWorkspace({
  activeTrades,
  authSession,
  counterpartyCreditReport,
  portfolios,
  formatNumber,
  formatMoney,
  formatDate,
  formatDateOnly,
  onOpenSettlement,
  onOpenTrade,
}: ReportsWorkspaceProps) {
  const reportAccessToken = authSession?.accessToken
  const [overview, setOverview] = useState<ReportingOverview | null>(null)
  const [exposureSummary, setExposureSummary] = useState<ExposureSummaryRow[]>([])
  const [activitySummary, setActivitySummary] = useState<ActivitySummaryRow[]>([])
  const [pnlHistory, setPnlHistory] = useState<PnlHistoryReport | null>(null)
  const [valuationSnapshot, setValuationSnapshot] = useState<PnlHistoryReport | null>(null)
  const [valuationSnapshotDate, setValuationSnapshotDate] = useState('')
  const [valuationPortfolioFilter, setValuationPortfolioFilter] = useState(ALL_FILTER_VALUE)
  const [valuationComparison, setValuationComparison] = useState<PnlComparisonReport | null>(null)
  const [comparisonStartDate, setComparisonStartDate] = useState('')
  const [comparisonEndDate, setComparisonEndDate] = useState('')
  const [comparisonPortfolioFilter, setComparisonPortfolioFilter] = useState(ALL_FILTER_VALUE)
  const [settlementAging, setSettlementAging] = useState<SettlementAgingReport | null>(null)
  const [cashForecast, setCashForecast] = useState<CashForecastReport | null>(null)
  const [settlementExceptions, setSettlementExceptions] = useState<SettlementExceptionReport | null>(null)
  const [settlementFilterOptions, setSettlementFilterOptions] = useState<SettlementReportFilterOptions | null>(null)
  const [settlementFilters, setSettlementFilters] = useState<SettlementReportFilters>(() =>
    readStoredSettlementReportFilters(),
  )
  const [savedPresets, setSavedPresets] = useState<SettlementReportPreset[]>(() =>
    sortSettlementReportPresets(readStoredSettlementReportPresets()),
  )
  const [presetNameInput, setPresetNameInput] = useState('')
  const [presetScopeInput, setPresetScopeInput] = useState<'PERSONAL' | 'SHARED'>('PERSONAL')
  const [presetError, setPresetError] = useState('')
  const [presetBusy, setPresetBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [valuationLoading, setValuationLoading] = useState(false)
  const [valuationError, setValuationError] = useState('')
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [settlementLoading, setSettlementLoading] = useState(true)
  const [settlementError, setSettlementError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadBaseReports() {
      setLoading(true)
      setError('')

      try {
        const [
          nextOverview,
          nextExposureSummary,
          nextActivitySummary,
          nextPnlHistory,
        ] = await Promise.all([
          loadReportingOverview(appConfig.apiBase, reportAccessToken),
          loadExposureSummary(appConfig.apiBase, reportAccessToken),
          loadActivitySummary(appConfig.apiBase, reportAccessToken),
          loadPnlHistoryReport(appConfig.apiBase, {}, reportAccessToken),
        ])

        if (cancelled) {
          return
        }

        setOverview(nextOverview)
        setExposureSummary(nextExposureSummary)
        setActivitySummary(nextActivitySummary)
        setPnlHistory(nextPnlHistory)
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load report data.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadBaseReports()

    return () => {
      cancelled = true
    }
  }, [reportAccessToken])

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

  const rankedCounterparties = useMemo(() => {
    return [...counterpartyCreditReport].sort((left, right) => {
      if (left.limit_breached !== right.limit_breached) {
        return left.limit_breached ? -1 : 1
      }
      if (left.review_is_due !== right.review_is_due) {
        return left.review_is_due ? -1 : 1
      }
      return right.active_trade_count - left.active_trade_count
    })
  }, [counterpartyCreditReport])
  const commodityUnitLabels = useMemo(() => buildUnitLabelByCommodity(activeTrades), [activeTrades])
  const grossNetVolumeUnitLabel = useMemo(
    () => summarizeUnitLabels(activeTrades.map((trade) => trade.unit_of_measure)),
    [activeTrades],
  )

  const availableSnapshotDates = useMemo(
    () => uniqueSorted((pnlHistory?.points ?? []).map((point) => point.date)),
    [pnlHistory],
  )
  const latestAvailableSnapshotDate = availableSnapshotDates[availableSnapshotDates.length - 1] ?? ''
  const previousAvailableSnapshotDate =
    availableSnapshotDates.length > 1 ? availableSnapshotDates[availableSnapshotDates.length - 2] : latestAvailableSnapshotDate
  const valuationQuickDates = useMemo(
    () => [...availableSnapshotDates].sort((left, right) => right.localeCompare(left)).slice(0, 5),
    [availableSnapshotDates],
  )
  const portfolioFilterOptions = useMemo(() => {
    return uniqueSorted([
      ...portfolios.filter((portfolio) => portfolio.is_active).map((portfolio) => portfolio.code),
      ...(valuationSnapshot?.valuations ?? []).map((valuation) => valuation.portfolio),
      ...(valuationComparison?.portfolio_deltas ?? []).map((row) => row.portfolio),
      valuationPortfolioFilter !== ALL_FILTER_VALUE ? valuationPortfolioFilter : null,
      comparisonPortfolioFilter !== ALL_FILTER_VALUE ? comparisonPortfolioFilter : null,
    ])
  }, [comparisonPortfolioFilter, portfolios, valuationComparison, valuationPortfolioFilter, valuationSnapshot])

  useEffect(() => {
    if (!valuationSnapshotDate && latestAvailableSnapshotDate) {
      setValuationSnapshotDate(latestAvailableSnapshotDate)
    }
  }, [latestAvailableSnapshotDate, valuationSnapshotDate])

  useEffect(() => {
    if (!comparisonEndDate && latestAvailableSnapshotDate) {
      setComparisonEndDate(latestAvailableSnapshotDate)
    }
    if (!comparisonStartDate && previousAvailableSnapshotDate) {
      setComparisonStartDate(previousAvailableSnapshotDate)
    }
  }, [comparisonEndDate, comparisonStartDate, latestAvailableSnapshotDate, previousAvailableSnapshotDate])

  useEffect(() => {
    if (!valuationSnapshotDate) {
      setValuationSnapshot(null)
      setValuationLoading(false)
      setValuationError('')
      return
    }

    let cancelled = false

    async function loadValuationSnapshot() {
      setValuationLoading(true)
      setValuationError('')

      try {
        const nextSnapshot = await loadPnlHistoryReport(appConfig.apiBase, {
          asOf: valuationSnapshotDate,
          portfolio: valuationPortfolioFilter !== ALL_FILTER_VALUE ? valuationPortfolioFilter : undefined,
        }, reportAccessToken)

        if (!cancelled) {
          setValuationSnapshot(nextSnapshot)
        }
      } catch (nextError) {
        if (!cancelled) {
          setValuationSnapshot(null)
          setValuationError(nextError instanceof Error ? nextError.message : 'Unable to load the valuation snapshot.')
        }
      } finally {
        if (!cancelled) {
          setValuationLoading(false)
        }
      }
    }

    void loadValuationSnapshot()

    return () => {
      cancelled = true
    }
  }, [reportAccessToken, valuationPortfolioFilter, valuationSnapshotDate])

  const comparisonDateError =
    comparisonStartDate && comparisonEndDate && comparisonStartDate > comparisonEndDate
      ? 'Comparison start date must be on or before the end date.'
      : ''

  useEffect(() => {
    if (!comparisonStartDate || !comparisonEndDate || comparisonDateError) {
      setValuationComparison(null)
      setComparisonLoading(false)
      setComparisonError(comparisonDateError)
      return
    }

    let cancelled = false

    async function loadValuationComparison() {
      setComparisonLoading(true)
      setComparisonError('')

      try {
        const nextComparison = await loadPnlComparisonReport(appConfig.apiBase, {
          fromAsOf: comparisonStartDate,
          toAsOf: comparisonEndDate,
          portfolio: comparisonPortfolioFilter !== ALL_FILTER_VALUE ? comparisonPortfolioFilter : undefined,
        }, reportAccessToken)
        if (!cancelled) {
          setValuationComparison(nextComparison)
        }
      } catch (nextError) {
        if (!cancelled) {
          setValuationComparison(null)
          setComparisonError(nextError instanceof Error ? nextError.message : 'Unable to load the valuation comparison.')
        }
      } finally {
        if (!cancelled) {
          setComparisonLoading(false)
        }
      }
    }

    void loadValuationComparison()

    return () => {
      cancelled = true
    }
  }, [comparisonDateError, comparisonEndDate, comparisonPortfolioFilter, comparisonStartDate, reportAccessToken])

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
  const valuationSummary = valuationSnapshot?.summary ?? null
  const snapshotValuations = useMemo(() => valuationSnapshot?.valuations ?? [], [valuationSnapshot])
  const includedSnapshotValuations = useMemo(
    () => snapshotValuations.filter((valuation) => valuation.included_in_totals && valuation.pnl_contribution !== null),
    [snapshotValuations],
  )
  const excludedSnapshotValuationCount = Math.max(snapshotValuations.length - includedSnapshotValuations.length, 0)
  const snapshotPortfolioRollups = useMemo(() => {
    const rollups = new Map<string, PortfolioValuationRollup>()

    for (const valuation of includedSnapshotValuations) {
      const portfolioCode = valuation.portfolio ?? 'UNASSIGNED'
      const current = rollups.get(portfolioCode) ?? {
        portfolio: portfolioCode,
        totalPnl: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        pricedTradeCount: 0,
      }

      const pnlContribution = valuation.pnl_contribution ?? 0
      current.totalPnl += pnlContribution
      if (valuation.pnl_bucket === 'REALIZED') {
        current.realizedPnl += pnlContribution
      } else {
        current.unrealizedPnl += pnlContribution
      }
      current.pricedTradeCount += 1
      rollups.set(portfolioCode, current)
    }

    return [...rollups.values()].sort((left, right) => {
      const totalDiff = Math.abs(right.totalPnl) - Math.abs(left.totalPnl)
      if (Math.abs(totalDiff) > 0.0001) {
        return totalDiff
      }
      return left.portfolio.localeCompare(right.portfolio)
    })
  }, [includedSnapshotValuations])
  const topSnapshotValuations = useMemo(() => {
    return [...snapshotValuations]
      .sort((left, right) => {
        const pnlDiff = Math.abs(right.pnl_contribution ?? 0) - Math.abs(left.pnl_contribution ?? 0)
        if (Math.abs(pnlDiff) > 0.0001) {
          return pnlDiff
        }
        return left.trade_id.localeCompare(right.trade_id)
      })
      .slice(0, 8)
  }, [snapshotValuations])
  const snapshotFilterActive =
    valuationPortfolioFilter !== ALL_FILTER_VALUE ||
    Boolean(valuationSnapshotDate && latestAvailableSnapshotDate && valuationSnapshotDate !== latestAvailableSnapshotDate)
  const comparisonSummary = valuationComparison?.delta ?? null
  const comparisonAttributionSummary = valuationComparison?.attribution_summary ?? null
  const comparisonPortfolioDeltas = useMemo(
    () => valuationComparison?.portfolio_deltas ?? [],
    [valuationComparison],
  )
  const comparisonDailyBridge = useMemo(
    () => valuationComparison?.daily_bridge ?? [],
    [valuationComparison],
  )
  const changedAttributionRows = useMemo(() => {
    const rows = valuationComparison?.attributions ?? []
    return rows.filter(
      (row) => Math.abs(row.pnl_delta) > 0.0001 || !['CARRY', 'OUTSIDE_TOTALS'].includes(row.attribution_category),
    )
  }, [valuationComparison])
  const topChangedAttributions = useMemo<TradeAttributionDisplayRow[]>(() => {
    return [...changedAttributionRows]
      .sort((left, right) => {
        const leftMagnitude = Math.max(
          Math.abs(left.pnl_delta),
          Math.abs(left.breakdown.realization_transfer_pnl),
          Math.abs(left.breakdown.reconciled_pnl_delta),
        )
        const rightMagnitude = Math.max(
          Math.abs(right.pnl_delta),
          Math.abs(right.breakdown.realization_transfer_pnl),
          Math.abs(right.breakdown.reconciled_pnl_delta),
        )
        if (Math.abs(rightMagnitude - leftMagnitude) > 0.0001) {
          return rightMagnitude - leftMagnitude
        }
        return left.trade_id.localeCompare(right.trade_id)
      })
      .map((row) => {
        const primaryValuation = row.to_valuation ?? row.from_valuation
        return {
          ...row,
          portfolio: primaryValuation?.portfolio ?? 'UNASSIGNED',
          book: primaryValuation?.book ?? 'Book TBD',
        }
      })
      .slice(0, 10)
  }, [changedAttributionRows])
  const comparisonFilterActive =
    comparisonPortfolioFilter !== ALL_FILTER_VALUE ||
    Boolean(
      comparisonStartDate &&
        previousAvailableSnapshotDate &&
        comparisonStartDate !== previousAvailableSnapshotDate,
    ) ||
    Boolean(comparisonEndDate && latestAvailableSnapshotDate && comparisonEndDate !== latestAvailableSnapshotDate)

  const fallbackFilterOptions = useMemo(() => {
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
    return {
      books: uniqueSorted([
        ...(settlementFilterOptions?.books ?? []),
        ...fallbackFilterOptions.books,
        settlementFilters.book !== ALL_FILTER_VALUE ? settlementFilters.book : null,
      ]),
      counterparties: uniqueSorted([
        ...(settlementFilterOptions?.counterparties ?? []),
        ...fallbackFilterOptions.counterparties,
        settlementFilters.counterparty !== ALL_FILTER_VALUE ? settlementFilters.counterparty : null,
      ]),
      currencies: uniqueSorted([
        ...(settlementFilterOptions?.currencies ?? []),
        ...fallbackFilterOptions.currencies,
        settlementFilters.currency !== ALL_FILTER_VALUE ? settlementFilters.currency : null,
      ]),
      exceptionTypes: uniqueSorted([
        ...(settlementFilterOptions?.exception_types ?? []),
        ...fallbackFilterOptions.exceptionTypes,
        settlementFilters.exceptionType !== ALL_FILTER_VALUE ? settlementFilters.exceptionType : null,
      ]),
      severities: uniqueSorted([
        ...(settlementFilterOptions?.severities ?? []),
        ...fallbackFilterOptions.severities,
        settlementFilters.severity !== ALL_FILTER_VALUE ? settlementFilters.severity : null,
      ]),
    }
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

  const settlementFilterActive = useMemo(() => {
    return Object.values(settlementFilters).some((value) => value !== ALL_FILTER_VALUE)
  }, [settlementFilters])

  const settlementFilterChips = useMemo(() => {
    const chips: string[] = []
    if (settlementFilters.book !== ALL_FILTER_VALUE) {
      chips.push(`Book ${settlementFilters.book}`)
    }
    if (settlementFilters.counterparty !== ALL_FILTER_VALUE) {
      chips.push(`Counterparty ${settlementFilters.counterparty}`)
    }
    if (settlementFilters.currency !== ALL_FILTER_VALUE) {
      chips.push(`Currency ${settlementFilters.currency}`)
    }
    if (settlementFilters.exceptionType !== ALL_FILTER_VALUE) {
      chips.push(settlementFilters.exceptionType.replaceAll('_', ' '))
    }
    if (settlementFilters.severity !== ALL_FILTER_VALUE) {
      chips.push(settlementFilters.severity === 'blocked' ? 'Blocked only' : 'In-progress only')
    }
    return chips
  }, [settlementFilters])

  function updateSettlementFilter<K extends keyof SettlementReportFilters>(key: K, value: SettlementReportFilters[K]) {
    setSettlementFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function resetSettlementFilters() {
    setSettlementFilters(DEFAULT_SETTLEMENT_REPORT_FILTERS)
    setPresetError('')
  }

  function resetValuationSnapshotFilters() {
    setValuationPortfolioFilter(ALL_FILTER_VALUE)
    setValuationSnapshotDate(latestAvailableSnapshotDate)
  }

  function resetValuationComparisonFilters() {
    setComparisonPortfolioFilter(ALL_FILTER_VALUE)
    setComparisonStartDate(previousAvailableSnapshotDate)
    setComparisonEndDate(latestAvailableSnapshotDate)
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
      presetId: activePreset?.name.toLowerCase() === presetName.toLowerCase() && activePreset.scope === presetScopeInput
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
            (preset) =>
              !(
                preset.name.toLowerCase() === presetName.toLowerCase() &&
                preset.scope === presetScopeInput
              ),
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

  function handleExportSettlementAging() {
    if (!settlementAging || agingRows.length === 0) {
      return
    }

    exportCsv(
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

  function handleExportCashForecast() {
    if (!cashForecast || cashPoints.length === 0) {
      return
    }

    exportCsv(
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

  function handleExportSettlementExceptions() {
    if (!settlementExceptions || exceptionRows.length === 0) {
      return
    }

    exportCsv(
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

  return (
    <TileLayout
      workspaceId="reports"
      workspaceLabel="Reports"
      authSession={authSession}
      tiles={[
        {
          id: 'reports-overview',
          eyebrow: 'Summary',
          title: 'Reporting Overview',
          description: 'A dedicated reporting surface over the desk summaries that previously lived only behind endpoints.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : overview ? (
            <div className="dashboard-report-grid">
              <article className="dashboard-report-card">
                <span>Active Trades</span>
                <strong>{formatNumber(overview.active_trade_count, 0)}</strong>
                <p>Trade count represented in the reporting overview.</p>
              </article>
              <article className="dashboard-report-card">
                <span>Tracked Commodities</span>
                <strong>{formatNumber(overview.tracked_commodity_count, 0)}</strong>
                <p>Distinct commodities currently represented in the reporting layer.</p>
              </article>
              <article className="dashboard-report-card">
                <span>Gross Net Volume</span>
                <MetricValue value={formatNumber(overview.gross_net_volume, 0)} unit={grossNetVolumeUnitLabel} />
                <p>Absolute reported volume across the exposure summary output.</p>
              </article>
              <article className="dashboard-report-card">
                <span>P&amp;L Snapshot</span>
                <strong>{formatMoney(pnlHistory?.summary.total_pnl ?? null)}</strong>
                <p>{pnlHistory?.basis ?? 'P&L reporting basis unavailable'}.</p>
              </article>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No reporting overview</strong>
              <p>The reporting service has not produced an overview yet.</p>
            </div>
          ),
        },
        {
          id: 'reports-exposure',
          eyebrow: 'Exposure',
          title: 'Exposure Summary',
          description: 'The commodity-level report output presented as a dedicated analyst workspace instead of a raw endpoint.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : exposureSummary.length > 0 ? (
            <div className="position-list">
              {exposureSummary.map((row) => (
                <article key={row.commodity} className="position-card">
                  <div>
                    <strong>{row.commodity}</strong>
                    <span>{row.active_trade_count} active trade{row.active_trade_count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="position-value">
                    <MetricValue
                      as="b"
                      value={formatNumber(row.net_volume, 0)}
                      unit={commodityUnitLabels.get(row.commodity) ?? 'Unit TBD'}
                    />
                    <span>{formatDate(row.updated_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No exposure report yet</strong>
              <p>Once the reporting layer sees projected positions, the commodity rollup will appear here.</p>
            </div>
          ),
        },
        {
          id: 'reports-activity',
          eyebrow: 'Activity',
          title: 'Activity Summary',
          description: 'A reporting-first view of the lifecycle tape grouped by event type and recency.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : activitySummary.length > 0 ? (
            <div className="position-list">
              {activitySummary.map((row) => (
                <article key={row.event_type} className="position-card">
                  <div>
                    <strong>{row.event_type}</strong>
                    <span>Last seen {formatDate(row.last_occurred_at)}</span>
                  </div>
                  <div className="position-value">
                    <b>{formatNumber(row.event_count, 0)}</b>
                    <span>events</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No activity report yet</strong>
              <p>Event reporting will appear once lifecycle events have been captured.</p>
            </div>
          ),
        },
        {
          id: 'reports-valuation-snapshot',
          eyebrow: 'Valuation',
          title: valuationSnapshotDate ? `Portfolio Snapshot · ${formatDateOnly(valuationSnapshotDate)}` : 'Portfolio Snapshot',
          description: 'Select one date at a time to inspect the marked portfolio and the trades driving that snapshot.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : availableSnapshotDates.length === 0 ? (
            <div className="empty-state">
              <strong>No valuation history yet</strong>
              <p>As trades and price observations arrive, daily valuation snapshots will become selectable here.</p>
            </div>
          ) : valuationLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : valuationError ? (
            reportErrorState(valuationError)
          ) : valuationSnapshot ? (
            <div className="pnl-trend-panel">
              <div className="pnl-trend-topbar">
                <div className="pnl-trend-copy">
                  <span>As Of {valuationSnapshotDate ? formatDateOnly(valuationSnapshotDate) : 'Snapshot date TBD'}</span>
                  <p>
                    {valuationSnapshot.basis ?? pnlHistory?.basis ?? 'Valuation basis unavailable'}. Select a day to inspect
                    the desk-wide valuation or narrow the view to one portfolio.
                  </p>
                </div>
                <div className="pnl-trend-toolbar">
                  {valuationQuickDates.length > 0 ? (
                    <div className="pnl-trend-presets" aria-label="Recent valuation snapshot dates">
                      {valuationQuickDates.map((dateValue) => (
                        <button
                          key={dateValue}
                          type="button"
                          className={`tab-pill ${valuationSnapshotDate === dateValue ? 'is-active' : ''}`}
                          aria-pressed={valuationSnapshotDate === dateValue}
                          onClick={() => setValuationSnapshotDate(dateValue)}
                        >
                          {formatDateOnly(dateValue)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {snapshotFilterActive ? (
                    <button
                      type="button"
                      className="button button-ghost pnl-trend-reset-button"
                      onClick={resetValuationSnapshotFilters}
                    >
                      Latest Snapshot
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pnl-trend-filter-grid">
                <label className="field">
                  <span>Snapshot Date</span>
                  <input
                    className="control"
                    type="date"
                    value={valuationSnapshotDate}
                    min={availableSnapshotDates[0] ?? undefined}
                    max={latestAvailableSnapshotDate || undefined}
                    onChange={(event) => setValuationSnapshotDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Portfolio</span>
                  <select
                    className="control"
                    value={valuationPortfolioFilter}
                    onChange={(event) => setValuationPortfolioFilter(event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Portfolios</option>
                    {portfolioFilterOptions.map((portfolio) => (
                      <option key={portfolio} value={portfolio}>
                        {portfolio}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pnl-trend-summary-grid">
                <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
                  <span>Total Value</span>
                  <strong>{formatMoney(valuationSummary?.total_pnl ?? 0)}</strong>
                  <p>{valuationSnapshotDate ? formatDateOnly(valuationSnapshotDate) : 'Snapshot date TBD'}</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Open Value</span>
                  <strong>{formatMoney(valuationSummary?.unrealized_pnl ?? 0)}</strong>
                  <p>{formatNumber(valuationSummary?.unrealized_trade_count ?? 0, 0)} open trade snapshots in totals.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Realized Value</span>
                  <strong>{formatMoney(valuationSummary?.realized_pnl ?? 0)}</strong>
                  <p>{formatNumber(valuationSummary?.realized_trade_count ?? 0, 0)} settled trade snapshots in totals.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Portfolios in Totals</span>
                  <strong>{formatNumber(snapshotPortfolioRollups.length, 0)}</strong>
                  <p>
                    {excludedSnapshotValuationCount > 0
                      ? `${formatNumber(excludedSnapshotValuationCount, 0)} trade valuation${excludedSnapshotValuationCount === 1 ? '' : 's'} remain outside totals.`
                      : `${formatNumber(valuationSummary?.priced_trade_count ?? 0, 0)} priced trade valuation${(valuationSummary?.priced_trade_count ?? 0) === 1 ? '' : 's'} included.`}
                  </p>
                </article>
              </div>

              <div className="shipment-card-actions pnl-trend-active-filters">
                <span>
                  Showing {formatNumber(snapshotValuations.length, 0)} trade valuation
                  {snapshotValuations.length === 1 ? '' : 's'} for {valuationSnapshotDate ? formatDateOnly(valuationSnapshotDate) : 'the selected date'}.
                </span>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">
                    {valuationPortfolioFilter !== ALL_FILTER_VALUE ? `Portfolio ${valuationPortfolioFilter}` : 'All portfolios'}
                  </span>
                  {excludedSnapshotValuationCount > 0 ? (
                    <span className="entity-chip entity-chip-soft">
                      {formatNumber(excludedSnapshotValuationCount, 0)} outside totals
                    </span>
                  ) : null}
                </div>
              </div>

              {snapshotPortfolioRollups.length > 0 ? (
                <div className="dashboard-report-grid">
                  {snapshotPortfolioRollups.map((rollup) => (
                    <article key={rollup.portfolio} className="dashboard-report-card">
                      <span>{rollup.portfolio}</span>
                      <strong>{formatMoney(rollup.totalPnl)}</strong>
                      <p>
                        Open {formatMoney(rollup.unrealizedPnl)} • Realized {formatMoney(rollup.realizedPnl)} •{' '}
                        {formatNumber(rollup.pricedTradeCount, 0)} priced trade{rollup.pricedTradeCount === 1 ? '' : 's'}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}

              {topSnapshotValuations.length > 0 ? (
                <div className="position-list">
                  {topSnapshotValuations.map((valuation) => (
                    <article key={valuation.trade_id} className="position-card shipment-card">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{valuation.trade_id}</strong>
                          <span>
                            {valuation.portfolio ?? 'Unassigned'} • {valuation.book ?? 'Book TBD'} •{' '}
                            {valuation.pnl_bucket === 'REALIZED' ? 'Realized' : 'Open'}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${valuationCoverageTone(valuation)}`}>
                          {valuation.included_in_totals && valuation.pnl_contribution !== null
                            ? formatMoney(valuation.pnl_contribution)
                            : 'Excluded'}
                        </span>
                      </div>
                      <p>
                        {valuation.valuation_status === 'VALUED'
                          ? `${valuation.quantity !== null ? `${formatNumber(valuation.quantity, Number.isInteger(valuation.quantity) ? 0 : 2)} ${valuation.price_unit_code ?? ''}`.trim() : 'Quantity pending'} @ ${formatMoney(valuation.effective_mark)}${valuation.price_index_code ? ` via ${valuation.price_index_code}` : ''}.`
                          : valuation.valuation_status_reason ?? 'Valuation is not yet included in totals.'}
                      </p>
                      <div className="shipment-card-actions">
                        <span>
                          {valuation.pricing_type} • {formatCodeLabel(valuation.valuation_status)}
                        </span>
                        <div className="shipment-card-meta">
                          <button type="button" className="button button-ghost" onClick={() => onOpenTrade(valuation.trade_id)}>
                            Open Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No trade valuations match this snapshot</strong>
                  <p>Try another date or clear the portfolio filter to widen the valuation lens.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No valuation snapshot selected</strong>
              <p>Choose a snapshot date to load the portfolio valuation breakdown.</p>
            </div>
          ),
        },
        {
          id: 'reports-valuation-compare',
          eyebrow: 'Attribution',
          title:
            comparisonStartDate && comparisonEndDate
              ? `Snapshot Compare · ${formatDateOnly(comparisonStartDate)} to ${formatDateOnly(comparisonEndDate)}`
              : 'Snapshot Compare',
          description: 'Compare any two valuation dates, isolate the straight difference, and read the first-pass P&L attribution trade by trade.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: loading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : error ? (
            reportErrorState(error)
          ) : availableSnapshotDates.length < 2 ? (
            <div className="empty-state">
              <strong>Need at least two snapshots</strong>
              <p>Once there are at least two marked dates, this panel will compare them and attribute the move.</p>
            </div>
          ) : comparisonLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : comparisonError ? (
            reportErrorState(comparisonError)
          ) : valuationComparison ? (
            <div className="pnl-trend-panel">
              <div className="pnl-trend-topbar">
                <div className="pnl-trend-copy">
                  <span>
                    {comparisonStartDate ? formatDateOnly(comparisonStartDate) : 'Start date TBD'} to{' '}
                    {comparisonEndDate ? formatDateOnly(comparisonEndDate) : 'End date TBD'}
                  </span>
                  <p>
                    {valuationComparison.basis}. Straight delta compares snapshot totals; attribution shows which trades
                    explain the move between the two dates.
                  </p>
                </div>
                <div className="pnl-trend-toolbar">
                  {comparisonFilterActive ? (
                    <button
                      type="button"
                      className="button button-ghost pnl-trend-reset-button"
                      onClick={resetValuationComparisonFilters}
                    >
                      Reset Compare
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pnl-trend-filter-grid">
                <label className="field">
                  <span>From Date</span>
                  <input
                    className="control"
                    type="date"
                    value={comparisonStartDate}
                    min={availableSnapshotDates[0] ?? undefined}
                    max={latestAvailableSnapshotDate || undefined}
                    onChange={(event) => setComparisonStartDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>To Date</span>
                  <input
                    className="control"
                    type="date"
                    value={comparisonEndDate}
                    min={availableSnapshotDates[0] ?? undefined}
                    max={latestAvailableSnapshotDate || undefined}
                    onChange={(event) => setComparisonEndDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Portfolio</span>
                  <select
                    className="control"
                    value={comparisonPortfolioFilter}
                    onChange={(event) => setComparisonPortfolioFilter(event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Portfolios</option>
                    {portfolioFilterOptions.map((portfolio) => (
                      <option key={portfolio} value={portfolio}>
                        {portfolio}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pnl-trend-summary-grid">
                <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
                  <span>Net Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonSummary?.total_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonSummary?.total_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>
                    {formatMoney(valuationComparison.from_snapshot.total_pnl)} to {formatMoney(valuationComparison.to_snapshot.total_pnl)}
                  </p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Market / Mark Move</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.market_move_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.market_move_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Comparable market or mark movement applied to start-of-window quantity.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Quantity Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.quantity_change_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.quantity_change_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>New, removed, or resized exposure at the ending valuation mark.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Coverage Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.coverage_change_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.coverage_change_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Trades entering or exiting totals because valuation support changed.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Realization Transfer</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.realization_transfer_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.realization_transfer_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Movement between unrealized and realized buckets, separate from net P&amp;L.</p>
                </article>

                <article className="pnl-trend-stat-card">
                  <span>Other Change</span>
                  <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(comparisonAttributionSummary?.other_change_pnl ?? 0)}`}>
                    {formatSignedMoney(comparisonAttributionSummary?.other_change_pnl ?? 0, formatMoney)}
                  </strong>
                  <p>Residual move from pricing-term or other non-market changes.</p>
                </article>
              </div>

              <div className="shipment-card-actions pnl-trend-active-filters">
                <span>
                  Comparing {formatDateOnly(valuationComparison.from_as_of)} against {formatDateOnly(valuationComparison.to_as_of)} across{' '}
                  {formatNumber(changedAttributionRows.length, 0)} changed trade{changedAttributionRows.length === 1 ? '' : 's'}.
                </span>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">
                    {comparisonPortfolioFilter !== ALL_FILTER_VALUE ? `Portfolio ${comparisonPortfolioFilter}` : 'All portfolios'}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    {formatNumber(valuationComparison.to_snapshot.priced_trade_count, 0)} priced trade snapshots at end date
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    Reconciled {formatSignedMoney(comparisonAttributionSummary?.reconciled_pnl_delta ?? 0, formatMoney)}
                  </span>
                </div>
              </div>

              {comparisonDailyBridge.length > 0 ? (
                <>
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">Bridge</span>
                      <h3>Daily Path</h3>
                    </div>
                    <p>
                      Step through the compare window one day at a time to see where the move actually happened.
                    </p>
                  </div>

                  <div className="dashboard-report-grid">
                    {comparisonDailyBridge.map((day) => (
                      <article key={`${day.from_as_of}-${day.to_as_of}`} className="dashboard-report-card">
                        <span>{formatDateOnly(day.to_as_of)}</span>
                        <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(day.delta.total_pnl)}`}>
                          {formatSignedMoney(day.delta.total_pnl, formatMoney)}
                        </strong>
                        <p>
                          {formatDateOnly(day.from_as_of)} to {formatDateOnly(day.to_as_of)} •{' '}
                          {formatNumber(day.changed_trade_count, 0)} changed trade
                          {day.changed_trade_count === 1 ? '' : 's'}
                        </p>
                        <p>
                          Market {formatSignedMoney(day.attribution_summary.market_move_pnl, formatMoney)} • Qty{' '}
                          {formatSignedMoney(day.attribution_summary.quantity_change_pnl, formatMoney)} • Transfer{' '}
                          {formatSignedMoney(day.attribution_summary.realization_transfer_pnl, formatMoney)}
                        </p>
                        <p>
                          {day.top_driver_trade_id && day.top_driver_summary
                            ? `${day.top_driver_trade_id} • ${day.top_driver_summary}`
                            : 'No material lifecycle or valuation movement landed on this day.'}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              {comparisonPortfolioDeltas.length > 0 ? (
                <div className="dashboard-report-grid">
                  {comparisonPortfolioDeltas.map((row) => (
                    <article key={row.portfolio} className="dashboard-report-card">
                      <span>{row.portfolio}</span>
                      <strong className={`pnl-trend-stat-value pnl-trend-stat-value-${deltaTone(row.delta.total_pnl)}`}>
                        {formatSignedMoney(row.delta.total_pnl, formatMoney)}
                      </strong>
                      <p>
                        {formatMoney(row.from_snapshot.total_pnl)} to {formatMoney(row.to_snapshot.total_pnl)} • Open{' '}
                        {formatSignedMoney(row.delta.unrealized_pnl, formatMoney)} • Realized{' '}
                        {formatSignedMoney(row.delta.realized_pnl, formatMoney)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}

              {topChangedAttributions.length > 0 ? (
                <div className="position-list">
                  {topChangedAttributions.map((row) => (
                    <article key={row.trade_id} className="position-card shipment-card">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>{row.trade_id}</strong>
                          <span>
                            {row.portfolio} • {row.book} • {attributionLabel(row.attribution_category)}
                          </span>
                        </div>
                        <span className={`status-pill status-pill-${attributionTone(row.attribution_category)}`}>
                          {formatSignedMoney(row.pnl_delta, formatMoney)}
                        </span>
                      </div>
                      <p>
                        {formatMoney(row.from_valuation?.pnl_contribution ?? 0)} on {formatDateOnly(comparisonStartDate)} to{' '}
                        {formatMoney(row.to_valuation?.pnl_contribution ?? 0)} on {formatDateOnly(comparisonEndDate)}.
                        {' '}
                        {row.from_valuation?.included_in_totals
                          ? `${row.from_valuation.pnl_bucket.toLowerCase()} before`
                          : 'Outside totals before'}
                        {' '}and{' '}
                        {row.to_valuation?.included_in_totals
                          ? `${row.to_valuation.pnl_bucket.toLowerCase()} after`
                          : 'outside totals after'}.
                        {' '}Driver: {row.driver_summary}.
                      </p>
                      <div className="shipment-card-actions">
                        <span>
                          Market/Mark {formatSignedMoney(row.breakdown.market_move_pnl, formatMoney)} • Qty{' '}
                          {formatSignedMoney(row.breakdown.quantity_change_pnl, formatMoney)} • Coverage{' '}
                          {formatSignedMoney(row.breakdown.coverage_change_pnl, formatMoney)}
                        </span>
                        <span>
                          Transfer {formatSignedMoney(row.breakdown.realization_transfer_pnl, formatMoney)} • Other{' '}
                          {formatSignedMoney(row.breakdown.other_change_pnl, formatMoney)} • Reconciled{' '}
                          {formatSignedMoney(row.breakdown.reconciled_pnl_delta, formatMoney)}
                        </span>
                        {row.driver_events.length > 0 ? (
                          <span>
                            {row.driver_events
                              .slice(0, 2)
                              .map((event) => `${formatLifecycleEventLabel(event.event_type)} ${formatDateOnly(event.occurred_at)}`)
                              .join(' • ')}
                            {row.driver_events.length > 2
                              ? ` • +${row.driver_events.length - 2} more`
                              : ''}
                          </span>
                        ) : null}
                        <div className="shipment-card-meta">
                          <button type="button" className="button button-ghost" onClick={() => onOpenTrade(row.trade_id)}>
                            Open Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No attributed movement</strong>
                  <p>The two selected snapshots currently carry forward without trade-level delta.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No comparison loaded</strong>
              <p>Select two dates to compare valuation snapshots.</p>
            </div>
          ),
        },
        {
          id: 'reports-settlement-lens',
          eyebrow: 'Lens',
          title: activePresetName ? `${activePresetName} preset active` : 'Settlement Lens',
          description: 'Filter the settlement reports, save named desk views, and keep the current lens pinned between sessions.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: (
            <div className="pnl-trend-copy">
              <div className="pnl-trend-topbar">
                <div className="pnl-trend-copy">
                  <span>Settlement Filters</span>
                  <p>
                    Currency applies across aging, forecast, and exceptions. Book, counterparty, exception type, and
                    severity narrow the server-side settlement reports. Signed-in users save presets to the shared API;
                    signed-out sessions fall back to this browser only.
                  </p>
                </div>
                <div className="pnl-trend-toolbar">
                  <button type="button" className="button button-ghost pnl-trend-reset-button" onClick={resetSettlementFilters}>
                    Reset Filters
                  </button>
                  {activePreset?.canEdit ? (
                    <button type="button" className="button button-ghost" onClick={() => void handleDeleteActivePreset()} disabled={presetBusy}>
                      Delete Active Preset
                    </button>
                  ) : null}
                  <button type="button" className="button button-secondary" onClick={() => void handleSavePreset()} disabled={presetBusy}>
                    {presetBusy ? 'Saving...' : 'Save Preset'}
                  </button>
                </div>
              </div>
              <div className="pnl-trend-filter-grid">
                <label className="field">
                  <span>Book</span>
                  <select
                    className="control"
                    value={settlementFilters.book}
                    onChange={(event) => updateSettlementFilter('book', event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Books</option>
                    {filterOptions.books.map((book) => (
                      <option key={book} value={book}>
                        {book}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Counterparty</span>
                  <select
                    className="control"
                    value={settlementFilters.counterparty}
                    onChange={(event) => updateSettlementFilter('counterparty', event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Counterparties</option>
                    {filterOptions.counterparties.map((counterparty) => (
                      <option key={counterparty} value={counterparty}>
                        {counterparty}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Currency</span>
                  <select
                    className="control"
                    value={settlementFilters.currency}
                    onChange={(event) => updateSettlementFilter('currency', event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Currencies</option>
                    {filterOptions.currencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Exception Type</span>
                  <select
                    className="control"
                    value={settlementFilters.exceptionType}
                    onChange={(event) => updateSettlementFilter('exceptionType', event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Exception Types</option>
                    {filterOptions.exceptionTypes.map((exceptionType) => (
                      <option key={exceptionType} value={exceptionType}>
                        {exceptionType.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Severity</span>
                  <select
                    className="control"
                    value={settlementFilters.severity}
                    onChange={(event) => updateSettlementFilter('severity', event.target.value)}
                  >
                    <option value={ALL_FILTER_VALUE}>All Severities</option>
                    {filterOptions.severities.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity === 'blocked' ? 'Blocked' : 'In Progress'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Preset Name</span>
                  <input
                    className="control"
                    value={presetNameInput}
                    onChange={(event) => {
                      setPresetNameInput(event.target.value)
                      if (presetError) {
                        setPresetError('')
                      }
                    }}
                    placeholder="Midwest cash watch"
                  />
                </label>
                <label className="field">
                  <span>Preset Scope</span>
                  <select
                    className="control"
                    value={presetScopeInput}
                    onChange={(event) => setPresetScopeInput(event.target.value as 'PERSONAL' | 'SHARED')}
                  >
                    <option value="PERSONAL">My Preset</option>
                    <option value="SHARED">Shared with Desk</option>
                  </select>
                </label>
              </div>
              {presetError ? <p className="field-error">{presetError}</p> : null}
              <div className="shipment-card-actions pnl-trend-active-filters">
                <span>
                  Showing {formatNumber(agingRows.length, 0)} aging rows, {formatNumber(cashPoints.length, 0)} cash forecast
                  point{cashPoints.length === 1 ? '' : 's'}, and {formatNumber(exceptionRows.length, 0)} settlement exception
                  {exceptionRows.length === 1 ? '' : 's'}.
                </span>
                <div className="shipment-card-meta">
                  {activePresetName ? <span className="entity-chip entity-chip-soft">Preset {activePresetName}</span> : null}
                  {activePreset ? (
                    <span className="entity-chip entity-chip-soft">
                      {activePreset.scope === 'SHARED' ? 'Shared preset' : 'Personal preset'}
                    </span>
                  ) : null}
                  {settlementFilterActive ? (
                    settlementFilterChips.map((chip) => (
                      <span key={chip} className="entity-chip entity-chip-soft">
                        {chip}
                      </span>
                    ))
                  ) : (
                    <span className="entity-chip entity-chip-soft">No settlement filters applied</span>
                  )}
                </div>
              </div>
              {savedPresets.length > 0 ? (
                <div className="pnl-trend-presets">
                  {savedPresets.map((preset) => (
                    <button
                      key={preset.presetId ?? `${preset.scope}-${preset.name}`}
                      type="button"
                      className={`tab-pill ${
                        activePreset &&
                        (
                          (activePreset.presetId !== null && activePreset.presetId === preset.presetId) ||
                          (activePreset.presetId === null &&
                            activePreset.name === preset.name &&
                            activePreset.scope === preset.scope)
                        )
                          ? 'is-active'
                          : ''
                      }`}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.scope === 'SHARED' ? `${preset.name} - Shared` : preset.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pnl-trend-note">Save the current lens once it matches a desk workflow you expect to reuse.</p>
              )}
            </div>
          ),
        },
        {
          id: 'reports-settlement-aging',
          eyebrow: 'Settlement',
          title: 'Settlement Aging',
          description: 'Open invoice exposure grouped into current and past-due buckets, with disputed cash called out instead of staying buried in the settlement queue.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: settlementLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : settlementError ? (
            reportErrorState(settlementError)
          ) : settlementAging && agingCurrencySummaries.length > 0 ? (
            <>
              <div className="shipment-card-actions">
                <span>
                  {formatNumber(agingRows.reduce((sum, row) => sum + row.invoice_count, 0), 0)} open invoice
                  {agingRows.reduce((sum, row) => sum + row.invoice_count, 0) === 1 ? '' : 's'} as of {formatDateOnly(settlementAging.as_of)}
                </span>
                <div className="shipment-card-meta">
                  <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
                    Open Settlement
                  </button>
                  <button type="button" className="button button-secondary" onClick={handleExportSettlementAging}>
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="dashboard-report-grid">
                {agingCurrencySummaries.map((summary) => (
                  <article key={summary.currency_code} className="dashboard-report-card">
                    <span>{summary.currency_code} Open</span>
                    <strong>{formatCurrencyAmount(summary.total_outstanding_amount, summary.currency_code)}</strong>
                    <p>
                      Current {formatCurrencyAmount(summary.current_amount, summary.currency_code)} • 1-7{' '}
                      {formatCurrencyAmount(summary.past_due_1_7_amount, summary.currency_code)} • 8-30{' '}
                      {formatCurrencyAmount(summary.past_due_8_30_amount, summary.currency_code)} • 31+{' '}
                      {formatCurrencyAmount(summary.past_due_31_plus_amount, summary.currency_code)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="position-list">
                {agingRows.slice(0, 8).map((row) => (
                  <article
                    key={`${row.counterparty_code ?? 'UNSPECIFIED'}-${row.book}-${row.currency_code}`}
                    className="position-card shipment-card"
                  >
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{row.counterparty_code ?? 'Counterparty TBD'}</strong>
                        <span>
                          {row.book} • {row.trade_count} trade{row.trade_count === 1 ? '' : 's'} • {row.invoice_count} invoice
                          {row.invoice_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${row.overdue_invoice_count > 0 || row.disputed_invoice_count > 0 ? 'blocked' : 'active'}`}>
                        {formatCurrencyAmount(row.total_outstanding_amount, row.currency_code)}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">
                        Current {formatCurrencyAmount(row.current_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        1-7 {formatCurrencyAmount(row.past_due_1_7_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        8-30 {formatCurrencyAmount(row.past_due_8_30_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        31+ {formatCurrencyAmount(row.past_due_31_plus_amount, row.currency_code)}
                      </span>
                      {row.disputed_amount > 0 ? (
                        <span className="entity-chip entity-chip-soft">
                          Disputed {formatCurrencyAmount(row.disputed_amount, row.currency_code)}
                        </span>
                      ) : null}
                    </div>
                    <div className="shipment-card-copy">
                      <p>
                        {row.overdue_invoice_count} overdue • {row.disputed_invoice_count} disputed • Oldest due{' '}
                        {formatDate(row.oldest_due_at)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>{settlementFilterActive ? 'No aging rows match the current lens' : 'No settlement aging yet'}</strong>
              <p>
                {settlementFilterActive
                  ? 'Reset the settlement lens or choose a broader preset to restore the aging board.'
                  : 'Open invoices will populate aging once the settlement ledger starts carrying unpaid cash exposure.'}
              </p>
            </div>
          ),
        },
        {
          id: 'reports-cash-forecast',
          eyebrow: 'Cash',
          title: 'Cash Forecast',
          description: 'Expected receipts from open invoices versus actual settlement receipts, using the live ledger instead of desk-side spreadsheets.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: settlementLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : settlementError ? (
            reportErrorState(settlementError)
          ) : cashForecast && cashCurrencySummaries.length > 0 ? (
            <>
              <div className="shipment-card-actions">
                <span>
                  {cashForecast.horizon_days}-day horizon from {formatDateOnly(cashForecast.as_of)}.
                </span>
                <div className="shipment-card-meta">
                  <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
                    Open Settlement
                  </button>
                  <button type="button" className="button button-secondary" onClick={handleExportCashForecast}>
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="dashboard-report-grid">
                {cashCurrencySummaries.map((summary) => (
                  <article key={summary.currency_code} className="dashboard-report-card">
                    <span>{summary.currency_code} Horizon</span>
                    <strong>{formatCurrencyAmount(summary.expected_horizon_amount, summary.currency_code)}</strong>
                    <p>
                      Open {formatCurrencyAmount(summary.open_outstanding_amount, summary.currency_code)} • Overdue{' '}
                      {formatCurrencyAmount(summary.overdue_outstanding_amount, summary.currency_code)} • Received{' '}
                      {formatCurrencyAmount(summary.received_horizon_amount, summary.currency_code)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="position-list">
                {cashPoints.slice(0, 12).map((point) => (
                  <article key={`${point.forecast_date}-${point.currency_code}`} className="position-card">
                    <div>
                      <strong>{formatDate(point.forecast_date)}</strong>
                      <span>
                        {point.currency_code} • {point.expected_invoice_count} due • {point.received_payment_count} received
                      </span>
                    </div>
                    <div className="position-value">
                      <b>{formatCurrencyAmount(point.expected_amount, point.currency_code)}</b>
                      <span>Expected</span>
                    </div>
                    <div className="shipment-card-copy">
                      <p>Received {formatCurrencyAmount(point.received_amount, point.currency_code)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>{settlementFilterActive ? 'No cash forecast rows match the current lens' : 'No cash forecast yet'}</strong>
              <p>
                {settlementFilterActive
                  ? 'Reset the settlement lens or choose a broader preset to restore the cash outlook.'
                  : 'Cash forecast points will appear once invoice due dates or payment receipts have been recorded.'}
              </p>
            </div>
          ),
        },
        {
          id: 'reports-settlement-exceptions',
          eyebrow: 'Exceptions',
          title: 'Settlement Watchlist',
          description: 'A single queue for disputed invoices, short pays, and overdue cash so operators can work what actually needs intervention.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: settlementLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : settlementError ? (
            reportErrorState(settlementError)
          ) : settlementExceptions && exceptionRows.length > 0 ? (
            <>
              <div className="shipment-card-actions">
                <span>
                  {formatNumber(blockedExceptionCount, 0)} blocked • {formatNumber(warningExceptionCount, 0)} in-progress
                  exception{exceptionRows.length === 1 ? '' : 's'}.
                </span>
                <div className="shipment-card-meta">
                  <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
                    Open Settlement
                  </button>
                  <button type="button" className="button button-secondary" onClick={handleExportSettlementExceptions}>
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="dashboard-report-grid">
                {exceptionSummaries.map((summary) => (
                  <article key={`${summary.exception_type}-${summary.currency_code}`} className="dashboard-report-card">
                    <span>
                      {summary.exception_type.replaceAll('_', ' ')} • {summary.currency_code}
                    </span>
                    <strong>{formatNumber(summary.exception_count, 0)}</strong>
                    <p>
                      {summary.affected_trade_count} trade{summary.affected_trade_count === 1 ? '' : 's'} • Open amount{' '}
                      {formatCurrencyAmount(summary.total_outstanding_amount, summary.currency_code)}
                    </p>
                  </article>
                ))}
              </div>
              <div className="position-list">
                {exceptionRows.slice(0, 10).map((row) => (
                  <article key={`${row.exception_type}-${row.invoice_id}-${row.trade_id}`} className="position-card shipment-card">
                    <div className="shipment-card-head">
                      <div className="shipment-card-copy">
                        <strong>{row.trade_id}</strong>
                        <span>
                          {row.exception_type.replaceAll('_', ' ')} • {row.counterparty_code ?? 'Counterparty TBD'} • {row.book}
                        </span>
                      </div>
                      <span className={`status-pill status-pill-${row.severity}`}>
                        {row.severity === 'blocked' ? 'Escalate' : 'Monitor'}
                      </span>
                    </div>
                    <div className="shipment-card-meta">
                      <span className="entity-chip entity-chip-soft">{row.invoice_number}</span>
                      <span className="entity-chip entity-chip-soft">{row.commodity}</span>
                      <span className="entity-chip entity-chip-soft">
                        Outstanding {formatCurrencyAmount(row.outstanding_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        Paid {formatCurrencyAmount(row.total_paid_amount, row.currency_code)}
                      </span>
                      <span className="entity-chip entity-chip-soft">
                        {row.owner ? `Owner ${row.owner}` : 'Unassigned'}
                      </span>
                    </div>
                    <div className="shipment-card-copy">
                      <p>{row.summary}</p>
                      <p>
                        Due {formatDate(row.due_at)} • Last receipt {formatDate(row.last_received_at)} • Payment {row.payment_status.replaceAll('_', ' ')}
                      </p>
                    </div>
                    <div className="shipment-card-actions">
                      <span>
                        Invoice {row.invoice_status.replaceAll('_', ' ')} • Settlement {row.settlement_status.replaceAll('_', ' ')}
                      </span>
                      <div className="shipment-card-meta">
                        <button type="button" className="button button-ghost" onClick={() => onOpenTrade(row.trade_id)}>
                          Open Trade
                        </button>
                        <button type="button" className="button button-secondary" onClick={onOpenSettlement}>
                          Open Settlement
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>{settlementFilterActive ? 'No settlement exceptions match the current lens' : 'No active settlement exceptions'}</strong>
              <p>
                {settlementFilterActive
                  ? 'Reset the settlement lens or apply another preset to widen the watchlist.'
                  : 'The watchlist will populate when invoices are disputed, partially short paid, or pass due without settlement.'}
              </p>
            </div>
          ),
        },
        {
          id: 'reports-credit',
          eyebrow: 'Credit',
          title: 'Counterparty Credit Report',
          description: 'Credit, exposure, and review posture on one desk-facing report surface.',
          span: 'full',
          availableSpans: ['full', 'wide'],
          content: rankedCounterparties.length > 0 ? (
            <div className="position-list">
              {rankedCounterparties.slice(0, 8).map((row) => (
                <article key={row.counterparty_code} className="position-card shipment-card">
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>{row.counterparty_name}</strong>
                      <span>
                        {row.counterparty_code} • {row.counterparty_type}
                      </span>
                    </div>
                    <span className={`status-pill status-pill-${row.limit_breached || row.review_is_due ? 'blocked' : 'active'}`}>
                      {row.credit_status}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">{row.active_trade_count} active</span>
                    <span className="entity-chip entity-chip-soft">{row.priced_trade_count} priced</span>
                    <span className="entity-chip entity-chip-soft">{row.unpriced_trade_count} unpriced</span>
                    <span className="entity-chip entity-chip-soft">{row.breach_action}</span>
                  </div>
                  <div className="shipment-card-copy">
                    <p>
                      Exposure {formatCurrencyAmount(row.exposure_amount ?? null, row.exposure_currency_code)} • Limit{' '}
                      {formatCurrencyAmount(row.limit_amount ?? null, row.limit_currency_code)}
                    </p>
                    <p>
                      Rating {row.credit_rating ?? 'NR'} • Updated {formatDate(row.latest_trade_updated_at ?? null)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No counterparty credit report</strong>
              <p>Counterparty reporting will appear once active trade exposure and credit data are available.</p>
            </div>
          ),
        },
      ]}
    />
  )
}
