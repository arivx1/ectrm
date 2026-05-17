/* eslint-disable react-refresh/only-export-components */

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  loadWeatherForecastPeriods,
  loadWeatherObservations,
} from "../../../entities/weather/api";
import {
  buildWeatherOverlayPointFeatureCollection,
  buildWeatherOverlayPointRecord,
  buildWeatherOverlayWindVectorFeatureCollection,
  createDefaultWeatherOverlayOpacityState,
  createDefaultWeatherOverlayVisibilityState,
  describeWeatherOverlayMode,
  getWeatherOverlayColorExpression,
  getWeatherOverlayLegendConfig,
  type SelectableWeatherOverlayMode,
  type WeatherOverlayOpacityState,
  type WeatherOverlayPointRecord,
  type WeatherOverlayVisibilityState,
  WEATHER_OVERLAY_OPTIONS,
} from "../../../entities/weather/mapOverlay";
import {
  formatWeatherAgeHours,
  formatWeatherPeriodWindow,
  summarizeWeatherForecast,
  summarizeWeatherObservation,
  weatherHealthLabel,
  weatherHealthTone,
} from "../../../entities/weather/presentation";
import {
  assetMapActivityLabelsForAsset,
  assetMapCountryCodeForRecord,
  assetMapCountryCodeForWeatherLocation,
  assetMapGeographyLabelForPoint,
  assetMapGeographyLabelForRecord,
  ASSET_MAP_ACTIVITY_LABELS,
  ASSET_MAP_GEOGRAPHY_LABELS,
  assetMapSubdivisionCodeForRecord,
  assetMapSubdivisionCodeForWeatherLocation,
  assetMapSubtypeLabelForAsset,
  ASSET_MAP_SUBTYPE_LABELS,
  buildAssetMapCountryOptions,
  buildAssetMapFeatureCollection,
  buildAssetMapSubdivisionOptions,
  buildAssetMapSummary,
  buildSpatialFeatureExtentCoordinates,
  buildSpatialFeatureMapFeatureCollection,
  formatAssetMapCountryLabel,
  formatAssetMapLocation,
  formatAssetMapPlacement,
  formatAssetMapSource,
  type AssetMapCountryOption,
  type AssetMapRecord,
  type AssetMapSubdivisionOption,
} from "../../../features/reference-data/assetMap";
import { appConfig } from "../../../shared/config";
import {
  getAssetMapFilterPresets,
  saveAssetMapFilterPreset,
  type AssetMapFilterPresetRecord,
} from "../../../shared/assetMapFilterPresets";
import { usePersistentCollapsibleCardState } from "../../../shared/collapsibleCardState";
import type {
  AssetRecord,
  LocationRecord,
  RailRouteRecord,
  SpatialFeatureRecord,
  WeatherForecastPeriodRecord,
  WeatherLocationRecord,
  WeatherObservationRecord,
  WeatherSyncStatusRecord,
} from "../../../shared/models";

type AssetMapPanelProps = {
  assets: AssetRecord[];
  locations: LocationRecord[];
  railRoutes: RailRouteRecord[];
  spatialFeatures: SpatialFeatureRecord[];
  weatherLocations: WeatherLocationRecord[];
  weatherSyncStatus: WeatherSyncStatusRecord | null;
  weatherDataLoaded?: boolean;
  weatherDataLoading?: boolean;
  weatherLoadError?: string;
  selectedAssetCode: string | null;
  selectedRailRouteCode?: string | null;
  onSelectAsset: (code: string) => void;
  onSelectRailRoute?: (code: string) => void;
  onOpenRailRouteDeliveries?: (code: string) => void;
  onOpenRailRouteScheduling?: (code: string) => void;
  onOpenReferenceRailRoute?: (code: string) => void;
  onClearRailRouteSelection?: () => void;
  filterControls?: ReactNode;
};

type MapLibreModule = typeof import("maplibre-gl");
type AssetMapLibreMap = InstanceType<MapLibreModule["Map"]>;

const ASSET_GEOMETRY_SOURCE_ID = "asset-geometry-source";
const ASSET_GEOMETRY_FILL_LAYER_ID = "asset-geometry-fill-layer";
const ASSET_GEOMETRY_LINE_LAYER_ID = "asset-geometry-line-layer";
const ASSET_GEOMETRY_POINT_LAYER_ID = "asset-geometry-point-layer";
const SPATIAL_FEATURE_SOURCE_ID = "spatial-feature-source";
const SPATIAL_FEATURE_FILL_LAYER_ID = "spatial-feature-fill-layer";
const SPATIAL_FEATURE_LINE_LAYER_ID = "spatial-feature-line-layer";
const SPATIAL_FEATURE_POINT_LAYER_ID = "spatial-feature-point-layer";
const WEATHER_WIND_VECTOR_SOURCE_ID = "weather-wind-vector-source";
const WEATHER_WIND_VECTOR_LAYER_ID = "weather-wind-vector-layer";
const WEATHER_RADAR_SOURCE_ID = "weather-radar-source";
const WEATHER_RADAR_LAYER_ID = "weather-radar-layer";
const NOAA_RADAR_TILE_URL =
  "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=conus_bref_qcd&STYLES=radar_reflectivity&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256";
type DataBackedWeatherOverlayMode = Exclude<SelectableWeatherOverlayMode, "radar">;
type ScalarWeatherOverlayMode = Exclude<DataBackedWeatherOverlayMode, "wind">;

const WEATHER_OVERLAY_TOGGLE_OPTIONS: Array<{
  value: SelectableWeatherOverlayMode;
  label: string;
}> = WEATHER_OVERLAY_OPTIONS.filter(
  (
    option,
  ): option is {
    value: SelectableWeatherOverlayMode;
    label: string;
  } => option.value !== "none",
);
const WEATHER_SCALAR_OVERLAY_MODES: ScalarWeatherOverlayMode[] = [
  "precipitation",
  "temperature",
  "humidity",
  "pressure",
];

function createDefaultWeatherOverlayExpansionState(): Record<
  SelectableWeatherOverlayMode,
  boolean
> {
  return {
    radar: false,
    precipitation: false,
    wind: false,
    temperature: false,
    humidity: false,
    pressure: false,
  };
}

function createExpandedWeatherOverlayExpansionState(
  visibility: WeatherOverlayVisibilityState,
): Record<SelectableWeatherOverlayMode, boolean> {
  return {
    radar: visibility.radar,
    precipitation: visibility.precipitation,
    wind: visibility.wind,
    temperature: visibility.temperature,
    humidity: visibility.humidity,
    pressure: visibility.pressure,
  };
}

function createUniformWeatherOverlayVisibilityState(
  visible: boolean,
): WeatherOverlayVisibilityState {
  return {
    radar: visible,
    precipitation: visible,
    wind: visible,
    temperature: visible,
    humidity: visible,
    pressure: visible,
  };
}

const FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openstreetmap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "openstreetmap",
      type: "raster",
      source: "openstreetmap",
    },
  ],
};

function weatherOverlayPointSourceId(mode: DataBackedWeatherOverlayMode): string {
  return `weather-overlay-${mode}-point-source`;
}

function weatherOverlayGlowLayerId(mode: ScalarWeatherOverlayMode): string {
  return `weather-overlay-${mode}-glow-layer`;
}

function weatherOverlayPointLayerId(mode: DataBackedWeatherOverlayMode): string {
  return `weather-overlay-${mode}-point-layer`;
}

function buildRecordSignature(records: AssetMapRecord[]): string {
  return records
    .map((record) =>
      [
        record.asset.code,
        record.asset.latitude ?? "na",
        record.asset.longitude ?? "na",
        JSON.stringify(record.asset.geometry_geojson ?? null),
        record.placementStatus,
      ].join(":"),
    )
    .join("|");
}

function buildSpatialFeatureSignature(
  spatialFeatures: SpatialFeatureRecord[],
): string {
  return spatialFeatures
    .map((feature) =>
      [
        feature.code,
        feature.feature_kind,
        feature.geometry_type,
        feature.entity_type ?? "na",
        feature.entity_code ?? "na",
        JSON.stringify(feature.geometry_geojson),
      ].join(":"),
    )
    .join("|");
}

function isRailRouteSpatialFeature(
  feature: Pick<SpatialFeatureRecord, "entity_type">,
): boolean {
  return feature.entity_type === "RAIL_ROUTE";
}

function buildWeatherLocationSignature(
  weatherLocations: WeatherLocationRecord[],
): string {
  return weatherLocations
    .map((location) =>
      [
        location.code,
        location.latitude,
        location.longitude,
        location.is_active,
        location.updated_at,
      ].join(":"),
    )
    .join("|");
}

function buildWeatherStatusSignature(
  weatherSyncStatus: WeatherSyncStatusRecord | null,
): string {
  return (weatherSyncStatus?.locations ?? [])
    .map((location) =>
      [
        location.code,
        location.health_status,
        location.forecast_age_hours ?? "na",
        location.observation_age_hours ?? "na",
      ].join(":"),
    )
    .join("|");
}

export function sortedUniqueAssetSubtypes(records: AssetMapRecord[]): string[] {
  const presentSubtypeLabels = new Set(
    records.map((record) => assetMapSubtypeLabelForAsset(record.asset)),
  );

  return ASSET_MAP_SUBTYPE_LABELS.filter((subtypeLabel) =>
    presentSubtypeLabels.has(subtypeLabel),
  );
}

export function syncAssetSubtypeVisibilityState(
  assetSubtypes: string[],
  currentState: Record<string, boolean>,
): Record<string, boolean> {
  return assetSubtypes.reduce<Record<string, boolean>>(
    (nextState, assetSubtype) => {
      nextState[assetSubtype] = currentState[assetSubtype] ?? true;
      return nextState;
    },
    {},
  );
}

export function syncAssetActivityVisibilityState(
  currentState: Record<string, boolean>,
): Record<string, boolean> {
  return ASSET_MAP_ACTIVITY_LABELS.reduce<Record<string, boolean>>(
    (nextState, activityLabel) => {
      nextState[activityLabel] = currentState[activityLabel] ?? true;
      return nextState;
    },
    {},
  );
}

export function syncAssetGeographyVisibilityState(
  currentState: Record<string, boolean>,
): Record<string, boolean> {
  return ASSET_MAP_GEOGRAPHY_LABELS.reduce<Record<string, boolean>>(
    (nextState, geographyLabel) => {
      nextState[geographyLabel] = currentState[geographyLabel] ?? true;
      return nextState;
    },
    {},
  );
}

export function setAllAssetGeographyVisibilityState(
  visible: boolean,
): Record<string, boolean> {
  return ASSET_MAP_GEOGRAPHY_LABELS.reduce<Record<string, boolean>>(
    (nextState, geographyLabel) => {
      nextState[geographyLabel] = visible;
      return nextState;
    },
    {},
  );
}

export function setAllAssetSubtypeVisibilityState(
  assetSubtypes: string[],
  visible: boolean,
): Record<string, boolean> {
  return assetSubtypes.reduce<Record<string, boolean>>(
    (nextState, assetSubtype) => {
      nextState[assetSubtype] = visible;
      return nextState;
    },
    {},
  );
}

function isAssetSubtypeVisible(
  assetSubtypeVisibility: Record<string, boolean>,
  assetSubtype: string,
): boolean {
  return assetSubtypeVisibility[assetSubtype] !== false;
}

function isAssetActivityVisible(
  assetActivityVisibility: Record<string, boolean>,
  activityLabel: string,
): boolean {
  return assetActivityVisibility[activityLabel] !== false;
}

function isAssetGeographyVisible(
  assetGeographyVisibility: Record<string, boolean>,
  geographyLabel: string | null,
): boolean {
  return (
    geographyLabel === null ||
    assetGeographyVisibility[geographyLabel] !== false
  );
}

function areAllAssetSubtypesVisible(
  assetSubtypes: string[],
  assetSubtypeVisibility: Record<string, boolean>,
): boolean {
  return (
    assetSubtypes.length > 0 &&
    assetSubtypes.every((assetSubtype) =>
      isAssetSubtypeVisible(assetSubtypeVisibility, assetSubtype),
    )
  );
}

function assetRecordMatchesVisibleActivity(
  assetActivityVisibility: Record<string, boolean>,
  record: AssetMapRecord,
): boolean {
  return assetMapActivityLabelsForAsset(record.asset).some((activityLabel) =>
    isAssetActivityVisible(assetActivityVisibility, activityLabel),
  );
}

function areAllAssetGeographiesVisible(
  assetGeographyVisibility: Record<string, boolean>,
): boolean {
  return ASSET_MAP_GEOGRAPHY_LABELS.every((geographyLabel) =>
    isAssetGeographyVisible(assetGeographyVisibility, geographyLabel),
  );
}

function assetRecordMatchesVisibleGeography(
  assetGeographyVisibility: Record<string, boolean>,
  record: AssetMapRecord,
): boolean {
  return isAssetGeographyVisible(
    assetGeographyVisibility,
    assetMapGeographyLabelForRecord(record),
  );
}

function weatherLocationMatchesVisibleGeography(
  assetGeographyVisibility: Record<string, boolean>,
  location: WeatherLocationRecord,
): boolean {
  return isAssetGeographyVisible(
    assetGeographyVisibility,
    assetMapGeographyLabelForPoint({
      latitude: location.latitude,
      longitude: location.longitude,
    }),
  );
}

function assetRecordMatchesSelectedCountry(
  selectedCountryCode: string,
  record: AssetMapRecord,
): boolean {
  return (
    !selectedCountryCode ||
    assetMapCountryCodeForRecord(record) === selectedCountryCode
  );
}

function weatherLocationMatchesSelectedCountry(
  selectedCountryCode: string,
  location: WeatherLocationRecord,
  locationByCode: ReadonlyMap<string, LocationRecord>,
): boolean {
  return (
    !selectedCountryCode ||
    assetMapCountryCodeForWeatherLocation(location, locationByCode) ===
      selectedCountryCode
  );
}

function assetRecordMatchesSelectedSubdivision(
  selectedSubdivisionCode: string,
  record: AssetMapRecord,
): boolean {
  return (
    !selectedSubdivisionCode ||
    assetMapSubdivisionCodeForRecord(record) === selectedSubdivisionCode
  );
}

function weatherLocationMatchesSelectedSubdivision(
  selectedSubdivisionCode: string,
  location: WeatherLocationRecord,
  locationByCode: ReadonlyMap<string, LocationRecord>,
): boolean {
  return (
    !selectedSubdivisionCode ||
    assetMapSubdivisionCodeForWeatherLocation(location, locationByCode) ===
      selectedSubdivisionCode
  );
}

type AssetMapSearchableOption = {
  code: string;
  label: string;
};

