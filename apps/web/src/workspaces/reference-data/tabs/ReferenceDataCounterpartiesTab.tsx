import { formatCurrencyAmount, formatDateOnly, formatNumber } from '../../../shared/format'
import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

function formatCounterpartyIdentifiers(counterparty: {
  lei_code?: string | null
  duns_number?: string | null
  ticker_symbol?: string | null
}): string {
  const parts: string[] = []
  if (counterparty.lei_code) {
    parts.push(counterparty.lei_code)
  }
  if (counterparty.duns_number) {
    parts.push(`DUNS ${counterparty.duns_number}`)
  }
  if (counterparty.ticker_symbol) {
    parts.push(counterparty.ticker_symbol)
  }
  return parts.join(' · ') || '—'
}

export function ReferenceDataCounterpartiesDirectory({ controller }: ReferenceDataTabProps) {
  const {
    filteredCounterparties,
    selectedCounterpartyCode,
    startEditCounterparty,
    counterpartyStandards,
    counterpartyCreditReportByCode,
  } = controller

  function formatCounterpartyExposure(counterpartyCode: string): string {
    const report = counterpartyCreditReportByCode.get(counterpartyCode)
    if (!report || report.active_trade_count === 0) {
      return '—'
    }
    if (report.exposure_amount == null || !report.exposure_currency_code) {
      return 'Mixed / pending'
    }
    return formatCurrencyAmount(report.exposure_amount, report.exposure_currency_code)
  }

  function formatCounterpartyUtilization(counterpartyCode: string): string {
    const report = counterpartyCreditReportByCode.get(counterpartyCode)
    if (!report || report.limit_utilization_percent == null) {
      return '—'
    }
    return `${formatNumber(report.limit_utilization_percent ?? null, 1)}%`
  }

  return (
    <DataSheet
      label="Counterparties"
      description="Browse commercial party records and credit posture in a compact sheet while keeping activation and maintenance controls in the side panel."
      columns={[
        { id: 'code', label: 'Code', width: '10rem', renderCell: (counterparty) => counterparty.code },
        { id: 'name', label: 'Name', width: '18rem', renderCell: (counterparty) => counterparty.name },
        { id: 'type', label: 'Type', width: '10rem', renderCell: (counterparty) => counterparty.counterparty_type },
        { id: 'country', label: 'Country', width: '8rem', renderCell: (counterparty) => counterparty.country_code ?? '—' },
        {
          id: 'credit',
          label: 'Credit',
          width: '10rem',
          renderCell: (counterparty) =>
            counterparty.credit_status ?? counterpartyStandards.default_counterparty_credit_status,
        },
        {
          id: 'exposure',
          label: 'Exposure',
          width: '12rem',
          renderCell: (counterparty) => formatCounterpartyExposure(counterparty.code),
        },
        {
          id: 'utilization',
          label: 'Utilization',
          width: '9rem',
          renderCell: (counterparty) => formatCounterpartyUtilization(counterparty.code),
        },
        createStatusColumn<(typeof filteredCounterparties)[number]>(),
      ]}
      rows={filteredCounterparties}
      getRowId={(counterparty) => counterparty.code}
      getRowLabel={(counterparty) => `${counterparty.code} ${counterparty.name}`}
      selectedRowId={selectedCounterpartyCode}
      onSelectRow={(counterparty) => startEditCounterparty(counterparty.code)}
      emptyMessage="No counterparties match the current filter."
    />
  )
}

export function ReferenceDataCounterpartiesEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedCounterparty,
    counterpartyFormMode,
    counterpartyForm,
    setCounterpartyForm,
    counterpartyStandards,
    startCreateCounterparty,
    handleSaveCounterparty,
    handleToggleCounterparty,
    selectedCounterpartyCreditReport,
    selectedCounterpartyExternalCreditSnapshots,
    counterpartyCreditProfileForm,
    setCounterpartyCreditProfileForm,
    handleSaveCounterpartyCreditProfile,
    handlePromoteCounterpartyExternalCreditSnapshot,
    activeCurrencies,
    counterpartyCreditProfileFieldErrors,
    counterpartyCreditProfileDirty,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateCounterparty}>
          New Counterparty
        </button>
        {selectedCounterparty && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleCounterparty(selectedCounterparty)}
            disabled={savingReference}
          >
            {selectedCounterparty.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      <form className="stack-form" onSubmit={handleSaveCounterparty}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={counterpartyForm.code}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={counterpartyFormMode === 'edit' || savingReference}
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={counterpartyForm.name}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, name: event.target.value }))
              }
              disabled={savingReference}
            />
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Short Name</span>
            <input
              className="control"
              value={counterpartyForm.short_name}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, short_name: event.target.value }))
              }
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              className="control"
              value={counterpartyForm.counterparty_type}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, counterparty_type: event.target.value }))
              }
              disabled={savingReference}
            >
              {counterpartyStandards.counterparty_types.map((counterpartyType) => (
                <option key={counterpartyType} value={counterpartyType}>
                  {counterpartyType}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Legal Entity Name</span>
          <input
            className="control"
            value={counterpartyForm.legal_entity_name}
            onChange={(event) =>
              setCounterpartyForm((current) => ({ ...current, legal_entity_name: event.target.value }))
            }
            disabled={savingReference}
          />
        </label>

        <div className="mini-grid">
          <label className="field">
            <span>Country Code</span>
            <input
              className="control"
              value={counterpartyForm.country_code}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))
              }
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Ticker</span>
            <input
              className="control"
              value={counterpartyForm.ticker_symbol}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, ticker_symbol: event.target.value.toUpperCase() }))
              }
              disabled={savingReference}
            />
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>LEI</span>
            <input
              className="control"
              value={counterpartyForm.lei_code}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, lei_code: event.target.value.toUpperCase() }))
              }
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>DUNS</span>
            <input
              className="control"
              value={counterpartyForm.duns_number}
              onChange={(event) =>
                setCounterpartyForm((current) => ({ ...current, duns_number: event.target.value }))
              }
              disabled={savingReference}
            />
          </label>
        </div>

        <label className="field">
          <span>Credit Status</span>
          <select
            className="control"
            value={counterpartyForm.credit_status}
            onChange={(event) =>
              setCounterpartyForm((current) => ({ ...current, credit_status: event.target.value }))
            }
            disabled={savingReference}
          >
            {counterpartyStandards.counterparty_credit_statuses.map((creditStatus) => (
              <option key={creditStatus} value={creditStatus}>
                {creditStatus}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={counterpartyForm.description}
            onChange={(event) =>
              setCounterpartyForm((current) => ({ ...current, description: event.target.value }))
            }
            disabled={savingReference}
          />
        </label>

        <button type="submit" className="button button-primary" disabled={savingReference}>
          {savingReference ? 'Saving...' : counterpartyFormMode === 'create' ? 'Create Counterparty' : 'Save Changes'}
        </button>
      </form>

      {selectedCounterparty && counterpartyFormMode === 'edit' && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Live Credit View</strong>
            <EditorStateBadge isDirty={counterpartyCreditProfileDirty} />
          </div>
          {selectedCounterpartyCreditReport ? (
            <>
              <p>
                Exposure is{' '}
                {selectedCounterpartyCreditReport.exposure_amount != null &&
                selectedCounterpartyCreditReport.exposure_currency_code
                  ? formatCurrencyAmount(
                      selectedCounterpartyCreditReport.exposure_amount,
                      selectedCounterpartyCreditReport.exposure_currency_code,
                    )
                  : selectedCounterpartyCreditReport.active_trade_count > 0
                    ? 'not directly comparable yet'
                    : 'not currently carrying active trades'}
                {' '}across {selectedCounterpartyCreditReport.active_trade_count} active trade
                {selectedCounterpartyCreditReport.active_trade_count === 1 ? '' : 's'}.
              </p>
              {selectedCounterpartyCreditReport.limit_amount != null &&
              selectedCounterpartyCreditReport.limit_currency_code ? (
                <p>
                  Limit is{' '}
                  {formatCurrencyAmount(
                    selectedCounterpartyCreditReport.limit_amount,
                    selectedCounterpartyCreditReport.limit_currency_code,
                  )}
                  {' '}at {formatNumber(selectedCounterpartyCreditReport.limit_utilization_percent ?? null, 1)}%
                  utilization.
                </p>
              ) : (
                <p>No counterparty limit is set yet.</p>
              )}
              {selectedCounterpartyCreditReport.out_of_scope_trade_count > 0 && (
                <p className="field-error">
                  {selectedCounterpartyCreditReport.out_of_scope_trade_count} active trade
                  {selectedCounterpartyCreditReport.out_of_scope_trade_count === 1 ? '' : 's'} sit outside the
                  tracked exposure currency.
                </p>
              )}
              {selectedCounterpartyCreditReport.unpriced_trade_count > 0 && (
                <p className="field-error">
                  {selectedCounterpartyCreditReport.unpriced_trade_count} active trade
                  {selectedCounterpartyCreditReport.unpriced_trade_count === 1 ? '' : 's'} are missing price or
                  volume and are excluded from exposure.
                </p>
              )}
              {selectedCounterpartyCreditReport.limit_breached && (
                <p className="field-error">Current exposure is above the saved counterparty limit.</p>
              )}
              <p className={selectedCounterpartyCreditReport.review_is_due ? 'field-error' : undefined}>
                Review due: {formatDateOnly(selectedCounterpartyCreditReport.review_due_at)}
              </p>
            </>
          ) : (
            <p>Live counterparty credit metrics will appear here after data loads.</p>
          )}
        </div>
      )}

      {selectedCounterparty && counterpartyFormMode === 'edit' && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>External Credit Snapshot</strong>
          </div>
          {selectedCounterpartyExternalCreditSnapshots.length > 0 ? (
            <div className="stack">
              {selectedCounterpartyExternalCreditSnapshots.map((snapshot) => (
                <div key={`${snapshot.provider}-${snapshot.id}`} className="detail-list">
                  <div className="detail-row">
                    <span>Provider</span>
                    <strong>{snapshot.provider}</strong>
                  </div>
                  <div className="detail-row">
                    <span>As Of</span>
                    <strong>{formatDateOnly(snapshot.as_of_date)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Rating</span>
                    <strong>
                      {snapshot.rating_value ?? '—'}
                      {snapshot.rating_outlook ? ` · ${snapshot.rating_outlook}` : ''}
                      {snapshot.rating_scale ? ` · ${snapshot.rating_scale}` : ''}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Score / PD</span>
                    <strong>
                      {snapshot.credit_score != null ? formatNumber(snapshot.credit_score, 2) : '—'}
                      {snapshot.probability_of_default != null
                        ? ` · ${(snapshot.probability_of_default * 100).toFixed(2)}% PD`
                        : ''}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Suggested Limit</span>
                    <strong>
                      {snapshot.recommended_limit_amount != null && snapshot.recommended_limit_currency_code
                        ? formatCurrencyAmount(
                            snapshot.recommended_limit_amount,
                            snapshot.recommended_limit_currency_code,
                          )
                        : '—'}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Match</span>
                    <strong>
                      {snapshot.match_basis ?? 'Manual'}
                      {snapshot.matched_identifier_value ? ` · ${snapshot.matched_identifier_value}` : ''}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Imported</span>
                    <strong>{formatDate(snapshot.downloaded_at)}</strong>
                  </div>
                  {snapshot.commentary ? (
                    <div className="detail-row">
                      <span>Notes</span>
                      <strong>{snapshot.commentary}</strong>
                    </div>
                  ) : null}
                  <div className="toolbar">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handlePromoteCounterpartyExternalCreditSnapshot(snapshot.id)}
                      disabled={
                        savingReference ||
                        (snapshot.rating_value == null && snapshot.recommended_limit_amount == null)
                      }
                    >
                      Promote to Credit Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>
              No external credit snapshot is stored yet.
              {!selectedCounterparty.lei_code &&
              !selectedCounterparty.duns_number &&
              !selectedCounterparty.ticker_symbol
                ? ' Add an LEI, DUNS number, or ticker first so vendor matching has a stable anchor.'
                : ' Import a vendor snapshot from the Admin workspace to populate this view.'}
            </p>
          )}
        </div>
      )}

      {counterpartyFormMode === 'edit' && selectedCounterparty ? (
        <form className="stack-form" onSubmit={handleSaveCounterpartyCreditProfile}>
          <div className="mini-grid">
            <label className="field">
              <span>Credit Rating</span>
              <input
                className="control"
                value={counterpartyCreditProfileForm.credit_rating}
                onChange={(event) =>
                  setCounterpartyCreditProfileForm((current) => ({
                    ...current,
                    credit_rating: event.target.value,
                  }))
                }
                disabled={savingReference}
              />
            </label>
            <label className="field">
              <span>Review Due</span>
              <input
                type="date"
                className="control"
                value={counterpartyCreditProfileForm.review_due_at}
                onChange={(event) =>
                  setCounterpartyCreditProfileForm((current) => ({
                    ...current,
                    review_due_at: event.target.value,
                  }))
                }
                disabled={savingReference}
              />
            </label>
          </div>

          <div className="mini-grid">
            <label className="field">
              <span>Limit Currency</span>
              <select
                className="control"
                value={counterpartyCreditProfileForm.limit_currency_code}
                onChange={(event) =>
                  setCounterpartyCreditProfileForm((current) => ({
                    ...current,
                    limit_currency_code: event.target.value,
                  }))
                }
                disabled={savingReference || activeCurrencies.length === 0}
              >
                <option value="">No limit</option>
                {activeCurrencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}{currency.symbol ? ` • ${currency.symbol}` : ''}
                  </option>
                ))}
              </select>
              {counterpartyCreditProfileFieldErrors.limit_currency_code && (
                <small className="field-error">{counterpartyCreditProfileFieldErrors.limit_currency_code}</small>
              )}
            </label>
            <label className="field">
              <span>Limit Amount</span>
              <input
                className="control"
                inputMode="decimal"
                value={counterpartyCreditProfileForm.limit_amount}
                onChange={(event) =>
                  setCounterpartyCreditProfileForm((current) => ({
                    ...current,
                    limit_amount: event.target.value,
                  }))
                }
                disabled={savingReference}
              />
              {counterpartyCreditProfileFieldErrors.limit_amount && (
                <small className="field-error">{counterpartyCreditProfileFieldErrors.limit_amount}</small>
              )}
            </label>
          </div>

          <label className="field">
            <span>Breach Action</span>
            <select
              className="control"
              value={counterpartyCreditProfileForm.breach_action}
              onChange={(event) =>
                setCounterpartyCreditProfileForm((current) => ({
                  ...current,
                  breach_action: event.target.value,
                }))
              }
              disabled={savingReference}
            >
              {counterpartyStandards.counterparty_credit_breach_actions.map((breachAction) => (
                <option key={breachAction} value={breachAction}>
                  {breachAction}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Notes</span>
            <textarea
              className="control control-textarea"
              value={counterpartyCreditProfileForm.notes}
              onChange={(event) =>
                setCounterpartyCreditProfileForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              disabled={savingReference}
            />
          </label>

          <button
            type="submit"
            className="button button-primary"
            disabled={
              savingReference ||
              Boolean(
                counterpartyCreditProfileFieldErrors.limit_currency_code ||
                  counterpartyCreditProfileFieldErrors.limit_amount,
              ) ||
              !counterpartyCreditProfileDirty
            }
          >
            {savingReference ? 'Saving...' : 'Save Credit Profile'}
          </button>
        </form>
      ) : (
        <div className="reference-usage-card">
          <p>Save the counterparty first before assigning review dates, limits, or breach handling.</p>
        </div>
      )}

      {selectedCounterparty && counterpartyFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedCounterparty.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Type</span>
            <strong>{selectedCounterparty.counterparty_type}</strong>
          </div>
          <div className="detail-row">
            <span>Country</span>
            <strong>{selectedCounterparty.country_code ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Identifiers</span>
            <strong>{formatCounterpartyIdentifiers(selectedCounterparty)}</strong>
          </div>
          <div className="detail-row">
            <span>Credit Status</span>
            <strong>
              {selectedCounterparty.credit_status ?? counterpartyStandards.default_counterparty_credit_status}
            </strong>
          </div>
          <div className="detail-row">
            <span>Breach Action</span>
            <strong>
              {selectedCounterpartyCreditReport?.breach_action ??
                counterpartyStandards.default_counterparty_credit_breach_action}
            </strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedCounterparty.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
