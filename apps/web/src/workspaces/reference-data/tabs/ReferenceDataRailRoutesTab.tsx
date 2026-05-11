import { DataSheet } from '../../../shared/ui/DataSheet'
import { EditorStateBadge } from '../ReferenceDataShared'
import { createStatusColumn, type ReferenceDataTabProps } from '../referenceDataTabShared'

const RAIL_ROUTE_DIRECTIONS = ['BIDIRECTIONAL', 'FORWARD', 'REVERSE'] as const

function locationLabel(
  locationCode: string | null | undefined,
  locationByCode: Map<string, { code: string; name: string }>,
): string {
  if (!locationCode) {
    return '—'
  }
  const location = locationByCode.get(locationCode)
  return location ? `${location.code} · ${location.name}` : locationCode
}

function serviceClockLabel(route: {
  schedule_timezone?: string | null
  placement_cutoff_time_local?: string | null
  release_cutoff_time_local?: string | null
}): string {
  const parts = [
    route.schedule_timezone ?? null,
    route.placement_cutoff_time_local ? `Place ${route.placement_cutoff_time_local}` : null,
    route.release_cutoff_time_local ? `Release ${route.release_cutoff_time_local}` : null,
  ].filter((value): value is string => Boolean(value))
  return parts.join(' · ') || '—'
}

function freeTimeLabel(route: {
  placement_free_time_hours?: number | null
  release_free_time_hours?: number | null
}): string {
  const parts = [
    route.placement_free_time_hours != null ? `Place ${route.placement_free_time_hours}h` : null,
    route.release_free_time_hours != null ? `Release ${route.release_free_time_hours}h` : null,
  ].filter((value): value is string => Boolean(value))
  return parts.join(' · ') || '—'
}

export function ReferenceDataRailRoutesDirectory({ controller }: ReferenceDataTabProps) {
  const { filteredRailRoutes, selectedRailRouteCode, startEditRailRoute, locations } = controller
  const locationByCode = new Map(locations.map((location) => [location.code, location] as const))

  return (
    <DataSheet
      label="Rail Routes"
      description="Maintain the governed lane definitions that rail scheduling, blockers, and map overlays can all reuse."
      columns={[
        { id: 'code', label: 'Code', width: '12rem', renderCell: (route) => route.code },
        { id: 'name', label: 'Name', width: '18rem', renderCell: (route) => route.name },
        { id: 'line', label: 'Rail Line', width: '12rem', renderCell: (route) => route.rail_line_code },
        {
          id: 'origin',
          label: 'Origin',
          width: '14rem',
          renderCell: (route) => locationLabel(route.origin_location_code, locationByCode),
        },
        {
          id: 'destination',
          label: 'Destination',
          width: '14rem',
          renderCell: (route) => locationLabel(route.destination_location_code, locationByCode),
        },
        { id: 'direction', label: 'Direction', width: '10rem', renderCell: (route) => route.route_direction },
        {
          id: 'clock',
          label: 'Service Clock',
          width: '16rem',
          renderCell: (route) => serviceClockLabel(route),
        },
        createStatusColumn<(typeof filteredRailRoutes)[number]>(),
      ]}
      rows={filteredRailRoutes}
      getRowId={(route) => route.code}
      getRowLabel={(route) => `${route.code} ${route.name}`}
      selectedRowId={selectedRailRouteCode}
      onSelectRow={(route) => startEditRailRoute(route.code)}
      emptyMessage="No rail routes match the current filter."
    />
  )
}

