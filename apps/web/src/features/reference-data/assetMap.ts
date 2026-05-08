import type {
  AssetRecord,
  LocationRecord,
  SpatialFeatureRecord,
  WeatherLocationRecord,
} from "../../shared/models";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";

type AssetGeometrySource = "ASSET_GEOMETRY" | "ASSET_POINT" | "LINKED_LOCATION";

type AssetGeoJsonProperties = GeoJsonProperties & {
  assetCode?: string;
  assetName?: string;
  featureCode?: string;
  featureName?: string;
  featureKind?: string;
  entityType?: string | null;
  entityCode?: string | null;
};

type GeoJsonFeature = Feature<Geometry, AssetGeoJsonProperties>;
type GeoJsonFeatureCollection = FeatureCollection<
  Geometry,
  AssetGeoJsonProperties
>;

export type AssetMapPlacementStatus =
  | "asset_geometry"
  | "asset_coordinates"
  | "linked_location"
  | "missing_coordinates"
  | "missing_location";

export type AssetMapRecord = {
  asset: AssetRecord;
  location: LocationRecord | null;
  latitude: number | null;
  longitude: number | null;
  geometryFeatures: GeoJsonFeature[];
  extentCoordinates: Array<[number, number]>;
  placementStatus: AssetMapPlacementStatus;
};

export type AssetMapSummary = {
  records: AssetMapRecord[];
  mappedRecords: AssetMapRecord[];
  unmappedRecords: AssetMapRecord[];
  mappedCount: number;
  assetGeometryCount: number;
  assetPointCount: number;
  linkedLocationCount: number;
  missingCoordinatesCount: number;
  missingLocationCount: number;
  inactiveCount: number;
};

export const ASSET_MAP_SUBTYPE_LABELS = [
  "Upstream Oil & Gas",
  "Pipeline",
  "Refinery",
  "NG Processing",
  "Petrochem",
  "Storage",
  "Power Generation",
  "Other",
] as const;

export type AssetMapSubtypeLabel = (typeof ASSET_MAP_SUBTYPE_LABELS)[number];

export const ASSET_MAP_ACTIVITY_LABELS = [
  "Positions",
  "Shipments",
  "Inventory",
] as const;

export type AssetMapActivityLabel = (typeof ASSET_MAP_ACTIVITY_LABELS)[number];

export const ASSET_MAP_GEOGRAPHY_LABELS = [
  "North America",
  "South America",
  "EMEA",
  "APAC",
] as const;

export type AssetMapGeographyLabel =
  (typeof ASSET_MAP_GEOGRAPHY_LABELS)[number];

export type AssetMapCountryOption = {
  code: string;
  label: string;
};

export type AssetMapSubdivisionOption = {
  code: string;
  label: string;
  countryCode: string | null;
};

const MIDDLE_EAST_COUNTRY_CODES = new Set([
  "AE",
  "AM",
  "AZ",
  "BH",
  "CY",
  "GE",
  "IL",
  "IQ",
  "IR",
  "JO",
  "KW",
  "LB",
  "OM",
  "PS",
  "QA",
  "SA",
  "SY",
  "TR",
  "YE",
]);

const NORTH_AMERICA_COUNTRY_CODES = new Set([
  "AG",
  "AI",
  "AW",
  "BB",
  "BL",
  "BM",
  "BQ",
  "BS",
  "BZ",
  "CA",
  "CR",
  "CU",
  "CW",
  "DM",
  "DO",
  "GD",
  "GL",
  "GP",
  "GT",
  "HN",
  "HT",
  "JM",
  "KN",
  "KY",
  "LC",
  "MF",
  "MQ",
  "MS",
  "MX",
  "NI",
  "PA",
  "PM",
  "PR",
  "SV",
  "SX",
  "TC",
  "TT",
  "US",
  "VC",
  "VG",
  "VI",
]);

