import assert from "node:assert/strict";

import { test } from "vitest";

import {
  assetMapActivityLabelsForAsset,
  assetMapCountryCodeForMarketPrice,
  assetMapCountryCodeForWeatherLocation,
  assetMapGeographyLabelForMarketPrice,
  assetMapGeographyLabelForPoint,
  assetMapSubdivisionCodeForMarketPrice,
  assetMapSubdivisionCodeForWeatherLocation,
  assetMapSubtypeLabelForAsset,
  buildAssetMapCountryOptions,
  buildAssetMapFeatureCollection,
  buildAssetMapMarketPriceRecords,
  buildAssetMapSubdivisionOptions,
  buildAssetMapSummary,
  formatAssetMapCountryLabel,
  buildSpatialFeatureMapFeatureCollection,
  formatAssetMapLocation,
  formatAssetMapPlacement,
  formatAssetMapSource,
} from "../src/features/reference-data/assetMap";

test("buildAssetMapSummary prefers asset geometry, then asset points, then linked locations", () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: "PIPE_01",
        name: "Gulf Transmission",
        description: null,
        is_active: true,
        asset_class: "PIPELINE",
        asset_type: "TRANSMISSION",
        commodity_code: "HENRY_HUB",
        location_code: "HOUSTON",
        geometry_geojson: {
          type: "LineString",
          coordinates: [
            [-95.3698, 29.7604],
            [-95.1, 29.9],
          ],
        },
        operating_status: "OPERATING",
      },
      {
        code: "STORE_01",
        name: "North Storage",
        description: null,
        is_active: true,
        asset_class: "STORAGE",
        asset_type: "TANK_FARM",
        commodity_code: "WTI",
        location_code: "CUSHING",
        latitude: 35.9842,
        longitude: -96.7669,
        operating_status: "MAINTENANCE",
      },
      {
        code: "TERM_01",
        name: "Marine Terminal",
        description: null,
        is_active: false,
        asset_class: "TERMINAL",
        asset_type: "MARINE",
        commodity_code: "ULSD",
        location_code: "PORTLAND",
        operating_status: "OPERATING",
      },
      {
        code: "FIELD_01",
        name: "Field Sensor",
        description: null,
        is_active: true,
        asset_class: "UPSTREAM_PRODUCTION",
        asset_type: "OIL_FIELD",
        commodity_code: "WTI",
        location_code: "CUSHING",
        operating_status: "OPERATING",
      },
      {
        code: "LOAD_01",
        name: "Load Pocket",
        description: null,
        is_active: true,
        asset_class: "CONSUMPTION",
        asset_type: "INDUSTRIAL",
        commodity_code: "POWER",
        location_code: null,
        operating_status: "OPERATING",
      },
    ],
    [
      {
        code: "HOUSTON",
        name: "Houston",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "HUB",
        latitude: 29.7604,
        longitude: -95.3698,
      },
      {
        code: "CUSHING",
        name: "Cushing",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "TERMINAL",
        latitude: null,
        longitude: null,
      },
      {
        code: "PORTLAND",
        name: "Portland",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "PORT",
        latitude: 45.5152,
        longitude: -122.6784,
      },
    ],
  );

  assert.equal(summary.records.length, 5);
  assert.equal(summary.mappedCount, 3);
  assert.equal(summary.assetGeometryCount, 1);
  assert.equal(summary.assetPointCount, 1);
  assert.equal(summary.linkedLocationCount, 1);
  assert.equal(summary.missingCoordinatesCount, 1);
  assert.equal(summary.missingLocationCount, 1);
  assert.equal(summary.inactiveCount, 1);
  assert.equal(summary.mappedRecords[0]?.asset.code, "PIPE_01");
  assert.equal(
    summary.unmappedRecords.map((record) => record.asset.code).join(","),
    "FIELD_01,LOAD_01",
  );
  assert.equal(
    summary.records.find((record) => record.asset.code === "PIPE_01")
      ?.placementStatus,
    "asset_geometry",
  );
  assert.equal(
    summary.records.find((record) => record.asset.code === "STORE_01")
      ?.placementStatus,
    "asset_coordinates",
  );
  assert.equal(
    summary.records.find((record) => record.asset.code === "TERM_01")
      ?.placementStatus,
    "linked_location",
  );
});

test("asset map subtype labels collapse raw asset taxonomy into operator-friendly map categories", () => {
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: "UPSTREAM_PRODUCTION",
      asset_type: "OFFSHORE",
    }),
    "Upstream Oil & Gas",
  );
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: "PROCESSING",
      asset_type: "GAS_PLANT",
    }),
    "NG Processing",
  );
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: "PROCESSING",
      asset_type: "PETROCHEMICAL",
    }),
    "Petrochem",
  );
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: "TERMINAL",
      asset_type: "LNG",
    }),
    "NG Processing",
  );
  assert.equal(
    assetMapSubtypeLabelForAsset({
      asset_class: "TERMINAL",
      asset_type: "MARINE",
    }),
    "Other",
  );
});

