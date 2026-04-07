import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataUnitsDirectory({
  controller,
  formatCommodityClass,
}: ReferenceDataTabProps) {
  const { filteredUnits, selectedUnitCode, startEditUnit } = controller

  return (
    <DataSheet
      label="Units"
      description="Inspect unit metadata in a single grid so operators can scan dimensions, class mappings, and precision together."
      columns={[
        { id: 'code', label: 'Code', width: '8rem', renderCell: (unit) => unit.code },
        { id: 'name', label: 'Name', width: '16rem', renderCell: (unit) => unit.name },
        { id: 'dimension', label: 'Dimension', width: '10rem', renderCell: (unit) => unit.dimension },
        {
          id: 'commodity-class',
          label: 'Class',
          width: '10rem',
          renderCell: (unit) => (unit.commodity_class ? formatCommodityClass(unit.commodity_class) : '—'),
        },
        { id: 'precision', label: 'Precision', align: 'end', width: '7rem', renderCell: (unit) => unit.precision },
        createStatusColumn<(typeof filteredUnits)[number]>(),
      ]}
      rows={filteredUnits}
      getRowId={(unit) => unit.code}
      getRowLabel={(unit) => `${unit.code} ${unit.name}`}
      selectedRowId={selectedUnitCode}
      onSelectRow={(unit) => startEditUnit(unit.code)}
      emptyMessage="No units match the current filter."
    />
  )
}

export function ReferenceDataUnitsEditor({
  controller,
  formatCommodityClass,
  formatDate,
}: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedUnit,
    unitFormMode,
    unitForm,
    setUnitForm,
    startCreateUnit,
    handleSaveUnit,
    handleToggleUnit,
    selectedUnitUsage,
    unitFieldErrors,
    unitFormDirty,
    commodityClassOrder,
  } = controller

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateUnit}>
          New Unit
        </button>
        {selectedUnit && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleUnit(selectedUnit)}
            disabled={savingReference}
          >
            {selectedUnit.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {selectedUnit && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Usage</strong>
            <EditorStateBadge isDirty={unitFormDirty} />
          </div>
          <p>
            Referenced by {selectedUnitUsage?.activeChildren ?? 0} active price
            {' '}{selectedUnitUsage?.activeChildren === 1 ? 'index' : 'indices'} and {selectedUnitUsage?.totalChildren ?? 0}
            {' '}total price {selectedUnitUsage?.totalChildren === 1 ? 'index' : 'indices'}.
          </p>
          {selectedUnit.is_active && (selectedUnitUsage?.activeChildren ?? 0) > 0 && (
            <p className="field-error">
              Deactivate is blocked while active price indices still reference this unit.
            </p>
          )}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSaveUnit}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={unitForm.code}
              onChange={(event) => setUnitForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              disabled={unitFormMode === 'edit' || savingReference}
            />
            {unitFieldErrors.code && <small className="field-error">{unitFieldErrors.code}</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={unitForm.name}
              onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {unitFieldErrors.name && <small className="field-error">{unitFieldErrors.name}</small>}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Commodity Class</span>
            <select
              className="control"
              value={unitForm.commodity_class}
              onChange={(event) => setUnitForm((current) => ({ ...current, commodity_class: event.target.value }))}
              disabled={savingReference}
            >
              {commodityClassOrder.map((commodityClass) => (
                <option key={commodityClass} value={commodityClass}>
                  {formatCommodityClass(commodityClass)}
                </option>
              ))}
            </select>
            {unitFieldErrors.commodity_class && (
              <small className="field-error">{unitFieldErrors.commodity_class}</small>
            )}
          </label>
          <label className="field">
            <span>Dimension</span>
            <select
              className="control"
              value={unitForm.dimension}
              onChange={(event) => setUnitForm((current) => ({ ...current, dimension: event.target.value }))}
              disabled={savingReference}
            >
              {['VOLUME', 'MASS', 'ENERGY', 'POWER'].map((dimension) => (
                <option key={dimension} value={dimension}>
                  {dimension}
                </option>
              ))}
            </select>
            {unitFieldErrors.dimension && <small className="field-error">{unitFieldErrors.dimension}</small>}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Base Unit Code</span>
            <input
              className="control"
              value={unitForm.base_unit_code}
              onChange={(event) =>
                setUnitForm((current) => ({ ...current, base_unit_code: event.target.value.toUpperCase() }))
              }
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Conversion Factor</span>
            <input
              className="control"
              inputMode="decimal"
              value={unitForm.conversion_factor}
              onChange={(event) => setUnitForm((current) => ({ ...current, conversion_factor: event.target.value }))}
              disabled={savingReference}
            />
          </label>
        </div>

        <label className="field">
          <span>Precision</span>
          <input
            className="control"
            inputMode="numeric"
            value={unitForm.precision}
            onChange={(event) => setUnitForm((current) => ({ ...current, precision: event.target.value }))}
            disabled={savingReference}
          />
          {unitFieldErrors.precision && <small className="field-error">{unitFieldErrors.precision}</small>}
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={unitForm.description}
            onChange={(event) => setUnitForm((current) => ({ ...current, description: event.target.value }))}
            disabled={savingReference}
          />
        </label>

        <button
          type="submit"
          className="button button-primary"
          disabled={
            savingReference ||
            Boolean(
              unitFieldErrors.code ||
                unitFieldErrors.name ||
                unitFieldErrors.commodity_class ||
                unitFieldErrors.dimension ||
                unitFieldErrors.precision,
            ) ||
            !unitFormDirty
          }
        >
          {savingReference ? 'Saving...' : unitFormMode === 'create' ? 'Create Unit' : 'Save Changes'}
        </button>
      </form>

      {selectedUnit && unitFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedUnit.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Dimension</span>
            <strong>{selectedUnit.dimension}</strong>
          </div>
          <div className="detail-row">
            <span>Precision</span>
            <strong>{selectedUnit.precision}</strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedUnit.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
