import { SystemStatusPanel } from './SystemStatusPanel'

type EventRow = {
  event_id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  recorded_at: string
}

type DashboardWorkspaceProps = {
  appLoading: boolean
  positionsByClass: Array<{ commodityClass: string; netVolume: number }>
  events: EventRow[]
  formatCommodityClass: (value: string) => string
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const {
    appLoading,
    positionsByClass,
    events,
    formatCommodityClass,
    formatNumber,
    formatDate,
  } = props

  return (
    <div className="dashboard-grid">
      <SystemStatusPanel />

      <section className="stack">
        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Exposure</span>
              <h3>Position Snapshot</h3>
            </div>
            <p>Class-level overview first, detailed rows later.</p>
          </div>

          {appLoading ? (
            <div className="skeleton-stack">
              <div className="skeleton-block" />
              <div className="skeleton-block" />
            </div>
          ) : positionsByClass.length > 0 ? (
            <div className="position-class-grid">
              {positionsByClass.map((row) => (
                <article key={row.commodityClass} className="position-class-card">
                  <span>{formatCommodityClass(row.commodityClass)}</span>
                  <strong>{formatNumber(row.netVolume, 0)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No open exposure</strong>
              <p>The system is healthy, but there are no active trades contributing exposure yet.</p>
            </div>
          )}
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Activity</span>
              <h3>Recent Timeline</h3>
            </div>
            <p>The latest event flow without leaving the dashboard.</p>
          </div>
          <div className="timeline">
            {events.slice(0, 5).length > 0 ? (
              events.slice(0, 5).map((event) => (
                <article key={event.event_id} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>{event.event_type}</strong>
                      <span>{formatDate(event.recorded_at)}</span>
                    </div>
                    <p>
                      {event.aggregate_id} • {event.aggregate_type}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <strong>No recent events</strong>
                <p>Create or amend a trade to start building the operational timeline.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
