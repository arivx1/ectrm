import { useEffect, useState } from 'react'

import {
  listDeliveryVesselTrackingSignals,
  recordDeliveryVesselTrackingSignal,
  refreshDeliveryVesselTrackingFromAisstream,
  type DeliveryTrackingSignalCreateInput,
  type UpdateDeliveryVesselDetailInput,
} from '../../entities/shipments/api'
import { appConfig } from '../../shared/config'
import type {
  DeliveryRecord,
  DeliveryTrackingSignalRecord,
  DeliveryVesselDetailRecord,
  DeliveryVesselTrackingHealthRecord,
} from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type DeliveryVesselTrackingEditorProps = {
  authSession: StoredAuthSession | null
  delivery: DeliveryRecord
  savingDeliveryId: string | null
  formatDate: (value: string | null | undefined) => string
  onSaveVesselDetails: (deliveryId: string, payload: UpdateDeliveryVesselDetailInput) => Promise<void>
}

type VesselDetailDraft = {
  vesselName: string
  imoNumber: string
  mmsiNumber: string
  callSign: string
  voyageNumber: string
  trackingProvider: string
  trackingPolicy: string
}

type VesselSignalDraft = {
  sourceSystem: string
  sourceEventId: string
  signalType: string
  occurredAt: string
  latitude: string
  longitude: string
  speedKnots: string
  courseDegrees: string
  headingDegrees: string
  draughtMeters: string
  destination: string
  etaAtDestination: string
  externalStatus: string
  normalizedStatus: string
  matchConfidence: string
  providerNote: string
}

function formatEnumLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function toDatetimeLocal(value?: string | null): string {
  if (!value) {
    return ''
  }
  return value.slice(0, 16)
}

function defaultSignalDraft(detail?: DeliveryVesselDetailRecord | null): VesselSignalDraft {
  return {
    sourceSystem: detail?.tracking_provider ?? '',
    sourceEventId: '',
    signalType: 'POSITION',
    occurredAt: new Date().toISOString().slice(0, 16),
    latitude: '',
    longitude: '',
    speedKnots: '',
    courseDegrees: '',
    headingDegrees: '',
    draughtMeters: '',
    destination: detail?.current_destination ?? '',
    etaAtDestination: toDatetimeLocal(detail?.current_eta_at_destination),
    externalStatus: '',
    normalizedStatus: detail?.last_navigational_status ?? '',
    matchConfidence: '',
    providerNote: '',
  }
}

function buildDetailDraft(detail?: DeliveryVesselDetailRecord | null): VesselDetailDraft {
  return {
    vesselName: detail?.vessel_name ?? '',
    imoNumber: detail?.imo_number ?? '',
    mmsiNumber: detail?.mmsi_number ?? '',
    callSign: detail?.call_sign ?? '',
    voyageNumber: detail?.voyage_number ?? '',
    trackingProvider: detail?.tracking_provider ?? '',
    trackingPolicy: detail?.tracking_policy ?? '',
  }
}

function normalizedNullableText(value: string): string | null {
  const normalized = value.trim()
  return normalized || null
}

function buildDetailPayload(
  detail: DeliveryVesselDetailRecord | null | undefined,
  draft: VesselDetailDraft,
): { payload: UpdateDeliveryVesselDetailInput; hasChanges: boolean; validationMessage: string | null } {
  const payload: UpdateDeliveryVesselDetailInput = {}
  const vesselName = normalizedNullableText(draft.vesselName)
  const imoNumber = normalizedNullableText(draft.imoNumber)
  const mmsiNumber = normalizedNullableText(draft.mmsiNumber)
  const callSign = normalizedNullableText(draft.callSign)
  const voyageNumber = normalizedNullableText(draft.voyageNumber)
  const trackingProvider = normalizedNullableText(draft.trackingProvider)
  const trackingPolicy = normalizedNullableText(draft.trackingPolicy)

  if (imoNumber && !/^\d{7}$/.test(imoNumber)) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'IMO number must be a 7-digit numeric identifier.',
    }
  }
  if (mmsiNumber && !/^\d{9}$/.test(mmsiNumber)) {
    return {
      payload,
      hasChanges: false,
      validationMessage: 'MMSI number must be a 9-digit numeric identifier.',
    }
  }

  if (vesselName !== (detail?.vessel_name ?? null)) {
    payload.vessel_name = vesselName
  }
  if (imoNumber !== (detail?.imo_number ?? null)) {
    payload.imo_number = imoNumber
  }
  if (mmsiNumber !== (detail?.mmsi_number ?? null)) {
    payload.mmsi_number = mmsiNumber
  }
  if (callSign !== (detail?.call_sign ?? null)) {
    payload.call_sign = callSign
  }
  if (voyageNumber !== (detail?.voyage_number ?? null)) {
    payload.voyage_number = voyageNumber
  }
  if (trackingProvider !== (detail?.tracking_provider ?? null)) {
    payload.tracking_provider = trackingProvider
  }
  if (trackingPolicy !== (detail?.tracking_policy ?? null)) {
    payload.tracking_policy = trackingPolicy
  }

  return {
    payload,
    hasChanges: Object.keys(payload).length > 0,
    validationMessage: null,
  }
}