test("asset map activity labels classify assets into positions, shipments, and inventory buckets", () => {
  assert.deepEqual(
    assetMapActivityLabelsForAsset({
      asset_class: "PIPELINE",
      asset_type: "TRANSMISSION",
    }),
    ["Positions", "Shipments"],
  );
  assert.deepEqual(
    assetMapActivityLabelsForAsset({
      asset_class: "STORAGE",
      asset_type: "TANK_FARM",
    }),
    ["Positions", "Shipments", "Inventory"],
  );
  assert.deepEqual(
    assetMapActivityLabelsForAsset({
      asset_class: "TERMINAL",
      asset_type: "MARINE",
    }),
    ["Shipments", "Inventory"],
  );
  assert.deepEqual(
    assetMapActivityLabelsForAsset({
      asset_class: "CONSUMPTION",
      asset_type: "INDUSTRIAL",
    }),
    ["Positions"],
  );
});

test("asset map geography labels classify broad operator regions deterministically", () => {
  assert.equal(
    assetMapGeographyLabelForPoint({
      latitude: 29.7604,
      longitude: -95.3698,
    }),
    "North America",
  );
  assert.equal(
    assetMapGeographyLabelForPoint({
      latitude: -23.5505,
      longitude: -46.6333,
    }),
    "South America",
  );
  assert.equal(
    assetMapGeographyLabelForPoint({
      latitude: 25.2048,
      longitude: 55.2708,
      continentCode: "AS",
      countryCode: "AE",
    }),
    "EMEA",
  );
  assert.equal(
    assetMapGeographyLabelForPoint({
      latitude: 1.3521,
      longitude: 103.8198,
    }),
    "APAC",
  );
});