const SOUTH_AMERICA_COUNTRY_CODES = new Set([
  "AR",
  "BO",
  "BR",
  "CL",
  "CO",
  "EC",
  "FK",
  "GF",
  "GY",
  "PE",
  "PY",
  "SR",
  "UY",
  "VE",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeUppercaseText(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  const countryCode = normalizeUppercaseText(value);
  return countryCode.length > 0 ? countryCode : null;
}

function normalizeSubdivisionCode(
  value: string | null | undefined,
): string | null {
  const subdivisionCode = normalizeUppercaseText(value);
  return subdivisionCode.length > 0 ? subdivisionCode : null;
}

let cachedCountryDisplayNames: Intl.DisplayNames | null | undefined;

function getCountryDisplayNames(): Intl.DisplayNames | null {
  if (cachedCountryDisplayNames !== undefined) {
    return cachedCountryDisplayNames;
  }

  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    cachedCountryDisplayNames = null;
    return cachedCountryDisplayNames;
  }

  try {
    cachedCountryDisplayNames = new Intl.DisplayNames(["en"], {
      type: "region",
    });
  } catch {
    cachedCountryDisplayNames = null;
  }

  return cachedCountryDisplayNames;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeoJsonGeometry(value: unknown): value is Geometry {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
    case "Polygon":
    case "MultiPolygon":
      return "coordinates" in value;
    case "GeometryCollection":
      return (
        Array.isArray(value.geometries) &&
        value.geometries.every((entry) => isGeoJsonGeometry(entry))
      );
    default:
      return false;
  }
}

function hasCoordinates(
  location: LocationRecord | null,
): location is LocationRecord & {
  latitude: number;
  longitude: number;
} {
  return (
    location !== null &&
    isFiniteNumber(location.latitude) &&
    isFiniteNumber(location.longitude)
  );
}

function collectPositions(
  value: unknown,
  positions: Array<[number, number]>,
): void {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  ) {
    positions.push([value[0], value[1]]);
    return;
  }

  value.forEach((entry) => collectPositions(entry, positions));
}

function collectGeometryPositions(
  geometry: Geometry,
  positions: Array<[number, number]>,
): void {
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((entry) =>
      collectGeometryPositions(entry, positions),
    );
    return;
  }

  collectPositions(
    "coordinates" in geometry ? geometry.coordinates : null,
    positions,
  );
}

function toFeatureList(
  geojson: Record<string, unknown> | null | undefined,
  asset: AssetRecord,
): GeoJsonFeature[] {
  if (!geojson || typeof geojson.type !== "string") {
    return [];
  }

  if (geojson.type === "FeatureCollection") {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    return features.flatMap((feature) =>
      isRecord(feature) ? toFeatureList(feature, asset) : [],
    );
  }

  if (geojson.type === "Feature") {
    if (!isGeoJsonGeometry(geojson.geometry)) {
      return [];
    }

    return [
      {
        type: "Feature",
        geometry: geojson.geometry,
        properties: isRecord(geojson.properties)
          ? {
              ...geojson.properties,
              assetCode: asset.code,
              assetName: asset.name,
            }
          : {
              assetCode: asset.code,
              assetName: asset.name,
            },
      },
    ];
  }

  if (!isGeoJsonGeometry(geojson)) {
    return [];
  }

  return [
    {
      type: "Feature",
      geometry: geojson,
      properties: {
        assetCode: asset.code,
        assetName: asset.name,
      },
    },
  ];
}

function toSpatialFeatureList(
  geojson: Record<string, unknown> | null | undefined,
  feature: SpatialFeatureRecord,
): GeoJsonFeature[] {
  if (!geojson || typeof geojson.type !== "string") {
    return [];
  }

  if (geojson.type === "FeatureCollection") {
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    return features.flatMap((entry) =>
      isRecord(entry) ? toSpatialFeatureList(entry, feature) : [],
    );
  }

  if (geojson.type === "Feature") {
    if (!isGeoJsonGeometry(geojson.geometry)) {
      return [];
    }

    return [
      {
        type: "Feature",
        geometry: geojson.geometry,
        properties: isRecord(geojson.properties)
          ? {
              ...geojson.properties,
              featureCode: feature.code,
              featureName: feature.name,
              featureKind: feature.feature_kind,
              entityType: feature.entity_type ?? null,
              entityCode: feature.entity_code ?? null,
            }
          : {
              featureCode: feature.code,
              featureName: feature.name,
              featureKind: feature.feature_kind,
              entityType: feature.entity_type ?? null,
              entityCode: feature.entity_code ?? null,
            },
      },
    ];
  }

  if (!isGeoJsonGeometry(geojson)) {
    return [];
  }

  return [
    {
      type: "Feature",
      geometry: geojson,
      properties: {
        featureCode: feature.code,
        featureName: feature.name,
        featureKind: feature.feature_kind,
        entityType: feature.entity_type ?? null,
        entityCode: feature.entity_code ?? null,
      },
    },
  ];
}

