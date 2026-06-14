from __future__ import annotations

import io
import unittest
from datetime import date, datetime, timezone
from typing import Iterable, Optional
from unittest.mock import patch
from zipfile import ZipFile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reference_data.services.external_data import eia_wholesale_power_client
from apps.api.app.domains.reference_data.services.external_data.eia_wholesale_power_client import (
    EIAWholesalePowerClient,
    EIAWholesalePowerClientError,
)
from apps.api.app.domains.reference_data.services.external_data.eia_wholesale_power_sync import (
    sync_eia_wholesale_power_series,
)
from apps.api.app.models.event import Base
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class _FakeResponse:
    status = 200

    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self.body

    def getcode(self) -> int:
        return self.status


class FakeEIAWholesalePowerClient:
    def __init__(self, payload: dict, raises: Optional[Exception] = None) -> None:
        self.payload = payload
        self.raises = raises
        self.calls: list[dict] = []

    def fetch_power_prices(
        self,
        *,
        years: Iterable[int],
        hubs: Iterable[str],
        start_date: Optional[date] = None,
    ) -> dict:
        self.calls.append(
            {
                "years": tuple(years),
                "hubs": tuple(hubs),
                "start_date": start_date,
            }
        )
        if self.raises is not None:
            raise self.raises
        return self.payload


class EIAWholesalePowerSyncTests(unittest.TestCase):
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
                    code="PJM_WEST_ONPEAK_DA",
                    name="PJM West ICE Peak Daily",
                    commodity_code="POWER",
                    currency_code="USD",
                    unit_code="MWH",
                    provider="EIA_WHOLESALE_POWER",
                    market="PJM",
                    location_code="PJM_WEST",
                    calendar_code="PJM",
                    description="Power price-index test row",
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
                    price_index_code="PJM_WEST_ONPEAK_DA",
                    provider="EIA_WHOLESALE_POWER",
                    dataset_code="ICE_WHOLESALE_ELECTRICITY",
                    series_id="PJM WH Real Time Peak",
                    frequency="daily",
                    source_unit="MWH",
                    source_currency_code="USD",
                    transform_rule="field:wtd_avg_price",
                    is_active=True,
                    created_at=now,
                    created_by="test-user",
                    updated_at=now,
                    updated_by="test-user",
                    version=1,
                )
            )
            session.commit()

    def test_client_parses_public_workbook_rows(self) -> None:
        workbook = _build_workbook(
            [
                [
                    "Price hub",
                    "Trade date",
                    "Delivery start date",
                    "Delivery \nend date",
                    "High price $/MWh",
                    "Low price $/MWh",
                    "Wtd avg price $/MWh",
                    "Change",
                    "Daily volume MWh",
                    "Number of trades",
                    "Number of counterparties",
                ],
                [
                    "PJM WH Real Time Peak",
                    _excel_serial(date(2026, 1, 1)),
                    _excel_serial(date(2026, 1, 2)),
                    _excel_serial(date(2026, 1, 2)),
                    "55.00",
                    "50.00",
                    "52.25",
                    "1.75",
                    "1600",
                    "2",
                    "3",
                ],
            ]
        )

        with patch.object(
            eia_wholesale_power_client,
            "urlopen",
            return_value=_FakeResponse(workbook),
        ):
            client = EIAWholesalePowerClient(base_url="https://eia.example/xls")
            payload = client.fetch_power_prices(
                years=[2026],
                hubs=["PJM WH Real Time Peak"],
                start_date=date(2026, 1, 1),
            )

        self.assertEqual(len(payload["prices"]), 1)
        self.assertEqual(payload["prices"][0]["price_hub"], "PJM WH Real Time Peak")
        self.assertEqual(payload["prices"][0]["delivery_start_date"], "2026-01-02")
        self.assertEqual(payload["prices"][0]["wtd_avg_price"], "52.25")

    def test_sync_creates_price_index_observations_from_source_mapping(self) -> None:
        self._seed_price_index_source()
        client = FakeEIAWholesalePowerClient(
            {
                "prices": [
                    {
                        "price_hub": "PJM WH Real Time Peak",
                        "trade_date": "2026-04-05",
                        "delivery_start_date": "2026-04-06",
                        "delivery_end_date": "2026-04-06",
                        "wtd_avg_price": "42.75",
                    }
                ]
            }
        )

        with self.SessionLocal() as session:
            run = sync_eia_wholesale_power_series(
                session,
                client=client,
                lookback_days=30,
                requested_by="spec-test",
                today=date(2026, 4, 20),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "SUCCEEDED")
        self.assertEqual(run.series_count, 1)
        self.assertEqual(run.observation_count, 1)
        self.assertEqual(client.calls[0]["years"], (2026,))
        self.assertEqual(client.calls[0]["hubs"], ("PJM WH Real Time Peak",))
        self.assertEqual(client.calls[0]["start_date"], date(2026, 3, 21))
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0].price_index_code, "PJM_WEST_ONPEAK_DA")
        self.assertEqual(str(observations[0].value), "42.750000")
        self.assertEqual(observations[0].source_provider, "EIA_WHOLESALE_POWER")
        self.assertEqual(observations[0].source_revision, "trade:2026-04-05:delivery:2026-04-06:end:2026-04-06")

    def test_sync_marks_run_failed_on_client_error(self) -> None:
        self._seed_price_index_source()

        with self.SessionLocal() as session:
            run = sync_eia_wholesale_power_series(
                session,
                client=FakeEIAWholesalePowerClient(
                    {},
                    raises=EIAWholesalePowerClientError("boom"),
                ),
            )
            observations = session.query(PriceIndexObservation).all()

        self.assertEqual(run.status, "FAILED")
        self.assertEqual(run.error_summary, "boom")
        self.assertEqual(len(observations), 0)


def _build_workbook(rows: list[list[str]]) -> bytes:
    output = io.BytesIO()
    with ZipFile(output, mode="w") as workbook:
        workbook.writestr(
            "xl/worksheets/sheet1.xml",
            _build_sheet_xml(rows),
        )
    return output.getvalue()


def _build_sheet_xml(rows: list[list[str]]) -> str:
    row_xml: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for column_index, value in enumerate(row):
            cell_ref = f"{chr(ord('A') + column_index)}{row_index}"
            if isinstance(value, int):
                cells.append(f'<c r="{cell_ref}"><v>{value}</v></c>')
            else:
                cells.append(
                    f'<c r="{cell_ref}" t="inlineStr"><is><t>{value}</t></is></c>'
                )
        row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return (
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )


def _excel_serial(value: date) -> int:
    return (value - date(1899, 12, 30)).days


if __name__ == "__main__":
    unittest.main()
