import { useMemo, useState } from 'react'
import type {
  CounterpartyCreditPreviewRecord,
  ExternalDataSyncStatusRecord,
  WeatherSyncStatusRecord,
} from '../../shared/models'
import { formatDateOnly } from '../../shared/format'
import { tradeStatusIsActive } from '../../shared/trading'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'
import { type StoredAuthSession } from '../../shared/mutation'
import { AgentManagementPanel } from './AgentManagementPanel'
import { AssistantApprovalInboxPanel } from './AssistantApprovalInboxPanel'
import { RoadmapAdminPanel } from './RoadmapAdminPanel'
import { UserManagementPanel } from './UserManagementPanel'
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
type ExternalDataSyncProvider = 'EIA' | 'EIA_FUNDAMENTALS' | 'FRED' | 'CFTC' | 'CAISO' | 'ERCOT' | 'KALSHI'

type SchemaEntityKey =
  | 'events'
  | 'trades'
  | 'positions'
  | 'reference_books'
  | 'reference_commodities'
  | 'reference_price_indices'

type AdminWorkspaceProps = {
  authSession: StoredAuthSession | null
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
  tradingSources: TradingSourceRecord[]
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
  onRunExternalDataSync: (provider: ExternalDataSyncProvider) => Promise<void>
  onCounterpartyCreditImportDraftChange: (value: string) => void
  onPreviewCounterpartyCreditImport: () => Promise<void>
  onImportCounterpartyCreditSnapshots: () => Promise<void>
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
    case 'positioning':
      return 'Positioning'
    default:
      return value
  }
}

