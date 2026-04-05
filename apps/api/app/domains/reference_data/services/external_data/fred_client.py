from __future__ import annotations

import json
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from apps.api.app.config import settings


class FREDClientError(RuntimeError):
    pass


class FREDClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.FRED_API_KEY
        self.base_url = (base_url if base_url is not None else settings.FRED_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.FRED_TIMEOUT_SECONDS

        if not self.api_key:
            raise FREDClientError("FRED_API_KEY is not configured")

    def fetch_series(
        self,
        *,
        series_id: str,
        observation_start: Optional[str] = None,
        limit: int = 100000,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "sort_order": "asc",
            "limit": limit,
        }
        if observation_start:
            params["observation_start"] = observation_start

        url = f"{self.base_url}/series/observations?{urlencode(params)}"
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise FREDClientError(f"FRED request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            raise FREDClientError(f"FRED request failed: {exc.reason}") from exc

        if "error_code" in payload:
            raise FREDClientError(str(payload.get("error_message") or payload["error_code"]))

        rows = payload.get("observations")
        if not isinstance(rows, list):
            raise FREDClientError("FRED response did not include an observations list")

        return payload
