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

For continuous scheduled operation inside a single worker process, the repo now
also includes:

- `apps/api/scripts/run_nws_weather_scheduler.py`
- default interval and freshness thresholds are driven by the `NWS_SYNC_*`
  settings in `apps/api/.env`
- `--max-runs` is available for smoke tests and controlled one-shot validation

## API

- `GET /weather/intelligence/overview`
- `GET /weather/locations/{location_code}/forecast-periods`
- `GET /weather/locations/{location_code}/observations`
- `GET /admin/weather/locations`
- `POST /admin/weather/locations`
- `GET /admin/weather/sync/status`
- `POST /admin/weather/sync/nws`

Supported query params:

- `as_of_date`
- `commodity_class`
- `region_code`

The response is intentionally labeled `SEASONAL_BASELINE` so downstream users
do not mistake historical queries for live meteorological intelligence. Current
day queries switch to `LIVE_NWS_BLEND` when stored NWS data is available.

The weather admin surface also exposes sync health from persisted `NWS` run and
location data, including:

- latest run and latest successful run
- top-level health (`healthy`, `degraded`, `stale`, `failed`, etc.)
- per-location forecast/observation freshness
- scheduler interval and freshness/SLA thresholds

The web admin workspace now surfaces that operational view directly, including:

- a dedicated `NWS Sync Health` panel
- an on-demand `Run NWS Sync` control
- location-by-location freshness rows for tracked weather points

The asset map keeps radar imagery as its weather overlay. Tracked
forecast/observation points remain in weather intelligence and admin surfaces,
but they no longer plot as map markers or point overlays:

- `Radar` resolves the latest RainViewer weather-maps frame at runtime so the
  map can show non-US radar where global provider coverage is available.
- If the global radar manifest is unavailable, the overlay falls back to the
  existing NOAA/NCEP CONUS WMS layer rather than leaving U.S. operators with no
  radar.
- RainViewer attribution is surfaced in the map layer metadata and overlay
  details; production use should confirm commercial terms or replace the public
  source with the approved weather vendor feed from the trading-source register.

## Next Steps

1. Add book, portfolio, and location mapping so weather signals can roll up to
   actual desks and risk views.
2. Add NOAA alert ingestion plus ISO load and pipeline/storage joins so live
   regional weather signals include asset stress and operational context.
3. Add an approved commercial global weather-map provider configuration once
   the weather vendor contract is selected, including provider-specific
   attribution, zoom limits, cache expectations, and outage fallback behavior.
4. Move from single-process scheduling to platform-native orchestration
   (cron/job runner/container scheduler) in deployment environments.
5. Expand beyond `NWS` with the additional weather and market-data feeds in the
   trading-source register as the platform moves from baseline weather
   intelligence to full operational weather analytics.
