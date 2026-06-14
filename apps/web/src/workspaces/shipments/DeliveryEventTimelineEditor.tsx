import { useEffect, useState } from 'react'

import type { CreateDeliveryEventInput } from '../../entities/shipments/api'
import type {
  DeliveryEventRecord,
  DeliveryEventType,
  DeliveryExecutionStatus,
  DeliveryRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { describeTruckCheckpointTimelineEvent } from './deliveryTruckWorkflowHelpers'

type DeliveryEventTimelineEditorProps = {
  authSession: StoredAuthSession | null
  delivery: DeliveryRecord
  saveError: string
  savingDeliveryId: string | null
  formatDate: (value: string | null | undefined) => string
  onCreateEvent: (deliveryId: string, payload: CreateDeliveryEventInput) => Promise<void>
}

type DeliveryEventDraft = {
  eventType: DeliveryEventType
  occurredAt: string
  locationCode: string
  referenceCode: string
  source: string
  notes: string
}

const EVENT_TYPE_OPTIONS: DeliveryEventType[] = [
  'PLAN_CAPTURED',
  'SCHEDULE_COMMITTED',
  'EXECUTION_STARTED',
  'CHECKPOINT_RECORDED',
  'DELIVERY_COMPLETED',
  'HOLD_APPLIED',
  'HOLD_RELEASED',
  'CANCELLED',
]

function formatEnumLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatLocalDateTimeInput(value: string | null): string {
  const fallbackDate = value ? new Date(value) : new Date()
  if (Number.isNaN(fallbackDate.getTime())) {
    return ''
  }

  const year = fallbackDate.getFullYear()
  const month = String(fallbackDate.getMonth() + 1).padStart(2, '0')
  const day = String(fallbackDate.getDate()).padStart(2, '0')
  const hours = String(fallbackDate.getHours()).padStart(2, '0')
  const minutes = String(fallbackDate.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function defaultEventTypeForDelivery(delivery: DeliveryRecord): DeliveryEventType {
  switch (delivery.execution_status) {
    case 'SCHEDULED':
      return 'SCHEDULE_COMMITTED'
    case 'IN_PROGRESS':
      return 'CHECKPOINT_RECORDED'
    case 'COMPLETED':
      return 'DELIVERY_COMPLETED'
    case 'ON_HOLD':
      return 'HOLD_APPLIED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'PLAN_CAPTURED'
  }
}

function buildDraft(delivery: DeliveryRecord): DeliveryEventDraft {
  return {
    eventType: defaultEventTypeForDelivery(delivery),
    occurredAt: formatLocalDateTimeInput(new Date().toISOString()),
    locationCode: delivery.location_code ?? '',
    referenceCode: '',
    source: '',
    notes: '',
  }
}

function normalizedNullableText(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function buildPayload(draft: DeliveryEventDraft): CreateDeliveryEventInput | null {
  const occurredAt = new Date(draft.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) {
    return null
  }

  return {
    event_type: draft.eventType,
    occurred_at: occurredAt.toISOString(),
    location_code: normalizedNullableText(draft.locationCode),
    reference_code: normalizedNullableText(draft.referenceCode),
    source: normalizedNullableText(draft.source),
    notes: normalizedNullableText(draft.notes),
  }
}

function resumeStatusForDelivery(delivery: DeliveryRecord): DeliveryExecutionStatus {
  const priorEvent = delivery.delivery_events.find((event) => event.execution_status !== 'ON_HOLD')
  if (priorEvent && priorEvent.execution_status !== 'CANCELLED') {
    return priorEvent.execution_status
  }
  if (delivery.execution_status !== 'ON_HOLD' && delivery.execution_status !== 'CANCELLED') {
    return delivery.execution_status
  }
  return 'SCHEDULED'
}

function projectedStatusForEventType(
  eventType: DeliveryEventType,
  delivery: DeliveryRecord,
): DeliveryExecutionStatus {
  switch (eventType) {
    case 'PLAN_CAPTURED':
      return 'PLANNED'
    case 'SCHEDULE_COMMITTED':
      return 'SCHEDULED'
    case 'EXECUTION_STARTED':
    case 'CHECKPOINT_RECORDED':
      return 'IN_PROGRESS'
    case 'DELIVERY_COMPLETED':
      return 'COMPLETED'
    case 'HOLD_APPLIED':
      return 'ON_HOLD'
    case 'HOLD_RELEASED':
      return resumeStatusForDelivery(delivery)
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'PLANNED'
  }

  return 'PLANNED'
}

function executionStatusTone(status: DeliveryExecutionStatus): 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped' {
  switch (status) {
    case 'COMPLETED':
      return 'shipped'
    case 'ON_HOLD':
    case 'CANCELLED':
      return 'blocked'
    case 'IN_PROGRESS':
      return 'in-progress'
    case 'SCHEDULED':
      return 'active'
    default:
      return 'planned'
  }
}

function payloadMatchesLatestEvent(
  delivery: DeliveryRecord,
  payload: CreateDeliveryEventInput | null,
): boolean {
  if (!payload || delivery.delivery_events.length === 0) {
    return false
  }

  const latestEvent = delivery.delivery_events[0]
  return (
    payload.event_type === latestEvent.event_type &&
    payload.occurred_at === new Date(latestEvent.occurred_at).toISOString() &&
    (payload.location_code ?? null) === latestEvent.location_code &&
    (payload.reference_code ?? null) === latestEvent.reference_code &&
    (payload.source ?? null) === latestEvent.source &&
    (payload.notes ?? null) === latestEvent.notes
  )
}

function eventTitle(delivery: DeliveryRecord, event: DeliveryEventRecord): string {
  return describeTruckCheckpointTimelineEvent(delivery, event)?.title ?? formatEnumLabel(event.event_type)
}

function eventSummary(delivery: DeliveryRecord, event: DeliveryEventRecord): string {
  const truckCheckpoint = describeTruckCheckpointTimelineEvent(delivery, event)
  if (truckCheckpoint) {
    return truckCheckpoint.summary
  }
  const summaryParts = [event.location_code, event.reference_code, event.source].filter(Boolean)
  return summaryParts.length > 0 ? summaryParts.join(' • ') : `Logged by ${event.created_by}`
}

function eventBody(delivery: DeliveryRecord, event: DeliveryEventRecord): string {
  const truckCheckpoint = describeTruckCheckpointTimelineEvent(delivery, event)
  if (truckCheckpoint?.correction_reason) {
    return truckCheckpoint.correction_reason
  }
  return event.notes?.trim() || `Recorded by ${event.created_by}`
}

export function DeliveryEventTimelineEditor({
  authSession,
  delivery,
  saveError,
  savingDeliveryId,
  formatDate,
  onCreateEvent,
}: DeliveryEventTimelineEditorProps) {
  const [draft, setDraft] = useState<DeliveryEventDraft>(() => buildDraft(delivery))

  useEffect(() => {
    setDraft(buildDraft(delivery))
  }, [delivery])

  const payload = buildPayload(draft)
  const mutationPending = savingDeliveryId === delivery.delivery_id
  const saveDisabled = mutationPending || !authSession || payload === null || payloadMatchesLatestEvent(delivery, payload)
  const previewStatus = projectedStatusForEventType(draft.eventType, delivery)

  async function handleSave() {
    if (!payload) {
      return
    }
    await onCreateEvent(delivery.delivery_id, payload)
  }

  return (
    <article className="position-card shipment-card workflow-item-card-compact">
      <div className="shipment-card-head">
        <div className="shipment-card-copy">
          <strong>Execution Timeline</strong>
          <span>Log cross-mode operational milestones like appointments, nominations, dispatch, check-ins, exceptions, and completion.</span>
        </div>
        <span className={`status-pill status-pill-${executionStatusTone(delivery.execution_status)}`}>
          {formatEnumLabel(delivery.execution_status)}
        </span>
      </div>

      {!authSession ? (
        <p className="workflow-editor-note">Sign in to record delivery milestones and drive system-managed execution status.</p>
      ) : null}
      {delivery.execution_status_source === 'MANUAL' ? (
        <p className="workflow-editor-note">
          Manual execution status is active. New events will still be recorded, but the shared execution status will not move until that override is reset.
        </p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}

      <div className="shipment-card-meta">
        <span className="entity-chip entity-chip-soft">Events {delivery.event_count}</span>
        <span className="entity-chip entity-chip-soft">
          Latest {delivery.latest_event_type ? formatEnumLabel(delivery.latest_event_type) : 'None Yet'}
        </span>
        <span className="entity-chip entity-chip-soft">
          Updated {delivery.latest_event_at ? formatDate(delivery.latest_event_at) : 'No Timeline Activity'}
        </span>
      </div>

      <div className="shipment-editor-grid">
        <label className="field">
          <span>Event Type</span>
          <select
            className="control control-compact"
            value={draft.eventType}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                eventType: event.target.value as DeliveryEventType,
              }))
            }
            disabled={mutationPending}
          >
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatEnumLabel(option)}
              </option>
            ))}
          </select>
          <small className="shipment-editor-source">
            This event will move execution to {formatEnumLabel(previewStatus)}.
          </small>
        </label>

        <label className="field">
          <span>Occurred At</span>
          <input
            type="datetime-local"
            className="control control-compact"
            value={draft.occurredAt}
            onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))}
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">Capture the operational timestamp rather than the data-entry time.</small>
        </label>

        <label className="field">
          <span>Location</span>
          <input
            className="control control-compact"
            value={draft.locationCode}
            onChange={(event) => setDraft((current) => ({ ...current, locationCode: event.target.value }))}
            placeholder="Terminal, node, meter, receipt, or delivery point"
            disabled={mutationPending}
          />
        </label>

        <label className="field">
          <span>Reference</span>
          <input
            className="control control-compact"
            value={draft.referenceCode}
            onChange={(event) => setDraft((current) => ({ ...current, referenceCode: event.target.value }))}
            placeholder="Appointment, ticket, e-tag, nomination, or operator ref"
            disabled={mutationPending}
          />
        </label>

        <label className="field">
          <span>Source</span>
          <input
            className="control control-compact"
            value={draft.source}
            onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
            placeholder="Carrier portal, ISO, pipeline, terminal, meter, dispatcher..."
            disabled={mutationPending}
          />
        </label>

        <label className="field field-wide">
          <span>Notes</span>
          <textarea
            className="control control-textarea"
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Capture the specific operational meaning of the milestone for this mode of transport."
            rows={2}
            disabled={mutationPending}
          />
        </label>
      </div>

      <div className="shipment-card-actions workflow-item-actions">
        <span>
          Use notes to capture the mode-specific nuance, while the event type keeps execution status consistent across logistics, pipeline, and power.
        </span>
        <div className="workflow-item-button-row">
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setDraft(buildDraft(delivery))}
            disabled={mutationPending}
          >
            Reset Form
          </button>
          <button type="button" className="button button-secondary" onClick={() => void handleSave()} disabled={saveDisabled}>
            {mutationPending ? 'Saving…' : 'Log Delivery Event'}
          </button>
        </div>
      </div>

      {delivery.delivery_events.length > 0 ? (
        <div className="timeline timeline-large">
          {delivery.delivery_events.map((event) => {
            const truckCheckpoint = describeTruckCheckpointTimelineEvent(delivery, event)
            return (
              <article key={event.event_id} className="timeline-item timeline-item-card">
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div className="timeline-head">
                    <strong>{eventTitle(delivery, event)}</strong>
                    <span>{formatDate(event.occurred_at)}</span>
                  </div>
                  <div className="timeline-summary-row">
                    <span className={`status-pill status-pill-${executionStatusTone(event.execution_status)}`}>
                      {formatEnumLabel(event.execution_status)}
                    </span>
                    {truckCheckpoint?.is_reversed ? (
                      <span className="status-pill status-pill-blocked">Corrected</span>
                    ) : null}
                    {truckCheckpoint?.kind === 'correction' ? (
                      <span className="status-pill status-pill-blocked">Correction</span>
                    ) : null}
                    <span className="timeline-meta">{eventSummary(delivery, event)}</span>
                  </div>
                  <p>{eventBody(delivery, event)}</p>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="workflow-editor-note">No execution milestones have been logged yet for this delivery.</p>
      )}
    </article>
  )
}
