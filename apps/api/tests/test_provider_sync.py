from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from apps.api.app.config import settings
from apps.api.app.domains.reference_data.services.external_data import provider_sync


class _FakeSession:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class ProviderSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_login_enabled = settings.MARKET_DATA_LOGIN_SYNC_ENABLED
        self.previous_login_providers = settings.MARKET_DATA_LOGIN_SYNC_PROVIDERS

    def tearDown(self) -> None:
        settings.MARKET_DATA_LOGIN_SYNC_ENABLED = self.previous_login_enabled
        settings.MARKET_DATA_LOGIN_SYNC_PROVIDERS = self.previous_login_providers

    def test_sync_due_external_data_providers_runs_only_due_providers(self) -> None:
        db = object()
        status = {
            "providers": [
                {"provider": "EIA", "due_for_sync": True},
                {"provider": "FRED", "due_for_sync": False},
                {"provider": "CAISO", "due_for_sync": True},
            ]
        }

        with patch.object(provider_sync, "build_external_data_sync_status", return_value=status), patch.object(
            provider_sync,
            "sync_eia_series",
            return_value=SimpleNamespace(id=1),
        ) as eia_mock, patch.object(
            provider_sync,
            "sync_fred_series",
            return_value=SimpleNamespace(id=2),
        ) as fred_mock, patch.object(
            provider_sync,
            "sync_caiso_series",
            return_value=SimpleNamespace(id=3),
        ) as caiso_mock:
            runs = provider_sync.sync_due_external_data_providers(
                db,
                requested_by="login-user",
                providers=("eia", "fred", "caiso"),
            )

        self.assertEqual([run.id for run in runs], [1, 3])
        eia_mock.assert_called_once()
        fred_mock.assert_not_called()
        caiso_mock.assert_called_once()

    def test_run_login_triggered_market_data_syncs_uses_configured_provider_list(self) -> None:
        settings.MARKET_DATA_LOGIN_SYNC_ENABLED = True
        settings.MARKET_DATA_LOGIN_SYNC_PROVIDERS = "eia,fred"
        session = _FakeSession()

        with patch.object(
            provider_sync,
            "sync_due_external_data_providers",
            return_value=[SimpleNamespace(id=10), SimpleNamespace(id=11)],
        ) as sync_mock:
            run_ids = provider_sync.run_login_triggered_market_data_syncs(
                requested_by="ops_admin",
                session_factory=lambda: session,
            )

        self.assertEqual(run_ids, [10, 11])
        self.assertTrue(session.closed)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "ops_admin")
        self.assertEqual(sync_mock.call_args.kwargs["providers"], ("EIA", "FRED"))

    def test_sync_external_data_provider_runs_eia_wholesale_power_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_eia_wholesale_power_series",
            return_value=SimpleNamespace(id=12),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="eia-wholesale-power",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 12)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")
        self.assertEqual(
            sync_mock.call_args.kwargs["lookback_days"],
            settings.EIA_WHOLESALE_POWER_SYNC_DEFAULT_LOOKBACK_DAYS,
        )

    def test_sync_external_data_provider_runs_world_bank_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_world_bank_series",
            return_value=SimpleNamespace(id=15),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="world-bank",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 15)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")
        self.assertEqual(
            sync_mock.call_args.kwargs["lookback_days"],
            settings.WORLD_BANK_SYNC_DEFAULT_LOOKBACK_DAYS,
        )

    def test_sync_external_data_provider_runs_bls_ppi_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_bls_ppi_series",
            return_value=SimpleNamespace(id=17),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="bls-ppi",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 17)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")
        self.assertEqual(
            sync_mock.call_args.kwargs["lookback_days"],
            settings.BLS_PPI_SYNC_DEFAULT_LOOKBACK_DAYS,
        )

    def test_sync_external_data_provider_runs_alpha_vantage_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_alpha_vantage_prices",
            return_value=SimpleNamespace(id=18),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="alpha-vantage",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 18)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")

    def test_sync_external_data_provider_runs_usda_nass_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_usda_nass_series",
            return_value=SimpleNamespace(id=16),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="usda-nass",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 16)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")
        self.assertEqual(
            sync_mock.call_args.kwargs["lookback_days"],
            settings.USDA_NASS_SYNC_DEFAULT_LOOKBACK_DAYS,
        )

    def test_sync_external_data_provider_runs_miso_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_miso_series",
            return_value=SimpleNamespace(id=13),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="miso",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 13)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")

    def test_sync_external_data_provider_runs_nyiso_provider(self) -> None:
        db = object()
        with patch.object(
            provider_sync,
            "sync_nyiso_series",
            return_value=SimpleNamespace(id=14),
        ) as sync_mock:
            run = provider_sync.sync_external_data_provider(
                db,
                provider="nyiso",
                requested_by="login-user",
            )

        self.assertEqual(run.id, 14)
        sync_mock.assert_called_once()
        self.assertEqual(sync_mock.call_args.kwargs["requested_by"], "login-user")

    def test_run_login_triggered_market_data_syncs_respects_disable_flag(self) -> None:
        settings.MARKET_DATA_LOGIN_SYNC_ENABLED = False

        with patch.object(provider_sync, "sync_due_external_data_providers") as sync_mock:
            run_ids = provider_sync.run_login_triggered_market_data_syncs(
                requested_by="ops_admin",
                session_factory=_FakeSession,
            )

        self.assertEqual(run_ids, [])
        sync_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
