from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from time import perf_counter
from typing import Any, Optional
from urllib.parse import urlencode
from xml.etree import ElementTree

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request

DEFAULT_MARKET_NEWS_LIMIT = 5
MAX_MARKET_NEWS_LIMIT = 10
DEFAULT_MARKET_NEWS_LOOKBACK_DAYS = 2
MAX_MARKET_NEWS_LOOKBACK_DAYS = 14

COMMODITY_NEWS_TERMS = {
    "WTI": "WTI crude oil",
    "BRENT": "Brent crude oil",
    "HH": "Henry Hub natural gas",
    "NATGAS": "natural gas",
    "NG": "natural gas",
    "NATURAL_GAS": "natural gas",
    "POWER": "power markets electricity grid",
}

logger = get_logger(__name__)


class MarketNewsClientError(RuntimeError):
    pass


class MarketNewsClient:
    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.MARKET_NEWS_RSS_BASE_URL).strip()
        self.timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.MARKET_NEWS_TIMEOUT_SECONDS
        )

        if not self.base_url:
            raise MarketNewsClientError("MARKET_NEWS_RSS_BASE_URL is not configured")

    def fetch_headlines(
        self,
        *,
        query: Optional[str] = None,
        commodity: Optional[str] = None,
        limit: int = DEFAULT_MARKET_NEWS_LIMIT,
        lookback_days: int = DEFAULT_MARKET_NEWS_LOOKBACK_DAYS,
    ) -> dict[str, Any]:
        normalized_limit = max(1, min(int(limit), MAX_MARKET_NEWS_LIMIT))
        normalized_lookback_days = max(1, min(int(lookback_days), MAX_MARKET_NEWS_LOOKBACK_DAYS))
        normalized_query = _normalize_optional_text(query)
        normalized_commodity = _normalize_optional_text(commodity)
        if normalized_commodity is not None:
            normalized_commodity = normalized_commodity.upper()

        search_query = _build_search_query(
            query=normalized_query,
            commodity=normalized_commodity,
            lookback_days=normalized_lookback_days,
        )
        url = f"{self.base_url}?{urlencode(_build_search_params(search_query))}"
        started_at = perf_counter()

        try:
            with httpx.Client(timeout=self.timeout_seconds, follow_redirects=True) as client:
                response = client.get(
                    url,
                    headers={
                        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.1",
                    },
                )
            response.raise_for_status()
            log_outbound_request(
                logger,
                provider="MARKET_NEWS",
                method="GET",
                url=url,
                status_code=response.status_code,
                duration_ms=(perf_counter() - started_at) * 1000,
            )
        except httpx.HTTPStatusError as exc:
            log_outbound_request(
                logger,
                provider="MARKET_NEWS",
                method="GET",
                url=url,
                status_code=exc.response.status_code,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise MarketNewsClientError(
                f"Market news request failed with HTTP {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            log_outbound_request(
                logger,
                provider="MARKET_NEWS",
                method="GET",
                url=url,
                status_code=None,
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise MarketNewsClientError(f"Market news request failed: {exc}") from exc

        return _parse_market_news_feed(
            xml_text=response.text,
            commodity=normalized_commodity,
            search_query=search_query,
            limit=normalized_limit,
        )


def load_market_news_headlines(
    *,
    query: Optional[str] = None,
    commodity: Optional[str] = None,
    limit: int = DEFAULT_MARKET_NEWS_LIMIT,
    lookback_days: int = DEFAULT_MARKET_NEWS_LOOKBACK_DAYS,
) -> dict[str, Any]:
    return MarketNewsClient().fetch_headlines(
        query=query,
        commodity=commodity,
        limit=limit,
        lookback_days=lookback_days,
    )


def _build_search_params(query: str) -> dict[str, str]:
    return {
        "q": query,
        "hl": "en-US",
        "gl": "US",
        "ceid": "US:en",
    }


def _build_search_query(
    *,
    query: Optional[str],
    commodity: Optional[str],
    lookback_days: int,
) -> str:
    terms: list[str] = []
    if query:
        terms.append(query)
    if commodity:
        terms.append(COMMODITY_NEWS_TERMS.get(commodity, commodity))
    if not terms:
        terms.append("commodity markets")
    terms.append(f"when:{lookback_days}d")
    return " ".join(_dedupe_preserving_order(terms))


def _parse_market_news_feed(
    *,
    xml_text: str,
    commodity: Optional[str],
    search_query: str,
    limit: int,
) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        raise MarketNewsClientError("Market news feed did not return valid RSS.") from exc

    items: list[dict[str, Any]] = []
    for item in root.findall("./channel/item"):
        title = _normalize_optional_text(item.findtext("title"))
        link = _normalize_optional_text(item.findtext("link"))
        source = _normalize_optional_text(item.findtext("source"))
        published_at = _parse_published_at(item.findtext("pubDate"))
        if not title or not link:
            continue
        cleaned_title = _strip_title_source_suffix(title, source)
        items.append(
            {
                "title": cleaned_title,
                "source": source,
                "published_at": published_at,
                "link": link,
            }
        )
        if len(items) >= limit:
            break

    return {
        "generated_at": datetime.now(timezone.utc),
        "commodity": commodity,
        "search_query": search_query,
        "count": len(items),
        "items": items,
    }


def _parse_published_at(value: Optional[str]) -> Optional[datetime]:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return None
    parsed = parsedate_to_datetime(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _strip_title_source_suffix(title: str, source: Optional[str]) -> str:
    if source and title.endswith(f" - {source}"):
        return title[: -(len(source) + 3)].strip()
    return title


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    normalized = str(value or "").strip()
    return normalized or None


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        key = value.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(value)
    return ordered
