import { useState } from 'react'

import type { EventRow } from '../../shared/models'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  ALL_EVENT_TYPES,
  DEFAULT_VISIBLE_EVENT_COUNT,
  buildEventTypeOptions,
  filterEventRows,
  formatEventScopeLabel,
  isTradeLinkedEvent,
} from './eventHelpers'

type EventsWorkspaceProps = {
  authSession: StoredAuthSession | null
  eventFilter: string
  eventsLoadedCount: number
  selectedTradeId: string | null
  setEventFilter: (value: string) => void
  filteredEvents: EventRow[]
  formatDate: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
}

export function EventsWorkspace({
  authSession,
  eventFilter,
  eventsLoadedCount,
  selectedTradeId,
  setEventFilter,
  filteredEvents,
  formatDate,
  onOpenTrade,
}: EventsWorkspaceProps) {
  const [eventTypeFilter, setEventTypeFilter] = useState(ALL_EVENT_TYPES)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllEvents, setShowAllEvents] = useState(false)

  const normalizedScopeFilter = eventFilter === 'SELECTED' ? 'SELECTED' : 'ALL'
  const eventTypeOptions = buildEventTypeOptions(filteredEvents)
  const normalizedEventTypeFilter = eventTypeOptions.some((option) => option.value === eventTypeFilter)
    ? eventTypeFilter
    : ALL_EVENT_TYPES
  const matchingEvents = filterEventRows(filteredEvents, {
    eventTypeFilter: normalizedEventTypeFilter,
    searchQuery,
  })
  const latestEvent = matchingEvents[0] ?? null
  const latestTradeEvent = matchingEvents.find(isTradeLinkedEvent) ?? null
  const tradeLinkedEventCount = matchingEvents.filter(isTradeLinkedEvent).length
  const currentScopeLabel = formatEventScopeLabel(normalizedScopeFilter, selectedTradeId)
  const actorCount = new Set(matchingEvents.map((event) => event.actor_id ?? 'system')).size
  const visibleEvents = showAllEvents ? matchingEvents : matchingEvents.slice(0, DEFAULT_VISIBLE_EVENT_COUNT)
  const hiddenEventCount = Math.max(matchingEvents.length - visibleEvents.length, 0)
  const hasActiveRefinement =
    normalizedScopeFilter !== 'ALL' ||
    normalizedEventTypeFilter !== ALL_EVENT_TYPES ||
    searchQuery.trim().length > 0
  const eventTypeSummary =
    normalizedEventTypeFilter === ALL_EVENT_TYPES ? 'All event types' : normalizedEventTypeFilter
  const searchSummary = searchQuery.trim() || '—'
  const eventTypeCounts = Object.entries(
    matchingEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.event_type] = (counts[event.event_type] ?? 0) + 1
      return counts
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
  const aggregateTypeCounts = Object.entries(
    matchingEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.aggregate_type] = (counts[event.aggregate_type] ?? 0) + 1
      return counts
    }, {}),
  ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))

  function handleScopeChange(nextValue: string) {
    setEventFilter(nextValue)
    setShowAllEvents(false)
  }

  function handleEventTypeChange(nextValue: string) {
    setEventTypeFilter(nextValue)
    setShowAllEvents(false)
  }

  function handleSearchChange(nextValue: string) {
    setSearchQuery(nextValue)
    setShowAllEvents(false)
  }

  function handleClearRefinements() {
    setEventFilter('ALL')
    setEventTypeFilter(ALL_EVENT_TYPES)
    setSearchQuery('')
    setShowAllEvents(false)
  }

  return (
    <TileLayout
      workspaceId="events"
      workspaceLabel="Events"
      authSession={authSession}
      tiles={[
        {
          id: 'events-summary',
          eyebrow: 'Snapshot',
          title: 'Events Loaded',
          description: 'A count of the recent event records currently loaded into this session for review.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: (
            <div className="trading-metric-tile">
              <strong>{eventsLoadedCount}</strong>
              <p>Recent event records available for review.</p>
            </div>
          ),
        },
        {
          id: 'events-controls',
          eyebrow: 'Controls',
          title: 'Stream Filters',
          description: 'Narrow the event stream before expanding the full timeline so the page stays useful under heavier activity.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: (
            <div className="stack">
              <div className="events-filter-grid">
                <label className="field events-search-field">
                  <span>Search</span>
                  <input
                    className="control"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Trade ID, actor, event type, event ID, or correlation ID"
                  />
                </label>

                <label className="field">
                  <span>Scope</span>
                  <select
                    className="control"
                    value={normalizedScopeFilter}
                    onChange={(event) => handleScopeChange(event.target.value)}
                  >
                    <option value="ALL">All events</option>
                    <option value="SELECTED">Selected trade</option>
                  </select>
                </label>

                <label className="field">
                  <span>Event Type</span>
                  <select
                    className="control"
                    value={normalizedEventTypeFilter}
                    onChange={(event) => handleEventTypeChange(event.target.value)}
                  >
                    <option value={ALL_EVENT_TYPES}>All event types</option>
                    {eventTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value} ({option.count})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="detail-list">
                <div className="detail-row">
                  <span>Scope Result Count</span>
                  <strong>{filteredEvents.length}</strong>
                </div>
                <div className="detail-row">
                  <span>Matching Events</span>
                  <strong>{matchingEvents.length}</strong>
                </div>
                <div className="detail-row">
                  <span>Timeline Showing</span>
                  <strong>{visibleEvents.length}</strong>
                </div>
                <div className="detail-row">
                  <span>Current Scope</span>
                  <strong>{currentScopeLabel}</strong>
                </div>
                <div className="detail-row">
                  <span>Event Type</span>
                  <strong>{eventTypeSummary}</strong>
                </div>
                <div className="detail-row">
                  <span>Search</span>
                  <strong>{searchSummary}</strong>
                </div>
                <div className="detail-row">
                  <span>Latest Event</span>
                  <strong>{latestEvent ? formatDate(latestEvent.recorded_at) : '—'}</strong>
                </div>
                <div className="detail-row">
                  <span>Actors In View</span>
                  <strong>{actorCount}</strong>
                </div>
                <div className="detail-row">
                  <span>Trade-Linked Events</span>
                  <strong>{tradeLinkedEventCount}</strong>
                </div>
                <div className="detail-row">
                  <span>Selected Trade</span>
                  <strong>{selectedTradeId ?? '—'}</strong>
                </div>
              </div>

              {hasActiveRefinement ? (
                <div className="stack-actions">
                  <button type="button" className="button button-ghost" onClick={handleClearRefinements}>
                    Clear Refinements
                  </button>
                </div>
              ) : null}

              {selectedTradeId ? (
                <div className="stack-actions">
                  <button type="button" className="button button-secondary" onClick={() => onOpenTrade(selectedTradeId)}>
                    Open Selected Trade
                  </button>
                  {latestTradeEvent && latestTradeEvent.aggregate_id !== selectedTradeId ? (
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => onOpenTrade(latestTradeEvent.aggregate_id)}
                    >
                      Open Latest Trade Event
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          id: 'events-breakdown',
          eyebrow: 'Mix',
          title: 'Event Breakdown',
          description: 'A quick read on which event types and aggregate families dominate the current filter.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content:
            matchingEvents.length > 0 ? (
              <div className="stack">
                <div className="detail-list">
                  {eventTypeCounts.map(([eventType, count]) => (
                    <div key={eventType} className="detail-row">
                      <span>{eventType}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
                <div className="detail-list">
                  {aggregateTypeCounts.map(([aggregateType, count]) => (
                    <div key={aggregateType} className="detail-row">
                      <span>{aggregateType}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No events in scope</strong>
                <p>Adjust the filter or create activity in the system to populate the event mix.</p>
              </div>
            ),
        },
        {
          id: 'events-stream',
          eyebrow: 'Timeline',
          title: latestEvent ? latestEvent.event_type : 'Recent Events',
          description:
            matchingEvents.length === 0
              ? 'Refine the stream with scope, event type, or search terms to inspect a smaller slice.'
              : hiddenEventCount > 0
                ? `Showing ${visibleEvents.length} of ${matchingEvents.length} matching events. ${latestEvent?.aggregate_id ?? 'The latest record'} is the most recent event currently visible in the stream.`
                : `${latestEvent?.aggregate_id ?? 'The latest record'} was the most recent event currently visible in the stream.`,
          span: 'full',
          availableSpans: ['full', 'wide', 'half'],
          content:
            matchingEvents.length > 0 ? (
              <div className="stack">
                {hiddenEventCount > 0 ? (
                  <div className="feedback-banner">
                    <strong>
                      Showing {visibleEvents.length} of {matchingEvents.length} matching events.
                    </strong>
                    <p className="form-note">Refine the stream further or expand the timeline when you need the full result set.</p>
                  </div>
                ) : null}

                <div className="timeline timeline-large">
                  {visibleEvents.map((event) => (
                    <article key={event.event_id} className="timeline-item timeline-item-card">
                      <div className="timeline-dot" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <strong>{event.event_type}</strong>
                          <span>{formatDate(event.recorded_at)}</span>
                        </div>
                        <div className="timeline-summary-row">
                          <p>
                            {event.aggregate_id} • {event.aggregate_type}
                          </p>
                          {isTradeLinkedEvent(event) ? (
                            <button
                              type="button"
                              className="button button-ghost timeline-action-button"
                              onClick={() => onOpenTrade(event.aggregate_id)}
                            >
                              Open Trade
                            </button>
                          ) : null}
                        </div>
                        <div className="timeline-meta">
                          <span>Actor {event.actor_id ?? 'system'}</span>
                          <span>Schema v{event.schema_version}</span>
                          <span>{event.correlation_id ?? 'No correlation id'}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {matchingEvents.length > DEFAULT_VISIBLE_EVENT_COUNT ? (
                  <div className="stack-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setShowAllEvents((current) => !current)}
                    >
                      {showAllEvents
                        ? `Show ${DEFAULT_VISIBLE_EVENT_COUNT} most recent`
                        : `Show all ${matchingEvents.length} matches`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state">
                <strong>{filteredEvents.length > 0 ? 'No events match these filters' : 'No recent events'}</strong>
                <p>
                  {filteredEvents.length > 0
                    ? 'Broaden the scope or clear the search to bring records back into view.'
                    : normalizedScopeFilter === 'SELECTED' && !selectedTradeId
                      ? 'Select a trade to inspect its event history here.'
                      : 'The stream will populate here as trades are created, amended, or cancelled.'}
                </p>
                {filteredEvents.length > 0 && hasActiveRefinement ? (
                  <div className="stack-actions">
                    <button type="button" className="button button-secondary" onClick={handleClearRefinements}>
                      Clear Refinements
                    </button>
                  </div>
                ) : null}
              </div>
            ),
        },
      ]}
    />
  )
}
