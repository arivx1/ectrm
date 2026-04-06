from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from typing import Optional
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.position import Position
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.trade import Trade
from apps.api.app.models.trading_source import TradingSource
from apps.api.app.models.weather_forecast_period import WeatherForecastPeriod
from apps.api.app.models.weather_location import WeatherLocation
from apps.api.app.models.weather_observation import WeatherObservation

BASELINE_ANALYSIS_MODE = "SEASONAL_BASELINE"
LIVE_ANALYSIS_MODE = "LIVE_NWS_BLEND"
WEATHER_SOURCE_IDS = (
    "weather_forecast_obs",
    "power_iso_load",
    "gas_pipeline_storage",
)
LIVE_FORECAST_WINDOW_HOURS = 24
LIVE_FORECAST_STALE_HOURS = 8
LIVE_OBSERVATION_STALE_HOURS = 4
HDD_CDD_BASE_TEMPERATURE_F = 65.0
LIVE_REGION_DATA_MODE = "LIVE_NWS"
BASELINE_REGION_DATA_MODE = "BASELINE_ONLY"
STORM_KEYWORDS = (
    "storm",
    "thunder",
    "snow",
    "ice",
    "freezing",
    "blizzard",
    "hail",
    "tornado",
    "tropical",
    "hurricane",
    "sleet",
)

REGION_CODE_BY_LOCATION_HINT = {
    "BOS_LOAD": "NORTHEAST",
    "NYC_LOAD": "NORTHEAST",
    "PJM_WEST": "NORTHEAST",
    "CHICAGO_LOAD": "MIDWEST",
    "ERCOT_HOUSTON": "ERCOT",
    "HENRY_HUB": "GULF_COAST",
}

WEATHER_SENSITIVITY_BY_CLASS = {
    "NATURAL_GAS": 1.0,
    "POWER": 0.95,
    "REFINED_PRODUCTS": 0.45,
    "CRUDE_OIL": 0.25,
    "ENVIRONMENTAL": 0.15,
}

PRIMARY_DRIVER_BY_CLASS = {
    "WINTER_HEATING": {
        "NATURAL_GAS": "Heating demand and storage draws",
        "POWER": "Peak load and thermal outage sensitivity",
        "REFINED_PRODUCTS": "Distillate demand and cold-weather logistics",
        "CRUDE_OIL": "Freeze-offs and refinery throughput risk",
        "ENVIRONMENTAL": "Load-linked compliance demand",
        "OTHER": "Macro and logistics spillovers",
    },
    "SUMMER_COOLING": {
        "NATURAL_GAS": "Power burn and cooling load",
        "POWER": "Cooling demand, renewables, and outage stress",
        "REFINED_PRODUCTS": "Gasoline demand and refinery disruption risk",
        "CRUDE_OIL": "Hurricane exposure and refinery utilization",
        "ENVIRONMENTAL": "Peak-load linked compliance demand",
        "OTHER": "Macro and logistics spillovers",
    },
    "SHOULDER_BALANCING": {
        "NATURAL_GAS": "Storage injections and forecast revision risk",
        "POWER": "Maintenance season and shape volatility",
        "REFINED_PRODUCTS": "Refinery turnarounds and demand resets",
        "CRUDE_OIL": "Refinery maintenance and inventory noise",
        "ENVIRONMENTAL": "Policy and compliance timing",
        "OTHER": "Macro and logistics spillovers",
    },
}

