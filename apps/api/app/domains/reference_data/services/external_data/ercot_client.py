from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from apps.api.app.config import settings


class ERCOTClientError(RuntimeError):
    pass


class _RealTimeSppParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.headers: list[str] = []
        self.rows: list[list[str]] = []
        self._capture_header = False
        self._capture_cell = False
        self._current_header = ""
        self._current_cell = ""
        self._current_row: Optional[list[str]] = None
        self.current_date: Optional[str] = None
        self.last_updated: Optional[str] = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        attr_map = {key: value or "" for key, value in attrs}
        if tag == "input" and attr_map.get("id") == "currentDate":
            candidate = attr_map.get("value", "").strip()
            if candidate:
                self.current_date = candidate
            return
        if tag == "div" and "schedTime" in attr_map.get("class", ""):
            self._capture_header = True
            self._current_header = ""
            return
        if tag == "th" and attr_map.get("class") == "headerValueClass":
            self._capture_header = True
            self._current_header = ""
            return
        if tag == "tr":
            self._current_row = []
            return
        if tag == "td" and self._current_row is not None:
            self._capture_cell = True
            self._current_cell = ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "div" and self._capture_header:
            value = _normalize_html_text(self._current_header)
            if value.startswith("Last Updated:"):
                self.last_updated = value.removeprefix("Last Updated:").strip()
            self._capture_header = False
            self._current_header = ""
            return
        if tag == "th" and self._capture_header:
            value = _normalize_html_text(self._current_header)
            if value:
                self.headers.append(value)
            self._capture_header = False
            self._current_header = ""
            return
        if tag == "td" and self._capture_cell and self._current_row is not None:
            self._current_row.append(_normalize_html_text(self._current_cell))
            self._capture_cell = False
            self._current_cell = ""
            return
        if tag == "tr" and self._current_row is not None:
            if self._current_row:
                self.rows.append(self._current_row)
            self._current_row = None

    def handle_data(self, data: str) -> None:
        if self._capture_header:
            self._current_header += data
        if self._capture_cell:
            self._current_cell += data


class ERCOTClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.ERCOT_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.ERCOT_TIMEOUT_SECONDS

    def fetch_real_time_hub_prices(self) -> dict[str, Any]:
        url = f"{self.base_url}/real_time_spp.html"
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                html = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise ERCOTClientError(f"ERCOT request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            raise ERCOTClientError(f"ERCOT request failed: {exc.reason}") from exc

        return _parse_real_time_spp_html(html)


def _parse_real_time_spp_html(html: str) -> dict[str, Any]:
    parser = _RealTimeSppParser()
    parser.feed(html)

    if not parser.current_date:
        raise ERCOTClientError("ERCOT real-time price page did not include a current operating day")
    if len(parser.headers) < 3:
        raise ERCOTClientError("ERCOT real-time price page did not include hub headers")
    if not parser.rows:
        raise ERCOTClientError("ERCOT real-time price page did not include interval rows")

    latest_row = parser.rows[-1]
    if len(latest_row) != len(parser.headers):
        raise ERCOTClientError("ERCOT real-time price row length did not match the header layout")

    operating_day = _normalize_operating_day(parser.current_date)
    interval_ending = latest_row[1]
    if not re.fullmatch(r"\d{4}", interval_ending):
        raise ERCOTClientError("ERCOT real-time price page did not include a valid interval ending value")

    prices = {
        header.strip().upper(): value.strip()
        for header, value in zip(parser.headers[2:], latest_row[2:], strict=False)
        if header.strip() and value.strip()
    }
    if not prices:
        raise ERCOTClientError("ERCOT real-time price page did not include any price cells")

    return {
        "operating_day": operating_day,
        "interval_ending": interval_ending,
        "last_updated": parser.last_updated,
        "prices": prices,
    }


def _normalize_html_text(value: str) -> str:
    return " ".join(part for part in value.split() if part)


def _normalize_operating_day(value: str) -> str:
    match = re.fullmatch(r"(?P<month>\d{2})/(?P<day>\d{2})/(?P<year>\d{4})", value.strip())
    if match is None:
        raise ERCOTClientError("ERCOT operating day was not in MM/DD/YYYY format")
    return f"{match.group('year')}-{match.group('month')}-{match.group('day')}"
