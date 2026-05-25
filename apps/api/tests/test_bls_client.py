from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from apps.api.app.domains.reference_data.services.external_data import bls_client
from apps.api.app.domains.reference_data.services.external_data.bls_client import (
    BLSPPIClient,
    BLSPPIClientError,
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


class BLSPPIClientTests(unittest.TestCase):
    def test_fetch_series_posts_json_payload(self) -> None:
        calls: list[dict[str, object]] = []

        def fake_urlopen(request, timeout: int):
            calls.append(
                {
                    "url": request.full_url,
                    "body": json.loads(request.data.decode("utf-8")),
                    "timeout": timeout,
                }
            )
            return _FakeResponse(
                """
                {
                  "status": "REQUEST_SUCCEEDED",
                  "message": [],
                  "Results": {
                    "series": [
                      {
                        "seriesID": "WPU1017",
                        "data": [{"year": "2026", "period": "M04", "value": "344.202"}]
                      }
                    ]
                  }
                }
                """
            )

        client = BLSPPIClient(
            api_key="bls-key",
            base_url="https://bls.example/publicAPI/v2",
            timeout_seconds=5,
        )

        with patch.object(bls_client, "urlopen", side_effect=fake_urlopen):
            payload = client.fetch_series(
                series_ids=["wpu1017"],
                start_year=2025,
                end_year=2026,
            )

        self.assertEqual(payload["Results"]["series"][0]["seriesID"], "WPU1017")
        self.assertEqual(calls[0]["url"], "https://bls.example/publicAPI/v2/timeseries/data/")
        self.assertEqual(calls[0]["body"]["seriesid"], ["WPU1017"])
        self.assertEqual(calls[0]["body"]["startyear"], "2025")
        self.assertEqual(calls[0]["body"]["endyear"], "2026")
        self.assertEqual(calls[0]["body"]["registrationkey"], "bls-key")
        self.assertEqual(calls[0]["timeout"], 5)

    def test_fetch_series_rejects_unsuccessful_bls_response(self) -> None:
        def fake_urlopen(request, timeout: int):
            return _FakeResponse(
                '{"status":"REQUEST_NOT_PROCESSED","message":["invalid series"],"Results":{"series":[]}}'
            )

        client = BLSPPIClient(base_url="https://bls.example/publicAPI/v2", timeout_seconds=5)

        with patch.object(bls_client, "urlopen", side_effect=fake_urlopen):
            with self.assertRaisesRegex(BLSPPIClientError, "invalid series"):
                client.fetch_series(series_ids=["WPU_BAD"])


if __name__ == "__main__":
    unittest.main()