REGIONAL_BASELINES = {
    "WINTER_HEATING": [
        {
            "region_code": "NORTHEAST",
            "region_name": "Northeast",
            "demand_risk": "HIGH",
            "supply_risk": "MEDIUM",
            "storm_risk": "MEDIUM",
            "primary_driver": "Heating degree day swings",
            "narrative": "Cold revisions can tighten gas basis and lift power load quickly across dense demand centers.",
        },
        {
            "region_code": "MIDWEST",
            "region_name": "Midwest",
            "demand_risk": "HIGH",
            "supply_risk": "MEDIUM",
            "storm_risk": "LOW",
            "primary_driver": "Heating demand and storage pulls",
            "narrative": "Storage-sensitive gas demand and thermal fleet performance can both move meaningfully on colder updates.",
        },
        {
            "region_code": "ERCOT",
            "region_name": "ERCOT",
            "demand_risk": "MEDIUM",
            "supply_risk": "HIGH",
            "storm_risk": "MEDIUM",
            "primary_driver": "Cold-weather reliability",
            "narrative": "Reliability stress matters more than raw load in winter because thermal outages and fuel availability can dominate price action.",
        },
        {
            "region_code": "GULF_COAST",
            "region_name": "Gulf Coast",
            "demand_risk": "MEDIUM",
            "supply_risk": "HIGH",
            "storm_risk": "MEDIUM",
            "primary_driver": "Freeze-offs and pipeline operations",
            "narrative": "Short cold events can disrupt production and pipeline balances even when regional demand is not the main story.",
        },
        {
            "region_code": "WEST",
            "region_name": "West",
            "demand_risk": "MEDIUM",
            "supply_risk": "MEDIUM",
            "storm_risk": "LOW",
            "primary_driver": "Hydro, gas balancing, and mountain weather",
            "narrative": "Winter precipitation and gas balancing can shift regional power and gas optionality faster than headline temperatures suggest.",
        },
    ],
    "SUMMER_COOLING": [
        {
            "region_code": "ERCOT",
            "region_name": "ERCOT",
            "demand_risk": "HIGH",
            "supply_risk": "HIGH",
            "storm_risk": "MEDIUM",
            "primary_driver": "Cooling load and reserve margin stress",
            "narrative": "Heat-driven load spikes, renewable variability, and outage risk create the highest power sensitivity in this regime.",
        },
        {
            "region_code": "WEST",
            "region_name": "West",
            "demand_risk": "HIGH",
            "supply_risk": "HIGH",
            "storm_risk": "HIGH",
            "primary_driver": "Heat waves, hydro variability, and wildfire disruption",
            "narrative": "Persistent heat can strain both load and supply, especially when hydro or wildfire conditions restrict dispatch flexibility.",
        },
        {
            "region_code": "NORTHEAST",
            "region_name": "Northeast",
            "demand_risk": "HIGH",
            "supply_risk": "MEDIUM",
            "storm_risk": "MEDIUM",
            "primary_driver": "Cooling load and gas-for-power demand",
            "narrative": "Humidity-driven load peaks can quickly raise gas burn and power congestion risk on hotter revisions.",
        },
        {
            "region_code": "MIDWEST",
            "region_name": "Midwest",
            "demand_risk": "HIGH",
            "supply_risk": "MEDIUM",
            "storm_risk": "MEDIUM",
            "primary_driver": "Cooling load and convective storm impacts",
            "narrative": "Summer storm clusters can alter both demand expectations and local outage patterns across major load pockets.",
        },
        {
            "region_code": "GULF_COAST",
            "region_name": "Gulf Coast",
            "demand_risk": "MEDIUM",
            "supply_risk": "HIGH",
            "storm_risk": "HIGH",
            "primary_driver": "Tropical weather and refinery exposure",
            "narrative": "Hurricane season matters for LNG, refinery utilization, and logistics even before it becomes a broader demand story.",
        },
    ],
    "SHOULDER_BALANCING": [
        {
            "region_code": "GULF_COAST",
            "region_name": "Gulf Coast",
            "demand_risk": "LOW",
            "supply_risk": "MEDIUM",
            "storm_risk": "MEDIUM",
            "primary_driver": "Storage, maintenance, and logistics resets",
            "narrative": "Shoulder seasons shift attention toward maintenance schedules, pipeline flexibility, and storage cadence.",
        },
        {
            "region_code": "MIDWEST",
            "region_name": "Midwest",
            "demand_risk": "LOW",
            "supply_risk": "MEDIUM",
            "storm_risk": "MEDIUM",
            "primary_driver": "Forecast revisions and maintenance outages",
            "narrative": "Weather can still move prompt fundamentals because maintenance and shoulder-season forecast changes interact quickly.",
        },
        {
            "region_code": "NORTHEAST",
            "region_name": "Northeast",
            "demand_risk": "LOW",
            "supply_risk": "LOW",
            "storm_risk": "MEDIUM",
            "primary_driver": "Late-season cold or early heat surprises",
            "narrative": "Small forecast revisions can matter more than usual when the market is trying to reset from peak winter or summer assumptions.",
        },
        {
            "region_code": "ERCOT",
            "region_name": "ERCOT",
            "demand_risk": "MEDIUM",
            "supply_risk": "MEDIUM",
            "storm_risk": "LOW",
            "primary_driver": "Outage planning and shoulder load ramps",
            "narrative": "Maintenance windows and changing renewable patterns can move shape risk even before true summer demand arrives.",
        },
        {
            "region_code": "WEST",
            "region_name": "West",
            "demand_risk": "MEDIUM",
            "supply_risk": "MEDIUM",
            "storm_risk": "LOW",
            "primary_driver": "Hydro transitions and wildfire setup",
            "narrative": "The main weather risk is less about outright demand and more about how seasonal transitions reshape supply flexibility.",
        },
    ],
}


@dataclass(frozen=True)
class LocationWeatherSignal:
    location_code: str
    region_code: str
    current_temperature_f: Optional[float]
    forecast_average_temperature_f: Optional[float]
    temperature_trend_f: Optional[float]
    heating_degree_days_24h: Optional[float]
    cooling_degree_days_24h: Optional[float]
    max_precipitation_pct: float
    forecast_bias_f: Optional[float]
    forecast_age_hours: Optional[float]
    observation_age_hours: Optional[float]
    latest_weather_update_at: Optional[datetime]
    has_storm_keywords: bool
    stale: bool


def build_weather_intelligence_overview(
    db: Session,
    *,
    as_of_date: Optional[date] = None,
    commodity_class: Optional[str] = None,
    region_code: Optional[str] = None,
) -> dict:
    analysis_date = as_of_date or date.today()
    seasonal_regime = _determine_seasonal_regime(analysis_date)
    normalized_class = normalize_code(commodity_class) if commodity_class else None
    normalized_region = normalize_code(region_code) if region_code else None

    exposures, latest_position_update_at = _build_weather_exposures(
        db,
        seasonal_regime=seasonal_regime,
        commodity_class=normalized_class,
    )
    live_weather_context = _build_live_weather_context(
        db,
        analysis_date=analysis_date,
        seasonal_regime=seasonal_regime,
        region_code=normalized_region,
    )
    regional_signals = _build_regional_signals(
        seasonal_regime=seasonal_regime,
        region_code=normalized_region,
        live_weather_context=live_weather_context,
    )
    tracked_sources = _build_tracked_sources(db)
    tracked_source_ids = {row["source_id"] for row in tracked_sources}
    missing_sources = [source_id for source_id in WEATHER_SOURCE_IDS if source_id not in tracked_source_ids]

    gross_volume = sum(abs(row["net_volume"]) for row in exposures)
    top_exposure = exposures[0] if exposures else None
    analysis_mode = LIVE_ANALYSIS_MODE if live_weather_context["is_live"] else BASELINE_ANALYSIS_MODE

    headline = _build_headline(
        analysis_mode=analysis_mode,
        seasonal_regime=seasonal_regime,
        top_exposure=top_exposure,
        regional_signals=regional_signals,
        live_weather_context=live_weather_context,
    )
    summary = _build_summary(
        analysis_mode=analysis_mode,
        seasonal_regime=seasonal_regime,
        exposure_count=len(exposures),
        gross_volume=gross_volume,
        tracked_source_count=len(tracked_sources),
        commodity_class=normalized_class,
        live_weather_context=live_weather_context,
    )

    return {
        "analysis_mode": analysis_mode,
        "as_of_date": analysis_date,
        "seasonal_regime": seasonal_regime,
        "headline": headline,
        "summary": summary,
        "latest_position_update_at": latest_position_update_at,
        "latest_weather_update_at": live_weather_context["latest_weather_update_at"],
        "live_weather_location_count": live_weather_context["live_location_count"],
        "weather_sensitive_exposure_count": len(exposures),
        "weather_sensitive_gross_volume": gross_volume,
        "focus_areas": _build_focus_areas(
            analysis_mode=analysis_mode,
            seasonal_regime=seasonal_regime,
            top_exposure=top_exposure,
            regional_signals=regional_signals,
            missing_sources=missing_sources,
            tracked_source_count=len(tracked_sources),
            live_weather_context=live_weather_context,
        ),
        "exposures": exposures,
        "regional_signals": regional_signals,
        "tracked_sources": tracked_sources,
    }


