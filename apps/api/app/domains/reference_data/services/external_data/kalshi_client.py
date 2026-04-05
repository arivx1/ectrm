from __future__ import annotations

import json
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import urlopen

from apps.api.app.config import settings


class KalshiClientError(RuntimeError):
    def __init__(self, message: str, *, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class KalshiClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.KALSHI_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.KALSHI_TIMEOUT_SECONDS

    def fetch_market(self, *, market_ticker: str) -> dict[str, Any]:
        payload = self._request_json(path=f"/markets/{quote(market_ticker, safe='')}")
        if not isinstance(payload, dict):
            raise KalshiClientError("Kalshi market response was not an object")
        return payload

    def fetch_market_candlesticks(
        self,
        *,
        market_ticker: str,
        start_ts: int,
        end_ts: int,
        period_interval: int = 1440,
        series_ticker: Optional[str] = None,
    ) -> dict[str, Any]:
        try:
            market = self.fetch_market(market_ticker=market_ticker)
            resolved_series_ticker = (
                (series_ticker or "").strip()
                or self._series_ticker_from_market_payload(market)
                or self._infer_series_ticker(market_ticker)
            )
            payload = self._request_json(
                path=(
                    f"/series/{quote(resolved_series_ticker, safe='')}"
                    f"/markets/{quote(market_ticker, safe='')}/candlesticks"
                ),
                params={
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                    "period_interval": period_interval,
                },
            )
        except KalshiClientError as exc:
            if exc.status_code != 404:
                raise
            payload = self._request_json(
                path=f"/historical/markets/{quote(market_ticker, safe='')}/candlesticks",
                params={
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                    "period_interval": period_interval,
                },
            )

        if not isinstance(payload, dict):
            raise KalshiClientError("Kalshi candlestick response was not an object")
        if not isinstance(payload.get("candlesticks"), list):
            raise KalshiClientError("Kalshi candlestick response did not include a candlesticks list")
        return payload

    def _request_json(self, *, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        query = urlencode(params or {})
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{query}"

        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise KalshiClientError(
                f"Kalshi request failed with HTTP {exc.code}: {message}",
                status_code=exc.code,
            ) from exc
        except URLError as exc:
            raise KalshiClientError(f"Kalshi request failed: {exc.reason}") from exc

    def _series_ticker_from_market_payload(self, payload: dict[str, Any]) -> Optional[str]:
        series_ticker = payload.get("series_ticker")
        if isinstance(series_ticker, str) and series_ticker.strip():
            return series_ticker.strip()

        event_ticker = payload.get("event_ticker")
        if isinstance(event_ticker, str) and "-" in event_ticker:
            return event_ticker.split("-", maxsplit=1)[0].strip()

        market_ticker = payload.get("ticker")
        if isinstance(market_ticker, str) and market_ticker.strip():
            return self._infer_series_ticker(market_ticker)
        return None

    def _infer_series_ticker(self, market_ticker: str) -> str:
        normalized = market_ticker.strip()
        if "-" not in normalized:
            raise KalshiClientError(
                "Kalshi market ticker did not include a series prefix and no dataset_code override was provided"
            )
        return normalized.split("-", maxsplit=1)[0].strip()
