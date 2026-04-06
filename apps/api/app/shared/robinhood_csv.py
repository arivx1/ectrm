from __future__ import annotations

import csv
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


_DATE_FORMATS = (
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%m/%d/%y",
    "%b %d, %Y",
    "%b %d %Y",
)

_DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%m/%d/%y %H:%M:%S",
    "%m/%d/%y %H:%M",
    "%Y-%m-%d %H:%M:%S %Z",
)

_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "occurred_at": ("activitydate", "transactiondate", "tradedate", "date"),
    "processed_at": ("processdate", "executiondate", "orderdate"),
    "settled_at": ("settledate", "settlementdate"),
    "account_type": ("accounttype", "account"),
    "symbol": ("symbol", "ticker"),
    "instrument_name": ("instrument", "security", "asset", "name"),
    "description": ("description", "details", "activity"),
    "activity_type": ("transcode", "transactiontype", "activitytype", "eventtype", "type"),
    "quantity": ("quantity", "qty", "shares", "units", "coins"),
    "price": ("price", "pricepershare", "averageprice", "executionprice"),
    "amount": ("amount", "netamount", "grossamount", "totalamount", "proceeds"),
    "fees": ("fees", "fee", "commission", "regulatoryfee"),
    "currency": ("currency", "currencycode"),
    "reference_id": ("transactionid", "activityid", "orderid", "referenceid", "id"),
    "status": ("status", "state"),
    "suppressed": ("suppressed",),
    "notes": ("notes", "note", "memo"),
}

_CSV_COLUMNS = (
    "row_number",
    "occurred_at",
    "processed_at",
    "settled_at",
    "account_type",
    "symbol",
    "instrument_name",
    "description",
    "activity_type",
    "activity_family",
    "side",
    "quantity",
    "price",
    "amount",
    "fees",
    "currency",
    "reference_id",
    "status",
    "suppressed",
    "notes",
)


@dataclass(frozen=True)
class RobinhoodNormalizedRow:
    row_number: int
    occurred_at: str | None
    processed_at: str | None
    settled_at: str | None
    account_type: str | None
    symbol: str | None
    instrument_name: str | None
    description: str | None
    activity_type: str | None
    activity_family: str
    side: str | None
    quantity: str | None
    price: str | None
    amount: str | None
    fees: str | None
    currency: str | None
    reference_id: str | None
    status: str | None
    suppressed: bool | None
    notes: str | None
    raw: dict[str, str] | None = None

    def to_dict(self, *, include_raw: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "row_number": self.row_number,
            "occurred_at": self.occurred_at,
            "processed_at": self.processed_at,
            "settled_at": self.settled_at,
            "account_type": self.account_type,
            "symbol": self.symbol,
            "instrument_name": self.instrument_name,
            "description": self.description,
            "activity_type": self.activity_type,
            "activity_family": self.activity_family,
            "side": self.side,
            "quantity": self.quantity,
            "price": self.price,
            "amount": self.amount,
            "fees": self.fees,
            "currency": self.currency,
            "reference_id": self.reference_id,
            "status": self.status,
            "suppressed": self.suppressed,
            "notes": self.notes,
        }
        if include_raw and self.raw is not None:
            payload["raw"] = self.raw
        return payload

    def to_csv_dict(self, *, include_raw: bool = False) -> dict[str, str]:
        payload = {
            key: _stringify_csv_value(self.to_dict(include_raw=False).get(key))
            for key in _CSV_COLUMNS
        }
        if include_raw:
            payload["raw_json"] = json.dumps(self.raw or {}, sort_keys=True)
        return payload