def _determine_seasonal_regime(as_of_date: date) -> str:
    if as_of_date.month in (12, 1, 2):
        return "WINTER_HEATING"
    if as_of_date.month in (6, 7, 8, 9):
        return "SUMMER_COOLING"
    return "SHOULDER_BALANCING"


def _build_weather_exposures(
    db: Session,
    *,
    seasonal_regime: str,
    commodity_class: Optional[str],
) -> tuple[list[dict], Optional[datetime]]:
    commodity_lookup = {
        row.code: row
        for row in db.execute(select(ReferenceCommodity)).scalars().all()
    }
    trade_counts = {
        commodity_code: count
        for commodity_code, count in db.execute(
            select(Trade.commodity, func.count())
            .where(Trade.status == "ACTIVE")
            .group_by(Trade.commodity)
        ).all()
    }

    latest_position_update_at: Optional[datetime] = None
    exposures: list[dict] = []

    for position in db.execute(select(Position).order_by(Position.updated_at.desc())).scalars().all():
        normalized_code = normalize_code(position.commodity)
        reference = commodity_lookup.get(normalized_code)
        resolved_class = reference.commodity_class if reference is not None else "OTHER"

        if commodity_class and resolved_class != commodity_class:
            continue

        sensitivity_score = WEATHER_SENSITIVITY_BY_CLASS.get(resolved_class, 0.0)
        if sensitivity_score <= 0:
            continue

        latest_position_update_at = _max_datetime(latest_position_update_at, position.updated_at)
        net_volume = float(position.net_volume)
        direction = "LONG" if net_volume > 0 else "SHORT" if net_volume < 0 else "FLAT"
        driver = PRIMARY_DRIVER_BY_CLASS[seasonal_regime].get(
            resolved_class,
            PRIMARY_DRIVER_BY_CLASS[seasonal_regime]["OTHER"],
        )

        exposures.append(
            {
                "commodity_code": normalized_code,
                "commodity_name": reference.name if reference is not None else normalized_code,
                "commodity_class": resolved_class,
                "net_volume": net_volume,
                "active_trade_count": trade_counts.get(normalized_code, 0),
                "directional_bias": direction,
                "weather_sensitivity_score": sensitivity_score,
                "primary_driver": driver,
                "suggested_watch": _build_suggested_watch(
                    seasonal_regime=seasonal_regime,
                    commodity_name=reference.name if reference is not None else normalized_code,
                    commodity_class=resolved_class,
                    direction=direction,
                ),
            }
        )

    exposures.sort(
        key=lambda row: (
            row["weather_sensitivity_score"] * abs(row["net_volume"]),
            abs(row["net_volume"]),
            row["commodity_code"],
        ),
        reverse=True,
    )

    return exposures, latest_position_update_at


def _build_live_weather_context(
    db: Session,
    *,
    analysis_date: date,
    seasonal_regime: str,
    region_code: Optional[str],
) -> dict:
    if analysis_date != date.today():
        return _empty_live_weather_context()

    now = datetime.now(timezone.utc)
    locations = db.execute(
        select(WeatherLocation)
        .where(WeatherLocation.is_active.is_(True))
        .order_by(WeatherLocation.code.asc())
    ).scalars().all()
    if not locations:
        return _empty_live_weather_context()

    location_codes = [row.code for row in locations]
    forecast_rows = db.execute(
        select(WeatherForecastPeriod)
        .where(WeatherForecastPeriod.weather_location_code.in_(location_codes))
        .order_by(
            WeatherForecastPeriod.weather_location_code.asc(),
            WeatherForecastPeriod.start_at.asc(),
        )
    ).scalars().all()
    observation_rows = db.execute(
        select(WeatherObservation)
        .where(WeatherObservation.weather_location_code.in_(location_codes))
        .order_by(
            WeatherObservation.weather_location_code.asc(),
            WeatherObservation.observed_at.desc(),
        )
    ).scalars().all()

    forecasts_by_location: dict[str, list[WeatherForecastPeriod]] = {code: [] for code in location_codes}
    observations_by_location: dict[str, list[WeatherObservation]] = {code: [] for code in location_codes}
    for row in forecast_rows:
        forecasts_by_location.setdefault(row.weather_location_code, []).append(row)
    for row in observation_rows:
        observations_by_location.setdefault(row.weather_location_code, []).append(row)

    location_signals: list[LocationWeatherSignal] = []
    latest_weather_update_at: Optional[datetime] = None
    for location in locations:
        signal = _build_location_weather_signal(
            location=location,
            forecast_rows=forecasts_by_location.get(location.code, []),
            observation_rows=observations_by_location.get(location.code, []),
            now=now,
        )
        if signal is None:
            continue
        if region_code and signal.region_code != region_code:
            continue
        location_signals.append(signal)
        if signal.latest_weather_update_at is not None:
            latest_weather_update_at = _max_datetime(latest_weather_update_at, signal.latest_weather_update_at)

    if not location_signals:
        return _empty_live_weather_context()

    region_signals = _build_live_region_signals(
        signals=location_signals,
        seasonal_regime=seasonal_regime,
    )
    region_signals.sort(
        key=lambda row: (
            -_risk_score_from_labels(row),
            -row["tracked_location_count"],
            row["region_code"],
        )
    )

    forecast_bias_values = [
        abs(row.forecast_bias_f)
        for row in location_signals
        if row.forecast_bias_f is not None
    ]
    forecast_ages = [row.forecast_age_hours for row in location_signals if row.forecast_age_hours is not None]
    observation_ages = [row.observation_age_hours for row in location_signals if row.observation_age_hours is not None]

    return {
        "is_live": True,
        "latest_weather_update_at": latest_weather_update_at,
        "live_location_count": len(location_signals),
        "stale_location_count": sum(1 for row in location_signals if row.stale),
        "average_forecast_bias_f": _average(forecast_bias_values),
        "average_forecast_age_hours": _average(forecast_ages),
        "average_observation_age_hours": _average(observation_ages),
        "region_signals": region_signals,
        "top_region": region_signals[0] if region_signals else None,
    }


