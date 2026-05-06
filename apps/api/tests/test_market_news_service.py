from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx

from apps.api.app.domains.reference_data.services.external_data.market_news import (
    MarketNewsClient,
    MarketNewsClientError,
)


def _response(url: str, status_code: int, body: str) -> httpx.Response:
    return httpx.Response(
        status_code,
        text=body,
        request=httpx.Request("GET", url),
    )


class _FakeHttpxClient:
    def __init__(self, response_or_exception: httpx.Response | Exception) -> None:
        self.response_or_exception = response_or_exception
        self.request_url: str | None = None

    def __enter__(self) -> "_FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, url: str, **kwargs: object) -> httpx.Response:
        self.request_url = url
        if isinstance(self.response_or_exception, Exception):
            raise self.response_or_exception
        return self.response_or_exception


class MarketNewsClientTests(unittest.TestCase):
    def test_fetch_headlines_parses_live_rss_feed(self) -> None:
        body = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Crude rallies on supply risk - Reuters</title>
      <link>https://news.google.com/rss/articles/abc</link>
      <pubDate>Tue, 05 May 2026 11:00:00 GMT</pubDate>
      <source>Reuters</source>
    </item>
    <item>
      <title>Prompt oil spreads tighten - Bloomberg</title>
      <link>https://news.google.com/rss/articles/def</link>
      <pubDate>Tue, 05 May 2026 09:30:00 GMT</pubDate>
      <source>Bloomberg</source>
    </item>
  </channel>
</rss>
"""
        fake_client = _FakeHttpxClient(
            _response("https://news.google.com/rss/search?q=test", 200, body)
        )

        with patch(
            "apps.api.app.domains.reference_data.services.external_data.market_news.httpx.Client",
            return_value=fake_client,
        ):
            payload = MarketNewsClient().fetch_headlines(
                commodity="WTI",
                query="refinery outage",
                limit=2,
                lookback_days=3,
            )

        self.assertEqual(payload["commodity"], "WTI")
        self.assertEqual(payload["count"], 2)
        self.assertIn("refinery outage", payload["search_query"])
        self.assertIn("WTI crude oil", payload["search_query"])
        self.assertIn("when:3d", payload["search_query"])
        self.assertEqual(payload["items"][0]["title"], "Crude rallies on supply risk")
        self.assertEqual(payload["items"][0]["source"], "Reuters")
        self.assertEqual(payload["items"][0]["link"], "https://news.google.com/rss/articles/abc")
        self.assertEqual(
            payload["items"][0]["published_at"].isoformat(),
            "2026-05-05T11:00:00+00:00",
        )
        assert fake_client.request_url is not None
        self.assertIn("q=refinery+outage+WTI+crude+oil+when%3A3d", fake_client.request_url)

    def test_fetch_headlines_raises_for_http_failures(self) -> None:
        fake_client = _FakeHttpxClient(
            _response("https://news.google.com/rss/search?q=test", 502, "bad gateway")
        )

        with patch(
            "apps.api.app.domains.reference_data.services.external_data.market_news.httpx.Client",
            return_value=fake_client,
        ):
            with self.assertRaises(MarketNewsClientError):
                MarketNewsClient().fetch_headlines(query="oil")