@dataclass(frozen=True)
class RobinhoodImportSummary:
    input_path: str
    row_count: int
    field_mapping: dict[str, str]
    unmatched_headers: tuple[str, ...]
    activity_families: dict[str, int]
    symbols: dict[str, int]
    earliest_activity_at: str | None
    latest_activity_at: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "input_path": self.input_path,
            "row_count": self.row_count,
            "field_mapping": self.field_mapping,
            "unmatched_headers": list(self.unmatched_headers),
            "activity_families": self.activity_families,
            "symbols": self.symbols,
            "earliest_activity_at": self.earliest_activity_at,
            "latest_activity_at": self.latest_activity_at,
        }


def derive_default_output_path(input_path: str | Path, *, output_format: str) -> Path:
    source_path = Path(input_path)
    suffix = ".json" if output_format == "json" else ".csv"
    return source_path.with_name(f"{source_path.stem}.normalized{suffix}")


def parse_robinhood_csv(
    input_path: str | Path,
    *,
    include_raw: bool = False,
) -> tuple[list[RobinhoodNormalizedRow], RobinhoodImportSummary]:
    source_path = Path(input_path)
    with source_path.open("r", encoding="utf-8-sig", newline="") as handle:
        sample = handle.read(4096)
        handle.seek(0)
        dialect = _detect_dialect(sample)
        reader = csv.DictReader(handle, dialect=dialect)
        fieldnames = tuple(reader.fieldnames or ())
        field_mapping = _resolve_field_mapping(fieldnames)

        rows = [
            _normalize_row(
                row,
                row_number=index,
                field_mapping=field_mapping,
                include_raw=include_raw,
            )
            for index, row in enumerate(reader, start=1)
            if any(_clean_cell(value) is not None for value in row.values())
        ]

    summary = _build_summary(source_path=source_path, rows=rows, fieldnames=fieldnames, field_mapping=field_mapping)
    return rows, summary


def write_normalized_json(
    output_path: str | Path,
    *,
    rows: list[RobinhoodNormalizedRow],
    summary: RobinhoodImportSummary,
    include_raw: bool = False,
) -> None:
    destination = Path(output_path)
    payload = {
        "summary": summary.to_dict(),
        "rows": [row.to_dict(include_raw=include_raw) for row in rows],
    }
    destination.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_normalized_csv(
    output_path: str | Path,
    *,
    rows: list[RobinhoodNormalizedRow],
    include_raw: bool = False,
) -> None:
    destination = Path(output_path)
    fieldnames = list(_CSV_COLUMNS)
    if include_raw:
        fieldnames.append("raw_json")
    with destination.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.to_csv_dict(include_raw=include_raw))


def _build_summary(
    *,
    source_path: Path,
    rows: list[RobinhoodNormalizedRow],
    fieldnames: tuple[str, ...],
    field_mapping: dict[str, str],
) -> RobinhoodImportSummary:
    activity_counter = Counter(row.activity_family for row in rows)
    symbol_counter = Counter(row.symbol for row in rows if row.symbol)
    normalized_dates = sorted(
        row.occurred_at
        for row in rows
        if row.occurred_at is not None and _looks_like_normalized_temporal(row.occurred_at)
    )

    mapped_headers = set(field_mapping.values())
    unmatched_headers = tuple(header for header in fieldnames if header not in mapped_headers)

    return RobinhoodImportSummary(
        input_path=str(source_path),
        row_count=len(rows),
        field_mapping=field_mapping,
        unmatched_headers=unmatched_headers,
        activity_families=dict(sorted(activity_counter.items())),
        symbols=dict(symbol_counter.most_common()),
        earliest_activity_at=normalized_dates[0] if normalized_dates else None,
        latest_activity_at=normalized_dates[-1] if normalized_dates else None,
    )


def _detect_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return csv.excel


def _resolve_field_mapping(fieldnames: tuple[str, ...]) -> dict[str, str]:
    normalized_headers = {
        _canonicalize_header(fieldname): fieldname
        for fieldname in fieldnames
        if _canonicalize_header(fieldname)
    }

    mapping: dict[str, str] = {}
    for field_name, aliases in _FIELD_ALIASES.items():
        match = _find_header_match(normalized_headers, aliases)
        if match is not None:
            mapping[field_name] = match
    return mapping


