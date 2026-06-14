from __future__ import annotations

from collections.abc import Iterable

from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.shared.enums import TransportMode

CONFIGURABLE_TRANSPORT_MODES = tuple(
    mode for mode in TransportMode if mode != TransportMode.UNSPECIFIED
)

DEFAULT_ALLOWED_TRANSPORT_MODES_BY_COMMODITY_CODE: dict[str, tuple[TransportMode, ...]] = {
    "POWER": (TransportMode.POWER_GRID,),
    "REC": (TransportMode.POWER_GRID,),
    "GOLD": (
        TransportMode.AIR,
        TransportMode.TRUCK,
        TransportMode.RAIL,
    ),
    "COAL": (
        TransportMode.TRUCK,
        TransportMode.RAIL,
        TransportMode.BARGE,
        TransportMode.VESSEL,
    ),
    "LNG": (
        TransportMode.TRUCK,
        TransportMode.RAIL,
        TransportMode.BARGE,
        TransportMode.VESSEL,
    ),
}

DEFAULT_ALLOWED_TRANSPORT_MODES_BY_COMMODITY_CLASS: dict[str, tuple[TransportMode, ...]] = {
    "POWER": (TransportMode.POWER_GRID,),
    "NATURAL_GAS": (TransportMode.PIPELINE,),
    "CRUDE_OIL": (
        TransportMode.PIPELINE,
        TransportMode.TRUCK,
        TransportMode.RAIL,
        TransportMode.BARGE,
        TransportMode.VESSEL,
    ),
    "REFINED_PRODUCTS": (
        TransportMode.PIPELINE,
        TransportMode.TRUCK,
        TransportMode.RAIL,
        TransportMode.BARGE,
        TransportMode.VESSEL,
    ),
    "NGL": (
        TransportMode.PIPELINE,
        TransportMode.TRUCK,
        TransportMode.RAIL,
        TransportMode.BARGE,
        TransportMode.VESSEL,
    ),
    "COAL": (
        TransportMode.TRUCK,
        TransportMode.RAIL,
        TransportMode.BARGE,
        TransportMode.VESSEL,
    ),
    "PRECIOUS_METALS": (
        TransportMode.AIR,
        TransportMode.TRUCK,
        TransportMode.RAIL,
    ),
    "ENVIRONMENTAL": (TransportMode.STORAGE,),
}

FALLBACK_ALLOWED_TRANSPORT_MODES: tuple[TransportMode, ...] = (
    TransportMode.AIR,
    TransportMode.TRUCK,
    TransportMode.RAIL,
    TransportMode.BARGE,
    TransportMode.VESSEL,
    TransportMode.STORAGE,
)


def default_allowed_transport_modes(
    *,
    commodity_code: str | None,
    commodity_class: str | None,
) -> list[str]:
    normalized_code = normalize_code(commodity_code) if commodity_code else ""
    normalized_class = normalize_code(commodity_class) if commodity_class else ""
    configured_modes = DEFAULT_ALLOWED_TRANSPORT_MODES_BY_COMMODITY_CODE.get(normalized_code)
    if configured_modes is None:
        configured_modes = DEFAULT_ALLOWED_TRANSPORT_MODES_BY_COMMODITY_CLASS.get(
            normalized_class,
            FALLBACK_ALLOWED_TRANSPORT_MODES,
        )
    return [mode.value for mode in configured_modes]


def normalize_allowed_transport_modes(
    raw_values: Iterable[str] | None,
    *,
    commodity_code: str | None,
    commodity_class: str | None,
) -> list[str]:
    if raw_values is None:
        return default_allowed_transport_modes(
            commodity_code=commodity_code,
            commodity_class=commodity_class,
        )

    normalized_modes: list[str] = []
    seen: set[str] = set()
    for raw_value in raw_values:
        normalized_value = normalize_code(str(raw_value or ""))
        if not normalized_value:
            continue
        try:
            transport_mode = TransportMode(normalized_value)
        except ValueError as exc:
            valid_values = ", ".join(mode.value for mode in CONFIGURABLE_TRANSPORT_MODES)
            raise ValueError(
                f"Allowed transport mode '{normalized_value}' is invalid. Expected one of: {valid_values}."
            ) from exc
        if transport_mode == TransportMode.UNSPECIFIED:
            raise ValueError("Allowed transport modes cannot include UNSPECIFIED.")
        if transport_mode.value in seen:
            continue
        seen.add(transport_mode.value)
        normalized_modes.append(transport_mode.value)

    if normalized_modes:
        return normalized_modes

    return default_allowed_transport_modes(
        commodity_code=commodity_code,
        commodity_class=commodity_class,
    )


def is_transport_mode_allowed(
    transport_mode: TransportMode,
    *,
    allowed_transport_modes: Iterable[str] | None,
) -> bool:
    if transport_mode == TransportMode.UNSPECIFIED:
        return True
    normalized_allowed_modes = {
        normalize_code(str(value or ""))
        for value in (allowed_transport_modes or [])
        if str(value or "").strip()
    }
    return transport_mode.value in normalized_allowed_modes
