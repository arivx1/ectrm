from __future__ import annotations

import enum
import unittest
from datetime import date

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.routes.external_data import trigger_counterparty_credit_import
from apps.api.app.routes.reference_data import (
    CounterpartyCreate,
    CounterpartyUpdate,
    CurrencyCreate,
    create_counterparty,
    create_currency,
    list_counterparty_external_credit_snapshots,
    update_counterparty,
)
from apps.api.app.schemas.external_data import (
    CounterpartyCreditImportRequest,
    CounterpartyCreditSnapshotImport,
)


class CounterpartyExternalCreditApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        with self.SessionLocal() as session:
            session.query(ReferenceCounterpartyExternalCreditSnapshot).delete()
            session.query(ExternalDataRun).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceCurrency).delete()
            session.commit()

    def _create_counterparty(self, code: str) -> None:
        with self.SessionLocal() as session:
            create_counterparty(
                CounterpartyCreate(
                    code=code,
                    name=f"{code} Counterparty",
                    counterparty_type="SUPPLIER",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

    def _create_currency(self, code: str) -> None:
        with self.SessionLocal() as session:
            create_currency(
                CurrencyCreate(
                    code=code,
                    name=f"{code} Currency",
                    description="test currency",
                    created_by="test-user",
                ),
                db=session,
            )

    def test_counterparty_create_and_update_normalize_external_identifiers(self) -> None:
        with self.SessionLocal() as session:
            created = create_counterparty(
                CounterpartyCreate(
                    code="acme",
                    name="Acme Trading",
                    counterparty_type="supplier",
                    lei_code="5493001KJTIIGC8Y1R12",
                    duns_number="12-345-6789",
                    ticker_symbol=" acm ",
                    description="test counterparty",
                    created_by="test-user",
                ),
                db=session,
            )

            self.assertEqual(created.lei_code, "5493001KJTIIGC8Y1R12")
            self.assertEqual(created.duns_number, "123456789")
            self.assertEqual(created.ticker_symbol, "ACM")

            updated = update_counterparty(
                "ACME",
                CounterpartyUpdate(
                    lei_code=None,
                    duns_number="98 765 4321",
                    ticker_symbol=" acmx ",
                    updated_by="test-user",
                ),
                db=session,
            )

            self.assertIsNone(updated.lei_code)
            self.assertEqual(updated.duns_number, "987654321")
            self.assertEqual(updated.ticker_symbol, "ACMX")

    def test_counterparty_credit_import_upserts_latest_snapshot_and_records_run(self) -> None:
        self._create_counterparty("ACME")
        self._create_currency("USD")

        with self.SessionLocal() as session:
            first_run = trigger_counterparty_credit_import(
                CounterpartyCreditImportRequest(
                    provider="dnb",
                    requested_by="credit-admin",
                    snapshots=[
                        CounterpartyCreditSnapshotImport(
                            counterparty_code="acme",
                            source_entity_id="123456789",
                            source_entity_name="Acme Trading LLC",
                            match_basis="duns",
                            matched_identifier_value="123456789",
                            as_of_date=date(2026, 4, 5),
                            rating_scale="D&B Rating",
                            rating_value="3A2",
                            rating_outlook="Stable",
                            credit_score=81.5,
                            probability_of_default=0.0142,
                            recommended_limit_currency_code="usd",
                            recommended_limit_amount=2500000,
                            commentary="Initial import",
                            raw_payload={"rating": "3A2"},
                        )
                    ],
                ),
                db=session,
            )

            self.assertEqual(first_run.provider, "DNB")
            self.assertEqual(first_run.status, "SUCCEEDED")
            self.assertEqual(first_run.series_count, 1)
            self.assertEqual(first_run.observation_count, 1)

            second_run = trigger_counterparty_credit_import(
                CounterpartyCreditImportRequest(
                    provider="DNB",
                    requested_by="credit-admin",
                    snapshots=[
                        CounterpartyCreditSnapshotImport(
                            counterparty_code="ACME",
                            source_entity_id="123456789",
                            source_entity_name="Acme Trading LLC",
                            match_basis="DUNS",
                            matched_identifier_value="123456789",
                            as_of_date=date(2026, 4, 5),
                            rating_scale="D&B Rating",
                            rating_value="4A1",
                            rating_outlook="Negative",
                            credit_score=75.25,
                            probability_of_default=0.0275,
                            recommended_limit_currency_code="USD",
                            recommended_limit_amount=2000000,
                            commentary="Revised import",
                            raw_payload={"rating": "4A1"},
                        )
                    ],
                ),
                db=session,
            )

            self.assertEqual(second_run.status, "SUCCEEDED")
            self.assertEqual(second_run.observation_count, 1)

            snapshots = list_counterparty_external_credit_snapshots(limit=20, offset=0, db=session)
            self.assertEqual(len(snapshots), 1)
            self.assertEqual(snapshots[0].counterparty_code, "ACME")
            self.assertEqual(snapshots[0].provider, "DNB")
            self.assertEqual(snapshots[0].match_basis, "DUNS")
            self.assertEqual(snapshots[0].rating_value, "4A1")
            self.assertEqual(snapshots[0].rating_outlook, "Negative")
            self.assertEqual(snapshots[0].recommended_limit_currency_code, "USD")
            self.assertEqual(snapshots[0].recommended_limit_amount, 2000000)
            self.assertEqual(snapshots[0].commentary, "Revised import")
            self.assertEqual(snapshots[0].version, 2)
            self.assertEqual(snapshots[0].run_id, second_run.id)

    def test_counterparty_credit_import_returns_failed_run_for_invalid_rows(self) -> None:
        self._create_counterparty("ACME")

        with self.SessionLocal() as session:
            run = trigger_counterparty_credit_import(
                CounterpartyCreditImportRequest(
                    provider="creditsafe",
                    requested_by="credit-admin",
                    snapshots=[
                        CounterpartyCreditSnapshotImport(
                            counterparty_code="ACME",
                            as_of_date=date(2026, 4, 5),
                            recommended_limit_currency_code="EUR",
                            recommended_limit_amount=1000000,
                        )
                    ],
                ),
                db=session,
            )

            self.assertEqual(run.provider, "CREDITSAFE")
            self.assertEqual(run.status, "FAILED")
            self.assertIn("must be an active currency", run.error_summary or "")
            self.assertEqual(run.series_count, 1)

            snapshots = list_counterparty_external_credit_snapshots(limit=20, offset=0, db=session)
            self.assertEqual(snapshots, [])


if __name__ == "__main__":
    unittest.main()