function buildRepresentativeCoordinate(positions: Array<[number, number]>): {
  latitude: number | null;
  longitude: number | null;
} {
  if (positions.length === 0) {
    return { latitude: null, longitude: null };
  }

  let minLongitude = positions[0][0];
  let maxLongitude = positions[0][0];
  let minLatitude = positions[0][1];
  let maxLatitude = positions[0][1];

  positions.forEach(([longitude, latitude]) => {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  });

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
  };
}

function buildMappedRecord(args: {
  asset: AssetRecord;
  location: LocationRecord | null;
  geometryFeatures?: GeoJsonFeature[];
  placementStatus: AssetMapPlacementStatus;
  representativeCoordinate: {
    latitude: number | null;
    longitude: number | null;
  };
  extentCoordinates: Array<[number, number]>;
}): AssetMapRecord {
  return {
    asset: args.asset,
    location: args.location,
    latitude: args.representativeCoordinate.latitude,
    longitude: args.representativeCoordinate.longitude,
    geometryFeatures: args.geometryFeatures ?? [],
    extentCoordinates: args.extentCoordinates,
    placementStatus: args.placementStatus,
  };
}

function placementSource(record: AssetMapRecord): AssetGeometrySource | null {
  switch (record.placementStatus) {
    case "asset_geometry":
      return "ASSET_GEOMETRY";
    case "asset_coordinates":
      return "ASSET_POINT";
    case "linked_location":
      return "LINKED_LOCATION";
    default:
      return null;
  }
}

export function assetMapSubtypeLabelForAsset(
  asset: Pick<AssetRecord, "asset_class" | "asset_type">,
): AssetMapSubtypeLabel {
  const assetClass = asset.asset_class.trim().toUpperCase();
  const assetType = asset.asset_type.trim().toUpperCase();

  switch (assetClass) {
    case "UPSTREAM_PRODUCTION":
      return "Upstream Oil & Gas";
    case "PIPELINE":
      return "Pipeline";
    case "REFINERY":
      return "Refinery";
    case "PROCESSING":
      return assetType === "PETROCHEMICAL" ? "Petrochem" : "NG Processing";
    case "STORAGE":
      return "Storage";
    case "GENERATION":
      return assetType === "STORAGE" ? "Storage" : "Power Generation";
    case "TERMINAL":
      if (assetType === "PIPELINE") {
        return "Pipeline";
      }
      if (assetType === "LNG") {
        return "NG Processing";
      }
      return "Other";
    default:
      return "Other";
  }
}

export function assetMapActivityLabelsForAsset(
  asset: Pick<AssetRecord, "asset_class" | "asset_type">,
): AssetMapActivityLabel[] {
  const assetClass = normalizeUppercaseText(asset.asset_class);
  const assetType = normalizeUppercaseText(asset.asset_type);

  switch (assetClass) {
    case "UPSTREAM_PRODUCTION":
      return ["Positions", "Inventory"];
    case "PIPELINE":
      return ["Positions", "Shipments"];
    case "REFINERY":
      return ["Positions", "Inventory"];
    case "PROCESSING":
      return ["Positions", "Shipments", "Inventory"];
    case "STORAGE":
      return ["Positions", "Shipments", "Inventory"];
    case "TERMINAL":
      if (assetType === "LNG") {
        return ["Positions", "Shipments", "Inventory"];
      }
      if (assetType === "PIPELINE") {
        return ["Positions", "Shipments"];
      }
      return ["Shipments", "Inventory"];
    case "GENERATION":
    case "CONSUMPTION":
      return ["Positions"];
    default:
      return ["Positions"];
  }
}

