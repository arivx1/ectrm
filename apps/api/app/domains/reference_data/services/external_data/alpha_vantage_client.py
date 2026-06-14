from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class AlphaVantageClientError(RuntimeError):
    pass


logger = get_logger(__name__)


_SYMBOL_FUNCTIONS = {
    "GLOBAL_QUOTE",
    "TIME_SERIES_DAILY",
    "TIME_SERIES_DAILY_ADJUSTED",
    "TIME_SERIES_INTRADAY",
    "TIME_SERIES_WEEKLY",
    "TIME_SERIES_MONTHLY",
}


class AlphaVantageClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        raw_api_key = api_key if api_key is not None else settings.ALPHA_VANTAGE_API_KEY
        self.api_key = raw_api_key.strip() if raw_api_key else ""
        self.base_url = base_url if base_url is not None else settings.ALPHA_VANTAGE_BASE_URL
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.ALPHA_VANTAGE_TIMEOUT_SECONDS
        )

    def fetch_series(
        self,
        *,
        function: str,
        symbol: str,
        interval: Optional[str] = None,
        outputsize: Optional[str] = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise AlphaVantageClientError("ALPHA_VANTAGE_API_KEY is not configured")

        normalized_function = function.strip().upper()
        params: dict[str, Any] = {
            "function": normalized_function,
            "apikey": self.api_key,
        }
        if normalized_function in _SYMBOL_FUNCTIONS:
            params["symbol"] = symbol.strip().upper()
        if interval:
            params["interval"] = interval.strip().lower()
        if outputsize:
            params["outputsize"] = outputsize.strip().lower()

        url = f"{self.base_url}?{urlencode(params)}"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                log_outbound_request(
                    logger,
                    provider="ALPHA_VANTAGE",
                    method="GET",
                    url=_redact_api_key(url),
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="ALPHA_VANTAGE",
                method="GET",
                url=_redact_api_key(url),
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise AlphaVantageClientError(
                f"Alpha Vantage request failed with HTTP {exc.code}: {message}"
            ) from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="ALPHA_VANTAGE",
                method="GET",
                url=_redact_api_key(url),
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise AlphaVantageClientError(f"Alpha Vantage request failed: {exc.reason}") from exc

        if not isinstance(payload, dict):
            raise AlphaVantageClientError("Alpha Vantage response was not a JSON object")
        if payload.get("Error Message"):
            raise AlphaVantageClientError(str(payload["Error Message"]))
        if payload.get("Note"):
            raise AlphaVantageClientError(str(payload["Note"]))
        if payload.get("Information"):
            raise AlphaVantageClientError(str(payload["Information"]))

        return payload


def _redact_api_key(url: str) -> str:
    parts = urlsplit(url)
    query = urlencode(
        [
            (key, "***" if key.lower() == "apikey" else value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
        ]
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))