def _build_location_weather_signal(
    *,
    location: WeatherLocation,
    forecast_rows: list[WeatherForecastPeriod],
    observation_rows: list[WeatherObservation],
    now: datetime,
) -> Optional[LocationWeatherSignal]:
    region_code = _infer_region_code(location)
    if region_code is None:
        return None

    observation = observation_rows[0] if observation_rows else None
    observation_temperature_f = _celsius_to_fahrenheit(observation.temperature_celsius) if observation is not None else None

    window_end = now + timedelta(hours=LIVE_FORECAST_WINDOW_HOURS)
    active_forecasts = [
        row
        for row in forecast_rows
        if _coerce_utc(row.end_at, timezone_name=location.timezone) >= now
        and _coerce_utc(row.start_at, timezone_name=location.timezone) <= window_end
    ]

    current_forecast = _select_current_forecast(
        forecast_rows=forecast_rows,
        now=now,
        timezone_name=location.timezone,
    )
    current_forecast_temperature_f = _forecast_temperature_f(current_forecast) if current_forecast is not None else None

    current_temperature_f = observation_temperature_f if observation_temperature_f is not None else current_forecast_temperature_f
    forecast_temperatures_f = [
        temperature_f
        for temperature_f in (_forecast_temperature_f(row) for row in active_forecasts)
        if temperature_f is not None
    ]
    forecast_average_temperature_f = _average(forecast_temperatures_f)

    if current_temperature_f is None and forecast_average_temperature_f is None:
        return None

    temperature_trend_f: Optional[float] = None
    if current_temperature_f is not None and forecast_average_temperature_f is not None:
        temperature_trend_f = forecast_average_temperature_f - current_temperature_f

    heating_degree_days_24h = (
        _average([max(HDD_CDD_BASE_TEMPERATURE_F - row, 0.0) for row in forecast_temperatures_f])
        if forecast_temperatures_f
        else _degree_days(current_temperature_f, heating=True)
    )
    cooling_degree_days_24h = (
        _average([max(row - HDD_CDD_BASE_TEMPERATURE_F, 0.0) for row in forecast_temperatures_f])
        if forecast_temperatures_f
        else _degree_days(current_temperature_f, heating=False)
    )

    max_precipitation_pct = max(
        (row.probability_of_precipitation_pct or 0.0 for row in active_forecasts),
        default=0.0,
    )
    storm_text = " ".join(
        filter(
            None,
            [
                *(row.short_forecast for row in active_forecasts),
                *(row.detailed_forecast for row in active_forecasts),
                observation.text_description if observation is not None else None,
            ],
        )
    ).lower()
    has_storm_keywords = any(keyword in storm_text for keyword in STORM_KEYWORDS)

    matched_forecast = _match_forecast_to_observation(
        forecast_rows=forecast_rows,
        observation=observation,
        timezone_name=location.timezone,
    )
    forecast_bias_f: Optional[float] = None
    if observation_temperature_f is not None and matched_forecast is not None:
        matched_temperature_f = _forecast_temperature_f(matched_forecast)
        if matched_temperature_f is not None:
            forecast_bias_f = matched_temperature_f - observation_temperature_f

    latest_forecast_downloaded_at = _latest_datetime(
        [_coerce_utc(row.downloaded_at, timezone_name=location.timezone) for row in active_forecasts],
    )
    latest_observation_timestamp = None
    latest_observation_downloaded_at = None
    if observation is not None:
        latest_observation_timestamp = _coerce_utc(observation.observed_at, timezone_name=location.timezone)
        latest_observation_downloaded_at = _coerce_utc(observation.downloaded_at, timezone_name=location.timezone)

    forecast_age_hours = (
        _hours_between(latest_forecast_downloaded_at, now)
        if latest_forecast_downloaded_at is not None
        else None
    )
    observation_age_hours = (
        _hours_between(latest_observation_timestamp, now)
        if latest_observation_timestamp is not None
        else None
    )
    latest_weather_update_at = _latest_datetime(
        [
            row
            for row in (latest_forecast_downloaded_at, latest_observation_downloaded_at)
            if row is not None
        ]
    )
    stale = bool(
        forecast_age_hours is None
        or forecast_age_hours > LIVE_FORECAST_STALE_HOURS
        or observation_age_hours is None
        or observation_age_hours > LIVE_OBSERVATION_STALE_HOURS
    )

    return LocationWeatherSignal(
        location_code=location.code,
        region_code=region_code,
        current_temperature_f=current_temperature_f,
        forecast_average_temperature_f=forecast_average_temperature_f,
        temperature_trend_f=temperature_trend_f,
        heating_degree_days_24h=heating_degree_days_24h,
        cooling_degree_days_24h=cooling_degree_days_24h,
        max_precipitation_pct=max_precipitation_pct,
        forecast_bias_f=forecast_bias_f,
        forecast_age_hours=forecast_age_hours,
        observation_age_hours=observation_age_hours,
        latest_weather_update_at=latest_weather_update_at,
        has_storm_keywords=has_storm_keywords,
        stale=stale,
    )


