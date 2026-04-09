import { useEffect, useState } from 'react'

import type { SaveDeliveryActualizationInput } from '../../entities/shipments/api'
import type { DeliveryRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type DeliveryActualizationEditorProps = {
  authSession: StoredAuthSession | null
  delivery: DeliveryRecord
  saveError: string
  savingDeliveryId: string | null
  formatDate: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
  onSave: (
    delivery: Pick<DeliveryRecord, 'delivery_id' | 'trade_id' | 'leg_no'>,
    payload: SaveDeliveryActualizationInput,
  ) => Promise<void>
}

type ActualizationDraft = {
  actualQuantity: string
  actualizedAt: string
  source: string
  notes: string
}

function formatLocalDateTimeInput(value: string | null): string {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function buildDraft(delivery: DeliveryRecord): ActualizationDraft {
  return {
    actualQuantity:
      delivery.actualized_quantity !== null && delivery.actualized_quantity !== undefined
        ? String(delivery.actualized_quantity)
        : delivery.volume !== null && delivery.volume !== undefined
          ? String(delivery.volume)
          : '',
    actualizedAt: formatLocalDateTimeInput(delivery.actualized_at),
    source: delivery.actualization_source ?? '',
    notes: delivery.actualization_notes ?? '',
  }
}

function buildPayload(draft: ActualizationDraft): SaveDeliveryActualizationInput | null {
  const quantity = Number(draft.actualQuantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null
  }

  const parsedActualizedAt = draft.actualizedAt ? new Date(draft.actualizedAt) : null
  if (!parsedActualizedAt || Number.isNaN(parsedActualizedAt.getTime())) {
    return null
  }

  return {
    actual_quantity: quantity,
    actualized_at: parsedActualizedAt.toISOString(),
    source: draft.source.trim() || null,
    notes: draft.notes.trim() || null,
  }
}

function payloadMatchesDelivery(delivery: DeliveryRecord, payload: SaveDeliveryActualizationInput | null): boolean {
  if (!payload) {
    return false
  }

  return (
    payload.actual_quantity === delivery.actualized_quantity &&
    payload.actualized_at === (delivery.actualized_at ? new Date(delivery.actualized_at).toISOString() : null) &&
    (payload.source ?? null) === delivery.actualization_source &&
    (payload.notes ?? null) === delivery.actualization_notes
  )
}

function actualizationTone(status: string): 'active' | 'in-progress' {
  return status === 'ACTUALIZED' ? 'active' : 'in-progress'
}

export function DeliveryActualizationEditor({
  authSession,
  delivery,
  saveError,
  savingDeliveryId,
  formatDate,
  formatNumber,
  onSave,
}: DeliveryActualizationEditorProps) {
  const [draft, setDraft] = useState<ActualizationDraft>(() => buildDraft(delivery))

  useEffect(() => {
    setDraft(buildDraft(delivery))
  }, [delivery])

  const payload = buildPayload(draft)
  const saveDisabled =
    savingDeliveryId === delivery.delivery_id ||
    !authSession ||
    payload === null ||
    payloadMatchesDelivery(delivery, payload)

  async function handleSave() {
    if (!payload) {
      return
    }
    await onSave(delivery, payload)
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">Sign in from Settings to record executed quantity and actual delivery timestamps.</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}

      <article className="position-card shipment-card workflow-item-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Execution Actualization</strong>
            <span>
              {delivery.actualized_at
                ? `Last actualized ${formatDate(delivery.actualized_at)}`
                : 'Capture the executed quantity and physical delivery timestamp.'}
            </span>
          </div>
          <span className={`status-pill status-pill-${actualizationTone(delivery.actualization_status)}`}>
            {delivery.actualization_status.replaceAll('_', ' ')}
          </span>
        </div>

        <div className="shipment-card-meta">
          <span className="entity-chip entity-chip-soft">
            Planned {formatNumber(delivery.volume, 2)} {delivery.unit_of_measure ?? ''}
          </span>
          <span className="entity-chip entity-chip-soft">
            Actual {formatNumber(delivery.actualized_quantity, 2)} {delivery.unit_of_measure ?? ''}
          </span>
          <span className="entity-chip entity-chip-soft">
            Variance {formatNumber(delivery.actualization_variance_quantity, 2)} {delivery.unit_of_measure ?? ''}
          </span>
        </div>

        <div className="workflow-item-grid">
          <label className="field">
            <span>Actual Qty</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="control control-compact"
              value={draft.actualQuantity}
              onChange={(event) => setDraft((current) => ({ ...current, actualQuantity: event.target.value }))}
              disabled={savingDeliveryId === delivery.delivery_id}
            />
          </label>
          <label className="field">
            <span>Actualized At</span>
            <input
              type="datetime-local"
              className="control control-compact"
              value={draft.actualizedAt}
              onChange={(event) => setDraft((current) => ({ ...current, actualizedAt: event.target.value }))}
              disabled={savingDeliveryId === delivery.delivery_id}
            />
          </label>
          <label className="field">
            <span>Source</span>
            <input
              className="control control-compact"
              value={draft.source}
              onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
              placeholder="Meter, terminal, pipeline, operator..."
              disabled={savingDeliveryId === delivery.delivery_id}
            />
          </label>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea
              className="control control-textarea"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Capture ticket references, provisional quantities, or execution exceptions."
              rows={1}
              disabled={savingDeliveryId === delivery.delivery_id}
            />
          </label>
        </div>

        <div className="shipment-card-actions workflow-item-actions">
          <span>
            {delivery.actualization_updated_at
              ? `Projection updated ${formatDate(delivery.actualization_updated_at)}`
              : 'No actualization has been recorded yet.'}
          </span>
          <div className="workflow-item-button-row">
            <button
              type="button"
              className="button button-ghost"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  actualQuantity:
                    delivery.volume !== null && delivery.volume !== undefined ? String(delivery.volume) : current.actualQuantity,
                }))
              }
              disabled={savingDeliveryId === delivery.delivery_id || delivery.volume === null}
            >
              Use Planned Qty
            </button>
            <button type="button" className="button button-secondary" onClick={() => void handleSave()} disabled={saveDisabled}>
              {savingDeliveryId === delivery.delivery_id ? 'Saving…' : 'Save Actualization'}
            </button>
          </div>
        </div>
      </article>
    </div>
  )
}
