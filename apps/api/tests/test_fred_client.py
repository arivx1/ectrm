from __future__ import annotations

import unittest
from unittest.mock import patch

from apps.api.app.domains.reference_data.services.external_data import fred_client
from apps.api.app.domains.reference_data.services.external_data.fred_client import FREDClient


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


class FREDClientTests(unittest.TestCase):
    def test_fetch_series_uses_graph_csv_without_api_key(self) -> None:
        csv_body = "\n".join(
            [
                "observation_date,PNGASJPUSDM",
                "2026-02-01,11.25",
                "2026-03-01,12.50",
            ]
        )
        calls: list[str] = []

        def fake_urlopen(url: str, timeout: int):
            calls.append(url)
            return _FakeResponse(csv_body)

        client = FREDClient(
            api_key="",
            graph_base_url="https://fred.example/graph",
            timeout_seconds=5,
        )

        with patch.object(fred_client, "urlopen", side_effect=fake_urlopen):
            payload = client.fetch_series(
                series_id="PNGASJPUSDM",
                observation_start="2026-03-01",
            )

        self.assertEqual(calls, ["https://fred.example/graph/fredgraph.csv?id=PNGASJPUSDM"])
        self.assertEqual(
            payload["observations"],
            [
                {
                    "date": "2026-03-01",
                    "value": "12.50",
                }
            ],
        )
        self.assertEqual(payload["source"], "fredgraph.csv")


if __name__ == "__main__":
    unittest.main()
