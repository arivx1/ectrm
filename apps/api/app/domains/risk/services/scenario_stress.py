from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Mapping

from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.pnl_history import build_pnl_history_report
from apps.api.app.domains.risk.services.position_as_of import build_position_as_of_report

ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
SCENARIO_STRESS_BASIS_V1 = "risk_scenario_stress_v1"
SCENARIO_STRESS_ACTION_SCOPE_READ_ONLY = "READ_ONLY_NO_EXECUTION"
SCENARIO_STRESS_METHODOLOGY = (
    "Scenario stress v1 is a read-only overlay on governed risk outputs. Trade MTM starts from "
    "the P&L report valued with official marks, and position impacts start from the position "
    "as-of event replay. Flat-price and basis shocks move market-linked marks, volume shocks "
    "scale quantities and position rows, and delivery-disruption shocks flag overlapping "
    "position tenors. The report records missing evidence instead of inventing prices, tenors, "
    "or executable hedge actions."
)
SHOCK_TYPE_FLAT_PRICE = "FLAT_PRICE"
SHOCK_TYPE_BASIS = "BASIS"
SHOCK_TYPE_VOLUME = "VOLUME"
SHOCK_TYPE_DELIVERY_DISRUPTION = "DELIVERY_DISRUPTION"
SUPPORTED_SHOCK_TYPES = {
    SHOCK_TYPE_FLAT_PRICE,
    SHOCK_TYPE_BASIS,
    SHOCK_TYPE_VOLUME,
    SHOCK_TYPE_DELIVERY_DISRUPTION,
}
MARKET_LINKED_PRICING_TYPES = {"INDEX", "HYBRID"}


@dataclass(frozen=True)
class ScenarioShock:
    shock_type: str
    label: str | None = None
    price_delta: Decimal | float | int | str | None = None
    basis_delta: Decimal | float | int | str | None = None
    volume_multiplier: Decimal | float | int | str | None = None
    volume_delta_percent: Decimal | float | int | str | None = None
    remaining_volume_multiplier: Decimal | float | int | str | None = None
    delivery_start: date | datetime | str | None = None
    delivery_end: date | datetime | str | None = None
    book: str | None = None
    portfolio: str | None = None
    commodity_class: str | None = None
    location_code: str | None = None
    pricing_type: str | None = None
    price_index_code: str | None = None
    trade_nature: str | None = None


