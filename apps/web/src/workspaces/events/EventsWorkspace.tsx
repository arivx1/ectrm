import { useState } from 'react'

import { combineTextFilters } from '../../shared/filtering'
import type { EventRow } from '../../shared/models'
import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  ALL_EVENT_TYPES,
  DEFAULT_VISIBLE_EVENT_COUNT,
  buildEventTriageRecommendation,
  buildEventTypeOptions,
  filterEventRows,
  formatEventScopeLabel,
  isTradeLinkedEvent,
  type EventTriageWorkspace,
} from './eventHelpers'

type EventTradeLinkAction = {
  tradeId: string
  eventType: string | null
}

type EventsWorkspaceProps = {
  authSession: StoredAuthSession | null
  eventFilter: string
  eventsLoadedCount: number
  globalFilter: string
  selectedTradeId: string | null
  setEventFilter: (value: string) => void
  filteredEvents: EventRow[]
  formatDate: (value: string | null | undefined) => string
  onOpenOperations: (action: EventTradeLinkAction) => void
  onOpenSettlement: (action: EventTradeLinkAction) => void
  onOpenTrade: (action: EventTradeLinkAction) => void
}

export function EventsWorkspace({
  authSession,
  eventFilter,
  eventsLoadedCount,
  globalFilter,
  selectedTradeId,
  setEventFilter,
  filteredEvents,
  formatDate,
  onOpenOperations,
  onOpenSettlement,
  onOpenTrade,
}: EventsWorkspaceProps) {
  const [workspaceMode, setWorkspaceMode] = useState<'triage' | 'browse'>('triage')
  const [eventTypeFilter, setEventTypeFilter] = useState(ALL_EVENT_TYPES)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllEvents, setShowAllEvents] = useState(false)
  const effectiveSearchQuery = combineTextFilters(globalFilter, searchQuery)
  const hasGlobalFilter = globalFilter.trim().length > 0

  const triageModeActive = workspaceMode === 'triage'
  const normalizedScopeFilter = eventFilter === 'SELECTED' ? 'SELECTED' : 'ALL'
  const sourceEvents = triageModeActive ? filteredEvents.filter(isTradeLinkedEvent) : filteredEvents
  const eventTypeOptions = buildEventTypeOptions(sourceEvents)
  const normalizedEventTypeFilter = eventTypeOptions.some((option) => option.value === eventTypeFilter)
    ? eventTypeFilter
    : ALL_EVENT_TYPES
  const matchingEvents = filterEventRows(sourceEvents, {
    eventTypeFilter: normalizedEventTypeFilter,
    searchQuery: effectiveSearchQuery,
  })
  const latestEvent = matchingEvents[0] ?? null
  const latestTradeEvent = matchingEvents.find(isTradeLinkedEvent) ?? null
  const tradeLinkedEventCount = matchingEvents.filter(isTradeLinkedEvent).length
  const triageRecommendation = latestTradeEvent ? buildEventTriageRecommendation(latestTradeEvent) : null
  const currentScopeLabel = formatEventScopeLabel(normalizedScopeFilter, selectedTradeId)
  const actorCount = new Set(matchingEvents.map((event) => event.actor_id ?? 'system')).size
  const visibleEvents = showAllEvents ? matchingEvents : matchingEvents.slice(0, DEFAULT_VISIBLE_EVENT_COUNT)
  const hiddenEventCount = Math.max(matchingEvents.length - visibleEvents.length, 0)
  const hasActiveRefinement =
    normalizedScopeFilter !== 'ALL' ||
    normalizedEventTypeFilter !== ALL_EVENT_TYPES ||
    effectiveSearchQuery.trim().length > 0
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

  function handleWorkspaceModeChange(nextMode: 'triage' | 'browse') {
    setWorkspaceMode(nextMode)
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

  function buildEventTradeLinkAction(
    event: Pick<EventRow, 'aggregate_id' | 'event_type'>,
  ): EventTradeLinkAction {
    return {
      tradeId: event.aggregate_id,
      eventType: event.event_type,
    }
  }

  function openTradeById(tradeId: string) {
    onOpenTrade({
      tradeId,
      eventType: null,
    })
  }

  function openTriageWorkspace(
    workspace: EventTriageWorkspace,
    event: Pick<EventRow, 'aggregate_id' | 'event_type'>,
  ) {
    const action = buildEventTradeLinkAction(event)

    switch (workspace) {
      case 'operations':
        onOpenOperations(action)
        return
      case 'settlement':
        onOpenSettlement(action)
        return
      case 'trades':
        onOpenTrade(action)
        return
    }
  }

  function triageActionLabel(workspace: EventTriageWorkspace) {
    switch (workspace) {
      case 'operations':
        return 'Open Work Queue'
      case 'settlement':
        return 'Open Settlement'
      case 'trades':
        return 'Open Trade'
    }
  }

  return (
    <TileLayout
      workspaceId="events"
      workspaceLabel="Events"
      authSession={authSession}
      tiles={[
        {
          id: 'events-summary',
          eyebrow: triageModeActive ? 'Triage' : 'Snapshot',
          title: triageModeActive ? 'Issue Triage Snapshot' : 'Events Loaded',
          description: triageModeActive
            ? 'Start here when the question is what changed and which workspace should own the next action.'
            : 'A count of the recent event records currently loaded into this session for review.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: triageModeActive ? (
            <div className="detail-list">
              <div className="detail-row">
                <span>Issues In View</span>
                <strong>{matchingEvents.length}</strong>
              </div>
              <div className="detail-row">
                <span>Latest Event</span>
                <strong>{latestTradeEvent?.event_type ?? '—'}</strong>
              </div>
              <div className="detail-row">
                <span>Latest Trade</span>
                <strong>{latestTradeEvent?.aggregate_id ?? '—'}</strong>
              </div>
              <div className="detail-row">
                <span>Actors In View</span>
                <strong>{actorCount}</strong>
              </div>
            </div>
          ) : (
            <div className="trading-metric-tile">
              <strong>{eventsLoadedCount}</strong>
              <p>Recent event records available for review.</p>
            </div>
          ),
        },
        {
          id: 'events-controls',
          eyebrow: 'Controls',
          title: triageModeActive ? 'Issue Triage Controls' : 'Stream Filters',
          description: triageModeActive
            ? 'Keep the feed focused on trade-linked issues first, then route into the workspace that should own the next move.'
            : 'Narrow the event stream before expanding the full timeline so the page stays useful under heavier activity.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: (
            <div className="stack">
              <div className="tab-row" role="tablist" aria-label="Event workspace mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={triageModeActive}
                  className={`tab-pill ${triageModeActive ? 'is-active' : ''}`}
                  onClick={() => handleWorkspaceModeChange('triage')}
                >
                  Issue Triage
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!triageModeActive}
                  className={`tab-pill ${!triageModeActive ? 'is-active' : ''}`}
                  onClick={() => handleWorkspaceModeChange('browse')}
                >
                  Browse All
                </button>
              </div>

              <p className="form-note">
                {triageModeActive
                  ? 'Triage mode starts with trade-linked activity and shows the next workspace likely to own the follow-up.'
                  : 'Browse All shows every loaded event, including non-trade records that may matter during broader investigations.'}
              </p>

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
                  <span>{triageModeActive ? 'Triage Source Count' : 'Scope Result Count'}</span>
                  <strong>{sourceEvents.length}</strong>
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
                {hasGlobalFilter ? (
                  <div className="detail-row">
                    <span>Global Filter</span>
                    <strong>{globalFilter.trim()}</strong>
                  </div>
                ) : null}
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

              {hasGlobalFilter ? (
                <p className="form-note">Global nav filter “{globalFilter.trim()}” is also narrowing the event stream.</p>
              ) : null}

              {selectedTradeId ? (
                <div className="stack-actions">
                  <button type="button" className="button button-secondary" onClick={() => openTradeById(selectedTradeId)}>
                    Open Selected Trade
                  </button>
                  {latestTradeEvent && latestTradeEvent.aggregate_id !== selectedTradeId ? (
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => onOpenTrade(buildEventTradeLinkAction(latestTradeEvent))}
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
          id: 'events-next-step',
          eyebrow: 'Next Step',
          title:
            triageRecommendation && latestTradeEvent
              ? `${latestTradeEvent.aggregate_id} · ${latestTradeEvent.event_type}`
              : 'What To Do Next',
          description: 'Use the latest trade-linked event to decide which workspace should own the next action.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: latestTradeEvent && triageRecommendation ? (
            <div className="stack">
              <div className="feedback-banner feedback-banner-success">
                <strong>{triageRecommendation.title}</strong>
                <p className="form-note">{triageRecommendation.detail}</p>
              </div>

              <div className="timeline-recommendation-copy">
                <p>{triageRecommendation.summary}</p>
                <div className="timeline-recommendation-meta">
                  <span className={`status-pill status-pill-${triageRecommendation.severityTone}`}>
                    {triageRecommendation.severityLabel}
                  </span>
                  {triageRecommendation.highlights.map((highlight) => (
                    <span key={highlight} className="entity-chip entity-chip-soft">
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>

              <div className="detail-list">
                <div className="detail-row">
                  <span>Recommendation</span>
                  <strong>{triageRecommendation.badge}</strong>
                </div>
                <div className="detail-row">
                  <span>Trade</span>
                  <strong>{latestTradeEvent.aggregate_id}</strong>
                </div>
                <div className="detail-row">
                  <span>Actor</span>
                  <strong>{latestTradeEvent.actor_id ?? 'system'}</strong>
                </div>
                <div className="detail-row">
                  <span>Recorded</span>
                  <strong>{formatDate(latestTradeEvent.recorded_at)}</strong>
                </div>
              </div>

              <div className="stack-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => openTriageWorkspace(triageRecommendation.workspace, latestTradeEvent)}
                >
                  {triageActionLabel(triageRecommendation.workspace)}
                </button>
                {triageRecommendation.workspace !== 'trades' ? (
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => onOpenTrade(buildEventTradeLinkAction(latestTradeEvent))}
                  >
                    Open Trade
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No issue handoff yet</strong>
              <p>
                {triageModeActive
                  ? 'Trade-linked activity will surface a recommended next workspace here once it is in scope.'
                  : 'Switch to Issue Triage to get a recommended next step from the latest trade-linked event.'}
              </p>
            </div>
          ),
        },
        {
          id: 'events-breakdown',
          eyebrow: triageModeActive ? 'Pattern' : 'Mix',
          title: triageModeActive ? 'Issue Breakdown' : 'Event Breakdown',
          description: triageModeActive
            ? 'See which trade-linked event types are dominating the current issue view.'
            : 'A quick read on which event types and aggregate families dominate the current filter.',
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
                <p>
                  {triageModeActive
                    ? 'Switch to Browse All or create trade-linked activity to bring issue patterns back into view.'
                    : 'Clear the refinements or create trade activity to bring the event mix back into view.'}
                </p>
              </div>
            ),
        },
        {
          id: 'events-stream',
          eyebrow: 'Timeline',
          title: latestEvent ? latestEvent.event_type : triageModeActive ? 'Issue Timeline' : 'Recent Events',
          description:
            matchingEvents.length === 0
              ? triageModeActive
                ? 'Start with the latest trade-linked issues here, then switch to Browse All when you need platform-wide context.'
                : 'Refine the stream with scope, event type, or search terms to inspect a smaller slice.'
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
                    (() => {
                      const tradeLinked = isTradeLinkedEvent(event)
                      const recommendation = tradeLinked ? buildEventTriageRecommendation(event) : null
                      const recommendedWorkspace = recommendation?.workspace ?? 'trades'

                      return (
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
                              {recommendation ? (
                                <span className="entity-chip entity-chip-soft">{recommendation.badge}</span>
                              ) : null}
                            </div>
                            {recommendation ? (
                              <div className="timeline-recommendation-copy">
                                <p>{recommendation.summary}</p>
                                <div className="timeline-recommendation-meta">
                                  <span className={`status-pill status-pill-${recommendation.severityTone}`}>
                                    {recommendation.severityLabel}
                                  </span>
                                  {recommendation.highlights.map((highlight) => (
                                    <span key={highlight} className="entity-chip entity-chip-soft">
                                      {highlight}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <div className="timeline-meta">
                              <span>Actor {event.actor_id ?? 'system'}</span>
                              <span>Schema v{event.schema_version}</span>
                              <span>{event.correlation_id ?? 'No correlation id'}</span>
                            </div>
                            {tradeLinked ? (
                              <div className="workflow-item-button-row">
                                {recommendedWorkspace !== 'trades' ? (
                                  <button
                                    type="button"
                                    className="button button-secondary"
                                    onClick={() => openTriageWorkspace(recommendedWorkspace, event)}
                                  >
                                    {triageActionLabel(recommendedWorkspace)}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={`button ${recommendedWorkspace === 'trades' ? 'button-secondary' : 'button-ghost'} timeline-action-button`}
                                  onClick={() => onOpenTrade(buildEventTradeLinkAction(event))}
                                >
                                  Open Trade
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      )
                    })()
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
                  {matchingEvents.length === 0 && triageModeActive && filteredEvents.length > 0
                    ? 'Switch to Browse All to inspect non-trade events, or clear the filters to bring trade-linked issues back into scope.'
                    : filteredEvents.length > 0
                    ? 'Broaden the scope or clear the search to bring records back into view.'
                    : normalizedScopeFilter === 'SELECTED' && !selectedTradeId
                      ? 'Select a trade to inspect its event history here.'
                      : 'Book, amend, or cancel a trade to build the activity trail here. This is the first screen to open when someone asks what changed.'}
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
