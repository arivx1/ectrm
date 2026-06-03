import { useEffect, useMemo, useState } from 'react'
import type {
  CounterpartyCreditPreviewRecord,
  ExternalDataSyncStatusRecord,
  PriceSourceReviewRecord,
  WeatherLocationRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import { combineTextFilters, matchesTextFilter } from '../../shared/filtering'
import { formatDateOnly } from '../../shared/format'
import { tradeStatusIsActive } from '../../shared/trading'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'
import { WorkspaceLocalFilterBar } from '../../shared/ui/WorkspaceLocalFilterBar'
import { type StoredAuthSession } from '../../shared/mutation'
import type { ExternalDataSyncProvider } from '../../entities/app/workspaceDataShared'
import { AgentManagementPanel } from './AgentManagementPanel'
import { AssistantApprovalInboxPanel } from './AssistantApprovalInboxPanel'
import { AssistantControlTowerPanel } from './AssistantControlTowerPanel'
import { AssistantOutcomeMetricsPanel } from './AssistantOutcomeMetricsPanel'
import { CodexTaskPanel } from './CodexTaskPanel'
import { HomeViewAdminPanel } from './HomeViewAdminPanel'
import { JobSchedulingPanel } from './JobSchedulingPanel'
import { ProjectionMonitoringPanel } from './ProjectionMonitoringPanel'
import { RoadmapAdminPanel } from './RoadmapAdminPanel'
import { UserManagementPanel } from './UserManagementPanel'
import { WeatherOperationsPanel } from './WeatherOperationsPanel'
import {
  ADMIN_PRICE_SOURCES_SECTION_ID,
  ADMIN_PRICE_SOURCE_DETAIL_PREFIX,
  adminPriceSourceDetailAnchorId,
  readAdminPriceSourceIdFromHash,
} from './adminRouteAnchors'
import type { AssistantControlTowerSupervisionIntent } from './assistantSupervisionDraft'
import { SystemStatusPanel } from '../dashboard/SystemStatusPanel'

type Trade = {
  trade_id: string
  updated_at: string
  commodity_class: string
  commodity: string
  price: number | null
  book: string
  status: string
}

type EventRow = {
  aggregate_id: string
  event_id: string
  event_type: string
  occurred_at: string
  recorded_at: string
  schema_version: number
}

type PositionRow = {
  commodity: string
  net_volume: number
  updated_at: string
}

type ReferenceRecord = {
  code: string
  is_active: boolean
}

type PriceIndexRecord = ReferenceRecord

type ExternalDataRunRecord = {
  id: number
  provider: string
  job_name: string
  status: string
  started_at: string
  finished_at?: string | null
  requested_by?: string | null
  series_count: number
  observation_count: number
  error_summary?: string | null
}

type TradingSourceRecord = {
  source_id: string
  source_name: string
  source_category: string
  business_owner: string
  system_owner: string
  criticality: string
  status: string
  update_frequency: string
  last_reviewed_at: string
}

type ExternalDataProviderStatusRecord = ExternalDataSyncStatusRecord['providers'][number]
type CounterpartyCreditPreviewRow = CounterpartyCreditPreviewRecord['rows'][number]

type SchemaEntityKey =
  | 'events'
  | 'trades'
  | 'positions'
  | 'reference_books'
  | 'reference_commodities'
  | 'reference_price_indices'

type AdminSectionKey =
  | 'overview'
  | 'external-data'
  | 'assistant-governance'
  | 'automation'
  | 'access-planning'
  | 'explainability'

const ADMIN_SECTIONS: Array<{
  key: AdminSectionKey
  label: string
  description: string
}> = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Only the posture and next places to look.',
  },
  {
    key: 'external-data',
    label: 'External Data',
    description: 'Weather, market sources, D&B preview, and source register.',
  },
  {
    key: 'assistant-governance',
    label: 'Assistant',
    description: 'Control tower, agents, outcomes, and approvals.',
  },
  {
    key: 'automation',
    label: 'Automation',
    description: 'Codex dispatch, scheduled jobs, and projections.',
  },
  {
    key: 'access-planning',
    label: 'Access & Planning',
    description: 'Users, roadmap, shared Home inventory, and governance setup.',
  },
  {
    key: 'explainability',
    label: 'Explainability',
    description: 'System atlas, lifecycle trace, schema, and provenance.',
  },
]

type AdminWorkspaceProps = {
  authSession: StoredAuthSession | null
  globalFilter: string
  onOpenSettings: () => void
  onRoadmapPublished: () => void
  selectedTrade: Trade | null
  selectedTradeEvents: EventRow[]
  events: EventRow[]
  trades: Trade[]
  positions: PositionRow[]
  activeBooks: ReferenceRecord[]
  activeCommodities: ReferenceRecord[]
  priceIndices: PriceIndexRecord[]
  externalDataRuns: ExternalDataRunRecord[]
  externalDataSyncStatus: ExternalDataSyncStatusRecord | null
  externalDataPriceSources: PriceSourceReviewRecord[]
  tradingSources: TradingSourceRecord[]
  weatherLocations: WeatherLocationRecord[]
  weatherSyncStatus: WeatherSyncStatusRecord | null
  externalDataSyncing: boolean
  externalDataSyncingProvider: string | null
  externalDataError: string
  externalDataSuccess: string
  counterpartyCreditImportDraft: string
  counterpartyCreditPreview: CounterpartyCreditPreviewRecord | null
  counterpartyCreditPreviewing: boolean
  counterpartyCreditPreviewError: string
  counterpartyCreditPreviewSuccess: string
  counterpartyCreditImporting: boolean
  counterpartyCreditImportError: string
  counterpartyCreditImportSuccess: string
  tradingSourcesSyncing: boolean
  tradingSourcesError: string
  tradingSourcesSuccess: string
  weatherSyncing: boolean
  weatherSyncError: string
  weatherSyncSuccess: string
  weatherLocationMutationError: string
  weatherLocationMutationPendingCode: string | null
  weatherLocationMutationSuccess: string
  onRunExternalDataSync: (provider: ExternalDataSyncProvider) => Promise<void>
  onCounterpartyCreditImportDraftChange: (value: string) => void
  onPreviewCounterpartyCreditImport: () => Promise<void>
  onImportCounterpartyCreditSnapshots: () => Promise<void>
  onCreateWeatherLocation: (
    input: {
      code: string
      name: string
      latitude: number
      longitude: number
      reference_location_code?: string | null
      timezone?: string | null
      description?: string | null
    },
  ) => Promise<void>
  onUpdateWeatherLocation: (
    locationCode: string,
    input: {
      name?: string | null
      latitude?: number | null
      longitude?: number | null
      reference_location_code?: string | null
      timezone?: string | null
      description?: string | null
    },
  ) => Promise<void>
  onDeactivateWeatherLocation: (locationCode: string) => Promise<void>
  onReactivateWeatherLocation: (locationCode: string) => Promise<void>
  onRunNwsWeatherSync: () => Promise<void>
  onSeedTradingSources: () => Promise<void>
  onRefreshData: () => Promise<void>
  formatDate: (value: string | null | undefined) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatCommodityClass: (value: string) => string
}

const ADMIN_DOMAIN_MAP = [
  {
    key: 'trading',
    label: 'Trading',
    summary: 'Capture, amend, and cancel commercial positions through typed workflows.',
    entities: ['trades', 'events'],
  },
  {
    key: 'reference_data',
    label: 'Reference Data',
    summary: 'Steward books, commodities, and pricing records that validate writes.',
    entities: ['reference_books', 'reference_commodities', 'reference_price_indices'],
  },
  {
    key: 'risk',
    label: 'Risk',
    summary: 'Aggregate exposure from projections instead of raw write models.',
    entities: ['positions'],
  },
  {
    key: 'operations',
    label: 'Operations',
    summary: 'Own projection rebuilds, monitoring, and operational readiness.',
    entities: ['events', 'positions'],
  },
  {
    key: 'admin',
    label: 'Admin',
    summary: 'Govern access, data stewardship, and explainability surfaces.',
    entities: ['events', 'reference_books'],
  },
  {
    key: 'assistant',
    label: 'Assistant',
    summary: 'Explain and eventually act through the same application services.',
    entities: ['events', 'trades', 'positions'],
  },
] as const

const SCHEMA_ENTITIES: Array<{
  key: SchemaEntityKey
  label: string
  status: 'Current' | 'Planned'
  purpose: string
  fields: string[]
  relationships: string[]
  consumers: string[]
}> = [
  {
    key: 'events',
    label: 'events',
    status: 'Current',
    purpose: 'Stores the immutable event stream for trade lifecycle changes and other auditable actions.',
    fields: ['event_id', 'aggregate_id', 'event_type', 'recorded_at', 'schema_version'],
    relationships: ['feeds trades projection by aggregate_id', 'feeds positions projection through rebuild/update logic'],
    consumers: ['Events workspace', 'Trade inspector', 'Admin lifecycle trace'],
  },
  {
    key: 'trades',
    label: 'trades',
    status: 'Current',
    purpose: 'Read model optimized for current trade state and fast operator inspection.',
    fields: ['trade_id', 'book', 'commodity_class', 'commodity', 'price', 'status', 'updated_at'],
    relationships: ['rebuilt from events', 'joins conceptually to reference_books and reference_commodities by code'],
    consumers: ['Dashboard', 'Trades workspace', 'Admin provenance'],
  },
  {
    key: 'positions',
    label: 'positions',
    status: 'Current',
    purpose: 'Aggregated exposure projection for downstream risk and position views.',
    fields: ['commodity', 'net_volume', 'updated_at'],
    relationships: ['derived from trade-affecting events', 'linked to reference_commodities for class context'],
    consumers: ['Positions workspace', 'Dashboard exposure cards', 'Admin lifecycle trace'],
  },
  {
    key: 'reference_books',
    label: 'reference_books',
    status: 'Current',
    purpose: 'Authoritative list of valid books available to trade capture and governance.',
    fields: ['code', 'is_active'],
    relationships: ['selected by trade capture', 'governed in reference data workspace'],
    consumers: ['Trade forms', 'Reference data editor', 'Admin provenance'],
  },
  {
    key: 'reference_commodities',
    label: 'reference_commodities',
    status: 'Current',
    purpose: 'Commodity master records used for validation and classification.',
    fields: ['code', 'commodity_class', 'is_active', 'updated_at', 'version'],
    relationships: ['selected by trade capture', 'used to classify positions'],
    consumers: ['Trade forms', 'Positions workspace', 'Admin schema explorer'],
  },
  {
    key: 'reference_price_indices',
    label: 'reference_price_indices',
    status: 'Current',
    purpose: 'Structured pricing references for index-based trade modeling.',
    fields: ['code', 'commodity_code', 'currency_code', 'unit_code', 'provider', 'market'],
    relationships: ['depends on commodities and pricing metadata', 'supports future trade price terms'],
    consumers: ['Reference data workspace', 'Future pricing workflows', 'Admin schema explorer'],
  },
]

