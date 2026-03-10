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
  eventFilter: string
  setEventFilter: (value: string) => void
  filteredEvents: EventRow[]
  formatDate: (value: string | null | undefined) => string
}

export function EventsWorkspace({ eventFilter, setEventFilter, filteredEvents, formatDate }: EventsWorkspaceProps) {
  return (
    <section className="surface">
      <div className="section-head section-head-control">
        <div>
          <span className="eyebrow">Timeline</span>
          <h3>Recent Events</h3>
        </div>
        <div className="toolbar">
          <select className="control control-compact" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
            <option value="ALL">All events</option>
            <option value="SELECTED">Selected trade</option>
            <option value="TradeCreated">TradeCreated</option>
            <option value="TradeAmended">TradeAmended</option>
            <option value="TradeCancelled">TradeCancelled</option>
          </select>
        </div>
      </div>

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
    </section>
  )
}
