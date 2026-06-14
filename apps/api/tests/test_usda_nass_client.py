from __future__ import annotations

import unittest
from unittest.mock import patch

from apps.api.app.domains.reference_data.services.external_data import usda_nass_client
from apps.api.app.domains.reference_data.services.external_data.usda_nass_client import (
    USDANASSClient,
    USDANASSClientError,
)


class _FakeResponse:
    status = 200

    def __init__(self, body: str) -> None:
        self.body = body.encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self.body

    def getcode(self) -> int:
        return self.status


class USDANASSClientTests(unittest.TestCase):
    def test_fetch_price_series_requires_api_key(self) -> None:
        client = USDANASSClient(api_key="", base_url="https://nass.example/api", timeout_seconds=5)

        with self.assertRaisesRegex(USDANASSClientError, "API key"):
            client.fetch_price_series(query_params={"commodity_desc": "CORN"})

    def test_fetch_price_series_returns_data_payload(self) -> None:
        calls: list[str] = []

        def fake_urlopen(url: str, timeout: int):
            calls.append(url)
            return _FakeResponse('{"data":[{"year":"2026","Value":"4.25"}]}')

        client = USDANASSClient(
            api_key="nass-key",
            base_url="https://nass.example/api",
            timeout_seconds=5,
        )

        with patch.object(usda_nass_client, "urlopen", side_effect=fake_urlopen):
            payload = client.fetch_price_series(
                query_params={
                    "commodity_desc": "CORN",
                    "short_desc": "CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU",
                }
            )

        self.assertEqual(payload["data"][0]["Value"], "4.25")
        self.assertIn("https://nass.example/api/api_GET/?", calls[0])
        self.assertIn("key=nass-key", calls[0])
        self.assertIn("commodity_desc=CORN", calls[0])
        self.assertIn("format=JSON", calls[0])


if __name__ == "__main__":
    unittest.main()
