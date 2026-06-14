from __future__ import annotations

import io
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from zipfile import ZipFile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data.world_bank_client import (
    WorldBankClientError,
    _parse_monthly_prices_workbook,
)
from apps.api.app.domains.reference_data.services.external_data.world_bank_sync import sync_world_bank_series
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class FakeWorldBankClient:
    def __init__(self, payload: dict, raises: Optional[Exception] = None) -> None:
        self.payload = payload
        self.raises = raises
        self.calls: list[dict[str, object]] = []

    def fetch_monthly_prices(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return self.payload


class WorldBankSyncTests(unittest.TestCase):
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
            session.query(PriceIndexObservation).delete()
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ExternalDataRun).delete()
            session.commit()

    def _seed_price_index_source(self) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                ReferencePriceIndex(
                    code="BRENT_WORLD_BANK_M",
                    name="Brent World Bank Monthly",
                    commodity_code="BRENT",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="WORLD_BANK",
                    market="PINK_SHEET",
                    location_code=None,
                    calendar_code=None,
                    description="Test World Bank price index",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.add(
                ReferencePriceIndexSource(
                    price_index_code="BRENT_WORLD_BANK_M",
                    provider="WORLD_BANK",
                    dataset_code="PINK_SHEET_MONTHLY",
                    series_id="CRUDE_BRENT",
                    frequency="monthly",
                    source_unit="BBL",
                    source_currency_code="USD",
                    transform_rule=None,
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def test_parse_monthly_prices_workbook_extracts_requested_series(self) -> None:
        workbook = _build_world_bank_workbook()

        payload = _parse_monthly_prices_workbook(
            workbook,
            series_ids=["CRUDE_BRENT"],
            start_date=date(2026, 3, 1),
            source_url="https://example.test/pink.xlsx",
        )

        self.assertEqual(payload["source_revision"], "Updated on May 04, 2026")
        self.assertEqual(len(payload["prices"]), 2)
        self.assertEqual(payload["prices"][0]["period"], "2026M03")
        self.assertEqual(payload["prices"][0]["observation_date"], "2026-03-01")
        self.assertEqual(payload["prices"][0]["value"], "85.3")
        self.assertEqual(payload["prices"][0]["series_name"], "Crude oil, Brent")
        self.assertEqual(payload["prices"][0]["source_unit_text"], "($/bbl)")

    def test_parse_monthly_prices_workbook_rejects_missing_series(self) -> None:
        with self.assertRaisesRegex(WorldBankClientError, "requested series"):
            _parse_monthly_prices_workbook(
                _build_world_bank_workbook(),
                series_ids=["NOT_THERE"],
                start_date=None,
                source_url="https://example.test/pink.xlsx",
            )

    def test_sync_creates_price_index_observations(self) -> None:
        self._seed_price_index_source()
        client = FakeWorldBankClient(
            {
                "prices": [
                    {
                        "series_id": "CRUDE_BRENT",
                        "period": "2026M03",
                        "observation_date": "2026-03-01",
                        "value": "85.3",
                        "source_revision": "Updated on May 04, 2026",
                    },
                    {
                        "series_id": "CRUDE_BRENT",
                        "period": "2026M04",
                        "observation_date": "2026-04-01",
                        "value": "88.2",
                        "source_revision": "Updated on May 04, 2026",
                    },
                ]
            }
        )

        with self.SessionLocal() as session:
            run = sync_world_bank_series(
                session,
                client=client,
                requested_by="spec-test",
                lookback_days=90,
                today=date(2026, 5, 1),
            )
            observations = (
                session.query(PriceIndexObservation)
                .order_by(PriceIndexObservation.observation_date.asc())
                .all()
            )

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 2)
        self.assertEqual(len(observations), 2)
        self.assertEqual(observations[0].price_index_code, "BRENT_WORLD_BANK_M")
        self.assertEqual(observations[0].value, Decimal("85.300000"))
        self.assertEqual(observations[0].unit_code, "BBL")
        self.assertEqual(observations[0].currency_code, "USD")
        self.assertEqual(observations[0].source_provider, "WORLD_BANK")
        self.assertEqual(observations[0].source_revision, "Updated on May 04, 2026")
        self.assertEqual(client.calls[0]["series_ids"], ["CRUDE_BRENT"])
        self.assertEqual(client.calls[0]["start_date"], date(2026, 1, 31))

    def test_sync_is_idempotent_for_unchanged_rows(self) -> None:
        self._seed_price_index_source()
        payload = {
            "prices": [
                {
                    "series_id": "CRUDE_BRENT",
                    "period": "2026M04",
                    "observation_date": "2026-04-01",
                    "value": "88.2",
                    "source_revision": "Updated on May 04, 2026",
                },
            ]
        }

        with self.SessionLocal() as session:
            first_run = sync_world_bank_series(session, client=FakeWorldBankClient(payload))

        with self.SessionLocal() as session:
            second_run = sync_world_bank_series(session, client=FakeWorldBankClient(payload))
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(first_run.status, "SUCCEEDED")
        self.assertEqual(second_run.status, "SUCCEEDED")
        self.assertEqual(second_run.observation_count, 0)
        self.assertEqual(len(observations), 1)

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_price_index_source()

        with self.SessionLocal() as session:
            run = sync_world_bank_series(
                session,
                client=FakeWorldBankClient({}, raises=WorldBankClientError("boom")),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


def _build_world_bank_workbook() -> bytes:
    shared_strings = [
        "Monthly Prices",
        "World Bank Commodity Price Data (The Pink Sheet)",
        "monthly prices in nominal US dollars, 1960 to present",
        "Updated on May 04, 2026",
        "Crude oil, Brent",
        "Crude oil, WTI",
        "($/bbl)",
        "CRUDE_BRENT",
        "CRUDE_WTI",
        "2026M02",
        "2026M03",
        "2026M04",
        "\u2026",
    ]
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as workbook:
        workbook.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Monthly Prices" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
        )
        workbook.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )
        workbook.writestr(
            "xl/sharedStrings.xml",
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
            + "".join(f"<si><t>{value}</t></si>" for value in shared_strings)
            + "</sst>",
        )
        workbook.writestr(
            "xl/worksheets/sheet1.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c></row>
    <row r="3"></row>
    <row r="4"><c r="A4" t="s"><v>3</v></c></row>
    <row r="5"><c r="B5" t="s"><v>4</v></c><c r="C5" t="s"><v>5</v></c></row>
    <row r="6"><c r="B6" t="s"><v>6</v></c><c r="C6" t="s"><v>6</v></c></row>
    <row r="7"><c r="B7" t="s"><v>7</v></c><c r="C7" t="s"><v>8</v></c></row>
    <row r="8"><c r="A8" t="s"><v>9</v></c><c r="B8" t="s"><v>12</v></c><c r="C8"><v>82.1</v></c></row>
    <row r="9"><c r="A9" t="s"><v>10</v></c><c r="B9"><v>85.3</v></c><c r="C9"><v>82.7</v></c></row>
    <row r="10"><c r="A10" t="s"><v>11</v></c><c r="B10"><v>88.2</v></c><c r="C10"><v>84.4</v></c></row>
  </sheetData>
</worksheet>""",
        )
    return buffer.getvalue()


if __name__ == "__main__":
    unittest.main()