def run_scenario_stress(
    db: Session,
    *,
    scenario_name: str,
    shocks: list[ScenarioShock | Mapping[str, Any]],
    as_of: date | datetime | None = None,
    book: str | None = None,
    portfolio: str | None = None,
    commodity_class: str | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    resolved_as_of = _coerce_date(as_of, default=generated_at.date())
    normalized_shocks = [_normalize_shock(shock, index=index) for index, shock in enumerate(shocks, start=1)]

    pnl_report = build_pnl_history_report(
        db,
        as_of=resolved_as_of,
        book=book,
        portfolio=portfolio,
        commodity_class=commodity_class,
    )
    position_report = build_position_as_of_report(
        db,
        as_of=resolved_as_of,
        book=book,
        portfolio=portfolio,
        commodity_class=commodity_class,
    )

    missing_evidence: list[dict[str, Any]] = []
    trade_impacts = _build_trade_impacts(
        valuations=list(pnl_report.get("valuations") or []),
        shocks=normalized_shocks,
        missing_evidence=missing_evidence,
    )
    position_impacts = _build_position_impacts(
        rows=list(position_report.get("rows") or []),
        shocks=normalized_shocks,
        missing_evidence=missing_evidence,
    )

    base_total_pnl = Decimal(str((pnl_report.get("summary") or {}).get("total_pnl") or 0))
    total_mtm_delta = sum((_decimal(row.get("mtm_delta")) or ZERO for row in trade_impacts), ZERO)
    stressed_total_pnl = base_total_pnl + total_mtm_delta

    return {
        "generated_at": generated_at,
        "as_of": resolved_as_of,
        "scenario_name": scenario_name.strip() or "Scenario Stress",
        "basis": SCENARIO_STRESS_BASIS_V1,
        "methodology": SCENARIO_STRESS_METHODOLOGY,
        "action_scope": SCENARIO_STRESS_ACTION_SCOPE_READ_ONLY,
        "execution_scope": SCENARIO_STRESS_ACTION_SCOPE_READ_ONLY,
        "source_reports": {
            "pnl_basis": pnl_report.get("basis"),
            "position_basis": position_report.get("basis"),
        },
        "shocks": [_serialize_shock(shock) for shock in normalized_shocks],
        "summary": {
            "base_total_pnl": float(base_total_pnl),
            "stressed_total_pnl": float(stressed_total_pnl),
            "total_mtm_delta": float(total_mtm_delta),
            "affected_trade_count": len(trade_impacts),
            "affected_position_count": len(position_impacts),
            "missing_evidence_count": len(missing_evidence),
            "shock_count": len(normalized_shocks),
        },
        "trade_impacts": trade_impacts,
        "position_impacts": position_impacts,
        "missing_evidence": missing_evidence,
    }


def _build_trade_impacts(
    *,
    valuations: list[dict[str, Any]],
    shocks: list[ScenarioShock],
    missing_evidence: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    impacts: list[dict[str, Any]] = []
    for valuation in valuations:
        matching_shocks = [shock for shock in shocks if _valuation_matches_shock(valuation, shock)]
        if not matching_shocks:
            continue

        trade_id = str(valuation.get("trade_id") or "")
        if not bool(valuation.get("included_in_totals")):
            for shock in matching_shocks:
                missing_evidence.append(
                    _missing_trade_evidence(
                        valuation,
                        shock=shock,
                        reason=str(valuation.get("valuation_status_reason") or valuation.get("valuation_status") or "Trade is not valued."),
                    )
                )
            continue

        base_quantity = _decimal(valuation.get("quantity"))
        base_effective_mark = _decimal(valuation.get("effective_mark"))
        base_pnl = _decimal(valuation.get("pnl_contribution"))
        direction = Decimal(str(int(valuation.get("direction") or 0)))
        if base_quantity is None or base_effective_mark is None or base_pnl is None or direction == ZERO:
            for shock in matching_shocks:
                missing_evidence.append(
                    _missing_trade_evidence(
                        valuation,
                        shock=shock,
                        reason="Scenario math requires quantity, effective mark, and signed direction.",
                    )
                )
            continue

        stressed_quantity = base_quantity
        stressed_effective_mark = base_effective_mark
        applied_shocks: list[dict[str, Any]] = []
        for shock in matching_shocks:
            if shock.shock_type in {SHOCK_TYPE_FLAT_PRICE, SHOCK_TYPE_BASIS}:
                mark_delta = _price_delta_for_shock(shock)
                if mark_delta == ZERO:
                    continue
                stressed_effective_mark += mark_delta
                applied_shocks.append(
                    {
                        "shock_type": shock.shock_type,
                        "label": shock.label,
                        "mark_delta": float(mark_delta),
                    }
                )
            elif shock.shock_type == SHOCK_TYPE_VOLUME:
                multiplier = _volume_multiplier_for_shock(shock)
                stressed_quantity *= multiplier
                applied_shocks.append(
                    {
                        "shock_type": shock.shock_type,
                        "label": shock.label,
                        "volume_multiplier": float(multiplier),
                    }
                )

        if not applied_shocks:
            continue

        stressed_pnl = stressed_effective_mark * stressed_quantity * direction
        mtm_delta = stressed_pnl - base_pnl
        impacts.append(
            {
                "trade_id": trade_id,
                "book": valuation.get("book"),
                "portfolio": valuation.get("portfolio"),
                "commodity_class": valuation.get("commodity_class"),
                "pricing_type": valuation.get("pricing_type"),
                "price_index_code": valuation.get("price_index_code"),
                "pnl_bucket": valuation.get("pnl_bucket"),
                "base_quantity": float(base_quantity),
                "stressed_quantity": float(stressed_quantity),
                "base_effective_mark": float(base_effective_mark),
                "stressed_effective_mark": float(stressed_effective_mark),
                "base_pnl": float(base_pnl),
                "stressed_pnl": float(stressed_pnl),
                "mtm_delta": float(mtm_delta),
                "mark_evidence": valuation.get("mark_evidence"),
                "applied_shocks": applied_shocks,
            }
        )

    impacts.sort(key=lambda row: (-abs(float(row.get("mtm_delta") or 0)), str(row.get("trade_id") or "")))
    return impacts


def _build_position_impacts(
    *,
    rows: list[dict[str, Any]],
    shocks: list[ScenarioShock],
    missing_evidence: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    impacts: list[dict[str, Any]] = []
    for row in rows:
        matching_shocks = [shock for shock in shocks if _position_matches_shock(row, shock)]
        if not matching_shocks:
            continue

        base_net_volume = _decimal(row.get("net_volume")) or ZERO
        stressed_net_volume = base_net_volume
        delivery_disrupted = False
        applied_shocks: list[dict[str, Any]] = []
        for shock in matching_shocks:
            if shock.shock_type == SHOCK_TYPE_VOLUME:
                multiplier = _volume_multiplier_for_shock(shock)
                stressed_net_volume *= multiplier
                applied_shocks.append(
                    {
                        "shock_type": shock.shock_type,
                        "label": shock.label,
                        "volume_multiplier": float(multiplier),
                    }
                )
            elif shock.shock_type == SHOCK_TYPE_DELIVERY_DISRUPTION:
                tenor_start = _coerce_date(row.get("tenor_start"))
                tenor_end = _coerce_date(row.get("tenor_end"))
                if tenor_start is None or tenor_end is None:
                    missing_evidence.append(
                        {
                            "entity_type": "POSITION",
                            "entity_id": _position_row_key(row),
                            "severity": "BLOCKING",
                            "reason": "Delivery disruption stress requires position tenor start and end dates.",
                            "shock_type": shock.shock_type,
                            "shock_label": shock.label,
                        }
                    )
                    continue
                if not _delivery_window_overlaps_position(shock, tenor_start=tenor_start, tenor_end=tenor_end):
                    continue
                multiplier = _remaining_volume_multiplier_for_delivery_shock(shock)
                stressed_net_volume *= multiplier
                delivery_disrupted = True
                applied_shocks.append(
                    {
                        "shock_type": shock.shock_type,
                        "label": shock.label,
                        "remaining_volume_multiplier": float(multiplier),
                        "delivery_start": _coerce_date(shock.delivery_start),
                        "delivery_end": _coerce_date(shock.delivery_end),
                    }
                )

        if not applied_shocks:
            continue

        volume_delta = stressed_net_volume - base_net_volume
        impacts.append(
            {
                "position_key": _position_row_key(row),
                "book": row.get("book"),
                "portfolio": row.get("portfolio"),
                "commodity_class": row.get("commodity_class"),
                "commodity": row.get("commodity"),
                "location_code": row.get("location_code"),
                "tenor_start": row.get("tenor_start"),
                "tenor_end": row.get("tenor_end"),
                "trade_nature": row.get("trade_nature"),
                "pricing_type": row.get("pricing_type"),
                "price_index_code": row.get("price_index_code"),
                "price_basis": row.get("price_basis"),
                "quantity_unit_code": row.get("quantity_unit_code"),
                "contributing_trade_ids": list(row.get("contributing_trade_ids") or []),
                "base_net_volume": float(base_net_volume),
                "stressed_net_volume": float(stressed_net_volume),
                "volume_delta": float(volume_delta),
                "delivery_disrupted": delivery_disrupted,
                "source_basis": row.get("source_basis"),
                "applied_shocks": applied_shocks,
            }
        )

    impacts.sort(key=lambda row: (-abs(float(row.get("volume_delta") or 0)), str(row.get("position_key") or "")))
    return impacts


def _normalize_shock(shock: ScenarioShock | Mapping[str, Any], *, index: int) -> ScenarioShock:
    if isinstance(shock, ScenarioShock):
        raw = shock
    else:
        raw = ScenarioShock(**dict(shock))

    normalized_type = _normalize_code(raw.shock_type)
    if normalized_type not in SUPPORTED_SHOCK_TYPES:
        raise ValueError(f"Unsupported scenario shock type: {raw.shock_type}")
    return ScenarioShock(
        shock_type=normalized_type,
        label=raw.label or f"Shock {index}",
        price_delta=_decimal(raw.price_delta),
        basis_delta=_decimal(raw.basis_delta),
        volume_multiplier=_decimal(raw.volume_multiplier),
        volume_delta_percent=_decimal(raw.volume_delta_percent),
        remaining_volume_multiplier=_decimal(raw.remaining_volume_multiplier),
        delivery_start=_coerce_date(raw.delivery_start),
        delivery_end=_coerce_date(raw.delivery_end),
        book=_normalize_code(raw.book),
        portfolio=_normalize_code(raw.portfolio),
        commodity_class=_normalize_code(raw.commodity_class),
        location_code=_normalize_code(raw.location_code),
        pricing_type=_normalize_code(raw.pricing_type),
        price_index_code=_normalize_code(raw.price_index_code),
        trade_nature=_normalize_code(raw.trade_nature),
    )


def _valuation_matches_shock(valuation: dict[str, Any], shock: ScenarioShock) -> bool:
    if shock.shock_type == SHOCK_TYPE_DELIVERY_DISRUPTION:
        return False
    if _normalize_code(valuation.get("pnl_bucket")) == "REALIZED":
        return False
    if shock.book and _normalize_code(valuation.get("book")) != shock.book:
        return False
    if shock.portfolio and _normalize_code(valuation.get("portfolio")) != shock.portfolio:
        return False
    if shock.commodity_class and _normalize_code(valuation.get("commodity_class")) != shock.commodity_class:
        return False
    if shock.pricing_type and _normalize_code(valuation.get("pricing_type")) != shock.pricing_type:
        return False
    if shock.price_index_code and _normalize_code(valuation.get("price_index_code")) != shock.price_index_code:
        return False
    if shock.shock_type in {SHOCK_TYPE_FLAT_PRICE, SHOCK_TYPE_BASIS}:
        return _normalize_code(valuation.get("pricing_type")) in MARKET_LINKED_PRICING_TYPES
    return shock.shock_type == SHOCK_TYPE_VOLUME


def _position_matches_shock(row: dict[str, Any], shock: ScenarioShock) -> bool:
    if shock.shock_type in {SHOCK_TYPE_FLAT_PRICE, SHOCK_TYPE_BASIS}:
        return False
    if shock.book and _normalize_code(row.get("book")) != shock.book:
        return False
    if shock.portfolio and _normalize_code(row.get("portfolio")) != shock.portfolio:
        return False
    if shock.commodity_class and _normalize_code(row.get("commodity_class")) != shock.commodity_class:
        return False
    if shock.location_code and _normalize_code(row.get("location_code")) != shock.location_code:
        return False
    if shock.pricing_type and _normalize_code(row.get("pricing_type")) != shock.pricing_type:
        return False
    if shock.price_index_code and _normalize_code(row.get("price_index_code")) != shock.price_index_code:
        return False
    if shock.trade_nature and _normalize_code(row.get("trade_nature")) != shock.trade_nature:
        return False
    return shock.shock_type in {SHOCK_TYPE_VOLUME, SHOCK_TYPE_DELIVERY_DISRUPTION}


def _missing_trade_evidence(
    valuation: dict[str, Any],
    *,
    shock: ScenarioShock,
    reason: str,
) -> dict[str, Any]:
    return {
        "entity_type": "TRADE",
        "entity_id": valuation.get("trade_id"),
        "severity": "BLOCKING",
        "reason": reason,
        "valuation_status": valuation.get("valuation_status"),
        "shock_type": shock.shock_type,
        "shock_label": shock.label,
        "price_index_code": valuation.get("price_index_code"),
        "mark_evidence": valuation.get("mark_evidence"),
    }


def _serialize_shock(shock: ScenarioShock) -> dict[str, Any]:
    return {
        "shock_type": shock.shock_type,
        "label": shock.label,
        "price_delta": _float_or_none(shock.price_delta),
        "basis_delta": _float_or_none(shock.basis_delta),
        "volume_multiplier": _float_or_none(shock.volume_multiplier),
        "volume_delta_percent": _float_or_none(shock.volume_delta_percent),
        "remaining_volume_multiplier": _float_or_none(shock.remaining_volume_multiplier),
        "delivery_start": shock.delivery_start,
        "delivery_end": shock.delivery_end,
        "book": shock.book,
        "portfolio": shock.portfolio,
        "commodity_class": shock.commodity_class,
        "location_code": shock.location_code,
        "pricing_type": shock.pricing_type,
        "price_index_code": shock.price_index_code,
        "trade_nature": shock.trade_nature,
    }


def _price_delta_for_shock(shock: ScenarioShock) -> Decimal:
    if shock.shock_type == SHOCK_TYPE_BASIS:
        return _decimal(shock.basis_delta) or _decimal(shock.price_delta) or ZERO
    return _decimal(shock.price_delta) or ZERO


def _volume_multiplier_for_shock(shock: ScenarioShock) -> Decimal:
    multiplier = _decimal(shock.volume_multiplier)
    if multiplier is not None:
        return multiplier
    percent = _decimal(shock.volume_delta_percent)
    if percent is None:
        return ONE
    return ONE + (percent / HUNDRED)


def _remaining_volume_multiplier_for_delivery_shock(shock: ScenarioShock) -> Decimal:
    multiplier = _decimal(shock.remaining_volume_multiplier)
    return multiplier if multiplier is not None else ZERO


def _delivery_window_overlaps_position(
    shock: ScenarioShock,
    *,
    tenor_start: date,
    tenor_end: date,
) -> bool:
    delivery_start = _coerce_date(shock.delivery_start) or date.min
    delivery_end = _coerce_date(shock.delivery_end) or date.max
    return tenor_start <= delivery_end and tenor_end >= delivery_start


def _position_row_key(row: dict[str, Any]) -> str:
    parts = [
        row.get("book"),
        row.get("portfolio"),
        row.get("commodity_class"),
        row.get("commodity"),
        row.get("location_code"),
        row.get("tenor_start"),
        row.get("tenor_end"),
        row.get("price_basis"),
        row.get("side"),
    ]
    return "|".join(str(part or "") for part in parts)


def _normalize_code(value: object | None) -> str | None:
    normalized = str(value or "").strip().upper()
    return normalized or None


def _decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _float_or_none(value: object | None) -> float | None:
    decimal_value = _decimal(value)
    return float(decimal_value) if decimal_value is not None else None


def _coerce_date(value: object | None, *, default: date | None = None) -> date | None:
    if value is None:
        return default
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return default
    return date.fromisoformat(text)
