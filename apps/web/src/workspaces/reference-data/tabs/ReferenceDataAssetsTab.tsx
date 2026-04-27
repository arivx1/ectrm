import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'
import { AssetMapPanel } from './AssetMapPanel'

function formatCapacity(value: number | null | undefined, unitCode: string | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toLocaleString()}${unitCode ? ` ${unitCode}` : ''}`
}

function formatCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return '—'
  }

  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

export function ReferenceDataAssetsDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredAssets, locations, selectedAssetCode, startEditAsset } = controller

  return (
    <div className="reference-stack">
      <AssetMapPanel
        assets={filteredAssets}
        locations={locations}
        selectedAssetCode={selectedAssetCode}
        onSelectAsset={startEditAsset}
      />

      <DataSheet
        label="Assets"
        description="Review physical and processing asset masters in a compact sheet before maintaining details in the side editor."
        columns={[
          { id: 'code', label: 'Code', width: '10rem', renderCell: (asset) => asset.code },
          { id: 'name', label: 'Name', width: '18rem', renderCell: (asset) => asset.name },
          { id: 'class', label: 'Class', width: '12rem', renderCell: (asset) => asset.asset_class },
          { id: 'type', label: 'Type', width: '12rem', renderCell: (asset) => asset.asset_type },
          { id: 'reality', label: 'Reality', width: '8rem', renderCell: (asset) => asset.asset_reality },
          { id: 'commodity', label: 'Commodity', width: '10rem', renderCell: (asset) => asset.commodity_code ?? '—' },
          { id: 'location', label: 'Location', width: '10rem', renderCell: (asset) => asset.location_code ?? '—' },
          {
            id: 'coordinates',
            label: 'Asset Point',
            width: '12rem',
            renderCell: (asset) => formatCoordinatePair(asset.latitude, asset.longitude),
          },
          {
            id: 'capacity',
            label: 'Capacity',
            width: '12rem',
            renderCell: (asset) => formatCapacity(asset.capacity_value, asset.capacity_unit_code),
          },
          createStatusColumn<(typeof filteredAssets)[number]>(),
        ]}
        rows={filteredAssets}
        getRowId={(asset) => asset.code}
        getRowLabel={(asset) => `${asset.code} ${asset.name}`}
        selectedRowId={selectedAssetCode}
        onSelectRow={(asset) => startEditAsset(asset.code)}
        emptyMessage="No assets match the current filter."
      />
    </div>
  )
}

export function ReferenceDataAssetsEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedAsset,
    assetFormMode,
    assetForm,
    setAssetForm,
    assetStandards,
    activeCommodities,
    activeLocations,
    activeUnits,
    startCreateAsset,
    handleSaveAsset,
    handleToggleAsset,
    assetFieldErrors,
    assetFormDirty,
  } = controller

  const assetTypeOptions =
    assetStandards.asset_types_by_class[assetForm.asset_class] ??
    assetStandards.asset_types_by_class[assetStandards.default_asset_class] ??
    []

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateAsset}>
          New Asset
        </button>
        {selectedAsset ? (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleAsset(selectedAsset)}
            disabled={savingReference}
          >
            {selectedAsset.is_active ? 'Deactivate' : 'Activate'}
          </button>
        ) : null}
      </div>

      {selectedAsset ? (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Asset Status</strong>
            <EditorStateBadge isDirty={assetFormDirty} />
          </div>
          <p>
            {selectedAsset.asset_class} · {selectedAsset.asset_type} · {selectedAsset.asset_reality} · {selectedAsset.operating_status}
          </p>
          <p>
            {selectedAsset.location_code ?? 'No location'} · {selectedAsset.commodity_code ?? 'No commodity'}
          </p>
          <p>
            {formatCoordinatePair(selectedAsset.latitude, selectedAsset.longitude)} ·{' '}
            {selectedAsset.geometry_geojson ? 'GeoJSON geometry present' : 'No asset GeoJSON'}
          </p>
        </div>
      ) : null}

      <form className="stack-form" onSubmit={handleSaveAsset}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={assetForm.code}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={assetFormMode === 'edit' || savingReference}
            />
            {assetFieldErrors.code ? <small className="field-error">{assetFieldErrors.code}</small> : null}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={assetForm.name}
              onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {assetFieldErrors.name ? <small className="field-error">{assetFieldErrors.name}</small> : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Asset Class</span>
            <select
              className="control"
              value={assetForm.asset_class}
              onChange={(event) =>
                setAssetForm((current) => {
                  const nextAssetClass = event.target.value
                  const defaultAssetType =
                    assetStandards.default_asset_type_by_class[nextAssetClass] ??
                    assetStandards.asset_types_by_class[nextAssetClass]?.[0] ??
                    ''
                  return {
                    ...current,
                    asset_class: nextAssetClass,
                    asset_type: defaultAssetType,
                  }
                })
              }
              disabled={savingReference}
            >
              {assetStandards.asset_classes.map((assetClass) => (
                <option key={assetClass} value={assetClass}>
                  {assetClass}
                </option>
              ))}
            </select>
            {assetFieldErrors.asset_class ? (
              <small className="field-error">{assetFieldErrors.asset_class}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Asset Type</span>
            <select
              className="control"
              value={assetForm.asset_type}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, asset_type: event.target.value }))
              }
              disabled={savingReference}
            >
              {assetTypeOptions.map((assetType) => (
                <option key={assetType} value={assetType}>
                  {assetType}
                </option>
              ))}
            </select>
            {assetFieldErrors.asset_type ? (
              <small className="field-error">{assetFieldErrors.asset_type}</small>
            ) : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Commodity</span>
            <select
              className="control"
              value={assetForm.commodity_code}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, commodity_code: event.target.value }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {activeCommodities.map((commodity) => (
                <option key={commodity.code} value={commodity.code}>
                  {commodity.code}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Location</span>
            <select
              className="control"
              value={assetForm.location_code}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, location_code: event.target.value }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {activeLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Latitude</span>
            <input
              className="control"
              value={assetForm.latitude}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, latitude: event.target.value }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
            {assetFieldErrors.coordinates ? (
              <small className="field-error">{assetFieldErrors.coordinates}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              className="control"
              value={assetForm.longitude}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, longitude: event.target.value }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
          </label>
        </div>

        <label className="field">
          <span>Geometry GeoJSON</span>
          <textarea
            className="control control-textarea"
            value={assetForm.geometry_geojson}
            onChange={(event) =>
              setAssetForm((current) => ({ ...current, geometry_geojson: event.target.value }))
            }
            disabled={savingReference}
            placeholder='Optional: {"type":"LineString","coordinates":[[-104.5,31.7],[-103.1,31.8]]}'
          />
          {assetFieldErrors.geometry_geojson ? (
            <small className="field-error">{assetFieldErrors.geometry_geojson}</small>
          ) : (
            <small className="form-note">
              Map precedence is GeoJSON, then direct asset coordinates, then the linked location.
            </small>
          )}
        </label>

        <div className="mini-grid">
          <label className="field">
            <span>Asset Reality</span>
            <select
              className="control"
              value={assetForm.asset_reality}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, asset_reality: event.target.value }))
              }
              disabled={savingReference}
            >
              {assetStandards.asset_realities.map((assetReality) => (
                <option key={assetReality} value={assetReality}>
                  {assetReality}
                </option>
              ))}
            </select>
            {assetFieldErrors.asset_reality ? (
              <small className="field-error">{assetFieldErrors.asset_reality}</small>
            ) : null}
          </label>
          <div />
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Capacity</span>
            <input
              className="control"
              value={assetForm.capacity_value}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, capacity_value: event.target.value }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
            {assetFieldErrors.capacity ? (
              <small className="field-error">{assetFieldErrors.capacity}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Capacity Unit</span>
            <select
              className="control"
              value={assetForm.capacity_unit_code}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, capacity_unit_code: event.target.value }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {activeUnits.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code}
                </option>
              ))}
            </select>
            {assetFieldErrors.capacity_unit_code ? (
              <small className="field-error">{assetFieldErrors.capacity_unit_code}</small>
            ) : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Operator</span>
            <input
              className="control"
              value={assetForm.operator_name}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, operator_name: event.target.value }))
              }
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Operating Status</span>
            <select
              className="control"
              value={assetForm.operating_status}
              onChange={(event) =>
                setAssetForm((current) => ({ ...current, operating_status: event.target.value }))
              }
              disabled={savingReference}
            >
              {assetStandards.operating_statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {assetFieldErrors.operating_status ? (
              <small className="field-error">{assetFieldErrors.operating_status}</small>
            ) : null}
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={assetForm.description}
            onChange={(event) =>
              setAssetForm((current) => ({ ...current, description: event.target.value }))
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
              assetFieldErrors.code ||
                assetFieldErrors.name ||
                assetFieldErrors.asset_class ||
                assetFieldErrors.asset_type ||
                assetFieldErrors.asset_reality ||
                assetFieldErrors.coordinates ||
                assetFieldErrors.geometry_geojson ||
                assetFieldErrors.capacity ||
                assetFieldErrors.capacity_unit_code ||
                assetFieldErrors.operating_status,
            ) ||
            !assetFormDirty
          }
        >
          {savingReference ? 'Saving...' : assetFormMode === 'create' ? 'Create Asset' : 'Save Changes'}
        </button>
      </form>

      {selectedAsset && assetFormMode === 'edit' ? (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedAsset.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Operating</span>
            <strong>{selectedAsset.operating_status}</strong>
          </div>
          <div className="detail-row">
            <span>Reality</span>
            <strong>{selectedAsset.asset_reality}</strong>
          </div>
          <div className="detail-row">
            <span>Asset Point</span>
            <strong>{formatCoordinatePair(selectedAsset.latitude, selectedAsset.longitude)}</strong>
          </div>
          <div className="detail-row">
            <span>Geometry</span>
            <strong>{selectedAsset.geometry_geojson ? 'Present' : 'None'}</strong>
          </div>
          <div className="detail-row">
            <span>Capacity</span>
            <strong>{formatCapacity(selectedAsset.capacity_value, selectedAsset.capacity_unit_code)}</strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedAsset.updated_at)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}
