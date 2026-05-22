from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from apps.api.app.config import settings

AISSTREAM_PROVIDER = "AISSTREAM"
DEFAULT_AISSTREAM_MESSAGE_TYPES = (
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
)


@dataclass(frozen=True, slots=True)
class AisstreamVesselSignal:
    source_system: str
    source_event_id: str | None
    signal_type: str
    occurred_at: datetime
    received_at: datetime
    latitude: float
    longitude: float
    speed_knots: float | None
    course_degrees: float | None
    heading_degrees: float | None
    destination: str | None
    eta_at_destination: datetime | None
    external_status: str | None
    normalized_status: str | None
    match_confidence: float
    raw_payload: dict[str, Any]
    listened_seconds: int


def _optional_float(value: object | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _optional_text(value: object | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _nested_get(payload: dict[str, Any], *keys: str) -> object | None:
    current: object = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _first_present(*values: object | None) -> object | None:
    for value in values:
        if value is not None:
            return value
    return None


def _message_body(payload: dict[str, Any]) -> dict[str, Any]:
    message_type = _optional_text(payload.get("MessageType")) or ""
    body = _nested_get(payload, "Message", message_type)
    return body if isinstance(body, dict) else {}


def _parse_datetime(value: object | None, *, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        normalized = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return fallback
    else:
        return fallback

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _navigation_status_label(value: object | None) -> str | None:
    status_text = _optional_text(value)
    if status_text is None:
        return None
    if not status_text.isdigit():
        return status_text.upper().replace(" ", "_")
    return {
        "0": "UNDER_WAY",
        "1": "AT_ANCHOR",
        "2": "NOT_UNDER_COMMAND",
        "3": "RESTRICTED_MANEUVERABILITY",
        "4": "CONSTRAINED_BY_DRAUGHT",
        "5": "MOORED",
        "6": "AGROUND",
        "7": "ENGAGED_IN_FISHING",
        "8": "SAILING",
        "15": "UNDEFINED",
    }.get(status_text, f"AIS_STATUS_{status_text}")


def _build_source_event_id(
    *,
    message_type: str,
    mmsi: str,
    occurred_at: datetime,
    latitude: float,
    longitude: float,
) -> str:
    return f"{message_type}:{mmsi}:{occurred_at.isoformat()}:{latitude:.5f}:{longitude:.5f}"


def aisstream_message_to_signal(
    payload: dict[str, Any],
    *,
    mmsi: str,
    received_at: datetime | None = None,
    listened_seconds: int = 0,
) -> AisstreamVesselSignal | None:
    reference_time = received_at or datetime.now(timezone.utc)
    metadata = payload.get("Metadata") if isinstance(payload.get("Metadata"), dict) else {}
    body = _message_body(payload)
    message_type = _optional_text(payload.get("MessageType")) or "PositionReport"
    matched_mmsi = (
        _optional_text(metadata.get("MMSI_String"))
        or _optional_text(metadata.get("MMSI"))
        or _optional_text(body.get("UserID"))
    )
    if matched_mmsi != mmsi:
        return None

    latitude = _optional_float(metadata.get("Latitude"))
    if latitude is None:
        latitude = _optional_float(body.get("Latitude"))
    longitude = _optional_float(metadata.get("Longitude"))
    if longitude is None:
        longitude = _optional_float(body.get("Longitude"))
    if latitude is None or longitude is None:
        return None

    occurred_at = _parse_datetime(
        metadata.get("time_utc")
        or metadata.get("Time_UTC")
        or metadata.get("Timestamp")
        or body.get("Timestamp"),
        fallback=reference_time,
    )
    speed_knots = _optional_float(_first_present(body.get("Sog"), body.get("SpeedOverGround")))
    course_degrees = _optional_float(_first_present(body.get("Cog"), body.get("CourseOverGround")))
    heading_degrees = _optional_float(_first_present(body.get("TrueHeading"), body.get("Heading")))
    destination = _optional_text(_first_present(body.get("Destination"), metadata.get("Destination")))
    eta_at_destination = None
    eta_value = _first_present(body.get("Eta"), body.get("ETA"), metadata.get("ETA"))
    if eta_value is not None:
        eta_at_destination = _parse_datetime(eta_value, fallback=reference_time)
    navigational_status = _first_present(body.get("NavigationalStatus"), metadata.get("NavigationalStatus"))
    normalized_status = _navigation_status_label(navigational_status)
    external_status = _optional_text(navigational_status)

    return AisstreamVesselSignal(
        source_system=AISSTREAM_PROVIDER,
        source_event_id=_build_source_event_id(
            message_type=message_type,
            mmsi=mmsi,
            occurred_at=occurred_at,
            latitude=latitude,
            longitude=longitude,
        ),
        signal_type="POSITION",
        occurred_at=occurred_at,
        received_at=reference_time,
        latitude=latitude,
        longitude=longitude,
        speed_knots=speed_knots,
        course_degrees=course_degrees,
        heading_degrees=heading_degrees,
        destination=destination,
        eta_at_destination=eta_at_destination,
        external_status=external_status,
        normalized_status=normalized_status,
        match_confidence=1.0,
        raw_payload={
            "provider": AISSTREAM_PROVIDER,
            "message_type": message_type,
            "metadata": metadata,
            "message": payload.get("Message", {}),
        },
        listened_seconds=listened_seconds,
    )


async def _fetch_aisstream_vessel_signal_async(
    *,
    mmsi: str,
    api_key: str,
    websocket_url: str,
    timeout_seconds: int,
) -> AisstreamVesselSignal:
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("The websockets package is required for AISStream vessel refresh.") from exc

    subscription_message = {
        "Apikey": api_key,
        "BoundingBoxes": [[[-90, -180], [90, 180]]],
        "FiltersShipMMSI": [mmsi],
        "FilterMessageTypes": list(DEFAULT_AISSTREAM_MESSAGE_TYPES),
    }
    started_at = datetime.now(timezone.utc)
    try:
        async with websockets.connect(websocket_url) as websocket:
            await websocket.send(json.dumps(subscription_message))
            while True:
                elapsed_seconds = int((datetime.now(timezone.utc) - started_at).total_seconds())
                remaining_seconds = max(0.1, timeout_seconds - elapsed_seconds)
                raw_message = await asyncio.wait_for(websocket.recv(), timeout=remaining_seconds)
                try:
                    payload = json.loads(raw_message)
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict):
                    continue
                signal = aisstream_message_to_signal(
                    payload,
                    mmsi=mmsi,
                    received_at=datetime.now(timezone.utc),
                    listened_seconds=elapsed_seconds,
                )
                if signal is not None:
                    return signal
                if elapsed_seconds >= timeout_seconds:
                    break
    except TimeoutError as exc:
        raise TimeoutError(
            f"AISStream did not return a position for MMSI {mmsi} within {timeout_seconds} seconds."
        ) from exc

    raise TimeoutError(f"AISStream did not return a position for MMSI {mmsi} within {timeout_seconds} seconds.")


def fetch_aisstream_vessel_signal(
    *,
    mmsi: str,
    timeout_seconds: int | None = None,
) -> AisstreamVesselSignal:
    if not settings.AISSTREAM_API_KEY:
        raise ValueError("AISSTREAM_API_KEY is not configured.")
    normalized_timeout = timeout_seconds or settings.AISSTREAM_REFRESH_TIMEOUT_SECONDS
    return asyncio.run(
        _fetch_aisstream_vessel_signal_async(
            mmsi=mmsi,
            api_key=settings.AISSTREAM_API_KEY,
            websocket_url=settings.AISSTREAM_URL,
            timeout_seconds=normalized_timeout,
        )
    )