function AssetMapSearchableSelect({
  label,
  placeholder,
  searchSuggestionsId,
  value,
  onSelectValue,
  options,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  searchSuggestionsId: string;
  value: string;
  onSelectValue: (value: string) => void;
  options: AssetMapSearchableOption[];
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const selectedOptionLabel = useMemo(
    () => options.find((option) => option.code === value)?.label ?? "",
    [options, value],
  );

  useEffect(() => {
    setInputValue(selectedOptionLabel);
  }, [selectedOptionLabel]);

  function handleChange(nextValue: string) {
    setInputValue(nextValue);
    const normalizedValue = nextValue.trim().toLowerCase();
    if (!normalizedValue) {
      onSelectValue("");
      return;
    }

    const matchedOption =
      options.find(
        (option) => option.label.toLowerCase() === normalizedValue,
      ) ??
      options.find((option) => option.code.toLowerCase() === normalizedValue) ??
      null;
    if (matchedOption) {
      onSelectValue(matchedOption.code);
    }
  }

  function handleBlur() {
    if (!inputValue.trim()) {
      setInputValue("");
      return;
    }

    const normalizedValue = inputValue.trim().toLowerCase();
    const matchedOption =
      options.find(
        (option) => option.label.toLowerCase() === normalizedValue,
      ) ??
      options.find((option) => option.code.toLowerCase() === normalizedValue) ??
      null;
    if (!matchedOption) {
      setInputValue(selectedOptionLabel);
    }
  }

  return (
    <div className="asset-map-inline-picker">
      <span className="asset-map-inline-select-label">{label}</span>
      <input
        type="search"
        className="control control-compact"
        role="searchbox"
        aria-label={label}
        list={searchSuggestionsId}
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
      />
      <datalist id={searchSuggestionsId}>
        {options.map((option) => (
          <option key={option.code} value={option.label} />
        ))}
      </datalist>
    </div>
  );
}

function AssetMapFiltersCard({
  summary,
  collapsibleStateKey,
  children,
}: {
  summary: string;
  collapsibleStateKey: string;
  children: ReactNode;
}) {
  const expandedState = usePersistentCollapsibleCardState(
    collapsibleStateKey,
    true,
  );
  const panelId = collapsiblePanelId(collapsibleStateKey);

  return (
    <article
      className={`asset-map-filters-card ${expandedState.expanded ? "" : "is-collapsed"}`.trim()}
    >
      <button
        type="button"
        className="asset-map-filters-card-toggle"
        aria-expanded={expandedState.expanded}
        aria-controls={panelId}
        onClick={() => expandedState.setExpanded((current) => !current)}
      >
        <div className="asset-map-filters-card-copy">
          <strong>Map Filters</strong>
          <p>{summary}</p>
        </div>
        <div className="asset-map-filters-card-toggle-meta">
          <small>{expandedState.expanded ? "Hide card" : "Show card"}</small>
          <span
            className="asset-map-filters-card-toggle-indicator"
            aria-hidden="true"
          >
            {expandedState.expanded ? "−" : "+"}
          </span>
        </div>
      </button>

      <div
        id={panelId}
        className="asset-map-filters-card-body"
        hidden={!expandedState.expanded}
      >
        {children}
      </div>
    </article>
  );
}

function formatAssetMapRecordCountLabel(recordCount: number): string {
  return `${recordCount.toLocaleString()} map record${recordCount === 1 ? "" : "s"}`;
}

function formatAssetMapRecordWindowLabel(
  visibleRecordCount: number,
  totalRecordCount: number,
): string {
  const normalizedTotalRecordCount = Math.max(
    totalRecordCount,
    visibleRecordCount,
  );

  if (normalizedTotalRecordCount === visibleRecordCount) {
    return formatAssetMapRecordCountLabel(visibleRecordCount);
  }

  return `Showing ${visibleRecordCount.toLocaleString()} of ${normalizedTotalRecordCount.toLocaleString()} map records`;
}

function collapsiblePanelId(cardKey: string): string {
  return `${cardKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}-panel`;
}

export function AssetMapRecordsCard({
  records,
  totalRecordCount,
  selectedAssetCode,
  onSelectAsset,
  collapsibleStateKey,
}: {
  records: AssetMapRecord[];
  totalRecordCount?: number;
  selectedAssetCode: string | null;
  onSelectAsset: (code: string) => void;
  collapsibleStateKey: string;
}) {
  const expandedState = usePersistentCollapsibleCardState(
    collapsibleStateKey,
    false,
  );
  const panelId = collapsiblePanelId(collapsibleStateKey);
  const recordCountLabel = formatAssetMapRecordWindowLabel(
    records.length,
    totalRecordCount ?? records.length,
  );

  return (
    <article
      className={`asset-map-records-card ${expandedState.expanded ? "" : "is-collapsed"}`.trim()}
    >
      <button
        type="button"
        className="asset-map-records-card-toggle"
        aria-expanded={expandedState.expanded}
        aria-controls={panelId}
        onClick={() => expandedState.setExpanded((current) => !current)}
      >
        <div className="asset-map-records-card-copy">
          <strong>Map Records</strong>
          <p>{recordCountLabel}</p>
        </div>
        <div className="asset-map-records-card-toggle-meta">
          <small>{expandedState.expanded ? "Hide card" : "Show card"}</small>
          <span
            className="asset-map-records-card-toggle-indicator"
            aria-hidden="true"
          >
            {expandedState.expanded ? "−" : "+"}
          </span>
        </div>
      </button>

      <div
        id={panelId}
        className="asset-map-records-card-body"
        hidden={!expandedState.expanded}
      >
        {records.length > 0 ? (
          <div className="asset-map-records-table-scroll">
            <table className="asset-map-records-table">
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col">Category</th>
                  <th scope="col">Map Source</th>
                  <th scope="col">Placement</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const selected = record.asset.code === selectedAssetCode;

                  return (
                    <tr
                      key={record.asset.code}
                      className={selected ? "is-selected" : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className="asset-map-records-row-button"
                          aria-pressed={selected}
                          aria-label={`Focus ${record.asset.code} on map`}
                          onClick={() => onSelectAsset(record.asset.code)}
                        >
                          {record.asset.code}
                        </button>
                        <span className="asset-map-records-asset-name">
                          {record.asset.name}
                        </span>
                      </td>
                      <td>
                        <div className="asset-map-records-category">
                          <strong>
                            {assetMapSubtypeLabelForAsset(record.asset)}
                          </strong>
                          <span>{`${record.asset.asset_class} · ${record.asset.asset_type}`}</span>
                        </div>
                      </td>
                      <td>{formatAssetMapSource(record)}</td>
                      <td>{formatAssetMapPlacement(record)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="asset-map-records-empty">
            No map records are available for the current filters.
          </p>
        )}
      </div>
    </article>
  );
}

function buildVisiblePlacementCounts(records: AssetMapRecord[]): {
  assetGeometryCount: number;
  assetPointCount: number;
  linkedLocationCount: number;
} {
  return records.reduce(
    (counts, record) => {
      switch (record.placementStatus) {
        case "asset_geometry":
          counts.assetGeometryCount += 1;
          break;
        case "asset_coordinates":
          counts.assetPointCount += 1;
          break;
        case "linked_location":
          counts.linkedLocationCount += 1;
          break;
        default:
          break;
      }

      return counts;
    },
    {
      assetGeometryCount: 0,
      assetPointCount: 0,
      linkedLocationCount: 0,
    },
  );
}

function formatGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission is blocked for this browser session.";
    case error.POSITION_UNAVAILABLE:
      return "Current location could not be determined right now.";
    case error.TIMEOUT:
      return "Current location lookup timed out. Try again.";
    default:
      return "Current location could not be determined.";
  }
}

function formatWeatherLayerStatus(params: {
  activeLocationCount: number;
  weatherDataLoaded: boolean;
  weatherDataLoading: boolean;
  weatherLoadError: string;
}): string {
  const {
    activeLocationCount,
    weatherDataLoaded,
    weatherDataLoading,
    weatherLoadError,
  } = params;

  if (weatherLoadError) {
    return "Weather Error";
  }

  if (weatherDataLoading || !weatherDataLoaded) {
    return "Loading tracked weather points...";
  }

  if (activeLocationCount > 0) {
    return `${activeLocationCount} tracked weather point${activeLocationCount === 1 ? "" : "s"} visible`;
  }

  return "No tracked weather points loaded";
}

function formatWeatherOverlayModeLabel(
  mode: SelectableWeatherOverlayMode,
): string {
  return (
    WEATHER_OVERLAY_TOGGLE_OPTIONS.find((option) => option.value === mode)
      ?.label ?? "Overlay"
  );
}

function formatWeatherOverlayStateLabel(params: {
  activeWeatherOverlayModes: SelectableWeatherOverlayMode[];
  overlayLoading: boolean;
  overlayError: string;
  overlayPointCounts: Partial<Record<DataBackedWeatherOverlayMode, number>>;
}): string {
  const {
    activeWeatherOverlayModes,
    overlayLoading,
    overlayError,
    overlayPointCounts,
  } = params;

  if (activeWeatherOverlayModes.length === 0) {
    return "Markers only";
  }

  if (
    activeWeatherOverlayModes.length === 1 &&
    activeWeatherOverlayModes[0] === "radar"
  ) {
    return "Live NOAA radar";
  }

  if (overlayError) {
    return "Overlay Error";
  }

  if (overlayLoading) {
    return activeWeatherOverlayModes.length === 1
      ? `Loading ${formatWeatherOverlayModeLabel(activeWeatherOverlayModes[0])} overlay...`
      : `Loading ${activeWeatherOverlayModes.length} overlays...`;
  }

  const overlayPointCount = activeWeatherOverlayModes.reduce((count, mode) => {
    if (mode === "radar") {
      return count;
    }
    return count + (overlayPointCounts[mode] ?? 0);
  }, 0);

  if (activeWeatherOverlayModes.length === 1) {
    return overlayPointCount > 0
      ? `${overlayPointCount} overlay point${overlayPointCount === 1 ? "" : "s"}`
      : "No overlay data";
  }

  if (overlayPointCount > 0) {
    return `${activeWeatherOverlayModes.length} overlays active · ${overlayPointCount} points`;
  }

  return `${activeWeatherOverlayModes.length} overlays active`;
}

function setMapLayerVisibility(
  map: AssetMapLibreMap,
  layerId: string,
  visible: boolean,
): void {
  if (!hasMapLayer(map, layerId)) {
    return;
  }

  try {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  } catch {
    // MapLibre can clear its style object during React route unmount cleanup.
  }
}

function hasMapLayer(map: AssetMapLibreMap, layerId: string): boolean {
  try {
    return Boolean(map.getLayer(layerId));
  } catch {
    return false;
  }
}

function resetMapCursor(map: AssetMapLibreMap): void {
  try {
    map.getCanvas().style.cursor = "";
  } catch {
    // The canvas may already be detached while effects are cleaning up.
  }
}

function clampMapCanvasHeight(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function getMapCanvasResizeBounds(frame: HTMLDivElement): {
  currentHeight: number;
  minHeight: number;
  maxHeight: number;
} {
  const frameBounds = frame.getBoundingClientRect();
  const computedStyles =
    typeof window === "undefined" ? null : window.getComputedStyle(frame);
  const parsedMinHeight = computedStyles
    ? Number.parseFloat(computedStyles.minHeight)
    : Number.NaN;
  const minHeight = Number.isFinite(parsedMinHeight)
    ? parsedMinHeight
    : 320;
  const viewportHeight =
    typeof window === "undefined"
      ? frameBounds.height
      : Math.max(
          window.innerHeight,
          document.documentElement?.clientHeight ?? window.innerHeight,
        );
  const maxHeight = Math.max(minHeight, Math.round(viewportHeight * 0.9));

  return {
    currentHeight: frameBounds.height,
    minHeight,
    maxHeight,
  };
}

function formatMapTooltipCoordinate(value: number): string {
  return value.toFixed(4);
}

function createMapMarkerTooltip(
  title: string,
  detail?: string,
): HTMLSpanElement {
  const tooltipElement = document.createElement("span");
  tooltipElement.className = "asset-map-marker-tooltip";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  tooltipElement.append(titleElement);

  if (detail) {
    const detailElement = document.createElement("span");
    detailElement.textContent = detail;
    tooltipElement.append(detailElement);
  }

  return tooltipElement;
}

function logAssetMapError(scope: string, detail: string): void {
  if (typeof console === "undefined" || !detail.trim()) {
    return;
  }

  console.error(`[AssetMap] ${scope}: ${detail}`);
}

function formatAssetMapFilterList(labels: string[]): string {
  if (labels.length === 0) {
    return "";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatReferenceLocationLabel(
  locationCode: string | null | undefined,
  locationByCode: Map<string, LocationRecord>,
): string {
  if (!locationCode) {
    return '—';
  }

  const location = locationByCode.get(locationCode);
  return location ? `${location.code} · ${location.name}` : locationCode;
}

function formatRailRouteServiceClock(route: RailRouteRecord): string {
  const parts = [
    route.schedule_timezone ?? null,
    route.placement_cutoff_time_local ? `Place ${route.placement_cutoff_time_local}` : null,
    route.release_cutoff_time_local ? `Release ${route.release_cutoff_time_local}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(' · ') || 'No cutoffs set';
}

function formatRailRouteFreeTime(route: RailRouteRecord): string {
  const parts = [
    route.placement_free_time_hours != null ? `Placement ${route.placement_free_time_hours}h` : null,
    route.release_free_time_hours != null ? `Release ${route.release_free_time_hours}h` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(' · ') || 'No free-time defaults set';
}

export function AssetMapCanvas({
  records,
  spatialFeatures,
  railRouteSpatialFeatures,
  weatherLocations,
  weatherSyncStatus,
  showAssets: controlledShowAssets,
  showRailRoutes: controlledShowRailRoutes,
  filterCardStateKey = "asset-map.filters-card",
  assetActivityVisibility = {},
  assetGeographyVisibility = {},
  countryOptions = [],
  selectedCountryCode = "",
  subdivisionOptions = [],
  selectedSubdivisionCode = "",
  assetSubtypeOptions = [],
  assetSubtypeVisibility = {},
  weatherDataLoaded = false,
  weatherDataLoading = false,
  weatherLoadError = "",
  onShowAssetsChange,
  onShowRailRoutesChange,
  onToggleAssetActivity = () => undefined,
  onToggleAssetGeography = () => undefined,
  onSelectCountry = () => undefined,
  onSelectSubdivision = () => undefined,
  onSetAllAssetGeographiesVisible = () => undefined,
  onToggleAssetSubtype = () => undefined,
  onSetAllAssetSubtypesVisible = () => undefined,
  selectedAssetCode,
  selectedRailRouteCode = null,
  onSelectAsset,
  onSelectRailRoute = () => undefined,
  statusTitle,
  statusDetail,
}: {
  records: AssetMapRecord[];
  spatialFeatures: SpatialFeatureRecord[];
  railRouteSpatialFeatures: SpatialFeatureRecord[];
  weatherLocations: WeatherLocationRecord[];
  weatherSyncStatus: WeatherSyncStatusRecord | null;
  showAssets?: boolean;
  showRailRoutes?: boolean;
  filterCardStateKey?: string;
  assetActivityVisibility?: Record<string, boolean>;
  assetGeographyVisibility?: Record<string, boolean>;
  countryOptions?: AssetMapCountryOption[];
  selectedCountryCode?: string;
  subdivisionOptions?: AssetMapSubdivisionOption[];
  selectedSubdivisionCode?: string;
  assetSubtypeOptions: string[];
  assetSubtypeVisibility: Record<string, boolean>;
  weatherDataLoaded?: boolean;
  weatherDataLoading?: boolean;
  weatherLoadError?: string;
  onShowAssetsChange?: (visible: boolean) => void;
  onShowRailRoutesChange?: (visible: boolean) => void;
  onToggleAssetActivity?: (activityLabel: string) => void;
  onToggleAssetGeography?: (geographyLabel: string) => void;
  onSelectCountry?: (countryCode: string) => void;
  onSelectSubdivision?: (subdivisionCode: string) => void;
  onSetAllAssetGeographiesVisible?: (visible: boolean) => void;
  onToggleAssetSubtype: (assetSubtype: string) => void;
  onSetAllAssetSubtypesVisible?: (visible: boolean) => void;
  selectedAssetCode: string | null;
  selectedRailRouteCode?: string | null;
  onSelectAsset: (code: string) => void;
  onSelectRailRoute?: (code: string) => void;
  statusTitle?: string | null;
  statusDetail?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<MapLibreModule["Map"]> | null>(null);
  const runtimeRef = useRef<MapLibreModule | null>(null);
  const mapResizeStateRef = useRef<{
    startPointerY: number;
    startHeight: number;
    minHeight: number;
    maxHeight: number;
  } | null>(null);
  const markersRef = useRef<Array<InstanceType<MapLibreModule["Marker"]>>>([]);
  const weatherMarkersRef = useRef<
    Array<InstanceType<MapLibreModule["Marker"]>>
  >([]);
  const userMarkerRef = useRef<InstanceType<MapLibreModule["Marker"]> | null>(
    null,
  );
  const requestedUserLocationRef = useRef(false);
  const hasCenteredOnUserRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [geolocationError, setGeolocationError] = useState("");
  const [mapCanvasHeight, setMapCanvasHeight] = useState<number | null>(null);
  const [mapCanvasResizing, setMapCanvasResizing] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showUserLocation, setShowUserLocation] = useState(true);
  const [uncontrolledShowAssets, setUncontrolledShowAssets] = useState(true);
  const [uncontrolledShowRailRoutes, setUncontrolledShowRailRoutes] =
    useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showTooltips, setShowTooltips] = useState(true);
  const [savedFilterPresets, setSavedFilterPresets] = useState<
    AssetMapFilterPresetRecord[]
  >(() => getAssetMapFilterPresets());
  const [selectedFilterPresetName, setSelectedFilterPresetName] = useState("");
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presetSaveFeedback, setPresetSaveFeedback] = useState("");
  const [selectedWeatherLocationCode, setSelectedWeatherLocationCode] =
    useState<string | null>(null);
  const [weatherPreviewLoading, setWeatherPreviewLoading] = useState(false);
  const [weatherPreviewError, setWeatherPreviewError] = useState("");
  const [weatherForecasts, setWeatherForecasts] = useState<
    WeatherForecastPeriodRecord[]
  >([]);
  const [weatherObservations, setWeatherObservations] = useState<
    WeatherObservationRecord[]
  >([]);
  const [weatherOverlayVisibility, setWeatherOverlayVisibility] =
    useState<WeatherOverlayVisibilityState>(() =>
      createDefaultWeatherOverlayVisibilityState(),
    );
  const [weatherOverlayExpansion, setWeatherOverlayExpansion] = useState<
    Record<SelectableWeatherOverlayMode, boolean>
  >(() => createDefaultWeatherOverlayExpansionState());
  const [weatherOverlayOpacities, setWeatherOverlayOpacities] =
    useState<WeatherOverlayOpacityState>(() =>
      createDefaultWeatherOverlayOpacityState(),
    );
  const [weatherOverlayLoading, setWeatherOverlayLoading] = useState(false);
  const [weatherOverlayError, setWeatherOverlayError] = useState("");
  const [weatherOverlayPoints, setWeatherOverlayPoints] = useState<
    WeatherOverlayPointRecord[]
  >([]);
  const loggedWeatherLoadErrorRef = useRef("");
  const loggedMapLoadErrorRef = useRef("");
  const loggedGeolocationErrorRef = useRef("");
  const loggedWeatherPreviewErrorRef = useRef("");
  const loggedWeatherOverlayErrorRef = useRef("");
  const weatherOverlayPointCacheRef = useRef<
    Map<string, WeatherOverlayPointRecord | null>
  >(new Map());
  const countrySuggestionListId = useId();
  const subdivisionSuggestionListId = useId();
  const weatherOverlayPanelIdPrefix = useId();
  const weatherOverlayCardStateKey = `${filterCardStateKey}.weather-overlay`;
  const weatherOverlayExpandedState = usePersistentCollapsibleCardState(
    weatherOverlayCardStateKey,
    true,
  );
  const weatherOverlaySectionPanelId = collapsiblePanelId(
    weatherOverlayCardStateKey,
  );
  const mapCanvasStyle =
    mapCanvasHeight === null ? undefined : { height: `${mapCanvasHeight}px` };
  const handleSelectAsset = useEffectEvent((code: string) => {
    setSelectedWeatherLocationCode(null);
    onSelectAsset(code);
  });
  const handleSelectRailRoute = useEffectEvent((code: string) => {
    setSelectedWeatherLocationCode(null);
    onSelectRailRoute(code);
  });
  const handleSelectWeatherLocation = useEffectEvent((code: string) => {
    setSelectedWeatherLocationCode(code);

    const location =
      activeWeatherLocations.find((candidate) => candidate.code === code) ?? null;
    const map = mapRef.current;
    if (!location || !map) {
      return;
    }

    map.easeTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(map.getZoom(), 6.5),
      duration: 500,
    });
  });
  const showAssets = controlledShowAssets ?? uncontrolledShowAssets;
  const showRailRoutes =
    controlledShowRailRoutes ?? uncontrolledShowRailRoutes;
  const setShowAssets = useCallback(
    (visible: boolean) => {
      if (controlledShowAssets === undefined) {
        setUncontrolledShowAssets(visible);
      }
      onShowAssetsChange?.(visible);
    },
    [controlledShowAssets, onShowAssetsChange],
  );
  const setShowRailRoutes = useCallback(
    (visible: boolean) => {
      if (controlledShowRailRoutes === undefined) {
        setUncontrolledShowRailRoutes(visible);
      }
      onShowRailRoutesChange?.(visible);
    },
    [controlledShowRailRoutes, onShowRailRoutesChange],
  );
  const handleMapResizeHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType !== "touch" &&
        event.pointerType !== "pen" &&
        event.button !== 0
      ) {
        return;
      }

      const frame = mapFrameRef.current;
      if (!frame) {
        return;
      }

      event.preventDefault();

      const bounds = getMapCanvasResizeBounds(frame);
      mapResizeStateRef.current = {
        startPointerY: event.clientY,
        startHeight: mapCanvasHeight ?? bounds.currentHeight,
        minHeight: bounds.minHeight,
        maxHeight: bounds.maxHeight,
      };
      setMapCanvasHeight((currentHeight) => currentHeight ?? bounds.currentHeight);
      setMapCanvasResizing(true);
    },
    [mapCanvasHeight],
  );
  const handleMapResizeHandleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const frame = mapFrameRef.current;
      if (!frame) {
        return;
      }

      const bounds = getMapCanvasResizeBounds(frame);
      const currentHeight = mapCanvasHeight ?? bounds.currentHeight;
      let nextHeight: number | null = null;

      switch (event.key) {
        case "ArrowDown":
          nextHeight = clampMapCanvasHeight(
            currentHeight + 48,
            bounds.minHeight,
            bounds.maxHeight,
          );
          break;
        case "ArrowUp":
          nextHeight = clampMapCanvasHeight(
            currentHeight - 48,
            bounds.minHeight,
            bounds.maxHeight,
          );
          break;
        case "Home":
          nextHeight = bounds.minHeight;
          break;
        case "End":
          nextHeight = bounds.maxHeight;
          break;
        default:
          break;
      }

      if (nextHeight === null) {
        return;
      }

      event.preventDefault();
      setMapCanvasHeight(nextHeight);
    },
    [mapCanvasHeight],
  );
  const activeWeatherLocations = useMemo(
    () => weatherLocations.filter((location) => location.is_active),
    [weatherLocations],
  );
  const activeWeatherOverlayModes = useMemo(
    () =>
      WEATHER_OVERLAY_TOGGLE_OPTIONS.filter(
        (option) => weatherOverlayVisibility[option.value],
      ).map((option) => option.value),
    [weatherOverlayVisibility],
  );
  const allWeatherOverlaysVisible = useMemo(
    () =>
      WEATHER_OVERLAY_TOGGLE_OPTIONS.every(
        (option) => weatherOverlayVisibility[option.value],
      ),
    [weatherOverlayVisibility],
  );
  const trackedWeatherOverlayModes = useMemo(
    () =>
      activeWeatherOverlayModes.filter(
        (mode): mode is DataBackedWeatherOverlayMode => mode !== "radar",
      ),
    [activeWeatherOverlayModes],
  );
  const railRouteOverlayCount = railRouteSpatialFeatures.length;
  const sharedSpatialFeatureCount = spatialFeatures.length;
  const visibleActivityCount = useMemo(
    () =>
      ASSET_MAP_ACTIVITY_LABELS.filter((activityLabel) =>
        isAssetActivityVisible(assetActivityVisibility, activityLabel),
      ).length,
    [assetActivityVisibility],
  );
  const allAssetGeographiesVisible = useMemo(
    () => areAllAssetGeographiesVisible(assetGeographyVisibility),
    [assetGeographyVisibility],
  );
  const allAssetSubtypesVisible = useMemo(
    () =>
      areAllAssetSubtypesVisible(assetSubtypeOptions, assetSubtypeVisibility),
    [assetSubtypeOptions, assetSubtypeVisibility],
  );
  const filterSummary = useMemo(() => {
    const visibleLayerCount = [
      showUserLocation,
      showAssets,
      showRailRoutes,
      showWeather,
    ].filter(Boolean).length;
    const visibleGeographyCount = ASSET_MAP_GEOGRAPHY_LABELS.filter(
      (geographyLabel) =>
        isAssetGeographyVisible(assetGeographyVisibility, geographyLabel),
    ).length;
    const visibleSubtypeCount = assetSubtypeOptions.filter((assetSubtype) =>
      isAssetSubtypeVisible(assetSubtypeVisibility, assetSubtype),
    ).length;
    const parts = [
      `${visibleLayerCount} layer${visibleLayerCount === 1 ? "" : "s"} on`,
    ];

    if (showAssets) {
      parts.push(
        `${visibleActivityCount} activit${visibleActivityCount === 1 ? "y" : "ies"}`,
      );
    }

    if (showAssets || showWeather) {
      parts.push(
        `${visibleGeographyCount} geograph${visibleGeographyCount === 1 ? "y" : "ies"}`,
      );
    }

    if (showAssets || showWeather) {
      parts.push(
        selectedCountryCode
          ? formatAssetMapCountryLabel(selectedCountryCode)
          : "All countries",
      );
    }

    if (showAssets || showWeather) {
      parts.push(selectedSubdivisionCode || "All states or territories");
    }

    if (showAssets) {
      parts.push(
        assetSubtypeOptions.length > 0
          ? `${visibleSubtypeCount} asset type${visibleSubtypeCount === 1 ? "" : "s"}`
          : "No asset types",
      );
    }

    if (showRailRoutes) {
      parts.push(
        railRouteOverlayCount === 1
          ? "1 rail overlay"
          : `${railRouteOverlayCount} rail overlays`,
      );
    } else if (sharedSpatialFeatureCount > 0 && showAssets) {
      parts.push(
        sharedSpatialFeatureCount === 1
          ? "1 shared overlay"
          : `${sharedSpatialFeatureCount} shared overlays`,
      );
    }

    if (showWeather && activeWeatherOverlayModes.length > 0) {
      parts.push(
        activeWeatherOverlayModes.length === 1
          ? `${formatWeatherOverlayModeLabel(activeWeatherOverlayModes[0])} overlay`
          : `${activeWeatherOverlayModes.length} weather overlays`,
      );
    }

    return parts.join(" · ");
  }, [
    activeWeatherOverlayModes,
    assetGeographyVisibility,
    assetSubtypeOptions,
    assetSubtypeVisibility,
    selectedCountryCode,
    selectedSubdivisionCode,
    showAssets,
    showRailRoutes,
    showUserLocation,
    showWeather,
    railRouteOverlayCount,
    sharedSpatialFeatureCount,
    visibleActivityCount,
  ]);
  const weatherStatusByCode = useMemo(
    () =>
      new Map(
        (weatherSyncStatus?.locations ?? []).map(
          (location) => [location.code, location] as const,
        ),
      ),
    [weatherSyncStatus],
  );
  const weatherLocationSignature = useMemo(
    () => buildWeatherLocationSignature(activeWeatherLocations),
    [activeWeatherLocations],
  );
  const handleWeatherOverlayToggle = useCallback(
    (mode: SelectableWeatherOverlayMode, checked: boolean) => {
      setWeatherOverlayVisibility((currentState) => ({
        ...currentState,
        [mode]: checked,
      }));
      if (checked) {
        setWeatherOverlayExpansion((currentState) => ({
          ...currentState,
          [mode]: true,
        }));
      }
    },
    [],
  );
  const handleSetAllWeatherOverlaysVisible = useCallback((visible: boolean) => {
    setWeatherOverlayVisibility(createUniformWeatherOverlayVisibilityState(visible));
  }, []);
  const handleWeatherOverlayExpansionToggle = useCallback(
    (mode: SelectableWeatherOverlayMode) => {
      setWeatherOverlayExpansion((currentState) => ({
        ...currentState,
        [mode]: !currentState[mode],
      }));
    },
    [],
  );
  const handleWeatherOverlayOpacityChange = useCallback(
    (mode: SelectableWeatherOverlayMode, value: number) => {
      setWeatherOverlayOpacities((currentState) => ({
        ...currentState,
        [mode]: value,
      }));
    },
    [],
  );
  const weatherStatusSignature = useMemo(
    () => buildWeatherStatusSignature(weatherSyncStatus),
    [weatherSyncStatus],
  );
  const selectedWeatherLocation = useMemo(
    () =>
      activeWeatherLocations.find(
        (location) => location.code === selectedWeatherLocationCode,
      ) ?? null,
    [activeWeatherLocations, selectedWeatherLocationCode],
  );
  const selectedWeatherStatus = selectedWeatherLocation
    ? (weatherStatusByCode.get(selectedWeatherLocation.code) ?? null)
    : null;
  const weatherLayerStatus = formatWeatherLayerStatus({
    activeLocationCount: activeWeatherLocations.length,
    weatherDataLoaded,
    weatherDataLoading,
    weatherLoadError,
  });
  const weatherOverlayPointCollections = useMemo(
    () => ({
      precipitation: buildWeatherOverlayPointFeatureCollection(
        weatherOverlayPoints,
        "precipitation",
      ),
      wind: buildWeatherOverlayPointFeatureCollection(weatherOverlayPoints, "wind"),
      temperature: buildWeatherOverlayPointFeatureCollection(
        weatherOverlayPoints,
        "temperature",
      ),
      humidity: buildWeatherOverlayPointFeatureCollection(
        weatherOverlayPoints,
        "humidity",
      ),
      pressure: buildWeatherOverlayPointFeatureCollection(
        weatherOverlayPoints,
        "pressure",
      ),
    }),
    [weatherOverlayPoints],
  );
  const weatherWindVectorCollection = useMemo(
    () => buildWeatherOverlayWindVectorFeatureCollection(weatherOverlayPoints),
    [weatherOverlayPoints],
  );
  const weatherOverlayPointCounts = useMemo(
    () => ({
      precipitation: weatherOverlayPointCollections.precipitation.features.length,
      wind: weatherOverlayPointCollections.wind.features.length,
      temperature: weatherOverlayPointCollections.temperature.features.length,
      humidity: weatherOverlayPointCollections.humidity.features.length,
      pressure: weatherOverlayPointCollections.pressure.features.length,
    }),
    [weatherOverlayPointCollections],
  );
  const weatherOverlayStateLabel = formatWeatherOverlayStateLabel({
    activeWeatherOverlayModes,
    overlayLoading: weatherOverlayLoading,
    overlayError: weatherOverlayError,
    overlayPointCounts: weatherOverlayPointCounts,
  });
  const hasVisibleDataBackedWeatherOverlay = useMemo(
    () =>
      trackedWeatherOverlayModes.some(
        (mode) => (weatherOverlayPointCounts[mode] ?? 0) > 0,
      ),
    [trackedWeatherOverlayModes, weatherOverlayPointCounts],
  );
  const showWeatherMarkers = showWeather && !hasVisibleDataBackedWeatherOverlay;

  useEffect(() => {
    if (
      !weatherLoadError ||
      loggedWeatherLoadErrorRef.current === weatherLoadError
    ) {
      return;
    }

    logAssetMapError("Weather layer error", weatherLoadError);
    loggedWeatherLoadErrorRef.current = weatherLoadError;
  }, [weatherLoadError]);

  useEffect(() => {
    if (!loadError || loggedMapLoadErrorRef.current === loadError) {
      return;
    }

    logAssetMapError("Map error", loadError);
    loggedMapLoadErrorRef.current = loadError;
  }, [loadError]);

  useEffect(() => {
    if (
      !geolocationError ||
      loggedGeolocationErrorRef.current === geolocationError
    ) {
      return;
    }

    logAssetMapError("My location error", geolocationError);
    loggedGeolocationErrorRef.current = geolocationError;
  }, [geolocationError]);

  useEffect(() => {
    if (
      !weatherPreviewError ||
      loggedWeatherPreviewErrorRef.current === weatherPreviewError
    ) {
      return;
    }

    logAssetMapError("Weather preview error", weatherPreviewError);
    loggedWeatherPreviewErrorRef.current = weatherPreviewError;
  }, [weatherPreviewError]);

  useEffect(() => {
    weatherOverlayPointCacheRef.current.clear();
  }, [weatherStatusSignature]);

  useEffect(() => {
    if (
      !weatherOverlayError ||
      loggedWeatherOverlayErrorRef.current === weatherOverlayError
    ) {
      return;
    }

    logAssetMapError("Weather overlay error", weatherOverlayError);
    loggedWeatherOverlayErrorRef.current = weatherOverlayError;
  }, [weatherOverlayError]);

  useEffect(() => {
    if (!showWeather || trackedWeatherOverlayModes.length === 0) {
      setWeatherOverlayLoading(false);
      setWeatherOverlayError("");
      setWeatherOverlayPoints([]);
      return;
    }

    const cachedOverlayPoints = activeWeatherLocations
      .map((location) => weatherOverlayPointCacheRef.current.get(location.code))
      .filter(
        (point): point is WeatherOverlayPointRecord =>
          point !== undefined && point !== null,
      );
    const uncachedLocations = activeWeatherLocations.filter(
      (location) => !weatherOverlayPointCacheRef.current.has(location.code),
    );

    if (uncachedLocations.length === 0) {
      setWeatherOverlayLoading(false);
      setWeatherOverlayError("");
      setWeatherOverlayPoints(cachedOverlayPoints);
      return;
    }

    let cancelled = false;

    async function loadWeatherOverlayPoints() {
      setWeatherOverlayLoading(true);
      setWeatherOverlayError("");

      const loadResults = await Promise.allSettled(
        uncachedLocations.map(async (location) => {
          const [forecastResult, observationResult] = await Promise.allSettled([
            loadWeatherForecastPeriods(appConfig.apiBase, location.code, 1),
            loadWeatherObservations(appConfig.apiBase, location.code, 1),
          ]);

          const forecast =
            forecastResult.status === "fulfilled"
              ? forecastResult.value[0] ?? null
              : null;
          const observation =
            observationResult.status === "fulfilled"
              ? observationResult.value[0] ?? null
              : null;

          return {
            locationCode: location.code,
            point: buildWeatherOverlayPointRecord(location, {
              observation,
              forecast,
            }),
            failed:
              forecastResult.status === "rejected" &&
              observationResult.status === "rejected",
          };
        }),
      );

      if (cancelled) {
        return;
      }

      let failedLocationCount = 0;

      loadResults.forEach((result, index) => {
        const locationCode = uncachedLocations[index]?.code;
        if (!locationCode) {
          return;
        }

        if (result.status === "fulfilled") {
          weatherOverlayPointCacheRef.current.set(
            locationCode,
            result.value.point,
          );
          if (result.value.failed) {
            failedLocationCount += 1;
          }
          return;
        }

        failedLocationCount += 1;
        weatherOverlayPointCacheRef.current.set(locationCode, null);
      });

      const nextOverlayPoints = activeWeatherLocations
        .map((location) => weatherOverlayPointCacheRef.current.get(location.code))
        .filter(
          (point): point is WeatherOverlayPointRecord =>
            point !== undefined && point !== null,
        );
      setWeatherOverlayPoints(nextOverlayPoints);
      setWeatherOverlayLoading(false);
      setWeatherOverlayError(
        failedLocationCount > 0 && nextOverlayPoints.length === 0
          ? "Unable to load tracked weather overlay data."
          : failedLocationCount > 0
            ? `${failedLocationCount} tracked weather point${failedLocationCount === 1 ? "" : "s"} could not be loaded for this overlay.`
            : "",
      );
    }

    void loadWeatherOverlayPoints();

    return () => {
      cancelled = true;
    };
  }, [
    activeWeatherLocations,
    showWeather,
    trackedWeatherOverlayModes,
    weatherLocationSignature,
  ]);

  useEffect(() => {
    if (!mapCanvasResizing || typeof window === "undefined") {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const resizeState = mapResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      event.preventDefault();
      const nextHeight = clampMapCanvasHeight(
        resizeState.startHeight + (event.clientY - resizeState.startPointerY),
        resizeState.minHeight,
        resizeState.maxHeight,
      );
      setMapCanvasHeight(nextHeight);
    }

    function stopResizing() {
      mapResizeStateRef.current = null;
      setMapCanvasResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    document.body.classList.add("is-map-resizing");

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.classList.remove("is-map-resizing");
    };
  }, [mapCanvasResizing]);

  useEffect(() => {
    if (mapCanvasHeight === null || typeof window === "undefined") {
      return;
    }

    function handleWindowResize() {
      const frame = mapFrameRef.current;
      if (!frame) {
        return;
      }

      const bounds = getMapCanvasResizeBounds(frame);
      setMapCanvasHeight((currentHeight) =>
        currentHeight === null
          ? null
          : clampMapCanvasHeight(
              currentHeight,
              bounds.minHeight,
              bounds.maxHeight,
            ),
      );
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [mapCanvasHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    async function initializeMap() {
      try {
        const runtime = await import("maplibre-gl");
        if (cancelled || !containerRef.current) {
          return;
        }

        runtimeRef.current = runtime;
        const map = new runtime.Map({
          container: containerRef.current,
          style: FALLBACK_MAP_STYLE,
          center: [-96, 37.8],
          zoom: 2.4,
          minZoom: 1.5,
        });
        map.addControl(
          new runtime.NavigationControl({ visualizePitch: true }),
          "top-right",
        );
        map.addControl(
          new runtime.ScaleControl({ maxWidth: 120, unit: "imperial" }),
          "bottom-left",
        );
        map.once("load", () => {
          if (!cancelled) {
            setReady(true);
          }
        });
        mapRef.current = map;
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Asset map failed to load.",
          );
        }
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
      setReady(false);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      weatherMarkersRef.current.forEach((marker) => marker.remove());
      weatherMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      requestedUserLocationRef.current = false;
      hasCenteredOnUserRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      !ready ||
      !containerRef.current ||
      !mapRef.current ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const map = mapRef.current;
    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [ready]);

  const recordSignature = useMemo(
    () => buildRecordSignature(records),
    [records],
  );
  const spatialFeatureSignature = useMemo(
    () => buildSpatialFeatureSignature(spatialFeatures),
    [spatialFeatures],
  );

  useEffect(() => {
    if (showWeather) {
      return;
    }

    setSelectedWeatherLocationCode(null);
  }, [showWeather]);

  useEffect(() => {
    if (!selectedWeatherLocationCode) {
      return;
    }

    if (
      !showWeather ||
      !activeWeatherLocations.some(
        (location) => location.code === selectedWeatherLocationCode,
      )
    ) {
      setSelectedWeatherLocationCode(null);
    }
  }, [activeWeatherLocations, selectedWeatherLocationCode, showWeather]);

  useEffect(() => {
    if (!showWeather || !selectedWeatherLocation) {
      setWeatherPreviewLoading(false);
      setWeatherPreviewError("");
      setWeatherForecasts([]);
      setWeatherObservations([]);
      return;
    }

    let cancelled = false;
    const weatherLocationCode = selectedWeatherLocation.code;

    async function loadWeatherPreview() {
      setWeatherPreviewLoading(true);
      setWeatherPreviewError("");
      setWeatherForecasts([]);
      setWeatherObservations([]);

      try {
        const [forecastResult, observationResult] = await Promise.all([
          loadWeatherForecastPeriods(appConfig.apiBase, weatherLocationCode, 2),
          loadWeatherObservations(appConfig.apiBase, weatherLocationCode, 2),
        ]);

        if (!cancelled) {
          setWeatherForecasts(forecastResult);
          setWeatherObservations(observationResult);
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherPreviewError(
            error instanceof Error
              ? error.message
              : "Unable to load weather location preview.",
          );
        }
      } finally {
        if (!cancelled) {
          setWeatherPreviewLoading(false);
        }
      }
    }

    void loadWeatherPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedWeatherLocation, showWeather]);

  function handleSaveFilterPreset() {
    const presetName = presetNameInput.trim();
    if (!presetName) {
      setPresetSaveFeedback("Enter a name before saving.");
      return;
    }

    const nextPresets = saveAssetMapFilterPreset({
      name: presetName,
      savedAt: new Date().toISOString(),
      filters: {
        showUserLocation,
        showAssets,
        showRailRoutes,
        showWeather,
        showTooltips,
        weatherOverlayVisibility,
        weatherOverlayOpacities,
        assetActivityVisibility,
        assetGeographyVisibility,
        selectedCountryCode,
        selectedSubdivisionCode,
        assetSubtypeVisibility,
      },
    });
    setSavedFilterPresets(nextPresets);
    setSelectedFilterPresetName(presetName);
    setPresetSaveFeedback(`Saved preset "${presetName}".`);
  }

  function handleSelectFilterPreset(presetName: string) {
    setSelectedFilterPresetName(presetName);
    if (!presetName) {
      setPresetSaveFeedback("");
      return;
    }

    const selectedPreset =
      savedFilterPresets.find((preset) => preset.name === presetName) ?? null;
    if (!selectedPreset) {
      return;
    }

    setShowUserLocation(selectedPreset.filters.showUserLocation);
    setShowAssets(selectedPreset.filters.showAssets);
    setShowRailRoutes(selectedPreset.filters.showRailRoutes);
    setShowWeather(selectedPreset.filters.showWeather);
    setShowTooltips(selectedPreset.filters.showTooltips);
    setWeatherOverlayVisibility(selectedPreset.filters.weatherOverlayVisibility);
    setWeatherOverlayExpansion(
      createExpandedWeatherOverlayExpansionState(
        selectedPreset.filters.weatherOverlayVisibility,
      ),
    );
    setWeatherOverlayOpacities(selectedPreset.filters.weatherOverlayOpacities);

    const nextAssetActivityVisibility = syncAssetActivityVisibilityState(
      selectedPreset.filters.assetActivityVisibility,
    );
    ASSET_MAP_ACTIVITY_LABELS.forEach((activityLabel) => {
      if (
        isAssetActivityVisible(assetActivityVisibility, activityLabel) !==
        isAssetActivityVisible(nextAssetActivityVisibility, activityLabel)
      ) {
        onToggleAssetActivity(activityLabel);
      }
    });

    const nextAssetGeographyVisibility = syncAssetGeographyVisibilityState(
      selectedPreset.filters.assetGeographyVisibility,
    );
    ASSET_MAP_GEOGRAPHY_LABELS.forEach((geographyLabel) => {
      if (
        isAssetGeographyVisible(assetGeographyVisibility, geographyLabel) !==
        isAssetGeographyVisible(nextAssetGeographyVisibility, geographyLabel)
      ) {
        onToggleAssetGeography(geographyLabel);
      }
    });

    const nextAssetSubtypeVisibility = syncAssetSubtypeVisibilityState(
      assetSubtypeOptions,
      selectedPreset.filters.assetSubtypeVisibility,
    );
    assetSubtypeOptions.forEach((assetSubtype) => {
      if (
        isAssetSubtypeVisible(assetSubtypeVisibility, assetSubtype) !==
        isAssetSubtypeVisible(nextAssetSubtypeVisibility, assetSubtype)
      ) {
        onToggleAssetSubtype(assetSubtype);
      }
    });

    onSelectCountry(selectedPreset.filters.selectedCountryCode);
    onSelectSubdivision(selectedPreset.filters.selectedSubdivisionCode);
    setPresetSaveFeedback(`Loaded preset "${selectedPreset.name}".`);
  }

  useEffect(() => {
    if (!ready || !mapRef.current || !runtimeRef.current) {
      return;
    }

    const map = mapRef.current;
    const runtime = runtimeRef.current;
    const hasVisibleAssetData =
      showAssets &&
      records.some((record) => record.extentCoordinates.length > 0);
    const hasVisibleRailRouteData =
      showRailRoutes &&
      buildSpatialFeatureExtentCoordinates(railRouteSpatialFeatures).length > 0;
    const hasVisibleWeatherData =
      showWeather && activeWeatherLocations.length > 0;

    if (!showUserLocation || !userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    userMarkerRef.current?.remove();

    const markerElement = document.createElement("div");
    markerElement.className = "asset-map-user-marker";
    markerElement.setAttribute("aria-hidden", "true");
    if (showTooltips) {
      markerElement.append(
        createMapMarkerTooltip(
          "My Location",
          `${formatMapTooltipCoordinate(userLocation.latitude)}, ${formatMapTooltipCoordinate(userLocation.longitude)}`,
        ),
      );
    }

    userMarkerRef.current = new runtime.Marker({
      element: markerElement,
      anchor: "center",
    })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map);

    if (
      !hasCenteredOnUserRef.current &&
      !hasVisibleAssetData &&
      !hasVisibleRailRouteData &&
      !hasVisibleWeatherData
    ) {
      map.easeTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: Math.max(map.getZoom(), 8.5),
        duration: 700,
      });
      hasCenteredOnUserRef.current = true;
    }
  }, [
    activeWeatherLocations,
    railRouteSpatialFeatures,
    ready,
    records,
    showAssets,
    showRailRoutes,
    showUserLocation,
    showWeather,
    showTooltips,
    userLocation,
  ]);

  useEffect(() => {
    if (!ready || requestedUserLocationRef.current || !showUserLocation) {
      return;
    }

    requestedUserLocationRef.current = true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeolocationError("Current location is not available in this browser.");
      return;
    }

    setGeolocationError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        setGeolocationError(formatGeolocationError(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  }, [ready, showUserLocation]);

  useEffect(() => {
    if (!ready || !mapRef.current || !runtimeRef.current) {
      return;
    }

    const map = mapRef.current;
    const runtime = runtimeRef.current;
    const visibleRecords = showAssets ? records : [];
    const visibleSpatialFeatures = [
      ...(showAssets ? spatialFeatures : []),
      ...(showRailRoutes ? railRouteSpatialFeatures : []),
    ];
    const selectedWeatherLocationForFit = showWeather
      ? (activeWeatherLocations.find(
          (location) => location.code === selectedWeatherLocationCode,
        ) ?? null)
      : null;

    const featureCollection = buildAssetMapFeatureCollection(visibleRecords);
    const sourceData = {
      ...featureCollection,
      features: featureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          isSelected: feature.properties?.assetCode === selectedAssetCode,
        },
      })),
    };

    const existingSource = map.getSource(ASSET_GEOMETRY_SOURCE_ID) as
      | {
          setData: (data: unknown) => void;
        }
      | undefined;

    if (existingSource) {
      existingSource.setData(sourceData);
    } else {
      map.addSource(ASSET_GEOMETRY_SOURCE_ID, {
        type: "geojson",
        data: sourceData,
      });
      map.addLayer({
        id: ASSET_GEOMETRY_FILL_LAYER_ID,
        type: "fill",
        source: ASSET_GEOMETRY_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "MultiPolygon"],
        ],
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            "#13293d",
            "#127c6c",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            0.22,
            0.1,
          ],
        },
      });
      map.addLayer({
        id: ASSET_GEOMETRY_LINE_LAYER_ID,
        type: "line",
        source: ASSET_GEOMETRY_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "MultiLineString"],
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "MultiPolygon"],
        ],
        paint: {
          "line-color": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            "#13293d",
            "#127c6c",
          ],
          "line-opacity": 0.8,
          "line-width": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            3,
            2,
          ],
        },
      });
      map.addLayer({
        id: ASSET_GEOMETRY_POINT_LAYER_ID,
        type: "circle",
        source: ASSET_GEOMETRY_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "Point"],
          ["==", ["geometry-type"], "MultiPoint"],
        ],
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            "#13293d",
            "#127c6c",
          ],
          "circle-radius": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            6,
            4,
          ],
          "circle-opacity": 0.45,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
    }

    const spatialFeatureCollection = buildSpatialFeatureMapFeatureCollection(
      visibleSpatialFeatures,
    );
    const spatialFeatureSourceData = {
      ...spatialFeatureCollection,
      features: spatialFeatureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          isLinkedSelection:
            (feature.properties?.entityType === "ASSET" &&
              feature.properties?.entityCode === selectedAssetCode) ||
            (feature.properties?.entityType === "RAIL_ROUTE" &&
              feature.properties?.entityCode === selectedRailRouteCode),
        },
      })),
    };

    const existingSpatialFeatureSource = map.getSource(
      SPATIAL_FEATURE_SOURCE_ID,
    ) as
      | {
          setData: (data: unknown) => void;
        }
      | undefined;

    if (existingSpatialFeatureSource) {
      existingSpatialFeatureSource.setData(spatialFeatureSourceData);
    } else {
      map.addSource(SPATIAL_FEATURE_SOURCE_ID, {
        type: "geojson",
        data: spatialFeatureSourceData,
      });
      map.addLayer({
        id: SPATIAL_FEATURE_FILL_LAYER_ID,
        type: "fill",
        source: SPATIAL_FEATURE_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "MultiPolygon"],
        ],
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["get", "isLinkedSelection"], false],
            "#9a3412",
            "#b45309",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["get", "isLinkedSelection"], false],
            0.14,
            0.08,
          ],
        },
      });
      map.addLayer({
        id: SPATIAL_FEATURE_LINE_LAYER_ID,
        type: "line",
        source: SPATIAL_FEATURE_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "MultiLineString"],
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "MultiPolygon"],
        ],
        paint: {
          "line-color": [
            "case",
            ["boolean", ["get", "isLinkedSelection"], false],
            "#9a3412",
            "#b45309",
          ],
          "line-opacity": 0.7,
          "line-width": [
            "case",
            ["boolean", ["get", "isLinkedSelection"], false],
            3,
            2,
          ],
          "line-dasharray": [2, 1],
        },
      });
      map.addLayer({
        id: SPATIAL_FEATURE_POINT_LAYER_ID,
        type: "circle",
        source: SPATIAL_FEATURE_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "Point"],
          ["==", ["geometry-type"], "MultiPoint"],
        ],
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["get", "isLinkedSelection"], false],
            "#9a3412",
            "#b45309",
          ],
          "circle-radius": [
            "case",
            ["boolean", ["get", "isLinkedSelection"], false],
            5,
            3,
          ],
          "circle-opacity": 0.4,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    weatherMarkersRef.current.forEach((marker) => marker.remove());
    weatherMarkersRef.current = [];

    visibleRecords.forEach((record) => {
      if (record.latitude === null || record.longitude === null) {
        return;
      }

      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = [
        "asset-map-marker",
        record.asset.code === selectedAssetCode ? "is-selected" : "",
        record.asset.is_active ? "" : "is-inactive",
      ]
        .filter(Boolean)
        .join(" ");
      markerElement.setAttribute(
        "aria-label",
        `Open asset ${record.asset.code}: ${record.asset.name}`,
      );
      if (showTooltips) {
        markerElement.append(
          createMapMarkerTooltip(
            `${record.asset.code} · ${record.asset.name}`,
            `${assetMapSubtypeLabelForAsset(record.asset)} · ${formatAssetMapSource(record)}`,
          ),
        );
      }
      markerElement.addEventListener("click", () => {
        handleSelectAsset(record.asset.code);
      });

      const marker = new runtime.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat([record.longitude, record.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (showWeatherMarkers) {
      activeWeatherLocations.forEach((location) => {
        const weatherStatus = weatherStatusByCode.get(location.code);
        const markerElement = document.createElement("button");
        const markerLabel = document.createElement("span");
        markerLabel.className = "asset-map-weather-marker-label";
        markerLabel.textContent = "Wx";
        markerElement.type = "button";
        markerElement.className = [
          "asset-map-weather-marker",
          `is-${weatherStatus?.health_status ?? "unknown"}`,
          selectedWeatherLocationCode === location.code ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        markerElement.setAttribute(
          "aria-label",
          `Open weather location ${location.code}: ${location.name}`,
        );
        markerElement.append(markerLabel);
        if (showTooltips) {
          markerElement.append(
            createMapMarkerTooltip(
              `${location.code} · ${location.name}`,
              `Weather ${weatherHealthLabel(weatherStatus?.health_status ?? "unknown")}`,
            ),
          );
        }
        markerElement.addEventListener("click", () => {
          handleSelectWeatherLocation(location.code);
        });

        const marker = new runtime.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat([location.longitude, location.latitude])
          .addTo(map);

        weatherMarkersRef.current.push(marker);
      });
    }

    map.resize();

    const spatialFeatureCoordinates = buildSpatialFeatureExtentCoordinates(
      visibleSpatialFeatures,
    );
    const weatherCoordinates = showWeather
      ? activeWeatherLocations.map(
          (location) =>
            [location.longitude, location.latitude] as [number, number],
        )
      : [];

    if (selectedWeatherLocationForFit) {
      map.easeTo({
        center: [
          selectedWeatherLocationForFit.longitude,
          selectedWeatherLocationForFit.latitude,
        ],
        zoom: Math.max(map.getZoom(), 6.5),
        duration: 600,
      });
      return;
    }

    const selectedRecord = showAssets
      ? (records.find((record) => record.asset.code === selectedAssetCode) ??
        null)
      : null;

    if (selectedRecord) {
      const selectedAssetCoordinates = selectedRecord.extentCoordinates;

      if (selectedAssetCoordinates.length === 1) {
        const [longitude, latitude] = selectedAssetCoordinates[0];
        map.easeTo({
          center: [longitude, latitude],
          zoom: Math.max(map.getZoom(), 6.2),
          duration: 600,
        });
        return;
      }

      if (selectedAssetCoordinates.length > 1) {
        const bounds = new runtime.LngLatBounds(
          selectedAssetCoordinates[0],
          selectedAssetCoordinates[0],
        );
        selectedAssetCoordinates
          .slice(1)
          .forEach((coordinate) => bounds.extend(coordinate));
        map.fitBounds(bounds, {
          padding: 72,
          duration: 600,
          maxZoom: 8,
        });
        return;
      }
    }

    const selectedRailRouteCoordinates = showRailRoutes
      ? buildSpatialFeatureExtentCoordinates(
          railRouteSpatialFeatures.filter(
            (feature) => feature.entity_code === selectedRailRouteCode,
          ),
        )
      : [];

    if (selectedRailRouteCoordinates.length === 1) {
      const [longitude, latitude] = selectedRailRouteCoordinates[0];
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 5.6),
        duration: 600,
      });
      return;
    }

    if (selectedRailRouteCoordinates.length > 1) {
      const bounds = new runtime.LngLatBounds(
        selectedRailRouteCoordinates[0],
        selectedRailRouteCoordinates[0],
      );
      selectedRailRouteCoordinates
        .slice(1)
        .forEach((coordinate) => bounds.extend(coordinate));
      map.fitBounds(bounds, {
        padding: 72,
        duration: 600,
        maxZoom: 7,
      });
      return;
    }

    const combinedCoordinates = [
      ...visibleRecords.flatMap((record) => record.extentCoordinates),
      ...spatialFeatureCoordinates,
      ...weatherCoordinates,
    ];

    if (combinedCoordinates.length === 1) {
      const [longitude, latitude] = combinedCoordinates[0];
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 5.4),
        duration: 600,
      });
      return;
    }

    if (combinedCoordinates.length > 1) {
      const bounds = new runtime.LngLatBounds(
        combinedCoordinates[0],
        combinedCoordinates[0],
      );
      combinedCoordinates
        .slice(1)
        .forEach((coordinate) => bounds.extend(coordinate));
      map.fitBounds(bounds, {
        padding: 64,
        duration: 600,
        maxZoom: 6.2,
      });
    }
  }, [
    activeWeatherLocations,
    ready,
    recordSignature,
    records,
    selectedAssetCode,
    selectedWeatherLocationCode,
    showAssets,
    showRailRoutes,
    showWeather,
    showWeatherMarkers,
    showTooltips,
    spatialFeatureSignature,
    spatialFeatures,
    railRouteSpatialFeatures,
    weatherLocationSignature,
    selectedRailRouteCode,
    weatherStatusByCode,
    weatherStatusSignature,
  ]);

  useEffect(() => {
    if (!ready || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const layerIds = [
      SPATIAL_FEATURE_FILL_LAYER_ID,
      SPATIAL_FEATURE_LINE_LAYER_ID,
      SPATIAL_FEATURE_POINT_LAYER_ID,
    ];

    const handleRailRouteClick = (event: {
      features?: Array<{
        properties?: {
          entityType?: unknown;
          entityCode?: unknown;
        };
      }>;
    }) => {
      const selectedFeature = event.features?.find(
        (feature) =>
          feature.properties?.entityType === "RAIL_ROUTE" &&
          typeof feature.properties?.entityCode === "string",
      );
      const railRouteCode =
        typeof selectedFeature?.properties?.entityCode === "string"
          ? selectedFeature.properties.entityCode
          : null;
      if (!railRouteCode) {
        return;
      }
      handleSelectRailRoute(railRouteCode);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    layerIds.forEach((layerId) => {
      map.on("click", layerId, handleRailRouteClick as never);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);
    });

    return () => {
      layerIds.forEach((layerId) => {
        if (!hasMapLayer(map, layerId)) {
          return;
        }

        map.off("click", layerId, handleRailRouteClick as never);
        map.off("mouseenter", layerId, handleMouseEnter);
        map.off("mouseleave", layerId, handleMouseLeave);
      });
      resetMapCursor(map);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const shouldShowRadar = showWeather && weatherOverlayVisibility.radar;

    if (!map.getSource(WEATHER_RADAR_SOURCE_ID)) {
      map.addSource(WEATHER_RADAR_SOURCE_ID, {
        type: "raster",
        tiles: [NOAA_RADAR_TILE_URL],
        tileSize: 256,
      });
    }

    if (!hasMapLayer(map, WEATHER_RADAR_LAYER_ID)) {
      map.addLayer(
        {
          id: WEATHER_RADAR_LAYER_ID,
          type: "raster",
          source: WEATHER_RADAR_SOURCE_ID,
          paint: {
            "raster-opacity": weatherOverlayOpacities.radar,
          },
        },
        hasMapLayer(map, ASSET_GEOMETRY_FILL_LAYER_ID)
          ? ASSET_GEOMETRY_FILL_LAYER_ID
          : undefined,
      );
    }

    map.setPaintProperty(
      WEATHER_RADAR_LAYER_ID,
      "raster-opacity",
      weatherOverlayOpacities.radar,
    );
    setMapLayerVisibility(map, WEATHER_RADAR_LAYER_ID, shouldShowRadar);
  }, [ready, showWeather, weatherOverlayOpacities, weatherOverlayVisibility]);

  useEffect(() => {
    if (!ready || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const beforeLayerId = hasMapLayer(map, ASSET_GEOMETRY_FILL_LAYER_ID)
      ? ASSET_GEOMETRY_FILL_LAYER_ID
      : undefined;

    WEATHER_SCALAR_OVERLAY_MODES.forEach((mode) => {
      const collection = weatherOverlayPointCollections[mode];
      const sourceId = weatherOverlayPointSourceId(mode);
      const glowLayerId = weatherOverlayGlowLayerId(mode);
      const pointLayerId = weatherOverlayPointLayerId(mode);
      const colorExpression = getWeatherOverlayColorExpression(mode);
      const opacity = weatherOverlayOpacities[mode];
      const overlayActive =
        showWeather &&
        weatherOverlayVisibility[mode] &&
        collection.features.length > 0;

      const pointSource = map.getSource(sourceId) as
        | {
            setData: (data: unknown) => void;
          }
        | undefined;
      if (pointSource) {
        pointSource.setData(collection);
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data: collection,
        });
      }

      if (!hasMapLayer(map, glowLayerId)) {
        map.addLayer(
          {
            id: glowLayerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-color": colorExpression.glowColor,
              "circle-opacity": opacity * 0.2,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                26,
                4,
                42,
                6,
                58,
              ],
              "circle-blur": 0.75,
            },
          },
          beforeLayerId,
        );
      }

      if (!hasMapLayer(map, pointLayerId)) {
        map.addLayer(
          {
            id: pointLayerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-color": colorExpression.circleColor,
              "circle-opacity": Math.min(opacity + 0.08, 0.92),
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                5,
                4,
                7,
                6,
                10,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.1,
            },
          },
          beforeLayerId,
        );
      }

      map.setPaintProperty(glowLayerId, "circle-color", colorExpression.glowColor);
      map.setPaintProperty(glowLayerId, "circle-opacity", opacity * 0.2);
      map.setPaintProperty(pointLayerId, "circle-color", colorExpression.circleColor);
      map.setPaintProperty(
        pointLayerId,
        "circle-opacity",
        Math.min(opacity + 0.08, 0.92),
      );

      setMapLayerVisibility(map, glowLayerId, overlayActive);
      setMapLayerVisibility(map, pointLayerId, overlayActive);
    });

    const windPointSourceId = weatherOverlayPointSourceId("wind");
    const windPointLayerId = weatherOverlayPointLayerId("wind");
    const windPointCollection = weatherOverlayPointCollections.wind;
    const windColorExpression = getWeatherOverlayColorExpression("wind");
    const windOpacity = weatherOverlayOpacities.wind;
    const windOverlayActive =
      showWeather &&
      weatherOverlayVisibility.wind &&
      windPointCollection.features.length > 0;

    const windPointSource = map.getSource(windPointSourceId) as
      | {
          setData: (data: unknown) => void;
        }
      | undefined;
    if (windPointSource) {
      windPointSource.setData(windPointCollection);
    } else {
      map.addSource(windPointSourceId, {
        type: "geojson",
        data: windPointCollection,
      });
    }

    const windVectorSource = map.getSource(WEATHER_WIND_VECTOR_SOURCE_ID) as
      | {
          setData: (data: unknown) => void;
        }
      | undefined;
    if (windVectorSource) {
      windVectorSource.setData(weatherWindVectorCollection);
    } else {
      map.addSource(WEATHER_WIND_VECTOR_SOURCE_ID, {
        type: "geojson",
        data: weatherWindVectorCollection,
      });
    }

    if (!hasMapLayer(map, windPointLayerId)) {
      map.addLayer(
        {
          id: windPointLayerId,
          type: "circle",
          source: windPointSourceId,
          paint: {
            "circle-color": windColorExpression.circleColor,
            "circle-opacity": Math.min(windOpacity + 0.08, 0.92),
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              2,
              5,
              4,
              7,
              6,
              10,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.1,
          },
        },
        beforeLayerId,
      );
    }

    if (!hasMapLayer(map, WEATHER_WIND_VECTOR_LAYER_ID)) {
      map.addLayer(
        {
          id: WEATHER_WIND_VECTOR_LAYER_ID,
          type: "line",
          source: WEATHER_WIND_VECTOR_SOURCE_ID,
          paint: {
            "line-color": windColorExpression.circleColor,
            "line-opacity": Math.min(windOpacity + 0.06, 0.88),
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              2,
              1.4,
              4,
              2.1,
              6,
              3,
            ],
          },
        },
        beforeLayerId,
      );
    }

    map.setPaintProperty(
      windPointLayerId,
      "circle-color",
      windColorExpression.circleColor,
    );
    map.setPaintProperty(
      windPointLayerId,
      "circle-opacity",
      Math.min(windOpacity + 0.08, 0.92),
    );
    map.setPaintProperty(
      WEATHER_WIND_VECTOR_LAYER_ID,
      "line-color",
      windColorExpression.circleColor,
    );
    map.setPaintProperty(
      WEATHER_WIND_VECTOR_LAYER_ID,
      "line-opacity",
      Math.min(windOpacity + 0.06, 0.88),
    );

    setMapLayerVisibility(map, windPointLayerId, windOverlayActive);
    setMapLayerVisibility(
      map,
      WEATHER_WIND_VECTOR_LAYER_ID,
      windOverlayActive && weatherWindVectorCollection.features.length > 0,
    );
  }, [
    ready,
    showWeather,
    weatherOverlayOpacities,
    weatherOverlayPointCollections,
    weatherOverlayVisibility,
    weatherWindVectorCollection,
  ]);

  useEffect(() => {
    if (!ready || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const layerIds = [
      ...WEATHER_SCALAR_OVERLAY_MODES.flatMap((mode) => [
        weatherOverlayPointLayerId(mode),
      ]),
      weatherOverlayPointLayerId("wind"),
      WEATHER_WIND_VECTOR_LAYER_ID,
    ];

    const handleWeatherOverlayClick = (event: {
      features?: Array<{
        properties?: {
          code?: unknown;
        };
      }>;
    }) => {
      const selectedFeature = event.features?.find(
        (feature) => typeof feature.properties?.code === "string",
      );
      const weatherLocationCode =
        typeof selectedFeature?.properties?.code === "string"
          ? selectedFeature.properties.code
          : null;
      if (!weatherLocationCode) {
        return;
      }

      handleSelectWeatherLocation(weatherLocationCode);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    layerIds.forEach((layerId) => {
      if (!hasMapLayer(map, layerId)) {
        return;
      }

      map.on("click", layerId, handleWeatherOverlayClick as never);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);
    });

    return () => {
      layerIds.forEach((layerId) => {
        if (!hasMapLayer(map, layerId)) {
          return;
        }

        map.off("click", layerId, handleWeatherOverlayClick as never);
        map.off("mouseenter", layerId, handleMouseEnter);
        map.off("mouseleave", layerId, handleMouseLeave);
      });
      resetMapCursor(map);
    };
  }, [ready]);

  return (
    <div className="asset-map-canvas-shell">
      <AssetMapFiltersCard
        summary={filterSummary}
        collapsibleStateKey={filterCardStateKey}
      >
        <div
          className="asset-map-layer-controls"
          aria-label="Map layer visibility controls"
        >
          <span className="asset-map-layer-controls-label">Show</span>
          <label className="asset-map-layer-toggle">
            <input
              type="checkbox"
              checked={showUserLocation}
              onChange={(event) => setShowUserLocation(event.target.checked)}
            />
            <span>My Location</span>
          </label>
          <label className="asset-map-layer-toggle">
            <input
              type="checkbox"
              checked={showAssets}
              onChange={(event) => setShowAssets(event.target.checked)}
            />
            <span>Assets</span>
          </label>
          <label className="asset-map-layer-toggle">
            <input
              type="checkbox"
              checked={showRailRoutes}
              onChange={(event) => setShowRailRoutes(event.target.checked)}
              disabled={railRouteOverlayCount === 0}
            />
            <span>Rail Routes</span>
          </label>
          <label className="asset-map-layer-toggle">
            <input
              type="checkbox"
              checked={showWeather}
              onChange={(event) => setShowWeather(event.target.checked)}
            />
            <span>Weather</span>
          </label>
          {showWeather ? (
            <div className="asset-map-layer-status" aria-live="polite">
              <span
                className="asset-map-weather-legend-marker"
                aria-hidden="true"
              >
                <span className="asset-map-weather-marker-label">Wx</span>
              </span>
              <span>{weatherLayerStatus}</span>
              <label className="asset-map-layer-inline-toggle">
                <input
                  type="checkbox"
                  checked={showTooltips}
                  onChange={(event) => setShowTooltips(event.target.checked)}
                />
                <span>Tooltips</span>
              </label>
            </div>
          ) : (
            <div className="asset-map-layer-status">
              <label className="asset-map-layer-inline-toggle">
                <input
                  type="checkbox"
                  checked={showTooltips}
                  onChange={(event) => setShowTooltips(event.target.checked)}
                />
                <span>Tooltips</span>
              </label>
            </div>
          )}
        </div>

        {showWeather ? (
          <div
            className={`asset-map-weather-overlay-controls ${weatherOverlayExpandedState.expanded ? "" : "is-collapsed"}`.trim()}
            aria-label="Weather overlay controls"
          >
            <button
              type="button"
              className="asset-map-weather-overlay-section-toggle"
              aria-expanded={weatherOverlayExpandedState.expanded}
              aria-controls={weatherOverlaySectionPanelId}
              onClick={() =>
                weatherOverlayExpandedState.setExpanded((current) => !current)
              }
            >
              <div className="asset-map-weather-overlay-section-copy">
                <span className="asset-map-subtype-controls-label">
                  Weather Overlay
                </span>
                <span
                  className="asset-map-weather-overlay-state"
                  aria-live="polite"
                >
                  {weatherOverlayStateLabel}
                </span>
              </div>
              <div className="asset-map-weather-overlay-section-toggle-meta">
                <small>
                  {weatherOverlayExpandedState.expanded
                    ? "Hide section"
                    : "Show section"}
                </small>
                <span
                  className="asset-map-weather-overlay-section-toggle-indicator"
                  aria-hidden="true"
                >
                  {weatherOverlayExpandedState.expanded ? "−" : "+"}
                </span>
              </div>
            </button>

            <div
              id={weatherOverlaySectionPanelId}
              className="asset-map-weather-overlay-body"
              hidden={!weatherOverlayExpandedState.expanded}
            >
              <div className="asset-map-weather-overlay-actions">
                <button
                  type="button"
                  className="asset-map-subtype-bulk-toggle"
                  aria-label={`${allWeatherOverlaysVisible ? "Uncheck" : "Check"} all weather overlays`}
                  onClick={() =>
                    handleSetAllWeatherOverlaysVisible(!allWeatherOverlaysVisible)
                  }
                >
                  {allWeatherOverlaysVisible ? "Uncheck all" : "Check all"}
                </button>
              </div>
              <div
                className="asset-map-weather-overlay-list"
                aria-label="Weather overlay layers"
                role="group"
              >
                {WEATHER_OVERLAY_TOGGLE_OPTIONS.map((option) => {
                  const isSelected = weatherOverlayVisibility[option.value];
                  const isExpanded = weatherOverlayExpansion[option.value];
                  const overlayOpacity = weatherOverlayOpacities[option.value];
                  const overlayLegend = getWeatherOverlayLegendConfig(option.value);
                  const overlayPanelId = `${weatherOverlayPanelIdPrefix}-${option.value}-details`;
                  return (
                    <div
                      key={option.value}
                      className="asset-map-weather-overlay-item"
                      data-selected={isSelected ? "true" : "false"}
                      data-expanded={isExpanded ? "true" : "false"}
                    >
                      <div className="asset-map-weather-overlay-item-head">
                        <label className="asset-map-weather-overlay-toggle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) =>
                              handleWeatherOverlayToggle(
                                option.value,
                                event.target.checked,
                              )
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                        <button
                          type="button"
                          className="asset-map-weather-overlay-expand-button"
                          aria-label={`${isExpanded ? "Hide" : "Show"} ${option.label} overlay details`}
                          aria-expanded={isExpanded}
                          aria-controls={overlayPanelId}
                          onClick={() =>
                            handleWeatherOverlayExpansionToggle(option.value)
                          }
                        >
                          {isExpanded ? "Hide details" : "Show details"}
                        </button>
                      </div>

                      <div
                        id={overlayPanelId}
                        className="asset-map-weather-overlay-details"
                        hidden={!isExpanded}
                      >
                        <label className="asset-map-inline-picker asset-map-overlay-slider-field">
                          <span className="asset-map-inline-select-label">Opacity</span>
                          <div className="asset-map-overlay-slider-row">
                            <input
                              type="range"
                              min="20"
                              max="100"
                              step="1"
                              className="asset-map-overlay-slider"
                              aria-label={`${option.label} overlay opacity`}
                              value={Math.round(overlayOpacity * 100)}
                              disabled={!isSelected}
                              onChange={(event) =>
                                handleWeatherOverlayOpacityChange(
                                  option.value,
                                  Number.parseInt(event.target.value, 10) / 100,
                                )
                              }
                            />
                            <span className="asset-map-overlay-slider-value">
                              {Math.round(overlayOpacity * 100)}%
                            </span>
                          </div>
                        </label>

                        <p className="asset-map-weather-overlay-description">
                          {describeWeatherOverlayMode(option.value)}
                          {option.value !== "radar"
                            ? " Built from the active tracked weather locations visible on the map."
                            : ""}
                        </p>

                        {overlayLegend ? (
                          <div className="asset-map-weather-overlay-legend">
                            <div className="asset-map-weather-overlay-legend-copy">
                              <strong>{overlayLegend.summaryLabel}</strong>
                              <span>
                                {option.value === "wind"
                                  ? "Vector direction follows the latest observed or forecast flow."
                                  : "Colors summarize the most recent tracked values available for each visible weather location."}
                              </span>
                            </div>
                            <div
                              className="asset-map-weather-overlay-legend-bar"
                              aria-hidden="true"
                              style={{
                                background: overlayLegend.gradient,
                              }}
                            />
                            <div className="asset-map-weather-overlay-legend-range">
                              <span>{overlayLegend.minLabel}</span>
                              <span>{overlayLegend.maxLabel}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {weatherOverlayError ? (
                <p
                  className="asset-map-weather-overlay-feedback"
                  aria-live="polite"
                >
                  {weatherOverlayError}
                </p>
              ) : hasVisibleDataBackedWeatherOverlay ? (
                <p className="asset-map-weather-overlay-description">
                  Tracked Wx markers hide while point overlays are active. Click
                  the weather graphic on the map to open the location preview.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {showAssets ? (
          <div
            className="asset-map-subtype-controls"
            aria-label="Activity visibility controls"
          >
            <span className="asset-map-subtype-controls-label">Activity</span>
            {ASSET_MAP_ACTIVITY_LABELS.map((activityLabel) => (
              <label key={activityLabel} className="asset-map-subtype-toggle">
                <input
                  type="checkbox"
                  checked={isAssetActivityVisible(
                    assetActivityVisibility,
                    activityLabel,
                  )}
                  onChange={() => onToggleAssetActivity(activityLabel)}
                />
                <span>{activityLabel}</span>
              </label>
            ))}
          </div>
        ) : null}

        {showAssets || showWeather ? (
          <div
            className="asset-map-subtype-controls"
            aria-label="Geography visibility controls"
          >
            <span className="asset-map-subtype-controls-label">Geography</span>
            <button
              type="button"
              className="asset-map-subtype-bulk-toggle"
              onClick={() =>
                onSetAllAssetGeographiesVisible(!allAssetGeographiesVisible)
              }
            >
              {allAssetGeographiesVisible ? "Uncheck all" : "Check all"}
            </button>
            {ASSET_MAP_GEOGRAPHY_LABELS.map((geographyLabel) => (
              <label key={geographyLabel} className="asset-map-subtype-toggle">
                <input
                  type="checkbox"
                  checked={isAssetGeographyVisible(
                    assetGeographyVisibility,
                    geographyLabel,
                  )}
                  onChange={() => onToggleAssetGeography(geographyLabel)}
                />
                <span>{geographyLabel}</span>
              </label>
            ))}
            <div className="asset-map-inline-filter-fields">
              <AssetMapSearchableSelect
                label="Country"
                placeholder="All countries"
                searchSuggestionsId={countrySuggestionListId}
                value={selectedCountryCode}
                onSelectValue={onSelectCountry}
                options={countryOptions}
                disabled={countryOptions.length === 0}
              />
              <AssetMapSearchableSelect
                label="State or Territory"
                placeholder="All states or territories"
                searchSuggestionsId={subdivisionSuggestionListId}
                value={selectedSubdivisionCode}
                onSelectValue={onSelectSubdivision}
                options={subdivisionOptions}
                disabled={subdivisionOptions.length === 0}
              />
            </div>
          </div>
        ) : null}

        {showAssets ? (
          <div
            className="asset-map-subtype-controls"
            aria-label="Asset type visibility controls"
          >
            <span className="asset-map-subtype-controls-label">
              Asset Types
            </span>
            {assetSubtypeOptions.length > 0 ? (
              <>
                <button
                  type="button"
                  className="asset-map-subtype-bulk-toggle"
                  onClick={() =>
                    onSetAllAssetSubtypesVisible(!allAssetSubtypesVisible)
                  }
                >
                  {allAssetSubtypesVisible ? "Uncheck all" : "Check all"}
                </button>
                {assetSubtypeOptions.map((assetSubtype) => (
                  <label
                    key={assetSubtype}
                    className="asset-map-subtype-toggle"
                  >
                    <input
                      type="checkbox"
                      checked={isAssetSubtypeVisible(
                        assetSubtypeVisibility,
                        assetSubtype,
                      )}
                      onChange={() => onToggleAssetSubtype(assetSubtype)}
                    />
                    <span>{assetSubtype}</span>
                  </label>
                ))}
              </>
            ) : (
              <span className="asset-map-subtype-empty">
                No asset types loaded
              </span>
            )}
          </div>
        ) : null}

        <div className="asset-map-filters-save-row">
          <label className="asset-map-filters-save-field">
            <span className="asset-map-inline-select-label">Save As</span>
            <input
              type="text"
              className="control control-compact"
              aria-label="Save map filters as"
              placeholder="Filter preset name"
              value={presetNameInput}
              onChange={(event) => {
                setPresetNameInput(event.target.value);
                if (presetSaveFeedback) {
                  setPresetSaveFeedback("");
                }
              }}
            />
          </label>
          <button
            type="button"
            className="button button-secondary asset-map-filters-save-button"
            disabled={!presetNameInput.trim()}
            onClick={handleSaveFilterPreset}
          >
            Save
          </button>
          <label className="asset-map-filters-save-field asset-map-filters-preset-field">
            <span className="asset-map-inline-select-label">Presets</span>
            <select
              className="control control-compact"
              aria-label="Saved map filter presets"
              value={selectedFilterPresetName}
              disabled={savedFilterPresets.length === 0}
              onChange={(event) => handleSelectFilterPreset(event.target.value)}
            >
              <option value="">
                {savedFilterPresets.length === 0
                  ? "No saved presets"
                  : "Saved presets"}
              </option>
              {savedFilterPresets.map((preset) => (
                <option key={preset.name.toLowerCase()} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          {presetSaveFeedback ? (
            <p className="asset-map-filters-save-feedback" aria-live="polite">
              {presetSaveFeedback}
            </p>
          ) : null}
        </div>
      </AssetMapFiltersCard>

      <div
        ref={mapFrameRef}
        className={`asset-map-canvas-frame ${mapCanvasResizing ? "is-resizing" : ""}`.trim()}
        style={mapCanvasStyle}
      >
        <div
          ref={containerRef}
          className="asset-map-canvas"
          style={mapCanvasStyle}
        />

        {showWeather && selectedWeatherLocation ? (
          <div className="asset-map-weather-preview">
            <div className="asset-map-weather-preview-head">
              <div>
                <strong>{selectedWeatherLocation.code}</strong>
                <p>{selectedWeatherLocation.name}</p>
              </div>
              <button
                type="button"
                className="asset-map-weather-preview-close"
                aria-label={`Close weather preview for ${selectedWeatherLocation.code}`}
                onClick={() => setSelectedWeatherLocationCode(null)}
              >
                ×
              </button>
            </div>

            <div className="asset-map-weather-preview-meta">
              <span
                className={`status-pill status-pill-${weatherHealthTone(selectedWeatherStatus?.health_status ?? "unknown")}`}
              >
                {weatherHealthLabel(
                  selectedWeatherStatus?.health_status ?? "unknown",
                )}
              </span>
              {selectedWeatherStatus ? (
                <>
                  <span className="entity-chip entity-chip-soft">
                    Forecast{" "}
                    {formatWeatherAgeHours(
                      selectedWeatherStatus.forecast_age_hours,
                    )}
                  </span>
                  <span className="entity-chip entity-chip-soft">
                    Observation{" "}
                    {formatWeatherAgeHours(
                      selectedWeatherStatus.observation_age_hours,
                    )}
                  </span>
                </>
              ) : null}
            </div>

            {weatherPreviewError ? <p>Weather Error</p> : null}
            {!weatherPreviewError && weatherPreviewLoading ? (
              <p>Loading weather preview...</p>
            ) : null}
            {!weatherPreviewError && !weatherPreviewLoading ? (
              <>
                <p>
                  <strong>Latest obs:</strong>{" "}
                  {weatherObservations[0]
                    ? summarizeWeatherObservation(weatherObservations[0])
                    : "No recent observations are stored for this location yet."}
                </p>
                <p>
                  <strong>Next forecast:</strong>{" "}
                  {weatherForecasts[0]
                    ? `${formatWeatherPeriodWindow(weatherForecasts[0].start_at, weatherForecasts[0].end_at)} · ${summarizeWeatherForecast(weatherForecasts[0])}`
                    : "No current forecast periods are stored for this location yet."}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
        {showUserLocation && geolocationError ? (
          <div className="asset-map-control-feedback">My Location Error</div>
        ) : null}
        {loadError ? <div className="asset-map-overlay">Map Error</div> : null}
        {!loadError && statusTitle ? (
          <div className="asset-map-overlay asset-map-overlay-info">
            <strong>{statusTitle}</strong>
            {statusDetail ? <p>{statusDetail}</p> : null}
          </div>
        ) : null}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label="Resize map height"
          className="asset-map-canvas-resize-handle"
          onPointerDown={handleMapResizeHandlePointerDown}
          onKeyDown={handleMapResizeHandleKeyDown}
        >
          <span
            className="asset-map-canvas-resize-grip"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

export function AssetMapPanel({
  assets,
  locations,
  railRoutes,
  spatialFeatures,
  weatherLocations,
  weatherSyncStatus,
  weatherDataLoaded = false,
  weatherDataLoading = false,
  weatherLoadError = "",
  selectedAssetCode,
  selectedRailRouteCode = null,
  onSelectAsset,
  onSelectRailRoute = () => undefined,
  onOpenRailRouteDeliveries = () => undefined,
  onOpenRailRouteScheduling = () => undefined,
  onOpenReferenceRailRoute = () => undefined,
  onClearRailRouteSelection = () => undefined,
  filterControls,
}: AssetMapPanelProps) {
  const mapSummary = useMemo(
    () => buildAssetMapSummary(assets, locations),
    [assets, locations],
  );
  const locationByCode = useMemo(
    () =>
      new Map(locations.map((location) => [location.code, location] as const)),
    [locations],
  );
  const [assetActivityVisibility, setAssetActivityVisibility] = useState<
    Record<string, boolean>
  >({});
  const [assetGeographyVisibility, setAssetGeographyVisibility] = useState<
    Record<string, boolean>
  >({});
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [selectedSubdivisionCode, setSelectedSubdivisionCode] = useState("");
  const [assetSubtypeVisibility, setAssetSubtypeVisibility] = useState<
    Record<string, boolean>
  >({});
  const [showAssetLayer, setShowAssetLayer] = useState(true);
  const [showRailRouteLayer, setShowRailRouteLayer] = useState(true);
  const assetSubtypeOptions = useMemo(
    () => sortedUniqueAssetSubtypes(mapSummary.records),
    [mapSummary.records],
  );
  const normalizedAssetActivityVisibility = useMemo(
    () => syncAssetActivityVisibilityState(assetActivityVisibility),
    [assetActivityVisibility],
  );
  const normalizedAssetGeographyVisibility = useMemo(
    () => syncAssetGeographyVisibilityState(assetGeographyVisibility),
    [assetGeographyVisibility],
  );
  const normalizedAssetSubtypeVisibility = useMemo(
    () =>
      syncAssetSubtypeVisibilityState(
        assetSubtypeOptions,
        assetSubtypeVisibility,
      ),
    [assetSubtypeOptions, assetSubtypeVisibility],
  );
  const geographyVisibleRecordCandidates = useMemo(
    () =>
      mapSummary.records.filter((record) =>
        assetRecordMatchesVisibleGeography(
          normalizedAssetGeographyVisibility,
          record,
        ),
      ),
    [mapSummary.records, normalizedAssetGeographyVisibility],
  );
  const geographyVisibleMappedRecords = useMemo(
    () =>
      mapSummary.mappedRecords.filter((record) =>
        assetRecordMatchesVisibleGeography(
          normalizedAssetGeographyVisibility,
          record,
        ),
      ),
    [mapSummary.mappedRecords, normalizedAssetGeographyVisibility],
  );
  const geographyVisibleWeatherLocations = useMemo(
    () =>
      weatherLocations.filter((location) =>
        weatherLocationMatchesVisibleGeography(
          normalizedAssetGeographyVisibility,
          location,
        ),
      ),
    [normalizedAssetGeographyVisibility, weatherLocations],
  );
  const countryOptions = useMemo(
    () =>
      buildAssetMapCountryOptions({
        records: geographyVisibleRecordCandidates,
        weatherLocations: geographyVisibleWeatherLocations,
        locationByCode,
      }),
    [
      geographyVisibleRecordCandidates,
      geographyVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const effectiveSelectedCountryCode = useMemo(
    () =>
      countryOptions.some(
        (countryOption) => countryOption.code === selectedCountryCode,
      )
        ? selectedCountryCode
        : "",
    [countryOptions, selectedCountryCode],
  );
  const countryVisibleRecordCandidates = useMemo(
    () =>
      geographyVisibleRecordCandidates.filter((record) =>
        assetRecordMatchesSelectedCountry(effectiveSelectedCountryCode, record),
      ),
    [effectiveSelectedCountryCode, geographyVisibleRecordCandidates],
  );
  const countryVisibleMappedRecords = useMemo(
    () =>
      geographyVisibleMappedRecords.filter((record) =>
        assetRecordMatchesSelectedCountry(effectiveSelectedCountryCode, record),
      ),
    [effectiveSelectedCountryCode, geographyVisibleMappedRecords],
  );
  const countryVisibleWeatherLocations = useMemo(
    () =>
      geographyVisibleWeatherLocations.filter((location) =>
        weatherLocationMatchesSelectedCountry(
          effectiveSelectedCountryCode,
          location,
          locationByCode,
        ),
      ),
    [
      effectiveSelectedCountryCode,
      geographyVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const subdivisionOptions = useMemo(
    () =>
      buildAssetMapSubdivisionOptions({
        records: countryVisibleRecordCandidates,
        weatherLocations: countryVisibleWeatherLocations,
        locationByCode,
      }),
    [
      countryVisibleRecordCandidates,
      countryVisibleWeatherLocations,
      locationByCode,
    ],
  );
  const effectiveSelectedSubdivisionCode = useMemo(
    () =>
      subdivisionOptions.some(
        (subdivisionOption) =>
          subdivisionOption.code === selectedSubdivisionCode,
      )
        ? selectedSubdivisionCode
        : "",
    [selectedSubdivisionCode, subdivisionOptions],
  );
  const subdivisionVisibleRecordCandidates = useMemo(
    () =>
      countryVisibleRecordCandidates.filter((record) =>
        assetRecordMatchesSelectedSubdivision(
          effectiveSelectedSubdivisionCode,
          record,
        ),
      ),
    [countryVisibleRecordCandidates, effectiveSelectedSubdivisionCode],
  );
  const subdivisionVisibleMappedRecords = useMemo(
    () =>
      countryVisibleMappedRecords.filter((record) =>
        assetRecordMatchesSelectedSubdivision(
          effectiveSelectedSubdivisionCode,
          record,
        ),
      ),
    [countryVisibleMappedRecords, effectiveSelectedSubdivisionCode],
  );
  const activityVisibleRecordCandidates = useMemo(
    () =>
      subdivisionVisibleRecordCandidates.filter((record) =>
        assetRecordMatchesVisibleActivity(
          normalizedAssetActivityVisibility,
          record,
        ),
      ),
    [normalizedAssetActivityVisibility, subdivisionVisibleRecordCandidates],
  );
  const activityVisibleMappedRecords = useMemo(
    () =>
      subdivisionVisibleMappedRecords.filter((record) =>
        assetRecordMatchesVisibleActivity(
          normalizedAssetActivityVisibility,
          record,
        ),
      ),
    [normalizedAssetActivityVisibility, subdivisionVisibleMappedRecords],
  );
  const visibleRecordCandidates = useMemo(
    () =>
      activityVisibleRecordCandidates.filter((record) =>
        isAssetSubtypeVisible(
          normalizedAssetSubtypeVisibility,
          assetMapSubtypeLabelForAsset(record.asset),
        ),
      ),
    [activityVisibleRecordCandidates, normalizedAssetSubtypeVisibility],
  );
  const visibleMappedRecords = useMemo(
    () =>
      activityVisibleMappedRecords.filter((record) =>
        isAssetSubtypeVisible(
          normalizedAssetSubtypeVisibility,
          assetMapSubtypeLabelForAsset(record.asset),
        ),
      ),
    [activityVisibleMappedRecords, normalizedAssetSubtypeVisibility],
  );
  const displayedMappedRecords = useMemo(
    () => (showAssetLayer ? visibleMappedRecords : []),
    [showAssetLayer, visibleMappedRecords],
  );
  const selectedRecord =
    displayedMappedRecords.find(
      (record) => record.asset.code === selectedAssetCode,
    ) ?? null;
  const selectedAssetRecord = useMemo(
    () =>
      mapSummary.records.find(
        (record) => record.asset.code === selectedAssetCode,
      ) ?? null,
    [mapSummary.records, selectedAssetCode],
  );
  const selectedAsset = selectedAssetRecord?.asset ?? null;
  const selectedRailRoute = useMemo(
    () =>
      railRoutes.find((route) => route.code === selectedRailRouteCode) ?? null,
    [railRoutes, selectedRailRouteCode],
  );
  const selectedAssetHiddenByGeography = selectedAssetRecord
    ? !assetRecordMatchesVisibleGeography(
        normalizedAssetGeographyVisibility,
        selectedAssetRecord,
      )
    : false;
  const selectedAssetHiddenByCountry = selectedAssetRecord
    ? !assetRecordMatchesSelectedCountry(
        effectiveSelectedCountryCode,
        selectedAssetRecord,
      )
    : false;
  const selectedAssetHiddenBySubdivision = selectedAssetRecord
    ? !assetRecordMatchesSelectedSubdivision(
        effectiveSelectedSubdivisionCode,
        selectedAssetRecord,
      )
    : false;
  const selectedAssetHiddenByActivity = selectedAssetRecord
    ? !assetRecordMatchesVisibleActivity(
        normalizedAssetActivityVisibility,
        selectedAssetRecord,
      )
    : false;
  const selectedAssetHiddenBySubtype = selectedAssetRecord
    ? !isAssetSubtypeVisible(
        normalizedAssetSubtypeVisibility,
        assetMapSubtypeLabelForAsset(selectedAssetRecord.asset),
      )
    : false;
  const selectedAssetHiddenFilters = [
    selectedAssetHiddenByGeography ? "geography" : null,
    selectedAssetHiddenByCountry ? "country" : null,
    selectedAssetHiddenBySubdivision ? "state or territory" : null,
    selectedAssetHiddenByActivity ? "activity" : null,
    selectedAssetHiddenBySubtype ? "asset type" : null,
  ].filter((value): value is string => value !== null);
  const activeSpatialFeatures = useMemo(
    () => spatialFeatures.filter((feature) => feature.is_active),
    [spatialFeatures],
  );
  const activeRailRouteSpatialFeatures = useMemo(
    () =>
      activeSpatialFeatures.filter((feature) =>
        isRailRouteSpatialFeature(feature),
      ),
    [activeSpatialFeatures],
  );
  const selectedRailRouteSpatialFeatures = useMemo(
    () =>
      activeRailRouteSpatialFeatures.filter(
        (feature) => feature.entity_code === selectedRailRouteCode,
      ),
    [activeRailRouteSpatialFeatures, selectedRailRouteCode],
  );
  const activeSharedSpatialFeatures = useMemo(
    () =>
      activeSpatialFeatures.filter(
        (feature) => !isRailRouteSpatialFeature(feature),
      ),
    [activeSpatialFeatures],
  );
  const visibleWeatherLocations = useMemo(
    () =>
      countryVisibleWeatherLocations.filter((location) =>
        weatherLocationMatchesSelectedSubdivision(
          effectiveSelectedSubdivisionCode,
          location,
          locationByCode,
        ),
      ),
    [
      countryVisibleWeatherLocations,
      effectiveSelectedSubdivisionCode,
      locationByCode,
    ],
  );
  const activeWeatherLocations = useMemo(
    () => visibleWeatherLocations.filter((location) => location.is_active),
    [visibleWeatherLocations],
  );
  const visiblePlacementCounts = useMemo(
    () => buildVisiblePlacementCounts(displayedMappedRecords),
    [displayedMappedRecords],
  );
  const geographyHiddenCount = Math.max(
    0,
    mapSummary.records.length - geographyVisibleRecordCandidates.length,
  );
  const countryHiddenCount = Math.max(
    0,
    geographyVisibleRecordCandidates.length -
      countryVisibleRecordCandidates.length,
  );
  const subdivisionHiddenCount = Math.max(
    0,
    countryVisibleRecordCandidates.length -
      subdivisionVisibleRecordCandidates.length,
  );
  const activityHiddenCount = Math.max(
    0,
    subdivisionVisibleRecordCandidates.length -
      activityVisibleRecordCandidates.length,
  );
  const subtypeHiddenCount = Math.max(
    0,
    activityVisibleRecordCandidates.length - visibleRecordCandidates.length,
  );
  const unmappedVisibleCount = Math.max(
    0,
    visibleRecordCandidates.length - visibleMappedRecords.length,
  );
  const selectionHiddenCount =
    geographyHiddenCount +
    countryHiddenCount +
    subdivisionHiddenCount +
    activityHiddenCount +
    subtypeHiddenCount;
  const hiddenAssetCount = selectionHiddenCount + unmappedVisibleCount;
  const selectedRailRouteOverlayHiddenByLayer =
    selectedRailRouteCode !== null && !showRailRouteLayer;
  const mapStatusTitle =
    visibleMappedRecords.length === 0
      ? geographyVisibleRecordCandidates.length === 0
        ? "No selected geographies are visible right now."
        : countryVisibleRecordCandidates.length === 0 &&
            effectiveSelectedCountryCode
          ? `No assets are visible for ${formatAssetMapCountryLabel(effectiveSelectedCountryCode)} right now.`
          : subdivisionVisibleRecordCandidates.length === 0 &&
              effectiveSelectedSubdivisionCode
            ? `No assets are visible for ${effectiveSelectedSubdivisionCode} right now.`
            : activityVisibleRecordCandidates.length === 0
              ? "No selected activities are visible right now."
              : visibleRecordCandidates.length === 0 &&
                  assetSubtypeOptions.length > 0
                ? "No selected asset types are visible right now."
                : "No filtered assets are map-ready yet."
      : null;
  const mapStatusDetail =
    visibleMappedRecords.length === 0
      ? geographyVisibleRecordCandidates.length === 0
        ? "Turn at least one geography back on to restore plotted assets."
        : countryVisibleRecordCandidates.length === 0 &&
            effectiveSelectedCountryCode
          ? "Choose All countries or a different country to restore plotted assets."
        : subdivisionVisibleRecordCandidates.length === 0 &&
              effectiveSelectedSubdivisionCode
            ? "Choose All states or territories or a different subdivision to restore plotted assets."
            : activityVisibleRecordCandidates.length === 0
              ? "Turn at least one activity back on to restore plotted assets."
              : visibleRecordCandidates.length === 0 &&
                  assetSubtypeOptions.length > 0
                ? "Turn at least one asset type back on to restore plotted assets."
                : "The base map is still available for zoom, pan, and rotate. Assets only plot once they have GeoJSON, direct coordinates, or linked location coordinates."
      : null;

  function handleToggleAssetActivity(activityLabel: string) {
    setAssetActivityVisibility((currentState) => {
      const nextState = syncAssetActivityVisibilityState(currentState);
      return {
        ...nextState,
        [activityLabel]: nextState[activityLabel] === false,
      };
    });
  }

  function handleToggleAssetSubtype(assetSubtype: string) {
    setAssetSubtypeVisibility((currentState) => ({
      ...currentState,
      [assetSubtype]: !isAssetSubtypeVisible(currentState, assetSubtype),
    }));
  }

  function handleToggleAssetGeography(geographyLabel: string) {
    setAssetGeographyVisibility((currentState) => {
      const nextState = syncAssetGeographyVisibilityState(currentState);
      return {
        ...nextState,
        [geographyLabel]: nextState[geographyLabel] === false,
      };
    });
  }

  function handleSetAllAssetGeographiesVisible(visible: boolean) {
    setAssetGeographyVisibility(setAllAssetGeographyVisibilityState(visible));
  }

  function handleSelectCountry(countryCode: string) {
    setSelectedCountryCode(countryCode);
    setSelectedSubdivisionCode("");
  }

  function handleSelectSubdivision(subdivisionCode: string) {
    setSelectedSubdivisionCode(subdivisionCode);
  }

  function handleSetAllAssetSubtypesVisible(visible: boolean) {
    setAssetSubtypeVisibility(
      setAllAssetSubtypeVisibilityState(assetSubtypeOptions, visible),
    );
  }

  return (
    <section className="asset-map-shell">
      <div className="asset-map-head">
        <div>
          <span className="eyebrow">Map</span>
          <h4>Asset Footprint</h4>
          <p>
            The map prefers asset GeoJSON, then direct asset coordinates, then
            the linked location coordinates, and now overlays governed spatial
            features like routes, regions, and rail corridors for shared
            context. Only map-ready assets are included here.
          </p>
        </div>
        <div className="asset-map-stats" aria-label="Asset map coverage">
          <span className="entity-chip entity-chip-soft">
            {displayedMappedRecords.length} plotted
          </span>
          <span className="entity-chip entity-chip-soft">
            {visiblePlacementCounts.assetGeometryCount} geometry
          </span>
          <span className="entity-chip entity-chip-soft">
            {visiblePlacementCounts.assetPointCount} asset points
          </span>
          <span className="entity-chip entity-chip-soft">
            {visiblePlacementCounts.linkedLocationCount} linked locations
          </span>
          <span className="entity-chip entity-chip-soft">
            {activeSharedSpatialFeatures.length} shared overlays
          </span>
          <span className="entity-chip entity-chip-soft">
            {activeRailRouteSpatialFeatures.length} rail overlays
          </span>
          {activeWeatherLocations.length > 0 ? (
            <span className="entity-chip entity-chip-soft">
              {activeWeatherLocations.length} weather points
            </span>
          ) : null}
          <span className="entity-chip entity-chip-soft">
            {hiddenAssetCount} hidden
          </span>
        </div>
      </div>

      {filterControls ? (
        <div className="asset-map-filter-strip">{filterControls}</div>
      ) : null}

      <AssetMapCanvas
        records={visibleMappedRecords}
        spatialFeatures={activeSharedSpatialFeatures}
        railRouteSpatialFeatures={activeRailRouteSpatialFeatures}
        weatherLocations={visibleWeatherLocations}
        weatherSyncStatus={weatherSyncStatus}
        showAssets={showAssetLayer}
        showRailRoutes={showRailRouteLayer}
        filterCardStateKey="map-workspace.map-filters-card"
        assetActivityVisibility={normalizedAssetActivityVisibility}
        assetGeographyVisibility={normalizedAssetGeographyVisibility}
        countryOptions={countryOptions}
        selectedCountryCode={effectiveSelectedCountryCode}
        subdivisionOptions={subdivisionOptions}
        selectedSubdivisionCode={effectiveSelectedSubdivisionCode}
        assetSubtypeOptions={assetSubtypeOptions}
        assetSubtypeVisibility={normalizedAssetSubtypeVisibility}
        weatherDataLoaded={weatherDataLoaded}
        weatherDataLoading={weatherDataLoading}
        weatherLoadError={weatherLoadError}
        onShowAssetsChange={setShowAssetLayer}
        onShowRailRoutesChange={setShowRailRouteLayer}
        onToggleAssetActivity={handleToggleAssetActivity}
        onToggleAssetGeography={handleToggleAssetGeography}
        onSelectCountry={handleSelectCountry}
        onSelectSubdivision={handleSelectSubdivision}
        onSetAllAssetGeographiesVisible={handleSetAllAssetGeographiesVisible}
        onToggleAssetSubtype={handleToggleAssetSubtype}
        onSetAllAssetSubtypesVisible={handleSetAllAssetSubtypesVisible}
        selectedAssetCode={selectedAssetCode}
        selectedRailRouteCode={selectedRailRouteCode}
        onSelectAsset={onSelectAsset}
        onSelectRailRoute={onSelectRailRoute}
        statusTitle={mapStatusTitle}
        statusDetail={mapStatusDetail}
      />

      <AssetMapRecordsCard
        records={displayedMappedRecords}
        selectedAssetCode={selectedAssetCode}
        onSelectAsset={onSelectAsset}
        collapsibleStateKey="map-workspace.map-records-card"
      />

      <div className="asset-map-summary-grid">
        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Selected Asset</strong>
            <span className="entity-chip entity-chip-soft">
              {selectedRecord?.asset.code ?? "No selection"}
            </span>
          </div>
          {selectedRecord ? (
            <>
              <p>
                {selectedRecord.asset.name} · {selectedRecord.asset.asset_class}{" "}
                · {selectedRecord.asset.asset_type}
              </p>
              <p>{formatAssetMapSource(selectedRecord)}</p>
              <p>{formatAssetMapPlacement(selectedRecord)}</p>
            </>
          ) : selectedAssetRecord && selectedAssetHiddenFilters.length > 0 ? (
            <p>
              {selectedAssetRecord.asset.code} is hidden by the current{" "}
              {formatAssetMapFilterList(selectedAssetHiddenFilters)} filter
              {selectedAssetHiddenFilters.length === 1 ? "" : "s"}.{" "}
              {selectedAssetHiddenByGeography
                ? `Re-enable ${assetMapGeographyLabelForRecord(selectedAssetRecord) ?? "the asset geography"} to plot it again.`
                : selectedAssetHiddenByCountry
                  ? `Choose All countries or re-select ${formatAssetMapCountryLabel(assetMapCountryCodeForRecord(selectedAssetRecord) ?? effectiveSelectedCountryCode)} to plot it again.`
                  : selectedAssetHiddenBySubdivision
                    ? `Choose All states or territories or re-select ${assetMapSubdivisionCodeForRecord(selectedAssetRecord) ?? effectiveSelectedSubdivisionCode} to plot it again.`
                    : selectedAssetHiddenByActivity
                      ? `Re-enable at least one of ${formatAssetMapFilterList(assetMapActivityLabelsForAsset(selectedAssetRecord.asset))} to plot it again.`
                      : `Re-enable ${assetMapSubtypeLabelForAsset(selectedAssetRecord.asset)} to plot it again.`}
            </p>
          ) : selectedAsset ? (
            <p>
              {selectedAsset.code} is not map-ready yet. Only assets with
              GeoJSON, direct coordinates, or linked location coordinates are
              eligible for the map.
            </p>
          ) : (
            <p>
              Pan freely, or select a plotted asset from the map or directory to
              inspect its placement.
            </p>
          )}
        </div>

        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Selected Rail Route</strong>
            <span className="entity-chip entity-chip-soft">
              {selectedRailRoute?.code ?? "No selection"}
            </span>
          </div>
          {selectedRailRoute ? (
            <>
              <p>
                {selectedRailRoute.name} · {selectedRailRoute.rail_line_code} ·{" "}
                {selectedRailRoute.route_direction}
              </p>
              <p>
                {formatReferenceLocationLabel(
                  selectedRailRoute.origin_location_code,
                  locationByCode,
                )}{" "}
                to{" "}
                {formatReferenceLocationLabel(
                  selectedRailRoute.destination_location_code,
                  locationByCode,
                )}
              </p>
              <p>{formatRailRouteServiceClock(selectedRailRoute)}</p>
              <p>{formatRailRouteFreeTime(selectedRailRoute)}</p>
              {selectedRailRouteOverlayHiddenByLayer ? (
                <p>
                  The Rail Routes layer is currently hidden. Turn that layer
                  back on to re-plot this corridor on the map.
                </p>
              ) : selectedRailRouteSpatialFeatures.length === 0 ? (
                <p>
                  No active rail overlay is linked to this route yet. Add or
                  reactivate a `RAIL_ROUTE` spatial feature to plot it.
                </p>
              ) : null}
              <div className="toolbar">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => onOpenRailRouteDeliveries(selectedRailRoute.code)}
                >
                  Open Deliveries
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => onOpenRailRouteScheduling(selectedRailRoute.code)}
                >
                  Open Scheduling
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => onOpenReferenceRailRoute(selectedRailRoute.code)}
                >
                  Open Route Record
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={onClearRailRouteSelection}
                >
                  Clear Route Focus
                </button>
              </div>
            </>
          ) : (
            <p>
              Select a plotted rail corridor from the map to inspect its lane
              context, then jump into deliveries, scheduling, or route
              maintenance from the same focus point.
            </p>
          )}
        </div>

        <div className="reference-usage-card asset-map-card">
          <div className="reference-usage-head">
            <strong>Map Scope</strong>
            <span className="entity-chip entity-chip-soft">
              {hiddenAssetCount}
            </span>
          </div>
          {selectionHiddenCount > 0 && unmappedVisibleCount > 0 ? (
            <p>
              {selectionHiddenCount} filtered asset
              {selectionHiddenCount === 1 ? "" : "s"} are hidden by the current
              geography, country, state or territory, or asset type filters, and{" "}
              {unmappedVisibleCount} visible match
              {unmappedVisibleCount === 1 ? "" : "es"} still need GeoJSON,
              direct coordinates, or linked location coordinates.
            </p>
          ) : geographyHiddenCount > 0 ? (
            <p>
              {geographyHiddenCount} filtered asset
              {geographyHiddenCount === 1 ? "" : "s"} are hidden by the current
              geography filters.
            </p>
          ) : countryHiddenCount > 0 ? (
            <p>
              {countryHiddenCount} filtered asset
              {countryHiddenCount === 1 ? "" : "s"} are hidden by the current
              country filter.
            </p>
          ) : subdivisionHiddenCount > 0 ? (
            <p>
              {subdivisionHiddenCount} filtered asset
              {subdivisionHiddenCount === 1 ? "" : "s"} are hidden by the
              current state or territory filter.
            </p>
          ) : subtypeHiddenCount > 0 ? (
            <p>
              {subtypeHiddenCount} filtered asset
              {subtypeHiddenCount === 1 ? "" : "s"} are hidden by the current
              asset type filters.
            </p>
          ) : unmappedVisibleCount > 0 ? (
            <p>
              {unmappedVisibleCount} filtered asset
              {unmappedVisibleCount === 1 ? "" : "s"} are currently hidden from
              the map until they gain GeoJSON, direct coordinates, or linked
              location coordinates.
            </p>
          ) : (
            <p>
              All visible filtered assets currently meet the map-ready rules.
            </p>
          )}
        </div>
      </div>

      {visibleMappedRecords.length > 0 ? (
        <p className="form-note asset-map-footnote">
          Example plotted asset:{" "}
          {formatAssetMapLocation(visibleMappedRecords[0])}. Shared overlays
          stay visible for corridors, routes, and regions.
        </p>
      ) : null}
    </section>
  );
}
