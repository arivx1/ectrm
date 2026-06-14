from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from time import perf_counter
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from zipfile import BadZipFile, ZipFile
import io
import posixpath
import re
from xml.etree import ElementTree as ET

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class WorldBankClientError(RuntimeError):
    pass


logger = get_logger(__name__)

_SPREADSHEET_NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_RELATIONSHIP_NS = {
    "r": "http://schemas.openxmlformats.org/package/2006/relationships",
}
_OFFICE_RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_MONTHLY_PRICES_SHEET = "Monthly Prices"


class WorldBankPinkSheetClient:
    def __init__(
        self,
        monthly_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.monthly_url = monthly_url if monthly_url is not None else settings.WORLD_BANK_PINK_SHEET_MONTHLY_URL
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.WORLD_BANK_TIMEOUT_SECONDS
        )

    def fetch_monthly_prices(
        self,
        *,
        series_ids: list[str],
        start_date: Optional[date] = None,
    ) -> dict[str, Any]:
        normalized_series_ids = [series_id.strip() for series_id in series_ids if series_id.strip()]
        if not normalized_series_ids:
            raise WorldBankClientError("No World Bank Pink Sheet series were requested")

        started_at = perf_counter()
        try:
            with urlopen(self.monthly_url, timeout=self.timeout_seconds) as response:
                content = response.read()
                log_outbound_request(
                    logger,
                    provider="WORLD_BANK",
                    method="GET",
                    url=self.monthly_url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="WORLD_BANK",
                method="GET",
                url=self.monthly_url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise WorldBankClientError(f"World Bank Pink Sheet request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="WORLD_BANK",
                method="GET",
                url=self.monthly_url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise WorldBankClientError(f"World Bank Pink Sheet request failed: {exc.reason}") from exc

        return _parse_monthly_prices_workbook(
            content,
            series_ids=normalized_series_ids,
            start_date=start_date,
            source_url=self.monthly_url,
        )


def _parse_monthly_prices_workbook(
    content: bytes,
    *,
    series_ids: list[str],
    start_date: Optional[date],
    source_url: str,
) -> dict[str, Any]:
    try:
        with ZipFile(io.BytesIO(content)) as workbook:
            shared_strings = _read_shared_strings(workbook)
            sheet_name = _worksheet_name(workbook, _MONTHLY_PRICES_SHEET)
            sheet = ET.fromstring(workbook.read(sheet_name))
    except (BadZipFile, KeyError, ET.ParseError) as exc:
        raise WorldBankClientError("World Bank Pink Sheet workbook could not be parsed") from exc

    rows = sheet.findall(".//s:sheetData/s:row", _SPREADSHEET_NS)
    if len(rows) < 8:
        raise WorldBankClientError("World Bank Pink Sheet workbook did not include monthly price rows")

    update_text = _extract_workbook_update_text(rows, shared_strings)
    label_by_column = _row_values_by_index(rows[4], shared_strings)
    unit_by_column = _row_values_by_index(rows[5], shared_strings)
    code_by_column = _row_values_by_index(rows[6], shared_strings)
    column_by_series_id = {
        str(value).strip(): column
        for column, value in code_by_column.items()
        if value is not None and str(value).strip()
    }

    requested_ids = set(series_ids)
    missing_ids = sorted(requested_ids.difference(column_by_series_id))
    if missing_ids:
        raise WorldBankClientError(
            f"World Bank Pink Sheet workbook did not include requested series: {', '.join(missing_ids)}"
        )

    rows_out: list[dict[str, Any]] = []
    for row in rows[7:]:
        values = _row_values_by_index(row, shared_strings)
        raw_period = values.get(0)
        if raw_period is None:
            continue
        observation_date = _parse_monthly_period(str(raw_period))
        if observation_date is None:
            continue
        if start_date is not None and observation_date < start_date:
            continue

        for series_id in series_ids:
            column = column_by_series_id[series_id]
            value = _parse_decimal_value(values.get(column))
            if value is None:
                continue
            rows_out.append(
                {
                    "series_id": series_id,
                    "series_name": _clean_text(label_by_column.get(column)),
                    "source_unit_text": _clean_text(unit_by_column.get(column)),
                    "period": str(raw_period).strip(),
                    "observation_date": observation_date.isoformat(),
                    "value": str(value),
                    "source_revision": update_text,
                    "source_url": source_url,
                }
            )

    return {
        "source_url": source_url,
        "source_revision": update_text,
        "prices": rows_out,
    }


def _read_shared_strings(workbook: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []

    root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall("s:si", _SPREADSHEET_NS):
        parts = [node.text or "" for node in item.findall(".//s:t", _SPREADSHEET_NS)]
        values.append("".join(parts))
    return values


def _worksheet_name(workbook: ZipFile, sheet_name: str) -> str:
    workbook_root = ET.fromstring(workbook.read("xl/workbook.xml"))
    relationship_root = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
    relationship_targets = {
        relationship.get("Id"): relationship.get("Target")
        for relationship in relationship_root.findall("r:Relationship", _RELATIONSHIP_NS)
    }

    for sheet in workbook_root.findall("s:sheets/s:sheet", _SPREADSHEET_NS):
        if sheet.get("name") != sheet_name:
            continue
        relationship_id = sheet.get(f"{{{_OFFICE_RELATIONSHIP_NS}}}id")
        target = relationship_targets.get(relationship_id)
        if not target:
            break
        normalized_target = target.lstrip("/")
        if not normalized_target.startswith("xl/"):
            normalized_target = posixpath.normpath(posixpath.join("xl", normalized_target))
        if normalized_target in workbook.namelist():
            return normalized_target

    raise WorldBankClientError(f"World Bank Pink Sheet workbook did not include a '{sheet_name}' worksheet")


def _row_values_by_index(row: ET.Element, shared_strings: list[str]) -> dict[int, Optional[str]]:
    values: dict[int, Optional[str]] = {}
    for cell in row.findall("s:c", _SPREADSHEET_NS):
        reference = cell.get("r") or ""
        index = _column_index(reference)
        if index is None:
            continue
        values[index] = _cell_value(cell, shared_strings)
    return values


def _cell_value(cell: ET.Element, shared_strings: list[str]) -> Optional[str]:
    cell_type = cell.get("t")
    if cell_type == "inlineStr":
        parts = [node.text or "" for node in cell.findall(".//s:t", _SPREADSHEET_NS)]
        return "".join(parts)

    node = cell.find("s:v", _SPREADSHEET_NS)
    if node is None or node.text is None:
        return None

    if cell_type == "s":
        try:
            return shared_strings[int(node.text)]
        except (IndexError, ValueError) as exc:
            raise WorldBankClientError("World Bank Pink Sheet shared string index was invalid") from exc
    return node.text


def _column_index(reference: str) -> Optional[int]:
    match = re.match(r"([A-Z]+)", reference)
    if match is None:
        return None

    value = 0
    for char in match.group(1):
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def _extract_workbook_update_text(rows: list[ET.Element], shared_strings: list[str]) -> Optional[str]:
    if len(rows) < 4:
        return None
    value = _row_values_by_index(rows[3], shared_strings).get(0)
    return _clean_text(value)


def _clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split()).strip()
    return text or None


def _parse_monthly_period(value: str) -> Optional[date]:
    text = value.strip()
    match = re.fullmatch(r"(\d{4})M(\d{2})", text)
    if not match:
        return None
    year = int(match.group(1))
    month = int(match.group(2))
    if month < 1 or month > 12:
        return None
    return date(year, month, 1)


def _parse_decimal_value(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"\u2026", ".", "NA", "N/A", "NULL"}:
        return None
    try:
        return Decimal(text.replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise WorldBankClientError(f"Could not parse World Bank Pink Sheet value {value!r}") from exc
