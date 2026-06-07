from __future__ import annotations

import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.risk.services.scenario_stress import (
    SCENARIO_STRESS_ACTION_SCOPE_READ_ONLY,
    SCENARIO_STRESS_BASIS_V1,
    SHOCK_TYPE_BASIS,
    SHOCK_TYPE_DELIVERY_DISRUPTION,
    SHOCK_TYPE_FLAT_PRICE,
    SHOCK_TYPE_VOLUME,
    ScenarioShock,
    run_scenario_stress,
)
from apps.api.app.models.event import Base, Event
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource


class ScenarioStressServiceTests(unittest.TestCase):
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
            session.query(Event).delete()
            session.commit()

    def _event(
        self,
        *,
        event_id: str,
        trade_id: str,
        occurred_at: datetime,
        payload: dict[str, object],
    ) -> Event:
        return Event(
            event_id=event_id,
            aggregate_type="trade",
            aggregate_id=trade_id,
            event_type="TradeCreated",
            occurred_at=occurred_at,
            recorded_at=occurred_at,
            actor_id="test-user",
            correlation_id=None,
            causation_id=None,
            schema_version=1,
            payload=payload,
        )

    def _seed_price_index(
        self,
        session,
        *,
        code: str,
        value: str,
        observation_date: date,
        series_id: str,
    ) -> None:
        now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
        session.add_all(
            [
                ReferencePriceIndex(
                    code=code,
                    name=f"{code} official mark",
                    commodity_code="NATURAL_GAS",
                    currency_code="USD",
                    unit_code="MMBTU",
                    provider="EIA",
                    quote_type="SPOT",
                    market="HENRY_HUB",
                    location_code="HENRY_HUB",
                    calendar_code=None,
                    description="Test gas price index",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by="test",
                    updated_at=now,
                    updated_by="test",
                    version=1,
                ),
                ReferencePriceIndexSource(
                    price_index_code=code,
                    provider="EIA",
                    dataset_code="EIA",
                    series_id=series_id,
                    frequency="DAILY",
                    source_unit="MMBTU",
                    source_currency_code="USD",
                    transform_rule="field:value",
                    is_active=True,
                    created_at=now,
                    created_by="test",
                    updated_at=now,
                    updated_by="test",
                    version=1,
                ),
                PriceIndexObservation(
                    price_index_code=code,
                    observation_date=observation_date,
                    value=Decimal(value),
                    unit_code="MMBTU",
                    currency_code="USD",
                    source_provider="EIA",
                    source_series_id=series_id,
                    source_frequency="DAILY",
                    source_published_at=datetime(2026, 6, 1, 18, 0, tzinfo=timezone.utc),
                    source_revision=None,
                    downloaded_at=datetime(2026, 6, 1, 18, 5, tzinfo=timezone.utc),
                    run_id=1,
                    raw_payload=None,
                    created_at=datetime(2026, 6, 1, 18, 5, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 6, 1, 18, 5, tzinfo=timezone.utc),
                ),
            ]
        )

    def test_flat_price_shock_moves_official_mark_mtm_without_execution_scope(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(
                session,
                code="HENRY_HUB_GAS_D",
                value="3.050000",
                observation_date=date(2026, 6, 1),
                series_id="NG.RNGWHHD.D",
            )
            session.add(
                self._event(
                    event_id="evt-stress-flat-1",
                    trade_id="T-STRESS-FLAT",
                    occurred_at=datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc),
                    payload={
                        "trade_side": "BUY",
                        "book": "GAS_PHYS",
                        "portfolio": "PROMPT",
                        "commodity_class": "NATURAL_GAS",
                        "commodity": "HENRY_HUB_GAS",
                        "pricing_type": "INDEX",
                        "price_index_code": "HENRY_HUB_GAS_D",
                        "volume": 10.0,
                        "unit_of_measure": "MMBTU",
                        "settlement_status": "PENDING",
                    },
                )
            )
            session.commit()

            report = run_scenario_stress(
                session,
                scenario_name="Henry Hub up 50c",
                as_of=date(2026, 6, 2),
                shocks=[
                    ScenarioShock(
                        shock_type=SHOCK_TYPE_FLAT_PRICE,
                        label="HH +0.50",
                        price_delta=Decimal("0.50"),
                        commodity_class="NATURAL_GAS",
                    )
                ],
            )

        self.assertEqual(report["basis"], SCENARIO_STRESS_BASIS_V1)
        self.assertEqual(report["action_scope"], SCENARIO_STRESS_ACTION_SCOPE_READ_ONLY)
        self.assertEqual(report["summary"]["base_total_pnl"], 30.5)
        self.assertEqual(report["summary"]["stressed_total_pnl"], 35.5)
        self.assertEqual(report["summary"]["total_mtm_delta"], 5.0)
        self.assertEqual(report["summary"]["affected_trade_count"], 1)
        self.assertEqual(report["summary"]["affected_position_count"], 0)
        self.assertEqual(report["summary"]["missing_evidence_count"], 0)
        impact = report["trade_impacts"][0]
        self.assertEqual(impact["trade_id"], "T-STRESS-FLAT")
        self.assertEqual(impact["base_effective_mark"], 3.05)
        self.assertEqual(impact["stressed_effective_mark"], 3.55)
        self.assertEqual(impact["base_pnl"], 30.5)
        self.assertEqual(impact["stressed_pnl"], 35.5)
        self.assertEqual(impact["applied_shocks"][0]["shock_type"], SHOCK_TYPE_FLAT_PRICE)
        self.assertEqual(impact["mark_evidence"]["price_index_code"], "HENRY_HUB_GAS_D")

    def test_basis_shock_only_moves_matching_price_index(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(
                session,
                code="HENRY_HUB_GAS_D",
                value="3.000000",
                observation_date=date(2026, 6, 1),
                series_id="NG.RNGWHHD.D",
            )
            self._seed_price_index(
                session,
                code="WAHA_GAS_D",
                value="2.000000",
                observation_date=date(2026, 6, 1),
                series_id="NG.WAHA.D",
            )
            session.add_all(
                [
                    self._event(
                        event_id="evt-stress-basis-1",
                        trade_id="T-HH",
                        occurred_at=datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc),
                        payload={
                            "trade_side": "BUY",
                            "commodity_class": "NATURAL_GAS",
                            "pricing_type": "INDEX",
                            "price_index_code": "HENRY_HUB_GAS_D",
                            "volume": 10.0,
                        },
                    ),
                    self._event(
                        event_id="evt-stress-basis-2",
                        trade_id="T-WAHA",
                        occurred_at=datetime(2026, 6, 1, 9, 30, tzinfo=timezone.utc),
                        payload={
                            "trade_side": "BUY",
                            "commodity_class": "NATURAL_GAS",
                            "pricing_type": "INDEX",
                            "price_index_code": "WAHA_GAS_D",
                            "volume": 10.0,
                        },
                    ),
                ]
            )
            session.commit()

            report = run_scenario_stress(
                session,
                scenario_name="HH basis tightens",
                as_of=date(2026, 6, 1),
                shocks=[
                    {
                        "shock_type": SHOCK_TYPE_BASIS,
                        "label": "HH basis -0.25",
                        "basis_delta": "-0.25",
                        "price_index_code": "HENRY_HUB_GAS_D",
                    }
                ],
            )

        self.assertEqual(report["summary"]["base_total_pnl"], 50.0)
        self.assertEqual(report["summary"]["stressed_total_pnl"], 47.5)
        self.assertEqual(report["summary"]["affected_trade_count"], 1)
        self.assertEqual(report["trade_impacts"][0]["trade_id"], "T-HH")
        self.assertEqual(report["trade_impacts"][0]["mtm_delta"], -2.5)

    def test_volume_shock_scales_trade_mtm_and_position_rows(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                self._event(
                    event_id="evt-stress-volume-1",
                    trade_id="T-VOLUME",
                    occurred_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
                    payload={
                        "trade_side": "BUY",
                        "book": "GAS_PHYS",
                        "portfolio": "PROMPT",
                        "commodity_class": "NATURAL_GAS",
                        "commodity": "HENRY_HUB_GAS",
                        "location_code": "HENRY_HUB",
                        "delivery_start": "2026-08-01",
                        "delivery_end": "2026-08-31",
                        "pricing_type": "FIXED",
                        "price": 2.0,
                        "volume": 100.0,
                        "unit_of_measure": "MMBTU",
                        "settlement_status": "PENDING",
                    },
                )
            )
            session.commit()

            report = run_scenario_stress(
                session,
                scenario_name="Nomination increase",
                as_of=date(2026, 7, 1),
                shocks=[
                    ScenarioShock(
                        shock_type=SHOCK_TYPE_VOLUME,
                        label="Volume +10%",
                        volume_delta_percent=10,
                        commodity_class="NATURAL_GAS",
                    )
                ],
            )

        self.assertEqual(report["summary"]["base_total_pnl"], 200.0)
        self.assertEqual(report["summary"]["stressed_total_pnl"], 220.0)
        self.assertEqual(report["summary"]["total_mtm_delta"], 20.0)
        self.assertEqual(report["summary"]["affected_trade_count"], 1)
        self.assertEqual(report["summary"]["affected_position_count"], 1)
        self.assertEqual(report["trade_impacts"][0]["stressed_quantity"], 110.0)
        position = report["position_impacts"][0]
        self.assertEqual(position["base_net_volume"], 100.0)
        self.assertEqual(position["stressed_net_volume"], 110.0)
        self.assertEqual(position["volume_delta"], 10.0)
        self.assertEqual(position["delivery_disrupted"], False)

    def test_delivery_disruption_flags_overlapping_position_without_trade_execution(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                self._event(
                    event_id="evt-stress-delivery-1",
                    trade_id="T-DELIVERY",
                    occurred_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
                    payload={
                        "trade_side": "BUY",
                        "book": "GAS_PHYS",
                        "portfolio": "PROMPT",
                        "commodity_class": "NATURAL_GAS",
                        "commodity": "HENRY_HUB_GAS",
                        "location_code": "HENRY_HUB",
                        "delivery_start": "2026-08-01",
                        "delivery_end": "2026-08-31",
                        "pricing_type": "FIXED",
                        "price": 2.0,
                        "volume": 100.0,
                        "unit_of_measure": "MMBTU",
                    },
                )
            )
            session.commit()

            report = run_scenario_stress(
                session,
                scenario_name="Pipe outage",
                as_of=date(2026, 7, 1),
                shocks=[
                    ScenarioShock(
                        shock_type=SHOCK_TYPE_DELIVERY_DISRUPTION,
                        label="August delivery unavailable",
                        delivery_start=date(2026, 8, 10),
                        delivery_end=date(2026, 8, 20),
                        remaining_volume_multiplier=0,
                        location_code="HENRY_HUB",
                    )
                ],
            )

        self.assertEqual(report["summary"]["total_mtm_delta"], 0.0)
        self.assertEqual(report["summary"]["affected_trade_count"], 0)
        self.assertEqual(report["summary"]["affected_position_count"], 1)
        self.assertEqual(report["summary"]["missing_evidence_count"], 0)
        position = report["position_impacts"][0]
        self.assertEqual(position["base_net_volume"], 100.0)
        self.assertEqual(position["stressed_net_volume"], 0.0)
        self.assertEqual(position["volume_delta"], -100.0)
        self.assertEqual(position["delivery_disrupted"], True)
        self.assertEqual(position["contributing_trade_ids"], ["T-DELIVERY"])

    def test_price_shock_does_not_revalue_realized_pnl_bucket(self) -> None:
        with self.SessionLocal() as session:
            self._seed_price_index(
                session,
                code="HENRY_HUB_GAS_D",
                value="3.000000",
                observation_date=date(2026, 6, 1),
                series_id="NG.RNGWHHD.D",
            )
            session.add(
                self._event(
                    event_id="evt-stress-realized-1",
                    trade_id="T-REALIZED",
                    occurred_at=datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc),
                    payload={
                        "trade_side": "BUY",
                        "commodity_class": "NATURAL_GAS",
                        "pricing_type": "INDEX",
                        "price_index_code": "HENRY_HUB_GAS_D",
                        "volume": 10.0,
                        "settlement_status": "SETTLED",
                    },
                )
            )
            session.commit()

            report = run_scenario_stress(
                session,
                scenario_name="Settled price move",
                as_of=date(2026, 6, 1),
                shocks=[
                    ScenarioShock(
                        shock_type=SHOCK_TYPE_FLAT_PRICE,
                        price_delta=Decimal("0.50"),
                        price_index_code="HENRY_HUB_GAS_D",
                    )
                ],
            )

        self.assertEqual(report["summary"]["base_total_pnl"], 30.0)
        self.assertEqual(report["summary"]["stressed_total_pnl"], 30.0)
        self.assertEqual(report["summary"]["total_mtm_delta"], 0.0)
        self.assertEqual(report["summary"]["affected_trade_count"], 0)

    def test_missing_official_mark_is_reported_as_missing_evidence(self) -> None:
        with self.SessionLocal() as session:
            session.add(
                self._event(
                    event_id="evt-stress-missing-1",
                    trade_id="T-MISSING-MARK",
                    occurred_at=datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc),
                    payload={
                        "trade_side": "BUY",
                        "commodity_class": "NATURAL_GAS",
                        "pricing_type": "INDEX",
                        "price_index_code": "UNCONFIGURED_GAS_D",
                        "volume": 10.0,
                    },
                )
            )
            session.commit()

            report = run_scenario_stress(
                session,
                scenario_name="Missing mark stress",
                as_of=date(2026, 6, 1),
                shocks=[
                    ScenarioShock(
                        shock_type=SHOCK_TYPE_FLAT_PRICE,
                        label="Gas +0.25",
                        price_delta=Decimal("0.25"),
                        price_index_code="UNCONFIGURED_GAS_D",
                    )
                ],
            )

        self.assertEqual(report["summary"]["base_total_pnl"], 0.0)
        self.assertEqual(report["summary"]["stressed_total_pnl"], 0.0)
        self.assertEqual(report["summary"]["affected_trade_count"], 0)
        self.assertEqual(report["summary"]["missing_evidence_count"], 1)
        missing = report["missing_evidence"][0]
        self.assertEqual(missing["entity_type"], "TRADE")
        self.assertEqual(missing["entity_id"], "T-MISSING-MARK")
        self.assertEqual(missing["valuation_status"], "UNPRICED_MISSING_MARK")
        self.assertIn("Price index is not configured", missing["reason"])


if __name__ == "__main__":
    unittest.main()
