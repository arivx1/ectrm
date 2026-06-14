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

    def test_main_runs_alpha_vantage_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "ALPHA_VANTAGE", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_alpha_vantage_prices",
            return_value=SimpleNamespace(
                id=21,
                status="SUCCEEDED",
                series_count=3,
                observation_count=3,
                error_summary=None,
            ),
        ) as alpha_vantage_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "alpha-vantage",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        alpha_vantage_mock.assert_called_once()
        self.assertIn("ALPHA_VANTAGE scheduler run", buffer.getvalue())

    def test_main_runs_eia_fundamentals_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "EIA_FUNDAMENTALS", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_eia_fundamental_series",
            return_value=SimpleNamespace(
                id=14,
                status="SUCCEEDED",
                series_count=4,
                observation_count=4,
                error_summary=None,
            ),
        ) as eia_fundamentals_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "eia-fundamentals",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        eia_fundamentals_mock.assert_called_once()
        self.assertIn("EIA_FUNDAMENTALS scheduler run", buffer.getvalue())

    def test_main_runs_eia_wholesale_power_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "EIA_WHOLESALE_POWER", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_eia_wholesale_power_series",
            return_value=SimpleNamespace(
                id=15,
                status="SUCCEEDED",
                series_count=1,
                observation_count=1,
                error_summary=None,
            ),
        ) as eia_wholesale_power_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "eia-wholesale-power",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        eia_wholesale_power_mock.assert_called_once()
        self.assertIn("EIA_WHOLESALE_POWER scheduler run", buffer.getvalue())

    def test_main_runs_world_bank_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "WORLD_BANK", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_world_bank_series",
            return_value=SimpleNamespace(
                id=18,
                status="SUCCEEDED",
                series_count=17,
                observation_count=34,
                error_summary=None,
            ),
        ) as world_bank_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "world-bank",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        world_bank_mock.assert_called_once()
        self.assertIn("WORLD_BANK scheduler run", buffer.getvalue())

    def test_main_runs_bls_ppi_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "BLS_PPI", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_bls_ppi_series",
            return_value=SimpleNamespace(
                id=20,
                status="SUCCEEDED",
                series_count=10,
                observation_count=120,
                error_summary=None,
            ),
        ) as bls_ppi_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "bls-ppi",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        bls_ppi_mock.assert_called_once()
        self.assertIn("BLS_PPI scheduler run", buffer.getvalue())

    def test_main_runs_usda_nass_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "USDA_NASS", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_usda_nass_series",
            return_value=SimpleNamespace(
                id=19,
                status="SUCCEEDED",
                series_count=3,
                observation_count=36,
                error_summary=None,
            ),
        ) as usda_nass_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "usda-nass",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        usda_nass_mock.assert_called_once()
        self.assertIn("USDA_NASS scheduler run", buffer.getvalue())

    def test_main_runs_miso_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "MISO", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_miso_series",
            return_value=SimpleNamespace(
                id=16,
                status="SUCCEEDED",
                series_count=8,
                observation_count=8,
                error_summary=None,
            ),
        ) as miso_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "miso",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        miso_mock.assert_called_once()
        self.assertIn("MISO scheduler run", buffer.getvalue())

    def test_main_runs_nyiso_provider_when_due(self) -> None:
        session = _FakeSession()
        with patch.object(run_market_data_scheduler, "SessionLocal", return_value=session), patch.object(
            run_market_data_scheduler,
            "build_external_data_sync_status",
            return_value={"providers": [{"provider": "NYISO", "due_for_sync": True}]},
        ), patch.object(
            run_market_data_scheduler,
            "sync_nyiso_series",
            return_value=SimpleNamespace(
                id=17,
                status="SUCCEEDED",
                series_count=11,
                observation_count=11,
                error_summary=None,
            ),
        ) as nyiso_mock, patch(
            "sys.argv",
            [
                "run_market_data_scheduler.py",
                "--provider",
                "nyiso",
                "--max-cycles",
                "1",
            ],
        ):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                exit_code = run_market_data_scheduler.main()

        self.assertEqual(exit_code, 0)
        self.assertTrue(session.closed)
        nyiso_mock.assert_called_once()
        self.assertIn("NYISO scheduler run", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
