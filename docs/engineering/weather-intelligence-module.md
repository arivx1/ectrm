# Weather Intelligence Module

## Current Scope

The weather overview now operates in two modes:

- `SEASONAL_BASELINE` for historical or forward-dated `as_of_date` queries
- `LIVE_NWS_BLEND` for current-day queries when stored NWS forecasts and
  observations are available

The overview combines:

- projected position exposure by weather-sensitive commodity
- active trade counts by commodity
- region-by-region weather risk, using live NWS temperatures, 24h trend,
  HDD/CDD, forecast bias, and freshness where available
- trading-source readiness for weather, ISO load, and gas pipeline data

This is still not a full desk-grade weather stack yet. It is now a live
platform weather-awareness layer for tracked locations, with clean space left
for alerts, ISO load joins, pipeline/storage context, and richer derived
analytics later.

The repo now also includes an internal NWS connector scaffold under
`apps/api/app/domains/weather/services/external_data/`:

- `nws_client.py` for authenticated `api.weather.gov` requests
- `nws_mapper.py` for normalized point, forecast, and observation shapes
- `nws_snapshot.py` for a one-call point snapshot helper
- `nws_sync.py` for persisted sync into platform weather tables

The tracked-location layer now has a repeatable seed path:

- `apps/api/scripts/seed_weather_locations.py`
- starter points: `BOS_LOAD`, `NYC_LOAD`, `PJM_WEST`, `ERCOT_HOUSTON`,
  `HENRY_HUB`, and `CHICAGO_LOAD`
- existing NWS metadata such as CWA, grid coordinates, and station IDs are
  preserved on reseed
- reference-location links are attached automatically when matching reference
  rows already exist

There is now also a schedulable ingest entrypoint:

- `apps/api/scripts/sync_nws_weather_data.py`
- supports repeated `--location-code` filters plus `--observation-limit`
- requires a valid `NWS_USER_AGENT` in the environment or app config before
  calling `api.weather.gov`

## API

- `GET /weather/intelligence/overview`
- `GET /weather/locations/{location_code}/forecast-periods`
- `GET /weather/locations/{location_code}/observations`
- `GET /admin/weather/locations`
- `POST /admin/weather/locations`
- `POST /admin/weather/sync/nws`

Supported query params:

- `as_of_date`
- `commodity_class`
- `region_code`

The response is intentionally labeled `SEASONAL_BASELINE` so downstream users
do not mistake historical queries for live meteorological intelligence. Current
day queries switch to `LIVE_NWS_BLEND` when stored NWS data is available.

## Next Steps

1. Ingest `weather_forecast_obs`, `power_iso_load`, and `gas_pipeline_storage`
   into normalized warehouse or operational tables.
2. Persist NWS point forecasts and observations into weather-specific tables so
   the current connector scaffold becomes a scheduled ingest path.
3. Add scheduled orchestration for `sync_nws_weather_data` so the seeded
   tracked weather points update automatically.
4. Add book, portfolio, and location mapping so weather signals can roll up to
   actual desks and risk views.
5. Add NOAA alert ingestion plus ISO load and pipeline/storage joins so live
   regional weather signals include asset stress and operational context.
6. Surface the overview in the web workspace once the frontend contract is
   ready.