function projectionFreshnessTooltip(label: string) {
  switch (label) {
    case 'Fresh':
      return 'Trade and position projections are within roughly 15 minutes of the latest loaded event.'
    case 'Monitoring':
      return 'Projections are lagging slightly and should be watched, but they are not materially stale yet.'
    case 'Lagging':
      return 'Projection updates are meaningfully behind the latest loaded event stream and need investigation.'
    case 'Awaiting flow':
      return 'Not enough event or projection data is loaded yet to assess freshness.'
    default:
      return 'Projection freshness could not be confidently determined from the currently loaded timestamps.'
  }
}

function AdminCardTitle({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <strong>
      <InlineTooltipLabel tooltip={tooltip} tooltipLabel={`More information about ${label}`} align="start">
        {label}
      </InlineTooltipLabel>
    </strong>
  )
}

function cadenceLabel(intervalMinutes: number): string {
  if (intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60
    return hours === 1 ? 'Hourly' : `Every ${hours}h`
  }

  return `Every ${intervalMinutes}m`
}

function successSlaLabel(hours: number | null | undefined): string {
  if (typeof hours !== 'number') {
    return 'SLA unknown'
  }

  if (hours < 24) {
    return `${hours}h SLA`
  }

  const days = hours / 24
  return `${days.toFixed(days >= 10 || Number.isInteger(days) ? 0 : 1)}d SLA`
}

function lookbackLabel(days: number | null | undefined): string {
  if (typeof days !== 'number') {
    return 'Snapshot pull'
  }

  if (days < 365) {
    return `${days}d lookback`
  }

  const years = days / 365
  return `${years.toFixed(years >= 10 || Number.isInteger(years) ? 0 : 1)}y lookback`
}

function sourceEndpointLabel(value: string | null | undefined): string {
  if (!value) {
    return 'No source endpoint'
  }

  try {
    const url = new URL(value)
    return url.pathname && url.pathname !== '/' ? `${url.hostname}${url.pathname}` : url.hostname
  } catch {
    return value
  }
}

function readSelectedPriceSourceIdFromLocation(): number | null {
  if (typeof window === 'undefined') {
    return null
  }

  return readAdminPriceSourceIdFromHash(window.location.hash)
}

function readAdminSectionFromHash(hash: string): AdminSectionKey | null {
  const normalizedHash = hash.replace(/^#/, '').trim()

  if (
    normalizedHash === ADMIN_PRICE_SOURCES_SECTION_ID ||
    normalizedHash.startsWith(ADMIN_PRICE_SOURCE_DETAIL_PREFIX)
  ) {
    return 'external-data'
  }

  if (
    normalizedHash === 'assistant-agent-management' ||
    normalizedHash === 'assistant-agent-work-packages' ||
    normalizedHash === 'assistant-agent-profile-requests' ||
    normalizedHash === 'assistant-agent-builder' ||
    normalizedHash === 'assistant-agent-editor' ||
    normalizedHash === 'assistant-outcome-metrics' ||
    normalizedHash === 'assistant-approval-inbox'
  ) {
    return 'assistant-governance'
  }

  if (normalizedHash === 'job-scheduling') {
    return 'automation'
  }

  return null
}

function readInitialAdminSection(): AdminSectionKey {
  if (typeof window === 'undefined') {
    return 'overview'
  }

  return readAdminSectionFromHash(window.location.hash) ?? 'overview'
}

function weatherHealthTone(status: string): 'active' | 'blocked' | 'in-progress' | 'cancelled' {
  switch (status) {
    case 'healthy':
      return 'active'
    case 'running':
      return 'in-progress'
    case 'failed':
      return 'cancelled'
    default:
      return 'blocked'
  }
}

function weatherHealthLabel(status: string): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'running':
      return 'Running'
    case 'failed':
      return 'Failed'
    case 'stale':
      return 'Stale'
    case 'missing':
      return 'Missing'
    case 'degraded':
      return 'Degraded'
    default:
      return 'Unknown'
  }
}

function formatAgeHours(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'No data'
  }

  if (value < 1) {
    return `${Math.max(1, Math.round(value * 60))}m old`
  }

  if (value < 24) {
    return `${value.toFixed(value >= 10 ? 0 : 1)}h old`
  }

  const days = value / 24
  return `${days.toFixed(days >= 10 ? 0 : 1)}d old`
}

function marketDataCategoryLabel(value: string): string {
  switch (value) {
    case 'price':
      return 'Prices'
    case 'power':
      return 'Power'
    case 'fundamentals':
      return 'Fundamentals'
    case 'macro':
      return 'Macro'
    case 'market':
      return 'Market'
    case 'positioning':
      return 'Positioning'
    default:
      return value
  }
}

function priceSourceReviewTone(status: string): 'active' | 'blocked' | 'in-progress' | 'cancelled' {
  switch (status) {
    case 'current':
    case 'loaded':
      return 'active'
    case 'running':
      return 'in-progress'
    case 'inactive':
      return 'cancelled'
    default:
      return 'blocked'
  }
}

function priceSourceReviewLabel(status: string): string {
  switch (status) {
    case 'current':
      return 'Current'
    case 'loaded':
      return 'Loaded'
    case 'stale':
      return 'Stale'
    case 'failed':
      return 'Failed'
    case 'running':
      return 'Running'
    case 'missing':
      return 'Missing mark'
    case 'unmapped':
      return 'Unmapped'
    case 'inactive':
      return 'Inactive'
    default:
      return 'Unknown'
  }
}

function matchesAdminTradeFilter(trade: Trade, query: string): boolean {
  return matchesTextFilter(query, [
    trade.trade_id,
    trade.book,
    trade.commodity_class,
    trade.commodity,
    trade.price,
    trade.status,
    trade.updated_at,
  ])
}

function matchesAdminEventFilter(event: EventRow, query: string): boolean {
  return matchesTextFilter(query, [
    event.aggregate_id,
    event.event_id,
    event.event_type,
    event.occurred_at,
    event.recorded_at,
    event.schema_version,
  ])
}

function matchesAdminPositionFilter(position: PositionRow, query: string): boolean {
  return matchesTextFilter(query, [
    position.commodity,
    position.net_volume,
    position.updated_at,
  ])
}

function matchesReferenceFilter(record: ReferenceRecord, query: string): boolean {
  return matchesTextFilter(query, [record.code, record.is_active])
}

function matchesExternalDataRunFilter(run: ExternalDataRunRecord, query: string): boolean {
  return matchesTextFilter(query, [
    run.id,
    run.provider,
    run.job_name,
    run.status,
    run.started_at,
    run.finished_at,
    run.requested_by,
    run.series_count,
    run.observation_count,
    run.error_summary,
  ])
}

function matchesExternalDataProviderFilter(provider: ExternalDataProviderStatusRecord, query: string): boolean {
  return matchesTextFilter(query, [
    provider.provider,
    provider.label,
    provider.category,
    provider.ingestion_method,
    provider.ingestion_mode,
    provider.source_system,
    provider.source_endpoint,
    provider.sync_job_name,
    provider.default_lookback_days,
    provider.health_status,
    provider.latest_run_status,
    provider.latest_observation_at,
    provider.last_success_at,
    provider.error_summary,
    provider.latest_run?.id,
    provider.latest_run?.status,
  ])
}

function matchesPriceSourceReviewFilter(source: PriceSourceReviewRecord, query: string): boolean {
  return matchesTextFilter(query, [
    source.price_index_code,
    source.price_index_name,
    source.commodity_code,
    source.quote_type,
    source.market,
    source.location_code,
    source.price_unit_code,
    source.price_currency_code,
    source.provider,
    source.dataset_code,
    source.series_id,
    source.frequency,
    source.source_unit,
    source.source_currency_code,
    source.transform_rule,
    source.ingestion_method,
    source.ingestion_mode,
    source.source_system,
    source.source_endpoint,
    source.sync_job_name,
    source.default_lookback_days,
    source.review_status,
    source.provider_health_status,
    source.scheduler_interval_minutes,
    source.success_sla_hours,
    source.due_for_sync,
    source.provider_latest_observation_at,
    source.provider_observation_age_hours,
    source.latest_run_status,
    source.latest_run_id,
    source.last_success_at,
    source.provider_error_summary,
    source.latest_observation_date,
    source.latest_value,
    source.latest_source_revision,
    source.latest_source_published_at,
    source.latest_downloaded_at,
  ])
}

function matchesTradingSourceFilter(source: TradingSourceRecord, query: string): boolean {
  return matchesTextFilter(query, [
    source.source_id,
    source.source_name,
    source.source_category,
    source.business_owner,
    source.system_owner,
    source.criticality,
    source.status,
    source.update_frequency,
    source.last_reviewed_at,
  ])
}

function matchesWeatherLocationFilter(location: WeatherLocationRecord, query: string): boolean {
  return matchesTextFilter(query, [
    location.code,
    location.name,
    location.reference_location_code,
    location.timezone,
    location.source_provider,
    location.cwa,
    location.grid_id,
    location.station_id,
    location.description,
    location.is_active,
  ])
}

function matchesCounterpartyCreditPreviewRowFilter(row: CounterpartyCreditPreviewRow, query: string): boolean {
  return matchesTextFilter(query, [
    row.row_number,
    row.source_entity_id,
    row.source_entity_name,
    row.matched_counterparty_code,
    row.matched_counterparty_name,
    row.match_status,
    row.match_basis,
    row.matched_identifier_value,
    row.rating_scale,
    row.rating_value,
    row.rating_outlook,
    row.credit_score,
    row.probability_of_default,
    row.recommended_limit_currency_code,
    row.recommended_limit_amount,
    row.commentary,
    row.ready_to_import,
    row.snapshot?.counterparty_code,
    row.snapshot?.source_entity_name,
    row.snapshot?.as_of_date,
    ...row.issues.flatMap((issue) => [issue.severity, issue.code, issue.message]),
  ])
}

function matchesAdminDomainFilter(domain: (typeof ADMIN_DOMAIN_MAP)[number], query: string): boolean {
  return matchesTextFilter(query, [domain.label, domain.summary, ...domain.entities])
}

function matchesSchemaEntityFilter(entity: (typeof SCHEMA_ENTITIES)[number], query: string): boolean {
  return matchesTextFilter(query, [
    entity.label,
    entity.status,
    entity.purpose,
    ...entity.fields,
    ...entity.relationships,
    ...entity.consumers,
  ])
}

function matchesLifecycleStepFilter(
  step: { title: string; detail: string; meta: string[] },
  query: string,
): boolean {
  return matchesTextFilter(query, [step.title, step.detail, ...step.meta])
}

