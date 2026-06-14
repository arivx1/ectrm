from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class USDANASSClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class USDANASSClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        raw_api_key = api_key if api_key is not None else settings.USDA_NASS_API_KEY
        self.api_key = raw_api_key.strip() if raw_api_key else ""
        self.base_url = (base_url if base_url is not None else settings.USDA_NASS_BASE_URL).rstrip("/")
        self.timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else settings.USDA_NASS_TIMEOUT_SECONDS
        )

    def fetch_price_series(self, *, query_params: Mapping[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise USDANASSClientError("USDA NASS API key is required")

        params: dict[str, Any] = {
            "key": self.api_key,
            "format": "JSON",
        }
        params.update(
            {
                str(key): value
                for key, value in query_params.items()
                if value is not None and str(value).strip()
            }
        )
        url = f"{self.base_url}/api_GET/?{urlencode(params)}"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                log_outbound_request(
                    logger,
                    provider="USDA_NASS",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="USDA_NASS",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise USDANASSClientError(
                f"USDA NASS request failed with HTTP {exc.code}: {message}"
            ) from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="USDA_NASS",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise USDANASSClientError(f"USDA NASS request failed: {exc.reason}") from exc

        errors = payload.get("error") if isinstance(payload, dict) else None
        if errors:
            if isinstance(errors, list):
                raise USDANASSClientError("; ".join(str(error) for error in errors))
            raise USDANASSClientError(str(errors))

        rows = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            raise USDANASSClientError("USDA NASS response did not include a data list")

        return payload
