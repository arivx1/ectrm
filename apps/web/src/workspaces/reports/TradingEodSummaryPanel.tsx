import { MetricValue } from '../../shared/ui/MetricValue'
import type {
  TradingEodCheck,
  TradingEodReport,
  TradingEodStatus,
} from '../../shared/models'

type TradingEodSummaryPanelProps = {
  report: TradingEodReport
  hasGlobalFilter: boolean
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  formatMoney: (value: number | null) => string
  formatNumber: (value: number | null, digits?: number) => string
  onOpenPrompt: () => void
  onOpenSettlement: () => void
}

function tradingEodTone(status: TradingEodStatus): 'active' | 'in-progress' | 'blocked' {
  switch (status) {
    case 'READY':
      return 'active'
    case 'WARNING':
      return 'in-progress'
    case 'BLOCKED':
    default:
      return 'blocked'
  }
}

function formatMetricLabel(key: string): string {
  return key.replaceAll('_', ' ')
}

function summarizeCheckMetrics(check: TradingEodCheck): string[] {
  return Object.entries(check.supporting_metrics)
    .filter(([, value]) => value !== '' && value !== false && value !== 0)
    .slice(0, 4)
    .map(([key, value]) => `${formatMetricLabel(key)} ${String(value)}`)
}

export function TradingEodSummaryPanel({
  report,
  hasGlobalFilter,
  formatDate,
  formatDateOnly,
  formatMoney,
  formatNumber,
  onOpenPrompt,
  onOpenSettlement,
}: TradingEodSummaryPanelProps) {
  return (
    <div className="pnl-trend-panel">
      <div className="pnl-trend-topbar">
        <div className="pnl-trend-copy">
          <span>
            Business Date {formatDateOnly(report.business_date)} • As Of {formatDateOnly(report.as_of)}
          </span>
          <p>
            {report.basis}
            {hasGlobalFilter ? ' This desk-wide close posture does not narrow to the active global report filter.' : ''}
          </p>
        </div>
        <div className="shipment-card-meta">
          <span className={`status-pill status-pill-${tradingEodTone(report.status)}`}>{report.status}</span>
          <span className="entity-chip entity-chip-soft">{formatNumber(report.blocked_check_count, 0)} blocked</span>
          <span className="entity-chip entity-chip-soft">{formatNumber(report.warning_check_count, 0)} warning</span>
          <span className="entity-chip entity-chip-soft">{formatNumber(report.ready_check_count, 0)} ready</span>
        </div>
      </div>

      <div className="pnl-trend-summary-grid">
        <article className="pnl-trend-stat-card pnl-trend-stat-card-emphasis">
          <span>Close Posture</span>
          <strong>{report.status}</strong>
          <p>Evaluated {formatDate(report.evaluation_timestamp)}</p>
        </article>

        <article className="pnl-trend-stat-card">
          <span>Active Volume</span>
          <MetricValue value={formatNumber(report.trade_summary.total_active_volume, 0)} />
          <p>
            {formatNumber(report.trade_summary.active_trade_count, 0)} active trade
            {report.trade_summary.active_trade_count === 1 ? '' : 's'} across{' '}
            {formatNumber(report.trade_summary.tracked_book_count, 0)} tracked book
            {report.trade_summary.tracked_book_count === 1 ? '' : 's'}.
          </p>
        </article>

        <article className="pnl-trend-stat-card">
          <span>P&amp;L Total</span>
          <strong>{formatMoney(report.pnl_summary.total_pnl)}</strong>
          <p>
            {formatNumber(report.pnl_summary.priced_trade_count, 0)} priced trade
            {report.pnl_summary.priced_trade_count === 1 ? '' : 's'} under {report.pnl_summary.methodology.toLowerCase()}.
          </p>
        </article>

        <article className="pnl-trend-stat-card">
          <span>Workflow Pressure</span>
          <strong>{formatNumber(report.operations_summary.open_work_item_count, 0)}</strong>
          <p>
            {formatNumber(report.operations_summary.operations_queue_count, 0)} ops queue •{' '}
            {formatNumber(report.operations_summary.settlement_queue_count, 0)} settlement queue •{' '}
            {formatNumber(report.operations_summary.attention_count, 0)} attention
          </p>
        </article>

        <article className="pnl-trend-stat-card">
          <span>Settlement Exceptions</span>
          <strong>{formatNumber(report.settlement_summary.blocked_exception_count, 0)}</strong>
          <p>
            {formatNumber(report.settlement_summary.overdue_invoice_count, 0)} overdue •{' '}
            {formatNumber(report.settlement_summary.disputed_invoice_count, 0)} disputed •{' '}
            {formatNumber(report.settlement_summary.warning_exception_count, 0)} in progress
          </p>
        </article>

        <article className="pnl-trend-stat-card">
          <span>Net Open Accrual</span>
          <strong>{formatMoney(report.accrual_summary.net_open_amount_total)}</strong>
          <p>
            {formatNumber(report.projection_summary.impacted_trade_count, 0)} trade
            {report.projection_summary.impacted_trade_count === 1 ? '' : 's'} touched by current projection issues.
          </p>
        </article>
      </div>

      <div className="shipment-card-actions pnl-trend-active-filters">
        <span>
          Pricing pending {formatNumber(report.trade_summary.pending_pricing_count, 0)} • Pending settlement{' '}
          {formatNumber(report.trade_summary.pending_settlement_count, 0)} • Invoice pending{' '}
          {formatNumber(report.settlement_summary.invoice_pending_count, 0)}
        </span>
        <div className="shipment-card-meta">
          <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
            Open Settlement
          </button>
          <button type="button" className="button button-ghost" onClick={onOpenPrompt}>
            Ask Assistant
          </button>
        </div>
      </div>

      <div className="position-list">
        {report.checks.map((check) => {
          const metricChips = summarizeCheckMetrics(check)

          return (
            <article key={check.key} className="position-card shipment-card">
              <div className="shipment-card-head">
                <div className="shipment-card-copy">
                  <strong>{check.title}</strong>
                  <span>{check.owner_role}</span>
                </div>
                <span className={`status-pill status-pill-${tradingEodTone(check.status)}`}>{check.status}</span>
              </div>
              <p>{check.reason}</p>
              {metricChips.length > 0 ? (
                <div className="shipment-card-meta">
                  {metricChips.map((chip) => (
                    <span key={`${check.key}-${chip}`} className="entity-chip entity-chip-soft">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {report.coverage_notes.length > 0 ? (
        <>
          <div className="section-head">
            <div>
              <span className="eyebrow">Coverage</span>
              <h3>Current Notes</h3>
            </div>
            <p>These notes call out where the close posture is still relying on live projections instead of full historical snapshots.</p>
          </div>
          <div className="position-list">
            {report.coverage_notes.map((note, index) => (
              <article key={`coverage-${index}`} className="position-card">
                <strong>Coverage Note {index + 1}</strong>
                <p>{note}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
