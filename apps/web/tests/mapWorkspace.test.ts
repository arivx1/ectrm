import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { MapWorkspace } from "../src/workspaces/map/MapWorkspace";
import { VIEW_DATA_GROUPS } from "../src/entities/app/workspaceRendererRegistry";
import {
  AssetMapPanel,
  buildAssetMapViewportCoordinates,
  syncAssetActivityVisibilityState,
  setAllAssetGeographyVisibilityState,
  setAllAssetSubtypeVisibilityState,
  syncAssetSubtypeVisibilityState,
} from "../src/workspaces/reference-data/tabs/AssetMapPanel";
import type { DeliveryRecord } from "../src/shared/models";

function buildVesselDelivery(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    delivery_id: "DEL-VESSEL-1",
    trade_id: "TRD-VESSEL-1",
    leg_no: null,
    external_trade_id: null,
    status: "IN_PROGRESS",
    direction: "SELL",
    mode_family: "LOGISTICS",
    transport_mode: "VESSEL",
    commodity: "CRUDE",
    commodity_class: "OIL",
    vessel_detail: {
      delivery_id: "DEL-VESSEL-1",
      vessel_name: "MV Signal",
      imo_number: "IMO1234567",
      mmsi_number: "366123456",
      call_sign: "WABC",
      voyage_number: "VOY-1",
      tracking_provider: "AISSTREAM",
      tracking_policy: "LIVE_WHEN_AVAILABLE",
      last_signal_at: "2026-04-11T02:30:00Z",
      last_position_at: "2026-04-11T02:30:00Z",
      last_latitude: 29.7604,
      last_longitude: -95.3698,
      last_speed_knots: 12.4,
      last_course_degrees: 184,
      last_heading_degrees: 181,
      last_navigational_status: "UNDER_WAY",
      current_destination: "HOUSTON",
      current_eta_at_destination: "2026-04-12T12:00:00Z",
      tracking_health: {
        last_evaluated_at: "2026-04-11T02:31:00Z",
        tracking_freshness_status: "FRESH",
        tracking_freshness_reason: "Recent position",
        eta_status: "ON_TRACK",
        eta_status_reason: "ETA on track",
        exception_severity: "CLEAR",
        primary_exception: null,
        stale_after_minutes: 90,
        minutes_since_last_signal: 1,
        eta_late_minutes: null,
      },
      created_at: "2026-04-11T00:00:00Z",
      created_by: "test-user",
      updated_at: "2026-04-11T02:30:00Z",
      updated_by: "test-user",
      version: 1,
    },
    vessel_tracking_health: null,
    ...overrides,
  } as DeliveryRecord;
}

test("map workspace requests deliveries so vessel overlays load on direct navigation", () => {
  assert.deepEqual(VIEW_DATA_GROUPS.map, ["reference", "deliveries"]);
});

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
      deliveries: [buildVesselDelivery()],
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
      railRoutes: [
        {
          code: "BNSF_WAHA_TO_HSC",
          name: "BNSF Waha to Houston Ship Channel",
          description: "Seeded rail corridor",
          is_active: true,
          rail_line_code: "BNSF_SOUTHERN_TRANSCON",
          origin_location_code: "WAHA",
          destination_location_code: "HOUSTON",
          service_calendar_code: "US_GAS_DAY",
          route_direction: "FORWARD",
          schedule_timezone: "America/Chicago",
          placement_cutoff_time_local: "15:00",
          release_cutoff_time_local: "11:00",
          placement_free_time_hours: 48,
          release_free_time_hours: 24,
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
      globalFilter: "",
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
      onOpenReferenceRailRoute: () => undefined,
      onOpenRailRouteDeliveries: () => undefined,
      onOpenRailRouteScheduling: () => undefined,
    }),
  );

  assert.match(markup, /Asset Footprint/);
  assert.match(markup, /Local Screen Filter/);
  assert.match(markup, /Map Asset Directory/);
  assert.match(
    markup,
    /No asset or vessel is selected\. The map is currently showing every map-ready asset and saved\s+vessel position in the current filter\./,
  );
  assert.match(markup, /Only map-ready assets are included here\./);
  assert.match(markup, /Saved vessel\s+positions plot as a separate tracking layer\./);
  assert.match(markup, />Show</);
  assert.match(markup, /My Location/);
  assert.match(markup, /Assets/);
  assert.match(markup, /Rail Routes/);
  assert.match(markup, /Vessels/);
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
  assert.match(markup, /Radar/);
  assert.match(markup, /Radar overlay opacity/);
  assert.match(markup, /aria-label="Show Radar overlay details"/);
  assert.doesNotMatch(markup, /aria-label="Weather overlay layer"/);
  assert.doesNotMatch(markup, /Markers only/);
  assert.doesNotMatch(markup, /Precipitation/);
  assert.doesNotMatch(markup, /Temperature/);
  assert.doesNotMatch(markup, /Humidity/);
  assert.doesNotMatch(markup, /Pressure/);
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
  assert.doesNotMatch(markup, /tracked weather point/);
  assert.doesNotMatch(markup, /weather points/);
  assert.match(markup, /1 rail overlays/);
  assert.match(markup, /1 vessels/);
  assert.match(markup, /Vessel Positions/);
  assert.match(markup, /MV Signal/);
  assert.match(markup, /366123456/);
  assert.match(markup, /Selected Vessel/);
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

