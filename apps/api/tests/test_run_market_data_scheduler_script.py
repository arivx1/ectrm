from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

from apps.api.scripts import run_market_data_scheduler


class _FakeSession:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class RunMarketDataSchedulerScriptTests(unittest.TestCase):
    def test_main_runs_due_providers_and_sleeps_between_cycles(self) -> None:
        first_session = _FakeSession()
        second_session = _FakeSession()
        statuses = [
            {
                "providers": [
                    {"provider": "EIA", "due_for_sync": True},
                    {"provider": "CAISO", "due_for_sync": True},
                ]
            },
            {
                "providers": [
                    {"provider": "EIA", "due_for_sync": False},
                    {"provider": "CAISO", "due_for_sync": False},
                ]
            },
        ]

        with patch.object(
            run_market_data_scheduler,
            "SessionLocal",
            side_effect=[first_session, second_session],
        ), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            side_effect=statuses,
        ), patch.object(
            run_market_data_scheduler,
            "sync_eia_series",
            return_value=SimpleNamespace(
                id=10,
                status="SUCCEEDED",
                series_count=1,
                observation_count=12,
                error_summary=None,
            ),
        ) as eia_mock, patch.object(
            run_market_data_scheduler,
            "sync_caiso_series",
            return_value=SimpleNamespace(
                id=11,
                status="SUCCEEDED",
                series_count=3,
                observation_count=3,
                error_summary=None,
            ),
        ) as caiso_mock, patch.object(run_market_data_scheduler.time, "sleep") as sleep_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "eia",
                "--provider",
                "caiso",
                "--poll-seconds",
                "60",
                "--requested-by",
                "scheduler",
                "--max-cycles",
                "2",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(first_session.closed)
        self.assertTrue(second_session.closed)
        eia_mock.assert_called_once()
        caiso_mock.assert_called_once()
        sleep_mock.assert_called_once_with(60)
        self.assertIn("Sleeping until", buffer.getvalue())

    def test_main_returns_one_when_provider_run_fails(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "FRED", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_fred_series",
            return_value=SimpleNamespace(
                id=12,
                status="FAILED",
                series_count=1,
                observation_count=0,
                error_summary="boom",
            ),
        ), patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "fred",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 1)
        self.assertTrue(session.closed)
        self.assertIn("boom", buffer.getvalue())

    def test_main_runs_kalshi_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "KALSHI", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_kalshi_series",
            return_value=SimpleNamespace(
                id=13,
                status="SUCCEEDED",
                series_count=5,
                observation_count=203,
                error_summary=None,
            ),
        ) as kalshi_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "kalshi",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        kalshi_mock.assert_called_once()
        self.assertIn("KALSHI scheduler run", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