function geographyLabelForRegionText(
  region: string | null | undefined,
): AssetMapGeographyLabel | null {
  const regionText = normalizeUppercaseText(region);
  if (!regionText) {
    return null;
  }

  if (
    regionText.includes("NORTH AMERICA") ||
    regionText.includes("CARIBBEAN") ||
    regionText.includes("CENTRAL AMERICA")
  ) {
    return "North America";
  }

  if (
    regionText.includes("SOUTH AMERICA") ||
    regionText.includes("LATAM") ||
    regionText.includes("LATIN AMERICA")
  ) {
    return "South America";
  }

  if (
    regionText.includes("EMEA") ||
    regionText.includes("EUROPE") ||
    regionText.includes("MIDDLE EAST") ||
    regionText.includes("AFRICA")
  ) {
    return "EMEA";
  }

  if (
    regionText.includes("APAC") ||
    regionText.includes("ASIA") ||
    regionText.includes("PACIFIC") ||
    regionText.includes("OCEANIA")
  ) {
    return "APAC";
  }

  return null;
}

function geographyLabelForContinentCode(
  continentCode: string | null | undefined,
): AssetMapGeographyLabel | null {
  switch (normalizeUppercaseText(continentCode)) {
    case "NA":
      return "North America";
    case "SA":
      return "South America";
    case "EU":
    case "AF":
      return "EMEA";
    case "AS":
    case "OC":
      return "APAC";
    default:
      return null;
  }
}

export function assetMapGeographyLabelForPoint(args: {
  latitude: number | null;
  longitude: number | null;
  countryCode?: string | null;
  continentCode?: string | null;
  region?: string | null;
}): AssetMapGeographyLabel | null {
  const regionLabel = geographyLabelForRegionText(args.region);
  if (regionLabel) {
    return regionLabel;
  }

  const countryCode = normalizeUppercaseText(args.countryCode);
  if (MIDDLE_EAST_COUNTRY_CODES.has(countryCode)) {
    return "EMEA";
  }
  if (NORTH_AMERICA_COUNTRY_CODES.has(countryCode)) {
    return "North America";
  }
  if (SOUTH_AMERICA_COUNTRY_CODES.has(countryCode)) {
    return "South America";
  }

  const continentLabel = geographyLabelForContinentCode(args.continentCode);
  if (continentLabel) {
    return continentLabel;
  }

  if (!isFiniteNumber(args.latitude) || !isFiniteNumber(args.longitude)) {
    return null;
  }

  if (args.longitude >= -170 && args.longitude <= -30) {
    if (args.latitude < 12 && args.longitude >= -92) {
      return "South America";
    }

    return "North America";
  }

  if (args.longitude >= -30 && args.longitude < 60) {
    return "EMEA";
  }

  return "APAC";
}

export function assetMapGeographyLabelForRecord(
  record: Pick<AssetMapRecord, "location" | "latitude" | "longitude">,
): AssetMapGeographyLabel | null {
  return assetMapGeographyLabelForPoint({
    latitude: record.latitude,
    longitude: record.longitude,
    countryCode: record.location?.country_code ?? null,
    continentCode: record.location?.continent_code ?? null,
    region: record.location?.region ?? null,
  });
}

export function assetMapCountryCodeForRecord(
  record: Pick<AssetMapRecord, "location">,
): string | null {
  return normalizeCountryCode(record.location?.country_code);
}

export function assetMapSubdivisionCodeForRecord(
  record: Pick<AssetMapRecord, "location">,
): string | null {
  return normalizeSubdivisionCode(record.location?.subdivision_code);
}

export function assetMapCountryCodeForWeatherLocation(
  location: Pick<WeatherLocationRecord, "reference_location_code">,
  locationByCode: ReadonlyMap<
    string,
    Pick<LocationRecord, "country_code"> | LocationRecord
  >,
): string | null {
  const linkedLocationCode = normalizeUppercaseText(
    location.reference_location_code,
  );
  if (!linkedLocationCode) {
    return null;
  }

  return normalizeCountryCode(
    locationByCode.get(linkedLocationCode)?.country_code,
  );
}

export function assetMapSubdivisionCodeForWeatherLocation(
  location: Pick<WeatherLocationRecord, "reference_location_code">,
  locationByCode: ReadonlyMap<
    string,
    Pick<LocationRecord, "subdivision_code"> | LocationRecord
  >,
): string | null {
  const linkedLocationCode = normalizeUppercaseText(
    location.reference_location_code,
  );
  if (!linkedLocationCode) {
    return null;
  }

  return normalizeSubdivisionCode(
    locationByCode.get(linkedLocationCode)?.subdivision_code,
  );
}

