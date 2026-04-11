import { formatCurrencyAmount } from '../../shared/format'
import type { WorkspaceTile } from '../../shared/ui/TileLayout'
import { buildAsyncReportTile } from './reportTileScaffold'
import { ALL_FILTER_VALUE } from './settlementReportLens'
import type { SettlementReportLensState } from './useSettlementReportLens'

type SettlementReportTileOptions = {
  settlement: SettlementReportLensState
  formatNumber: (value: number | null, digits?: number) => string
  formatDate: (value: string | null | undefined) => string
  formatDateOnly: (value: string | null | undefined) => string
  onOpenSettlement: () => void
  onOpenTrade: (tradeId: string) => void
}

export function buildSettlementReportTiles({
  settlement,
  formatNumber,
  formatDate,
  formatDateOnly,
  onOpenSettlement,
  onOpenTrade,
}: SettlementReportTileOptions): WorkspaceTile[] {
  return [
    {
      id: 'reports-settlement-lens',
      eyebrow: 'Lens',
      title: settlement.activePresetName ? `${settlement.activePresetName} preset active` : 'Settlement Lens',
      description: 'Filter the settlement reports, save named desk views, and keep the current lens pinned between sessions.',
      span: 'full',
      availableSpans: ['full', 'wide'],
      content: (
        <div className="pnl-trend-copy">
          <div className="pnl-trend-topbar">
            <div className="pnl-trend-copy">
              <span>Settlement Filters</span>
              <p>
                Currency applies across aging, forecast, and exceptions. Book, counterparty, exception type, and
                severity narrow the server-side settlement reports. Signed-in users save presets to the shared API;
                signed-out sessions fall back to this browser only.
              </p>
            </div>
            <div className="pnl-trend-toolbar">
              <button
                type="button"
                className="button button-ghost pnl-trend-reset-button"
                onClick={settlement.resetSettlementFilters}
              >
                Reset Filters
              </button>
              {settlement.activePreset?.canEdit ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void settlement.handleDeleteActivePreset()}
                  disabled={settlement.presetBusy}
                >
                  Delete Active Preset
                </button>
              ) : null}
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void settlement.handleSavePreset()}
                disabled={settlement.presetBusy}
              >
                {settlement.presetBusy ? 'Saving...' : 'Save Preset'}
              </button>
            </div>
          </div>
          <div className="pnl-trend-filter-grid">
            <label className="field">
              <span>Book</span>
              <select
                className="control"
                value={settlement.settlementFilters.book}
                onChange={(event) => settlement.updateSettlementFilter('book', event.target.value)}
              >
                <option value={ALL_FILTER_VALUE}>All Books</option>
                {settlement.filterOptions.books.map((book) => (
                  <option key={book} value={book}>
                    {book}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Counterparty</span>
              <select
                className="control"
                value={settlement.settlementFilters.counterparty}
                onChange={(event) => settlement.updateSettlementFilter('counterparty', event.target.value)}
              >
                <option value={ALL_FILTER_VALUE}>All Counterparties</option>
                {settlement.filterOptions.counterparties.map((counterparty) => (
                  <option key={counterparty} value={counterparty}>
                    {counterparty}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Currency</span>
              <select
                className="control"
                value={settlement.settlementFilters.currency}
                onChange={(event) => settlement.updateSettlementFilter('currency', event.target.value)}
              >
                <option value={ALL_FILTER_VALUE}>All Currencies</option>
                {settlement.filterOptions.currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Exception Type</span>
              <select
                className="control"
                value={settlement.settlementFilters.exceptionType}
                onChange={(event) => settlement.updateSettlementFilter('exceptionType', event.target.value)}
              >
                <option value={ALL_FILTER_VALUE}>All Exception Types</option>
                {settlement.filterOptions.exceptionTypes.map((exceptionType) => (
                  <option key={exceptionType} value={exceptionType}>
                    {exceptionType.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Severity</span>
              <select
                className="control"
                value={settlement.settlementFilters.severity}
                onChange={(event) => settlement.updateSettlementFilter('severity', event.target.value)}
              >
                <option value={ALL_FILTER_VALUE}>All Severities</option>
                {settlement.filterOptions.severities.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity === 'blocked' ? 'Blocked' : 'In Progress'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Preset Name</span>
              <input
                className="control"
                value={settlement.presetNameInput}
                onChange={(event) => {
                  settlement.setPresetNameInput(event.target.value)
                  settlement.clearPresetError()
                }}
                placeholder="Midwest cash watch"
              />
            </label>
            <label className="field">
              <span>Preset Scope</span>
              <select
                className="control"
                value={settlement.presetScopeInput}
                onChange={(event) => settlement.setPresetScopeInput(event.target.value as 'PERSONAL' | 'SHARED')}
              >
                <option value="PERSONAL">My Preset</option>
                <option value="SHARED">Shared with Desk</option>
              </select>
            </label>
          </div>
          {settlement.presetError ? <p className="field-error">{settlement.presetError}</p> : null}
          <div className="shipment-card-actions pnl-trend-active-filters">
            <span>
              Showing {formatNumber(settlement.agingRows.length, 0)} aging rows, {formatNumber(settlement.cashPoints.length, 0)} cash
              forecast point{settlement.cashPoints.length === 1 ? '' : 's'}, and {formatNumber(settlement.exceptionRows.length, 0)} settlement
              exception{settlement.exceptionRows.length === 1 ? '' : 's'}.
            </span>
            <div className="shipment-card-meta">
              {settlement.activePresetName ? (
                <span className="entity-chip entity-chip-soft">Preset {settlement.activePresetName}</span>
              ) : null}
              {settlement.activePreset ? (
                <span className="entity-chip entity-chip-soft">
                  {settlement.activePreset.scope === 'SHARED' ? 'Shared preset' : 'Personal preset'}
                </span>
              ) : null}
              {settlement.settlementFilterActive ? (
                settlement.settlementFilterChips.map((chip) => (
                  <span key={chip} className="entity-chip entity-chip-soft">
                    {chip}
                  </span>
                ))
              ) : (
                <span className="entity-chip entity-chip-soft">No settlement filters applied</span>
              )}
            </div>
          </div>
          {settlement.savedPresets.length > 0 ? (
            <div className="pnl-trend-presets">
              {settlement.savedPresets.map((preset) => (
                <button
                  key={preset.presetId ?? `${preset.scope}-${preset.name}`}
                  type="button"
                  className={`tab-pill ${
                    settlement.activePreset &&
                    ((settlement.activePreset.presetId !== null && settlement.activePreset.presetId === preset.presetId) ||
                      (settlement.activePreset.presetId === null &&
                        settlement.activePreset.name === preset.name &&
                        settlement.activePreset.scope === preset.scope))
                      ? 'is-active'
                      : ''
                  }`}
                  onClick={() => settlement.applyPreset(preset)}
                >
                  {preset.scope === 'SHARED' ? `${preset.name} - Shared` : preset.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="pnl-trend-note">Save the current lens once it matches a desk workflow you expect to reuse.</p>
          )}
        </div>
      ),
    },
    buildAsyncReportTile({
      id: 'reports-settlement-aging',
      eyebrow: 'Settlement',
      title: 'Settlement Aging',
      description:
        'Open invoice exposure grouped into current and past-due buckets, with disputed cash called out instead of staying buried in the settlement queue.',
      span: 'full',
      availableSpans: ['full', 'wide'],
      loading: settlement.settlementLoading,
      error: settlement.settlementError,
      isEmpty: !settlement.settlementAging || settlement.agingCurrencySummaries.length === 0,
      emptyTitle: settlement.settlementFilterActive ? 'No aging rows match the current lens' : 'No settlement aging yet',
      emptyDescription: settlement.settlementFilterActive
        ? 'Reset the settlement lens or choose a broader preset to restore the aging board.'
        : 'Open invoices will populate aging once the settlement ledger starts carrying unpaid cash exposure.',
      skeletonBlockCount: 2,
      renderContent: () => (
        <>
          <div className="shipment-card-actions">
            <span>
              {formatNumber(
                settlement.agingRows.reduce((sum, row) => sum + row.invoice_count, 0),
                0,
              )}{' '}
              open invoice{settlement.agingRows.reduce((sum, row) => sum + row.invoice_count, 0) === 1 ? '' : 's'} as of{' '}
              {formatDateOnly(settlement.settlementAging?.as_of)}
            </span>
            <div className="shipment-card-meta">
              <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
                Open Settlement
              </button>
              <button type="button" className="button button-secondary" onClick={settlement.exportSettlementAging}>
                Export CSV
              </button>
            </div>
          </div>
          <div className="dashboard-report-grid">
            {settlement.agingCurrencySummaries.map((summary) => (
              <article key={summary.currency_code} className="dashboard-report-card">
                <span>{summary.currency_code} Open</span>
                <strong>{formatCurrencyAmount(summary.total_outstanding_amount, summary.currency_code)}</strong>
                <p>
                  Current {formatCurrencyAmount(summary.current_amount, summary.currency_code)} • 1-7{' '}
                  {formatCurrencyAmount(summary.past_due_1_7_amount, summary.currency_code)} • 8-30{' '}
                  {formatCurrencyAmount(summary.past_due_8_30_amount, summary.currency_code)} • 31+{' '}
                  {formatCurrencyAmount(summary.past_due_31_plus_amount, summary.currency_code)}
                </p>
              </article>
            ))}
          </div>
          <div className="position-list">
            {settlement.agingRows.slice(0, 8).map((row) => (
              <article
                key={`${row.counterparty_code ?? 'UNSPECIFIED'}-${row.book}-${row.currency_code}`}
                className="position-card shipment-card"
              >
                <div className="shipment-card-head">
                  <div className="shipment-card-copy">
                    <strong>{row.counterparty_code ?? 'Counterparty TBD'}</strong>
                    <span>
                      {row.book} • {row.trade_count} trade{row.trade_count === 1 ? '' : 's'} • {row.invoice_count} invoice
                      {row.invoice_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span
                    className={`status-pill status-pill-${row.overdue_invoice_count > 0 || row.disputed_invoice_count > 0 ? 'blocked' : 'active'}`}
                  >
                    {formatCurrencyAmount(row.total_outstanding_amount, row.currency_code)}
                  </span>
                </div>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">
                    Current {formatCurrencyAmount(row.current_amount, row.currency_code)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    1-7 {formatCurrencyAmount(row.past_due_1_7_amount, row.currency_code)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    8-30 {formatCurrencyAmount(row.past_due_8_30_amount, row.currency_code)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    31+ {formatCurrencyAmount(row.past_due_31_plus_amount, row.currency_code)}
                  </span>
                  {row.disputed_amount > 0 ? (
                    <span className="entity-chip entity-chip-soft">
                      Disputed {formatCurrencyAmount(row.disputed_amount, row.currency_code)}
                    </span>
                  ) : null}
                </div>
                <div className="shipment-card-copy">
                  <p>
                    {row.overdue_invoice_count} overdue • {row.disputed_invoice_count} disputed • Oldest due{' '}
                    {formatDate(row.oldest_due_at)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      ),
    }),
    buildAsyncReportTile({
      id: 'reports-cash-forecast',
      eyebrow: 'Cash',
      title: 'Cash Forecast',
      description: 'Expected receipts from open invoices versus actual settlement receipts, using the live ledger instead of desk-side spreadsheets.',
      span: 'full',
      availableSpans: ['full', 'wide'],
      loading: settlement.settlementLoading,
      error: settlement.settlementError,
      isEmpty: !settlement.cashForecast || settlement.cashCurrencySummaries.length === 0,
      emptyTitle: settlement.settlementFilterActive ? 'No cash forecast rows match the current lens' : 'No cash forecast yet',
      emptyDescription: settlement.settlementFilterActive
        ? 'Reset the settlement lens or choose a broader preset to restore the cash outlook.'
        : 'Cash forecast points will appear once invoice due dates or payment receipts have been recorded.',
      skeletonBlockCount: 2,
      renderContent: () => (
        <>
          <div className="shipment-card-actions">
            <span>
              {settlement.cashForecast?.horizon_days}-day horizon from {formatDateOnly(settlement.cashForecast?.as_of)}.
            </span>
            <div className="shipment-card-meta">
              <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
                Open Settlement
              </button>
              <button type="button" className="button button-secondary" onClick={settlement.exportCashForecast}>
                Export CSV
              </button>
            </div>
          </div>
          <div className="dashboard-report-grid">
            {settlement.cashCurrencySummaries.map((summary) => (
              <article key={summary.currency_code} className="dashboard-report-card">
                <span>{summary.currency_code} Horizon</span>
                <strong>{formatCurrencyAmount(summary.expected_horizon_amount, summary.currency_code)}</strong>
                <p>
                  Open {formatCurrencyAmount(summary.open_outstanding_amount, summary.currency_code)} • Overdue{' '}
                  {formatCurrencyAmount(summary.overdue_outstanding_amount, summary.currency_code)} • Received{' '}
                  {formatCurrencyAmount(summary.received_horizon_amount, summary.currency_code)}
                </p>
              </article>
            ))}
          </div>
          <div className="position-list">
            {settlement.cashPoints.slice(0, 12).map((point) => (
              <article key={`${point.forecast_date}-${point.currency_code}`} className="position-card">
                <div>
                  <strong>{formatDate(point.forecast_date)}</strong>
                  <span>
                    {point.currency_code} • {point.expected_invoice_count} due • {point.received_payment_count} received
                  </span>
                </div>
                <div className="position-value">
                  <b>{formatCurrencyAmount(point.expected_amount, point.currency_code)}</b>
                  <span>Expected</span>
                </div>
                <div className="shipment-card-copy">
                  <p>Received {formatCurrencyAmount(point.received_amount, point.currency_code)}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      ),
    }),
    buildAsyncReportTile({
      id: 'reports-settlement-exceptions',
      eyebrow: 'Exceptions',
      title: 'Settlement Watchlist',
      description: 'A single queue for disputed invoices, short pays, and overdue cash so operators can work what actually needs intervention.',
      span: 'full',
      availableSpans: ['full', 'wide'],
      loading: settlement.settlementLoading,
      error: settlement.settlementError,
      isEmpty: !settlement.settlementExceptions || settlement.exceptionRows.length === 0,
      emptyTitle: settlement.settlementFilterActive ? 'No settlement exceptions match the current lens' : 'No active settlement exceptions',
      emptyDescription: settlement.settlementFilterActive
        ? 'Reset the settlement lens or apply another preset to widen the watchlist.'
        : 'The watchlist will populate when invoices are disputed, partially short paid, or pass due without settlement.',
      skeletonBlockCount: 2,
      renderContent: () => (
        <>
          <div className="shipment-card-actions">
            <span>
              {formatNumber(settlement.blockedExceptionCount, 0)} blocked • {formatNumber(settlement.warningExceptionCount, 0)} in-progress
              exception{settlement.exceptionRows.length === 1 ? '' : 's'}.
            </span>
            <div className="shipment-card-meta">
              <button type="button" className="button button-ghost" onClick={onOpenSettlement}>
                Open Settlement
              </button>
              <button type="button" className="button button-secondary" onClick={settlement.exportSettlementExceptions}>
                Export CSV
              </button>
            </div>
          </div>
          <div className="dashboard-report-grid">
            {settlement.exceptionSummaries.map((summary) => (
              <article key={`${summary.exception_type}-${summary.currency_code}`} className="dashboard-report-card">
                <span>
                  {summary.exception_type.replaceAll('_', ' ')} • {summary.currency_code}
                </span>
                <strong>{formatNumber(summary.exception_count, 0)}</strong>
                <p>
                  {summary.affected_trade_count} trade{summary.affected_trade_count === 1 ? '' : 's'} • Open amount{' '}
                  {formatCurrencyAmount(summary.total_outstanding_amount, summary.currency_code)}
                </p>
              </article>
            ))}
          </div>
          <div className="position-list">
            {settlement.exceptionRows.slice(0, 10).map((row) => (
              <article key={`${row.exception_type}-${row.invoice_id}-${row.trade_id}`} className="position-card shipment-card">
                <div className="shipment-card-head">
                  <div className="shipment-card-copy">
                    <strong>{row.trade_id}</strong>
                    <span>
                      {row.exception_type.replaceAll('_', ' ')} • {row.counterparty_code ?? 'Counterparty TBD'} • {row.book}
                    </span>
                  </div>
                  <span className={`status-pill status-pill-${row.severity}`}>
                    {row.severity === 'blocked' ? 'Escalate' : 'Monitor'}
                  </span>
                </div>
                <div className="shipment-card-meta">
                  <span className="entity-chip entity-chip-soft">{row.invoice_number}</span>
                  <span className="entity-chip entity-chip-soft">{row.commodity}</span>
                  <span className="entity-chip entity-chip-soft">
                    Outstanding {formatCurrencyAmount(row.outstanding_amount, row.currency_code)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    Paid {formatCurrencyAmount(row.total_paid_amount, row.currency_code)}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    {row.owner ? `Owner ${row.owner}` : 'Unassigned'}
                  </span>
                </div>
                <div className="shipment-card-copy">
                  <p>{row.summary}</p>
                  <p>
                    Due {formatDate(row.due_at)} • Last receipt {formatDate(row.last_received_at)} • Payment{' '}
                    {row.payment_status.replaceAll('_', ' ')}
                  </p>
                </div>
                <div className="shipment-card-actions">
                  <span>
                    Invoice {row.invoice_status.replaceAll('_', ' ')} • Settlement {row.settlement_status.replaceAll('_', ' ')}
                  </span>
                  <div className="shipment-card-meta">
                    <button type="button" className="button button-ghost" onClick={() => onOpenTrade(row.trade_id)}>
                      Open Trade
                    </button>
                    <button type="button" className="button button-secondary" onClick={onOpenSettlement}>
                      Open Settlement
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ),
    }),
  ]
}
