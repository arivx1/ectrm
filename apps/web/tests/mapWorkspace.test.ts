import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { MapWorkspace } from "../src/workspaces/map/MapWorkspace";
import {
  syncAssetActivityVisibilityState,
  setAllAssetGeographyVisibilityState,
  setAllAssetSubtypeVisibilityState,
  syncAssetSubtypeVisibilityState,
} from "../src/workspaces/reference-data/tabs/AssetMapPanel";

test("map workspace renders a dedicated asset map screen without requiring a selection", () => {
  const markup = renderToStaticMarkup(
    createElement(MapWorkspace, {
      assets: [
        {
          code: "PIPE_01",
          name: "Gulf Transmission",
          description: "Primary prompt gas pipe",
          is_active: true,
          asset_class: "PIPELINE",
          asset_type: "TRANSMISSION",
          asset_reality: "REAL",
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
          code: "TERM_02",
          name: "Unmapped Terminal",
          description: "Awaiting field survey",
          is_active: true,
          asset_class: "TERMINAL",
          asset_type: "MARINE",
          asset_reality: "REAL",
          commodity_code: "POWER",
          location_code: null,
          latitude: null,
          longitude: null,
          geometry_geojson: null,
          operating_status: "OPERATING",
        },
      ],
      locations: [
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
      ],
      spatialFeatures: [
        {
          code: "GULF_REGION",
          name: "Gulf Region",
          description: null,
          is_active: true,
          feature_kind: "REGION",
          geometry_type: "AREA",
          geometry_geojson: {
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
          entity_type: null,
          entity_code: null,
          label_latitude: null,
          label_longitude: null,
          is_primary: true,
        },
        {
          code: "BNSF_WAHA_TO_HSC_OVERLAY",
          name: "BNSF Waha to Houston Ship Channel",
          description: null,
          is_active: true,
          feature_kind: "ROUTE",
          geometry_type: "LINE",
          geometry_geojson: {
            type: "LineString",
            coordinates: [
              [-103.6652, 31.9493],
              [-95.265, 29.7285],
            ],
          },
          entity_type: "RAIL_ROUTE",
          entity_code: "BNSF_WAHA_TO_HSC",
          label_latitude: 30.839,
          label_longitude: -99.4651,
          is_primary: true,
        },
      ],
      weatherLocations: [
        {
          code: "HOUSTON_GC",
          name: "Houston Gulf Coast",
          reference_location_code: "HOUSTON",
          latitude: 29.7604,
          longitude: -95.3698,
          timezone: "America/Chicago",
          source_provider: "NWS",
          cwa: "HGX",
          grid_id: "HGX",
          grid_x: 83,
          grid_y: 95,
          station_id: "KHOU",
          description: "Tracked load and storm point",
          is_active: true,
          created_at: "2026-04-11T00:00:00Z",
          created_by: "test-user",
          updated_at: "2026-04-11T00:00:00Z",
          updated_by: "test-user",
          version: 1,
        },
      ],
      weatherSyncStatus: {
        provider: "NWS",
        label: "NWS Weather Sync",
        health_status: "healthy",
        latest_run_status: "SUCCEEDED",
        success_sla_hours: 6,
        scheduler_interval_minutes: 60,
        forecast_freshness_hours: 6,
        observation_freshness_hours: 2,
        last_run_at: "2026-04-11T00:00:00Z",
        last_success_at: "2026-04-11T00:00:00Z",
        latest_data_at: "2026-04-11T00:00:00Z",
        error_summary: null,
        active_location_count: 1,
        healthy_location_count: 1,
        stale_location_count: 0,
        missing_location_count: 0,
        latest_run: null,
        latest_success: null,
        locations: [
          {
            code: "HOUSTON_GC",
            name: "Houston Gulf Coast",
            reference_location_code: "HOUSTON",
            station_id: "KHOU",
            is_active: true,
            health_status: "healthy",
            last_forecast_downloaded_at: "2026-04-11T00:00:00Z",
            last_observation_at: "2026-04-11T00:00:00Z",
            last_observation_downloaded_at: "2026-04-11T00:00:00Z",
            forecast_age_hours: 1,
            observation_age_hours: 0.5,
          },
        ],
      },
      globalFilter: "",
      weatherDataLoaded: true,
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
    }),
  );

  assert.match(markup, /Asset Footprint/);
  assert.match(markup, /Local Screen Filter/);
  assert.match(markup, /Map Asset Directory/);
  assert.match(
    markup,
    /No asset is selected\. The map is currently showing every map-ready asset in the current filter\./,
  );
  assert.match(markup, /Only map-ready assets are included here\./);
  assert.match(markup, />Show</);
  assert.match(markup, /My Location/);
  assert.match(markup, /Assets/);
  assert.match(markup, /Rail Routes/);
  assert.match(markup, /Weather/);
  assert.match(markup, /Map Filters/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="map-workspace-map-filters-card-panel"/,
  );
  assert.match(
    markup,
    /id="map-workspace-map-filters-card-panel" class="asset-map-filters-card-body"/,
  );
  assert.match(markup, /Tooltips/);
  assert.match(markup, /Weather Overlay/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="map-workspace-map-filters-card-weather-overlay-panel"/,
  );
  assert.match(
    markup,
    /id="map-workspace-map-filters-card-weather-overlay-panel" class="asset-map-weather-overlay-body"/,
  );
  assert.match(markup, /aria-label="Check all weather overlays"/);
  assert.match(markup, /Weather overlay layers/);
  assert.match(markup, /Opacity/);
  assert.match(markup, /Markers only/);
  assert.match(markup, /Radar/);
  assert.match(markup, /Precipitation/);
  assert.match(markup, /Wind/);
  assert.match(markup, /Temperature/);
  assert.match(markup, /Humidity/);
  assert.match(markup, /Pressure/);
  assert.match(markup, /Radar overlay opacity/);
  assert.match(markup, /Humidity overlay opacity/);
  assert.match(markup, /aria-label="Show Radar overlay details"/);
  assert.doesNotMatch(markup, /aria-label="Weather overlay layer"/);
  assert.match(markup, /Activity/);
  assert.match(markup, /Positions/);
  assert.match(markup, /Shipments/);
  assert.match(markup, /Inventory/);
  assert.match(markup, /Geography/);
  assert.match(markup, /North America/);
  assert.match(markup, /South America/);
  assert.match(markup, /EMEA/);
  assert.match(markup, /APAC/);
  assert.match(markup, /Country/);
  assert.match(markup, /All countries/);
  assert.match(markup, /United States/);
  assert.match(markup, /State or Territory/);
  assert.match(markup, /All states or territories/);
  assert.match(markup, /US-TX/);
  assert.match(markup, /Save As/);
  assert.match(markup, /Filter preset name/);
  assert.match(markup, />Save</);
  assert.match(markup, /Presets/);
  assert.match(markup, /No saved presets/);
  assert.match(markup, /Asset Types/);
  assert.match(markup, /Uncheck all/);
  assert.match(markup, /Map Records/);
  assert.match(markup, /1 map record/);
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="map-workspace-map-records-card-panel"/,
  );
  assert.match(
    markup,
    /id="map-workspace-map-records-card-panel" class="asset-map-records-card-body" hidden=""/,
  );
  assert.match(markup, /Pipeline/);
  assert.match(markup, /Other/);
  assert.match(markup, /1 tracked weather point visible/);
  assert.match(markup, /1 weather points/);
  assert.match(markup, /1 rail overlays/);
  assert.match(markup, /Asset Class/);
  assert.match(markup, /Asset Type/);
  assert.match(markup, /Commodity/);
  assert.doesNotMatch(markup, />Where I am</);
  assert.match(markup, /All classes/);
  assert.match(markup, /All types/);
  assert.match(markup, /All commodities/);
  assert.match(markup, /All map filters open/);
  assert.match(markup, /1 hidden/);
  assert.match(markup, /Open Reference Data/);
  assert.match(markup, /class="stack map-workspace"/);
  assert.match(markup, /aria-label="Resize map height"/);
});