def _build_live_region_signals(
    *,
    signals: list[LocationWeatherSignal],
    seasonal_regime: str,
) -> list[dict]:
    grouped: dict[str, list[LocationWeatherSignal]] = {}
    for signal in signals:
        grouped.setdefault(signal.region_code, []).append(signal)

    rows: list[dict] = []
    for region_code, region_signals in grouped.items():
        current_temperatures = [
            row.current_temperature_f for row in region_signals if row.current_temperature_f is not None
        ]
        forecast_average_temperatures = [
            row.forecast_average_temperature_f
            for row in region_signals
            if row.forecast_average_temperature_f is not None
        ]
        temperature_trends = [
            row.temperature_trend_f for row in region_signals if row.temperature_trend_f is not None
        ]
        heating_degree_days = [
            row.heating_degree_days_24h for row in region_signals if row.heating_degree_days_24h is not None
        ]
        cooling_degree_days = [
            row.cooling_degree_days_24h for row in region_signals if row.cooling_degree_days_24h is not None
        ]
        forecast_biases = [abs(row.forecast_bias_f) for row in region_signals if row.forecast_bias_f is not None]
        forecast_ages = [row.forecast_age_hours for row in region_signals if row.forecast_age_hours is not None]
        observation_ages = [
            row.observation_age_hours for row in region_signals if row.observation_age_hours is not None
        ]

        current_temperature_f = _average(current_temperatures)
        forecast_average_temperature_f = _average(forecast_average_temperatures)
        temperature_trend_f = _average(temperature_trends)
        heating_degree_days_24h = _average(heating_degree_days)
        cooling_degree_days_24h = _average(cooling_degree_days)
        max_precipitation_pct = max((row.max_precipitation_pct for row in region_signals), default=0.0)
        has_storm_keywords = any(row.has_storm_keywords for row in region_signals)
        forecast_bias_f = _average(forecast_biases)
        forecast_age_hours = _average(forecast_ages)
        observation_age_hours = _average(observation_ages)
        stale_count = sum(1 for row in region_signals if row.stale)

        demand_score, supply_score, storm_score, primary_driver = _score_live_region_signal(
            seasonal_regime=seasonal_regime,
            region_code=region_code,
            current_temperature_f=current_temperature_f,
            forecast_average_temperature_f=forecast_average_temperature_f,
            temperature_trend_f=temperature_trend_f,
            heating_degree_days_24h=heating_degree_days_24h,
            cooling_degree_days_24h=cooling_degree_days_24h,
            max_precipitation_pct=max_precipitation_pct,
            has_storm_keywords=has_storm_keywords,
            forecast_bias_f=forecast_bias_f,
            stale_count=stale_count,
        )

        rows.append(
            {
                "region_code": region_code,
                "demand_risk": _risk_label(demand_score),
                "supply_risk": _risk_label(supply_score),
                "storm_risk": _risk_label(storm_score),
                "primary_driver": primary_driver,
                "narrative": _build_live_region_narrative(
                    seasonal_regime=seasonal_regime,
                    location_count=len(region_signals),
                    current_temperature_f=current_temperature_f,
                    forecast_average_temperature_f=forecast_average_temperature_f,
                    temperature_trend_f=temperature_trend_f,
                    heating_degree_days_24h=heating_degree_days_24h,
                    cooling_degree_days_24h=cooling_degree_days_24h,
                    max_precipitation_pct=max_precipitation_pct,
                    forecast_bias_f=forecast_bias_f,
                    stale_count=stale_count,
                ),
                "data_mode": LIVE_REGION_DATA_MODE,
                "tracked_location_count": len(region_signals),
                "current_temperature_f": _round_optional(current_temperature_f),
                "forecast_average_temperature_f": _round_optional(forecast_average_temperature_f),
                "temperature_trend_f": _round_optional(temperature_trend_f),
                "heating_degree_days_24h": _round_optional(heating_degree_days_24h),
                "cooling_degree_days_24h": _round_optional(cooling_degree_days_24h),
                "forecast_bias_f": _round_optional(forecast_bias_f),
                "forecast_age_hours": _round_optional(forecast_age_hours),
                "observation_age_hours": _round_optional(observation_age_hours),
            }
        )

    return rows


def _build_tracked_sources(db: Session) -> list[dict]:
    rows = db.execute(
        select(TradingSource)
        .where(
            or_(
                TradingSource.source_category == "weather",
                TradingSource.source_id.in_(WEATHER_SOURCE_IDS),
            )
        )
        .order_by(TradingSource.source_id.asc())
    ).scalars().all()

    return [
        {
            "source_id": row.source_id,
            "source_name": row.source_name,
            "source_category": row.source_category,
            "update_frequency": row.update_frequency,
            "business_owner": row.business_owner,
            "status": row.status,
        }
        for row in rows
    ]


def _build_regional_signals(
    *,
    seasonal_regime: str,
    region_code: Optional[str],
    live_weather_context: dict,
) -> list[dict]:
    baselines = REGIONAL_BASELINES[seasonal_regime]
    supported_rows = baselines if region_code is None else [row for row in baselines if row["region_code"] == region_code]
    if not supported_rows:
        supported = ", ".join(row["region_code"] for row in baselines)
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported region_code '{region_code}'. Supported values: {supported}.",
        )
    if not live_weather_context["is_live"]:
        return supported_rows

    baseline_order = {row["region_code"]: index for index, row in enumerate(baselines)}
    live_order = {
        row["region_code"]: index for index, row in enumerate(live_weather_context["region_signals"])
    }
    live_lookup = {row["region_code"]: row for row in live_weather_context["region_signals"]}
    rows: list[dict] = []
    for baseline in supported_rows:
        live_row = live_lookup.get(baseline["region_code"])
        if live_row is not None:
            rows.append(
                {
                    **baseline,
                    **live_row,
                    "region_name": baseline["region_name"],
                }
            )
            continue

        rows.append(
            {
                **baseline,
                "data_mode": BASELINE_REGION_DATA_MODE,
                "tracked_location_count": 0,
                "current_temperature_f": None,
                "forecast_average_temperature_f": None,
                "temperature_trend_f": None,
                "heating_degree_days_24h": None,
                "cooling_degree_days_24h": None,
                "forecast_bias_f": None,
                "forecast_age_hours": None,
                "observation_age_hours": None,
                "narrative": baseline["narrative"]
                + " No tracked live weather point is currently mapped to this region.",
            }
        )

    if region_code is not None:
        return rows

    rows.sort(
        key=lambda row: (
            0 if row.get("data_mode") == LIVE_REGION_DATA_MODE else 1,
            live_order.get(
                row["region_code"],
                len(live_order) + baseline_order[row["region_code"]],
            ),
            baseline_order[row["region_code"]],
        )
    )
    return rows