test("asset map panel surfaces selected rail route actions beside the asset summary cards", () => {
  const markup = renderToStaticMarkup(
    createElement(AssetMapPanel, {
      assets: [],
      locations: [
        {
          code: "WAHA",
          name: "Waha",
          description: null,
          is_active: true,
          location_kind: "POINT",
          location_type: "HUB",
        },
        {
          code: "HOUSTON",
          name: "Houston Ship Channel",
          description: null,
          is_active: true,
          location_kind: "POINT",
          location_type: "HUB",
        },
      ],
      railRoutes: [
        {
          code: "BNSF_WAHA_TO_HSC",
          name: "BNSF Waha to Houston Ship Channel",
          description: "Seeded rail corridor",
          is_active: true,
          rail_line_code: "BNSF_SOUTHERN_TRANSCON",
          origin_location_code: "WAHA",
          destination_location_code: "HOUSTON",
          service_calendar_code: "US_GAS_DAY",
          route_direction: "FORWARD",
          schedule_timezone: "America/Chicago",
          placement_cutoff_time_local: "15:00",
          release_cutoff_time_local: "11:00",
          placement_free_time_hours: 48,
          release_free_time_hours: 24,
        },
      ],
      spatialFeatures: [
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
      selectedAssetCode: null,
      selectedRailRouteCode: "BNSF_WAHA_TO_HSC",
      onSelectAsset: () => undefined,
      onSelectRailRoute: () => undefined,
      onOpenRailRouteDeliveries: () => undefined,
      onOpenRailRouteScheduling: () => undefined,
      onOpenReferenceRailRoute: () => undefined,
      onClearRailRouteSelection: () => undefined,
    }),
  );

  assert.match(markup, /Selected Rail Route/);
  assert.match(markup, /BNSF Waha to Houston Ship Channel/);
  assert.match(markup, /BNSF_SOUTHERN_TRANSCON/);
  assert.match(markup, /WAHA · Waha/);
  assert.match(markup, /HOUSTON · Houston Ship Channel/);
  assert.match(markup, /America\/Chicago/);
  assert.match(markup, />Open Deliveries</);
  assert.match(markup, />Open Scheduling</);
  assert.match(markup, />Open Route Record</);
  assert.match(markup, />Clear Route Focus</);
});

test("asset map panel surfaces selected vessel actions beside the map summary cards", () => {
  const markup = renderToStaticMarkup(
    createElement(AssetMapPanel, {
      assets: [],
      locations: [],
      railRoutes: [],
      spatialFeatures: [],
      vesselPositions: [
        {
          deliveryId: "DEL-VESSEL-1",
          tradeId: "TRD-VESSEL-1",
          label: "MV Signal",
          vesselName: "MV Signal",
          imoNumber: "IMO1234567",
          mmsiNumber: "366123456",
          commodity: "CRUDE",
          status: "IN_PROGRESS",
          latitude: 29.7604,
          longitude: -95.3698,
          lastPositionAt: "2026-04-11T02:30:00Z",
          lastSignalAt: "2026-04-11T02:30:00Z",
          speedKnots: 12.4,
          courseDegrees: 184,
          headingDegrees: 181,
          navigationalStatus: "UNDER_WAY",
          destination: "HOUSTON",
          etaAtDestination: "2026-04-12T12:00:00Z",
          healthSeverity: "WATCH",
          primaryException: "ETA_MONITOR",
        },
      ],
      selectedAssetCode: null,
      selectedVesselDeliveryId: "DEL-VESSEL-1",
      onSelectAsset: () => undefined,
      onSelectVessel: () => undefined,
      onOpenVesselDelivery: () => undefined,
      onClearVesselSelection: () => undefined,
    }),
  );

  assert.match(markup, /Vessels/);
  assert.match(markup, /1 vessels/);
  assert.match(markup, /Selected Vessel/);
  assert.match(markup, /DEL-VESSEL-1/);
  assert.match(markup, /MV Signal/);
  assert.match(markup, /CRUDE/);
  assert.match(markup, /12\.4 kn/);
  assert.match(markup, /Course 184°/);
  assert.match(markup, /ETA MONITOR/);
  assert.match(markup, />Open Delivery</);
  assert.match(markup, />Clear Vessel Focus</);
});

test("asset map viewport coordinates include my location beside visible vessels", () => {
  const coordinates = buildAssetMapViewportCoordinates({
    recordCoordinates: [],
    spatialFeatureCoordinates: [],
    vesselCoordinates: [[-95.3698, 29.7604]],
    userLocation: { latitude: 40.7128, longitude: -74.006 },
  });

  assert.deepEqual(coordinates, [
    [-95.3698, 29.7604],
    [-74.006, 40.7128],
  ]);
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
      deliveries: [],
      locations: [],
      railRoutes: [],
      spatialFeatures: [],
      globalFilter: "",
      onOpenReferenceData: () => undefined,
      onPrepareReferenceAsset: () => undefined,
      onOpenReferenceRailRoute: () => undefined,
      onOpenRailRouteDeliveries: () => undefined,
      onOpenRailRouteScheduling: () => undefined,
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
  assert.doesNotMatch(markup, /tracked weather/);
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
