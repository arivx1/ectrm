import { useEffect, useMemo, useState } from 'react'

import {
  loadExternalSeriesDefinitions,
  loadExternalSeriesObservations,
} from '../../entities/market-data/api'
import { appConfig } from '../../shared/config'
import type {
  ExternalSeriesDefinitionRecord,
  ExternalSeriesObservationRecord,
} from '../../shared/models'

type ExternalSeriesTileContentProps = {
  appLoading: boolean
  formatDate: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
}

const EXTERNAL_SERIES_LIMIT = 200
const EXTERNAL_SERIES_HISTORY_LIMIT = 12

function formatCategoryLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function seriesDigits(record: ExternalSeriesDefinitionRecord | ExternalSeriesObservationRecord): number {
  if (record.unit_code === 'PCT' || record.unit_code === 'PROB') {
    return 2
  }
  if (record.unit_code.includes('USD')) {
    return 2
  }
  return 0
}

function formatSeriesValue(
  record: ExternalSeriesDefinitionRecord | ExternalSeriesObservationRecord,
  value: number,
  formatNumber: (value: number | null, digits?: number) => string,
): string {
  return `${formatNumber(value, seriesDigits(record))} / ${record.unit_code}`
}

export function ExternalSeriesTileContent({
  appLoading,
  formatDate,
  formatNumber,
}: ExternalSeriesTileContentProps) {
  const [definitions, setDefinitions] = useState<ExternalSeriesDefinitionRecord[]>([])
  const [definitionsLoading, setDefinitionsLoading] = useState(true)
  const [definitionsError, setDefinitionsError] = useState('')
  const [selectedSeriesCode, setSelectedSeriesCode] = useState<string | null>(null)
  const [providerFilter, setProviderFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [observations, setObservations] = useState<ExternalSeriesObservationRecord[]>([])
  const [observationsLoading, setObservationsLoading] = useState(false)
  const [observationsError, setObservationsError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setDefinitionsLoading(true)
      setDefinitionsError('')
      try {
        const payload = await loadExternalSeriesDefinitions(appConfig.apiBase, {
          limit: EXTERNAL_SERIES_LIMIT,
        })
        if (!cancelled) {
          setDefinitions(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setDefinitions([])
          setDefinitionsError(
            nextError instanceof Error ? nextError.message : 'Could not load external series definitions.',
          )
        }
      } finally {
        if (!cancelled) {
          setDefinitionsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const providers = useMemo(
    () => [...new Set(definitions.map((definition) => definition.provider))].sort(),
    [definitions],
  )
  const categories = useMemo(
    () => [...new Set(definitions.map((definition) => definition.category))].sort(),
    [definitions],
  )

  const filteredDefinitions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return definitions.filter((definition) => {
      if (providerFilter && definition.provider !== providerFilter) {
        return false
      }
      if (categoryFilter && definition.category !== categoryFilter) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        definition.code,
        definition.name,
        definition.series_id,
        definition.provider,
        definition.category,
        definition.dataset_code ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [categoryFilter, definitions, providerFilter, searchQuery])

  useEffect(() => {
    if (filteredDefinitions.length === 0) {
      setSelectedSeriesCode(null)
      return
    }

    if (!selectedSeriesCode || !filteredDefinitions.some((definition) => definition.code === selectedSeriesCode)) {
      setSelectedSeriesCode(filteredDefinitions[0].code)
    }
  }, [filteredDefinitions, selectedSeriesCode])

  const selectedDefinition =
    filteredDefinitions.find((definition) => definition.code === selectedSeriesCode) ??
    filteredDefinitions[0] ??
    null
  const latestObservation = observations[0] ?? null

  useEffect(() => {
    if (!selectedDefinition) {
      setObservations([])
      setObservationsError('')
      return
    }

    let cancelled = false

    async function loadHistory() {
      setObservationsLoading(true)
      setObservationsError('')
      try {
        const payload = await loadExternalSeriesObservations(
          appConfig.apiBase,
          selectedDefinition.code,
          EXTERNAL_SERIES_HISTORY_LIMIT,
        )
        if (!cancelled) {
          setObservations(payload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setObservations([])
          setObservationsError(
            nextError instanceof Error ? nextError.message : 'Could not load external series history.',
          )
        }
      } finally {
        if (!cancelled) {
          setObservationsLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [selectedDefinition])

  if (appLoading || definitionsLoading) {
    return (
      <div className="skeleton-stack">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    )
  }

  if (definitionsError) {
    return (
      <div className="empty-state">
        <strong>External series unavailable</strong>
        <p>{definitionsError}</p>
      </div>
    )
  }

  if (definitions.length === 0) {
    return (
      <div className="empty-state">
        <strong>No external series catalog</strong>
        <p>Seed or sync external series definitions to explore the underlying market-data catalog.</p>
      </div>
    )
  }

  return (
    <div className="external-series-panel">
      <div className="dashboard-report-grid">
        <article className="dashboard-report-card">
          <span>Catalog</span>
          <strong>{definitions.length}</strong>
          <p>External series definitions currently registered across providers and categories.</p>
        </article>
        <article className="dashboard-report-card">
          <span>Providers</span>
          <strong>{providers.length}</strong>
          <p>{providers.join(' · ') || 'No providers loaded'}</p>
        </article>
        <article className="dashboard-report-card">
          <span>Categories</span>
          <strong>{categories.length}</strong>
          <p>{categories.map((category) => formatCategoryLabel(category)).join(' · ') || 'No categories loaded'}</p>
        </article>
        <article className="dashboard-report-card">
          <span>Selected Latest</span>
          <strong>
            {latestObservation && selectedDefinition
              ? formatSeriesValue(selectedDefinition, latestObservation.value, formatNumber)
              : '—'}
          </strong>
          <p>
            {latestObservation
              ? `${latestObservation.observation_date} • downloaded ${formatDate(latestObservation.downloaded_at)}`
              : 'Select a series to inspect its latest stored observation.'}
          </p>
        </article>
      </div>

      <div className="external-series-layout">
        <article className="market-context-section">
          <div className="market-context-section-head">
            <div>
              <span className="eyebrow">Catalog</span>
              <strong>{filteredDefinitions.length} series in view</strong>
            </div>
            <p>Filter the raw market-data catalog by provider, category, or series metadata.</p>
          </div>

          <div className="external-series-filter-grid">
            <label className="field">
              <span>Provider</span>
              <select
                className="control control-compact"
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value)}
              >
                <option value="">All providers</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <select
                className="control control-compact"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {formatCategoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-wide">
              <span>Search</span>
              <input
                className="control control-compact"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Series code, name, provider, dataset, or source series id"
              />
            </label>
          </div>

          {filteredDefinitions.length > 0 ? (
            <div className="external-series-list">
              {filteredDefinitions.slice(0, 24).map((definition) => {
                const isSelected = selectedDefinition?.code === definition.code

                return (
                  <button
                    key={definition.code}
                    type="button"
                    className={`external-series-row ${isSelected ? 'is-active' : ''}`.trim()}
                    onClick={() => setSelectedSeriesCode(definition.code)}
                    aria-pressed={isSelected}
                  >
                    <div className="external-series-row-copy">
                      <strong>{definition.name}</strong>
                      <span>
                        {definition.code} • {definition.provider} • {formatCategoryLabel(definition.category)}
                      </span>
                    </div>
                    <div className="external-series-row-meta">
                      <span className="entity-chip entity-chip-soft">{definition.frequency}</span>
                      <span className="entity-chip entity-chip-soft">{definition.unit_code}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No series match the current filters</strong>
              <p>Clear one of the filters or widen the search to return to the full catalog.</p>
            </div>
          )}
        </article>

        <article className="market-context-section">
          <div className="market-context-section-head">
            <div>
              <span className="eyebrow">History</span>
              <strong>{selectedDefinition ? selectedDefinition.code : 'No series selected'}</strong>
            </div>
            <p>
              {selectedDefinition
                ? selectedDefinition.description ?? 'Inspect the latest stored observations for the selected external series.'
                : 'Select a series from the catalog to inspect its history.'}
            </p>
          </div>

          {selectedDefinition ? (
            <>
              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{selectedDefinition.provider}</span>
                <span className="entity-chip entity-chip-soft">{formatCategoryLabel(selectedDefinition.category)}</span>
                <span className="entity-chip entity-chip-soft">{selectedDefinition.series_id}</span>
                <span className="entity-chip entity-chip-soft">
                  {selectedDefinition.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {observationsError ? <p className="field-error">{observationsError}</p> : null}

              {observationsLoading ? (
                <div className="skeleton-stack">
                  <div className="skeleton-block" />
                  <div className="skeleton-block" />
                </div>
              ) : observations.length > 0 ? (
                <div className="detail-list">
                  {observations.map((observation) => (
                    <article key={observation.id} className="detail-row external-series-observation-row">
                      <div className="external-series-observation-copy">
                        <strong>{formatSeriesValue(selectedDefinition, observation.value, formatNumber)}</strong>
                        <span>
                          {observation.observation_date}
                          {observation.source_revision ? ` • rev ${observation.source_revision}` : ''}
                        </span>
                      </div>
                      <div className="external-series-observation-meta">
                        <span>Published {formatDate(observation.source_published_at)}</span>
                        <span>Downloaded {formatDate(observation.downloaded_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No stored observations</strong>
                  <p>This series is defined, but no observation history is currently stored.</p>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <strong>No series selected</strong>
              <p>Choose a catalog row on the left to inspect its stored observations.</p>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