export function formatAssetMapCountryLabel(countryCode: string): string {
  const normalizedCountryCode = normalizeUppercaseText(countryCode);
  if (!normalizedCountryCode) {
    return "";
  }

  return (
    getCountryDisplayNames()?.of(normalizedCountryCode) ?? normalizedCountryCode
  );
}

export function formatAssetMapSubdivisionLabel(
  subdivisionCode: string,
): string {
  return normalizeUppercaseText(subdivisionCode);
}

export function buildAssetMapCountryOptions({
  records,
  weatherLocations,
  locationByCode,
}: {
  records: AssetMapRecord[];
  weatherLocations: WeatherLocationRecord[];
  locationByCode: ReadonlyMap<string, LocationRecord>;
}): AssetMapCountryOption[] {
  const countryCodes = new Set<string>();

  records.forEach((record) => {
    const countryCode = assetMapCountryCodeForRecord(record);
    if (countryCode) {
      countryCodes.add(countryCode);
    }
  });

  weatherLocations.forEach((location) => {
    const countryCode = assetMapCountryCodeForWeatherLocation(
      location,
      locationByCode,
    );
    if (countryCode) {
      countryCodes.add(countryCode);
    }
  });

  return Array.from(countryCodes)
    .sort((left, right) =>
      formatAssetMapCountryLabel(left).localeCompare(
        formatAssetMapCountryLabel(right),
      ),
    )
    .map((countryCode) => ({
      code: countryCode,
      label: formatAssetMapCountryLabel(countryCode),
    }));
}

export function buildAssetMapSubdivisionOptions({
  records,
  weatherLocations,
  locationByCode,
}: {
  records: AssetMapRecord[];
  weatherLocations: WeatherLocationRecord[];
  locationByCode: ReadonlyMap<string, LocationRecord>;
}): AssetMapSubdivisionOption[] {
  const subdivisionCodes = new Set<string>();

  records.forEach((record) => {
    const subdivisionCode = assetMapSubdivisionCodeForRecord(record);
    if (subdivisionCode) {
      subdivisionCodes.add(subdivisionCode);
    }
  });

  weatherLocations.forEach((location) => {
    const subdivisionCode = assetMapSubdivisionCodeForWeatherLocation(
      location,
      locationByCode,
    );
    if (subdivisionCode) {
      subdivisionCodes.add(subdivisionCode);
    }
  });

  return Array.from(subdivisionCodes)
    .sort((left, right) =>
      formatAssetMapSubdivisionLabel(left).localeCompare(
        formatAssetMapSubdivisionLabel(right),
      ),
    )
    .map((subdivisionCode) => ({
      code: subdivisionCode,
      label: formatAssetMapSubdivisionLabel(subdivisionCode),
      countryCode:
        normalizeCountryCode(subdivisionCode.split("-", 1)[0] ?? null) ?? null,
    }));
}

