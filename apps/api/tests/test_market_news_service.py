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
        self.assertIn("price OR prices", payload["search_query"])
        self.assertIn("when:3d", payload["search_query"])
        self.assertEqual(payload["items"][0]["title"], "Crude rallies on supply risk")
        self.assertEqual(payload["items"][0]["source"], "Reuters")
        self.assertEqual(payload["items"][0]["link"], "https://news.google.com/rss/articles/abc")
        self.assertEqual(
            payload["items"][0]["published_at"].isoformat(),
            "2026-05-05T11:00:00+00:00",
        )
        assert fake_client.request_url is not None
        self.assertIn("q=refinery+outage+WTI+crude+oil", fake_client.request_url)
        self.assertIn("%28price+OR+prices+OR+supply+OR+demand", fake_client.request_url)
        self.assertIn("when%3A3d", fake_client.request_url)

    def test_fetch_headlines_expands_livestock_commodity_terms(self) -> None:
        body = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Cattle supply tightens on lower placements - Market Wire</title>
      <link>https://news.google.com/rss/articles/cattle</link>
      <pubDate>Tue, 05 May 2026 11:00:00 GMT</pubDate>
      <source>Market Wire</source>
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
                commodity="BEEF",
                limit=1,
                lookback_days=3,
            )

        self.assertEqual(payload["commodity"], "BEEF")
        self.assertIn("cattle beef livestock markets", payload["search_query"])
        self.assertIn("price OR prices", payload["search_query"])
        assert fake_client.request_url is not None
        self.assertIn("q=cattle+beef+livestock+markets", fake_client.request_url)
        self.assertIn("%28price+OR+prices+OR+supply+OR+demand", fake_client.request_url)
        self.assertIn("when%3A3d", fake_client.request_url)

    def test_fetch_headlines_filters_fish_noise_to_market_impact(self) -> None:
        body = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Behind the Badge - Why North Dakota?</title>
      <link>https://news.google.com/rss/articles/noise-1</link>
      <pubDate>Tue, 05 May 2026 03:03:00 GMT</pubDate>
      <source>North Dakota Game and Fish (.gov)</source>
    </item>
    <item>
      <title>Fish and mussels returned to these rivers after decades of cleanup. But new threats loom</title>
      <link>https://news.google.com/rss/articles/noise-2</link>
      <pubDate>Tue, 05 May 2026 04:04:00 GMT</pubDate>
      <source>Nebraska Public Media</source>
    </item>
    <item>
      <title>The Night A Country Music Legend Fried Our Fish</title>
      <link>https://news.google.com/rss/articles/noise-3</link>
      <pubDate>Tue, 05 May 2026 08:00:00 GMT</pubDate>
      <source>Georgia Outdoor News</source>
    </item>
    <item>
      <title>Interagency wildlife biologists receive Craighead Conservation Award</title>
      <link>https://news.google.com/rss/articles/noise-4</link>
      <pubDate>Tue, 05 May 2026 09:07:00 GMT</pubDate>
      <source>Wyoming Game and Fish (.gov)</source>
    </item>
    <item>
      <title>Los Angeles Restaurant Owner Paying Big Price for Fishing in Protected Channel Islands Waters</title>
      <link>https://news.google.com/rss/articles/noise-5</link>
      <pubDate>Tue, 05 May 2026 10:31:00 GMT</pubDate>
      <source>The Santa Barbara Independent</source>
    </item>
    <item>
      <title>Seafood prices rise as China demand strains supply - Reuters</title>
      <link>https://news.google.com/rss/articles/seafood-price</link>
      <pubDate>Tue, 05 May 2026 11:00:00 GMT</pubDate>
      <source>Reuters</source>
    </item>
    <item>
      <title>Salmon harvest falls after disease outbreak - SeafoodSource</title>
      <link>https://news.google.com/rss/articles/salmon-harvest</link>
      <pubDate>Tue, 05 May 2026 11:30:00 GMT</pubDate>
      <source>SeafoodSource</source>
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
                commodity="FISH",
                limit=5,
                lookback_days=3,
            )

        self.assertEqual(payload["commodity"], "FISH")
        self.assertIn("seafood OR aquaculture", payload["search_query"])
        self.assertIn("price OR prices", payload["search_query"])
        self.assertEqual(payload["count"], 2)
        self.assertEqual(
            [item["title"] for item in payload["items"]],
            [
                "Seafood prices rise as China demand strains supply",
                "Salmon harvest falls after disease outbreak",
            ],
        )
        assert fake_client.request_url is not None
        self.assertIn("q=%28seafood+OR+aquaculture", fake_client.request_url)
        self.assertIn("%28price+OR+prices+OR+supply+OR+demand", fake_client.request_url)

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
