import { useEffect, useState } from 'react'

import type {
  UpdateDeliveryLogisticsDetailInput,
  UpdateDeliveryPipelineDetailInput,
  UpdateDeliveryPowerDetailInput,
} from '../../entities/shipments/api'
import type { DeliveryFieldSource, DeliveryRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import {
  buildLogisticsDetailDraft,
  buildLogisticsDetailPayload,
  buildLogisticsResetOptions,
  buildPipelineDetailDraft,
  buildPipelineDetailPayload,
  buildPipelineResetOptions,
  buildPowerDetailDraft,
  buildPowerDetailPayload,
  buildPowerResetOptions,
  type LogisticsDetailDraft,
  type LogisticsResetField,
  type PipelineDetailDraft,
  type PipelineResetField,
  type PowerDetailDraft,
  type PowerResetField,
} from './deliveryModeDetailHelpers'

type DeliveryModeDetailEditorProps = {
  authSession: StoredAuthSession | null
  delivery: DeliveryRecord
  savingDeliveryId: string | null
  onSaveLogisticsDetails: (deliveryId: string, payload: UpdateDeliveryLogisticsDetailInput) => Promise<void>
  onSavePipelineDetails: (deliveryId: string, payload: UpdateDeliveryPipelineDetailInput) => Promise<void>
  onSavePowerDetails: (deliveryId: string, payload: UpdateDeliveryPowerDetailInput) => Promise<void>
}

function formatEnumLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatFieldSourceLabel(source: DeliveryFieldSource | null): string {
  switch (source) {
    case 'TRADE_DERIVED':
      return 'Trade Derived'
    case 'SYSTEM_GENERATED':
      return 'System Generated'
    case 'MANUAL':
      return 'Manual'
    default:
      return 'Not Set'
  }
}

function fieldSourceTone(source: DeliveryFieldSource | null): 'active' | 'in-progress' | 'planned' {
  switch (source) {
    case 'MANUAL':
      return 'active'
    case 'TRADE_DERIVED':
      return 'in-progress'
    default:
      return 'planned'
  }
}

export function DeliveryModeDetailEditor({
  authSession,
  delivery,
  savingDeliveryId,
  onSaveLogisticsDetails,
  onSavePipelineDetails,
  onSavePowerDetails,
}: DeliveryModeDetailEditorProps) {
  const [logisticsDraft, setLogisticsDraft] = useState<LogisticsDetailDraft>(() => buildLogisticsDetailDraft(delivery))
  const [pipelineDraft, setPipelineDraft] = useState<PipelineDetailDraft>(() => buildPipelineDetailDraft(delivery))
  const [powerDraft, setPowerDraft] = useState<PowerDetailDraft>(() => buildPowerDetailDraft(delivery))

  useEffect(() => {
    setLogisticsDraft(buildLogisticsDetailDraft(delivery))
    setPipelineDraft(buildPipelineDetailDraft(delivery))
    setPowerDraft(buildPowerDetailDraft(delivery))
  }, [delivery])

  const mutationPending = savingDeliveryId === delivery.delivery_id

  if (delivery.mode_family === 'LOGISTICS') {
    const { payload, hasChanges } = buildLogisticsDetailPayload(delivery, logisticsDraft)
    const resetOptions = buildLogisticsResetOptions(delivery)
    const saveDisabled = mutationPending || !authSession || !hasChanges
    const resetDisabled = mutationPending || !authSession || resetOptions.length === 0

    async function handleReset(fields: LogisticsResetField[]) {
      if (fields.length === 0) {
        return
      }
      await onSaveLogisticsDetails(delivery.delivery_id, { reset_fields: fields })
    }

    return (
      <article className="position-card shipment-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Logistics Execution Details</strong>
            <span>Capture carrier, asset, and movement-specific execution data for a discrete physical move.</span>
          </div>
          <span className="entity-chip entity-chip-soft">{formatEnumLabel(delivery.transport_mode)}</span>
        </div>

        <div className="shipment-card-meta">
          <span className="entity-chip entity-chip-soft">Origin {delivery.origin_location_code ?? 'TBD'}</span>
          <span className="entity-chip entity-chip-soft">Destination {delivery.destination_location_code ?? 'TBD'}</span>
          <span className="entity-chip entity-chip-soft">Carrier {delivery.carrier_name ?? 'TBD'}</span>
        </div>

        <div className="shipment-editor-grid">
          <label className="field">
            <span>Origin</span>
            <input
              className="control control-compact"
              value={logisticsDraft.originLocationCode}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, originLocationCode: event.target.value }))
              }
              placeholder="Load point or origin terminal"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.origin_location_code_source)}
            </small>
          </label>

          <label className="field">
            <span>Destination</span>
            <input
              className="control control-compact"
              value={logisticsDraft.destinationLocationCode}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, destinationLocationCode: event.target.value }))
              }
              placeholder="Discharge point or destination terminal"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.destination_location_code_source)}
            </small>
          </label>

          <label className="field">
            <span>Carrier</span>
            <input
              className="control control-compact"
              value={logisticsDraft.carrierName}
              onChange={(event) => setLogisticsDraft((current) => ({ ...current, carrierName: event.target.value }))}
              placeholder="Carrier or hauler"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.carrier_name_source)}
            </small>
          </label>

          <label className="field">
            <span>Carrier Ref</span>
            <input
              className="control control-compact"
              value={logisticsDraft.carrierReference}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, carrierReference: event.target.value }))
              }
              placeholder="Tender, booking, or carrier reference"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.carrier_reference_source)}
            </small>
          </label>

          <label className="field">
            <span>Asset Ref</span>
            <input
              className="control control-compact"
              value={logisticsDraft.assetReference}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, assetReference: event.target.value }))
              }
              placeholder="Truck, railcar, vessel, or barge identifier"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.asset_reference_source)}
            </small>
          </label>

          <label className="field">
            <span>Equipment Type</span>
            <input
              className="control control-compact"
              value={logisticsDraft.equipmentType}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, equipmentType: event.target.value }))
              }
              placeholder="Truck, tank car, barge, or vessel class"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.equipment_type_source)}
            </small>
          </label>

          <label className="field">
            <span>Incoterm</span>
            <input
              className="control control-compact"
              value={logisticsDraft.incotermCode}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, incotermCode: event.target.value }))
              }
              placeholder="FOB, CIF, DAP, or similar"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.incoterm_code_source)}
            </small>
          </label>

          <label className="field">
            <span>Load Ref</span>
            <input
              className="control control-compact"
              value={logisticsDraft.loadReference}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, loadReference: event.target.value }))
              }
              placeholder="Load ticket, lifting, or bill of lading"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.load_reference_source)}
            </small>
          </label>

          <label className="field">
            <span>Discharge Ref</span>
            <input
              className="control control-compact"
              value={logisticsDraft.dischargeReference}
              onChange={(event) =>
                setLogisticsDraft((current) => ({ ...current, dischargeReference: event.target.value }))
              }
              placeholder="Delivery receipt or discharge reference"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.discharge_reference_source)}
            </small>
          </label>
        </div>

        {resetOptions.length > 0 ? (
          <div className="shipment-reset-section">
            <div className="shipment-card-copy">
              <strong>Mode-Specific Overrides</strong>
              <span>Reset a single logistics field back to its seeded default.</span>
            </div>
            <div className="shipment-reset-list">
              {resetOptions.map((option) => (
                <button
                  key={option.field}
                  type="button"
                  className="button button-ghost shipment-reset-chip"
                  onClick={() => void handleReset([option.field])}
                  disabled={resetDisabled}
                >
                  <span className={`status-pill status-pill-${fieldSourceTone(option.source)}`}>{option.label}</span>
                  <span>Reset</span>
                </button>
              ))}
            </div>
            <div className="shipment-card-actions">
              <span>{resetOptions.length} logistics field{resetOptions.length === 1 ? '' : 's'} currently override the seeded defaults.</span>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void handleReset(resetOptions.map((option) => option.field))}
                disabled={resetDisabled}
              >
                {mutationPending ? 'Resetting…' : 'Reset All Logistics Overrides'}
              </button>
            </div>
          </div>
        ) : (
          <p className="workflow-editor-note">No logistics-specific fields are manually overridden yet.</p>
        )}

        <div className="shipment-card-actions workflow-item-actions">
          <span>These details stay attached to the delivery record even when the source trade feed refreshes.</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void onSaveLogisticsDetails(delivery.delivery_id, payload)}
            disabled={saveDisabled}
          >
            {mutationPending ? 'Saving…' : 'Save Logistics Details'}
          </button>
        </div>
      </article>
    )
  }

  if (delivery.mode_family === 'NETWORK_FLOW') {
    const { payload, hasChanges } = buildPipelineDetailPayload(delivery, pipelineDraft)
    const resetOptions = buildPipelineResetOptions(delivery)
    const saveDisabled = mutationPending || !authSession || !hasChanges
    const resetDisabled = mutationPending || !authSession || resetOptions.length === 0

    async function handleReset(fields: PipelineResetField[]) {
      if (fields.length === 0) {
        return
      }
      await onSavePipelineDetails(delivery.delivery_id, { reset_fields: fields })
    }

    return (
      <article className="position-card shipment-card workflow-item-card-compact">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Pipeline Scheduling Details</strong>
            <span>Maintain network-flow pathing, nomination, and contract identifiers for scheduled pipeline movement.</span>
          </div>
          <span className="entity-chip entity-chip-soft">{formatEnumLabel(delivery.transport_mode)}</span>
        </div>

        <div className="shipment-card-meta">
          <span className="entity-chip entity-chip-soft">System {delivery.pipeline_system ?? 'TBD'}</span>
          <span className="entity-chip entity-chip-soft">Receipt {delivery.receipt_location_code ?? 'TBD'}</span>
          <span className="entity-chip entity-chip-soft">Delivery {delivery.delivery_location_code ?? 'TBD'}</span>
        </div>

        <div className="shipment-editor-grid">
          <label className="field">
            <span>Pipeline System</span>
            <input
              className="control control-compact"
              value={pipelineDraft.pipelineSystem}
              onChange={(event) =>
                setPipelineDraft((current) => ({ ...current, pipelineSystem: event.target.value }))
              }
              placeholder="NGPL, ANR, TETCO, or similar"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.pipeline_system_source)}
            </small>
          </label>

          <label className="field">
            <span>Pipeline Path</span>
            <input
              className="control control-compact"
              value={pipelineDraft.pipelinePath}
              onChange={(event) => setPipelineDraft((current) => ({ ...current, pipelinePath: event.target.value }))}
              placeholder="Segment, path, or routing descriptor"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.pipeline_path_source)}
            </small>
          </label>

          <label className="field">
            <span>Receipt Location</span>
            <input
              className="control control-compact"
              value={pipelineDraft.receiptLocationCode}
              onChange={(event) =>
                setPipelineDraft((current) => ({ ...current, receiptLocationCode: event.target.value }))
              }
              placeholder="Receipt point code"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.receipt_location_code_source)}
            </small>
          </label>

          <label className="field">
            <span>Delivery Location</span>
            <input
              className="control control-compact"
              value={pipelineDraft.deliveryLocationCode}
              onChange={(event) =>
                setPipelineDraft((current) => ({ ...current, deliveryLocationCode: event.target.value }))
              }
              placeholder="Delivery point code"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.delivery_location_code_source)}
            </small>
          </label>

          <label className="field">
            <span>Contract Number</span>
            <input
              className="control control-compact"
              value={pipelineDraft.pipelineContractNumber}
              onChange={(event) =>
                setPipelineDraft((current) => ({ ...current, pipelineContractNumber: event.target.value }))
              }
              placeholder="Transportation or service agreement"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.pipeline_contract_number_source)}
            </small>
          </label>

          <label className="field">
            <span>Cycle Code</span>
            <input
              className="control control-compact"
              value={pipelineDraft.pipelineCycleCode}
              onChange={(event) =>
                setPipelineDraft((current) => ({ ...current, pipelineCycleCode: event.target.value }))
              }
              placeholder="Timely, Evening, Intraday, or custom cycle"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.pipeline_cycle_code_source)}
            </small>
          </label>

          <label className="field field-wide">
            <span>Nomination Ref</span>
            <input
              className="control control-compact"
              value={pipelineDraft.nominationReference}
              onChange={(event) =>
                setPipelineDraft((current) => ({ ...current, nominationReference: event.target.value }))
              }
              placeholder="Nomination or scheduling reference"
              disabled={mutationPending}
            />
            <small className="shipment-editor-source">
              Source {formatFieldSourceLabel(delivery.nomination_reference_source)}
            </small>
          </label>
        </div>

        {resetOptions.length > 0 ? (
          <div className="shipment-reset-section">
            <div className="shipment-card-copy">
              <strong>Mode-Specific Overrides</strong>
              <span>Reset a single pipeline field back to its seeded default.</span>
            </div>
            <div className="shipment-reset-list">
              {resetOptions.map((option) => (
                <button
                  key={option.field}
                  type="button"
                  className="button button-ghost shipment-reset-chip"
                  onClick={() => void handleReset([option.field])}
                  disabled={resetDisabled}
                >
                  <span className={`status-pill status-pill-${fieldSourceTone(option.source)}`}>{option.label}</span>
                  <span>Reset</span>
                </button>
              ))}
            </div>
            <div className="shipment-card-actions">
              <span>{resetOptions.length} pipeline field{resetOptions.length === 1 ? '' : 's'} currently override the seeded defaults.</span>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void handleReset(resetOptions.map((option) => option.field))}
                disabled={resetDisabled}
              >
                {mutationPending ? 'Resetting…' : 'Reset All Pipeline Overrides'}
              </button>
            </div>
          </div>
        ) : (
          <p className="workflow-editor-note">No pipeline-specific fields are manually overridden yet.</p>
        )}

        <div className="shipment-card-actions workflow-item-actions">
          <span>Use this section for pipeline-specific routing and nomination context beyond the shared delivery controls.</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void onSavePipelineDetails(delivery.delivery_id, payload)}
            disabled={saveDisabled}
          >
            {mutationPending ? 'Saving…' : 'Save Pipeline Details'}
          </button>
        </div>
      </article>
    )
  }

  const { payload, hasChanges, validationMessage } = buildPowerDetailPayload(delivery, powerDraft)
  const resetOptions = buildPowerResetOptions(delivery)
  const saveDisabled = mutationPending || !authSession || !hasChanges || validationMessage !== null
  const resetDisabled = mutationPending || !authSession || resetOptions.length === 0

  async function handleReset(fields: PowerResetField[]) {
    if (fields.length === 0) {
      return
    }
    await onSavePowerDetails(delivery.delivery_id, { reset_fields: fields })
  }

  return (
    <article className="position-card shipment-card workflow-item-card-compact">
      <div className="shipment-card-head">
        <div className="shipment-card-copy">
          <strong>Power Scheduling Details</strong>
          <span>Capture ISO, node, profile, and interval schedule detail for power delivery obligations.</span>
        </div>
        <span className="entity-chip entity-chip-soft">{formatEnumLabel(delivery.transport_mode)}</span>
      </div>

      <div className="shipment-card-meta">
        <span className="entity-chip entity-chip-soft">ISO {delivery.market_operator ?? 'TBD'}</span>
        <span className="entity-chip entity-chip-soft">Pricing Node {delivery.pricing_node_code ?? 'TBD'}</span>
        <span className="entity-chip entity-chip-soft">Interval {delivery.interval_minutes ?? 'TBD'} min</span>
      </div>

      {validationMessage ? <p className="field-error">{validationMessage}</p> : null}

      <div className="shipment-editor-grid">
        <label className="field">
          <span>Market Operator</span>
          <input
            className="control control-compact"
            value={powerDraft.marketOperator}
            onChange={(event) => setPowerDraft((current) => ({ ...current, marketOperator: event.target.value }))}
            placeholder="PJM, ERCOT, CAISO, or similar"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.market_operator_source)}
          </small>
        </label>

        <label className="field">
          <span>Pricing Node</span>
          <input
            className="control control-compact"
            value={powerDraft.pricingNodeCode}
            onChange={(event) => setPowerDraft((current) => ({ ...current, pricingNodeCode: event.target.value }))}
            placeholder="Hub or settlement node"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.pricing_node_code_source)}
          </small>
        </label>

        <label className="field">
          <span>Delivery Node</span>
          <input
            className="control control-compact"
            value={powerDraft.deliveryNodeCode}
            onChange={(event) => setPowerDraft((current) => ({ ...current, deliveryNodeCode: event.target.value }))}
            placeholder="Delivery or sink node"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.delivery_node_code_source)}
          </small>
        </label>

        <label className="field">
          <span>Profile Code</span>
          <input
            className="control control-compact"
            value={powerDraft.profileCode}
            onChange={(event) => setPowerDraft((current) => ({ ...current, profileCode: event.target.value }))}
            placeholder="ATC, 7x24, 5x16, peak, or custom profile"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.profile_code_source)}
          </small>
        </label>

        <label className="field">
          <span>Schedule Ref</span>
          <input
            className="control control-compact"
            value={powerDraft.scheduleReference}
            onChange={(event) =>
              setPowerDraft((current) => ({ ...current, scheduleReference: event.target.value }))
            }
            placeholder="Tag or operator schedule reference"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.schedule_reference_source)}
          </small>
        </label>

        <label className="field">
          <span>Interval Minutes</span>
          <input
            inputMode="numeric"
            className="control control-compact"
            value={powerDraft.intervalMinutes}
            onChange={(event) => setPowerDraft((current) => ({ ...current, intervalMinutes: event.target.value }))}
            placeholder="15, 30, 60"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.interval_minutes_source)}
          </small>
        </label>

        <label className="field field-wide">
          <span>Timezone</span>
          <input
            className="control control-compact"
            value={powerDraft.timezoneName}
            onChange={(event) => setPowerDraft((current) => ({ ...current, timezoneName: event.target.value }))}
            placeholder="America/New_York"
            disabled={mutationPending}
          />
          <small className="shipment-editor-source">
            Source {formatFieldSourceLabel(delivery.timezone_name_source)}
          </small>
        </label>
      </div>

      {resetOptions.length > 0 ? (
        <div className="shipment-reset-section">
          <div className="shipment-card-copy">
            <strong>Mode-Specific Overrides</strong>
            <span>Reset a single power field back to its seeded default.</span>
          </div>
          <div className="shipment-reset-list">
            {resetOptions.map((option) => (
              <button
                key={option.field}
                type="button"
                className="button button-ghost shipment-reset-chip"
                onClick={() => void handleReset([option.field])}
                disabled={resetDisabled}
              >
                <span className={`status-pill status-pill-${fieldSourceTone(option.source)}`}>{option.label}</span>
                <span>Reset</span>
              </button>
            ))}
          </div>
          <div className="shipment-card-actions">
            <span>{resetOptions.length} power field{resetOptions.length === 1 ? '' : 's'} currently override the seeded defaults.</span>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void handleReset(resetOptions.map((option) => option.field))}
              disabled={resetDisabled}
            >
              {mutationPending ? 'Resetting…' : 'Reset All Power Overrides'}
            </button>
          </div>
        </div>
      ) : (
        <p className="workflow-editor-note">No power-specific fields are manually overridden yet.</p>
      )}

      <div className="shipment-card-actions workflow-item-actions">
        <span>Keep the shared delivery window above, then maintain operator-specific schedule detail here.</span>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void onSavePowerDetails(delivery.delivery_id, payload)}
          disabled={saveDisabled}
        >
          {mutationPending ? 'Saving…' : 'Save Power Details'}
        </button>
      </div>
    </article>
  )
}
