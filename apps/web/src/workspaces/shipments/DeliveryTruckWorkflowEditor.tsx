import { useEffect, useState } from 'react'

import {
  getDeliveryTruckMovement,
  listDeliveryTruckMovements,
  type CancelDeliveryTruckMovementInput,
  type CancelDeliveryTruckStopInput,
  type DeliveryTruckMovementCreateInput,
  type DeliveryTruckStopCreateInput,
  type RecordDeliveryTruckStopCheckpointInput,
  type ReverseDeliveryTruckStopCheckpointInput,
  type SkipDeliveryTruckStopInput,
  type UpdateDeliveryTruckDetailInput,
  type UpdateDeliveryTruckMovementInput,
  type UpdateDeliveryTruckStopInput,
} from '../../entities/shipments/api'
import { appConfig } from '../../shared/config'
import type {
  DeliveryRecord,
  DeliveryTruckMovementRecord,
  DeliveryTruckMovementSummaryRecord,
  DeliveryTruckStopRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildDefaultMovementCreateStops,
  activeTruckCheckpointEventsForStop,
  buildTruckCheckpointDraft,
  buildTruckCheckpointPayload,
  buildTruckCheckpointReversePayload,
  buildTruckDetailDraft,
  buildTruckDetailPayload,
  buildTruckMovementCreatePayload,
  buildTruckMovementDraft,
  buildTruckMovementUpdatePayload,
  buildTruckStopCreatePayload,
  buildTruckStopDraft,
  buildTruckStopUpdatePayload,
  formatEnumLabel,
  formatTruckCheckpointLabel,
  checkpointOptionsForStop,
  latestActiveTruckCheckpointEvent,
  TRUCK_MOVEMENT_STATUS_OPTIONS,
  TRUCK_STOP_STATUS_OPTIONS,
  TRUCK_STOP_TYPE_OPTIONS,
  type TruckCheckpointDraft,
  type TruckDetailDraft,
  type TruckMovementDraft,
  type TruckStopDraft,
} from './deliveryTruckWorkflowHelpers'

type DeliveryTruckWorkflowEditorProps = {
  authSession: StoredAuthSession | null
  delivery: DeliveryRecord
  savingDeliveryId: string | null
  formatDate: (value: string | null | undefined) => string
  onSaveTruckDetails: (deliveryId: string, payload: UpdateDeliveryTruckDetailInput) => Promise<void>
  onCreateTruckMovement: (deliveryId: string, payload: DeliveryTruckMovementCreateInput) => Promise<void>
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
  ) => Promise<void>
  onReverseTruckStopCheckpoint: (
    deliveryId: string,
    stopId: string,
    eventId: number,
    payload: ReverseDeliveryTruckStopCheckpointInput,
  ) => Promise<void>
}

function movementTone(status: DeliveryTruckMovementSummaryRecord['status']): 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped' {
  switch (status) {
    case 'ON_HOLD':
    case 'CANCELLED':
      return 'blocked'
    case 'COMPLETED':
      return 'shipped'
    case 'AT_STOP':
    case 'EN_ROUTE_TO_STOP':
    case 'IN_TRANSIT':
      return 'in-progress'
    case 'ASSIGNED':
      return 'active'
    default:
      return 'planned'
  }
}

function stopTone(status: DeliveryTruckStopRecord['status']): 'active' | 'blocked' | 'in-progress' | 'planned' | 'shipped' {
  switch (status) {
    case 'ARRIVED':
    case 'WORKING':
    case 'EN_ROUTE':
      return 'in-progress'
    case 'DEPARTED':
      return 'shipped'
    case 'SKIPPED':
    case 'CANCELLED':
      return 'blocked'
    default:
      return 'planned'
  }
}

function formatMovementWindow(movement: DeliveryTruckMovementSummaryRecord): string {
  if (movement.current_eta_at_destination) {
    return `ETA ${movement.current_eta_at_destination}`
  }
  if (movement.last_signal_at) {
    return `Last signal ${movement.last_signal_at}`
  }
  return 'No live signal yet'
}

function stopLocationSummary(stop: DeliveryTruckStopRecord): string {
  const parts = [stop.location_code, stop.appointment_reference].filter(Boolean)
  return parts.length > 0 ? parts.join(' • ') : 'Location and appointment not captured'
}

function emptyWaypointDraft(): TruckStopDraft {
  return {
    ...buildTruckStopDraft(),
    stopType: 'WAYPOINT',
    status: 'PLANNED',
  }
}

