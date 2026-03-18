from __future__ import annotations

import io
import json
import unittest
from urllib.error import URLError
from urllib.parse import parse_qs
from urllib.parse import urlsplit
from unittest.mock import patch

from apps.api.app.domains.weather.services.external_data.nws_client import NWSClient
from apps.api.app.domains.weather.services.external_data.nws_client import NWSClientError


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._buffer = io.BytesIO(json.dumps(payload).encode("utf-8"))

    def read(self) -> bytes:
        return self._buffer.read()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class NWSClientTests(unittest.TestCase):
    def test_get_point_builds_expected_request(self) -> None:
        captured: dict[str, object] = {}

        def fake_urlopen(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return _FakeResponse({"properties": {"gridId": "TOP", "gridX": 31, "gridY": 80}})

        with patch(
            "apps.api.app.domains.weather.services.external_data.nws_client.urlopen",
            side_effect=fake_urlopen,
        ):
            client = NWSClient(
                user_agent="ECTRM Test (ops@example.com)",
                base_url="https://api.weather.gov",
                timeout_seconds=15,
            )
            client.get_point(latitude=39.7456, longitude=-97.0892)

        request = captured["request"]
        self.assertEqual(request.full_url, "https://api.weather.gov/points/39.7456,-97.0892")
        self.assertEqual(captured["timeout"], 15)
        self.assertEqual(request.get_header("User-agent"), "ECTRM Test (ops@example.com)")
        self.assertEqual(request.get_header("Accept"), "application/geo+json")

    def test_get_station_observations_encodes_query_params(self) -> None:
        captured: dict[str, object] = {}

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            return _FakeResponse({"features": []})

        with patch(
            "apps.api.app.domains.weather.services.external_data.nws_client.urlopen",
            side_effect=fake_urlopen,
        ):
            client = NWSClient(user_agent="ECTRM Test (ops@example.com)")
            client.get_station_observations(
                station_id="kbos",
                start="2026-03-15T00:00:00+00:00",
                end="2026-03-15T12:00:00+00:00",
                limit=12,
            )

        parsed = urlsplit(captured["url"])
        query = parse_qs(parsed.query)
        self.assertEqual(parsed.path, "/stations/KBOS/observations")
        self.assertEqual(query["start"], ["2026-03-15T00:00:00+00:00"])
        self.assertEqual(query["end"], ["2026-03-15T12:00:00+00:00"])
        self.assertEqual(query["limit"], ["12"])

    def test_client_requires_user_agent(self) -> None:
        with self.assertRaisesRegex(NWSClientError, "NWS_USER_AGENT is not configured"):
            NWSClient(user_agent="   ")

    def test_client_wraps_network_errors(self) -> None:
        with patch(
            "apps.api.app.domains.weather.services.external_data.nws_client.urlopen",
            side_effect=URLError("boom"),
        ):
            client = NWSClient(user_agent="ECTRM Test (ops@example.com)")
            with self.assertRaisesRegex(NWSClientError, "boom"):
                client.get_point(latitude=39.7456, longitude=-97.0892)


if __name__ == "__main__":
    unittest.main()