test("map workspace keeps the live map canvas available even when no assets are plottable", () => {
  const markup = renderToStaticMarkup(
    createElement(MapWorkspace, {
      assets: [
        {
          code: "TERM_02",
          name: "Unmapped Terminal",
          description: "Awaiting field survey",
          is_active: true,
          asset_class: "TERMINAL",
          asset_type: "MARINE",
          asset_reality: "REAL",
          commodity_code: "HENRY_HUB",
          location_code: null,
          latitude: null,
          longitude: null,
          geometry_geojson: null,
          operating_status: "OPERATING",
        },
      ],
      locations: [],
      spatialFeatures: [],
      weatherLocations: [],
      weatherSyncStatus: null,
      globalFilter: "",
      weatherDataLoaded: true,
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
    }),
  );

  assert.match(markup, /class="asset-map-canvas-shell"/);
  assert.match(markup, /My Location/);
  assert.match(markup, /Assets/);
  assert.match(markup, /Rail Routes/);
  assert.match(markup, /Weather/);
  assert.match(markup, /Map Filters/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="map-workspace-map-filters-card-panel"/,
  );
  assert.match(markup, /Tooltips/);
  assert.match(markup, /Activity/);
  assert.match(markup, /Positions/);
  assert.match(markup, /Shipments/);
  assert.match(markup, /Inventory/);
  assert.match(markup, /Geography/);
  assert.match(markup, /North America/);
  assert.match(markup, /South America/);
  assert.match(markup, /EMEA/);
  assert.match(markup, /APAC/);
  assert.match(markup, /Country/);
  assert.match(markup, /All countries/);
  assert.match(markup, /State or Territory/);
  assert.match(markup, /All states or territories/);
  assert.match(markup, /Save As/);
  assert.match(markup, /Filter preset name/);
  assert.match(markup, />Save</);
  assert.match(markup, /Asset Types/);
  assert.match(markup, /Other/);
  assert.match(markup, /Map Records/);
  assert.match(markup, /0 map records/);
  assert.match(markup, /No tracked weather points loaded/);
  assert.doesNotMatch(markup, />Where I am</);
  assert.match(markup, /No filtered assets are map-ready yet\./);
  assert.match(
    markup,
    /The base map is still available for zoom, pan, and rotate\./,
  );
  assert.match(markup, /1 hidden/);
  assert.match(markup, /aria-label="Resize map height"/);
  assert.doesNotMatch(markup, /class="asset-map-empty"/);
});

