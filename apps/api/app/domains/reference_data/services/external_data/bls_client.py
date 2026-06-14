from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class BLSPPIClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class BLSPPIClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        raw_api_key = api_key if api_key is not None else settings.BLS_API_KEY
        self.api_key = raw_api_key.strip() if raw_api_key else ""
        self.base_url = (base_url if base_url is not None else settings.BLS_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.BLS_TIMEOUT_SECONDS

    def fetch_series(
        self,
        *,
        series_ids: Sequence[str],
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> dict[str, Any]:
        normalized_series_ids = [series_id.strip().upper() for series_id in series_ids if series_id.strip()]
        if not normalized_series_ids:
            raise BLSPPIClientError("At least one BLS PPI series id is required")

        request_body: dict[str, Any] = {"seriesid": normalized_series_ids}
        if start_year is not None:
            request_body["startyear"] = str(start_year)
        if end_year is not None:
            request_body["endyear"] = str(end_year)
        if self.api_key:
            request_body["registrationkey"] = self.api_key

        url = f"{self.base_url}/timeseries/data/"
        request = Request(
            url,
            data=json.dumps(request_body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        started_at = perf_counter()
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                log_outbound_request(
                    logger,
                    provider="BLS_PPI",
                    method="POST",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="BLS_PPI",
                method="POST",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise BLSPPIClientError(f"BLS PPI request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="BLS_PPI",
                method="POST",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise BLSPPIClientError(f"BLS PPI request failed: {exc.reason}") from exc

        if not isinstance(payload, dict):
            raise BLSPPIClientError("BLS PPI response was not a JSON object")

        if payload.get("status") != "REQUEST_SUCCEEDED":
            message = payload.get("message")
            if isinstance(message, list):
                detail = "; ".join(str(item) for item in message)
            else:
                detail = str(message or payload.get("status") or "unknown_error")
            raise BLSPPIClientError(f"BLS PPI request was not successful: {detail}")

        results = payload.get("Results")
        series = results.get("series") if isinstance(results, dict) else None
        if not isinstance(series, list):
            raise BLSPPIClientError("BLS PPI response did not include a Results.series list")

        return payload
