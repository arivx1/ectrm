from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import re
from typing import Iterable, Optional

from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.trade import Trade

FIELD_LABELS: dict[str, str] = {
    "trade_date": "Trade Date",
    "counterparty": "Counterparty",
    "trade_side": "Side",
    "commodity": "Commodity",
    "volume": "Volume",
    "unit_of_measure": "Unit",
    "price": "Price",
    "price_unit_code": "Price Unit",
    "delivery_window": "Delivery Window",
    "location_code": "Location",
    "option_type": "Option Type",
    "option_style": "Option Style",
    "option_strike_price": "Strike Price",
    "option_expiration_date": "Option Expiration",
}

TERM_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "trade_side": ("trade side", "side", "buy sell", "buy/sell", "direction"),
    "commodity": ("commodity", "product", "grade"),
    "volume": ("volume", "quantity", "contract volume", "total quantity"),
    "unit_of_measure": ("unit", "uom", "unit of measure", "quantity unit"),
    "price": ("price", "trade price", "fixed price", "contract price"),
    "price_unit_code": ("price unit", "price unit code", "price basis", "price per"),
    "delivery_window": ("delivery window", "delivery period", "delivery dates", "delivery range"),
    "delivery_start": ("delivery start", "start date", "delivery start date"),
    "delivery_end": ("delivery end", "end date", "delivery end date"),
    "location_code": ("location", "delivery point", "delivery location", "point"),
    "option_type": ("option type",),
    "option_style": ("option style",),
    "option_strike_price": ("strike", "strike price"),
    "option_expiration_date": ("option expiration", "option expiration date", "expiration", "expiration date"),
}

NUMBER_PATTERN = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


@dataclass(slots=True)
class TradeConfirmationMismatch:
    field_key: str
    label: str
    mismatch_type: str
    expected_value: str | None
    actual_value: str | None
    blocking: bool = True


@dataclass(slots=True)
class TradeConfirmationComparisonResult:
    comparison_status: str
    mismatches: list[TradeConfirmationMismatch] = field(default_factory=list)

    @property
    def blocking_mismatch_count(self) -> int:
        return sum(1 for mismatch in self.mismatches if mismatch.blocking)

    @property
    def has_blocking_mismatches(self) -> bool:
        return self.blocking_mismatch_count > 0


