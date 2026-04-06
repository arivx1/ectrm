from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class CFTCClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class CFTCClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.CFTC_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.CFTC_TIMEOUT_SECONDS

    def fetch_rows(
        self,
        *,
        dataset_code: str,
        filters: Optional[dict[str, Any]] = None,
        start: Optional[str] = None,
        limit: int = 100000,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"$limit": limit, "$order": "report_date_as_yyyy_mm_dd asc"}
        where_clauses: list[str] = []

        for field_name, value in (filters or {}).items():
            if value is None:
                continue
            escaped_value = str(value).replace("'", "''")
            where_clauses.append(f"{field_name} = '{escaped_value}'")

        if start:
            where_clauses.append(f"report_date_as_yyyy_mm_dd >= '{start}T00:00:00.000'")

        if where_clauses:
            params["$where"] = " AND ".join(where_clauses)

        url = f"{self.base_url}/resource/{dataset_code}.json?{urlencode(params)}"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                log_outbound_request(
                    logger,
                    provider="CFTC",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="CFTC",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise CFTCClientError(f"CFTC request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="CFTC",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise CFTCClientError(f"CFTC request failed: {exc.reason}") from exc

        if not isinstance(payload, list):
            raise CFTCClientError("CFTC response was not a list")
        if any(not isinstance(row, dict) for row in payload):
            raise CFTCClientError("CFTC response contained a non-object row")

        return payload