function parseOptionalNumber(
  value: string,
  label: string,
  min: number,
  max: number,
): { value: number | null; error: string | null } {
  const normalized = value.trim()
  if (!normalized) {
    return { value: null, error: null }
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { value: null, error: `${label} must be between ${min} and ${max}.` }
  }
  return { value: parsed, error: null }
}

function buildSignalPayload(
  draft: VesselSignalDraft,
): { payload: DeliveryTrackingSignalCreateInput; validationMessage: string | null } {
  const occurredAt = draft.occurredAt.trim()
  if (!occurredAt) {
    return {
      payload: { signal_type: 'POSITION', occurred_at: '' },
      validationMessage: 'Signal occurred at is required.',
    }
  }

  const latitude = parseOptionalNumber(draft.latitude, 'Latitude', -90, 90)
  const longitude = parseOptionalNumber(draft.longitude, 'Longitude', -180, 180)
  const speedKnots = parseOptionalNumber(draft.speedKnots, 'Speed', 0, 80)
  const courseDegrees = parseOptionalNumber(draft.courseDegrees, 'Course', 0, 360)
  const headingDegrees = parseOptionalNumber(draft.headingDegrees, 'Heading', 0, 360)
  const draughtMeters = parseOptionalNumber(draft.draughtMeters, 'Draught', 0, 50)
  const matchConfidence = parseOptionalNumber(draft.matchConfidence, 'Match confidence', 0, 1)
  const validationMessage = [
    latitude.error,
    longitude.error,
    speedKnots.error,
    courseDegrees.error,
    headingDegrees.error,
    draughtMeters.error,
    matchConfidence.error,
  ].find(Boolean)
  if (validationMessage) {
    return {
      payload: { signal_type: 'POSITION', occurred_at: occurredAt },
      validationMessage,
    }
  }
  if ((latitude.value === null) !== (longitude.value === null)) {
    return {
      payload: { signal_type: 'POSITION', occurred_at: occurredAt },
      validationMessage: 'Latitude and longitude must be provided together.',
    }
  }

  return {
    payload: {
      source_system: normalizedNullableText(draft.sourceSystem),
      source_event_id: normalizedNullableText(draft.sourceEventId),
      signal_type: normalizedNullableText(draft.signalType) ?? 'POSITION',
      occurred_at: occurredAt,
      latitude: latitude.value,
      longitude: longitude.value,
      speed_knots: speedKnots.value,
      course_degrees: courseDegrees.value,
      heading_degrees: headingDegrees.value,
      draught_meters: draughtMeters.value,
      destination: normalizedNullableText(draft.destination),
      eta_at_destination: normalizedNullableText(draft.etaAtDestination),
      external_status: normalizedNullableText(draft.externalStatus),
      normalized_status: normalizedNullableText(draft.normalizedStatus),
      match_confidence: matchConfidence.value,
      raw_payload: normalizedNullableText(draft.providerNote)
        ? { provider_note: normalizedNullableText(draft.providerNote) }
        : {},
    },
    validationMessage: null,
  }
}

function healthTone(
  health: DeliveryVesselTrackingHealthRecord | null | undefined,
): 'active' | 'blocked' | 'in-progress' | 'planned' {
  switch (health?.exception_severity) {
    case 'ACTION_REQUIRED':
      return 'blocked'
    case 'WATCH':
      return 'in-progress'
    case 'CLEAR':
      return 'active'
    default:
      return 'planned'
  }
}