export function AdminWorkspace({
  authSession,
  globalFilter,
  onOpenSettings,
  onRoadmapPublished,
  selectedTrade,
  selectedTradeEvents,
  events,
  trades,
  positions,
  activeBooks,
  activeCommodities,
  priceIndices,
  externalDataRuns,
  externalDataSyncStatus,
  externalDataPriceSources,
  tradingSources,
  weatherLocations,
  weatherSyncStatus,
  externalDataSyncing,
  externalDataSyncingProvider,
  externalDataError,
  externalDataSuccess,
  counterpartyCreditImportDraft,
  counterpartyCreditPreview,
  counterpartyCreditPreviewing,
  counterpartyCreditPreviewError,
  counterpartyCreditPreviewSuccess,
  counterpartyCreditImporting,
  counterpartyCreditImportError,
  counterpartyCreditImportSuccess,
  tradingSourcesSyncing,
  tradingSourcesError,
  tradingSourcesSuccess,
  weatherSyncing,
  weatherSyncError,
  weatherSyncSuccess,
  weatherLocationMutationError,
  weatherLocationMutationPendingCode,
  weatherLocationMutationSuccess,
  onRunExternalDataSync,
  onCounterpartyCreditImportDraftChange,
  onPreviewCounterpartyCreditImport,
  onImportCounterpartyCreditSnapshots,
  onCreateWeatherLocation,
  onUpdateWeatherLocation,
  onDeactivateWeatherLocation,
  onReactivateWeatherLocation,
  onRunNwsWeatherSync,
  onSeedTradingSources,
  onRefreshData,
  formatDate,
  formatMoney,
  formatNumber,
  formatCommodityClass,
}: AdminWorkspaceProps) {
  const [assistantSupervisionIntent, setAssistantSupervisionIntent] =
    useState<AssistantControlTowerSupervisionIntent | null>(null)
  const [selectedSchemaEntity, setSelectedSchemaEntity] = useState<SchemaEntityKey>('events')
  const [selectedPriceSourceId, setSelectedPriceSourceId] = useState<number | null>(
    readSelectedPriceSourceIdFromLocation,
  )
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSectionKey>(readInitialAdminSection)
  const [screenFilter, setScreenFilter] = useState('')
  const effectiveScreenFilter = combineTextFilters(globalFilter, screenFilter)
  const hasScreenFilter = effectiveScreenFilter.trim().length > 0

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash
      setSelectedPriceSourceId(readSelectedPriceSourceIdFromLocation())
      const hashSection = readAdminSectionFromHash(hash)
      if (hashSection) {
        setActiveAdminSection(hashSection)
      }
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (selectedPriceSourceId === null || activeAdminSection !== 'external-data') {
      return
    }

    const anchorId = adminPriceSourceDetailAnchorId(selectedPriceSourceId)
    window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: 'start' })
    })
  }, [activeAdminSection, selectedPriceSourceId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const anchorId = window.location.hash.replace(/^#/, '').trim()
    if (!anchorId) {
      return
    }

    window.requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: 'start' })
    })
  }, [activeAdminSection])

  const visibleEvents = useMemo(
    () => events.filter((event) => matchesAdminEventFilter(event, effectiveScreenFilter)),
    [effectiveScreenFilter, events],
  )
  const visibleTrades = useMemo(
    () => trades.filter((trade) => matchesAdminTradeFilter(trade, effectiveScreenFilter)),
    [effectiveScreenFilter, trades],
  )
  const visiblePositions = useMemo(
    () => positions.filter((position) => matchesAdminPositionFilter(position, effectiveScreenFilter)),
    [effectiveScreenFilter, positions],
  )
  const visibleActiveBooks = useMemo(
    () => activeBooks.filter((record) => matchesReferenceFilter(record, effectiveScreenFilter)),
    [activeBooks, effectiveScreenFilter],
  )
  const visibleActiveCommodities = useMemo(
    () => activeCommodities.filter((record) => matchesReferenceFilter(record, effectiveScreenFilter)),
    [activeCommodities, effectiveScreenFilter],
  )
  const visiblePriceIndices = useMemo(
    () => priceIndices.filter((record) => matchesReferenceFilter(record, effectiveScreenFilter)),
    [effectiveScreenFilter, priceIndices],
  )
  const visibleExternalDataRuns = useMemo(
    () => externalDataRuns.filter((run) => matchesExternalDataRunFilter(run, effectiveScreenFilter)),
    [effectiveScreenFilter, externalDataRuns],
  )
  const visibleExternalDataPriceSources = useMemo(
    () =>
      externalDataPriceSources.filter((source) =>
        matchesPriceSourceReviewFilter(source, effectiveScreenFilter),
      ),
    [effectiveScreenFilter, externalDataPriceSources],
  )
  const selectedPriceSource = useMemo(
    () => externalDataPriceSources.find((source) => source.id === selectedPriceSourceId) ?? null,
    [externalDataPriceSources, selectedPriceSourceId],
  )
  const visibleTradingSources = useMemo(
    () => tradingSources.filter((source) => matchesTradingSourceFilter(source, effectiveScreenFilter)),
    [effectiveScreenFilter, tradingSources],
  )
  const visibleWeatherLocations = useMemo(
    () => weatherLocations.filter((location) => matchesWeatherLocationFilter(location, effectiveScreenFilter)),
    [effectiveScreenFilter, weatherLocations],
  )
  const visibleCounterpartyCreditPreviewRows = useMemo(
    () =>
      counterpartyCreditPreview?.rows.filter((row) =>
        matchesCounterpartyCreditPreviewRowFilter(row, effectiveScreenFilter),
      ) ?? [],
    [counterpartyCreditPreview, effectiveScreenFilter],
  )
  const visibleAdminDomains = useMemo(
    () => ADMIN_DOMAIN_MAP.filter((domain) => matchesAdminDomainFilter(domain, effectiveScreenFilter)),
    [effectiveScreenFilter],
  )
  const visibleSchemaEntities = useMemo(
    () => SCHEMA_ENTITIES.filter((entity) => matchesSchemaEntityFilter(entity, effectiveScreenFilter)),
    [effectiveScreenFilter],
  )

  const latestEventSource = hasScreenFilter ? visibleEvents : events
  const latestTradeProjectionSource = hasScreenFilter ? visibleTrades : trades
  const latestPositionProjectionSource = hasScreenFilter ? visiblePositions : positions

  const latestEvent = useMemo(
    () =>
      [...latestEventSource].sort(
        (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
      )[0] ?? null,
    [latestEventSource],
  )

  const latestTradeProjectionUpdate = useMemo(
    () =>
      [...latestTradeProjectionSource].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )[0] ?? null,
    [latestTradeProjectionSource],
  )

  const latestPositionProjectionUpdate = useMemo(
    () =>
      [...latestPositionProjectionSource].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )[0] ?? null,
    [latestPositionProjectionSource],
  )

  const projectionFreshnessLabel = useMemo(() => {
    if (!latestEvent || !latestTradeProjectionUpdate || !latestPositionProjectionUpdate) {
      return 'Awaiting flow'
    }

    const latestSource = new Date(latestEvent.recorded_at).getTime()
    const latestProjection = Math.min(
      new Date(latestTradeProjectionUpdate.updated_at).getTime(),
      new Date(latestPositionProjectionUpdate.updated_at).getTime(),
    )

    if (Number.isNaN(latestSource) || Number.isNaN(latestProjection)) {
      return 'Unknown'
    }

    const lagMinutes = Math.abs(latestSource - latestProjection) / 60000
    if (lagMinutes <= 15) {
      return 'Fresh'
    }
    if (lagMinutes <= 120) {
      return 'Monitoring'
    }
    return 'Lagging'
  }, [latestEvent, latestPositionProjectionUpdate, latestTradeProjectionUpdate])

  const selectedTradePositions = useMemo(
    () => positions.filter((position) => position.commodity === selectedTrade?.commodity),
    [positions, selectedTrade?.commodity],
  )

  const lifecycleSteps = useMemo(() => {
    const latestTradeEvent = selectedTradeEvents[0] ?? null
    const relatedPosition = selectedTradePositions[0] ?? null

    return [
      {
        key: 'ui-action',
        title: 'Operator action',
        detail: selectedTrade
          ? `${tradeStatusIsActive(selectedTrade.status) ? 'Capture, amend, or close' : 'Review'} ${selectedTrade.trade_id} in the workspace`
          : 'Select or create a trade to inspect the flow',
        meta: selectedTrade
          ? [`Book ${selectedTrade.book}`, formatCommodityClass(selectedTrade.commodity_class), selectedTrade.commodity]
          : ['No trade selected'],
      },
      {
        key: 'event-store',
        title: 'Event stored',
        detail: latestTradeEvent
          ? `${latestTradeEvent.event_type} recorded against trade ${latestTradeEvent.aggregate_id}`
          : 'No trade event loaded for the current selection',
        meta: latestTradeEvent
          ? [`Occurred ${formatDate(latestTradeEvent.occurred_at)}`, `Schema v${latestTradeEvent.schema_version}`]
          : ['Waiting for event data'],
      },
      {
        key: 'trade-projection',
        title: 'Trade projection updated',
        detail: selectedTrade
          ? `Trade read model now reflects ${selectedTrade.status.toLowerCase()} state`
          : 'Trade projection is ready once a selection exists',
        meta: selectedTrade
          ? [`Updated ${formatDate(selectedTrade.updated_at)}`, `Price ${formatMoney(selectedTrade.price)}`]
          : ['Projection not targeted'],
      },
      {
        key: 'positions-projection',
        title: 'Positions projection updated',
        detail: relatedPosition
          ? `${relatedPosition.commodity} net exposure recalculated`
          : 'No matching commodity position found for the selected trade',
        meta: relatedPosition
          ? [`Net ${formatNumber(relatedPosition.net_volume, 0)}`, `Updated ${formatDate(relatedPosition.updated_at)}`]
          : ['Awaiting exposure impact'],
      },
      {
        key: 'read-surfaces',
        title: 'Operator views refreshed',
        detail: 'Dashboard, Trades, Positions, and Admin now read from updated projections.',
        meta: [
          `${selectedTradeEvents.length} trade event${selectedTradeEvents.length === 1 ? '' : 's'}`,
          `${events.length} event${events.length === 1 ? '' : 's'} visible in current session`,
        ],
      },
    ]
  }, [
    events.length,
    formatCommodityClass,
    formatDate,
    formatMoney,
    formatNumber,
    selectedTrade,
    selectedTradeEvents,
    selectedTradePositions,
  ])
  const visibleLifecycleSteps = useMemo(
    () => lifecycleSteps.filter((step) => matchesLifecycleStepFilter(step, effectiveScreenFilter)),
    [effectiveScreenFilter, lifecycleSteps],
  )
  const effectiveSelectedSchemaEntity =
    visibleSchemaEntities.some((entity) => entity.key === selectedSchemaEntity)
      ? selectedSchemaEntity
      : visibleSchemaEntities[0]?.key ?? selectedSchemaEntity

  const selectedSchemaDetail = useMemo(
    () => visibleSchemaEntities.find((entity) => entity.key === effectiveSelectedSchemaEntity) ?? null,
    [effectiveSelectedSchemaEntity, visibleSchemaEntities],
  )

  const adminSummaryCards = useMemo(
    () => [
      {
        label: 'Events Recorded',
        value: `${hasScreenFilter ? visibleEvents.length : events.length}`,
        note: latestEvent ? `Latest ${formatDate(latestEvent.recorded_at)}` : 'No events loaded yet',
        tooltip: 'Count of event rows currently loaded into the admin workspace session.',
      },
      {
        label: 'Projection State',
        value: projectionFreshnessLabel,
        note: latestTradeProjectionUpdate ? `Trades updated ${formatDate(latestTradeProjectionUpdate.updated_at)}` : 'No trade projection yet',
        tooltip: 'Compares loaded event timing with trade and position projection timestamps.',
        valueTooltip: projectionFreshnessTooltip(projectionFreshnessLabel),
      },
      {
        label: 'Reference Records',
        value: `${visibleActiveBooks.length + visibleActiveCommodities.length + visiblePriceIndices.filter((row) => row.is_active).length}`,
        note: `${visibleActiveBooks.length} books, ${visibleActiveCommodities.length} commodities, ${visiblePriceIndices.filter((row) => row.is_active).length} price indices`,
        tooltip: 'Total active master-data records currently supporting trading and pricing workflows.',
      },
    ],
    [
      events.length,
      formatDate,
      hasScreenFilter,
      latestEvent,
      latestTradeProjectionUpdate,
      projectionFreshnessLabel,
      visibleActiveBooks.length,
      visibleActiveCommodities.length,
      visibleEvents.length,
      visiblePriceIndices,
    ],
  )

  const marketDataProviders = useMemo(
    () =>
      (externalDataSyncStatus?.providers ?? []).filter((provider) =>
        matchesExternalDataProviderFilter(provider, effectiveScreenFilter),
      ),
    [effectiveScreenFilter, externalDataSyncStatus],
  )
  const marketDataProviderCodes = useMemo(
    () => new Set(marketDataProviders.map((provider) => provider.provider)),
    [marketDataProviders],
  )
  const allMarketDataProviderCodes = useMemo(
    () => new Set((externalDataSyncStatus?.providers ?? []).map((provider) => provider.provider)),
    [externalDataSyncStatus],
  )
  const marketDataRuns = useMemo(
    () =>
      externalDataRuns.filter(
        (run) =>
          allMarketDataProviderCodes.has(run.provider) &&
          (marketDataProviderCodes.has(run.provider) || matchesExternalDataRunFilter(run, effectiveScreenFilter)),
      ),
    [allMarketDataProviderCodes, effectiveScreenFilter, externalDataRuns, marketDataProviderCodes],
  )
  const latestMarketDataRun = useMemo(() => marketDataRuns[0] ?? null, [marketDataRuns])
  const latestFreshMarketDataProvider = useMemo(() => {
    const healthyProviders = marketDataProviders.filter((provider) => provider.latest_observation_at)
    return (
      [...healthyProviders].sort((left, right) => {
        const leftTime = new Date(left.latest_observation_at ?? '').getTime()
        const rightTime = new Date(right.latest_observation_at ?? '').getTime()
        return rightTime - leftTime
      })[0] ?? null
    )
  }, [marketDataProviders])
  const marketDataPowerProviders = useMemo(
    () => marketDataProviders.filter((provider) => provider.category === 'power'),
    [marketDataProviders],
  )
  const marketDataAttentionCount = marketDataProviders.filter((provider) =>
    ['failed', 'stale', 'missing', 'degraded'].includes(provider.health_status),
  ).length
  const priceSourceAttentionCount = visibleExternalDataPriceSources.filter((source) =>
    ['failed', 'stale', 'missing', 'unmapped'].includes(source.review_status),
  ).length
  const priceSourceProviderCount = useMemo(
    () => new Set(visibleExternalDataPriceSources.map((source) => source.provider)).size,
    [visibleExternalDataPriceSources],
  )
  const latestMarkedPriceSource = useMemo(
    () =>
      visibleExternalDataPriceSources
        .filter((source) => source.latest_downloaded_at)
        .sort((left, right) => {
          const leftTime = new Date(left.latest_downloaded_at ?? '').getTime()
          const rightTime = new Date(right.latest_downloaded_at ?? '').getTime()
          return rightTime - leftTime
        })[0] ?? null,
    [visibleExternalDataPriceSources],
  )
  const counterpartyCreditImportRuns = useMemo(
    () => visibleExternalDataRuns.filter((run) => run.job_name === 'import_counterparty_credit_snapshots'),
    [visibleExternalDataRuns],
  )
  const latestCounterpartyCreditImportRun = useMemo(
    () => counterpartyCreditImportRuns[0] ?? null,
    [counterpartyCreditImportRuns],
  )
  const readyCounterpartyCreditPreviewRows = useMemo(
    () => visibleCounterpartyCreditPreviewRows.filter((row) => row.ready_to_import),
    [visibleCounterpartyCreditPreviewRows],
  )
  const previewBlockedRowCount = visibleCounterpartyCreditPreviewRows.filter(
    (row) => row.issues.some((issue) => issue.severity === 'error'),
  ).length
  const previewWarningRowCount = visibleCounterpartyCreditPreviewRows.filter(
    (row) => row.issues.some((issue) => issue.severity !== 'error'),
  ).length
  const previewMatchedRowCount = visibleCounterpartyCreditPreviewRows.filter(
    (row) => Boolean(row.matched_counterparty_code),
  ).length

  const tradingSourcesByCriticality = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of visibleTradingSources) {
      counts.set(row.criticality, (counts.get(row.criticality) ?? 0) + 1)
    }
    return ['tier_0', 'tier_1', 'tier_2', 'tier_3']
      .map((key) => ({ key, count: counts.get(key) ?? 0 }))
      .filter((row) => row.count > 0)
  }, [visibleTradingSources])
  const selectedTradeHiddenByFilter =
    hasScreenFilter && selectedTrade !== null && !matchesAdminTradeFilter(selectedTrade, effectiveScreenFilter)
  const weatherAttentionCount = weatherSyncStatus
    ? weatherSyncStatus.stale_location_count +
      weatherSyncStatus.missing_location_count +
      (weatherSyncStatus.health_status === 'failed' ? 1 : 0)
    : 0
  const totalExternalAttentionCount = marketDataAttentionCount + priceSourceAttentionCount + weatherAttentionCount
  const activeAdminSectionMeta =
    ADMIN_SECTIONS.find((section) => section.key === activeAdminSection) ?? ADMIN_SECTIONS[0]
  const adminOverviewCards = [
    {
      key: 'external-data' as const,
      eyebrow: 'External Data',
      title:
        totalExternalAttentionCount > 0
          ? `${totalExternalAttentionCount} item${totalExternalAttentionCount === 1 ? '' : 's'} need attention`
          : 'Feeds look stable',
      detail: `${marketDataAttentionCount} provider issue${marketDataAttentionCount === 1 ? '' : 's'} · ${priceSourceAttentionCount} price source issue${priceSourceAttentionCount === 1 ? '' : 's'} · ${weatherAttentionCount} weather issue${weatherAttentionCount === 1 ? '' : 's'}`,
      actionLabel: 'Open External Data',
    },
    {
      key: 'assistant-governance' as const,
      eyebrow: 'Assistant',
      title: 'Governance lanes',
      detail: 'Review agent posture, pending approvals, outcome metrics, and profile changes without mixing them into data operations.',
      actionLabel: 'Open Assistant Governance',
    },
    {
      key: 'automation' as const,
      eyebrow: 'Automation',
      title: projectionFreshnessLabel,
      detail: latestTradeProjectionUpdate
        ? `Projection monitoring, scheduled jobs, and Codex dispatch. Latest trade projection ${formatDate(latestTradeProjectionUpdate.updated_at)}.`
        : 'Projection monitoring, scheduled jobs, and Codex dispatch.',
      actionLabel: 'Open Automation',
    },
    {
      key: 'access-planning' as const,
      eyebrow: 'Access',
      title: authSession ? `${authSession.user.role} signed in` : 'No admin session',
      detail: 'Manage users, roadmap metadata, shared Home inventory, and longer-lived governance setup.',
      actionLabel: 'Open Access & Planning',
    },
    {
      key: 'explainability' as const,
      eyebrow: 'Explainability',
      title: `${events.length} event${events.length === 1 ? '' : 's'} loaded`,
      detail: 'Trace domains, schema, selected trade lifecycle, and live provenance separately from operational controls.',
      actionLabel: 'Open Explainability',
    },
  ]

  return (
    <div className="stack">
      <section className="surface feature-panel admin-command-center">
        <div className="section-head">
          <div>
            <span className="eyebrow">Admin Console</span>
            <h3>{activeAdminSectionMeta.label}</h3>
          </div>
          <p>{activeAdminSectionMeta.description}</p>
        </div>

        <div className="admin-section-tabs" role="tablist" aria-label="Admin console sections">
          {ADMIN_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`admin-section-tab${activeAdminSection === section.key ? ' is-active' : ''}`}
              aria-pressed={activeAdminSection === section.key}
              onClick={() => setActiveAdminSection(section.key)}
            >
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </button>
          ))}
        </div>
      </section>

      {activeAdminSection === 'overview' ? (
        <section className="surface feature-panel admin-overview-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Command Center</span>
              <h3>What Needs Attention</h3>
            </div>
            <p>Start with posture and the next best place to inspect, instead of every privileged control at once.</p>
          </div>

          <div className="admin-summary-grid">
            {adminSummaryCards.map((card) => (
              <article key={card.label} className="admin-summary-card">
                <span>
                  <InlineTooltipLabel tooltip={card.tooltip} tooltipLabel={`More information about ${card.label}`} align="start">
                    {card.label}
                  </InlineTooltipLabel>
                </span>
                {card.valueTooltip ? (
                  <Tooltip content={card.valueTooltip} focusable>
                    <strong className="tooltip-trigger-hint">{card.value}</strong>
                  </Tooltip>
                ) : (
                  <strong>{card.value}</strong>
                )}
                <p>{card.note}</p>
              </article>
            ))}
          </div>

          <div className="admin-overview-grid">
            <SystemStatusPanel variant="compact" />
            <div className="admin-overview-action-grid">
              {adminOverviewCards.map((card) => (
                <article key={card.key} className="admin-overview-action-card">
                  <span className="eyebrow">{card.eyebrow}</span>
                  <strong>{card.title}</strong>
                  <p>{card.detail}</p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setActiveAdminSection(card.key)}
                  >
                    {card.actionLabel}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeAdminSection === 'external-data' || activeAdminSection === 'explainability' ? (
        <WorkspaceLocalFilterBar
          value={screenFilter}
          onChange={setScreenFilter}
          placeholder="Trade, event, provider, weather location, D&B preview row, source register, or schema concept"
          description="Keep admin filtering local to this screen so you can narrow the active Admin section without changing the rest of the app."
          totalCount={
            events.length +
            trades.length +
            positions.length +
            activeBooks.length +
            activeCommodities.length +
            priceIndices.length +
            externalDataRuns.length +
            externalDataPriceSources.length +
            tradingSources.length +
            weatherLocations.length +
            (counterpartyCreditPreview?.rows.length ?? 0)
          }
          matchedCount={
            visibleEvents.length +
            visibleTrades.length +
            visiblePositions.length +
            visibleActiveBooks.length +
            visibleActiveCommodities.length +
            visiblePriceIndices.length +
            visibleExternalDataRuns.length +
            visibleExternalDataPriceSources.length +
            visibleTradingSources.length +
            visibleWeatherLocations.length +
            visibleCounterpartyCreditPreviewRows.length
          }
          resultLabel="admin records"
          globalValue={globalFilter}
          note={
            selectedTradeHiddenByFilter
              ? `The selected trade trace stays synced to ${selectedTrade?.trade_id}, even though it falls outside the current admin filters. Dedicated admin sub-panels keep their own controls.`
              : 'Dedicated admin sub-panels keep their own controls.'
          }
        />
      ) : null}

      {activeAdminSection === 'external-data' ? (
      <section className="surface feature-panel admin-hero-surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">Operations</span>
            <h3>External Data Operations</h3>
          </div>
          <p>Run and supervise external feeds, source freshness, weather coverage, credit imports, and source-register seeding from one lane.</p>
        </div>

        <WeatherOperationsPanel
          authSession={authSession}
          weatherLocations={visibleWeatherLocations}
          weatherSyncStatus={weatherSyncStatus}
          weatherSyncing={weatherSyncing}
          weatherSyncError={weatherSyncError}
          weatherSyncSuccess={weatherSyncSuccess}
          weatherLocationMutationError={weatherLocationMutationError}
          weatherLocationMutationPendingCode={weatherLocationMutationPendingCode}
          weatherLocationMutationSuccess={weatherLocationMutationSuccess}
          onRunNwsWeatherSync={onRunNwsWeatherSync}
          onCreateWeatherLocation={onCreateWeatherLocation}
          onUpdateWeatherLocation={onUpdateWeatherLocation}
          onDeactivateWeatherLocation={onDeactivateWeatherLocation}
          onReactivateWeatherLocation={onReactivateWeatherLocation}
          formatDate={formatDate}
        />

        <div className="admin-sync-panel">
          <div className="admin-sync-head">
            <div>
              <span className="eyebrow">External Data</span>
              <h3>Market Data Health</h3>
            </div>
            <div className="admin-sync-head-actions">
              {externalDataSyncStatus ? (
                <span className={`status-pill status-pill-${weatherHealthTone(externalDataSyncStatus.health_status)}`}>
                  {weatherHealthLabel(externalDataSyncStatus.health_status)}
                </span>
              ) : null}
              <button type="button" className="button button-secondary" onClick={() => void onRefreshData()}>
                Refresh
              </button>
            </div>
          </div>
          <p>Watch price, macro, positioning, and power feeds together, then trigger a targeted provider sync when freshness starts to drift.</p>

          <div className="admin-sync-status-grid">
            <article className="admin-card">
              <AdminCardTitle
                label="Coverage"
                tooltip="How many tracked market-data providers are currently healthy versus stale, failed, or still uninitialized."
              />
              <p>
                {externalDataSyncStatus
                  ? `${marketDataProviders.filter((provider) => provider.health_status === 'healthy').length} of ${marketDataProviders.length} providers are healthy.`
                  : 'Market-data sync status has not been loaded yet.'}
              </p>
              <span>
                {externalDataSyncStatus
                  ? `${marketDataProviders.filter((provider) => provider.health_status === 'failed').length} failed · ${marketDataProviders.filter((provider) => provider.health_status === 'stale').length} stale · ${marketDataProviders.filter((provider) => provider.health_status === 'missing').length} missing`
                  : 'Awaiting first status snapshot'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Power Footprint"
                tooltip="How many power providers are currently tracked inside the market-data freshness surface."
              />
              <p>
                {marketDataPowerProviders.length > 0
                  ? `${marketDataPowerProviders.length} power providers are wired into the live sync registry.`
                  : 'No power providers are registered yet.'}
              </p>
              <span>
                {marketDataPowerProviders.length > 0
                  ? marketDataPowerProviders.map((provider) => provider.provider).join(' · ')
                  : 'Seed a power provider to activate this surface'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Attention Queue"
                tooltip="Providers needing operator attention because they are stale, failed, or still missing a first successful load."
              />
              <p>
                {externalDataSyncStatus
                  ? `${marketDataAttentionCount} providers currently need attention.`
                  : 'Provider attention status is not available yet.'}
              </p>
              <span>
                {externalDataSyncStatus
                  ? `${marketDataProviders.filter((provider) => provider.health_status === 'running').length} running · ${marketDataProviders.filter((provider) => provider.due_for_sync).length} due for sync`
                  : 'No scheduler state loaded'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Price Sources"
                tooltip="Reviewable source-to-price-index mappings loaded from the governed price source catalog."
              />
              <p>
                {visibleExternalDataPriceSources.length > 0
                  ? `${visibleExternalDataPriceSources.length} price sources across ${priceSourceProviderCount} providers.`
                  : 'No price sources are currently in view.'}
              </p>
              <span>
                {visibleExternalDataPriceSources.length > 0
                  ? `${priceSourceAttentionCount} need attention`
                  : 'Load or seed price-index sources to populate the catalog'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Latest Healthy Data"
                tooltip="Newest successfully ingested market-data observation currently available across the tracked providers."
              />
              <p>
                {latestFreshMarketDataProvider?.latest_observation_at
                  ? `${latestFreshMarketDataProvider.label} last landed ${formatDate(latestFreshMarketDataProvider.latest_observation_at)}.`
                  : 'No provider has published a stored observation yet.'}
              </p>
              <span>
                {latestMarketDataRun
                  ? `Latest run #${latestMarketDataRun.id} ${latestMarketDataRun.provider} ${latestMarketDataRun.status.toLowerCase()}`
                  : 'Awaiting first sync'}
              </span>
            </article>
          </div>

          {externalDataError ? <div className="feedback-banner feedback-banner-error">{externalDataError}</div> : null}
          {externalDataSuccess ? <div className="feedback-banner feedback-banner-success">{externalDataSuccess}</div> : null}

          <div className="admin-run-list">
            {marketDataProviders.length === 0 ? (
              <div className="detail-row">
                <span>{hasScreenFilter ? 'No market-data providers match the current local filter.' : 'No market-data provider status is loaded yet.'}</span>
              </div>
            ) : (
              marketDataProviders.map((provider: ExternalDataProviderStatusRecord) => (
                <article key={provider.provider} className="admin-run-row admin-weather-row">
                  <div>
                    <strong>{provider.label}</strong>
                    <p>
                      {provider.provider} · {marketDataCategoryLabel(provider.category)} · {provider.ingestion_method}
                    </p>
                    <div className="admin-weather-row-detail">
                      <span>{provider.active_series_count} active series</span>
                      <span>{provider.ingestion_mode}</span>
                      <span>Job {provider.sync_job_name}</span>
                      <span>Endpoint {sourceEndpointLabel(provider.source_endpoint)}</span>
                      <span>{provider.latest_observation_at ? `Latest data ${formatDate(provider.latest_observation_at)}` : 'No stored observation yet'}</span>
                      <span>{provider.observation_age_hours != null ? formatAgeHours(provider.observation_age_hours) : 'Freshness unknown'}</span>
                      <span>{provider.due_for_sync ? 'Due for sync' : `Cadence ${cadenceLabel(provider.scheduler_interval_minutes)}`}</span>
                      <span>{successSlaLabel(provider.success_sla_hours)}</span>
                      <span>{lookbackLabel(provider.default_lookback_days)}</span>
                    </div>
                    {provider.error_summary ? <p>{provider.error_summary}</p> : null}
                  </div>
                  <div className="admin-run-meta">
                    <span className={`status-pill status-pill-${weatherHealthTone(provider.health_status)}`}>
                      {weatherHealthLabel(provider.health_status)}
                    </span>
                    <span>{provider.last_success_at ? `Last success ${formatDate(provider.last_success_at)}` : 'No successful run yet'}</span>
                    <span>{provider.latest_run ? `Run #${provider.latest_run.id} ${provider.latest_run.status}` : 'No run history yet'}</span>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void onRunExternalDataSync(provider.provider as ExternalDataSyncProvider)}
                      disabled={externalDataSyncing}
                    >
                      {externalDataSyncingProvider === provider.provider ? 'Running Sync...' : `Run ${provider.provider}`}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {selectedPriceSourceId !== null ? (
            <section
              id={adminPriceSourceDetailAnchorId(selectedPriceSourceId)}
              className="admin-price-source-view"
              aria-labelledby="admin-price-source-view-title"
            >
              {selectedPriceSource ? (
                <>
                  <div className="admin-price-source-view-head">
                    <div>
                      <span className="eyebrow">Price Source View</span>
                      <h4 id="admin-price-source-view-title">{selectedPriceSource.price_index_code}</h4>
                      <p>
                        {selectedPriceSource.price_index_name ?? 'Unmapped price index'} · {selectedPriceSource.source_system ?? selectedPriceSource.provider} · {selectedPriceSource.series_id}
                      </p>
                    </div>
                    <div className="admin-sync-head-actions">
                      <span className={`status-pill status-pill-${priceSourceReviewTone(selectedPriceSource.review_status)}`}>
                        {priceSourceReviewLabel(selectedPriceSource.review_status)}
                      </span>
                      <a
                        className="button button-secondary"
                        href={`#${ADMIN_PRICE_SOURCES_SECTION_ID}`}
                        onClick={() => setSelectedPriceSourceId(null)}
                      >
                        Back to inventory
                      </a>
                    </div>
                  </div>

                  <div className="admin-price-source-summary-grid">
                    <article className="admin-price-source-fact">
                      <span>Latest mark</span>
                      <strong>
                        {selectedPriceSource.latest_value != null
                          ? `${formatNumber(selectedPriceSource.latest_value, 3)} ${selectedPriceSource.latest_unit_code ?? selectedPriceSource.source_unit}${selectedPriceSource.latest_currency_code ? ` ${selectedPriceSource.latest_currency_code}` : ''}`
                          : 'No observation'}
                      </strong>
                      <p>
                        {selectedPriceSource.latest_observation_date
                          ? `Observed ${formatDateOnly(selectedPriceSource.latest_observation_date)}`
                          : 'No observation has landed for this mapping yet'}
                      </p>
                    </article>
                    <article className="admin-price-source-fact">
                      <span>Pull cadence</span>
                      <strong>
                        {selectedPriceSource.scheduler_interval_minutes != null
                          ? cadenceLabel(selectedPriceSource.scheduler_interval_minutes)
                          : selectedPriceSource.frequency.toUpperCase()}
                      </strong>
                      <p>
                        {selectedPriceSource.due_for_sync
                          ? 'Provider is due for sync'
                          : selectedPriceSource.provider_observation_age_hours != null
                            ? formatAgeHours(selectedPriceSource.provider_observation_age_hours)
                            : 'Freshness unknown'}
                      </p>
                    </article>
                    <article className="admin-price-source-fact">
                      <span>Source status</span>
                      <strong>{weatherHealthLabel(selectedPriceSource.provider_health_status ?? 'unknown')}</strong>
                      <p>{selectedPriceSource.latest_run_status ?? 'No run history yet'}</p>
                    </article>
                    <article className="admin-price-source-fact">
                      <span>Transform</span>
                      <strong>{selectedPriceSource.transform_rule?.trim() ? 'Configured' : 'Raw value'}</strong>
                      <p>{selectedPriceSource.transform_rule?.trim() || 'Stored directly from provider payload'}</p>
                    </article>
                  </div>

                  <div className="admin-price-source-detail-grid">
                    <section className="admin-price-source-detail-section">
                      <h5>Mapping</h5>
                      <dl>
                        <div>
                          <dt>Provider</dt>
                          <dd>{selectedPriceSource.provider}</dd>
                        </div>
                        <div>
                          <dt>Dataset</dt>
                          <dd>{selectedPriceSource.dataset_code ?? 'Provider default'}</dd>
                        </div>
                        <div>
                          <dt>Series id</dt>
                          <dd>{selectedPriceSource.series_id}</dd>
                        </div>
                        <div>
                          <dt>Commodity</dt>
                          <dd>{selectedPriceSource.commodity_code ?? 'No commodity mapping'}</dd>
                        </div>
                        <div>
                          <dt>Market</dt>
                          <dd>{selectedPriceSource.market ?? 'No market'}</dd>
                        </div>
                        <div>
                          <dt>Location</dt>
                          <dd>{selectedPriceSource.location_code ?? 'No location'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="admin-price-source-detail-section">
                      <h5>Ingestion</h5>
                      <dl>
                        <div>
                          <dt>Method</dt>
                          <dd>{selectedPriceSource.ingestion_method ?? 'Provider pull'}</dd>
                        </div>
                        <div>
                          <dt>Trigger</dt>
                          <dd>{selectedPriceSource.ingestion_mode ?? 'Manual sync'}</dd>
                        </div>
                        <div>
                          <dt>Job</dt>
                          <dd>{selectedPriceSource.sync_job_name ?? 'No job configured'}</dd>
                        </div>
                        <div>
                          <dt>Lookback</dt>
                          <dd>{lookbackLabel(selectedPriceSource.default_lookback_days)}</dd>
                        </div>
                        <div>
                          <dt>Run SLA</dt>
                          <dd>{successSlaLabel(selectedPriceSource.success_sla_hours)}</dd>
                        </div>
                        <div>
                          <dt>Endpoint</dt>
                          <dd>
                            {selectedPriceSource.source_endpoint ? (
                              <a href={selectedPriceSource.source_endpoint} target="_blank" rel="noreferrer">
                                {sourceEndpointLabel(selectedPriceSource.source_endpoint)}
                              </a>
                            ) : (
                              'No source endpoint'
                            )}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="admin-price-source-detail-section">
                      <h5>Latest Observation</h5>
                      <dl>
                        <div>
                          <dt>Source frequency</dt>
                          <dd>{selectedPriceSource.frequency.toUpperCase()}</dd>
                        </div>
                        <div>
                          <dt>Source unit</dt>
                          <dd>{selectedPriceSource.source_unit}{selectedPriceSource.source_currency_code ? ` ${selectedPriceSource.source_currency_code}` : ''}</dd>
                        </div>
                        <div>
                          <dt>Published</dt>
                          <dd>{selectedPriceSource.latest_source_published_at ? formatDate(selectedPriceSource.latest_source_published_at) : 'Publication time unknown'}</dd>
                        </div>
                        <div>
                          <dt>Loaded</dt>
                          <dd>{selectedPriceSource.latest_downloaded_at ? formatDate(selectedPriceSource.latest_downloaded_at) : 'Never loaded'}</dd>
                        </div>
                        <div>
                          <dt>Revision</dt>
                          <dd>{selectedPriceSource.latest_source_revision ?? 'No revision marker'}</dd>
                        </div>
                        <div>
                          <dt>Run</dt>
                          <dd>{selectedPriceSource.latest_observation_run_id ? `Run #${selectedPriceSource.latest_observation_run_id}` : 'No observation run'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="admin-price-source-detail-section">
                      <h5>Review</h5>
                      <dl>
                        <div>
                          <dt>Price index active</dt>
                          <dd>{selectedPriceSource.price_index_is_active === false ? 'Inactive' : 'Active'}</dd>
                        </div>
                        <div>
                          <dt>Source active</dt>
                          <dd>{selectedPriceSource.is_active ? 'Active' : 'Inactive'}</dd>
                        </div>
                        <div>
                          <dt>Last success</dt>
                          <dd>{selectedPriceSource.last_success_at ? formatDate(selectedPriceSource.last_success_at) : 'No successful run yet'}</dd>
                        </div>
                        <div>
                          <dt>Provider latest</dt>
                          <dd>{selectedPriceSource.provider_latest_observation_at ? formatDate(selectedPriceSource.provider_latest_observation_at) : 'No provider observation yet'}</dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>{formatDate(selectedPriceSource.created_at)}</dd>
                        </div>
                        <div>
                          <dt>Updated</dt>
                          <dd>{formatDate(selectedPriceSource.updated_at)} · v{selectedPriceSource.version}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                </>
              ) : (
                <div className="admin-price-source-view-head">
                  <div>
                    <span className="eyebrow">Price Source View</span>
                    <h4 id="admin-price-source-view-title">Price source not loaded</h4>
                    <p>The link points to source #{selectedPriceSourceId}, but that row is not in the current loaded inventory window.</p>
                  </div>
                  <a
                    className="button button-secondary"
                    href={`#${ADMIN_PRICE_SOURCES_SECTION_ID}`}
                    onClick={() => setSelectedPriceSourceId(null)}
                  >
                    Back to inventory
                  </a>
                </div>
              )}
            </section>
          ) : null}

          <div id={ADMIN_PRICE_SOURCES_SECTION_ID} className="admin-run-list">
            <div className="detail-row">
              <span>
                Price source inventory · {visibleExternalDataPriceSources.length} source{visibleExternalDataPriceSources.length === 1 ? '' : 's'}
                {latestMarkedPriceSource?.latest_downloaded_at
                  ? ` · latest mark loaded ${formatDate(latestMarkedPriceSource.latest_downloaded_at)}`
                  : ''}
              </span>
            </div>
            {visibleExternalDataPriceSources.length === 0 ? (
              <div className="detail-row">
                <span>{hasScreenFilter ? 'No price sources match the current local filter.' : 'No price source catalog rows are loaded yet.'}</span>
              </div>
            ) : (
              visibleExternalDataPriceSources.slice(0, 40).map((source) => {
                const latestValue =
                  source.latest_value != null
                    ? `${formatNumber(source.latest_value, 3)} ${source.latest_unit_code ?? source.source_unit}${source.latest_currency_code ? ` ${source.latest_currency_code}` : ''}`
                    : 'No observation'
                const sourceUnit = `${source.source_unit}${source.source_currency_code ? ` ${source.source_currency_code}` : ''}`
                const sourceCadence =
                  source.scheduler_interval_minutes != null
                    ? cadenceLabel(source.scheduler_interval_minutes)
                    : source.frequency.toUpperCase()
                const sourceTransform = source.transform_rule?.trim() ? `Transform ${source.transform_rule}` : 'Raw provider value'
                const sourceFreshness =
                  source.provider_observation_age_hours != null
                    ? formatAgeHours(source.provider_observation_age_hours)
                    : 'Provider freshness unknown'
                const sourceAnchorId = adminPriceSourceDetailAnchorId(source.id)
                const sourceIsSelected = source.id === selectedPriceSourceId

                return (
                  <article
                    key={`${source.provider}-${source.series_id}-${source.id}`}
                    className={`admin-run-row admin-weather-row${sourceIsSelected ? ' admin-weather-row-selected' : ''}`}
                  >
                    <div>
                      <strong>{source.price_index_code}</strong>
                      <p>
                        {source.price_index_name ?? 'Unmapped price index'} · {source.source_system ?? source.provider} · {source.series_id}
                      </p>
                      <div className="admin-weather-row-detail">
                        <span>{source.commodity_code ?? 'No commodity'}</span>
                        <span>{source.ingestion_method ?? 'Provider pull'}</span>
                        <span>{source.ingestion_mode ?? 'Manual sync'}</span>
                        <span>Cadence {sourceCadence}</span>
                        <span>{successSlaLabel(source.success_sla_hours)}</span>
                        <span>{lookbackLabel(source.default_lookback_days)}</span>
                        <span>Source freq {source.frequency.toUpperCase()}</span>
                        <span>Unit {sourceUnit}</span>
                        <span>Dataset {source.dataset_code ?? 'Provider default'}</span>
                        <span>Endpoint {sourceEndpointLabel(source.source_endpoint)}</span>
                        <span>{source.location_code ?? 'No location'}</span>
                        <span>{source.market ?? 'No market'}</span>
                        <span>{sourceTransform}</span>
                      </div>
                      {source.provider_error_summary ? <p>{source.provider_error_summary}</p> : null}
                    </div>
                    <div className="admin-run-meta">
                      <span className={`status-pill status-pill-${priceSourceReviewTone(source.review_status)}`}>
                        {priceSourceReviewLabel(source.review_status)}
                      </span>
                      <span>
                        {source.latest_observation_date
                          ? `${formatDateOnly(source.latest_observation_date)} · ${latestValue}`
                          : latestValue}
                      </span>
                      <span>{source.latest_source_published_at ? `Published ${formatDate(source.latest_source_published_at)}` : 'Publication time unknown'}</span>
                      <span>{source.latest_downloaded_at ? `Loaded ${formatDate(source.latest_downloaded_at)}` : 'Never loaded'}</span>
                      <span>{source.due_for_sync ? 'Provider due for sync' : sourceFreshness}</span>
                      <span>{source.latest_run_id ? `Run #${source.latest_run_id}` : source.latest_run_status ?? 'No run'}</span>
                      {source.latest_source_revision ? <span>Revision {source.latest_source_revision}</span> : null}
                      <a
                        className="button button-secondary"
                        href={`#${sourceAnchorId}`}
                        onClick={() => setSelectedPriceSourceId(source.id)}
                      >
                        Open source view
                      </a>
                    </div>
                  </article>
                )
              })
            )}
            {visibleExternalDataPriceSources.length > 40 ? (
              <div className="detail-row">
                <span>Showing the first 40 matching price sources. Narrow the local filter to inspect the rest.</span>
              </div>
            ) : null}
          </div>

          <div className="admin-run-list">
            {marketDataRuns.length === 0 ? (
              <div className="detail-row">
                <span>{hasScreenFilter ? 'No market-data sync runs match the current local filter.' : 'No market-data sync runs are loaded yet.'}</span>
              </div>
            ) : (
              marketDataRuns.slice(0, 8).map((run) => (
                <article key={run.id} className="admin-run-row">
                  <div>
                    <strong>
                      {run.provider} run #{run.id}
                    </strong>
                    <p>
                      {run.status} · {run.series_count} series · {run.observation_count} observations
                    </p>
                  </div>
                  <div className="admin-run-meta">
                    <span>{formatDate(run.finished_at ?? run.started_at)}</span>
                    <span>{run.requested_by ?? 'system'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="admin-sync-panel">
          <div className="admin-sync-head">
            <div>
              <span className="eyebrow">Credit Operations</span>
              <h3>D&amp;B Counterparty Credit Preview</h3>
            </div>
            <div className="admin-sync-head-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void onPreviewCounterpartyCreditImport()}
                disabled={counterpartyCreditPreviewing || counterpartyCreditImporting}
              >
                {counterpartyCreditPreviewing ? 'Previewing D&B Rows...' : 'Preview D&B Rows'}
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void onImportCounterpartyCreditSnapshots()}
                disabled={counterpartyCreditImporting || readyCounterpartyCreditPreviewRows.length === 0}
              >
                {counterpartyCreditImporting ? 'Importing Ready Rows...' : 'Import Ready Rows'}
              </button>
            </div>
          </div>
          <p>
            Paste a raw D&amp;B JSON array, preview how each row matches counterparties, then import only the rows that are ready.
            The stored snapshots still land in the auditable external-credit run log after import.
          </p>

          <div className="admin-sync-status-grid">
            <article className="admin-card">
              <AdminCardTitle
                label="Latest Import"
                tooltip="Most recent counterparty credit import recorded in the external data run log."
              />
              <p>
                {latestCounterpartyCreditImportRun
                  ? `${latestCounterpartyCreditImportRun.provider} run #${latestCounterpartyCreditImportRun.id} ${latestCounterpartyCreditImportRun.status.toLowerCase()} with ${latestCounterpartyCreditImportRun.observation_count} snapshots.`
                  : 'No counterparty credit import has been recorded yet.'}
              </p>
              <span>
                {latestCounterpartyCreditImportRun
                  ? formatDate(latestCounterpartyCreditImportRun.finished_at ?? latestCounterpartyCreditImportRun.started_at)
                  : 'Awaiting first import'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Run History"
                tooltip="Recent counterparty credit import runs, regardless of provider."
              />
              <p>
                {counterpartyCreditImportRuns.length > 0
                  ? `${counterpartyCreditImportRuns.length} import run${counterpartyCreditImportRuns.length === 1 ? '' : 's'} are currently loaded in the admin workspace.`
                  : 'Run history will populate after the first batch import.'}
              </p>
              <span>
                {counterpartyCreditImportRuns.length > 0
                  ? counterpartyCreditImportRuns.slice(0, 3).map((run) => run.provider).join(' · ')
                  : 'No providers imported yet'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Preview Readiness"
                tooltip="Current D&B preview status for the pasted JSON batch in this session."
              />
              <p>
                {counterpartyCreditPreview
                  ? `${readyCounterpartyCreditPreviewRows.length} ready, ${previewBlockedRowCount} blocked, ${previewWarningRowCount} with warnings.`
                  : 'Preview a D&B batch to see row-level match and validation results.'}
              </p>
              <span>
                {counterpartyCreditPreview
                  ? `${previewMatchedRowCount} matched of ${visibleCounterpartyCreditPreviewRows.length}`
                  : 'Awaiting preview'}
              </span>
            </article>
          </div>

          {counterpartyCreditPreviewError ? <div className="feedback-banner feedback-banner-error">{counterpartyCreditPreviewError}</div> : null}
          {counterpartyCreditPreviewSuccess ? <div className="feedback-banner feedback-banner-success">{counterpartyCreditPreviewSuccess}</div> : null}
          {counterpartyCreditImportError ? <div className="feedback-banner feedback-banner-error">{counterpartyCreditImportError}</div> : null}
          {counterpartyCreditImportSuccess ? <div className="feedback-banner feedback-banner-success">{counterpartyCreditImportSuccess}</div> : null}

          <div className="stack-form">
            <label className="field">
              <span>D&amp;B Rows JSON Array</span>
              <textarea
                className="control control-textarea"
                value={counterpartyCreditImportDraft}
                onChange={(event) => onCounterpartyCreditImportDraftChange(event.target.value)}
                disabled={counterpartyCreditPreviewing || counterpartyCreditImporting}
                placeholder={`[
  {
    "duns": "123456789",
    "organizationPrimaryName": "Acme Trading LLC",
    "scoreDate": "2026-04-05",
    "dnbRating": "4A1",
    "ratingOutlook": "Stable",
    "commercialCreditScore": { "rawScore": 74 },
    "dnbCreditLimitRecommendation": {
      "maximumRecommendedLimitAmount": 2000000
    }
  }
]`}
              />
            </label>
          </div>

          {counterpartyCreditPreview ? (
            <div className="stack">
              <div className="chip-row">
                <span className="entity-chip entity-chip-soft">
                  {visibleCounterpartyCreditPreviewRows.length} row{visibleCounterpartyCreditPreviewRows.length === 1 ? '' : 's'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {previewMatchedRowCount} matched
                </span>
                <span className="entity-chip entity-chip-soft">
                  {readyCounterpartyCreditPreviewRows.length} ready
                </span>
                <span className={`entity-chip ${previewWarningRowCount > 0 ? '' : 'entity-chip-soft'}`}>
                  {previewWarningRowCount} warnings
                </span>
                <span className={`entity-chip ${previewBlockedRowCount > 0 ? '' : 'entity-chip-soft'}`}>
                  {previewBlockedRowCount} blocked
                </span>
              </div>

              <div className="admin-run-list">
                {visibleCounterpartyCreditPreviewRows.length === 0 ? (
                  <div className="detail-row">
                    <span>No D&amp;B preview rows match the current local filter.</span>
                  </div>
                ) : (
                  visibleCounterpartyCreditPreviewRows.map((row) => {
                  const recommendedLimit =
                    row.recommended_limit_amount != null
                      ? `${row.recommended_limit_currency_code ?? '—'} ${formatNumber(row.recommended_limit_amount, 2)}`
                      : '—'

                  return (
                    <article
                      key={`${row.row_number}-${row.source_entity_id ?? row.source_entity_name ?? 'row'}`}
                      className="admin-run-row"
                    >
                      <div>
                        <strong>
                          Row {row.row_number}
                          {row.source_entity_name ? ` · ${row.source_entity_name}` : ''}
                        </strong>
                        <p>
                          {row.match_status}
                          {row.matched_counterparty_code ? ` · ${row.matched_counterparty_code}` : ''}
                          {row.match_basis ? ` · ${row.match_basis}` : ''}
                          {row.matched_identifier_value ? ` ${row.matched_identifier_value}` : ''}
                        </p>
                        <span>
                          Rating {row.rating_value ?? '—'}
                          {row.rating_outlook ? ` · ${row.rating_outlook}` : ''}
                          {row.credit_score != null ? ` · Score ${formatNumber(row.credit_score, 2)}` : ''}
                          {row.probability_of_default != null
                            ? ` · PD ${formatNumber(row.probability_of_default * 100, 2)}%`
                            : ''}
                          {` · Limit ${recommendedLimit}`}
                        </span>
                        {row.commentary ? <p>{row.commentary}</p> : null}
                        {row.issues.length > 0 ? (
                          <div className="chip-row">
                            {row.issues.map((issue) => (
                              <span
                                key={`${row.row_number}-${issue.code}-${issue.message}`}
                                className={`entity-chip ${issue.severity === 'error' ? '' : 'entity-chip-soft'}`}
                              >
                                {issue.severity.toUpperCase()}: {issue.message}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="admin-run-meta">
                        <span>{row.ready_to_import ? 'Ready to import' : 'Needs attention'}</span>
                        <span>
                          {row.snapshot?.as_of_date
                            ? `As of ${formatDateOnly(row.snapshot.as_of_date)}`
                            : 'Missing source date'}
                        </span>
                      </div>
                    </article>
                  )
                  })
                )}
              </div>
            </div>
          ) : null}

          <div className="admin-run-list">
            {counterpartyCreditImportRuns.length === 0 ? (
              <div className="detail-row">
                <span>{hasScreenFilter ? 'No counterparty credit import runs match the current local filter.' : 'No counterparty credit import runs are loaded yet.'}</span>
              </div>
            ) : (
              counterpartyCreditImportRuns.slice(0, 8).map((run) => (
                <article key={run.id} className="admin-run-row">
                  <div>
                    <strong>
                      {run.provider} import #{run.id}
                    </strong>
                    <p>
                      {run.status} · {run.series_count} counterparties · {run.observation_count} snapshots
                    </p>
                    {run.error_summary ? <span>{run.error_summary}</span> : null}
                  </div>
                  <div className="admin-run-meta">
                    <span>{formatDate(run.finished_at ?? run.started_at)}</span>
                    <span>{run.requested_by ?? 'system'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="admin-sync-panel">
          <div className="admin-sync-head">
            <div>
              <span className="eyebrow">Platform Metadata</span>
              <h3>Trading Source Register</h3>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void onSeedTradingSources()}
              disabled={tradingSourcesSyncing}
            >
              {tradingSourcesSyncing ? 'Seeding Register...' : 'Seed Source Register'}
            </button>
          </div>
          <p>Load the canonical source register from the repo into the API database and inspect the live metadata used for governance.</p>

          <div className="admin-sync-status-grid">
            <article className="admin-card">
              <AdminCardTitle
                label="Loaded Sources"
                tooltip="Current number of source-governance records seeded into the live database."
              />
              <p>{visibleTradingSources.length === 0 ? 'No trading-source metadata is currently in view.' : `${visibleTradingSources.length} sources are available in the current admin view.`}</p>
              <span>{visibleTradingSources.length === 0 ? 'Seed the register to activate this surface' : `${visibleTradingSources.filter((row) => row.status === 'active').length} active records`}</span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Criticality Mix"
                tooltip="Distribution of trading sources by operational criticality tier."
              />
              <p>
                {tradingSourcesByCriticality.length === 0
                  ? 'Criticality will populate after the first seed.'
                  : tradingSourcesByCriticality.map((row) => `${row.key}: ${row.count}`).join(' · ')}
              </p>
              <span>{visibleTradingSources.length === 0 ? 'Awaiting seed' : 'Derived from live table rows'}</span>
            </article>
          </div>

          {tradingSourcesError ? <div className="feedback-banner feedback-banner-error">{tradingSourcesError}</div> : null}
          {tradingSourcesSuccess ? <div className="feedback-banner feedback-banner-success">{tradingSourcesSuccess}</div> : null}

          <div className="admin-run-list">
            {visibleTradingSources.length === 0 ? (
              <div className="detail-row">
                <span>{hasScreenFilter ? 'No trading sources match the current local filter.' : 'No trading sources loaded.'}</span>
              </div>
            ) : (
              visibleTradingSources.slice(0, 10).map((row) => (
                <article key={row.source_id} className="admin-run-row">
                  <div>
                    <strong>{row.source_name}</strong>
                    <p>
                      {row.source_category} · {row.criticality} · {row.business_owner}
                    </p>
                  </div>
                  <div className="admin-run-meta">
                    <span>{row.status}</span>
                    <span>{formatDate(row.last_reviewed_at)}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeAdminSection === 'explainability' ? (
      <>
      <section className="surface feature-panel admin-hero-surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">How It Works</span>
            <h3>System Atlas</h3>
          </div>
          <p>Read the product as connected domains, events, projections, and governed records without mixing that educational view into daily operations.</p>
        </div>

        <div className="admin-summary-grid">
          {adminSummaryCards.map((card) => (
            <article key={card.label} className="admin-summary-card">
              <span>
                <InlineTooltipLabel tooltip={card.tooltip} tooltipLabel={`More information about ${card.label}`} align="start">
                  {card.label}
                </InlineTooltipLabel>
              </span>
              {card.valueTooltip ? (
                <Tooltip content={card.valueTooltip} focusable>
                  <strong className="tooltip-trigger-hint">{card.value}</strong>
                </Tooltip>
              ) : (
                <strong>{card.value}</strong>
              )}
              <p>{card.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-explainability-grid">
        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Architecture</span>
              <h3>Domain Map</h3>
            </div>
            <p>Each domain owns a slice of workflow and data, while events and projections bind the product together.</p>
          </div>

          <div className="domain-map-grid">
            {visibleAdminDomains.length === 0 ? (
              <div className="empty-state">
                <strong>No domain concepts match the filter</strong>
                <p>Try a broader local search to bring more architecture slices back into view.</p>
              </div>
            ) : (
              visibleAdminDomains.map((domain) => (
                <article key={domain.key} className="domain-card">
                  <div className="domain-card-head">
                    <strong>{domain.label}</strong>
                    <span>{domain.entities.length} entities</span>
                  </div>
                  <p>{domain.summary}</p>
                  <div className="chip-row">
                    {domain.entities.map((entity) => (
                      <span key={entity} className="entity-chip">
                        {entity}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Lifecycle</span>
              <h3>Trade Trace</h3>
            </div>
            <p>{selectedTrade ? `Following ${selectedTrade.trade_id} through the current write and read path.` : 'Select a trade in the main app to inspect its event-to-projection flow.'}</p>
          </div>

          <div className="timeline timeline-large">
            {visibleLifecycleSteps.length === 0 ? (
              <div className="empty-state">
                <strong>No lifecycle steps match the filter</strong>
                <p>The selected trade trace stays available, but nothing in the current step copy matches this local search.</p>
              </div>
            ) : (
              visibleLifecycleSteps.map((step) => (
                <article key={step.key} className="timeline-item timeline-item-card">
                  <div className="timeline-dot" />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>{step.title}</strong>
                    </div>
                    <p>{step.detail}</p>
                    <div className="timeline-meta">
                      {step.meta.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="admin-explainability-grid">
        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Schema</span>
              <h3>Core Entity Explorer</h3>
            </div>
            <p>A simplified ERD-style view focused on the records that currently matter most to product behavior.</p>
          </div>

          <div className="schema-explorer-grid">
            <div className="schema-entity-list">
              {visibleSchemaEntities.map((entity) => (
                <button
                  key={entity.key}
                  type="button"
                  className={`schema-entity-button ${effectiveSelectedSchemaEntity === entity.key ? 'is-active' : ''}`}
                  onClick={() => setSelectedSchemaEntity(entity.key)}
                >
                  <strong>{entity.label}</strong>
                  <span>{entity.status}</span>
                </button>
              ))}
            </div>

            {selectedSchemaDetail ? (
              <div className="schema-detail-card">
                <div className="schema-detail-head">
                  <div>
                    <span className="eyebrow">Entity</span>
                    <h4>{selectedSchemaDetail.label}</h4>
                  </div>
                  <Tooltip
                    content={
                      selectedSchemaDetail.status === 'Current'
                        ? 'This entity already exists in the current product model and runtime.'
                        : 'This entity is planned for a future iteration and is not live yet.'
                    }
                    focusable
                  >
                    <span className="schema-status tooltip-trigger-hint">{selectedSchemaDetail.status}</span>
                  </Tooltip>
                </div>

                <p>{selectedSchemaDetail.purpose}</p>

                <div className="schema-columns">
                  <div className="schema-column">
                    <span className="schema-label">Key Fields</span>
                    <div className="chip-row">
                      {selectedSchemaDetail.fields.map((field) => (
                        <span key={field} className="entity-chip">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="schema-column">
                    <span className="schema-label">Relationships</span>
                    <div className="stack">
                      {selectedSchemaDetail.relationships.map((relationship) => (
                        <div key={relationship} className="detail-row">
                          <span>{relationship}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="schema-column">
                    <span className="schema-label">Consumers</span>
                    <div className="chip-row">
                      {selectedSchemaDetail.consumers.map((consumer) => (
                        <span key={consumer} className="entity-chip entity-chip-soft">
                          {consumer}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No schema entities match the filter</strong>
                <p>Try a broader local search to bring the entity explorer back into view.</p>
              </div>
            )}
          </div>
        </article>

        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Provenance</span>
              <h3>Live System Window</h3>
            </div>
            <p>These cards make the explainability surface read from actual runtime state instead of static documentation.</p>
          </div>

          <div className="admin-provenance-grid">
            <article className="admin-card">
              <AdminCardTitle
                label="Latest Event"
                tooltip="Most recent event row currently loaded into the admin explainability surface."
              />
              <p>{latestEvent ? `${latestEvent.event_type} on ${latestEvent.aggregate_id}` : 'No event has been loaded yet.'}</p>
              <span>{latestEvent ? formatDate(latestEvent.recorded_at) : 'Awaiting activity'}</span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Trade Projection"
                tooltip="Most recent trade read-model row loaded into the admin view."
              />
              <p>{latestTradeProjectionUpdate ? `Most recent trade row is ${latestTradeProjectionUpdate.trade_id}.` : 'No trade projection loaded yet.'}</p>
              <span>{latestTradeProjectionUpdate ? formatDate(latestTradeProjectionUpdate.updated_at) : 'Awaiting trade state'}</span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Positions Projection"
                tooltip="Most recent positions projection row currently loaded for explainability."
              />
              <p>{latestPositionProjectionUpdate ? `Latest exposure update is for ${latestPositionProjectionUpdate.commodity}.` : 'No position projection loaded yet.'}</p>
              <span>{latestPositionProjectionUpdate ? formatDate(latestPositionProjectionUpdate.updated_at) : 'Awaiting exposure state'}</span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Schema Version"
                tooltip="Event schema version observed on the latest loaded write event."
              />
              <p>{latestEvent ? `Current loaded writes are emitting schema version ${latestEvent.schema_version}.` : 'Schema version will appear once events are present.'}</p>
              <span>Derived from event feed</span>
            </article>
          </div>
        </article>
      </section>
      </>
      ) : null}

      {activeAdminSection === 'assistant-governance' ? (
        <>
          <AssistantControlTowerPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
            onStartSupervisionIntent={setAssistantSupervisionIntent}
          />

          <div id="assistant-agent-management">
            <AgentManagementPanel
              authSession={authSession}
              formatDate={formatDate}
              onOpenSettings={onOpenSettings}
              controlTowerIntent={assistantSupervisionIntent}
            />
          </div>

          <div id="assistant-outcome-metrics">
            <AssistantOutcomeMetricsPanel
              authSession={authSession}
              formatDate={formatDate}
              onOpenSettings={onOpenSettings}
            />
          </div>

          <div id="assistant-approval-inbox">
            <AssistantApprovalInboxPanel
              authSession={authSession}
              formatDate={formatDate}
              onOpenSettings={onOpenSettings}
              onRefreshData={onRefreshData}
            />
          </div>
        </>
      ) : null}

      {activeAdminSection === 'automation' ? (
        <>
          <CodexTaskPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
          />

          <JobSchedulingPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
          />

          <ProjectionMonitoringPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
            onRefreshData={onRefreshData}
          />
        </>
      ) : null}

      {activeAdminSection === 'access-planning' ? (
        <>
          <RoadmapAdminPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
            onRoadmapPublished={onRoadmapPublished}
          />

          <HomeViewAdminPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
          />

          <UserManagementPanel
            authSession={authSession}
            formatDate={formatDate}
            onOpenSettings={onOpenSettings}
          />

          <section className="surface">
            <div className="section-head">
              <div>
                <span className="eyebrow">Controls</span>
                <h3>Governance and Operations</h3>
              </div>
              <p>Longer-lived governance setup stays separate from daily operational triage.</p>
            </div>

            <div className="admin-grid">
              <article className="admin-card">
                <strong>Reference Governance</strong>
                <p>Add maker-checker review, deactivation safeguards, and audit history for sensitive master data.</p>
              </article>
              <article className="admin-card">
                <strong>Roles and Access</strong>
                <p>Split trader, operations, and admin capabilities so only the right users can amend reference data.</p>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
