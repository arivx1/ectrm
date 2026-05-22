from __future__ import annotations

import json
from time import perf_counter
from typing import Any, Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class MISOClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class MISOClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.MISO_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.MISO_TIMEOUT_SECONDS

    def fetch_realtime_five_minute_expost(self, *, nodes: Iterable[str]) -> dict[str, Any]:
        normalized_nodes = {node.strip().upper() for node in nodes if node.strip()}
        if not normalized_nodes:
            raise MISOClientError("No MISO pricing nodes were requested")

        url = f"{self.base_url}/api/MarketPricing/GetRealTimeFiveMinExPost/Current"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8", errors="replace"))
                log_outbound_request(
                    logger,
                    provider="MISO",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="MISO",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise MISOClientError(f"MISO request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="MISO",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise MISOClientError(f"MISO request failed: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise MISOClientError("MISO realtime ex-post response was not valid JSON") from exc

        rows = _parse_realtime_five_minute_expost(payload, nodes=normalized_nodes)
        return {
            "prices": rows,
            "source_url": url,
        }


def _parse_realtime_five_minute_expost(payload: Any, *, nodes: set[str]) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise MISOClientError("MISO realtime ex-post response was not a JSON object")

    headers = payload.get("headers")
    data = payload.get("data")
    if not isinstance(headers, list) or not isinstance(data, list):
        raise MISOClientError("MISO realtime ex-post response did not include headers and data")

    normalized_headers = [str(header).strip().upper() for header in headers]
    required_headers = {"INTERVAL", "CPNODE", "LMP", "MLC", "MCC"}
    if not required_headers.issubset(set(normalized_headers)):
        raise MISOClientError("MISO realtime ex-post response did not include expected headers")

    index_by_header = {header: index for index, header in enumerate(normalized_headers)}
    rows: list[dict[str, Any]] = []
    for raw_row in data:
        if not isinstance(raw_row, list):
            continue
        node = _row_value(raw_row, index_by_header["CPNODE"])
        if node.upper() not in nodes:
            continue
        rows.append(
            {
                "interval": _row_value(raw_row, index_by_header["INTERVAL"]),
                "node": node,
                "lmp": _row_value(raw_row, index_by_header["LMP"]),
                "losses": _row_value(raw_row, index_by_header["MLC"]),
                "congestion": _row_value(raw_row, index_by_header["MCC"]),
            }
        )

    if not rows:
        raise MISOClientError("MISO realtime ex-post response did not include any requested node rows")
    return rows


def _row_value(row: list[Any], index: int) -> str:
    if index >= len(row):
        return ""
    return str(row[index] or "").strip()
