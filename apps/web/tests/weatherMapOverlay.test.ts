import assert from "node:assert/strict";

import { test } from "vitest";

import {
  buildWeatherOverlayPointFeatureCollection,
  buildWeatherOverlayPointRecord,
  buildWeatherOverlayWindVectorFeatureCollection,
  parseWindDirectionDegrees,
  parseWindSpeedMph,
} from "../src/entities/weather/mapOverlay";
import type {
  WeatherForecastPeriodRecord,
  WeatherLocationRecord,
  WeatherObservationRecord,
} from "../src/shared/models";

const baseLocation: WeatherLocationRecord = {
  code: "SFO_BAY",
  name: "San Francisco Bay",
  reference_location_code: "SFO",
  latitude: 37.7749,
  longitude: -122.4194,
  timezone: "America/Los_Angeles",
  source_provider: "NWS",
  cwa: "MTR",
  grid_id: "MTR",
  grid_x: 88,
  grid_y: 126,
  station_id: "KSFO",
  description: "Tracked marine weather point",
  is_active: true,
  created_at: "2026-05-07T00:00:00Z",
  created_by: "test-user",
  updated_at: "2026-05-07T00:00:00Z",
  updated_by: "test-user",
  version: 1,
};

const baseForecast: WeatherForecastPeriodRecord = {
  id: 101,
  weather_location_code: "SFO_BAY",
  source_provider: "NWS",
  period_number: 1,
  start_at: "2026-05-07T12:00:00Z",
  end_at: "2026-05-07T18:00:00Z",
  is_daytime: true,
  temperature: 68,
  temperature_unit: "F",
  wind_speed: "10 to 20 mph",
  wind_direction: "NW",
  short_forecast: "Sunny",
  detailed_forecast: "Sunny and breezy.",
  probability_of_precipitation_pct: 60,
  relative_humidity_pct: 72,
  dewpoint_celsius: 11,
  icon_url: null,
  downloaded_at: "2026-05-07T11:00:00Z",
  run_id: 55,
};

const baseObservation: WeatherObservationRecord = {
  id: 202,
  weather_location_code: "SFO_BAY",
  source_provider: "NWS",
  station_id: "KSFO",
  observed_at: "2026-05-07T11:30:00Z",
  text_description: "Clear",
  icon_url: null,
  temperature_celsius: 10,
  dewpoint_celsius: 6,
  relative_humidity_pct: null,
  wind_speed_kmh: 24.1402,
  wind_direction_degrees: 225,
  barometric_pressure_pa: 101500,
  visibility_meters: 16000,
  downloaded_at: "2026-05-07T11:31:00Z",
  run_id: 55,
};

test("parseWindSpeedMph normalizes forecast strings across common units", () => {
  assert.equal(parseWindSpeedMph("Calm"), 0);
  assert.equal(parseWindSpeedMph("10 to 20 mph"), 15);
  assert.ok(
    Math.abs((parseWindSpeedMph("16 km/h") ?? 0) - 9.941936) < 0.001,
  );
  assert.ok(Math.abs((parseWindSpeedMph("5 m/s") ?? 0) - 11.1847) < 0.001);
  assert.ok(Math.abs((parseWindSpeedMph("10 kt") ?? 0) - 11.5078) < 0.001);
});

test("parseWindDirectionDegrees maps compass directions and ignores calm values", () => {
  assert.equal(parseWindDirectionDegrees("NW"), 315);
  assert.equal(parseWindDirectionDegrees("nne"), 22.5);
  assert.equal(parseWindDirectionDegrees("VARIABLE"), null);
  assert.equal(parseWindDirectionDegrees("CALM"), null);
});

test("buildWeatherOverlayPointRecord prefers observations and falls back to forecast fields", () => {
  const point = buildWeatherOverlayPointRecord(baseLocation, {
    observation: baseObservation,
    forecast: baseForecast,
  });

  assert.ok(point);
  assert.equal(point.code, "SFO_BAY");
  assert.equal(point.observedAt, "2026-05-07T11:30:00Z");
  assert.equal(point.forecastStartAt, "2026-05-07T12:00:00Z");
  assert.equal(point.temperatureF, 50);
  assert.equal(point.precipitationProbabilityPct, 60);
  assert.ok(Math.abs((point.windSpeedMph ?? 0) - 15) < 0.001);
  assert.equal(point.windDirectionDegrees, 225);
  assert.equal(point.relativeHumidityPct, 72);
  assert.equal(point.pressureMb, 1015);
});

test("overlay feature builders emit map-ready GeoJSON and filter empty values", () => {
  const points = [
    buildWeatherOverlayPointRecord(baseLocation, {
      observation: baseObservation,
      forecast: baseForecast,
    }),
    buildWeatherOverlayPointRecord(
      {
        ...baseLocation,
        code: "NO_PRESSURE",
        name: "No Pressure",
      },
      {
        forecast: {
          ...baseForecast,
          weather_location_code: "NO_PRESSURE",
          probability_of_precipitation_pct: null,
          relative_humidity_pct: null,
          temperature: null,
          wind_speed: null,
          wind_direction: null,
        },
      },
    ),
  ].filter((point): point is NonNullable<typeof point> => point !== null);

  const temperatureCollection = buildWeatherOverlayPointFeatureCollection(
    points,
    "temperature",
  );
  const pressureCollection = buildWeatherOverlayPointFeatureCollection(
    points,
    "pressure",
  );
  const windCollection = buildWeatherOverlayWindVectorFeatureCollection(points);

  assert.equal(temperatureCollection.features.length, 1);
  assert.equal(
    temperatureCollection.features[0]?.properties.overlayLabel,
    "50F",
  );
  assert.equal(pressureCollection.features.length, 1);
  assert.equal(pressureCollection.features[0]?.properties.overlayLabel, "1015 mb");
  assert.equal(windCollection.features.length, 1);
  assert.equal(windCollection.features[0]?.geometry.type, "LineString");
  assert.equal(windCollection.features[0]?.geometry.coordinates.length, 2);
  assert.notDeepEqual(
    windCollection.features[0]?.geometry.coordinates[0],
    windCollection.features[0]?.geometry.coordinates[1],
  );
});
