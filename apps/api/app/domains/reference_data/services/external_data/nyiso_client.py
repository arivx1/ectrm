from __future__ import annotations

import csv
import io
from time import perf_counter
from typing import Any, Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request, resolve_http_status_code


class NYISOClientError(RuntimeError):
    pass


logger = get_logger(__name__)


class NYISOClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.NYISO_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else settings.NYISO_TIMEOUT_SECONDS

    def fetch_realtime_zone_lbmps(self, *, zones: Iterable[str]) -> dict[str, Any]:
        normalized_zones = {zone.strip().upper() for zone in zones if zone.strip()}
        if not normalized_zones:
            raise NYISOClientError("No NYISO zones were requested")

        url = f"{self.base_url}/realtime/realtime_zone_lbmp.csv"
        started_at = perf_counter()
        try:
            with urlopen(url, timeout=self.timeout_seconds) as response:
                content = response.read().decode("utf-8-sig", errors="replace")
                log_outbound_request(
                    logger,
                    provider="NYISO",
                    method="GET",
                    url=url,
                    status_code=resolve_http_status_code(response),
                    duration_ms=(perf_counter() - started_at) * 1000,
                )
        except HTTPError as exc:
            log_outbound_request(
                logger,
                provider="NYISO",
                method="GET",
                url=url,
                status_code=exc.code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason or "http_error",
            )
            message = exc.read().decode("utf-8", errors="replace")
            raise NYISOClientError(f"NYISO request failed with HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            log_outbound_request(
                logger,
                provider="NYISO",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc.reason,
            )
            raise NYISOClientError(f"NYISO request failed: {exc.reason}") from exc

        rows = _parse_realtime_zone_lbmp_csv(content, zones=normalized_zones)
        return {
            "prices": rows,
            "source_url": url,
        }


def _parse_realtime_zone_lbmp_csv(content: str, *, zones: set[str]) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(content))
    required_headers = {
        "Time Stamp",
        "Name",
        "PTID",
        "LBMP ($/MWHr)",
        "Marginal Cost Losses ($/MWHr)",
        "Marginal Cost Congestion ($/MWHr)",
    }
    if reader.fieldnames is None or not required_headers.issubset(set(reader.fieldnames)):
        raise NYISOClientError("NYISO realtime LBMP CSV did not include expected headers")

    rows: list[dict[str, Any]] = []
    for row in reader:
        zone = str(row.get("Name") or "").strip()
        if zone.upper() not in zones:
            continue
        rows.append(
            {
                "timestamp": str(row.get("Time Stamp") or "").strip(),
                "zone": zone,
                "ptid": str(row.get("PTID") or "").strip(),
                "lbmp": str(row.get("LBMP ($/MWHr)") or "").strip(),
                "losses": str(row.get("Marginal Cost Losses ($/MWHr)") or "").strip(),
                "congestion": str(row.get("Marginal Cost Congestion ($/MWHr)") or "").strip(),
            }
        )

    if not rows:
        raise NYISOClientError("NYISO realtime LBMP CSV did not include any requested zone rows")
    return rows
