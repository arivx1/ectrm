import { useEffect, useState } from 'react'

import type {
  CancelDeliveryTruckMovementInput,
  CancelDeliveryTruckStopInput,
  CreateDeliveryEventInput,
  DeliveryTruckMovementCreateInput,
  DeliveryTruckStopCreateInput,
  RecordDeliveryTruckStopCheckpointInput,
  ReverseDeliveryTruckStopCheckpointInput,
  SkipDeliveryTruckStopInput,
  UpdateDeliveryInput,
  UpdateDeliveryLogisticsDetailInput,
  UpdateDeliveryPipelineDetailInput,
  UpdateDeliveryPowerDetailInput,
  UpdateDeliveryTruckDetailInput,
  UpdateDeliveryVesselDetailInput,
  UpdateDeliveryTruckMovementInput,
  UpdateDeliveryTruckStopInput,
} from '../../entities/shipments/api'
import type {
  DeliveryExecutionStatus,
  DeliveryFieldSource,
  DeliveryRecord,
  ReferenceRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildTransportModeSelectOptions,
  formatTransportModeLabel,
  resolveAllowedTransportModesForDelivery,
} from '../../shared/transportModes'
import { DeliveryEventTimelineEditor } from './DeliveryEventTimelineEditor'
import { DeliveryModeDetailEditor } from './DeliveryModeDetailEditor'
import { DeliveryTruckWorkflowEditor } from './DeliveryTruckWorkflowEditor'
import { DeliveryVesselTrackingEditor } from './DeliveryVesselTrackingEditor'
import {
  buildSharedDeliveryResetOptions,
  normalizedNullableText,
  type SharedDeliveryResetField,
} from './deliveryModeDetailHelpers'

type DeliveryDetailEditorProps = {
  authSession: StoredAuthSession | null
  commodities: ReferenceRecord[]
  delivery: DeliveryRecord
  saveError: string
  savingDeliveryId: string | null
  formatDate: (value: string | null | undefined) => string
  onOpenTrade: (tradeId: string) => void
  onSaveShared: (deliveryId: string, payload: UpdateDeliveryInput) => Promise<void>
  onSaveLogisticsDetails: (
    deliveryId: string,
    payload: UpdateDeliveryLogisticsDetailInput,
  ) => Promise<void>
  onSavePipelineDetails: (
    deliveryId: string,
    payload: UpdateDeliveryPipelineDetailInput,
  ) => Promise<void>
  onSavePowerDetails: (deliveryId: string, payload: UpdateDeliveryPowerDetailInput) => Promise<void>
  onSaveTruckDetails: (deliveryId: string, payload: UpdateDeliveryTruckDetailInput) => Promise<void>
  onSaveVesselDetails: (deliveryId: string, payload: UpdateDeliveryVesselDetailInput) => Promise<void>
  onCreateTruckMovement: (
    deliveryId: string,
    payload: DeliveryTruckMovementCreateInput,
  ) => Promise<void>
  onSaveTruckMovement: (
    deliveryId: string,
    movementId: string,
    payload: UpdateDeliveryTruckMovementInput,
  ) => Promise<void>
  onCancelTruckMovement: (
    deliveryId: string,
    movementId: string,
    payload: CancelDeliveryTruckMovementInput,
  ) => Promise<void>
  onCreateTruckStop: (
    deliveryId: string,
    movementId: string,
    payload: DeliveryTruckStopCreateInput,
  ) => Promise<void>
  onSaveTruckStop: (
    deliveryId: string,
    stopId: string,
    payload: UpdateDeliveryTruckStopInput,
  ) => Promise<void>
  onSkipTruckStop: (
    deliveryId: string,
    stopId: string,
    payload: SkipDeliveryTruckStopInput,
  ) => Promise<void>
  onCancelTruckStop: (
    deliveryId: string,
    stopId: string,
    payload: CancelDeliveryTruckStopInput,
  ) => Promise<void>
  onRecordTruckStopCheckpoint: (
    deliveryId: string,
    stopId: string,
    payload: RecordDeliveryTruckStopCheckpointInput,
  ) => Promise<string | null>
  onReverseTruckStopCheckpoint: (
    deliveryId: string,
    stopId: string,
    eventId: number,
    payload: ReverseDeliveryTruckStopCheckpointInput,
  ) => Promise<string | null>
  onCreateEvent: (deliveryId: string, payload: CreateDeliveryEventInput) => Promise<void>
}

