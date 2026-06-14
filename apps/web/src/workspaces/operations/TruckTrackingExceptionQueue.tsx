import { useEffect, useMemo, useState } from 'react'

import { listDeliveryTruckTrackingExceptions } from '../../entities/shipments/api'
import { appConfig } from '../../shared/config'
import type { DeliveryTruckTrackingExceptionRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type TruckTrackingExceptionQueueProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatNumber: (value: number | null, digits?: number) => string
  onOpenTrade?: (tradeId: string) => void
}

function formatEnumLabel(value: string | null | undefined): string {
  return (value ?? 'PENDING').replaceAll('_', ' ')
}

function trackingSeverityTone(
  severity: DeliveryTruckTrackingExceptionRecord['tracking_health']['exception_severity'],
): 'blocked' | 'planned' | 'active' {
  if (severity === 'ACTION_REQUIRED') {
    return 'blocked'
  }
  if (severity === 'WATCH') {
    return 'planned'
  }
  return 'active'
}

function deliveryReferenceLabel(row: DeliveryTruckTrackingExceptionRecord): string {
  return row.leg_no === null ? row.trade_id : `${row.trade_id} · leg ${row.leg_no}`
}

function deliveryRouteLabel(row: DeliveryTruckTrackingExceptionRecord): string {
  if (row.origin_location_code && row.destination_location_code) {
    return `${row.origin_location_code} -> ${row.destination_location_code}`
  }
  if (row.movement.current_location_code) {
    return row.movement.current_location_code
  }
  return row.location_code ?? 'Route TBD'
}

function deliveryWindowLabel(
  row: DeliveryTruckTrackingExceptionRecord,
  formatDateOnly: TruckTrackingExceptionQueueProps['formatDateOnly'],
): string {
  if (!row.delivery_start && !row.delivery_end) {
    return 'Window TBD'
  }
  if (row.delivery_start && row.delivery_end && row.delivery_start === row.delivery_end) {
    return formatDateOnly(row.delivery_start)
  }
  return `${formatDateOnly(row.delivery_start)} to ${formatDateOnly(row.delivery_end)}`
}

function primaryExceptionReason(row: DeliveryTruckTrackingExceptionRecord): string {
  const primaryException = row.tracking_health.primary_exception ?? ''
  if (primaryException.includes('DWELL')) {
    return row.tracking_health.dwell_status_reason
  }
  if (primaryException.includes('TRACKING')) {
    return row.tracking_health.tracking_freshness_reason
  }
  if (primaryException.includes('ETA')) {
    return row.tracking_health.eta_status_reason
  }
  return [
    row.tracking_health.eta_status_reason,
    row.tracking_health.tracking_freshness_reason,
    row.tracking_health.dwell_status_reason,
  ].join(' ')
}

export function TruckTrackingExceptionQueue({
  authSession,
  formatDate,
  formatDateOnly,
  formatNumber,
  onOpenTrade,
}: TruckTrackingExceptionQueueProps) {
  const [exceptions, setExceptions] = useState<DeliveryTruckTrackingExceptionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!authSession) {
      setExceptions([])
      setLoadError('')
      setLoading(false)
      return
    }

    let cancelled = false
    async function loadExceptions() {
      setLoading(true)
      setLoadError('')
      try {
        const rows = await listDeliveryTruckTrackingExceptions(appConfig.apiBase, { limit: 8 })
        if (!cancelled) {
          setExceptions(rows)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load truck tracking exceptions.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadExceptions()
    return () => {
      cancelled = true
    }
  }, [authSession])

  const actionRequiredCount = useMemo(
    () => exceptions.filter((row) => row.tracking_health.exception_severity === 'ACTION_REQUIRED').length,
    [exceptions],
  )
  const watchCount = exceptions.length - actionRequiredCount

  if (!authSession) {
    return (
      <div className="empty-state">
        <strong>Truck tracking exceptions need sign-in</strong>
        <p>Sign in to view read-only carrier freshness, ETA, and dwell exceptions.</p>
      </div>
    )
  }

  return (
    <div className="detail-list">
      <div className="shipment-card shipment-card-selected">
        <div className="shipment-card-head">
          <div className="shipment-card-copy">
            <strong>Deterministic Tracking Watch</strong>
            <span>
              {formatNumber(actionRequiredCount, 0)} action required · {formatNumber(watchCount, 0)} watch
            </span>
          </div>
          <span className={`status-pill status-pill-${actionRequiredCount > 0 ? 'blocked' : 'active'}`}>
            {exceptions.length > 0 ? `${formatNumber(exceptions.length, 0)} OPEN` : 'CLEAR'}
          </span>
        </div>
        <p>
          Queue is read-only: health is recalculated from accepted tracking signals, ETA windows, and stop dwell state.
        </p>
      </div>

      {loading ? <p className="form-note">Refreshing truck tracking exceptions.</p> : null}
      {loadError ? <p className="field-error">{loadError}</p> : null}

      {!loading && !loadError && exceptions.length === 0 ? (
        <div className="empty-state">
          <strong>No truck tracking exceptions</strong>
          <p>Active truck runs with stale tracking, late ETA, or over-dwell conditions will appear here.</p>
        </div>
      ) : null}

      {exceptions.length > 0 ? (
        <div className="position-list">
          {exceptions.map((row) => (
            <article key={`${row.movement.movement_id}:${row.tracking_health.last_evaluated_at}`} className="position-card shipment-card">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{deliveryReferenceLabel(row)}</strong>
                  <span>
                    Run {row.movement.sequence_no} · {row.commodity} · {deliveryRouteLabel(row)}
                  </span>
                </div>
                <span className={`status-pill status-pill-${trackingSeverityTone(row.tracking_health.exception_severity)}`}>
                  {formatEnumLabel(row.tracking_health.exception_severity)}
                </span>
              </div>

              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">
                  {formatEnumLabel(row.tracking_health.primary_exception)}
                </span>
                <span className="entity-chip entity-chip-soft">
                  ETA {formatEnumLabel(row.tracking_health.eta_status)}
                </span>
                <span className="entity-chip entity-chip-soft">
                  Tracking {formatEnumLabel(row.tracking_health.tracking_freshness_status)}
                </span>
                <span className="entity-chip entity-chip-soft">
                  Dwell {formatEnumLabel(row.tracking_health.dwell_status)}
                </span>
              </div>

              <div className="shipment-card-copy">
                <p>{primaryExceptionReason(row)}</p>
              </div>

              <div className="shipment-card-meta">
                <span className="entity-chip entity-chip-soft">{deliveryWindowLabel(row, formatDateOnly)}</span>
                <span className="entity-chip entity-chip-soft">
                  Last signal {row.movement.last_signal_at ? formatDate(row.movement.last_signal_at) : 'missing'}
                </span>
                <span className="entity-chip entity-chip-soft">
                  ETA {row.movement.current_eta_at_destination ? formatDate(row.movement.current_eta_at_destination) : 'missing'}
                </span>
              </div>

              <div className="shipment-card-actions">
                <span>
                  {row.counterparty ?? 'Counterparty TBD'} · {row.operations_owner ?? row.movement.dispatcher_owner ?? 'Owner TBD'}
                </span>
                {onOpenTrade ? (
                  <button type="button" className="button button-ghost" onClick={() => onOpenTrade(row.trade_id)}>
                    Open Trade
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}