export function AdminWorkspace({
  authSession,
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
  tradingSources,
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
  onRunExternalDataSync,
  onCounterpartyCreditImportDraftChange,
  onPreviewCounterpartyCreditImport,
  onImportCounterpartyCreditSnapshots,
  onRunNwsWeatherSync,
  onSeedTradingSources,
  onRefreshData,
  formatDate,
  formatMoney,
  formatNumber,
  formatCommodityClass,
}: AdminWorkspaceProps) {
  const [selectedSchemaEntity, setSelectedSchemaEntity] = useState<SchemaEntityKey>('events')

  const latestEvent = useMemo(
    () =>
      [...events].sort(
        (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
      )[0] ?? null,
    [events],
  )

  const latestTradeProjectionUpdate = useMemo(
    () =>
      [...trades].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )[0] ?? null,
    [trades],
  )

  const latestPositionProjectionUpdate = useMemo(
    () =>
      [...positions].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )[0] ?? null,
    [positions],
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

  const selectedSchemaDetail = useMemo(
    () => SCHEMA_ENTITIES.find((entity) => entity.key === selectedSchemaEntity) ?? SCHEMA_ENTITIES[0],
    [selectedSchemaEntity],
  )

  const adminSummaryCards = useMemo(
    () => [
      {
        label: 'Events Recorded',
        value: `${events.length}`,
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
        value: `${activeBooks.length + activeCommodities.length + priceIndices.filter((row) => row.is_active).length}`,
        note: `${activeBooks.length} books, ${activeCommodities.length} commodities, ${priceIndices.filter((row) => row.is_active).length} price indices`,
        tooltip: 'Total active master-data records currently supporting trading and pricing workflows.',
      },
    ],
    [
      activeBooks.length,
      activeCommodities.length,
      events.length,
      formatDate,
      latestEvent,
      latestTradeProjectionUpdate,
      priceIndices,
      projectionFreshnessLabel,
    ],
  )

  const marketDataProviders = useMemo(
    () => externalDataSyncStatus?.providers ?? [],
    [externalDataSyncStatus],
  )
  const marketDataProviderCodes = useMemo(
    () => new Set(marketDataProviders.map((provider) => provider.provider)),
    [marketDataProviders],
  )
  const marketDataRuns = useMemo(
    () => externalDataRuns.filter((run) => marketDataProviderCodes.has(run.provider)),
    [externalDataRuns, marketDataProviderCodes],
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
  const marketDataAttentionCount =
    (externalDataSyncStatus?.stale_provider_count ?? 0) +
    (externalDataSyncStatus?.failed_provider_count ?? 0) +
    (externalDataSyncStatus?.unknown_provider_count ?? 0)
  const counterpartyCreditImportRuns = useMemo(
    () => externalDataRuns.filter((run) => run.job_name === 'import_counterparty_credit_snapshots'),
    [externalDataRuns],
  )
  const latestCounterpartyCreditImportRun = useMemo(
    () => counterpartyCreditImportRuns[0] ?? null,
    [counterpartyCreditImportRuns],
  )
  const readyCounterpartyCreditPreviewRows = useMemo(
    () => counterpartyCreditPreview?.rows.filter((row) => row.ready_to_import) ?? [],
    [counterpartyCreditPreview],
  )
  const previewBlockedRowCount = counterpartyCreditPreview?.blocked_rows ?? 0
  const previewWarningRowCount = counterpartyCreditPreview?.warning_rows ?? 0

  const weatherLocations = weatherSyncStatus?.locations ?? []
  const latestNwsRun = weatherSyncStatus?.latest_run ?? null
  const latestNwsSuccess = weatherSyncStatus?.latest_success ?? null

  const tradingSourcesByCriticality = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of tradingSources) {
      counts.set(row.criticality, (counts.get(row.criticality) ?? 0) + 1)
    }
    return ['tier_0', 'tier_1', 'tier_2', 'tier_3']
      .map((key) => ({ key, count: counts.get(key) ?? 0 }))
      .filter((row) => row.count > 0)
  }, [tradingSources])

  return (
    <div className="stack">
      <SystemStatusPanel />

      <section className="surface feature-panel admin-hero-surface">
        <div className="section-head">
          <div>
            <span className="eyebrow">How It Works</span>
            <h3>System Atlas</h3>
          </div>
          <p>Read the product as a set of connected domains, events, projections, and governed records rather than isolated pages.</p>
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

        <div className="admin-sync-panel">
          <div className="admin-sync-head">
            <div>
              <span className="eyebrow">Weather Operations</span>
              <h3>NWS Sync Health</h3>
            </div>
            <div className="admin-sync-head-actions">
              {weatherSyncStatus ? (
                <span className={`status-pill status-pill-${weatherHealthTone(weatherSyncStatus.health_status)}`}>
                  {weatherHealthLabel(weatherSyncStatus.health_status)}
                </span>
              ) : null}
              <button
                type="button"
                className="button button-primary"
                onClick={() => void onRunNwsWeatherSync()}
                disabled={weatherSyncing}
              >
                {weatherSyncing ? 'Running Weather Sync...' : 'Run NWS Sync'}
              </button>
            </div>
          </div>
          <p>Monitor the live NOAA ingest loop, inspect freshness by location, and trigger an on-demand sync when desk coverage needs a manual refresh.</p>

          <div className="admin-sync-status-grid">
            <article className="admin-card">
              <AdminCardTitle
                label="Coverage"
                tooltip="How many active weather points are currently fresh enough to support the live intelligence blend."
              />
              <p>
                {weatherSyncStatus
                  ? `${weatherSyncStatus.healthy_location_count} of ${weatherSyncStatus.active_location_count} active locations are currently healthy.`
                  : 'Weather sync status has not been loaded yet.'}
              </p>
              <span>
                {weatherSyncStatus
                  ? `${weatherSyncStatus.stale_location_count} stale · ${weatherSyncStatus.missing_location_count} missing`
                  : 'Awaiting first status snapshot'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Scheduler"
                tooltip="Expected sync cadence and freshness targets for forecasts and observations."
              />
              <p>
                {weatherSyncStatus
                  ? `${cadenceLabel(weatherSyncStatus.scheduler_interval_minutes)} cadence with ${weatherSyncStatus.success_sla_hours}h run SLA.`
                  : 'Scheduler cadence is not available yet.'}
              </p>
              <span>
                {weatherSyncStatus
                  ? `Forecast target ${weatherSyncStatus.forecast_freshness_hours}h · observations ${weatherSyncStatus.observation_freshness_hours}h`
                  : 'No freshness target loaded'}
              </span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Latest Run"
                tooltip="Most recent NWS sync attempt recorded in the platform."
              />
              <p>
                {latestNwsRun
                  ? `Run #${latestNwsRun.id} ${latestNwsRun.status} with ${latestNwsRun.series_count} series and ${latestNwsRun.observation_count} observations.`
                  : 'No NWS sync has been recorded yet.'}
              </p>
              <span>{latestNwsRun ? formatDate(latestNwsRun.finished_at ?? latestNwsRun.started_at) : 'Awaiting first sync'}</span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Latest Healthy Data"
                tooltip="Newest successfully ingested weather data currently available to the intelligence layer."
              />
              <p>
                {weatherSyncStatus?.latest_data_at
                  ? `Latest weather payload landed ${formatDate(weatherSyncStatus.latest_data_at)}.`
                  : 'No forecast or observation data is stored yet.'}
              </p>
              <span>{latestNwsSuccess ? `Last success run #${latestNwsSuccess.id}` : 'No successful run recorded yet'}</span>
            </article>
          </div>

          {weatherSyncError ? <div className="feedback-banner feedback-banner-error">{weatherSyncError}</div> : null}
          {weatherSyncSuccess ? <div className="feedback-banner feedback-banner-success">{weatherSyncSuccess}</div> : null}
          {weatherSyncStatus?.error_summary ? (
            <div className="feedback-banner feedback-banner-error">{weatherSyncStatus.error_summary}</div>
          ) : null}

          <div className="admin-run-list">
            {weatherLocations.length === 0 ? (
              <div className="detail-row">
                <span>No tracked weather locations are loaded yet.</span>
              </div>
            ) : (
              weatherLocations.map((location) => (
                <article key={location.code} className="admin-run-row admin-weather-row">
                  <div className="admin-weather-row-main">
                    <div>
                      <strong>{location.name}</strong>
                      <p>
                        {location.code}
                        {location.reference_location_code ? ` · ref ${location.reference_location_code}` : ''}
                        {location.station_id ? ` · station ${location.station_id}` : ''}
                      </p>
                    </div>
                    <div className="admin-weather-row-detail">
                      <span>Forecast {formatAgeHours(location.forecast_age_hours)}</span>
                      <span>Observation {formatAgeHours(location.observation_age_hours)}</span>
                    </div>
                  </div>
                  <div className="admin-run-meta">
                    <span className={`status-pill status-pill-${weatherHealthTone(location.health_status)}`}>
                      {weatherHealthLabel(location.health_status)}
                    </span>
                    <span>{location.last_observation_at ? `Observed ${formatDate(location.last_observation_at)}` : 'No observation yet'}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

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
                  ? `${externalDataSyncStatus.healthy_provider_count} of ${externalDataSyncStatus.provider_count} providers are healthy.`
                  : 'Market-data sync status has not been loaded yet.'}
              </p>
              <span>
                {externalDataSyncStatus
                  ? `${externalDataSyncStatus.failed_provider_count} failed · ${externalDataSyncStatus.stale_provider_count} stale · ${externalDataSyncStatus.unknown_provider_count} unknown`
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
                  ? `${externalDataSyncStatus.running_provider_count} running · ${marketDataProviders.filter((provider) => provider.due_for_sync).length} due for sync`
                  : 'No scheduler state loaded'}
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
                <span>No market-data provider status is loaded yet.</span>
              </div>
            ) : (
              marketDataProviders.map((provider: ExternalDataProviderStatusRecord) => (
                <article key={provider.provider} className="admin-run-row admin-weather-row">
                  <div>
                    <strong>{provider.label}</strong>
                    <p>
                      {provider.provider} · {marketDataCategoryLabel(provider.category)} · {provider.active_series_count} active series
                    </p>
                    <div className="admin-weather-row-detail">
                      <span>{provider.latest_observation_at ? `Latest data ${formatDate(provider.latest_observation_at)}` : 'No stored observation yet'}</span>
                      <span>{provider.observation_age_hours != null ? formatAgeHours(provider.observation_age_hours) : 'Freshness unknown'}</span>
                      <span>{provider.due_for_sync ? 'Due for sync' : `Cadence ${cadenceLabel(provider.scheduler_interval_minutes)}`}</span>
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

          <div className="admin-run-list">
            {marketDataRuns.length === 0 ? (
              <div className="detail-row">
                <span>No market-data sync runs are loaded yet.</span>
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
                  ? `${counterpartyCreditPreview.matched_rows} matched of ${counterpartyCreditPreview.total_rows}`
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
                  {counterpartyCreditPreview.total_rows} row{counterpartyCreditPreview.total_rows === 1 ? '' : 's'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  {counterpartyCreditPreview.matched_rows} matched
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
                {counterpartyCreditPreview.rows.map((row) => {
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
                })}
              </div>
            </div>
          ) : null}

          <div className="admin-run-list">
            {counterpartyCreditImportRuns.length === 0 ? (
              <div className="detail-row">
                <span>No counterparty credit import runs are loaded yet.</span>
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
              <p>{tradingSources.length === 0 ? 'No trading-source metadata has been seeded yet.' : `${tradingSources.length} sources are available in the live register.`}</p>
              <span>{tradingSources.length === 0 ? 'Seed the register to activate this surface' : `${tradingSources.filter((row) => row.status === 'active').length} active records`}</span>
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
              <span>{tradingSources.length === 0 ? 'Awaiting seed' : 'Derived from live table rows'}</span>
            </article>
          </div>

          {tradingSourcesError ? <div className="feedback-banner feedback-banner-error">{tradingSourcesError}</div> : null}
          {tradingSourcesSuccess ? <div className="feedback-banner feedback-banner-success">{tradingSourcesSuccess}</div> : null}

          <div className="admin-run-list">
            {tradingSources.length === 0 ? (
              <div className="detail-row">
                <span>No trading sources loaded.</span>
              </div>
            ) : (
              tradingSources.slice(0, 10).map((row) => (
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
            {ADMIN_DOMAIN_MAP.map((domain) => (
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
            ))}
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
            {lifecycleSteps.map((step) => (
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
            ))}
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
              {SCHEMA_ENTITIES.map((entity) => (
                <button
                  key={entity.key}
                  type="button"
                  className={`schema-entity-button ${selectedSchemaEntity === entity.key ? 'is-active' : ''}`}
                  onClick={() => setSelectedSchemaEntity(entity.key)}
                >
                  <strong>{entity.label}</strong>
                  <span>{entity.status}</span>
                </button>
              ))}
            </div>

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

      <RoadmapAdminPanel
        authSession={authSession}
        formatDate={formatDate}
        onOpenSettings={onOpenSettings}
        onRoadmapPublished={onRoadmapPublished}
      />

      <AgentManagementPanel
        authSession={authSession}
        formatDate={formatDate}
        onOpenSettings={onOpenSettings}
      />

      <AssistantApprovalInboxPanel
        authSession={authSession}
        formatDate={formatDate}
        onOpenSettings={onOpenSettings}
        onRefreshData={onRefreshData}
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
          <p>Operational actions still live here, but now below the product-facing explainability layer.</p>
        </div>

        <div className="admin-grid">
          <article className="admin-card">
            <strong>Projection Jobs</strong>
            <p>Expose rebuild controls for trades and positions here once those flows move into the app.</p>
          </article>
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
    </div>
  )
}