def _find_header_match(normalized_headers: dict[str, str], aliases: tuple[str, ...]) -> str | None:
    for alias in aliases:
        if alias in normalized_headers:
            return normalized_headers[alias]

    for alias in aliases:
        if len(alias) < 6:
            continue
        for normalized_header, original_header in normalized_headers.items():
            if normalized_header.startswith(alias) or normalized_header.endswith(alias):
                return original_header
    return None


def _normalize_row(
    raw_row: dict[str, str | None],
    *,
    row_number: int,
    field_mapping: dict[str, str],
    include_raw: bool,
) -> RobinhoodNormalizedRow:
    amount_value = _parse_decimal(_get_mapped_value(raw_row, field_mapping, "amount"))
    quantity_value = _parse_decimal(_get_mapped_value(raw_row, field_mapping, "quantity"))
    price_value = _parse_decimal(_get_mapped_value(raw_row, field_mapping, "price"))
    fees_value = _parse_decimal(_get_mapped_value(raw_row, field_mapping, "fees"))

    activity_type = _clean_cell(_get_mapped_value(raw_row, field_mapping, "activity_type"))
    description = _clean_cell(_get_mapped_value(raw_row, field_mapping, "description"))
    instrument_name = _clean_cell(_get_mapped_value(raw_row, field_mapping, "instrument_name"))
    symbol = _normalize_symbol(_get_mapped_value(raw_row, field_mapping, "symbol"))
    if symbol is None:
        symbol = _normalize_symbol(instrument_name)

    activity_family = _infer_activity_family(
        activity_type=activity_type,
        description=description,
        amount=amount_value,
    )

    return RobinhoodNormalizedRow(
        row_number=row_number,
        occurred_at=_normalize_temporal_value(_get_mapped_value(raw_row, field_mapping, "occurred_at")),
        processed_at=_normalize_temporal_value(_get_mapped_value(raw_row, field_mapping, "processed_at")),
        settled_at=_normalize_temporal_value(_get_mapped_value(raw_row, field_mapping, "settled_at")),
        account_type=_clean_cell(_get_mapped_value(raw_row, field_mapping, "account_type")),
        symbol=symbol,
        instrument_name=instrument_name,
        description=description,
        activity_type=activity_type,
        activity_family=activity_family,
        side=_infer_side(activity_family=activity_family, amount=amount_value),
        quantity=_format_decimal(quantity_value),
        price=_format_decimal(price_value),
        amount=_format_decimal(amount_value),
        fees=_format_decimal(fees_value),
        currency=_clean_cell(_get_mapped_value(raw_row, field_mapping, "currency")) or "USD",
        reference_id=_clean_cell(_get_mapped_value(raw_row, field_mapping, "reference_id")),
        status=_clean_cell(_get_mapped_value(raw_row, field_mapping, "status")),
        suppressed=_parse_bool(_get_mapped_value(raw_row, field_mapping, "suppressed")),
        notes=_clean_cell(_get_mapped_value(raw_row, field_mapping, "notes")),
        raw=_clean_raw_row(raw_row) if include_raw else None,
    )


def _get_mapped_value(
    raw_row: dict[str, str | None],
    field_mapping: dict[str, str],
    field_name: str,
) -> str | None:
    source_header = field_mapping.get(field_name)
    if source_header is None:
        return None
    return raw_row.get(source_header)


def _clean_raw_row(raw_row: dict[str, str | None]) -> dict[str, str]:
    return {
        key: value.strip()
        for key, value in raw_row.items()
        if key is not None and value is not None and value.strip()
    }


def _clean_cell(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _canonicalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.strip().lower())