test("asset map market price records plot active indices with coordinate-backed locations", () => {
  const records = buildAssetMapMarketPriceRecords({
    priceIndices: [
      {
        code: "HH_NATGAS",
        name: "Henry Hub Natural Gas",
        description: null,
        is_active: true,
        commodity_code: "NATGAS",
        currency_code: "USD",
        unit_code: "MMBTU",
        provider: "EIA",
        market: "US",
        location_code: "HENRY_HUB",
      },
      {
        code: "WAHA_NATGAS",
        name: "Waha Natural Gas",
        description: null,
        is_active: true,
        commodity_code: "NATGAS",
        currency_code: "USD",
        unit_code: "MMBTU",
        provider: "EIA",
        market: "US",
        location_code: "WAHA",
      },
      {
        code: "INACTIVE_NG",
        name: "Inactive Gas",
        description: null,
        is_active: false,
        commodity_code: "NATGAS",
        currency_code: "USD",
        unit_code: "MMBTU",
        provider: "EIA",
        market: "US",
        location_code: "HENRY_HUB",
      },
    ],
    locations: [
      {
        code: "HENRY_HUB",
        name: "Henry Hub",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "HUB",
        latitude: 29.8617,
        longitude: -92.0626,
        subdivision_code: "US-LA",
        country_code: "US",
        continent_code: "NA",
      },
      {
        code: "WAHA",
        name: "Waha",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "HUB",
        latitude: null,
        longitude: null,
        subdivision_code: "US-TX",
        country_code: "US",
        continent_code: "NA",
      },
    ],
    latestMarksByCode: {
      HH_NATGAS: {
        id: 101,
        price_index_code: "HH_NATGAS",
        observation_date: "2026-05-20",
        value: 2.74,
        unit_code: "MMBTU",
        currency_code: "USD",
        source_provider: "EIA",
        source_series_id: "NG.RNGWHHD.D",
        source_frequency: "DAILY",
        source_published_at: null,
        source_revision: null,
        downloaded_at: "2026-05-21T12:00:00Z",
        run_id: 11,
        created_at: "2026-05-21T12:00:00Z",
        updated_at: "2026-05-21T12:00:00Z",
      },
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.priceIndex.code, "HH_NATGAS");
  assert.equal(records[0]?.latitude, 29.8617);
  assert.equal(records[0]?.longitude, -92.0626);
  assert.equal(records[0]?.latestMark?.value, 2.74);
  assert.equal(assetMapGeographyLabelForMarketPrice(records[0]!), "North America");
  assert.equal(assetMapCountryCodeForMarketPrice(records[0]!), "US");
  assert.equal(assetMapSubdivisionCodeForMarketPrice(records[0]!), "US-LA");
});

test("asset map country options stay constrained to the currently visible geography-backed records", () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: "PIPE_US",
        name: "United States Pipe",
        description: null,
        is_active: true,
        asset_class: "PIPELINE",
        asset_type: "TRANSMISSION",
        commodity_code: "HENRY_HUB",
        location_code: "HOUSTON",
        latitude: 29.7604,
        longitude: -95.3698,
        operating_status: "OPERATING",
      },
      {
        code: "PIPE_BR",
        name: "Brazil Pipe",
        description: null,
        is_active: true,
        asset_class: "PIPELINE",
        asset_type: "TRANSMISSION",
        commodity_code: "HENRY_HUB",
        location_code: "SANTOS",
        latitude: -23.9608,
        longitude: -46.3336,
        operating_status: "OPERATING",
      },
    ],
    [
      {
        code: "HOUSTON",
        name: "Houston",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "HUB",
        latitude: 29.7604,
        longitude: -95.3698,
        subdivision_code: "US-TX",
        country_code: "US",
        continent_code: "NA",
      },
      {
        code: "SANTOS",
        name: "Santos",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "PORT",
        latitude: -23.9608,
        longitude: -46.3336,
        subdivision_code: "BR-SP",
        country_code: "BR",
        continent_code: "SA",
      },
    ],
  );
  const locationByCode = new Map(
    summary.records
      .map((record) => record.location)
      .filter((location) => location !== null)
      .map((location) => [location.code, location] as const),
  );

  const options = buildAssetMapCountryOptions({
    records: summary.records.filter(
      (record) =>
        assetMapGeographyLabelForPoint({
          latitude: record.latitude,
          longitude: record.longitude,
          countryCode: record.location?.country_code,
          continentCode: record.location?.continent_code,
        }) === "North America",
    ),
    weatherLocations: [
      {
        code: "HOUSTON_WX",
        name: "Houston Weather",
        reference_location_code: "HOUSTON",
        latitude: 29.7604,
        longitude: -95.3698,
        timezone: "America/Chicago",
        source_provider: "NWS",
        cwa: "HGX",
        grid_id: "HGX",
        grid_x: 1,
        grid_y: 1,
        station_id: "KHOU",
        description: null,
        is_active: true,
        created_at: "2026-04-11T00:00:00Z",
        created_by: "test-user",
        updated_at: "2026-04-11T00:00:00Z",
        updated_by: "test-user",
        version: 1,
      },
      {
        code: "ORPHAN_WX",
        name: "Orphan Weather",
        reference_location_code: null,
        latitude: 29.7604,
        longitude: -95.3698,
        timezone: "America/Chicago",
        source_provider: "NWS",
        cwa: "HGX",
        grid_id: "HGX",
        grid_x: 1,
        grid_y: 1,
        station_id: "KIAH",
        description: null,
        is_active: true,
        created_at: "2026-04-11T00:00:00Z",
        created_by: "test-user",
        updated_at: "2026-04-11T00:00:00Z",
        updated_by: "test-user",
        version: 1,
      },
    ],
    locationByCode,
  });

  assert.deepEqual(options, [
    {
      code: "US",
      label: formatAssetMapCountryLabel("US"),
    },
  ]);
  assert.deepEqual(
    buildAssetMapSubdivisionOptions({
      records: summary.records.filter(
        (record) =>
          assetMapGeographyLabelForPoint({
            latitude: record.latitude,
            longitude: record.longitude,
            countryCode: record.location?.country_code,
            continentCode: record.location?.continent_code,
          }) === "North America",
      ),
      weatherLocations: [
        {
          code: "HOUSTON_WX",
          name: "Houston Weather",
          reference_location_code: "HOUSTON",
          latitude: 29.7604,
          longitude: -95.3698,
          timezone: "America/Chicago",
          source_provider: "NWS",
          cwa: "HGX",
          grid_id: "HGX",
          grid_x: 1,
          grid_y: 1,
          station_id: "KHOU",
          description: null,
          is_active: true,
          created_at: "2026-04-11T00:00:00Z",
          created_by: "test-user",
          updated_at: "2026-04-11T00:00:00Z",
          updated_by: "test-user",
          version: 1,
        },
      ],
      locationByCode,
    }),
    [{ code: "US-TX", label: "US-TX", countryCode: "US" }],
  );
  assert.equal(
    assetMapCountryCodeForWeatherLocation(
      {
        code: "HOUSTON_WX",
        reference_location_code: "HOUSTON",
      },
      locationByCode,
    ),
    "US",
  );
  assert.equal(
    assetMapSubdivisionCodeForWeatherLocation(
      {
        code: "HOUSTON_WX",
        reference_location_code: "HOUSTON",
      },
      locationByCode,
    ),
    "US-TX",
  );
});