def _build_headline(
    *,
    analysis_mode: str,
    seasonal_regime: str,
    top_exposure: Optional[dict],
    regional_signals: list[dict],
    live_weather_context: dict,
) -> str:
    regime_label = seasonal_regime.replace("_", " ").title()
    if analysis_mode == LIVE_ANALYSIS_MODE and live_weather_context["top_region"] is not None:
        top_region = live_weather_context["top_region"]
        top_region_name = next(
            (
                row["region_name"]
                for row in regional_signals
                if row["region_code"] == top_region["region_code"]
            ),
            top_region["region_code"].replace("_", " ").title(),
        )
        temperature_phrase = _format_temperature_phrase(
            current_temperature_f=top_region.get("current_temperature_f"),
            forecast_average_temperature_f=top_region.get("forecast_average_temperature_f"),
            temperature_trend_f=top_region.get("temperature_trend_f"),
        )
        if top_exposure is None:
            return (
                f"Live NWS blend: {top_region_name} is the lead regional watch with {temperature_phrase} "
                f"and {top_region['primary_driver'].lower()}."
            )
        return (
            f"Live NWS blend: {top_region_name} leads the weather watch while {top_exposure['commodity_name']} "
            f"remains the largest weather-sensitive exposure; {temperature_phrase}."
        )

    if top_exposure is None:
        return f"Seasonal baseline: {regime_label} conditions are mapped, but no weather-sensitive projected exposure is currently in scope."

    top_region = regional_signals[0]["region_name"] if regional_signals else "core regions"
    return (
        f"Seasonal baseline: {regime_label} risk centers on {top_exposure['commodity_name']} "
        f"with {top_exposure['directional_bias'].lower()} exposure and primary watch on {top_region}."
    )


def _build_summary(
    *,
    analysis_mode: str,
    seasonal_regime: str,
    exposure_count: int,
    gross_volume: float,
    tracked_source_count: int,
    commodity_class: Optional[str],
    live_weather_context: dict,
) -> str:
    regime_phrase = {
        "WINTER_HEATING": "heating-demand and cold-reliability scenarios",
        "SUMMER_COOLING": "cooling-load and outage scenarios",
        "SHOULDER_BALANCING": "maintenance, storage, and forecast-revision scenarios",
    }[seasonal_regime]
    scope = f" filtered to {commodity_class}" if commodity_class else ""
    if analysis_mode == LIVE_ANALYSIS_MODE:
        freshness_phrase = _build_live_freshness_phrase(live_weather_context)
        bias_phrase = ""
        if live_weather_context["average_forecast_bias_f"] is not None:
            bias_phrase = f" Average live forecast bias is {live_weather_context['average_forecast_bias_f']:.1f}F."
        return (
            f"This view blends live NWS forecasts and observations across "
            f"{live_weather_context['live_location_count']} tracked weather points{scope}: "
            f"{exposure_count} weather-sensitive projected exposures covering {gross_volume:,.0f} gross volume, "
            f"with {tracked_source_count} tracked source definitions supporting {regime_phrase}. "
            f"{freshness_phrase}{bias_phrase}"
        )
    return (
        f"This view is a platform seasonal baseline{scope}: {exposure_count} weather-sensitive projected exposures "
        f"covering {gross_volume:,.0f} gross volume, with {tracked_source_count} tracked source definitions available "
        f"for {regime_phrase}."
    )


def _build_focus_areas(
    *,
    analysis_mode: str,
    seasonal_regime: str,
    top_exposure: Optional[dict],
    regional_signals: list[dict],
    missing_sources: list[str],
    tracked_source_count: int,
    live_weather_context: dict,
) -> list[str]:
    focus_areas: list[str] = []

    if top_exposure is not None:
        focus_areas.append(top_exposure["suggested_watch"])
    else:
        focus_areas.append(
            "No weather-sensitive projected positions are currently loaded, so the module is highlighting regional baseline risk rather than live book exposure."
        )

    if regional_signals:
        region = regional_signals[0]
        if analysis_mode == LIVE_ANALYSIS_MODE and region.get("data_mode") == LIVE_REGION_DATA_MODE:
            focus_areas.append(
                f"Live regional watch: {region['region_name']} shows {region['primary_driver'].lower()} with "
                f"{_format_temperature_phrase(region.get('current_temperature_f'), region.get('forecast_average_temperature_f'), region.get('temperature_trend_f'))}."
            )
        else:
            focus_areas.append(
                f"{region['region_name']} is the lead regional watch because {region['primary_driver'].lower()} remain the strongest {seasonal_regime.lower().replace('_', ' ')} driver there."
            )

    if analysis_mode == LIVE_ANALYSIS_MODE:
        if live_weather_context["stale_location_count"]:
            focus_areas.append(
                f"Freshness watch: {live_weather_context['stale_location_count']} tracked weather locations are stale on observations or forecasts, so the live signal should be treated as degraded."
            )
        else:
            focus_areas.append(
                f"Live weather freshness is healthy across {live_weather_context['live_location_count']} tracked points; {_build_live_freshness_phrase(live_weather_context).lower()}"
            )

    if missing_sources:
        focus_areas.append(
            "Source readiness gap: add "
            + ", ".join(missing_sources)
            + " to the seeded trading-source register so this module can graduate from baseline heuristics to live intelligence inputs."
        )
    elif tracked_source_count:
        if analysis_mode == LIVE_ANALYSIS_MODE:
            focus_areas.append(
                "Core weather source definitions are present and NWS ingestion is live; the next build should add alert overlays, ISO load joins, and gas pipeline context."
            )
        else:
            focus_areas.append(
                "Core weather-related source definitions are present; the next step is wiring live ingestion, forecast bias checks, and derived HDD/CDD features."
            )

    return focus_areas


