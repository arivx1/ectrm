import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

export function ReferenceDataLocationsDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredLocations, selectedLocationCode, startEditLocation } = controller

  return (
    <DataSheet
      label="Locations"
      description="Scan delivery and market locations in a grid first, then use the editor for governed changes and audit details."
      columns={[
        { id: 'code', label: 'Code', width: '10rem', renderCell: (location) => location.code },
        { id: 'name', label: 'Name', width: '18rem', renderCell: (location) => location.name },
        { id: 'kind', label: 'Kind', width: '8rem', renderCell: (location) => location.location_kind },
        { id: 'type', label: 'Type', width: '9rem', renderCell: (location) => location.location_type },
        { id: 'market', label: 'Market', width: '10rem', renderCell: (location) => location.market ?? '—' },
        { id: 'parent', label: 'Parent', width: '10rem', renderCell: (location) => location.parent_location_code ?? '—' },
        { id: 'region', label: 'Region', width: '10rem', renderCell: (location) => location.region ?? '—' },
        createStatusColumn<(typeof filteredLocations)[number]>(),
      ]}
      rows={filteredLocations}
      getRowId={(location) => location.code}
      getRowLabel={(location) => `${location.code} ${location.name}`}
      selectedRowId={selectedLocationCode}
      onSelectRow={(location) => startEditLocation(location.code)}
      emptyMessage="No locations match the current filter."
    />
  )
}