test("map workspace surfaces weather layer load failures in the control row", () => {
  const markup = renderToStaticMarkup(
    createElement(MapWorkspace, {
      assets: [],
      locations: [],
      spatialFeatures: [],
      weatherLocations: [],
      weatherSyncStatus: null,
      weatherDataLoaded: false,
      weatherDataLoading: false,
      weatherDataError: "Request failed: 404",
      globalFilter: "",
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
    }),
  );

  assert.match(markup, /Weather Error/);
  assert.doesNotMatch(markup, /Request failed: 404/);
});

test("syncAssetSubtypeVisibilityState keeps existing subtype choices while defaulting new subtypes on", () => {
  const nextState = syncAssetSubtypeVisibilityState(
    ["Other", "Storage", "Pipeline"],
    {
      Other: false,
      Legacy: true,
      Pipeline: true,
    },
  );

  assert.deepEqual(nextState, {
    Other: false,
    Storage: true,
    Pipeline: true,
  });
});

test("syncAssetActivityVisibilityState keeps existing activity choices while defaulting new activities on", () => {
  const nextState = syncAssetActivityVisibilityState({
    Positions: false,
    Legacy: true,
  });

  assert.deepEqual(nextState, {
    Positions: false,
    Shipments: true,
    Inventory: true,
  });
});

test("setAllAssetSubtypeVisibilityState applies the requested bulk visibility", () => {
  assert.deepEqual(
    setAllAssetSubtypeVisibilityState(["Pipeline", "Storage", "Other"], true),
    {
      Pipeline: true,
      Storage: true,
      Other: true,
    },
  );
  assert.deepEqual(
    setAllAssetSubtypeVisibilityState(["Pipeline", "Storage", "Other"], false),
    {
      Pipeline: false,
      Storage: false,
      Other: false,
    },
  );
});

test("setAllAssetGeographyVisibilityState applies the requested bulk visibility", () => {
  assert.deepEqual(setAllAssetGeographyVisibilityState(true), {
    "North America": true,
    "South America": true,
    EMEA: true,
    APAC: true,
  });
  assert.deepEqual(setAllAssetGeographyVisibilityState(false), {
    "North America": false,
    "South America": false,
    EMEA: false,
    APAC: false,
  });
});
