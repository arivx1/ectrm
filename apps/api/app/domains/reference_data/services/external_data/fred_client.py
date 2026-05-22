from __future__ import annotations

import csv
import io
import json
from time import perf_counter
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class FREDClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class FREDClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        graph_base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        raw_api_key = api_key if api_key is not None else settings.FRED_API_KEY
        self.api_key = raw_api_key.strip() if raw_api_key else ""
        self.base_url = (base_url if base_url is not None else settings.FRED_BASE_URL).rstrip("/")
        self.graph_base_url = (
            graph_base_url if graph_base_url is not None else settings.FRED_GRAPH_BASE_URL
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.FRED_TIMEOUT_SECONDS

    def fetch_series(
        self,
        *,
        series_id: str,
        observation_start: Optional[str] = None,
        limit: int = 100000,
    ) -> dict[str, Any]:
        if not self.api_key:
            return self._fetch_series_graph_csv(
                series_id=series_id,
                observation_start=observation_start,
                limit=limit,
            )

        return self._fetch_series_api(
            series_id=series_id,
            observation_start=observation_start,
            limit=limit,
        )

    def _fetch_series_api(
        self,
        *,
        series_id: str,
        observation_start: Optional[str],
        limit: int,
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
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
                log_outbound_request(
                    logger,
                    provider="FRED",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="FRED",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise FREDClientError(f"FRED request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="FRED",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise FREDClientError(f"FRED request failed: {exc.reason}") from exc

        if "error_code" in payload:
            raise FREDClientError(str(payload.get("error_message") or payload["error_code"]))

        rows = payload.get("observations")
        if not isinstance(rows, list):
            raise FREDClientError("FRED response did not include an observations list")

        return payload

    def _fetch_series_graph_csv(
        self,
        *,
        series_id: str,
        observation_start: Optional[str],
        limit: int,
    ) -> dict[str, Any]:
        params = {"id": series_id}
        url = f"{self.graph_base_url}/fredgraph.csv?{urlencode(params)}"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                csv_text = response.read().decode("utf-8-sig")
                log_outbound_request(
                    logger,
                    provider="FRED",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="FRED",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise FREDClientError(f"FRED graph request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="FRED",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise FREDClientError(f"FRED graph request failed: {exc.reason}") from exc

        return _parse_graph_csv(
            csv_text,
            series_id=series_id,
            observation_start=observation_start,
            limit=limit,
        )


def _parse_graph_csv(
    csv_text: str,
    *,
    series_id: str,
    observation_start: Optional[str],
    limit: int,
) -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None or len(reader.fieldnames) < 2:
        raise FREDClientError("FRED graph CSV did not include date and value columns")

    date_field = "observation_date" if "observation_date" in reader.fieldnames else reader.fieldnames[0]
    value_field = series_id if series_id in reader.fieldnames else reader.fieldnames[1]
    observations: list[dict[str, str]] = []

    for row in reader:
        raw_date = (row.get(date_field) or "").strip()
        if not raw_date:
            continue
        if observation_start and raw_date < observation_start:
            continue

        observations.append(
            {
                "date": raw_date,
                "value": (row.get(value_field) or "").strip(),
            }
        )
        if len(observations) >= limit:
            break

    return {
        "observations": observations,
        "count": len(observations),
        "source": "fredgraph.csv",
    }
