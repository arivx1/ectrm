from __future__ import annotations

from datetime import date, timedelta
from time import perf_counter
from typing import Any, Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from zipfile import BadZipFile, ZipFile
import io
import re
from xml.etree import ElementTree as ET

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class EIAWholesalePowerClientError(RuntimeError):
    pass


logger = get_logger(__name__)

_SPREADSHEET_NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


class EIAWholesalePowerClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (
            base_url if base_url is not None else settings.EIA_WHOLESALE_POWER_BASE_URL
        ).rstrip("/")
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.EIA_WHOLESALE_POWER_TIMEOUT_SECONDS
        )

    def fetch_power_prices(
        self,
        *,
        years: Iterable[int],
        hubs: Iterable[str],
        start_date: Optional[date] = None,
    ) -> dict[str, Any]:
        normalized_hubs = {hub.strip().upper() for hub in hubs if hub.strip()}
        if not normalized_hubs:
            raise EIAWholesalePowerClientError("No EIA wholesale power hubs were requested")

        rows: list[dict[str, Any]] = []
        source_urls: list[str] = []
        normalized_years = sorted(set(years))
        if not normalized_years:
            raise EIAWholesalePowerClientError("No EIA wholesale power years were requested")

        latest_requested_year = normalized_years[-1]
        last_error: Optional[EIAWholesalePowerClientError] = None
        for year in normalized_years:
            try:
                payload = self.fetch_year(year)
            except EIAWholesalePowerClientError as exc:
                last_error = exc
                if year == latest_requested_year:
                    raise
                logger.warning(
                    "Skipping unavailable EIA wholesale power historical workbook provider=%s year=%s error=%s",
                    "EIA_WHOLESALE_POWER",
                    year,
                    exc,
                )
                continue

            source_urls.append(payload["source_url"])
            for row in payload["rows"]:
                price_hub = str(row.get("price_hub") or "").strip().upper()
                if price_hub not in normalized_hubs:
                    continue
                delivery_start = _parse_iso_date(row.get("delivery_start_date"))
                if start_date is not None and delivery_start is not None and delivery_start < start_date:
                    continue
                rows.append(row)

        if not source_urls and last_error is not None:
            raise last_error

        return {
            "prices": rows,
            "source_urls": source_urls,
        }

    def fetch_year(self, year: int) -> dict[str, Any]:
        url = f"{self.base_url}/ice_electric-{year}.xlsx"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                content = response.read()
                log_outbound_request(
                    logger,
                    provider="EIA_WHOLESALE_POWER",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="EIA_WHOLESALE_POWER",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise EIAWholesalePowerClientError(
                f"EIA wholesale power request failed with HTTP {exc.code}: {message}"
            ) from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="EIA_WHOLESALE_POWER",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise EIAWholesalePowerClientError(
                f"EIA wholesale power request failed: {exc.reason}"
            ) from exc

        return {
            "year": year,
            "source_url": url,
            "rows": _parse_workbook_rows(content),
        }


def _parse_workbook_rows(content: bytes) -> list[dict[str, Any]]:
    try:
        with ZipFile(io.BytesIO(content)) as workbook:
            shared_strings = _read_shared_strings(workbook)
            sheet_name = _first_worksheet_name(workbook)
            sheet = ET.fromstring(workbook.read(sheet_name))
    except (BadZipFile, KeyError, ET.ParseError) as exc:
        raise EIAWholesalePowerClientError("EIA wholesale power workbook could not be parsed") from exc

    rows = sheet.findall(".//s:sheetData/s:row", _SPREADSHEET_NS)
    if not rows:
        raise EIAWholesalePowerClientError("EIA wholesale power workbook did not include rows")

    header_values = _row_values(rows[0], shared_strings)
    headers = [_normalize_header(value) for value in header_values]
    if "price_hub" not in headers or "wtd_avg_price" not in headers:
        raise EIAWholesalePowerClientError("EIA wholesale power workbook did not include expected headers")

    parsed_rows: list[dict[str, Any]] = []
    for row in rows[1:]:
        values = _row_values(row, shared_strings)
        raw = {
            header: values[index] if index < len(values) else None
            for index, header in enumerate(headers)
            if header
        }
        price_hub = str(raw.get("price_hub") or "").strip()
        if not price_hub:
            continue

        parsed_rows.append(
            {
                "price_hub": price_hub,
                "trade_date": _coerce_excel_date(raw.get("trade_date")),
                "delivery_start_date": _coerce_excel_date(raw.get("delivery_start_date")),
                "delivery_end_date": _coerce_excel_date(raw.get("delivery_end_date")),
                "high_price": _coerce_text(raw.get("high_price")),
                "low_price": _coerce_text(raw.get("low_price")),
                "wtd_avg_price": _coerce_text(raw.get("wtd_avg_price")),
                "change": _coerce_text(raw.get("change")),
                "daily_volume_mwh": _coerce_text(raw.get("daily_volume_mwh")),
                "number_of_trades": _coerce_text(raw.get("number_of_trades")),
                "number_of_counterparties": _coerce_text(raw.get("number_of_counterparties")),
            }
        )

    return parsed_rows


def _read_shared_strings(workbook: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []

    root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall("s:si", _SPREADSHEET_NS):
        parts = [node.text or "" for node in item.findall(".//s:t", _SPREADSHEET_NS)]
        values.append("".join(parts))
    return values


def _first_worksheet_name(workbook: ZipFile) -> str:
    for name in workbook.namelist():
        if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
            return name
    raise EIAWholesalePowerClientError("EIA wholesale power workbook did not include a worksheet")


def _row_values(row: ET.Element, shared_strings: list[str]) -> list[Optional[str]]:
    values_by_index: dict[int, Optional[str]] = {}
    for cell in row.findall("s:c", _SPREADSHEET_NS):
        reference = cell.get("r") or ""
        index = _column_index(reference)
        if index is None:
            continue
        values_by_index[index] = _cell_value(cell, shared_strings)

    if not values_by_index:
        return []
    return [values_by_index.get(index) for index in range(max(values_by_index) + 1)]


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
            raise EIAWholesalePowerClientError("EIA wholesale power shared string index was invalid") from exc
    return node.text


def _column_index(reference: str) -> Optional[int]:
    match = re.match(r"([A-Z]+)", reference)
    if match is None:
        return None

    value = 0
    for char in match.group(1):
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def _normalize_header(value: Optional[str]) -> str:
    normalized = " ".join(str(value or "").replace("\n", " ").split()).strip().lower()
    return {
        "price hub": "price_hub",
        "trade date": "trade_date",
        "delivery start date": "delivery_start_date",
        "delivery end date": "delivery_end_date",
        "high price $/mwh": "high_price",
        "low price $/mwh": "low_price",
        "wtd avg price $/mwh": "wtd_avg_price",
        "change": "change",
        "daily volume mwh": "daily_volume_mwh",
        "number of trades": "number_of_trades",
        "number of counterparties": "number_of_counterparties",
    }.get(normalized, normalized.replace(" ", "_"))


def _coerce_excel_date(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        serial = float(text)
    except ValueError:
        parsed = _parse_iso_date(text)
        return parsed.isoformat() if parsed is not None else text
    return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()


def _parse_iso_date(value: Any) -> Optional[date]:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _coerce_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value).strip()
