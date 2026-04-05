import { TileLayout } from '../../shared/ui/TileLayout'
import type { StoredAuthSession } from '../../shared/mutation'

type EventRow = {
  event_id: string
  aggregate_type: string
  aggregate_id: string
  event_type: string
  recorded_at: string
  actor_id: string | null
  correlation_id: string | null
  schema_version: number
}

type EventsWorkspaceProps = {
  authSession: StoredAuthSession | null
  eventFilter: string
  setEventFilter: (value: string) => void
  filteredEvents: EventRow[]
  formatDate: (value: string | null | undefined) => string
}

const EVENT_FILTER_LABELS: Record<string, string> = {
  ALL: 'All events',
  SELECTED: 'Selected trade',
  TradeCreated: 'TradeCreated',
  TradeAmended: 'TradeAmended',
  TradeCancelled: 'TradeCancelled',
}

export function EventsWorkspace({
  authSession,
  eventFilter,
  setEventFilter,
  filteredEvents,
  formatDate,
}: EventsWorkspaceProps) {
  const latestEvent = filteredEvents[0] ?? null
  const actorCount = new Set(filteredEvents.map((event) => event.actor_id ?? 'system')).size
  const eventTypeCounts = Object.entries(
    filteredEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.event_type] = (counts[event.event_type] ?? 0) + 1
      return counts
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
  const aggregateTypeCounts = Object.entries(
    filteredEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.aggregate_type] = (counts[event.aggregate_type] ?? 0) + 1
      return counts
    }, {}),
  ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))

  return (
    <TileLayout
      workspaceId="events"
      workspaceLabel="Events"
      authSession={authSession}
      tiles={[
        {
          id: 'events-controls',
          eyebrow: 'Controls',
          title: 'Timeline Scope',
          description: 'Keep the event stream scoped to the whole book or narrow it to a specific lifecycle slice.',
          span: 'half',
          availableSpans: ['full', 'wide', 'half', 'side'],
          content: (
            <div className="stack">
              <label className="field">
                <span>Filter</span>
                <select
                  className="control"
                  value={eventFilter}
                  onChange={(event) => setEventFilter(event.target.value)}
                >
                  <option value="ALL">All events</option>
                  <option value="SELECTED">Selected trade</option>
                  <option value="TradeCreated">TradeCreated</option>
                  <option value="TradeAmended">TradeAmended</option>
                  <option value="TradeCancelled">TradeCancelled</option>
                </select>
              </label>

              <div className="detail-list">
                <div className="detail-row">
                  <span>Visible Events</span>
                  <strong>{filteredEvents.length}</strong>
                </div>
                <div className="detail-row">
                  <span>Current Scope</span>
                  <strong>{EVENT_FILTER_LABELS[eventFilter] ?? eventFilter}</strong>
                </div>
                <div className="detail-row">
                  <span>Latest Event</span>
                  <strong>{latestEvent ? formatDate(latestEvent.recorded_at) : '—'}</strong>
                </div>
                <div className="detail-row">
                  <span>Actors In View</span>
                  <strong>{actorCount}</strong>
                </div>
              </div>
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
            filteredEvents.length > 0 ? (
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
          description: latestEvent
            ? `${latestEvent.aggregate_id} was the most recent event currently visible in the stream.`
            : 'The live operational event stream for the current filter.',
          span: 'full',
          availableSpans: ['full', 'wide', 'half'],
          content:
            filteredEvents.length > 0 ? (
              <div className="timeline timeline-large">
                {filteredEvents.map((event) => (
                  <article key={event.event_id} className="timeline-item timeline-item-card">
                    <div className="timeline-dot" />
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <strong>{event.event_type}</strong>
                        <span>{formatDate(event.recorded_at)}</span>
                      </div>
                      <p>
                        {event.aggregate_id} • {event.aggregate_type}
                      </p>
                      <div className="timeline-meta">
                        <span>Actor {event.actor_id ?? 'system'}</span>
                        <span>Schema v{event.schema_version}</span>
                        <span>{event.correlation_id ?? 'No correlation id'}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No recent events</strong>
                <p>The stream will populate here as trades are created, amended, or cancelled.</p>
              </div>
            ),
        },
      ]}
    />
  )
}