export function ReferenceDataRailRoutesEditor({ controller, formatDate }: ReferenceDataTabProps) {
  const {
    savingReference,
    selectedRailRoute,
    railRouteFormMode,
    railRouteForm,
    setRailRouteForm,
    activeLocations,
    startCreateRailRoute,
    openRailRouteScheduling,
    handleSaveRailRoute,
    handleToggleRailRoute,
    railRouteFieldErrors,
    railRouteFormDirty,
  } = controller
  const sortedLocations = [...activeLocations].sort(
    (left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code),
  )

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button button-secondary" onClick={startCreateRailRoute}>
          New Rail Route
        </button>
        {selectedRailRoute ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => openRailRouteScheduling(selectedRailRoute.code, selectedRailRoute.name)}
          >
            Open Scheduling
          </button>
        ) : null}
        {selectedRailRoute ? (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => handleToggleRailRoute(selectedRailRoute)}
            disabled={savingReference}
          >
            {selectedRailRoute.is_active ? 'Deactivate' : 'Activate'}
          </button>
        ) : null}
      </div>

      {selectedRailRoute ? (
        <div className="reference-usage-card">
          <div className="reference-usage-head">
            <strong>Scheduling Context</strong>
            <EditorStateBadge isDirty={railRouteFormDirty} />
          </div>
          <p>
            {selectedRailRoute.rail_line_code} · {selectedRailRoute.route_direction}
            {selectedRailRoute.service_calendar_code ? ` · ${selectedRailRoute.service_calendar_code}` : ''}
          </p>
          <p>Launch Scheduling from this route to reuse the same governed lane focus the map uses.</p>
          <p>{serviceClockLabel(selectedRailRoute)}</p>
          <p>{freeTimeLabel(selectedRailRoute)}</p>
          <p>Updated {formatDate(selectedRailRoute.updated_at)}</p>
        </div>
      ) : null}

      <form className="stack-form" onSubmit={handleSaveRailRoute}>
        <div className="mini-grid">
          <label className="field">
            <span>Code</span>
            <input
              className="control"
              value={railRouteForm.code}
              onChange={(event) =>
                setRailRouteForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              disabled={railRouteFormMode === 'edit' || savingReference}
            />
            {railRouteFieldErrors.code ? <small className="field-error">{railRouteFieldErrors.code}</small> : null}
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="control"
              value={railRouteForm.name}
              onChange={(event) => setRailRouteForm((current) => ({ ...current, name: event.target.value }))}
              disabled={savingReference}
            />
            {railRouteFieldErrors.name ? <small className="field-error">{railRouteFieldErrors.name}</small> : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Rail Line Code</span>
            <input
              className="control"
              value={railRouteForm.rail_line_code}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  rail_line_code: event.target.value.toUpperCase(),
                }))
              }
              disabled={savingReference}
            />
            {railRouteFieldErrors.rail_line_code ? (
              <small className="field-error">{railRouteFieldErrors.rail_line_code}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Route Direction</span>
            <select
              className="control"
              value={railRouteForm.route_direction}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  route_direction: event.target.value,
                }))
              }
              disabled={savingReference}
            >
              {RAIL_ROUTE_DIRECTIONS.map((routeDirection) => (
                <option key={routeDirection} value={routeDirection}>
                  {routeDirection}
                </option>
              ))}
            </select>
            {railRouteFieldErrors.route_direction ? (
              <small className="field-error">{railRouteFieldErrors.route_direction}</small>
            ) : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Origin Location</span>
            <select
              className="control"
              value={railRouteForm.origin_location_code}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  origin_location_code: event.target.value,
                }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {sortedLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Destination Location</span>
            <select
              className="control"
              value={railRouteForm.destination_location_code}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  destination_location_code: event.target.value,
                }))
              }
              disabled={savingReference}
            >
              <option value="">None</option>
              {sortedLocations.map((location) => (
                <option key={location.code} value={location.code}>
                  {location.code} - {location.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Service Calendar Code</span>
            <input
              className="control"
              value={railRouteForm.service_calendar_code}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  service_calendar_code: event.target.value.toUpperCase(),
                }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span>Schedule Timezone</span>
            <input
              className="control"
              value={railRouteForm.schedule_timezone}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  schedule_timezone: event.target.value,
                }))
              }
              disabled={savingReference}
              placeholder="America/Chicago"
            />
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Placement Cutoff</span>
            <input
              className="control"
              value={railRouteForm.placement_cutoff_time_local}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  placement_cutoff_time_local: event.target.value,
                }))
              }
              disabled={savingReference}
              placeholder="HH:MM"
            />
            {railRouteFieldErrors.placement_cutoff_time_local ? (
              <small className="field-error">{railRouteFieldErrors.placement_cutoff_time_local}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Release Cutoff</span>
            <input
              className="control"
              value={railRouteForm.release_cutoff_time_local}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  release_cutoff_time_local: event.target.value,
                }))
              }
              disabled={savingReference}
              placeholder="HH:MM"
            />
            {railRouteFieldErrors.release_cutoff_time_local ? (
              <small className="field-error">{railRouteFieldErrors.release_cutoff_time_local}</small>
            ) : null}
          </label>
        </div>

        <div className="mini-grid">
          <label className="field">
            <span>Placement Free Time (Hours)</span>
            <input
              type="number"
              min="0"
              step="1"
              className="control"
              value={railRouteForm.placement_free_time_hours}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  placement_free_time_hours: event.target.value,
                }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
            {railRouteFieldErrors.placement_free_time_hours ? (
              <small className="field-error">{railRouteFieldErrors.placement_free_time_hours}</small>
            ) : null}
          </label>
          <label className="field">
            <span>Release Free Time (Hours)</span>
            <input
              type="number"
              min="0"
              step="1"
              className="control"
              value={railRouteForm.release_free_time_hours}
              onChange={(event) =>
                setRailRouteForm((current) => ({
                  ...current,
                  release_free_time_hours: event.target.value,
                }))
              }
              disabled={savingReference}
              placeholder="Optional"
            />
            {railRouteFieldErrors.release_free_time_hours ? (
              <small className="field-error">{railRouteFieldErrors.release_free_time_hours}</small>
            ) : null}
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea
            className="control"
            rows={4}
            value={railRouteForm.description}
            onChange={(event) =>
              setRailRouteForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            disabled={savingReference}
          />
        </label>

        <div className="toolbar">
          <button type="submit" className="button button-primary" disabled={savingReference}>
            {savingReference
              ? 'Saving...'
              : railRouteFormMode === 'create'
                ? 'Create Rail Route'
                : 'Save Rail Route'}
          </button>
        </div>
      </form>
    </div>
  )
}
