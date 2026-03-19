from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

from apps.api.scripts import run_nws_weather_scheduler


class _FakeSession:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class RunNwsWeatherSchedulerScriptTests(unittest.TestCase):
    def test_main_loops_until_max_runs_and_sleeps_between_runs(self) -> None:
        first_session = _FakeSession()
        second_session = _FakeSession()
        with patch.object(
            run_nws_weather_scheduler,
            "SessionLocal",
            side_effect=[first_session, second_session],
        ), patch.object(
            run_nws_weather_scheduler,
            "sync_nws_weather_locations",
            side_effect=[
                SimpleNamespace(id=10, status="SUCCEEDED", series_count=2, observation_count=12, error_summary=None),
                SimpleNamespace(id=11, status="SUCCEEDED", series_count=2, observation_count=12, error_summary=None),
            ],
        ) as sync_mock, patch.object(run_nws_weather_scheduler.time, "sleep") as sleep_mock, patch(
            "sys.argv",
            [
                "run_nws_weather_scheduler.py",
                "--interval-minutes",
                "1",
                "--observation-limit",
                "12",
                "--requested-by",
                "scheduler",
                "--max-runs",
                "2",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_nws_weather_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(first_session.closed)
        self.assertTrue(second_session.closed)
        self.assertEqual(sync_mock.call_count, 2)
        sleep_mock.assert_called_once_with(60)
        self.assertIn("Sleeping until", buffer.getvalue())

    def test_main_returns_one_for_failed_single_run(self) -> None:
        session = _FakeSession()
        with patch.object(run_nws_weather_scheduler, "SessionLocal", return_value=session), patch.object(
            run_nws_weather_scheduler,
            "sync_nws_weather_locations",
            return_value=SimpleNamespace(
                id=12,
                status="FAILED",
                series_count=1,
                observation_count=0,
                error_summary="boom",
            ),
        ), patch("sys.argv", ["run_nws_weather_scheduler.py", "--max-runs", "1"]):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_nws_weather_scheduler.main()

        self.assertEqual(exit_code, 1)
        self.assertTrue(session.closed)
        self.assertIn("boom", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