export function DeliveryTruckWorkflowEditor({
  authSession,
  delivery,
  savingDeliveryId,
  formatDate,
  onSaveTruckDetails,
  onCreateTruckMovement,
  onSaveTruckMovement,
  onCancelTruckMovement,
  onCreateTruckStop,
  onSaveTruckStop,
  onSkipTruckStop,
  onCancelTruckStop,
  onRecordTruckStopCheckpoint,
  onReverseTruckStopCheckpoint,
}: DeliveryTruckWorkflowEditorProps) {
  const mutationPending = savingDeliveryId === delivery.delivery_id
  const [truckDetailDraft, setTruckDetailDraft] = useState<TruckDetailDraft>(() => buildTruckDetailDraft(delivery))
  const [createMovementDraft, setCreateMovementDraft] = useState<TruckMovementDraft>(() =>
    buildTruckMovementDraft(delivery, null),
  )
  const [createMovementStops, setCreateMovementStops] = useState<TruckStopDraft[]>(() =>
    buildDefaultMovementCreateStops(),
  )
  const [movementSummaries, setMovementSummaries] = useState<DeliveryTruckMovementSummaryRecord[]>([])
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null)
  const [selectedMovement, setSelectedMovement] = useState<DeliveryTruckMovementRecord | null>(null)
  const [selectedMovementDraft, setSelectedMovementDraft] = useState<TruckMovementDraft>(() =>
    buildTruckMovementDraft(delivery, null),
  )
  const [stopDraftsById, setStopDraftsById] = useState<Record<string, TruckStopDraft>>({})
  const [checkpointDraftsByStopId, setCheckpointDraftsByStopId] = useState<Record<string, TruckCheckpointDraft>>({})
  const [newStopDraft, setNewStopDraft] = useState<TruckStopDraft>(() => emptyWaypointDraft())
  const [movementListLoading, setMovementListLoading] = useState(false)
  const [movementDetailLoading, setMovementDetailLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState('')

  useEffect(() => {
    setTruckDetailDraft(buildTruckDetailDraft(delivery))
    setCreateMovementDraft(buildTruckMovementDraft(delivery, null))
    setCreateMovementStops(buildDefaultMovementCreateStops())
    setNewStopDraft(emptyWaypointDraft())
  }, [delivery])

  useEffect(() => {
    setSelectedMovementId(null)
    setSelectedMovement(null)
    setSelectedMovementDraft(buildTruckMovementDraft(delivery, null))
    setStopDraftsById({})
    setCheckpointDraftsByStopId({})
    setWorkflowError('')
  }, [delivery])

  useEffect(() => {
    if (delivery.transport_mode !== 'TRUCK') {
      setMovementSummaries([])
      return
    }
    if (!authSession) {
      setMovementSummaries([])
      return
    }

    let cancelled = false
    async function loadMovementSummaries() {
      setMovementListLoading(true)
      try {
        const rows = await listDeliveryTruckMovements(appConfig.apiBase, delivery.delivery_id)
        if (cancelled) {
          return
        }
        setMovementSummaries(rows)
        setSelectedMovementId((current) =>
          current && rows.some((row) => row.movement_id === current) ? current : (rows[0]?.movement_id ?? null),
        )
      } catch (nextError) {
        if (!cancelled) {
          setWorkflowError(
            nextError instanceof Error ? nextError.message : 'Failed to load truck runs for this delivery.',
          )
        }
      } finally {
        if (!cancelled) {
          setMovementListLoading(false)
        }
      }
    }

    void loadMovementSummaries()
    return () => {
      cancelled = true
    }
  }, [
    authSession,
    delivery.delivery_id,
    delivery.last_updated_at,
    delivery.transport_mode,
    delivery.truck_movement_count,
    delivery.active_truck_movement_count,
  ])

  useEffect(() => {
    if (delivery.transport_mode !== 'TRUCK' || !authSession || !selectedMovementId) {
      setSelectedMovement(null)
      setSelectedMovementDraft(buildTruckMovementDraft(delivery, null))
      setStopDraftsById({})
      setCheckpointDraftsByStopId({})
      return
    }

    const movementId = selectedMovementId
    let cancelled = false
    async function loadMovementDetail() {
      setMovementDetailLoading(true)
      try {
        const movement = await getDeliveryTruckMovement(appConfig.apiBase, movementId)
        if (cancelled) {
          return
        }
        setSelectedMovement(movement)
        setSelectedMovementDraft(buildTruckMovementDraft(delivery, movement))
        setStopDraftsById(
          Object.fromEntries(movement.stops.map((stop) => [stop.stop_id, buildTruckStopDraft(stop)])),
        )
        setCheckpointDraftsByStopId((current) =>
          Object.fromEntries(
            movement.stops.map((stop) => [stop.stop_id, buildTruckCheckpointDraft(stop, current[stop.stop_id])]),
          ),
        )
      } catch (nextError) {
        if (!cancelled) {
          setWorkflowError(
            nextError instanceof Error ? nextError.message : 'Failed to load the selected truck run.',
          )
        }
      } finally {
        if (!cancelled) {
          setMovementDetailLoading(false)
        }
      }
    }

    void loadMovementDetail()
    return () => {
      cancelled = true
    }
  }, [authSession, delivery, selectedMovementId])

  async function handleSaveTruckDetail() {
    const { payload, hasChanges, validationMessage } = buildTruckDetailPayload(delivery, truckDetailDraft)
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    if (!hasChanges) {
      setWorkflowError('No truck default changes are pending.')
      return
    }
    setWorkflowError('')
    await onSaveTruckDetails(delivery.delivery_id, payload)
  }

  async function handleCreateMovement() {
    const { payload, validationMessage } = buildTruckMovementCreatePayload(
      delivery,
      createMovementDraft,
      createMovementStops,
    )
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    setWorkflowError('')
    await onCreateTruckMovement(delivery.delivery_id, payload)
    setCreateMovementDraft(buildTruckMovementDraft(delivery, null))
    setCreateMovementStops(buildDefaultMovementCreateStops())
  }

  async function handleSaveSelectedMovement() {
    if (!selectedMovement) {
      return
    }
    const { payload, hasChanges, validationMessage } = buildTruckMovementUpdatePayload(
      selectedMovement,
      selectedMovementDraft,
    )
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    if (!hasChanges) {
      setWorkflowError('No truck run changes are pending.')
      return
    }
    setWorkflowError('')
    await onSaveTruckMovement(delivery.delivery_id, selectedMovement.movement_id, payload)
  }

  async function handleCancelSelectedMovement() {
    if (!selectedMovement) {
      return
    }
    const cancelReason = selectedMovementDraft.statusReason.trim()
    if (!cancelReason) {
      setWorkflowError('Provide a status reason before cancelling the truck run.')
      return
    }
    setWorkflowError('')
    await onCancelTruckMovement(delivery.delivery_id, selectedMovement.movement_id, {
      cancel_reason: cancelReason,
    })
  }

  async function handleSaveStop(stop: DeliveryTruckStopRecord) {
    const draft = stopDraftsById[stop.stop_id]
    if (!draft) {
      return
    }
    const { payload, hasChanges, validationMessage } = buildTruckStopUpdatePayload(stop, draft)
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    if (!hasChanges) {
      setWorkflowError(`No changes are pending for stop ${stop.stop_sequence}.`)
      return
    }
    setWorkflowError('')
    await onSaveTruckStop(delivery.delivery_id, stop.stop_id, payload)
  }

  async function handleSkipStop(stop: DeliveryTruckStopRecord) {
    const draft = stopDraftsById[stop.stop_id]
    const skipReason = draft?.statusReason.trim() ?? ''
    if (!skipReason) {
      setWorkflowError('Provide a status reason before skipping the stop.')
      return
    }
    setWorkflowError('')
    await onSkipTruckStop(delivery.delivery_id, stop.stop_id, {
      skip_reason: skipReason,
    })
  }

  async function handleCancelStop(stop: DeliveryTruckStopRecord) {
    const draft = stopDraftsById[stop.stop_id]
    const cancelReason = draft?.statusReason.trim() ?? ''
    if (!cancelReason) {
      setWorkflowError('Provide a status reason before cancelling the stop.')
      return
    }
    setWorkflowError('')
    await onCancelTruckStop(delivery.delivery_id, stop.stop_id, {
      cancel_reason: cancelReason,
    })
  }

  async function handleAddStopToSelectedMovement() {
    if (!selectedMovement) {
      return
    }
    const { payload, validationMessage } = buildTruckStopCreatePayload(newStopDraft)
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    setWorkflowError('')
    await onCreateTruckStop(delivery.delivery_id, selectedMovement.movement_id, payload)
    setNewStopDraft(emptyWaypointDraft())
  }

  async function handleRecordCheckpoint(stop: DeliveryTruckStopRecord) {
    const draft = checkpointDraftsByStopId[stop.stop_id] ?? buildTruckCheckpointDraft(stop)
    const { payload, validationMessage } = buildTruckCheckpointPayload(stop, draft)
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    setWorkflowError('')
    await onRecordTruckStopCheckpoint(delivery.delivery_id, stop.stop_id, payload)
    setCheckpointDraftsByStopId((current) => ({
      ...current,
      [stop.stop_id]: buildTruckCheckpointDraft(stop, {
        ...draft,
        occurredAt: '',
        notes: '',
      }),
    }))
  }

  async function handleReverseCheckpoint(stop: DeliveryTruckStopRecord, eventId: number) {
    const draft = checkpointDraftsByStopId[stop.stop_id] ?? buildTruckCheckpointDraft(stop)
    const { payload, validationMessage } = buildTruckCheckpointReversePayload(draft)
    if (validationMessage) {
      setWorkflowError(validationMessage)
      return
    }
    setWorkflowError('')
    await onReverseTruckStopCheckpoint(delivery.delivery_id, stop.stop_id, eventId, payload)
    setCheckpointDraftsByStopId((current) => ({
      ...current,
      [stop.stop_id]: {
        ...draft,
        reversalReason: '',
      },
    }))
  }

  return (
    <div className="workflow-editor-stack">
      <article className="position-card shipment-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Truck Dispatch Workflow</strong>
            <span>Set dispatcher-owned defaults and work the ordered truck runs and stops under this delivery.</span>
          </div>
          <span className="entity-chip entity-chip-soft">
            {delivery.active_truck_movement_count ?? 0} active of {delivery.truck_movement_count ?? 0} runs
          </span>
        </div>

        <div className="shipment-card-meta">
          <span className="entity-chip entity-chip-soft">
            Dispatcher {delivery.truck_detail?.dispatcher_owner ?? delivery.operations_owner ?? 'TBD'}
          </span>
          <span className="entity-chip entity-chip-soft">
            Carrier default {delivery.truck_detail?.default_carrier_name ?? delivery.carrier_name ?? 'TBD'}
          </span>
          <span className="entity-chip entity-chip-soft">
            Equipment default {delivery.truck_detail?.equipment_type ?? delivery.equipment_type ?? 'TBD'}
          </span>
        </div>

        {!authSession ? (
          <p className="workflow-editor-note">Sign in to load truck runs and maintain dispatcher-owned defaults.</p>
        ) : null}
        {workflowError ? <p className="field-error workflow-item-save-error">{workflowError}</p> : null}

        <div className="shipment-editor-grid">
          <label className="field">
            <span>Target Runs</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.targetRunCount}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, targetRunCount: event.target.value }))
              }
              placeholder="Optional count"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Dispatcher Owner</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.dispatcherOwner}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, dispatcherOwner: event.target.value }))
              }
              placeholder="Dispatcher or desk"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Tracking Provider</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.trackingProvider}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, trackingProvider: event.target.value }))
              }
              placeholder="Manual, portal, broker, or telematics source"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Tracking Policy</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.trackingPolicy}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, trackingPolicy: event.target.value }))
              }
              placeholder="Review cadence or escalation rule"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Default Carrier</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.defaultCarrierName}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, defaultCarrierName: event.target.value }))
              }
              placeholder="Carrier or hauler"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Default Carrier Ref</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.defaultExternalCarrierReference}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({
                  ...current,
                  defaultExternalCarrierReference: event.target.value,
                }))
              }
              placeholder="Portal or broker carrier reference"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Default Equipment</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.equipmentType}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, equipmentType: event.target.value }))
              }
              placeholder="Tank truck, pneumatic, flatbed"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Origin Geofence</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.originGeofenceCode}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, originGeofenceCode: event.target.value }))
              }
              placeholder="Optional geofence code"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Destination Geofence</span>
            <input
              className="control control-compact"
              value={truckDetailDraft.destinationGeofenceCode}
              onChange={(event) =>
                setTruckDetailDraft((current) => ({ ...current, destinationGeofenceCode: event.target.value }))
              }
              placeholder="Optional geofence code"
              disabled={mutationPending}
            />
          </label>
        </div>

        <div className="shipment-card-actions workflow-item-actions">
          <span>These defaults seed new truck runs without changing the underlying trade or shared logistics shape.</span>
          <div className="workflow-item-button-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleSaveTruckDetail()}
              disabled={mutationPending || !authSession}
            >
              {mutationPending ? 'Saving…' : 'Save Truck Defaults'}
            </button>
          </div>
        </div>
      </article>

      <article className="position-card shipment-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Create Truck Run</strong>
            <span>Start with a dispatcher-owned run, then capture its ordered pickup, waypoint, and dropoff plan.</span>
          </div>
          <span className="entity-chip entity-chip-soft">Wave 0 manual dispatch contract</span>
        </div>

        <div className="shipment-editor-grid">
          <label className="field">
            <span>Run Sequence</span>
            <input
              className="control control-compact"
              value={createMovementDraft.sequenceNo}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, sequenceNo: event.target.value }))
              }
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              className="control control-compact"
              value={createMovementDraft.status}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({
                  ...current,
                  status: event.target.value as TruckMovementDraft['status'],
                }))
              }
              disabled={mutationPending}
            >
              {TRUCK_MOVEMENT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {formatEnumLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Planned Quantity</span>
            <input
              className="control control-compact"
              value={createMovementDraft.plannedQuantity}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, plannedQuantity: event.target.value }))
              }
              placeholder={delivery.volume == null ? 'Optional' : `Delivery default ${delivery.volume}`}
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Unit</span>
            <input
              className="control control-compact"
              value={createMovementDraft.plannedUnitOfMeasure}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, plannedUnitOfMeasure: event.target.value }))
              }
              placeholder="BBL, GAL, TON"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Carrier</span>
            <input
              className="control control-compact"
              value={createMovementDraft.carrierName}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, carrierName: event.target.value }))
              }
              placeholder="Carrier or hauler"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Carrier Ref</span>
            <input
              className="control control-compact"
              value={createMovementDraft.externalCarrierReference}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({
                  ...current,
                  externalCarrierReference: event.target.value,
                }))
              }
              placeholder="Broker or portal load id"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Dispatcher</span>
            <input
              className="control control-compact"
              value={createMovementDraft.dispatcherOwner}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, dispatcherOwner: event.target.value }))
              }
              placeholder="Desk owner"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Driver</span>
            <input
              className="control control-compact"
              value={createMovementDraft.driverName}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, driverName: event.target.value }))
              }
              placeholder="Optional"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Driver Phone</span>
            <input
              className="control control-compact"
              value={createMovementDraft.driverPhone}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, driverPhone: event.target.value }))
              }
              placeholder="Optional"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Tractor Ref</span>
            <input
              className="control control-compact"
              value={createMovementDraft.tractorReference}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, tractorReference: event.target.value }))
              }
              placeholder="Truck or tractor id"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Trailer Ref</span>
            <input
              className="control control-compact"
              value={createMovementDraft.trailerReference}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, trailerReference: event.target.value }))
              }
              placeholder="Trailer id"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Load Ref</span>
            <input
              className="control control-compact"
              value={createMovementDraft.externalLoadReference}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, externalLoadReference: event.target.value }))
              }
              placeholder="External load reference"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>BOL</span>
            <input
              className="control control-compact"
              value={createMovementDraft.billOfLadingNumber}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, billOfLadingNumber: event.target.value }))
              }
              placeholder="Bill of lading"
              disabled={mutationPending}
            />
          </label>
          <label className="field">
            <span>Truck Ticket</span>
            <input
              className="control control-compact"
              value={createMovementDraft.truckTicketNumber}
              onChange={(event) =>
                setCreateMovementDraft((current) => ({ ...current, truckTicketNumber: event.target.value }))
              }
              placeholder="Scale or ticket number"
              disabled={mutationPending}
            />
          </label>
          <label className="field field-wide">
            <span>{createMovementDraft.status === 'ON_HOLD' ? 'Hold Reason' : 'Status Reason'}</span>
            <textarea
              className="control control-textarea"
              value={createMovementDraft.status === 'ON_HOLD' ? createMovementDraft.holdReasonCode : createMovementDraft.statusReason}
              onChange={(event) =>
                setCreateMovementDraft((current) =>
                  current.status === 'ON_HOLD'
                    ? { ...current, holdReasonCode: event.target.value }
                    : { ...current, statusReason: event.target.value },
                )
              }
              placeholder={
                createMovementDraft.status === 'ON_HOLD'
                  ? 'Required when the run starts on hold.'
                  : 'Optional run-level context.'
              }
              rows={2}
              disabled={mutationPending}
            />
          </label>
        </div>

        <div className="shipment-reset-section">
          <div className="shipment-card-copy">
            <strong>Planned Stops</strong>
            <span>The first stop should stay a pickup and the last stop should stay a dropoff for Wave 0 truck runs.</span>
          </div>
          <div className="position-list">
            {createMovementStops.map((stopDraft, index) => (
              <article key={`new-stop-${index}`} className="position-card shipment-card workflow-item-card-compact">
                <div className="shipment-card-head">
                  <div className="shipment-card-copy">
                    <strong>Stop {index + 1}</strong>
                    <span>{stopDraft.stopType === 'PICKUP' ? 'Origin' : stopDraft.stopType === 'DROPOFF' ? 'Destination' : 'Intermediate waypoint'}</span>
                  </div>
                  <span className={`status-pill status-pill-${stopTone(stopDraft.status)}`}>{formatEnumLabel(stopDraft.status)}</span>
                </div>
                <div className="shipment-editor-grid">
                  <label className="field">
                    <span>Stop Type</span>
                    <select
                      className="control control-compact"
                      value={stopDraft.stopType}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, stopType: event.target.value as TruckStopDraft['stopType'] } : row,
                          ),
                        )
                      }
                      disabled={mutationPending}
                    >
                      {TRUCK_STOP_TYPE_OPTIONS.map((stopType) => (
                        <option key={stopType} value={stopType}>
                          {formatEnumLabel(stopType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input
                      className="control control-compact"
                      value={stopDraft.locationCode}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, locationCode: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Terminal or site code"
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Arrival Start</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={stopDraft.plannedArrivalStart}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, plannedArrivalStart: event.target.value } : row,
                          ),
                        )
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Arrival End</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={stopDraft.plannedArrivalEnd}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, plannedArrivalEnd: event.target.value } : row,
                          ),
                        )
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Departure Start</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={stopDraft.plannedDepartureStart}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, plannedDepartureStart: event.target.value } : row,
                          ),
                        )
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Departure End</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={stopDraft.plannedDepartureEnd}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, plannedDepartureEnd: event.target.value } : row,
                          ),
                        )
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Appointment Ref</span>
                    <input
                      className="control control-compact"
                      value={stopDraft.appointmentReference}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, appointmentReference: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Optional appointment id"
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Planned Quantity</span>
                    <input
                      className="control control-compact"
                      value={stopDraft.plannedQuantity}
                      onChange={(event) =>
                        setCreateMovementStops((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, plannedQuantity: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Optional"
                      disabled={mutationPending}
                    />
                  </label>
                </div>
                <div className="shipment-card-actions">
                  <span>Sequence is assigned automatically when the run is created.</span>
                  {createMovementStops.length > 2 ? (
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() =>
                        setCreateMovementStops((current) => current.filter((_, rowIndex) => rowIndex !== index))
                      }
                      disabled={mutationPending}
                    >
                      Remove Stop
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <div className="shipment-card-actions">
            <span>Add waypoint or extra load/unload planning before the dispatcher commits the run.</span>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setCreateMovementStops((current) => [...current, emptyWaypointDraft()])}
              disabled={mutationPending}
            >
              Add Planned Stop
            </button>
          </div>
        </div>

        <div className="shipment-card-actions workflow-item-actions">
          <span>Use the delivery-level defaults above as the seed, then override only what is run-specific.</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void handleCreateMovement()}
            disabled={mutationPending || !authSession}
          >
            {mutationPending ? 'Saving…' : 'Create Truck Run'}
          </button>
        </div>
      </article>

      <article className="position-card shipment-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Truck Run Queue</strong>
            <span>Pick a run to update dispatcher metadata, hold/cancel it, or maintain its ordered stops.</span>
          </div>
          <span className="entity-chip entity-chip-soft">
            {movementListLoading ? 'Loading…' : `${movementSummaries.length} run${movementSummaries.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {movementSummaries.length > 0 ? (
          <div className="position-list">
            {movementSummaries.map((movement) => {
              const isSelected = movement.movement_id === selectedMovementId
              const latestCheckpoint = latestActiveTruckCheckpointEvent(delivery, {
                movementId: movement.movement_id,
              })
              return (
                <article
                  key={movement.movement_id}
                  className={`position-card shipment-card workflow-item-card-compact ${isSelected ? 'shipment-card-selected' : ''}`}
                >
                  <div className="shipment-card-head">
                    <div className="shipment-card-copy">
                      <strong>Run {movement.sequence_no}</strong>
                      <span>
                        {movement.carrier_name ?? 'Carrier TBD'} • Stop {movement.current_stop_sequence ?? 'TBD'}
                      </span>
                    </div>
                    <span className={`status-pill status-pill-${movementTone(movement.status)}`}>
                      {formatEnumLabel(movement.status)}
                    </span>
                  </div>
                  <div className="shipment-card-meta">
                    <span className="entity-chip entity-chip-soft">
                      {movement.stop_count} stops / {movement.active_stop_count} active
                    </span>
                    <span className="entity-chip entity-chip-soft">
                      {movement.dispatcher_owner ?? 'Dispatcher TBD'}
                    </span>
                    <span className="entity-chip entity-chip-soft">
                      {movement.current_location_code ?? 'Location TBD'}
                    </span>
                    {latestCheckpoint ? (
                      <span className="entity-chip entity-chip-soft">
                        {formatTruckCheckpointLabel(latestCheckpoint.checkpoint_code)} {formatDate(latestCheckpoint.occurred_at)}
                      </span>
                    ) : null}
                  </div>
                  <div className="shipment-card-actions">
                    <span>{formatMovementWindow(movement)}</span>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => setSelectedMovementId(movement.movement_id)}
                      disabled={mutationPending}
                    >
                      {isSelected ? 'Selected' : 'Open Run'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No truck runs yet</strong>
            <p>Create the first run above to start tracking the stop-by-stop dispatch workflow for this delivery.</p>
          </div>
        )}

        {selectedMovement ? (
          <div className="workflow-editor-stack">
            {(() => {
              const latestCheckpoint = latestActiveTruckCheckpointEvent(delivery, {
                movementId: selectedMovement.movement_id,
              })
              return latestCheckpoint ? (
                <p className="workflow-editor-note">
                  Latest truck checkpoint: {formatTruckCheckpointLabel(latestCheckpoint.checkpoint_code)} at{' '}
                  {formatDate(latestCheckpoint.occurred_at)}.
                </p>
              ) : null
            })()}
            <article className="position-card shipment-card workflow-item-card-compact">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>Selected Run {selectedMovement.sequence_no}</strong>
                  <span>Maintain dispatcher metadata separately from the delivery-level defaults.</span>
                </div>
                <span className={`status-pill status-pill-${movementTone(selectedMovement.status)}`}>
                  {formatEnumLabel(selectedMovement.status)}
                </span>
              </div>
              {movementDetailLoading ? <p className="workflow-editor-note">Refreshing truck run detail…</p> : null}
              <div className="shipment-editor-grid">
                <label className="field">
                  <span>Run Sequence</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.sequenceNo}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({ ...current, sequenceNo: event.target.value }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    className="control control-compact"
                    value={selectedMovementDraft.status}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        status: event.target.value as TruckMovementDraft['status'],
                      }))
                    }
                    disabled={mutationPending}
                  >
                    {TRUCK_MOVEMENT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatEnumLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Planned Quantity</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.plannedQuantity}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({ ...current, plannedQuantity: event.target.value }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Unit</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.plannedUnitOfMeasure}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        plannedUnitOfMeasure: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Carrier</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.carrierName}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({ ...current, carrierName: event.target.value }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Carrier Ref</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.externalCarrierReference}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        externalCarrierReference: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Dispatcher</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.dispatcherOwner}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        dispatcherOwner: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Driver</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.driverName}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({ ...current, driverName: event.target.value }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Driver Phone</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.driverPhone}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({ ...current, driverPhone: event.target.value }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Tractor Ref</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.tractorReference}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        tractorReference: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Trailer Ref</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.trailerReference}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        trailerReference: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Load Ref</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.externalLoadReference}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        externalLoadReference: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>BOL</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.billOfLadingNumber}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        billOfLadingNumber: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field">
                  <span>Truck Ticket</span>
                  <input
                    className="control control-compact"
                    value={selectedMovementDraft.truckTicketNumber}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) => ({
                        ...current,
                        truckTicketNumber: event.target.value,
                      }))
                    }
                    disabled={mutationPending}
                  />
                </label>
                <label className="field field-wide">
                  <span>{selectedMovementDraft.status === 'ON_HOLD' ? 'Hold Reason' : 'Status Reason'}</span>
                  <textarea
                    className="control control-textarea"
                    value={selectedMovementDraft.status === 'ON_HOLD' ? selectedMovementDraft.holdReasonCode : selectedMovementDraft.statusReason}
                    onChange={(event) =>
                      setSelectedMovementDraft((current) =>
                        current.status === 'ON_HOLD'
                          ? { ...current, holdReasonCode: event.target.value }
                          : { ...current, statusReason: event.target.value },
                      )
                    }
                    rows={2}
                    disabled={mutationPending}
                  />
                </label>
              </div>
              <div className="shipment-card-actions workflow-item-actions">
                <span>
                  Current stop {selectedMovement.current_stop_sequence ?? 'TBD'} • Location{' '}
                  {selectedMovement.current_location_code ?? 'TBD'}
                </span>
                <div className="workflow-item-button-row">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => void handleCancelSelectedMovement()}
                    disabled={mutationPending || !authSession}
                  >
                    Cancel Run
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void handleSaveSelectedMovement()}
                    disabled={mutationPending || !authSession}
                  >
                    {mutationPending ? 'Saving…' : 'Save Run'}
                  </button>
                </div>
              </div>
            </article>

            <article className="position-card shipment-card workflow-item-card-compact">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>Run Stops</strong>
                  <span>Maintain stop order, appointments, actual times, and stop-level status without leaving the delivery board.</span>
                </div>
                <span className="entity-chip entity-chip-soft">{selectedMovement.stops.length} persisted stops</span>
              </div>

              <div className="position-list">
                {selectedMovement.stops.map((stop) => {
                  const draft = stopDraftsById[stop.stop_id] ?? buildTruckStopDraft(stop)
                  const checkpointOptions = checkpointOptionsForStop(stop)
                  const checkpointDraft =
                    checkpointDraftsByStopId[stop.stop_id] ?? buildTruckCheckpointDraft(stop)
                  const activeCheckpointEvents = activeTruckCheckpointEventsForStop(delivery, {
                    movementId: selectedMovement.movement_id,
                    stopId: stop.stop_id,
                  })
                  return (
                    <article key={stop.stop_id} className="position-card shipment-card workflow-item-card-compact">
                      <div className="shipment-card-head">
                        <div className="shipment-card-copy">
                          <strong>Stop {stop.stop_sequence}</strong>
                          <span>{stopLocationSummary(stop)}</span>
                        </div>
                        <span className={`status-pill status-pill-${stopTone(stop.status)}`}>
                          {formatEnumLabel(stop.status)}
                        </span>
                      </div>
                      <div className="shipment-editor-grid">
                        <label className="field">
                          <span>Sequence</span>
                          <input
                            className="control control-compact"
                            value={draft.stopSequence}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, stopSequence: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Stop Type</span>
                          <select
                            className="control control-compact"
                            value={draft.stopType}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: {
                                  ...draft,
                                  stopType: event.target.value as TruckStopDraft['stopType'],
                                },
                              }))
                            }
                            disabled={mutationPending}
                          >
                            {TRUCK_STOP_TYPE_OPTIONS.map((stopType) => (
                              <option key={stopType} value={stopType}>
                                {formatEnumLabel(stopType)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Status</span>
                          <select
                            className="control control-compact"
                            value={draft.status}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, status: event.target.value as TruckStopDraft['status'] },
                              }))
                            }
                            disabled={mutationPending}
                          >
                            {TRUCK_STOP_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {formatEnumLabel(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Location</span>
                          <input
                            className="control control-compact"
                            value={draft.locationCode}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, locationCode: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Arrival Start</span>
                          <input
                            type="datetime-local"
                            className="control control-compact"
                            value={draft.plannedArrivalStart}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, plannedArrivalStart: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Arrival End</span>
                          <input
                            type="datetime-local"
                            className="control control-compact"
                            value={draft.plannedArrivalEnd}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, plannedArrivalEnd: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Departure Start</span>
                          <input
                            type="datetime-local"
                            className="control control-compact"
                            value={draft.plannedDepartureStart}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, plannedDepartureStart: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Departure End</span>
                          <input
                            type="datetime-local"
                            className="control control-compact"
                            value={draft.plannedDepartureEnd}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, plannedDepartureEnd: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Appointment Ref</span>
                          <input
                            className="control control-compact"
                            value={draft.appointmentReference}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, appointmentReference: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Planned Quantity</span>
                          <input
                            className="control control-compact"
                            value={draft.plannedQuantity}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, plannedQuantity: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Actual Quantity</span>
                          <input
                            className="control control-compact"
                            value={draft.actualQuantity}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, actualQuantity: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Actual Arrived</span>
                          <input
                            type="datetime-local"
                            className="control control-compact"
                            value={draft.actualArrivedAt}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, actualArrivedAt: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field">
                          <span>Actual Departed</span>
                          <input
                            type="datetime-local"
                            className="control control-compact"
                            value={draft.actualDepartedAt}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, actualDepartedAt: event.target.value },
                              }))
                            }
                            disabled={mutationPending}
                          />
                        </label>
                        <label className="field field-wide">
                          <span>Status Reason</span>
                          <textarea
                            className="control control-textarea"
                            value={draft.statusReason}
                            onChange={(event) =>
                              setStopDraftsById((current) => ({
                                ...current,
                                [stop.stop_id]: { ...draft, statusReason: event.target.value },
                              }))
                            }
                            rows={2}
                            disabled={mutationPending}
                          />
                        </label>
                      </div>
                      {checkpointOptions.length > 0 ? (
                        <div className="shipment-reset-section">
                          <div className="shipment-card-copy">
                            <strong>Truck Checkpoints</strong>
                            <span>Record the safe Wave 0 milestone for this stop, or reverse a mistaken checkpoint.</span>
                          </div>
                          <div className="shipment-editor-grid">
                            <label className="field">
                              <span>Checkpoint</span>
                              <select
                                className="control control-compact"
                                value={checkpointDraft.checkpointCode}
                                onChange={(event) =>
                                  setCheckpointDraftsByStopId((current) => ({
                                    ...current,
                                    [stop.stop_id]: {
                                      ...checkpointDraft,
                                      checkpointCode: event.target.value as TruckCheckpointDraft['checkpointCode'],
                                    },
                                  }))
                                }
                                disabled={mutationPending}
                              >
                                {checkpointOptions.map((checkpointCode) => (
                                  <option key={checkpointCode} value={checkpointCode}>
                                    {formatTruckCheckpointLabel(checkpointCode)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>Occurred At</span>
                              <input
                                type="datetime-local"
                                className="control control-compact"
                                value={checkpointDraft.occurredAt}
                                onChange={(event) =>
                                  setCheckpointDraftsByStopId((current) => ({
                                    ...current,
                                    [stop.stop_id]: {
                                      ...checkpointDraft,
                                      occurredAt: event.target.value,
                                    },
                                  }))
                                }
                                disabled={mutationPending}
                              />
                            </label>
                            <label className="field field-wide">
                              <span>Checkpoint Notes</span>
                              <textarea
                                className="control control-textarea"
                                value={checkpointDraft.notes}
                                onChange={(event) =>
                                  setCheckpointDraftsByStopId((current) => ({
                                    ...current,
                                    [stop.stop_id]: {
                                      ...checkpointDraft,
                                      notes: event.target.value,
                                    },
                                  }))
                                }
                                rows={2}
                                placeholder="Optional evidence, driver update, or dispatcher note."
                                disabled={mutationPending}
                              />
                            </label>
                            <label className="field field-wide">
                              <span>Correction Reason</span>
                              <textarea
                                className="control control-textarea"
                                value={checkpointDraft.reversalReason}
                                onChange={(event) =>
                                  setCheckpointDraftsByStopId((current) => ({
                                    ...current,
                                    [stop.stop_id]: {
                                      ...checkpointDraft,
                                      reversalReason: event.target.value,
                                    },
                                  }))
                                }
                                rows={2}
                                placeholder="Required before reversing an active checkpoint."
                                disabled={mutationPending}
                              />
                            </label>
                          </div>
                          <div className="shipment-card-actions workflow-item-actions">
                            <span>
                              Active checkpoints:{' '}
                              {activeCheckpointEvents.length > 0
                                ? activeCheckpointEvents
                                    .map((event) => formatTruckCheckpointLabel(event.checkpoint_code))
                                    .join(', ')
                                : 'none'}
                            </span>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => void handleRecordCheckpoint(stop)}
                              disabled={mutationPending || !authSession}
                            >
                              {mutationPending ? 'Saving…' : 'Record Checkpoint'}
                            </button>
                          </div>
                          {activeCheckpointEvents.length > 0 ? (
                            <div className="position-list">
                              {activeCheckpointEvents.map((event) => (
                                <article
                                  key={event.event_id}
                                  className="position-card shipment-card workflow-item-card-compact"
                                >
                                  <div className="shipment-card-head">
                                    <div className="shipment-card-copy">
                                      <strong>{formatTruckCheckpointLabel(event.checkpoint_code)}</strong>
                                      <span>{formatDate(event.occurred_at)}</span>
                                    </div>
                                    <span className="entity-chip entity-chip-soft">Event {event.event_id}</span>
                                  </div>
                                  <div className="shipment-card-actions">
                                    <span>{event.notes ?? 'No checkpoint notes captured.'}</span>
                                    <button
                                      type="button"
                                      className="button button-ghost"
                                      onClick={() => void handleReverseCheckpoint(stop, event.event_id)}
                                      disabled={mutationPending || !authSession}
                                    >
                                      Reverse Checkpoint
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="shipment-card-actions workflow-item-actions">
                        <span>Use skip/cancel only when the evidence chain is clear and the stop should no longer count as active work.</span>
                        <div className="workflow-item-button-row">
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => void handleSkipStop(stop)}
                            disabled={mutationPending || !authSession}
                          >
                            Skip Stop
                          </button>
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => void handleCancelStop(stop)}
                            disabled={mutationPending || !authSession}
                          >
                            Cancel Stop
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => void handleSaveStop(stop)}
                            disabled={mutationPending || !authSession}
                          >
                            {mutationPending ? 'Saving…' : 'Save Stop'}
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>

              <article className="position-card shipment-card workflow-item-card-compact">
                <div className="shipment-card-head">
                  <div className="shipment-card-copy">
                    <strong>Add Planned Stop</strong>
                    <span>Append a new stop before execution starts when the route needs another pickup, waypoint, or dropoff.</span>
                  </div>
                </div>
                <div className="shipment-editor-grid">
                  <label className="field">
                    <span>Sequence</span>
                    <input
                      className="control control-compact"
                      value={newStopDraft.stopSequence}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, stopSequence: event.target.value }))
                      }
                      placeholder="Optional insert sequence"
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Stop Type</span>
                    <select
                      className="control control-compact"
                      value={newStopDraft.stopType}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({
                          ...current,
                          stopType: event.target.value as TruckStopDraft['stopType'],
                        }))
                      }
                      disabled={mutationPending}
                    >
                      {TRUCK_STOP_TYPE_OPTIONS.map((stopType) => (
                        <option key={stopType} value={stopType}>
                          {formatEnumLabel(stopType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input
                      className="control control-compact"
                      value={newStopDraft.locationCode}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, locationCode: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Arrival Start</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={newStopDraft.plannedArrivalStart}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, plannedArrivalStart: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Arrival End</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={newStopDraft.plannedArrivalEnd}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, plannedArrivalEnd: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Departure Start</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={newStopDraft.plannedDepartureStart}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, plannedDepartureStart: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Departure End</span>
                    <input
                      type="datetime-local"
                      className="control control-compact"
                      value={newStopDraft.plannedDepartureEnd}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, plannedDepartureEnd: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Appointment Ref</span>
                    <input
                      className="control control-compact"
                      value={newStopDraft.appointmentReference}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, appointmentReference: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                  <label className="field">
                    <span>Planned Quantity</span>
                    <input
                      className="control control-compact"
                      value={newStopDraft.plannedQuantity}
                      onChange={(event) =>
                        setNewStopDraft((current) => ({ ...current, plannedQuantity: event.target.value }))
                      }
                      disabled={mutationPending}
                    />
                  </label>
                </div>
                <div className="shipment-card-actions workflow-item-actions">
                  <span>If the run is already executing, the API will refuse late stop insertion to preserve auditability.</span>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void handleAddStopToSelectedMovement()}
                    disabled={mutationPending || !authSession}
                  >
                    {mutationPending ? 'Saving…' : 'Add Stop'}
                  </button>
                </div>
              </article>
            </article>
          </div>
        ) : null}
      </article>
    </div>
  )
}