def _normalize_temporal_value(value: str | None) -> str | None:
    cleaned = _clean_cell(value)
    if cleaned is None:
        return None

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        return cleaned

    iso_candidate = cleaned.replace("Z", "+00:00") if cleaned.endswith("Z") else cleaned
    try:
        parsed_iso = datetime.fromisoformat(iso_candidate)
    except ValueError:
        parsed_iso = None
    if parsed_iso is not None:
        return parsed_iso.isoformat(timespec="seconds")

    for date_format in _DATETIME_FORMATS:
        try:
            return datetime.strptime(cleaned, date_format).isoformat(timespec="seconds")
        except ValueError:
            continue

    for date_format in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, date_format).date().isoformat()
        except ValueError:
            continue

    return cleaned


def _parse_decimal(value: str | None) -> Decimal | None:
    cleaned = _clean_cell(value)
    if cleaned is None:
        return None

    sign = Decimal("1")
    text = cleaned
    if text.startswith("(") and text.endswith(")"):
        sign = Decimal("-1")
        text = text[1:-1].strip()
    if text.upper().endswith("DR"):
        sign = Decimal("-1")
        text = text[:-2].strip()
    if text.startswith("-"):
        sign *= Decimal("-1")
        text = text[1:].strip()
    if text.startswith("+"):
        text = text[1:].strip()

    text = (
        text.replace("$", "")
        .replace(",", "")
        .replace("USD", "")
        .replace("US$", "")
        .strip()
    )
    if not text or text in {"--", "N/A"}:
        return None

    try:
        return Decimal(text) * sign
    except InvalidOperation:
        return None


def _format_decimal(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")


def _parse_bool(value: str | None) -> bool | None:
    cleaned = _clean_cell(value)
    if cleaned is None:
        return None
    lowered = cleaned.lower()
    if lowered in {"true", "t", "yes", "y", "1"}:
        return True
    if lowered in {"false", "f", "no", "n", "0"}:
        return False
    return None


def _normalize_symbol(value: str | None) -> str | None:
    cleaned = _clean_cell(value)
    if cleaned is None:
        return None
    candidate = cleaned.upper().replace("/", "-")
    if re.fullmatch(r"[A-Z0-9.\-]{1,24}", candidate):
        return candidate
    return None


def _infer_activity_family(
    *,
    activity_type: str | None,
    description: str | None,
    amount: Decimal | None,
) -> str:
    combined = " ".join(part for part in (activity_type, description) if part).lower()

    if any(keyword in combined for keyword in ("reinvest", "reinvestment")):
        return "DIVIDEND_REINVESTMENT"
    if any(keyword in combined for keyword in ("buy", "bought", "purchase")):
        return "TRADE_BUY"
    if any(keyword in combined for keyword in ("sell", "sold", "sale")):
        return "TRADE_SELL"
    if "dividend" in combined:
        return "DIVIDEND"
    if "interest" in combined:
        return "INTEREST"
    if any(keyword in combined for keyword in ("deposit", "wire in", "cash in", "contribution", "ach")):
        return "CASH_IN"
    if any(keyword in combined for keyword in ("withdrawal", "wire out", "cash out", "disbursement")):
        return "CASH_OUT"
    if "transfer" in combined:
        return "TRANSFER"
    if any(keyword in combined for keyword in ("fee", "commission")):
        return "FEE"
    if any(keyword in combined for keyword in ("tax", "withholding")):
        return "TAX"
    if amount is not None and amount > 0:
        return "CREDIT"
    if amount is not None and amount < 0:
        return "DEBIT"
    return "OTHER"


def _infer_side(*, activity_family: str, amount: Decimal | None) -> str | None:
    if activity_family == "TRADE_BUY":
        return "BUY"
    if activity_family == "TRADE_SELL":
        return "SELL"
    if amount is None:
        return None
    if amount > 0:
        return "CREDIT"
    if amount < 0:
        return "DEBIT"
    return None


def _looks_like_normalized_temporal(value: str) -> bool:
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}", value))


def _stringify_csv_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)