def _build_suggested_watch(
    *,
    seasonal_regime: str,
    commodity_name: str,
    commodity_class: str,
    direction: str,
) -> str:
    if direction == "FLAT":
        return f"{commodity_name} is roughly flat, so focus on optionality and regional dislocations rather than outright weather beta."

    adverse_shift = {
        "WINTER_HEATING": {
            "LONG": "warmer-than-normal revisions",
            "SHORT": "colder-than-normal revisions",
        },
        "SUMMER_COOLING": {
            "LONG": "milder-than-normal load revisions",
            "SHORT": "hotter-than-normal load revisions",
        },
        "SHOULDER_BALANCING": {
            "LONG": "looser storage and maintenance outcomes",
            "SHORT": "tighter storage and maintenance outcomes",
        },
    }[seasonal_regime][direction]

    driver = PRIMARY_DRIVER_BY_CLASS[seasonal_regime].get(
        commodity_class,
        PRIMARY_DRIVER_BY_CLASS[seasonal_regime]["OTHER"],
    ).lower()
    return f"{adverse_shift.capitalize()} would be the main adverse scenario for {direction.lower()} {commodity_name} exposure because of {driver}."


def _max_datetime(left: Optional[datetime], right: datetime) -> datetime:
    if left is None:
        return right
    return right if right > left else left


def _empty_live_weather_context() -> dict:
    return {
        "is_live": False,
        "latest_weather_update_at": None,
        "live_location_count": 0,
        "stale_location_count": 0,
        "average_forecast_bias_f": None,
        "average_forecast_age_hours": None,
        "average_observation_age_hours": None,
        "region_signals": [],
        "top_region": None,
    }


def _infer_region_code(location: WeatherLocation) -> Optional[str]:
    for hint in (
        location.code,
        location.reference_location_code,
        location.name,
    ):
        normalized_hint = normalize_code(hint) if hint else None
        if normalized_hint and normalized_hint in REGION_CODE_BY_LOCATION_HINT:
            return REGION_CODE_BY_LOCATION_HINT[normalized_hint]

    name_hint = normalize_code(location.name) if location.name else ""
    if "HOUSTON" in name_hint or "ERCOT" in name_hint:
        return "ERCOT"
    if "HENRY" in name_hint or "GULF" in name_hint:
        return "GULF_COAST"
    if "CHICAGO" in name_hint or location.timezone == "America/Chicago":
        return "MIDWEST"
    if any(token in name_hint for token in ("BOSTON", "NEW_YORK", "PJM")) or location.timezone == "America/New_York":
        return "NORTHEAST"
    if location.timezone in {"America/Los_Angeles", "America/Denver"}:
        return "WEST"
    return None


def _select_current_forecast(
    *,
    forecast_rows: list[WeatherForecastPeriod],
    now: datetime,
    timezone_name: Optional[str],
) -> Optional[WeatherForecastPeriod]:
    future_rows: list[WeatherForecastPeriod] = []
    for row in forecast_rows:
        start_at = _coerce_utc(row.start_at, timezone_name=timezone_name)
        end_at = _coerce_utc(row.end_at, timezone_name=timezone_name)
        if start_at <= now <= end_at:
            return row
        if end_at >= now:
            future_rows.append(row)
    return future_rows[0] if future_rows else None


def _match_forecast_to_observation(
    *,
    forecast_rows: list[WeatherForecastPeriod],
    observation: Optional[WeatherObservation],
    timezone_name: Optional[str],
) -> Optional[WeatherForecastPeriod]:
    if observation is None:
        return None
    observed_at = _coerce_utc(observation.observed_at, timezone_name=timezone_name)
    candidates: list[tuple[float, WeatherForecastPeriod]] = []
    for row in forecast_rows:
        start_at = _coerce_utc(row.start_at, timezone_name=timezone_name)
        end_at = _coerce_utc(row.end_at, timezone_name=timezone_name)
        if start_at <= observed_at <= end_at:
            return row
        distance_seconds = min(
            abs((start_at - observed_at).total_seconds()),
            abs((end_at - observed_at).total_seconds()),
        )
        if distance_seconds <= 6 * 3600:
            candidates.append((distance_seconds, row))
    if not candidates:
        return None
    candidates.sort(key=lambda row: row[0])
    return candidates[0][1]


def _forecast_temperature_f(row: Optional[WeatherForecastPeriod]) -> Optional[float]:
    if row is None or row.temperature is None:
        return None
    unit = (row.temperature_unit or "F").strip().upper()
    if unit == "C":
        return _celsius_to_fahrenheit(row.temperature)
    return float(row.temperature)


