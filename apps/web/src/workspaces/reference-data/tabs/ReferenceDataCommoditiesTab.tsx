import { DataSheet } from '../../../shared/ui/DataSheet'
import {
  CONFIGURABLE_TRANSPORT_MODES,
  formatTransportModeLabel,
} from '../../../shared/transportModes'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataCommoditiesDirectory({
  controller,
  formatCommodityClass,
}: ReferenceDataTabProps) {
  const { referenceCommodityGroups, selectedCommodityCode, startEditCommodity } = controller
  const commoditySheetRows = referenceCommodityGroups.flatMap((group) => group.items)

  return (
    <DataSheet
      label="Commodities"
      description="Browse commodity masters as a sortable-feeling sheet with class context instead of a stacked card list."
      columns={[
        { id: 'code', label: 'Code', width: '9rem', renderCell: (commodity) => commodity.code },
        { id: 'name', label: 'Name', width: '18rem', renderCell: (commodity) => commodity.name },
        {
          id: 'commodity-class',
          label: 'Class',
          width: '10rem',
          renderCell: (commodity) => formatCommodityClass(commodity.commodity_class ?? ''),
        },
        {
          id: 'allowed-transport-modes',
          label: 'Transport',
          width: '18rem',
          renderCell: (commodity) =>
            commodity.allowed_transport_modes?.length
              ? commodity.allowed_transport_modes.map(formatTransportModeLabel).join(', ')
              : 'Default',
        },
        createStatusColumn<(typeof commoditySheetRows)[number]>(),
      ]}
      rows={commoditySheetRows}
      getRowId={(commodity) => commodity.code}
      getRowLabel={(commodity) => `${commodity.code} ${commodity.name}`}
      selectedRowId={selectedCommodityCode}
      onSelectRow={(commodity) => startEditCommodity(commodity.code)}
      emptyMessage="No commodities match the current filter."
    />
  )
}

export function ReferenceDataCommoditiesEditor({
  controller,
  formatCommodityClass,
  formatDate,
}: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedCommodity,
    commodityFormMode,
    commodityForm,
    setCommodityForm,
    startCreateCommodity,
    handleSaveCommodity,
    handleToggleCommodity,
    selectedCommodityUsage,
    commodityFieldErrors,
    commodityFormDirty,
    commodityClassOrder,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateCommodity}>
          New Commodity
        </button>
        {selectedCommodity && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleCommodity(selectedCommodity)}
            disabled={savingReference}
          >
            {selectedCommodity.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {selectedCommodity && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Usage</strong>
            <EditorStateBadge isDirty={commodityFormDirty} />
          </div>
          <p>
            Used by {selectedCommodityUsage?.activeTrades ?? 0} active trade
            {selectedCommodityUsage?.activeTrades === 1 ? '' : 's'} and {selectedCommodityUsage?.totalTrades ?? 0}
            {' '}total trade{selectedCommodityUsage?.totalTrades === 1 ? '' : 's'}.
          </p>
          {selectedCommodity.is_active && (selectedCommodityUsage?.activeTrades ?? 0) > 0 && (
            <p className="field-error">
              Deactivate is blocked while active trades still reference this commodity.
            </p>
          )}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSaveCommodity}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={commodityForm.code}
              onChange={(event) =>
                setCommodityForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={commodityFormMode === 'edit' || savingReference}
            />
            {commodityFieldErrors.code && <small className="field-error">{commodityFieldErrors.code}</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={commodityForm.name}
              onChange={(event) => setCommodityForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {commodityFieldErrors.name && <small className="field-error">{commodityFieldErrors.name}</small>}
          </label>
        </div>

        <label className="field">
          <span>Commodity Class</span>
          <select
            className="control"
            value={commodityForm.commodity_class}
            onChange={(event) =>
              setCommodityForm((current) => ({ ...current, commodity_class: event.target.value }))
            }
            disabled={savingReference}
          >
            {commodityClassOrder.map((commodityClass) => (
              <option key={commodityClass} value={commodityClass}>
                {formatCommodityClass(commodityClass)}
              </option>
            ))}
          </select>
          {commodityFieldErrors.commodity_class && (
            <small className="field-error">{commodityFieldErrors.commodity_class}</small>
          )}
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={commodityForm.description}
            onChange={(event) =>
              setCommodityForm((current) => ({ ...current, description: event.target.value }))
            }
            disabled={savingReference}
          />
        </label>

        <div className="field">
          <span>Allowed Transport Modes</span>
          <div className="toolbar">
            {CONFIGURABLE_TRANSPORT_MODES.map((transportMode) => {
              const selected = commodityForm.allowed_transport_modes.includes(transportMode)
              return (
                <button
                  key={transportMode}
                  type="button"
                  className={`button ${selected ? 'button-secondary' : 'button-ghost'}`}
                  onClick={() =>
                    setCommodityForm((current) => ({
                      ...current,
                      allowed_transport_modes: selected
                        ? current.allowed_transport_modes.filter((value) => value !== transportMode)
                        : [...current.allowed_transport_modes, transportMode],
                    }))
                  }
                  disabled={savingReference}
                >
                  {formatTransportModeLabel(transportMode)}
                </button>
              )
            })}
          </div>
          <small className="form-note">
            Delivery controls and scheduling transport filters will only offer the selected modes for this product.
          </small>
        </div>

        <button
          type="submit"
          className="button button-primary"
          disabled={
            savingReference ||
            Boolean(
              commodityFieldErrors.code ||
                commodityFieldErrors.name ||
                commodityFieldErrors.commodity_class,
            ) ||
            !commodityFormDirty
          }
        >
          {savingReference ? 'Saving...' : commodityFormMode === 'create' ? 'Create Commodity' : 'Save Changes'}
        </button>
      </form>

      {selectedCommodity && commodityFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedCommodity.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Class</span>
            <strong>{formatCommodityClass(selectedCommodity.commodity_class ?? 'OTHER')}</strong>
          </div>
          <div className="detail-row">
            <span>Transport</span>
            <strong>
              {selectedCommodity.allowed_transport_modes?.length
                ? selectedCommodity.allowed_transport_modes.map(formatTransportModeLabel).join(', ')
                : 'Default'}
            </strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedCommodity.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