test("asset map formatting explains spatial source and placement gaps", () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: "PIPE_01",
        name: "Gulf Transmission",
        description: null,
        is_active: true,
        asset_class: "PIPELINE",
        asset_type: "TRANSMISSION",
        commodity_code: "HENRY_HUB",
        location_code: "HOUSTON",
        latitude: 30.01,
        longitude: -95.22,
        operating_status: "OPERATING",
      },
      {
        code: "TERM_01",
        name: "Marine Terminal",
        description: null,
        is_active: true,
        asset_class: "TERMINAL",
        asset_type: "MARINE",
        commodity_code: "ULSD",
        location_code: null,
        operating_status: "OPERATING",
      },
    ],
    [
      {
        code: "HOUSTON",
        name: "Houston",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "HUB",
        latitude: 29.7604,
        longitude: -95.3698,
      },
    ],
  );

  const mappedRecord = summary.mappedRecords[0];
  const unmappedRecord = summary.unmappedRecords[0];

  assert.equal(formatAssetMapLocation(mappedRecord), "HOUSTON · Houston");
  assert.equal(formatAssetMapSource(mappedRecord), "Asset coordinates");
  assert.match(formatAssetMapPlacement(mappedRecord), /30\.0100/);
  assert.equal(
    formatAssetMapPlacement(unmappedRecord),
    "Asset is not linked to a reference location",
  );
});

test("asset map feature collections flatten asset geometry for rendering", () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: "PIPE_01",
        name: "Gulf Transmission",
        description: null,
        is_active: true,
        asset_class: "PIPELINE",
        asset_type: "TRANSMISSION",
        commodity_code: "HENRY_HUB",
        location_code: "HOUSTON",
        geometry_geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [-95.3698, 29.7604],
                  [-95.1, 29.9],
                ],
              },
              properties: {
                leg: "north",
              },
            },
          ],
        },
        operating_status: "OPERATING",
      },
    ],
    [],
  );

  const featureCollection = buildAssetMapFeatureCollection(
    summary.mappedRecords,
  );
  assert.equal(featureCollection.features.length, 1);
  assert.equal(featureCollection.features[0]?.properties?.assetCode, "PIPE_01");
  assert.equal(featureCollection.features[0]?.properties?.leg, "north");
});

test("asset map ignores malformed geojson geometry and falls back to linked coordinates", () => {
  const summary = buildAssetMapSummary(
    [
      {
        code: "PIPE_02",
        name: "South Line",
        description: null,
        is_active: true,
        asset_class: "PIPELINE",
        asset_type: "TRANSMISSION",
        commodity_code: "HENRY_HUB",
        location_code: "HOUSTON",
        geometry_geojson: {
          type: "Feature",
          geometry: {
            type: "LineString",
          },
        },
        operating_status: "OPERATING",
      },
    ],
    [
      {
        code: "HOUSTON",
        name: "Houston",
        description: null,
        is_active: true,
        location_kind: "POINT",
        location_type: "HUB",
        latitude: 29.7604,
        longitude: -95.3698,
      },
    ],
  );

  assert.equal(summary.mappedCount, 1);
  assert.equal(summary.assetGeometryCount, 0);
  assert.equal(summary.linkedLocationCount, 1);
  assert.equal(summary.mappedRecords[0]?.placementStatus, "linked_location");
  assert.equal(summary.mappedRecords[0]?.geometryFeatures.length, 0);
});

test("spatial feature map collections flatten shared overlays for rendering", () => {
  const featureCollection = buildSpatialFeatureMapFeatureCollection([
    {
      code: "GULF_REGION",
      name: "Gulf Region",
      description: null,
      is_active: true,
      feature_kind: "REGION",
      geometry_type: "AREA",
      entity_type: "LOCATION",
      entity_code: "GULF_COAST",
      label_latitude: 29.8,
      label_longitude: -95.2,
      is_primary: true,
      geometry_geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-95.6, 29.6],
                  [-94.7, 29.6],
                  [-94.7, 30.2],
                  [-95.6, 30.2],
                  [-95.6, 29.6],
                ],
              ],
            },
            properties: {
              region: "gulf",
            },
          },
        ],
      },
    },
  ]);

  assert.equal(featureCollection.features.length, 1);
  assert.equal(
    featureCollection.features[0]?.properties?.featureCode,
    "GULF_REGION",
  );
  assert.equal(
    featureCollection.features[0]?.properties?.featureKind,
    "REGION",
  );
  assert.equal(
    featureCollection.features[0]?.properties?.entityType,
    "LOCATION",
  );
  assert.equal(
    featureCollection.features[0]?.properties?.entityCode,
    "GULF_COAST",
  );
  assert.equal(featureCollection.features[0]?.properties?.region, "gulf");
});