def _celsius_to_fahrenheit(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return (float(value) * 9.0 / 5.0) + 32.0


def _degree_days(temperature_f: Optional[float], *, heating: bool) -> Optional[float]:
    if temperature_f is None:
        return None
    if heating:
        return max(HDD_CDD_BASE_TEMPERATURE_F - temperature_f, 0.0)
    return max(temperature_f - HDD_CDD_BASE_TEMPERATURE_F, 0.0)


def _coerce_utc(value: datetime, *, timezone_name: Optional[str]) -> datetime:
    if value.tzinfo is None:
        if timezone_name:
            try:
                return value.replace(tzinfo=ZoneInfo(timezone_name)).astimezone(timezone.utc)
            except ZoneInfoNotFoundError:
                pass
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hours_between(start: datetime, end: datetime) -> float:
    return max((end - start).total_seconds() / 3600.0, 0.0)


def _latest_datetime(values: list[datetime]) -> Optional[datetime]:
    if not values:
        return None
    return max(values)


def _average(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _round_optional(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(value, 1)


def _score_live_region_signal(
    *,
    seasonal_regime: str,
    region_code: str,
    current_temperature_f: Optional[float],
    forecast_average_temperature_f: Optional[float],
    temperature_trend_f: Optional[float],
    heating_degree_days_24h: Optional[float],
    cooling_degree_days_24h: Optional[float],
    max_precipitation_pct: float,
    has_storm_keywords: bool,
    forecast_bias_f: Optional[float],
    stale_count: int,
) -> tuple[int, int, int, str]:
    storm_score = 2 if max_precipitation_pct >= 60 or has_storm_keywords else 1 if max_precipitation_pct >= 30 else 0
    cold_build = temperature_trend_f is not None and temperature_trend_f <= -5
    warm_build = temperature_trend_f is not None and temperature_trend_f >= 5
    bias_watch = forecast_bias_f is not None and forecast_bias_f >= 4

    if seasonal_regime == "WINTER_HEATING":
        demand_score = 2 if (heating_degree_days_24h or 0) >= 25 or (current_temperature_f or 99) <= 32 or cold_build else 1 if (heating_degree_days_24h or 0) >= 10 or (current_temperature_f or 99) <= 45 else 0
        supply_score = 2 if region_code in {"ERCOT", "GULF_COAST"} and demand_score >= 1 else 1 if demand_score >= 1 or bias_watch else 0
        primary_driver = "Heating degree day build" if demand_score >= storm_score else "Storm and outage risk"
    elif seasonal_regime == "SUMMER_COOLING":
        demand_score = 2 if (cooling_degree_days_24h or 0) >= 15 or (current_temperature_f or 0) >= 90 or warm_build else 1 if (cooling_degree_days_24h or 0) >= 8 or (current_temperature_f or 0) >= 80 else 0
        supply_score = 2 if (region_code in {"ERCOT", "WEST"} and demand_score >= 1) or (region_code == "GULF_COAST" and storm_score >= 1) else 1 if demand_score >= 1 or bias_watch else 0
        primary_driver = "Cooling degree day load" if demand_score >= storm_score else "Storm disruption risk"
    else:
        swing_score = 2 if abs(temperature_trend_f or 0.0) >= 10 else 1 if abs(temperature_trend_f or 0.0) >= 5 or (heating_degree_days_24h or 0) >= 8 or (cooling_degree_days_24h or 0) >= 8 else 0
        demand_score = swing_score
        supply_score = 2 if storm_score == 2 else 1 if bias_watch or storm_score >= 1 else 0
        primary_driver = "Forecast swing risk" if swing_score >= storm_score else "Storm and maintenance risk"

    if storm_score >= 1:
        supply_score = max(supply_score, 1)
    if stale_count:
        primary_driver = "Data freshness watch"

    return min(demand_score, 2), min(supply_score, 2), min(storm_score, 2), primary_driver


def _build_live_region_narrative(
    *,
    seasonal_regime: str,
    location_count: int,
    current_temperature_f: Optional[float],
    forecast_average_temperature_f: Optional[float],
    temperature_trend_f: Optional[float],
    heating_degree_days_24h: Optional[float],
    cooling_degree_days_24h: Optional[float],
    max_precipitation_pct: float,
    forecast_bias_f: Optional[float],
    stale_count: int,
) -> str:
    fragments = [f"Live NWS blend across {location_count} tracked point{'s' if location_count != 1 else ''}."]
    if current_temperature_f is not None:
        fragments.append(f"Latest observed temperature is about {current_temperature_f:.0f}F.")
    if forecast_average_temperature_f is not None:
        fragments.append(f"Next-24h forecast average is {forecast_average_temperature_f:.0f}F.")
    if temperature_trend_f is not None and abs(temperature_trend_f) >= 1:
        direction = "colder" if temperature_trend_f < 0 else "warmer"
        fragments.append(f"The near-term trend is {abs(temperature_trend_f):.0f}F {direction}.")
    if seasonal_regime == "WINTER_HEATING" and heating_degree_days_24h is not None:
        fragments.append(f"Forecast HDD is running near {heating_degree_days_24h:.1f}.")
    if seasonal_regime == "SUMMER_COOLING" and cooling_degree_days_24h is not None:
        fragments.append(f"Forecast CDD is running near {cooling_degree_days_24h:.1f}.")
    if max_precipitation_pct >= 1:
        fragments.append(f"Maximum precipitation probability is {max_precipitation_pct:.0f}%.")
    if forecast_bias_f is not None:
        fragments.append(f"Average forecast bias is {forecast_bias_f:.1f}F.")
    if stale_count:
        fragments.append(f"{stale_count} tracked locations are stale and should be monitored.")
    return " ".join(fragments)


def _risk_label(score: int) -> str:
    return {0: "LOW", 1: "MEDIUM", 2: "HIGH"}[max(0, min(score, 2))]


def _risk_score_from_labels(row: dict) -> int:
    values = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    return (
        values.get(row.get("demand_risk"), 0) * 3
        + values.get(row.get("supply_risk"), 0) * 2
        + values.get(row.get("storm_risk"), 0) * 2
    )


def _build_live_freshness_phrase(live_weather_context: dict) -> str:
    fragments: list[str] = []
    if live_weather_context["average_observation_age_hours"] is not None:
        fragments.append(
            f"Observation freshness is about {live_weather_context['average_observation_age_hours']:.1f} hours"
        )
    if live_weather_context["average_forecast_age_hours"] is not None:
        fragments.append(
            f"forecast freshness is about {live_weather_context['average_forecast_age_hours']:.1f} hours"
        )
    if not fragments:
        return "Freshness metrics are not yet available."
    return " and ".join(fragments).capitalize() + "."


def _format_temperature_phrase(
    current_temperature_f: Optional[float],
    forecast_average_temperature_f: Optional[float],
    temperature_trend_f: Optional[float],
) -> str:
    fragments: list[str] = []
    if current_temperature_f is not None:
        fragments.append(f"roughly {current_temperature_f:.0f}F now")
    if forecast_average_temperature_f is not None:
        fragments.append(f"{forecast_average_temperature_f:.0f}F average over the next 24h")
    if temperature_trend_f is not None and abs(temperature_trend_f) >= 1:
        direction = "colder" if temperature_trend_f < 0 else "warmer"
        fragments.append(f"{abs(temperature_trend_f):.0f}F {direction} trend")
    if not fragments:
        return "live weather signals in scope"
    return ", ".join(fragments)