def _normalize_alias(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()
    return normalized


def _normalize_text(value: object | None) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = re.sub(r"[^A-Z0-9]+", "", raw.upper())
    return normalized or None


def _format_date(value: date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _format_decimal(value: object | None) -> str | None:
    if value is None:
        return None
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return str(value)
    normalized = decimal_value.normalize()
    return format(normalized, "f")


def _parse_decimal(value: object | None) -> Decimal | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    match = NUMBER_PATTERN.search(raw.replace("(", "-").replace(")", ""))
    if match is None:
        return None
    try:
        return Decimal(match.group(0).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(value: object | None) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    iso_candidate = raw[:10]
    try:
        return date.fromisoformat(iso_candidate)
    except ValueError:
        pass

    for pattern in ("%m/%d/%Y", "%m-%d-%Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    return None


def _parse_date_range(value: object | None) -> tuple[date | None, date | None]:
    raw = str(value or "").strip()
    if not raw:
        return None, None

    for separator in (" to ", " through ", " thru ", " - "):
        if separator in raw:
            left, right = raw.split(separator, 1)
            return _parse_date(left), _parse_date(right)
    return _parse_date(raw), None


def _extract_unit_hint(value: object | None) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    parts = re.split(r"[/\s]+", raw.upper())
    for part in reversed(parts):
        candidate = re.sub(r"[^A-Z0-9]+", "", part)
        if len(candidate) >= 2 and not candidate.isdigit():
            return candidate
    return None


def _header_field_map(pages: Iterable[DocumentIngestionPage]) -> dict[str, str]:
    values: dict[str, str] = {}
    for page in pages:
        if page.document_kind != "TRADE_CONFIRMATION" or page.review_status != "REVIEWED":
            continue
        for raw_field in page.header_fields or []:
            field_key = str(raw_field.get("field_key") or "").strip().lower()
            field_value = str(raw_field.get("value") or "").strip()
            if field_key and field_value and field_key not in values:
                values[field_key] = field_value
    return values


def _economic_term_map(pages: Iterable[DocumentIngestionPage]) -> dict[str, str]:
    values: dict[str, str] = {}
    alias_lookup = {
        _normalize_alias(alias): field_key
        for field_key, aliases in TERM_FIELD_ALIASES.items()
        for alias in aliases
    }
    for page in pages:
        if page.document_kind != "TRADE_CONFIRMATION" or page.review_status != "REVIEWED":
            continue
        for raw_table in page.table_blocks or []:
            rows = raw_table.get("rows") or []
            for raw_row in rows:
                if not isinstance(raw_row, dict):
                    continue
                term_name = str(raw_row.get("term_name") or raw_row.get("name") or "").strip()
                term_value = str(raw_row.get("term_value") or raw_row.get("value") or "").strip()
                canonical_key = alias_lookup.get(_normalize_alias(term_name))
                if canonical_key and term_value and canonical_key not in values:
                    values[canonical_key] = term_value
    return values


def _append_missing_or_mismatch(
    mismatches: list[TradeConfirmationMismatch],
    *,
    field_key: str,
    expected_value: str | None,
    actual_value: str | None,
    expected_normalized: str | None,
    actual_normalized: str | None,
) -> None:
    if expected_value is None:
        return
    if actual_value is None:
        mismatches.append(
            TradeConfirmationMismatch(
                field_key=field_key,
                label=FIELD_LABELS[field_key],
                mismatch_type="MISSING_DOCUMENT_VALUE",
                expected_value=expected_value,
                actual_value=None,
            )
        )
        return
    if expected_normalized != actual_normalized:
        mismatches.append(
            TradeConfirmationMismatch(
                field_key=field_key,
                label=FIELD_LABELS[field_key],
                mismatch_type="VALUE_MISMATCH",
                expected_value=expected_value,
                actual_value=actual_value,
            )
        )


def build_trade_confirmation_comparison(
    *,
    trade: Trade,
    confirmation_pages: list[DocumentIngestionPage],
    comparison_waiver_note: str | None = None,
) -> TradeConfirmationComparisonResult:
    if not confirmation_pages:
        return TradeConfirmationComparisonResult(comparison_status="MANUAL")

    header_fields = _header_field_map(confirmation_pages)
    economic_terms = _economic_term_map(confirmation_pages)
    mismatches: list[TradeConfirmationMismatch] = []

    _append_missing_or_mismatch(
        mismatches,
        field_key="trade_date",
        expected_value=_format_date(trade.trade_date),
        actual_value=header_fields.get("trade_date"),
        expected_normalized=_format_date(trade.trade_date),
        actual_normalized=_format_date(_parse_date(header_fields.get("trade_date"))),
    )
    _append_missing_or_mismatch(
        mismatches,
        field_key="counterparty",
        expected_value=trade.counterparty,
        actual_value=header_fields.get("counterparty"),
        expected_normalized=_normalize_text(trade.counterparty),
        actual_normalized=_normalize_text(header_fields.get("counterparty")),
    )
    _append_missing_or_mismatch(
        mismatches,
        field_key="trade_side",
        expected_value=trade.trade_side,
        actual_value=economic_terms.get("trade_side"),
        expected_normalized=_normalize_text(trade.trade_side),
        actual_normalized=_normalize_text(economic_terms.get("trade_side")),
    )
    _append_missing_or_mismatch(
        mismatches,
        field_key="commodity",
        expected_value=trade.commodity,
        actual_value=economic_terms.get("commodity"),
        expected_normalized=_normalize_text(trade.commodity),
        actual_normalized=_normalize_text(economic_terms.get("commodity")),
    )

    volume_value = economic_terms.get("volume")
    expected_volume = _parse_decimal(trade.volume)
    actual_volume = _parse_decimal(volume_value)
    if expected_volume is not None:
        if volume_value is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="volume",
                    label=FIELD_LABELS["volume"],
                    mismatch_type="MISSING_DOCUMENT_VALUE",
                    expected_value=_format_decimal(trade.volume),
                    actual_value=None,
                )
            )
        elif actual_volume is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="volume",
                    label=FIELD_LABELS["volume"],
                    mismatch_type="UNPARSEABLE_DOCUMENT_VALUE",
                    expected_value=_format_decimal(trade.volume),
                    actual_value=volume_value,
                )
            )
        elif expected_volume != actual_volume:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="volume",
                    label=FIELD_LABELS["volume"],
                    mismatch_type="VALUE_MISMATCH",
                    expected_value=_format_decimal(trade.volume),
                    actual_value=volume_value,
                )
            )

    explicit_unit_value = economic_terms.get("unit_of_measure")
    derived_unit_value = explicit_unit_value or _extract_unit_hint(volume_value)
    _append_missing_or_mismatch(
        mismatches,
        field_key="unit_of_measure",
        expected_value=trade.unit_of_measure,
        actual_value=derived_unit_value,
        expected_normalized=_normalize_text(trade.unit_of_measure),
        actual_normalized=_normalize_text(derived_unit_value),
    )

    price_value = economic_terms.get("price")
    expected_price = _parse_decimal(trade.price)
    actual_price = _parse_decimal(price_value)
    if expected_price is not None:
        if price_value is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="price",
                    label=FIELD_LABELS["price"],
                    mismatch_type="MISSING_DOCUMENT_VALUE",
                    expected_value=_format_decimal(trade.price),
                    actual_value=None,
                )
            )
        elif actual_price is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="price",
                    label=FIELD_LABELS["price"],
                    mismatch_type="UNPARSEABLE_DOCUMENT_VALUE",
                    expected_value=_format_decimal(trade.price),
                    actual_value=price_value,
                )
            )
        elif expected_price != actual_price:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="price",
                    label=FIELD_LABELS["price"],
                    mismatch_type="VALUE_MISMATCH",
                    expected_value=_format_decimal(trade.price),
                    actual_value=price_value,
                )
            )

    explicit_price_unit_value = economic_terms.get("price_unit_code")
    derived_price_unit_value = explicit_price_unit_value or _extract_unit_hint(price_value)
    _append_missing_or_mismatch(
        mismatches,
        field_key="price_unit_code",
        expected_value=trade.price_unit_code,
        actual_value=derived_price_unit_value,
        expected_normalized=_normalize_text(trade.price_unit_code),
        actual_normalized=_normalize_text(derived_price_unit_value),
    )

    explicit_delivery_start = _parse_date(economic_terms.get("delivery_start"))
    explicit_delivery_end = _parse_date(economic_terms.get("delivery_end"))
    range_start, range_end = _parse_date_range(economic_terms.get("delivery_window"))
    actual_delivery_start = explicit_delivery_start or range_start
    actual_delivery_end = explicit_delivery_end or range_end
    expected_delivery_window = (
        f"{_format_date(trade.delivery_start)} to {_format_date(trade.delivery_end)}"
        if trade.delivery_start is not None or trade.delivery_end is not None
        else None
    )
    actual_delivery_window = (
        f"{_format_date(actual_delivery_start)} to {_format_date(actual_delivery_end)}"
        if actual_delivery_start is not None or actual_delivery_end is not None
        else economic_terms.get("delivery_window")
    )
    if expected_delivery_window is not None:
        if actual_delivery_start is None or actual_delivery_end is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="delivery_window",
                    label=FIELD_LABELS["delivery_window"],
                    mismatch_type="MISSING_DOCUMENT_VALUE",
                    expected_value=expected_delivery_window,
                    actual_value=actual_delivery_window,
                )
            )
        elif actual_delivery_start != trade.delivery_start or actual_delivery_end != trade.delivery_end:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="delivery_window",
                    label=FIELD_LABELS["delivery_window"],
                    mismatch_type="VALUE_MISMATCH",
                    expected_value=expected_delivery_window,
                    actual_value=actual_delivery_window,
                )
            )

    _append_missing_or_mismatch(
        mismatches,
        field_key="location_code",
        expected_value=trade.location_code,
        actual_value=economic_terms.get("location_code"),
        expected_normalized=_normalize_text(trade.location_code),
        actual_normalized=_normalize_text(economic_terms.get("location_code")),
    )

    if trade.option_type is not None:
        _append_missing_or_mismatch(
            mismatches,
            field_key="option_type",
            expected_value=trade.option_type,
            actual_value=economic_terms.get("option_type"),
            expected_normalized=_normalize_text(trade.option_type),
            actual_normalized=_normalize_text(economic_terms.get("option_type")),
        )
    if trade.option_style is not None:
        _append_missing_or_mismatch(
            mismatches,
            field_key="option_style",
            expected_value=trade.option_style,
            actual_value=economic_terms.get("option_style"),
            expected_normalized=_normalize_text(trade.option_style),
            actual_normalized=_normalize_text(economic_terms.get("option_style")),
        )
    if trade.option_strike_price is not None:
        strike_value = economic_terms.get("option_strike_price")
        actual_strike = _parse_decimal(strike_value)
        expected_strike = _parse_decimal(trade.option_strike_price)
        if strike_value is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="option_strike_price",
                    label=FIELD_LABELS["option_strike_price"],
                    mismatch_type="MISSING_DOCUMENT_VALUE",
                    expected_value=_format_decimal(trade.option_strike_price),
                    actual_value=None,
                )
            )
        elif actual_strike is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="option_strike_price",
                    label=FIELD_LABELS["option_strike_price"],
                    mismatch_type="UNPARSEABLE_DOCUMENT_VALUE",
                    expected_value=_format_decimal(trade.option_strike_price),
                    actual_value=strike_value,
                )
            )
        elif expected_strike != actual_strike:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="option_strike_price",
                    label=FIELD_LABELS["option_strike_price"],
                    mismatch_type="VALUE_MISMATCH",
                    expected_value=_format_decimal(trade.option_strike_price),
                    actual_value=strike_value,
                )
            )
    if trade.option_expiration_date is not None:
        expiration_value = economic_terms.get("option_expiration_date")
        actual_expiration = _parse_date(expiration_value)
        if expiration_value is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="option_expiration_date",
                    label=FIELD_LABELS["option_expiration_date"],
                    mismatch_type="MISSING_DOCUMENT_VALUE",
                    expected_value=_format_date(trade.option_expiration_date),
                    actual_value=None,
                )
            )
        elif actual_expiration is None:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="option_expiration_date",
                    label=FIELD_LABELS["option_expiration_date"],
                    mismatch_type="UNPARSEABLE_DOCUMENT_VALUE",
                    expected_value=_format_date(trade.option_expiration_date),
                    actual_value=expiration_value,
                )
            )
        elif actual_expiration != trade.option_expiration_date:
            mismatches.append(
                TradeConfirmationMismatch(
                    field_key="option_expiration_date",
                    label=FIELD_LABELS["option_expiration_date"],
                    mismatch_type="VALUE_MISMATCH",
                    expected_value=_format_date(trade.option_expiration_date),
                    actual_value=expiration_value,
                )
            )

    if mismatches:
        return TradeConfirmationComparisonResult(
            comparison_status="WAIVED" if str(comparison_waiver_note or "").strip() else "MISMATCHED",
            mismatches=mismatches,
        )
    return TradeConfirmationComparisonResult(comparison_status="MATCHED")