export function ReferenceDataLocationsEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedLocation,
    locationFormMode,
    locationForm,
    setLocationForm,
    startCreateLocation,
    handleSaveLocation,
    handleToggleLocation,
    selectedLocationUsage,
    locationFieldErrors,
    locationFormDirty,
    locationStandards,
    activeLocations,
  } = controller

  const normalizedLocationFormCode = locationForm.code.trim().toUpperCase()
  const locationTypeOptions = locationStandards.location_types_by_kind[locationForm.location_kind] ?? []
  const parentLocationOptions = activeLocations
    .filter((location) => location.location_kind === 'REGION' && location.code !== normalizedLocationFormCode)
    .sort((left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code))

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateLocation}>
          New Location
        </button>
        {selectedLocation && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleLocation(selectedLocation)}
            disabled={savingReference}
          >
            {selectedLocation.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {selectedLocation && (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Usage</strong>
            <EditorStateBadge isDirty={locationFormDirty} />
          </div>
          <p>
            Referenced by {selectedLocationUsage?.activeChildren ?? 0} active price
            {' '}{selectedLocationUsage?.activeChildren === 1 ? 'index' : 'indices'} and {selectedLocationUsage?.totalChildren ?? 0}
            {' '}total price {selectedLocationUsage?.totalChildren === 1 ? 'index' : 'indices'}.
          </p>
          {selectedLocation.is_active && (selectedLocationUsage?.activeChildren ?? 0) > 0 && (
            <p className="field-error">
              Deactivate is blocked while active price indices still reference this location.
            </p>
          )}
        </div>
      )}

      <form className="stack-form" onSubmit={handleSaveLocation}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={locationForm.code}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={locationFormMode === 'edit' || savingReference}
            />
            {locationFieldErrors.code && <small className="field-error">{locationFieldErrors.code}</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={locationForm.name}
              onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {locationFieldErrors.name && <small className="field-error">{locationFieldErrors.name}</small>}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Location Kind</span>
            <select
              className="control"
              value={locationForm.location_kind}
              onChange={(event) => {
                const nextLocationKind = event.target.value
                const nextLocationTypes = locationStandards.location_types_by_kind[nextLocationKind] ?? []
                const fallbackLocationType =
                  locationStandards.default_location_type_by_kind[nextLocationKind] ??
                  nextLocationTypes[0] ??
                  ''
                setLocationForm((current) => ({
                  ...current,
                  location_kind: nextLocationKind,
                  location_type: nextLocationTypes.includes(current.location_type)
                    ? current.location_type
                    : fallbackLocationType,
                }))
              }}
              disabled={savingReference}
            >
              {locationStandards.location_kinds.map((locationKind) => (
                <option key={locationKind} value={locationKind}>
                  {locationKind}
                </option>
              ))}
            </select>
            {locationFieldErrors.location_kind && (
              <small className="field-error">{locationFieldErrors.location_kind}</small>
            )}
          </label>
          <label className="field">
            <span>Location Type</span>
            <select
              className="control"
              value={locationForm.location_type}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, location_type: event.target.value }))
              }
              disabled={savingReference}
            >
              {locationTypeOptions.map((locationType) => (
                <option key={locationType} value={locationType}>
                  {locationType}
                </option>
              ))}
            </select>
            {locationFieldErrors.location_type && (
              <small className="field-error">{locationFieldErrors.location_type}</small>
            )}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Parent Location Code</span>
            <select
              className="control"
              value={locationForm.parent_location_code}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, parent_location_code: event.target.value }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {parentLocationOptions.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Market</span>
            <select
              className="control"
              value={locationForm.market}
              onChange={(event) => setLocationForm((current) => ({ ...current, market: event.target.value }))}
              disabled={savingReference}
            >
              <option value="">None</option>
              {locationStandards.market_codes.map((marketCode) => (
                <option key={marketCode} value={marketCode}>
                  {marketCode}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>City</span>
            <input
              className="control"
              value={locationForm.city}
              onChange={(event) => setLocationForm((current) => ({ ...current, city: event.target.value }))}
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Subdivision Code</span>
            <input
              className="control"
              value={locationForm.subdivision_code}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, subdivision_code: event.target.value.toUpperCase() }))
              }
              disabled={savingReference}
            />
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Country Code</span>
            <input
              className="control"
              value={locationForm.country_code}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))
              }
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Continent Code</span>
            <select
              className="control"
              value={locationForm.continent_code}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, continent_code: event.target.value }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {locationStandards.continent_codes.map((continentCode) => (
                <option key={continentCode} value={continentCode}>
                  {continentCode}
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
              value={locationForm.latitude}
              onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))}
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              className="control"
              value={locationForm.longitude}
              onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))}
              disabled={savingReference}
            />
          </label>
        </div>
        {locationFieldErrors.coordinates && <small className="field-error">{locationFieldErrors.coordinates}</small>}

        <div className="mini-grid">
          <label className="field">
            <span>Region</span>
            <input
              className="control"
              value={locationForm.region}
              onChange={(event) => setLocationForm((current) => ({ ...current, region: event.target.value }))}
              disabled={savingReference}
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input
              className="control"
              value={locationForm.timezone}
              onChange={(event) => setLocationForm((current) => ({ ...current, timezone: event.target.value }))}
              disabled={savingReference}
            />
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control control-textarea"
            value={locationForm.description}
            onChange={(event) =>
              setLocationForm((current) => ({ ...current, description: event.target.value }))
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
              locationFieldErrors.code ||
                locationFieldErrors.name ||
                locationFieldErrors.location_kind ||
                locationFieldErrors.location_type ||
                locationFieldErrors.coordinates,
            ) ||
            !locationFormDirty
          }
        >
          {savingReference ? 'Saving...' : locationFormMode === 'create' ? 'Create Location' : 'Save Changes'}
        </button>
      </form>

      {selectedLocation && locationFormMode === 'edit' && (
        <div className="detail-list">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedLocation.is_active ? 'Active' : 'Inactive'}</strong>
          </div>
          <div className="detail-row">
            <span>Kind</span>
            <strong>{selectedLocation.location_kind}</strong>
          </div>
          <div className="detail-row">
            <span>Type</span>
            <strong>{selectedLocation.location_type}</strong>
          </div>
          <div className="detail-row">
            <span>Parent</span>
            <strong>{selectedLocation.parent_location_code ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Market</span>
            <strong>{selectedLocation.market ?? '—'}</strong>
          </div>
          <div className="detail-row">
            <span>Geography</span>
            <strong>
              {selectedLocation.city ?? '—'}
              {selectedLocation.subdivision_code ? ` • ${selectedLocation.subdivision_code}` : ''}
              {selectedLocation.country_code ? ` • ${selectedLocation.country_code}` : ''}
              {selectedLocation.continent_code ? ` • ${selectedLocation.continent_code}` : ''}
            </strong>
          </div>
          <div className="detail-row">
            <span>Coordinates</span>
            <strong>
              {selectedLocation.latitude != null && selectedLocation.longitude != null
                ? `${selectedLocation.latitude}, ${selectedLocation.longitude}`
                : '—'}
            </strong>
          </div>
          <div className="detail-row">
            <span>Updated</span>
            <strong>{formatDate(selectedLocation.updated_at)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
