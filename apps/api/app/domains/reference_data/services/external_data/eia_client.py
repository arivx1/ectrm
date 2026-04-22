from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class EIAClientError(RuntimeError):
    pass


logger = get_logger(__name__)


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
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                log_outbound_request(
                    logger,
                    provider="EIA",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="EIA",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise EIAClientError(f"EIA request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="EIA",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
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