type DeliveryDetailDraft = {
  transportMode: DeliveryRecord['transport_mode']
  book: string
  portfolio: string
  counterparty: string
  locationCode: string
  deliveryStart: string
  deliveryEnd: string
  executionStatus: DeliveryExecutionStatus
  operationsOwner: string
  externalReference: string
  opsNotes: string
}

const EXECUTION_STATUS_OPTIONS: DeliveryExecutionStatus[] = [
  'PLANNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
]

function buildDraft(delivery: DeliveryRecord): DeliveryDetailDraft {
  return {
    transportMode: delivery.transport_mode,
    book: delivery.book,
    portfolio: delivery.portfolio ?? '',
    counterparty: delivery.counterparty ?? '',
    locationCode: delivery.location_code ?? '',
    deliveryStart: delivery.delivery_start ?? '',
    deliveryEnd: delivery.delivery_end ?? '',
    executionStatus: delivery.execution_status,
    operationsOwner: delivery.operations_owner ?? '',
    externalReference: delivery.external_reference ?? '',
    opsNotes: delivery.ops_notes ?? '',
  }
}

function formatEnumLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatFieldSourceLabel(source: DeliveryFieldSource): string {
  switch (source) {
    case 'TRADE_DERIVED':
      return 'Trade Derived'
    case 'SYSTEM_GENERATED':
      return 'System Generated'
    default:
      return 'Manual'
  }
}

function modeFamilyForTransportMode(
  transportMode: DeliveryRecord['transport_mode'],
): DeliveryRecord['mode_family'] {
  switch (transportMode) {
    case 'PIPELINE':
      return 'NETWORK_FLOW'
    case 'POWER_GRID':
      return 'POWER_SCHEDULE'
    default:
      return 'LOGISTICS'
  }
}

function buildPayload(
  delivery: DeliveryRecord,
  draft: DeliveryDetailDraft,
): { payload: UpdateDeliveryInput; hasChanges: boolean; validationMessage: string | null } {
  const payload: UpdateDeliveryInput = {}
  const normalizedBook = draft.book.trim()
  const normalizedPortfolio = normalizedNullableText(draft.portfolio)
  const normalizedCounterparty = normalizedNullableText(draft.counterparty)
  const normalizedLocationCode = normalizedNullableText(draft.locationCode)
  const normalizedOperationsOwner = normalizedNullableText(draft.operationsOwner)
  const normalizedExternalReference = normalizedNullableText(draft.externalReference)
  const normalizedOpsNotes = normalizedNullableText(draft.opsNotes)
  const nextDeliveryStart = draft.deliveryStart || null
  const nextDeliveryEnd = draft.deliveryEnd || null

  if (normalizedBook.length === 0) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'Book is required for the persisted delivery control record.',
    }
  }

  if (nextDeliveryStart && nextDeliveryEnd && nextDeliveryStart > nextDeliveryEnd) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'Delivery start must be on or before delivery end.',
    }
  }

  if (draft.transportMode !== delivery.transport_mode) {
    payload.transport_mode = draft.transportMode
  }
  if (normalizedBook !== delivery.book) {
    payload.book = normalizedBook
  }
  if (normalizedPortfolio !== delivery.portfolio) {
    payload.portfolio = normalizedPortfolio
  }
  if (normalizedCounterparty !== delivery.counterparty) {
    payload.counterparty = normalizedCounterparty
  }
  if (normalizedLocationCode !== delivery.location_code) {
    payload.location_code = normalizedLocationCode
  }
  if (nextDeliveryStart !== delivery.delivery_start) {
    payload.delivery_start = nextDeliveryStart
  }
  if (nextDeliveryEnd !== delivery.delivery_end) {
    payload.delivery_end = nextDeliveryEnd
  }
  if (draft.executionStatus !== delivery.execution_status) {
    payload.execution_status = draft.executionStatus
  }
  if (normalizedOperationsOwner !== delivery.operations_owner) {
    payload.operations_owner = normalizedOperationsOwner
  }
  if (normalizedExternalReference !== delivery.external_reference) {
    payload.external_reference = normalizedExternalReference
  }
  if (normalizedOpsNotes !== delivery.ops_notes) {
    payload.ops_notes = normalizedOpsNotes
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
    validationMessage: null,
  }
}

