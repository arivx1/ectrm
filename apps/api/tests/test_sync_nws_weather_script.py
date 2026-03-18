from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

from apps.api.scripts import sync_nws_weather_data


class _FakeSession:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class SyncNwsWeatherScriptTests(unittest.TestCase):
    def test_main_returns_zero_and_passes_filters(self) -> None:
        session = _FakeSession()
        with patch.object(sync_nws_weather_data, "SessionLocal", return_value=session), patch.object(
            sync_nws_weather_data,
            "sync_nws_weather_locations",
            return_value=SimpleNamespace(
                id=42,
                status="SUCCEEDED",
                series_count=2,
                observation_count=18,
                error_summary=None,
            ),
        ) as sync_mock, patch(
            "sys.argv",
            [
                "sync_nws_weather_data.py",
                "--location-code",
                "BOS_LOAD",
                "--location-code",
                "NYC_LOAD",
                "--observation-limit",
                "12",
                "--requested-by",
                "codex",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = sync_nws_weather_data.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        sync_mock.assert_called_once_with(
            session,
            location_codes=["BOS_LOAD", "NYC_LOAD"],
            observation_limit=12,
            requested_by="codex",
        )
        self.assertIn("NWS sync run 42 finished with status=SUCCEEDED", buffer.getvalue())

    def test_main_returns_one_when_run_failed(self) -> None:
        session = _FakeSession()
        with patch.object(sync_nws_weather_data, "SessionLocal", return_value=session), patch.object(
            sync_nws_weather_data,
            "sync_nws_weather_locations",
            return_value=SimpleNamespace(
                id=99,
                status="FAILED",
                series_count=1,
                observation_count=0,
                error_summary="boom",
            ),
        ), patch("sys.argv", ["sync_nws_weather_data.py"]):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = sync_nws_weather_data.main()

        self.assertEqual(exit_code, 1)
        self.assertTrue(session.closed)
        self.assertIn("boom", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