export function buildAssetMapSummary(
  assets: AssetRecord[],
  locations: LocationRecord[],
): AssetMapSummary {
  const locationByCode = new Map(
    locations.map((location) => [location.code, location]),
  );

  const records = assets.map<AssetMapRecord>((asset) => {
    const location =
      asset.location_code && asset.location_code.trim().length > 0
        ? (locationByCode.get(asset.location_code) ?? null)
        : null;

    const geometryFeatures = toFeatureList(asset.geometry_geojson, asset);
    if (geometryFeatures.length > 0) {
      const geometryPositions: Array<[number, number]> = [];
      geometryFeatures.forEach((feature) =>
        collectGeometryPositions(feature.geometry, geometryPositions),
      );
      const representativeCoordinate =
        buildRepresentativeCoordinate(geometryPositions);
      if (
        representativeCoordinate.latitude !== null &&
        representativeCoordinate.longitude !== null
      ) {
        return buildMappedRecord({
          asset,
          location,
          geometryFeatures,
          placementStatus: "asset_geometry",
          representativeCoordinate,
          extentCoordinates: geometryPositions,
        });
      }
    }

    if (isFiniteNumber(asset.latitude) && isFiniteNumber(asset.longitude)) {
      return buildMappedRecord({
        asset,
        location,
        placementStatus: "asset_coordinates",
        representativeCoordinate: {
          latitude: asset.latitude,
          longitude: asset.longitude,
        },
        extentCoordinates: [[asset.longitude, asset.latitude]],
      });
    }

    if (!location) {
      return buildMappedRecord({
        asset,
        location: null,
        placementStatus: "missing_location",
        representativeCoordinate: { latitude: null, longitude: null },
        extentCoordinates: [],
      });
    }

    if (!hasCoordinates(location)) {
      return buildMappedRecord({
        asset,
        location,
        placementStatus: "missing_coordinates",
        representativeCoordinate: { latitude: null, longitude: null },
        extentCoordinates: [],
      });
    }

    return buildMappedRecord({
      asset,
      location,
      placementStatus: "linked_location",
      representativeCoordinate: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      extentCoordinates: [[location.longitude, location.latitude]],
    });
  });

  const mappedRecords = records.filter(
    (record) => placementSource(record) !== null,
  );
  const unmappedRecords = records.filter(
    (record) => placementSource(record) === null,
  );

  return {
    records,
    mappedRecords,
    unmappedRecords,
    mappedCount: mappedRecords.length,
    assetGeometryCount: records.filter(
      (record) => record.placementStatus === "asset_geometry",
    ).length,
    assetPointCount: records.filter(
      (record) => record.placementStatus === "asset_coordinates",
    ).length,
    linkedLocationCount: records.filter(
      (record) => record.placementStatus === "linked_location",
    ).length,
    missingCoordinatesCount: records.filter(
      (record) => record.placementStatus === "missing_coordinates",
    ).length,
    missingLocationCount: records.filter(
      (record) => record.placementStatus === "missing_location",
    ).length,
    inactiveCount: records.filter((record) => !record.asset.is_active).length,
  };
}

export function buildAssetMapFeatureCollection(
  records: AssetMapRecord[],
): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: records.flatMap((record) =>
      record.geometryFeatures.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          assetCode: record.asset.code,
          assetName: record.asset.name,
        },
      })),
    ),
  };
}

export function buildSpatialFeatureMapFeatureCollection(
  spatialFeatures: SpatialFeatureRecord[],
): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: spatialFeatures.flatMap((feature) =>
      toSpatialFeatureList(feature.geometry_geojson, feature).map((entry) => ({
        ...entry,
        properties: {
          ...(entry.properties ?? {}),
          featureCode: feature.code,
          featureName: feature.name,
          featureKind: feature.feature_kind,
          entityType: feature.entity_type ?? null,
          entityCode: feature.entity_code ?? null,
        },
      })),
    ),
  };
}

export function buildSpatialFeatureExtentCoordinates(
  spatialFeatures: SpatialFeatureRecord[],
): Array<[number, number]> {
  const positions: Array<[number, number]> = []
  spatialFeatures.forEach((feature) => {
    toSpatialFeatureList(feature.geometry_geojson, feature).forEach((entry) => {
      collectGeometryPositions(entry.geometry, positions)
    })
  })
  return positions
}

export function formatAssetMapLocation(record: AssetMapRecord): string {
  if (!record.location) {
    return record.asset.location_code ?? "No linked location";
  }

  return record.location.name.trim().length > 0
    ? `${record.location.code} · ${record.location.name}`
    : record.location.code;
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

export function formatAssetMapSource(record: AssetMapRecord): string {
  switch (record.placementStatus) {
    case "asset_geometry":
      return "Asset geometry";
    case "asset_coordinates":
      return "Asset coordinates";
    case "linked_location":
      return "Linked location";
    case "missing_coordinates":
      return "Missing coordinates";
    case "missing_location":
      return "Missing location";
    default:
      return "Unknown";
  }
}

export function formatAssetMapPlacement(record: AssetMapRecord): string {
  if (record.latitude !== null && record.longitude !== null) {
    if (record.placementStatus === "linked_location") {
      return `${formatAssetMapSource(record)} · ${formatAssetMapLocation(record)} · ${formatCoordinate(record.latitude)}, ${formatCoordinate(record.longitude)}`;
    }

    return `${formatAssetMapSource(record)} · ${formatCoordinate(record.latitude)}, ${formatCoordinate(record.longitude)}`;
  }

  if (record.placementStatus === "missing_coordinates") {
    return `${formatAssetMapLocation(record)} is missing latitude/longitude`;
  }

  if (record.asset.location_code) {
    return `Linked location ${record.asset.location_code} is not available`;
  }

  return "Asset is not linked to a reference location";
}