function signalNote(signal: DeliveryTrackingSignalRecord): string {
  const providerNote = signal.raw_payload.provider_note
  if (typeof providerNote === 'string' && providerNote.trim()) {
    return providerNote
  }
  return signal.external_status ?? signal.normalized_status ?? 'No signal note captured.'
}

function positionLabel(detail: DeliveryVesselDetailRecord | null | undefined): string {
  if (detail?.last_latitude === null || detail?.last_longitude === null || !detail) {
    return 'Position TBD'
  }
  return `${detail.last_latitude.toFixed(4)}, ${detail.last_longitude.toFixed(4)}`
}

export function DeliveryVesselTrackingEditor({
  authSession,
  delivery,
  savingDeliveryId,
  formatDate,
  onSaveVesselDetails,
}: DeliveryVesselTrackingEditorProps) {
  const mutationPending = savingDeliveryId === delivery.delivery_id
  const [localDetail, setLocalDetail] = useState<DeliveryVesselDetailRecord | null>(delivery.vessel_detail ?? null)
  const [detailDraft, setDetailDraft] = useState<VesselDetailDraft>(() => buildDetailDraft(delivery.vessel_detail))
  const [signalDraft, setSignalDraft] = useState<VesselSignalDraft>(() => defaultSignalDraft(delivery.vessel_detail))
  const [signals, setSignals] = useState<DeliveryTrackingSignalRecord[]>([])
  const [signalLoading, setSignalLoading] = useState(false)
  const [signalSaving, setSignalSaving] = useState(false)
  const [aisstreamRefreshing, setAisstreamRefreshing] = useState(false)
  const [signalError, setSignalError] = useState('')
  const [signalMessage, setSignalMessage] = useState('')

  useEffect(() => {
    setLocalDetail(delivery.vessel_detail ?? null)
    setDetailDraft(buildDetailDraft(delivery.vessel_detail))
    setSignalDraft(defaultSignalDraft(delivery.vessel_detail))
    setSignalError('')
    setSignalMessage('')
  }, [delivery])

  useEffect(() => {
    if (delivery.transport_mode !== 'VESSEL' || !authSession) {
      setSignals([])
      setSignalLoading(false)
      return
    }

    let cancelled = false
    async function loadSignals() {
      setSignalLoading(true)
      setSignalError('')
      try {
        const rows = await listDeliveryVesselTrackingSignals(appConfig.apiBase, delivery.delivery_id)
        if (!cancelled) {
          setSignals(rows)
        }
      } catch (nextError) {
        if (!cancelled) {
          setSignalError(
            nextError instanceof Error ? nextError.message : 'Failed to load vessel tracking signals.',
          )
        }
      } finally {
        if (!cancelled) {
          setSignalLoading(false)
        }
      }
    }

    void loadSignals()
    return () => {
      cancelled = true
    }
  }, [authSession, delivery.delivery_id, delivery.last_updated_at, delivery.transport_mode])

  const detail = localDetail ?? delivery.vessel_detail ?? null
  const trackingHealth = detail?.tracking_health ?? delivery.vessel_tracking_health ?? null
  const { payload: detailPayload, hasChanges, validationMessage } = buildDetailPayload(detail, detailDraft)
  const saveDisabled = mutationPending || !authSession || !hasChanges || validationMessage !== null
  const signalMutationPending = mutationPending || signalSaving || aisstreamRefreshing
  const aisstreamRefreshDisabled = signalMutationPending || !authSession || !detail?.mmsi_number

  async function handleSaveDetail() {
    if (!hasChanges || validationMessage) {
      return
    }
    await onSaveVesselDetails(delivery.delivery_id, detailPayload)
  }

  async function handleRecordSignal() {
    const { payload, validationMessage: signalValidationMessage } = buildSignalPayload(signalDraft)
    if (signalValidationMessage) {
      setSignalError(signalValidationMessage)
      setSignalMessage('')
      return
    }

    setSignalSaving(true)
    setSignalError('')
    setSignalMessage('')
    try {
      const result = await recordDeliveryVesselTrackingSignal(appConfig.apiBase, {
        deliveryId: delivery.delivery_id,
        payload,
      })
      const signal = result.signal
      setLocalDetail(result.vessel_detail)
      setSignals((current) =>
        [signal, ...current.filter((row) => row.signal_id !== signal.signal_id)].sort((left, right) => {
          const rightTime = new Date(right.occurred_at).getTime()
          const leftTime = new Date(left.occurred_at).getTime()
          if (rightTime !== leftTime) {
            return rightTime - leftTime
          }
          return right.signal_id - left.signal_id
        }),
      )
      setSignalDraft({
        ...defaultSignalDraft(result.vessel_detail),
        sourceSystem: signalDraft.sourceSystem,
        signalType: signalDraft.signalType || 'POSITION',
      })
      setSignalMessage(
        result.duplicate
          ? `Duplicate vessel signal already recorded as signal ${signal.signal_id}.`
          : `Signal ${signal.signal_id} recorded as ${formatEnumLabel(signal.processing_status)}.`,
      )
    } catch (nextError) {
      setSignalError(
        nextError instanceof Error ? nextError.message : 'Failed to record vessel tracking signal.',
      )
    } finally {
      setSignalSaving(false)
    }
  }

  async function handleAisstreamRefresh() {
    if (!detail?.mmsi_number) {
      setSignalError('Save a 9-digit MMSI before refreshing AISStream.')
      setSignalMessage('')
      return
    }

    setAisstreamRefreshing(true)
    setSignalError('')
    setSignalMessage('')
    try {
      const result = await refreshDeliveryVesselTrackingFromAisstream(appConfig.apiBase, {
        deliveryId: delivery.delivery_id,
      })
      const signal = result.signal
      setLocalDetail(result.vessel_detail)
      setSignals((current) =>
        [signal, ...current.filter((row) => row.signal_id !== signal.signal_id)].sort((left, right) => {
          const rightTime = new Date(right.occurred_at).getTime()
          const leftTime = new Date(left.occurred_at).getTime()
          if (rightTime !== leftTime) {
            return rightTime - leftTime
          }
          return right.signal_id - left.signal_id
        }),
      )
      setSignalDraft({
        ...defaultSignalDraft(result.vessel_detail),
        sourceSystem: result.provider,
        signalType: 'POSITION',
      })
      setSignalMessage(
        result.duplicate
          ? `AISStream signal already recorded as signal ${signal.signal_id}.`
          : `AISStream signal ${signal.signal_id} recorded for MMSI ${result.matched_mmsi}.`,
      )
    } catch (nextError) {
      setSignalError(
        nextError instanceof Error ? nextError.message : 'Failed to refresh vessel tracking from AISStream.',
      )
    } finally {
      setAisstreamRefreshing(false)
    }
  }

  return (
    <article className="position-card shipment-card workflow-item-card-compact">
      <div className="shipment-card-head">
        <div className="shipment-card-copy">
          <strong>Vessel Tracking</strong>
          <span>Maintain vessel identity and AIS-style position, status, and ETA signals for this delivery.</span>
        </div>
        <span className={`status-pill status-pill-${healthTone(trackingHealth)}`}>
          {trackingHealth?.primary_exception
            ? formatEnumLabel(trackingHealth.primary_exception)
            : trackingHealth
              ? formatEnumLabel(trackingHealth.exception_severity)
              : 'Tracking Pending'}
        </span>
      </div>

      <div className="shipment-card-meta">
        <span className="entity-chip entity-chip-soft">Vessel {detail?.vessel_name ?? 'TBD'}</span>
        <span className="entity-chip entity-chip-soft">IMO {detail?.imo_number ?? 'TBD'}</span>
        <span className="entity-chip entity-chip-soft">MMSI {detail?.mmsi_number ?? 'TBD'}</span>
        <span className="entity-chip entity-chip-soft">{positionLabel(detail)}</span>
        <span className="entity-chip entity-chip-soft">ETA {formatDate(detail?.current_eta_at_destination)}</span>
      </div>

      {!authSession ? (
        <p className="workflow-editor-note">Sign in to maintain vessel identity and load tracking signals.</p>
      ) : null}
      {validationMessage ? <p className="field-error">{validationMessage}</p> : null}
      {signalError ? <p className="field-error workflow-item-save-error">{signalError}</p> : null}
      {signalMessage ? <p className="workflow-editor-note">{signalMessage}</p> : null}

      <div className="shipment-editor-grid">
        <label className="field">
          <span>Vessel Name</span>
          <input
            className="control control-compact"
            value={detailDraft.vesselName}
            onChange={(event) => setDetailDraft((current) => ({ ...current, vesselName: event.target.value }))}
            placeholder="Vessel or barge tow name"
            disabled={mutationPending}
          />
        </label>
        <label className="field">
          <span>IMO</span>
          <input
            className="control control-compact"
            value={detailDraft.imoNumber}
            onChange={(event) => setDetailDraft((current) => ({ ...current, imoNumber: event.target.value }))}
            placeholder="7 digits"
            disabled={mutationPending}
          />
        </label>
        <label className="field">
          <span>MMSI</span>
          <input
            className="control control-compact"
            value={detailDraft.mmsiNumber}
            onChange={(event) => setDetailDraft((current) => ({ ...current, mmsiNumber: event.target.value }))}
            placeholder="9 digits"
            disabled={mutationPending}
          />
        </label>
        <label className="field">
          <span>Call Sign</span>
          <input
            className="control control-compact"
            value={detailDraft.callSign}
            onChange={(event) => setDetailDraft((current) => ({ ...current, callSign: event.target.value }))}
            placeholder="Optional"
            disabled={mutationPending}
          />
        </label>
        <label className="field">
          <span>Voyage</span>
          <input
            className="control control-compact"
            value={detailDraft.voyageNumber}
            onChange={(event) => setDetailDraft((current) => ({ ...current, voyageNumber: event.target.value }))}
            placeholder="Voyage or fixture reference"
            disabled={mutationPending}
          />
        </label>
        <label className="field">
          <span>Tracking Provider</span>
          <input
            className="control control-compact"
            value={detailDraft.trackingProvider}
            onChange={(event) =>
              setDetailDraft((current) => ({ ...current, trackingProvider: event.target.value }))
            }
            placeholder="MANUAL, AIS provider, or broker feed"
            disabled={mutationPending}
          />
        </label>
        <label className="field field-wide">
          <span>Tracking Policy</span>
          <textarea
            className="control control-textarea"
            value={detailDraft.trackingPolicy}
            onChange={(event) =>
              setDetailDraft((current) => ({ ...current, trackingPolicy: event.target.value }))
            }
            rows={2}
            placeholder="Expected update cadence, exception owner, or escalation rules."
            disabled={mutationPending}
          />
        </label>
      </div>

      <div className="shipment-card-actions workflow-item-actions">
        <span>
          Last signal {formatDate(detail?.last_signal_at)} • Freshness{' '}
          {trackingHealth ? formatEnumLabel(trackingHealth.tracking_freshness_status) : 'pending'}
        </span>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void handleSaveDetail()}
          disabled={saveDisabled}
        >
          {mutationPending ? 'Saving…' : 'Save Vessel Identity'}
        </button>
      </div>

      <div className="shipment-reset-section">
        <div className="shipment-card-copy">
          <strong>Record Vessel Signal</strong>
          <span>{signalLoading ? 'Loading signals…' : `${signals.length} signal${signals.length === 1 ? '' : 's'} loaded`}</span>
        </div>
        <div className="shipment-editor-grid">
          <label className="field">
            <span>Source System</span>
            <input
              className="control control-compact"
              value={signalDraft.sourceSystem}
              onChange={(event) => setSignalDraft((current) => ({ ...current, sourceSystem: event.target.value }))}
              placeholder="Defaults to manual vessel tracking"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Provider Event ID</span>
            <input
              className="control control-compact"
              value={signalDraft.sourceEventId}
              onChange={(event) => setSignalDraft((current) => ({ ...current, sourceEventId: event.target.value }))}
              placeholder="Optional dedupe key"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Signal Type</span>
            <input
              className="control control-compact"
              value={signalDraft.signalType}
              onChange={(event) => setSignalDraft((current) => ({ ...current, signalType: event.target.value }))}
              placeholder="POSITION, ETA_UPDATE, STATUS"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Occurred At</span>
            <input
              type="datetime-local"
              className="control control-compact"
              value={signalDraft.occurredAt}
              onChange={(event) => setSignalDraft((current) => ({ ...current, occurredAt: event.target.value }))}
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Latitude</span>
            <input
              className="control control-compact"
              value={signalDraft.latitude}
              onChange={(event) => setSignalDraft((current) => ({ ...current, latitude: event.target.value }))}
              placeholder="-90 to 90"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              className="control control-compact"
              value={signalDraft.longitude}
              onChange={(event) => setSignalDraft((current) => ({ ...current, longitude: event.target.value }))}
              placeholder="-180 to 180"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Speed Knots</span>
            <input
              className="control control-compact"
              value={signalDraft.speedKnots}
              onChange={(event) => setSignalDraft((current) => ({ ...current, speedKnots: event.target.value }))}
              placeholder="Optional"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Course</span>
            <input
              className="control control-compact"
              value={signalDraft.courseDegrees}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, courseDegrees: event.target.value }))
              }
              placeholder="0 to 360"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Heading</span>
            <input
              className="control control-compact"
              value={signalDraft.headingDegrees}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, headingDegrees: event.target.value }))
              }
              placeholder="0 to 360"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Draught M</span>
            <input
              className="control control-compact"
              value={signalDraft.draughtMeters}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, draughtMeters: event.target.value }))
              }
              placeholder="Optional"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Destination</span>
            <input
              className="control control-compact"
              value={signalDraft.destination}
              onChange={(event) => setSignalDraft((current) => ({ ...current, destination: event.target.value }))}
              placeholder="Port, terminal, or berth"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Destination ETA</span>
            <input
              type="datetime-local"
              className="control control-compact"
              value={signalDraft.etaAtDestination}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, etaAtDestination: event.target.value }))
              }
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>External Status</span>
            <input
              className="control control-compact"
              value={signalDraft.externalStatus}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, externalStatus: event.target.value }))
              }
              placeholder="Provider status text"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Nav Status</span>
            <input
              className="control control-compact"
              value={signalDraft.normalizedStatus}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, normalizedStatus: event.target.value }))
              }
              placeholder="UNDER_WAY, AT_ANCHOR, DELAYED"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field">
            <span>Confidence</span>
            <input
              className="control control-compact"
              value={signalDraft.matchConfidence}
              onChange={(event) =>
                setSignalDraft((current) => ({ ...current, matchConfidence: event.target.value }))
              }
              placeholder="0 to 1"
              disabled={signalMutationPending}
            />
          </label>
          <label className="field field-wide">
            <span>Provider Note</span>
            <textarea
              className="control control-textarea"
              value={signalDraft.providerNote}
              onChange={(event) => setSignalDraft((current) => ({ ...current, providerNote: event.target.value }))}
              rows={2}
              placeholder="Optional raw evidence note from broker, AIS provider, or manual operator update."
              disabled={signalMutationPending}
            />
          </label>
        </div>
        <div className="shipment-card-actions workflow-item-actions">
          <span>Destination {detail?.current_destination ?? 'TBD'} • Status {detail?.last_navigational_status ?? 'TBD'}</span>
          <div className="workflow-item-button-row">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void handleAisstreamRefresh()}
              disabled={aisstreamRefreshDisabled}
            >
              {aisstreamRefreshing ? 'Refreshing…' : 'Refresh AISStream'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleRecordSignal()}
              disabled={signalMutationPending || !authSession}
            >
              {signalSaving ? 'Recording…' : 'Record Vessel Signal'}
            </button>
          </div>
        </div>
      </div>

      {signals.length > 0 ? (
        <div className="position-list">
          {signals.slice(0, 5).map((signal) => (
            <article key={signal.signal_id} className="position-card shipment-card workflow-item-card-compact">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>
                    Signal {signal.signal_id} • {formatEnumLabel(signal.signal_type)}
                  </strong>
                  <span>
                    {formatDate(signal.occurred_at)} • {signal.source_system}
                    {signal.source_event_id ? ` • ${signal.source_event_id}` : ''}
                  </span>
                </div>
                <span className="entity-chip entity-chip-soft">
                  {signal.match_confidence === null ? 'Confidence TBD' : `${Math.round(signal.match_confidence * 100)}%`}
                </span>
              </div>
              <p className="workflow-editor-note">
                {signal.latitude !== null && signal.longitude !== null
                  ? `${signal.latitude.toFixed(4)}, ${signal.longitude.toFixed(4)}`
                  : 'No position'}{' '}
                • Destination {signal.destination ?? 'TBD'} • ETA {formatDate(signal.eta_at_destination)}
              </p>
              <p className="workflow-editor-note">{signalNote(signal)}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="workflow-editor-note">No vessel tracking signals are loaded yet.</p>
      )}
    </article>
  )
}
