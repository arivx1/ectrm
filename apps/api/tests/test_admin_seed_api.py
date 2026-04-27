from __future__ import annotations

import enum
import unittest

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.event import Base
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.reference_asset import ReferenceAsset
from apps.api.app.models.reference_book import ReferenceBook
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.routes.admin_data import (
    list_admin_transaction_scenarios,
    seed_admin_assistant_agents,
    seed_admin_reference_data,
    seed_admin_transactions,
)
from apps.api.app.routes.reports import get_activity_summary, get_exposure_summary, get_reporting_overview
from apps.api.app.schemas.admin_seed import (
    AssistantAgentSeedRequest,
    ReferenceSeedRequest,
    TransactionSeedRequest,
)


class AdminSeedApiTests(unittest.TestCase):
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
            session.query(AssistantAgent).delete()
            session.query(TradePriceTerm).delete()
            session.query(TradeLeg).delete()
            session.query(Position).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(ReferencePriceIndexSource).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferenceAsset).delete()
            session.query(ReferenceCounterparty).delete()
            session.query(ReferenceLocation).delete()
            session.query(ReferenceUnit).delete()
            session.query(ReferenceCurrency).delete()
            session.query(ReferenceCommodity).delete()
            session.query(ReferenceBook).delete()
            session.commit()

    def test_assistant_agent_seed_upserts_role_derived_pilot_lineup(self) -> None:
        with self.SessionLocal() as session:
            first = seed_admin_assistant_agents(
                AssistantAgentSeedRequest(requested_by="ops-admin"),
                db=session,
            )

            self.assertEqual(first.total_profiles, 20)
            self.assertEqual(first.total_templates, 20)
            self.assertEqual(first.created_count, 20)
            self.assertEqual(first.updated_count, 0)
            self.assertEqual(
                first.agent_ids,
                [
                    "trade-ops-copilot",
                    "settlement-copilot",
                    "trade-governor",
                    "trade-capture-agent",
                    "movement-controller-agent",
                    "accrual-controller-agent",
                    "accounting-posting-agent",
                    "counterparty-state-sync-agent",
                    "confirmation-controller-agent",
                    "workflow-controller-agent",
                    "invoice-controller-agent",
                    "market-research-agent",
                    "pre-trade-structuring-agent",
                    "risk-sentinel",
                    "document-agent",
                    "reporting-reconciliation-agent",
                    "logistics-coordinator",
                    "fee-accrual-agent",
                    "counterparty-outreach-agent",
                    "control-tower-agent",
                ],
            )

            governor = session.get(AssistantAgent, "trade-governor")
            self.assertIsNotNone(governor)
            assert governor is not None
            self.assertEqual(governor.status, "ACTIVE")
            self.assertEqual(governor.scope, "ORGANIZATION")
            self.assertEqual(governor.role_key, "trade-governor")
            self.assertEqual(governor.profile_kind, "ROLE_DERIVED")
            self.assertEqual(governor.human_owner_role, "Trader, Desk Lead, or Admin")
            self.assertEqual(governor.authority_ceiling, "EXECUTE")
            self.assertEqual(
                governor.specialization_summary,
                "Role-derived pilot profile for the Trade Governor role archetype.",
            )
            self.assertEqual(
                governor.activation_notes,
                "Pilot profile synchronized from the Trade Governor role catalog entry.",
            )
            self.assertEqual(governor.allowed_action_types, ["cancel_trade"])
            self.assertEqual(governor.allowed_tools[0], "get_trade_by_id")
            self.assertEqual(governor.created_by, "ops-admin")
            self.assertEqual(governor.version, 1)

            self.assertEqual(session.get(AssistantAgent, "document-agent").status, "ACTIVE")
            self.assertEqual(session.get(AssistantAgent, "pre-trade-structuring-agent").status, "ACTIVE")
            self.assertEqual(session.get(AssistantAgent, "market-research-agent").status, "ACTIVE")
            self.assertEqual(session.get(AssistantAgent, "movement-controller-agent").authority_ceiling, "EXECUTE")
            self.assertEqual(
                session.get(AssistantAgent, "movement-controller-agent").allowed_action_types,
                ["record_delivery_event", "record_trade_actualization", "update_trade_workflow_item"],
            )
            self.assertEqual(
                session.get(AssistantAgent, "trade-capture-agent").allowed_action_types,
                ["create_trade", "amend_trade", "cancel_trade"],
            )
            self.assertEqual(session.get(AssistantAgent, "accrual-controller-agent").status, "ACTIVE")
            self.assertEqual(session.get(AssistantAgent, "accrual-controller-agent").authority_ceiling, "EXECUTE")
            self.assertEqual(
                session.get(AssistantAgent, "accrual-controller-agent").allowed_action_types,
                ["create_manual_accrual_entry", "reverse_accrual_entry"],
            )
            self.assertEqual(session.get(AssistantAgent, "accounting-posting-agent").status, "ACTIVE")
            self.assertEqual(session.get(AssistantAgent, "accounting-posting-agent").authority_ceiling, "EXECUTE")
            self.assertEqual(
                session.get(AssistantAgent, "accounting-posting-agent").allowed_action_types,
                ["create_accounting_entry", "reverse_accounting_entry"],
            )
            self.assertEqual(session.get(AssistantAgent, "confirmation-controller-agent").allowed_action_types, ["issue_trade_confirmation", "record_trade_confirmation_response", "update_trade_workflow_item"])
            self.assertEqual(session.get(AssistantAgent, "workflow-controller-agent").authority_ceiling, "EXECUTE")
            self.assertEqual(session.get(AssistantAgent, "counterparty-outreach-agent").authority_ceiling, "DRAFT")
            self.assertEqual(session.get(AssistantAgent, "control-tower-agent").status, "ACTIVE")

            governor.description = "Outdated scope"
            governor.role_key = None
            governor.profile_kind = "CUSTOM"
            governor.human_owner_role = None
            governor.authority_ceiling = None
            governor.specialization_summary = None
            governor.activation_notes = None
            governor.allowed_action_types = []
            governor.updated_by = "manual-edit"
            governor.version = 7
            session.commit()

            second = seed_admin_assistant_agents(
                AssistantAgentSeedRequest(requested_by="ops-admin"),
                db=session,
            )

            self.assertEqual(second.created_count, 0)
            self.assertEqual(second.updated_count, 1)

            refreshed_governor = session.get(AssistantAgent, "trade-governor")
            self.assertIsNotNone(refreshed_governor)
            assert refreshed_governor is not None
            self.assertEqual(
                refreshed_governor.description,
                "Executes high-sensitivity trade cancellation with a constrained cancel-only action scope.",
            )
            self.assertEqual(refreshed_governor.role_key, "trade-governor")
            self.assertEqual(refreshed_governor.profile_kind, "ROLE_DERIVED")
            self.assertEqual(refreshed_governor.human_owner_role, "Trader, Desk Lead, or Admin")
            self.assertEqual(refreshed_governor.authority_ceiling, "EXECUTE")
            self.assertEqual(
                refreshed_governor.activation_notes,
                "Pilot profile synchronized from the Trade Governor role catalog entry.",
            )
            self.assertEqual(refreshed_governor.allowed_action_types, ["cancel_trade"])
            self.assertEqual(refreshed_governor.updated_by, "ops-admin")
            self.assertEqual(refreshed_governor.version, 8)

    def test_reference_seed_populates_master_data(self) -> None:
        with self.SessionLocal() as session:
            payload = seed_admin_reference_data(
                ReferenceSeedRequest(requested_by="test-user", replace_existing=True),
                db=session,
            )

            self.assertEqual(payload.total_records, sum(payload.entity_counts.values()))
            self.assertEqual(payload.entity_counts["commodities"], 11)
            self.assertEqual(payload.entity_counts["locations"], 514)
            self.assertEqual(payload.entity_counts["assets"], 8)
            self.assertEqual(payload.entity_counts["counterparties"], 1516)
            self.assertEqual(payload.entity_counts["price_indices"], 7)
            self.assertEqual(payload.entity_counts["price_index_sources"], 6)
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferenceAsset).all()
                },
                {
                    "SIM_WAHA_GATHERING",
                    "SIM_ERCOT_CCGT",
                    "SIM_USGC_REFINERY",
                    "SIM_MIDLAND_FIELD",
                    "SIM_HSC_LNG_EXPORT",
                    "SIM_HENRY_CAVERN",
                    "SIM_USGC_TERMINAL",
                    "SIM_PJM_DATA_CENTER",
                },
            )
            self.assertEqual(
                {
                    row.asset_reality
                    for row in session.query(ReferenceAsset).all()
                },
                {"SIMULATED"},
            )
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferencePriceIndex).all()
                },
                {
                    "BRENT_SPOT_D",
                    "DIESEL_US_RETAIL_W",
                    "GASOLINE_US_REG_W",
                    "HENRY_HUB_GAS_D",
                    "PJM_WEST_ONPEAK_DA",
                    "USGC_DIESEL_SPOT_D",
                    "WTI_CUSHING_PHYS_D",
                },
            )
            self.assertTrue(
                {
                    row.code
                    for row in session.query(ReferenceLocation).all()
                }.issuperset(
                    {
                        "ARA",
                        "CONTINENT_NA",
                        "COUNTRY_US",
                        "CUSHING",
                        "ERCOT_NORTH",
                        "MIDLAND",
                        "SUBDIVISION_US_TX",
                        "SUBDIVISION_ZA_GP",
                        "WAHA",
                    }
                )
            )
            cushing = session.get(ReferenceLocation, "CUSHING")
            usgc = session.get(ReferenceLocation, "USGC")
            self.assertIsNotNone(cushing)
            self.assertIsNotNone(usgc)
            assert cushing is not None
            assert usgc is not None
            self.assertEqual(cushing.location_kind, "POINT")
            self.assertEqual(cushing.parent_location_code, "PADD2")
            self.assertEqual(cushing.subdivision_code, "US-OK")
            self.assertAlmostEqual(cushing.latitude or 0.0, 35.9853)
            self.assertEqual(usgc.location_kind, "REGION")
            self.assertEqual(usgc.city, "New Orleans")
            sim_refinery = session.get(ReferenceAsset, "SIM_USGC_REFINERY")
            self.assertIsNotNone(sim_refinery)
            assert sim_refinery is not None
            self.assertEqual(sim_refinery.asset_class, "REFINERY")
            self.assertEqual(sim_refinery.asset_type, "CONVERSION")
            self.assertEqual(sim_refinery.asset_reality, "SIMULATED")
            self.assertEqual(sim_refinery.location_code, "USGC")
            self.assertEqual(usgc.continent_code, "NA")
            country_us = session.get(ReferenceLocation, "COUNTRY_US")
            subdivision_us_tx = session.get(ReferenceLocation, "SUBDIVISION_US_TX")
            subdivision_ca_ab = session.get(ReferenceLocation, "SUBDIVISION_CA_AB")
            self.assertIsNotNone(country_us)
            self.assertIsNotNone(subdivision_us_tx)
            self.assertIsNotNone(subdivision_ca_ab)
            assert country_us is not None
            assert subdivision_us_tx is not None
            assert subdivision_ca_ab is not None
            self.assertEqual(country_us.parent_location_code, "CONTINENT_NA")
            self.assertEqual(country_us.location_type, "COUNTRY")
            self.assertEqual(subdivision_us_tx.parent_location_code, "COUNTRY_US")
            self.assertEqual(subdivision_us_tx.location_type, "STATE")
            self.assertEqual(subdivision_ca_ab.location_type, "PROVINCE")
            self.assertTrue(
                {
                    row.code
                    for row in session.query(ReferenceCounterparty).all()
                }.issuperset(
                    {
                        "AAPL",
                        "AA",
                        "AAL",
                        "AAMI",
                        "BP",
                        "CHEVRON",
                        "2222_SR",
                        "0857_HK",
                        "COP",
                        "CONSTELLATION",
                        "DUK",
                        "ENB",
                        "ENR_F",
                        "ENGIE",
                        "JPM",
                        "MERCURIA",
                        "PBR",
                        "RWE",
                        "TRAFIGURA",
                        "VALERO",
                    }
                )
            )
            apple = session.get(ReferenceCounterparty, "AAPL")
            alcoa = session.get(ReferenceCounterparty, "AA")
            american_airlines = session.get(ReferenceCounterparty, "AAL")
            acadian = session.get(ReferenceCounterparty, "AAMI")
            saudi_aramco = session.get(ReferenceCounterparty, "2222_SR")
            petrochina = session.get(ReferenceCounterparty, "0857_HK")
            duke = session.get(ReferenceCounterparty, "DUK")
            enbridge = session.get(ReferenceCounterparty, "ENB")
            siemens_energy = session.get(ReferenceCounterparty, "ENR_F")
            engie = session.get(ReferenceCounterparty, "ENGIE")
            jpm = session.get(ReferenceCounterparty, "JPM")
            self.assertIsNotNone(alcoa)
            self.assertIsNotNone(american_airlines)
            self.assertIsNotNone(acadian)
            self.assertIsNotNone(apple)
            self.assertIsNotNone(saudi_aramco)
            self.assertIsNotNone(petrochina)
            self.assertIsNotNone(duke)
            self.assertIsNotNone(enbridge)
            self.assertIsNotNone(siemens_energy)
            self.assertIsNotNone(engie)
            self.assertIsNotNone(jpm)
            assert alcoa is not None
            assert american_airlines is not None
            assert acadian is not None
            assert apple is not None
            assert saudi_aramco is not None
            assert petrochina is not None
            assert duke is not None
            assert enbridge is not None
            assert siemens_energy is not None
            assert engie is not None
            assert jpm is not None
            self.assertEqual(alcoa.counterparty_type, "END_USER")
            self.assertEqual(american_airlines.counterparty_type, "END_USER")
            self.assertEqual(acadian.counterparty_type, "BROKER")
            self.assertEqual(apple.counterparty_type, "END_USER")
            self.assertEqual(saudi_aramco.counterparty_type, "MAJOR")
            self.assertEqual(saudi_aramco.country_code, "SA")
            self.assertEqual(petrochina.counterparty_type, "MAJOR")
            self.assertEqual(duke.counterparty_type, "UTILITY")
            self.assertEqual(enbridge.counterparty_type, "MIDSTREAM")
            self.assertEqual(siemens_energy.counterparty_type, "SUPPLIER")
            self.assertEqual(engie.country_code, "FR")
            self.assertEqual(jpm.counterparty_type, "BANK")

    def test_transaction_seed_supports_add_replace_and_delete(self) -> None:
        with self.SessionLocal() as session:
            scenarios = list_admin_transaction_scenarios()
            self.assertEqual(
                [row.code for row in scenarios],
                ["core_demo", "gulf_coast_dislocation", "market_mix_expansion"],
            )

            first = seed_admin_transactions(
                TransactionSeedRequest(
                    action="replace",
                    scenario_codes=["core_demo"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(first.trades_seeded, 4)
            self.assertEqual(first.positions_rebuilt, 4)

            second = seed_admin_transactions(
                TransactionSeedRequest(
                    action="add",
                    scenario_codes=["gulf_coast_dislocation"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(second.trades_seeded, 2)
            self.assertEqual(session.query(Trade).count(), 6)

            third = seed_admin_transactions(
                TransactionSeedRequest(
                    action="add",
                    scenario_codes=["market_mix_expansion"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(third.trades_seeded, 20)
            self.assertEqual(session.query(Trade).count(), 26)

            fourth = seed_admin_transactions(
                TransactionSeedRequest(
                    action="replace",
                    scenario_codes=["gulf_coast_dislocation"],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(fourth.scenario_codes, ["gulf_coast_dislocation"])
            self.assertEqual(session.query(Trade).count(), 2)

            final_payload = seed_admin_transactions(
                TransactionSeedRequest(
                    action="delete",
                    scenario_codes=[],
                    requested_by="test-user",
                ),
                db=session,
            )
            self.assertEqual(final_payload.action, "delete")
            self.assertEqual(session.query(Trade).count(), 0)
            self.assertEqual(session.query(Event).count(), 0)
            self.assertEqual(session.query(Position).count(), 0)

    def test_reporting_module_reads_seeded_transaction_data(self) -> None:
        with self.SessionLocal() as session:
            seed_admin_transactions(
                TransactionSeedRequest(
                    action="replace",
                    scenario_codes=["core_demo", "gulf_coast_dislocation"],
                    requested_by="test-user",
                ),
                db=session,
            )

            exposure = get_exposure_summary(db=session)
            activity = get_activity_summary(db=session)
            overview = get_reporting_overview(db=session)

            self.assertEqual(exposure[0].commodity, "DIESEL")
            self.assertTrue(any(row.commodity == "WTI" and row.net_volume == 100000.0 for row in exposure))
            self.assertTrue(any(row.event_type == "TradeCreated" and row.event_count == 6 for row in activity))
            self.assertEqual(overview.active_trade_count, 5)
            self.assertEqual(overview.tracked_commodity_count, 4)


if __name__ == "__main__":
    unittest.main()
