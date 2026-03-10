from __future__ import annotations

import json
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from apps.api.app.config import settings


class EIAClientError(RuntimeError):
    pass


class EIAClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else settings.EIA_API_KEY
        self.base_url = (base_url if base_url is not None else settings.EIA_BASE_URL).rstrip("/")
        self.timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else settings.EIA_TIMEOUT_SECONDS
        )

        if not self.api_key:
            raise EIAClientError("EIA_API_KEY is not configured")

    def fetch_series(
        self,
        *,
        series_id: str,
        frequency: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        length: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"api_key": self.api_key}
        if frequency:
            params["frequency"] = frequency
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        if length is not None:
            params["length"] = length
        if offset is not None:
            params["offset"] = offset

        url = f"{self.base_url}/seriesid/{series_id}?{urlencode(params)}"
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise EIAClientError(f"EIA request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            raise EIAClientError(f"EIA request failed: {exc.reason}") from exc

        if "error" in payload:
            raise EIAClientError(str(payload["error"]))
        if "response" not in payload:
            raise EIAClientError("EIA response did not include a response payload")

        response_payload = payload["response"]
        if not isinstance(response_payload, dict):
            raise EIAClientError("EIA response payload was not an object")

        data = response_payload.get("data", [])
        if data is None:
            response_payload["data"] = []
        elif not isinstance(data, list):
            raise EIAClientError("EIA response data payload was not a list")

        return payload
