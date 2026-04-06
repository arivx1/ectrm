from __future__ import annotations

import re
from html.parser import HTMLParser
from time import perf_counter
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class CAISOClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class _CurrentHubLMPParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._current_h1: Optional[str] = None
        self._current_row: Optional[list[str]] = None
        self._current_cell: Optional[str] = None
        self.headers: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        attr_map = {key: value or "" for key, value in attrs}
        if tag == "h1":
            self._current_h1 = ""
            return
        if tag == "tr" and "datarow" in attr_map.get("class", ""):
            self._current_row = []
            return
        if tag == "td" and self._current_row is not None:
            self._current_cell = ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "h1" and self._current_h1 is not None:
            value = _normalize_html_text(self._current_h1)
            if value:
                self.headers.append(value)
            self._current_h1 = None
            return
        if tag == "td" and self._current_cell is not None and self._current_row is not None:
            self._current_row.append(_normalize_html_text(self._current_cell))
            self._current_cell = None
            return
        if tag == "tr" and self._current_row is not None:
            if self._current_row:
                self.rows.append(self._current_row)
            self._current_row = None

    def handle_data(self, data: str) -> None:
        if self._current_h1 is not None:
            self._current_h1 += data
        if self._current_cell is not None:
            self._current_cell += data


class CAISOClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.CAISO_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.CAISO_TIMEOUT_SECONDS

    def fetch_current_hub_prices(self) -> dict[str, Any]:
        url = f"{self.base_url}/prc_hub_lmp/PRC_HUB_LMP.html"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                html = response.read().decode("utf-8", errors="replace")
                log_outbound_request(
                    logger,
                    provider="CAISO",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="CAISO",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise CAISOClientError(f"CAISO request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="CAISO",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise CAISOClientError(f"CAISO request failed: {exc.reason}") from exc

        return _parse_current_hub_lmp_html(html)


def _parse_current_hub_lmp_html(html: str) -> dict[str, Any]:
    parser = _CurrentHubLMPParser()
    parser.feed(html)

    detail_header = next((value for value in parser.headers if "Interval" in value and "Hour" in value), "")
    match = re.search(
        r"for\s+(?P<trade_date>\d{4}-\d{2}-\d{2})\s*,\s*Hour\s+(?P<hour>\d{1,2})\s*,\s*Interval\s+(?P<interval>\d{1,2})",
        detail_header,
        flags=re.IGNORECASE,
    )
    if match is None:
        raise CAISOClientError("CAISO hub price page did not include a trade date, hour, and interval header")

    prices: list[dict[str, str]] = []
    for row in parser.rows:
        if len(row) < 5:
            continue
        prices.append(
            {
                "hub": row[0].upper(),
                "lmp": _extract_dollar_value(row[1]),
                "energy": _extract_dollar_value(row[2]),
                "congestion": _extract_dollar_value(row[3]),
                "losses": _extract_dollar_value(row[4]),
            }
        )

    if not prices:
        raise CAISOClientError("CAISO hub price page did not include any hub rows")

    return {
        "trade_date": match.group("trade_date"),
        "hour": int(match.group("hour")),
        "interval": int(match.group("interval")),
        "prices": prices,
    }


def _normalize_html_text(value: str) -> str:
    return " ".join(part for part in value.split() if part)


def _extract_dollar_value(value: str) -> str:
    normalized = value.replace("$", "").replace(",", "").strip()
    if not normalized:
        raise CAISOClientError("CAISO hub price row included a blank numeric value")
    return normalized