function sharedResetSourceTone(
  source: DeliveryFieldSource | DeliveryRecord['transport_mode_source'],
): 'active' | 'in-progress' | 'planned' {
  switch (source) {
    case 'MANUAL':
    case 'EXPLICIT':
      return 'active'
    case 'TRADE_DERIVED':
    case 'DERIVED':
      return 'in-progress'
    default:
      return 'planned'
  }
}

export function DeliveryDetailEditor({
  authSession,
  commodities,
  delivery,
  saveError,
  savingDeliveryId,
  formatDate,
  onOpenTrade,
  onSaveShared,
  onSaveLogisticsDetails,
  onSavePipelineDetails,
  onSavePowerDetails,
  onSaveTruckDetails,
  onSaveVesselDetails,
  onCreateTruckMovement,
  onSaveTruckMovement,
  onCancelTruckMovement,
  onCreateTruckStop,
  onSaveTruckStop,
  onSkipTruckStop,
  onCancelTruckStop,
  onRecordTruckStopCheckpoint,
  onReverseTruckStopCheckpoint,
  onCreateEvent,
}: DeliveryDetailEditorProps) {
  const [draft, setDraft] = useState<DeliveryDetailDraft>(() => buildDraft(delivery))

  useEffect(() => {
    setDraft(buildDraft(delivery))
  }, [delivery])

  const { payload, hasChanges, validationMessage } = buildPayload(delivery, draft)
  const resetOptions = buildSharedDeliveryResetOptions(delivery)
  const mutationPending = savingDeliveryId === delivery.delivery_id
  const saveDisabled = mutationPending || !authSession || !hasChanges || validationMessage !== null
  const resetDisabled = mutationPending || !authSession || resetOptions.length === 0
  const pendingModeFamily = modeFamilyForTransportMode(draft.transportMode)
  const modeSectionNeedsRefresh = pendingModeFamily !== delivery.mode_family
  const allowedTransportModes = resolveAllowedTransportModesForDelivery(delivery, commodities)
  const transportModeOptions = buildTransportModeSelectOptions({
    allowedModes: allowedTransportModes,
    currentMode: draft.transportMode,
  })
  const transportConstraintLoaded = allowedTransportModes.length > 0
  const currentModeAllowed =
    draft.transportMode === 'UNSPECIFIED' || allowedTransportModes.includes(draft.transportMode)

  async function handleSave() {
    if (!hasChanges || validationMessage) {
      return
    }
    await onSaveShared(delivery.delivery_id, payload)
  }

  async function handleResetFields(fields: SharedDeliveryResetField[]) {
    if (fields.length === 0) {
      return
    }
    await onSaveShared(delivery.delivery_id, { reset_fields: fields })
  }

  return (
    <div className="workflow-editor-stack">
      {!authSession ? (
        <p className="workflow-editor-note">Sign in to maintain persisted delivery controls and manual overrides.</p>
      ) : null}
      {saveError ? <p className="field-error workflow-item-save-error">{saveError}</p> : null}
      {validationMessage ? <p className="field-error">{validationMessage}</p> : null}

      <article className="position-card shipment-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Delivery Control Record</strong>
            <span>
              {delivery.commodity} • {delivery.trade_id}
              {delivery.leg_no === null ? '' : ` · leg ${delivery.leg_no}`}
            </span>
          </div>
          <span className={`status-pill status-pill-${delivery.status === 'BLOCKED' ? 'blocked' : 'active'}`}>
            {delivery.status.replaceAll('_', ' ')}
          </span>
        </div>

        <div className="shipment-card-meta">
          <span className="entity-chip entity-chip-soft">
            Readiness {delivery.status.replaceAll('_', ' ')}
          </span>
          <span className="entity-chip entity-chip-soft">
            Execution {formatEnumLabel(delivery.execution_status)}
          </span>
          <span className="entity-chip entity-chip-soft">
            Mode {formatEnumLabel(delivery.transport_mode)}
          </span>
          <span className="entity-chip entity-chip-soft">
            Updated {formatDate(delivery.last_updated_at)}
          </span>
        </div>

        <div className="shipment-editor-grid">
          <label className="field">
            <span>Transport Mode</span>
            <select
              className="control control-compact"
              value={draft.transportMode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  transportMode: event.target.value as DeliveryRecord['transport_mode'],
                }))
              }
              disabled={mutationPending}
            >
              {transportModeOptions.map((option) => (
                <option key={option} value={option}>
                  {formatTransportModeLabel(option)}
                </option>
              ))}
            </select>
            <small className="shipment-editor-source">
              Source {formatEnumLabel(delivery.transport_mode_source)}
            </small>
            <small className={`shipment-editor-source ${transportConstraintLoaded && !currentModeAllowed ? 'field-error' : ''}`}>
              {transportConstraintLoaded
                ? `Allowed for ${delivery.commodity}: ${allowedTransportModes.map(formatTransportModeLabel).join(', ')}`
                : 'No commodity transport rule is loaded for this product yet.'}
            </small>
          </label>

          <label className="field">
            <span>Execution Status</span>
            <select
              className="control control-compact"
              value={draft.executionStatus}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  executionStatus: event.target.value as DeliveryExecutionStatus,
                }))
              }
              disabled={mutationPending}
            >
              {EXECUTION_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatEnumLabel(option)}
                </option>
              ))}
            </select>
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.execution_status_source)}
            </small>
          </label>

          <label className="field">
            <span>Book</span>
            <input
              className="control control-compact"
              value={draft.book}
              onChange={(event) => setDraft((current) => ({ ...current, book: event.target.value }))}
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">Source {formatFieldSourceLabel(delivery.book_source)}</small>
          </label>

          <label className="field">
            <span>Portfolio</span>
            <input
              className="control control-compact"
              value={draft.portfolio}
              onChange={(event) => setDraft((current) => ({ ...current, portfolio: event.target.value }))}
              placeholder="Optional"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">Source {formatFieldSourceLabel(delivery.portfolio_source)}</small>
          </label>

          <label className="field">
            <span>Counterparty</span>
            <input
              className="control control-compact"
              value={draft.counterparty}
              onChange={(event) => setDraft((current) => ({ ...current, counterparty: event.target.value }))}
              placeholder="Optional"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.counterparty_source)}
            </small>
          </label>

          <label className="field">
            <span>Location</span>
            <input
              className="control control-compact"
              value={draft.locationCode}
              onChange={(event) => setDraft((current) => ({ ...current, locationCode: event.target.value }))}
              placeholder="Optional"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">Source {formatFieldSourceLabel(delivery.location_source)}</small>
          </label>

          <label className="field">
            <span>Delivery Start</span>
            <input
              type="date"
              className="control control-compact"
              value={draft.deliveryStart}
              onChange={(event) => setDraft((current) => ({ ...current, deliveryStart: event.target.value }))}
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.delivery_window_source)}
            </small>
          </label>

          <label className="field">
            <span>Delivery End</span>
            <input
              type="date"
              className="control control-compact"
              value={draft.deliveryEnd}
              onChange={(event) => setDraft((current) => ({ ...current, deliveryEnd: event.target.value }))}
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.delivery_window_source)}
            </small>
          </label>

          <label className="field">
            <span>Operations Owner</span>
            <input
              className="control control-compact"
              value={draft.operationsOwner}
              onChange={(event) => setDraft((current) => ({ ...current, operationsOwner: event.target.value }))}
              placeholder="Optional"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.operations_owner_source)}
            </small>
          </label>

          <label className="field">
            <span>External Ref</span>
            <input
              className="control control-compact"
              value={draft.externalReference}
              onChange={(event) => setDraft((current) => ({ ...current, externalReference: event.target.value }))}
              placeholder="Appointment, ticket, or operator reference"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.external_reference_source)}
            </small>
          </label>

          <label className="field field-wide">
            <span>Ops Notes</span>
            <textarea
              className="control control-textarea"
              value={draft.opsNotes}
              onChange={(event) => setDraft((current) => ({ ...current, opsNotes: event.target.value }))}
              placeholder="Capture execution notes, handoffs, exceptions, or operational context."
              rows={2}
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">Source {formatFieldSourceLabel(delivery.ops_notes_source)}</small>
          </label>
        </div>

        {resetOptions.length > 0 ? (
          <div className="shipment-reset-section">
            <div className="shipment-card-copy">
              <strong>Manual Overrides</strong>
              <span>Reset a single field back to trade-derived or system-managed control.</span>
            </div>
              <div className="shipment-reset-list">
              {resetOptions.map((option) => (
                  <button
                    key={option.field}
                    type="button"
                    className="button button-ghost shipment-reset-chip"
                    onClick={() => void handleResetFields([option.field])}
                    disabled={resetDisabled}
                  >
                    <span className={`status-pill status-pill-${sharedResetSourceTone(option.source)}`}>{option.label}</span>
                    <span>Reset</span>
                  </button>
              ))}
            </div>
            <div className="shipment-card-actions">
              <span>{resetOptions.length} manual field{resetOptions.length === 1 ? '' : 's'} currently override the trade feed.</span>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void handleResetFields(resetOptions.map((option) => option.field))}
                disabled={resetDisabled}
              >
                {mutationPending ? 'Resetting…' : 'Reset All Manual Fields'}
              </button>
            </div>
          </div>
        ) : (
          <p className="workflow-editor-note">No shared delivery fields are manually overridden yet.</p>
        )}

        <div className="shipment-card-actions workflow-item-actions">
          <span>
            Window {delivery.delivery_start ?? 'TBD'} to {delivery.delivery_end ?? 'TBD'} • Counterparty{' '}
            {delivery.counterparty ?? 'TBD'}
          </span>
          <div className="workflow-item-button-row">
            <button type="button" className="button button-ghost" onClick={() => onOpenTrade(delivery.trade_id)}>
              Open Trade
            </button>
            <button type="button" className="button button-secondary" onClick={() => void handleSave()} disabled={saveDisabled}>
              {mutationPending ? 'Saving…' : 'Save Delivery Controls'}
            </button>
          </div>
        </div>
      </article>

      {modeSectionNeedsRefresh ? (
        <article className="position-card shipment-card workflow-item-card-compact">
          <div className="shipment-card-head">
            <div className="shipment-card-copy">
              <strong>Mode-Specific Details Pending</strong>
              <span>
                Save the shared delivery controls first to switch this record from{' '}
                {formatEnumLabel(delivery.mode_family)} to {formatEnumLabel(pendingModeFamily)} detail editing.
              </span>
            </div>
          </div>
          <p className="workflow-editor-note">
            Once the transport mode change is saved, this panel will swap to the right logistics, pipeline, or power
            detail form for the persisted delivery family.
          </p>
        </article>
      ) : (
        <DeliveryModeDetailEditor
          authSession={authSession}
          delivery={delivery}
          savingDeliveryId={savingDeliveryId}
          onSaveLogisticsDetails={onSaveLogisticsDetails}
          onSavePipelineDetails={onSavePipelineDetails}
          onSavePowerDetails={onSavePowerDetails}
        />
      )}

      {delivery.transport_mode === 'TRUCK' ? (
        <DeliveryTruckWorkflowEditor
          authSession={authSession}
          delivery={delivery}
          savingDeliveryId={savingDeliveryId}
          formatDate={formatDate}
          onSaveTruckDetails={onSaveTruckDetails}
          onCreateTruckMovement={onCreateTruckMovement}
          onSaveTruckMovement={onSaveTruckMovement}
          onCancelTruckMovement={onCancelTruckMovement}
          onCreateTruckStop={onCreateTruckStop}
          onSaveTruckStop={onSaveTruckStop}
          onSkipTruckStop={onSkipTruckStop}
          onCancelTruckStop={onCancelTruckStop}
          onRecordTruckStopCheckpoint={onRecordTruckStopCheckpoint}
          onReverseTruckStopCheckpoint={onReverseTruckStopCheckpoint}
        />
      ) : null}

      {delivery.transport_mode === 'VESSEL' ? (
        <DeliveryVesselTrackingEditor
          authSession={authSession}
          delivery={delivery}
          savingDeliveryId={savingDeliveryId}
          formatDate={formatDate}
          onSaveVesselDetails={onSaveVesselDetails}
        />
      ) : null}

      <DeliveryEventTimelineEditor
        authSession={authSession}
        delivery={delivery}
        saveError={saveError}
        savingDeliveryId={savingDeliveryId}
        formatDate={formatDate}
        onCreateEvent={onCreateEvent}
      />
    </div>
  )
}
