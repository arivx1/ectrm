import { useMemo, useState } from 'react'
import { InlineTooltipLabel, Tooltip } from '../../shared/ui/Tooltip'
import { type StoredAuthSession } from '../../shared/mutation'
import { AgentManagementPanel } from './AgentManagementPanel'
import { RoadmapAdminPanel } from './RoadmapAdminPanel'
import { UserManagementPanel } from './UserManagementPanel'

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
  tradingSources: TradingSourceRecord[]
  externalDataSyncing: boolean
  externalDataError: string
  externalDataSuccess: string
  tradingSourcesSyncing: boolean
  tradingSourcesError: string
  tradingSourcesSuccess: string
  onRunEiaSync: () => Promise<void>
  onSeedTradingSources: () => Promise<void>
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
  tradingSources,
  externalDataSyncing,
  externalDataError,
  externalDataSuccess,
  tradingSourcesSyncing,
  tradingSourcesError,
  tradingSourcesSuccess,
  onRunEiaSync,
  onSeedTradingSources,
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
          ? `${selectedTrade.status === 'CANCELLED' ? 'Cancel' : 'Capture or amend'} ${selectedTrade.trade_id} in the workspace`
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

  const latestEiaRun = useMemo(
    () => externalDataRuns.find((run) => run.provider === 'EIA') ?? null,
    [externalDataRuns],
  )

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
              <span className="eyebrow">External Data</span>
              <h3>EIA Sync Control</h3>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void onRunEiaSync()}
              disabled={externalDataSyncing}
            >
              {externalDataSyncing ? 'Running Sync...' : 'Run EIA Sync'}
            </button>
          </div>
          <p>Trigger the seeded EIA benchmark refresh and inspect recent ingestion runs directly from the admin workspace.</p>

          <div className="admin-sync-status-grid">
            <article className="admin-card">
              <AdminCardTitle
                label="Latest Run"
                tooltip="Shows the most recent EIA ingestion attempt and whether it completed successfully."
              />
              <p>{latestEiaRun ? `${latestEiaRun.status} across ${latestEiaRun.series_count} series` : 'No EIA sync has been recorded yet.'}</p>
              <span>{latestEiaRun ? formatDate(latestEiaRun.finished_at ?? latestEiaRun.started_at) : 'Awaiting first sync'}</span>
            </article>
            <article className="admin-card">
              <AdminCardTitle
                label="Rows Written"
                tooltip="Observation count written by the most recent EIA ingestion run."
              />
              <p>{latestEiaRun ? `${latestEiaRun.observation_count} observations written in the latest run.` : 'No observations loaded yet.'}</p>
              <span>{latestEiaRun ? `Requested by ${latestEiaRun.requested_by ?? 'system'}` : 'No operator recorded'}</span>
            </article>
          </div>

          {externalDataError ? <div className="feedback-banner feedback-banner-error">{externalDataError}</div> : null}
          {externalDataSuccess ? <div className="feedback-banner feedback-banner-success">{externalDataSuccess}</div> : null}

          <div className="admin-run-list">
            {externalDataRuns.length === 0 ? (
              <div className="detail-row">
                <span>No sync history loaded.</span>
              </div>
            ) : (
              externalDataRuns.map((run) => (
                <article key={run.id} className="admin-run-row">
                  <div>
                    <strong>{run.provider} run #{run.id}</strong>
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
