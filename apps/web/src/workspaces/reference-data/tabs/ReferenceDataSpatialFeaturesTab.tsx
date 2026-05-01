import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

function formatEntityLink(entityType: string | null | undefined, entityCode: string | null | undefined): string {
  if (!entityType || !entityCode) {
    return '—'
  }
  return `${entityType} · ${entityCode}`
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

export function ReferenceDataSpatialFeaturesDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredSpatialFeatures, selectedSpatialFeatureCode, startEditSpatialFeature } = controller

  return (
    <DataSheet
      label="Spatial Features"
      description="Govern shared map overlays like pipelines, routes, and regions without forcing them into the asset master."
      columns={[
        { id: 'code', label: 'Code', width: '10rem', renderCell: (feature) => feature.code },
        { id: 'name', label: 'Name', width: '18rem', renderCell: (feature) => feature.name },
        { id: 'kind', label: 'Kind', width: '10rem', renderCell: (feature) => feature.feature_kind },
        { id: 'geometry', label: 'Geometry', width: '8rem', renderCell: (feature) => feature.geometry_type },
        {
          id: 'entity',
          label: 'Linked Entity',
          width: '12rem',
          renderCell: (feature) => formatEntityLink(feature.entity_type, feature.entity_code),
        },
        {
          id: 'primary',
          label: 'Primary',
          width: '7rem',
          renderCell: (feature) => (feature.is_primary ? 'Yes' : 'No'),
        },
        createStatusColumn<(typeof filteredSpatialFeatures)[number]>(),
      ]}
      rows={filteredSpatialFeatures}
      getRowId={(feature) => feature.code}
      getRowLabel={(feature) => `${feature.code} ${feature.name}`}
      selectedRowId={selectedSpatialFeatureCode}
      onSelectRow={(feature) => startEditSpatialFeature(feature.code)}
      emptyMessage="No spatial features match the current filter."
    />
  )
}

export function ReferenceDataSpatialFeaturesEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedSpatialFeature,
    spatialFeatureFormMode,
    spatialFeatureForm,
    setSpatialFeatureForm,
    spatialFeatureStandards,
    activeAssets,
    activeLocations,
    startCreateSpatialFeature,
    handleSaveSpatialFeature,
    handleToggleSpatialFeature,
    spatialFeatureFieldErrors,
    spatialFeatureFormDirty,
  } = controller

  const linkedEntityOptions =
    spatialFeatureForm.entity_type === 'ASSET'
      ? activeAssets.map((asset) => ({ code: asset.code, name: asset.name }))
      : spatialFeatureForm.entity_type === 'LOCATION'
        ? activeLocations.map((location) => ({ code: location.code, name: location.name }))
        : []

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateSpatialFeature}>
          New Spatial Feature
        </button>
        {selectedSpatialFeature ? (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleSpatialFeature(selectedSpatialFeature)}
            disabled={savingReference}
          >
            {selectedSpatialFeature.is_active ? 'Deactivate' : 'Activate'}
          </button>
        ) : null}
      </div>

      {selectedSpatialFeature ? (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Spatial Status</strong>
            <EditorStateBadge isDirty={spatialFeatureFormDirty} />
          </div>
          <p>
            {selectedSpatialFeature.feature_kind} · {selectedSpatialFeature.geometry_type} ·{' '}
            {selectedSpatialFeature.is_primary ? 'Primary overlay' : 'Secondary overlay'}
          </p>
          <p>{formatEntityLink(selectedSpatialFeature.entity_type, selectedSpatialFeature.entity_code)}</p>
          <p>{formatCoordinatePair(selectedSpatialFeature.label_latitude, selectedSpatialFeature.label_longitude)}</p>
        </div>
      ) : null}

      <form className="stack-form" onSubmit={handleSaveSpatialFeature}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={spatialFeatureForm.code}
              onChange={(event) =>
                setSpatialFeatureForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={spatialFeatureFormMode === 'edit' || savingReference}
            />
            {spatialFeatureFieldErrors.code ? <small className="field-error">{spatialFeatureFieldErrors.code}</small> : null}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={spatialFeatureForm.name}
              onChange={(event) => setSpatialFeatureForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {spatialFeatureFieldErrors.name ? <small className="field-error">{spatialFeatureFieldErrors.name}</small> : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Feature Kind</span>
            <select
              className="control"
              value={spatialFeatureForm.feature_kind}
              onChange={(event) =>
                setSpatialFeatureForm((current) => ({ ...current, feature_kind: event.target.value }))
              }
              disabled={savingReference}
            >
              {spatialFeatureStandards.feature_kinds.map((featureKind) => (
                <option key={featureKind} value={featureKind}>
                  {featureKind}
                </option>
              ))}
            </select>
            {spatialFeatureFieldErrors.feature_kind ? (
              <small className="field-error">{spatialFeatureFieldErrors.feature_kind}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Entity Type</span>
            <select
              className="control"
              value={spatialFeatureForm.entity_type}
              onChange={(event) =>
                setSpatialFeatureForm((current) => ({
                  ...current,
                  entity_type: event.target.value,
                  entity_code: '',
                }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {spatialFeatureStandards.entity_types.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
            {spatialFeatureFieldErrors.entity_link ? (
              <small className="field-error">{spatialFeatureFieldErrors.entity_link}</small>
            ) : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Linked Code</span>
            <select
              className="control"
              value={spatialFeatureForm.entity_code}
              onChange={(event) =>
                setSpatialFeatureForm((current) => ({ ...current, entity_code: event.target.value }))
              }
              disabled={savingReference || !spatialFeatureForm.entity_type}
            >
              <option value="">None</option>
              {linkedEntityOptions.map((entity) => (
                <option key={entity.code} value={entity.code}>
                  {entity.code} - {entity.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Primary Overlay</span>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={spatialFeatureForm.is_primary}
                onChange={(event) =>
                  setSpatialFeatureForm((current) => ({ ...current, is_primary: event.target.checked }))
                }
                disabled={savingReference}
              />
              <span>Use this as the default linked overlay</span>
            </label>
          </div>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Label Latitude</span>
            <input
              className="control"
              value={spatialFeatureForm.label_latitude}
              onChange={(event) =>
                setSpatialFeatureForm((current) => ({ ...current, label_latitude: event.target.value }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
            {spatialFeatureFieldErrors.label_coordinates ? (
              <small className="field-error">{spatialFeatureFieldErrors.label_coordinates}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Label Longitude</span>
            <input
              className="control"
              value={spatialFeatureForm.label_longitude}
              onChange={(event) =>
                setSpatialFeatureForm((current) => ({ ...current, label_longitude: event.target.value }))
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
            value={spatialFeatureForm.geometry_geojson}
            onChange={(event) =>
              setSpatialFeatureForm((current) => ({ ...current, geometry_geojson: event.target.value }))
            }
            disabled={savingReference}
            placeholder='Required: {"type":"Polygon","coordinates":[[[-96,31],[-95,31],[-95,32],[-96,32],[-96,31]]]}'
          />
          {spatialFeatureFieldErrors.geometry_geojson ? (
            <small className="field-error">{spatialFeatureFieldErrors.geometry_geojson}</small>
          ) : (
            <small className="form-note">
              Use lines for pipelines and routes, polygons for regions and footprints, and collections when a feature truly mixes shapes.
            </small>
          )}
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={spatialFeatureForm.description}
            onChange={(event) =>
              setSpatialFeatureForm((current) => ({ ...current, description: event.target.value }))
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
              spatialFeatureFieldErrors.code ||
                spatialFeatureFieldErrors.name ||
                spatialFeatureFieldErrors.feature_kind ||
                spatialFeatureFieldErrors.entity_link ||
                spatialFeatureFieldErrors.label_coordinates ||
                spatialFeatureFieldErrors.geometry_geojson,
            ) ||
            !spatialFeatureFormDirty
          }
        >
          {savingReference
            ? 'Saving...'
            : spatialFeatureFormMode === 'create'
              ? 'Create Spatial Feature'
              : 'Save Changes'}
        </button>
      </form>

      {selectedSpatialFeature && spatialFeatureFormMode === 'edit' ? (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedSpatialFeature.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Geometry</span>
            <strong>{selectedSpatialFeature.geometry_type}</strong>
          </div>
          <div className="detail-row">
            <span>Linked Entity</span>
            <strong>{formatEntityLink(selectedSpatialFeature.entity_type, selectedSpatialFeature.entity_code)}</strong>
          </div>
          <div className="detail-row">
            <span>Label Point</span>
            <strong>
              {formatCoordinatePair(selectedSpatialFeature.label_latitude, selectedSpatialFeature.label_longitude)}
            </strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedSpatialFeature.updated_at)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}
