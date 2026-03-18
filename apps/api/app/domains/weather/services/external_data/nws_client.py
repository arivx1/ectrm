from __future__ import annotations

import json
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl
from urllib.parse import urlencode
from urllib.parse import urlsplit
from urllib.parse import urlunsplit
from urllib.request import Request
from urllib.request import urlopen

from apps.api.app.config import settings

GEOJSON_ACCEPT_HEADER = "application/geo+json"


class NWSClientError(RuntimeError):
    pass


class NWSClient:
    def __init__(
        self,
        *,
        user_agent: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.user_agent = (user_agent if user_agent is not None else settings.NWS_USER_AGENT).strip()
        self.base_url = (base_url if base_url is not None else settings.NWS_BASE_URL).rstrip("/")
        self.timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else settings.NWS_TIMEOUT_SECONDS
        )

        if not self.user_agent:
            raise NWSClientError("NWS_USER_AGENT is not configured")

    def fetch_json(
        self,
        path_or_url: str,
        *,
        query_params: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        request = Request(
            self._build_url(path_or_url, query_params=query_params),
            headers={
                "User-Agent": self.user_agent,
                "Accept": GEOJSON_ACCEPT_HEADER,
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise NWSClientError(f"NWS request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            raise NWSClientError(f"NWS request failed: {exc.reason}") from exc

        if not isinstance(payload, dict):
            raise NWSClientError("NWS response payload was not an object")

        return payload

    def get_point(self, *, latitude: float, longitude: float) -> dict[str, Any]:
        return self.fetch_json(f"/points/{latitude},{longitude}")

    def get_hourly_forecast(self, *, forecast_url: str) -> dict[str, Any]:
        return self.fetch_json(forecast_url)

    def get_stations(self, *, stations_url: str) -> dict[str, Any]:
        return self.fetch_json(stations_url)

    def get_station_observations(
        self,
        *,
        station_id: str,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> dict[str, Any]:
        normalized_station_id = station_id.strip().upper()
        if not normalized_station_id:
            raise NWSClientError("station_id is required")

        query_params: dict[str, Any] = {}
        if start:
            query_params["start"] = start
        if end:
            query_params["end"] = end
        if limit is not None:
            query_params["limit"] = limit

        return self.fetch_json(
            f"/stations/{normalized_station_id}/observations",
            query_params=query_params or None,
        )

    def _build_url(
        self,
        path_or_url: str,
        *,
        query_params: Optional[dict[str, Any]],
    ) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            base = path_or_url
        else:
            path = path_or_url if path_or_url.startswith("/") else f"/{path_or_url}"
            base = f"{self.base_url}{path}"

        if not query_params:
            return base

        split = urlsplit(base)
        merged_query = dict(parse_qsl(split.query, keep_blank_values=True))
        for key, value in query_params.items():
            if value is not None:
                merged_query[key] = str(value)

        return urlunsplit(
            (
                split.scheme,
                split.netloc,
                split.path,
                urlencode(merged_query),
                split.fragment,
            )
        )
