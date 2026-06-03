import type { DocumentRecordCreationWorkItemRecord } from '../../shared/models'

type DocumentRecordCreationQueuePanelProps = {
  requests: DocumentRecordCreationWorkItemRecord[]
  emptyTitle: string
  emptyDetail: string
  formatDate: (value: string | null | undefined) => string
  onOpenLibrary?: (() => void) | null
}

function formatToken(value: string): string {
  return value.replaceAll('_', ' ')
}

function priorityTone(priority: string): 'blocked' | 'in-progress' | 'active' {
  if (priority === 'BLOCKED') {
    return 'blocked'
  }
  if (priority === 'HIGH') {
    return 'in-progress'
  }
  return 'active'
}

function fieldPreview(fields: Record<string, unknown>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .slice(0, 4)
    .map(([key, value]) => `${formatToken(key)} ${String(value)}`)
}

export function DocumentRecordCreationQueuePanel({
  requests,
  emptyTitle,
  emptyDetail,
  formatDate,
  onOpenLibrary,
}: DocumentRecordCreationQueuePanelProps) {
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <strong>{emptyTitle}</strong>
        <p>{emptyDetail}</p>
      </div>
    )
  }

  return (
    <div className="position-list">
      {requests.slice(0, 8).map((request) => {
        const previewFields = fieldPreview(request.captured_fields)
        return (
          <article key={request.request_id} className="position-card shipment-card">
            <div className="shipment-card-head">
              <div className="shipment-card-copy">
                <strong>{request.title}</strong>
                <span>
                  {request.document_id} • {request.document_kind ? formatToken(request.document_kind) : 'Document'}
                </span>
              </div>
              <span className={`status-pill status-pill-${priorityTone(request.priority)}`}>
                {formatToken(request.priority)}
              </span>
            </div>
            <div className="shipment-card-meta">
              <span className="entity-chip entity-chip-soft">{request.routing_label}</span>
              <span className="entity-chip entity-chip-soft">{formatToken(request.target_record_type)}</span>
              <span className="entity-chip entity-chip-soft">{formatToken(request.handoff_type)}</span>
              {request.age_days > 0 ? (
                <span className="entity-chip entity-chip-soft">{request.age_days}d old</span>
              ) : null}
            </div>
            <div className="shipment-card-copy">
              <p>{request.description}</p>
              {request.blocking_reasons.length > 0 ? (
                <p>{request.blocking_reasons.join(' • ')}</p>
              ) : request.next_steps.length > 0 ? (
                <p>{request.next_steps.join(' • ')}</p>
              ) : null}
            </div>
            {previewFields.length > 0 || request.missing_evidence.length > 0 ? (
              <div className="shipment-card-meta">
                {previewFields.map((field) => (
                  <span key={field} className="entity-chip entity-chip-soft">
                    {field}
                  </span>
                ))}
                {request.missing_evidence.slice(0, 3).map((evidence) => (
                  <span key={evidence} className="entity-chip entity-chip-soft">
                    Missing {formatToken(evidence)}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="shipment-card-actions">
              <span>Requested {formatDate(request.requested_at)}</span>
              {onOpenLibrary ? (
                <button type="button" className="button button-ghost" onClick={onOpenLibrary}>
                  Open Library
                </button>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}
