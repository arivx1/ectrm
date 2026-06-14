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
from apps.api.app.models.reference_calendar import ReferenceCalendar
from apps.api.app.models.reference_calendar_holiday import ReferenceCalendarHoliday
from apps.api.app.models.reference_calendar_overlay import ReferenceCalendarOverlay
from apps.api.app.models.reference_calendar_rule import ReferenceCalendarRule
from apps.api.app.models.reference_commodity import ReferenceCommodity
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.models.reference_location import ReferenceLocation
from apps.api.app.models.reference_pipeline_detail import ReferencePipelineDetail
from apps.api.app.models.reference_pipeline_path import ReferencePipelinePath
from apps.api.app.models.reference_pipeline_point import ReferencePipelinePoint
from apps.api.app.models.reference_portfolio import ReferencePortfolio
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.reference_price_index_source import ReferencePriceIndexSource
from apps.api.app.models.reference_rail_line import ReferenceRailLine
from apps.api.app.models.reference_rail_route import ReferenceRailRoute
from apps.api.app.models.reference_spatial_feature import ReferenceSpatialFeature
from apps.api.app.models.reference_unit import ReferenceUnit
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_leg import TradeLeg
from apps.api.app.models.trade_price_term import TradePriceTerm
from apps.api.app.domains.admin.services.seed_reference_data import (
    PRICE_INDEX_ROWS,
    PRICE_INDEX_SOURCE_ROWS,
)
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
            session.query(ReferenceSpatialFeature).delete()
            session.query(ReferenceRailRoute).delete()
            session.query(ReferenceRailLine).delete()
            session.query(ReferenceCalendarOverlay).delete()
            session.query(ReferenceCalendarRule).delete()
            session.query(ReferenceCalendarHoliday).delete()
            session.query(ReferenceCalendar).delete()
            session.query(ReferencePortfolio).delete()
            session.query(ReferencePipelinePath).delete()
            session.query(ReferencePipelinePoint).delete()
            session.query(ReferencePipelineDetail).delete()
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

            document_agent = session.get(AssistantAgent, "document-agent")
            self.assertEqual(document_agent.status, "ACTIVE")
            self.assertIn("list_gmail_inbox_messages", document_agent.allowed_tools)
            self.assertIn("get_gmail_inbox_message", document_agent.allowed_tools)
            self.assertIn("list_slack_messaging_conversations", document_agent.allowed_tools)
            self.assertIn("get_slack_messaging_conversation", document_agent.allowed_tools)
            self.assertEqual(session.get(AssistantAgent, "pre-trade-structuring-agent").status, "ACTIVE")
            self.assertEqual(session.get(AssistantAgent, "market-research-agent").status, "ACTIVE")
            movement_controller = session.get(AssistantAgent, "movement-controller-agent")
            self.assertEqual(movement_controller.authority_ceiling, "EXECUTE")
            self.assertIn("list_gmail_inbox_messages", movement_controller.allowed_tools)
            self.assertIn("get_gmail_inbox_message", movement_controller.allowed_tools)
            self.assertIn("list_slack_messaging_conversations", movement_controller.allowed_tools)
            self.assertIn("get_slack_messaging_conversation", movement_controller.allowed_tools)
            self.assertEqual(
                movement_controller.allowed_action_types,
                [
                    "record_delivery_event",
                    "reverse_delivery_event",
                    "record_trade_actualization",
                    "void_trade_actualization",
                    "update_trade_workflow_item",
                ],
            )
            trade_ops = session.get(AssistantAgent, "trade-ops-copilot")
            self.assertIn("list_gmail_inbox_messages", trade_ops.allowed_tools)
            self.assertIn("get_gmail_inbox_message", trade_ops.allowed_tools)
            self.assertIn("list_slack_messaging_conversations", trade_ops.allowed_tools)
            self.assertIn("get_slack_messaging_conversation", trade_ops.allowed_tools)
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
            self.assertEqual(
                session.get(AssistantAgent, "settlement-copilot").allowed_action_types,
                [
                    "create_settlement_report_preset",
                    "issue_trade_invoice",
                    "void_trade_invoice",
                    "create_trade_payment",
                    "reverse_trade_payment",
                ],
            )
            self.assertEqual(
                session.get(AssistantAgent, "invoice-controller-agent").allowed_action_types,
                ["issue_trade_invoice", "void_trade_invoice"],
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
            self.assertEqual(payload.entity_counts["commodities"], 64)
            self.assertEqual(payload.entity_counts["locations"], 552)
            self.assertEqual(payload.entity_counts["rail_lines"], 5)
            self.assertEqual(payload.entity_counts["rail_routes"], 6)
            self.assertEqual(payload.entity_counts["spatial_features"], 6)
            self.assertEqual(payload.entity_counts["assets"], 18)
            self.assertEqual(payload.entity_counts["pipeline_details"], 10)
            self.assertEqual(payload.entity_counts["pipeline_points"], 33)
            self.assertEqual(payload.entity_counts["pipeline_paths"], 12)
            self.assertEqual(payload.entity_counts["counterparties"], 1539)
            self.assertEqual(payload.entity_counts["calendars"], 73)
            self.assertGreaterEqual(payload.entity_counts["calendar_overlays"], 20)
            self.assertGreaterEqual(payload.entity_counts["calendar_rules"], 130)
            self.assertEqual(len(PRICE_INDEX_ROWS), 104)
            self.assertEqual(len(PRICE_INDEX_SOURCE_ROWS), 104)
            self.assertEqual(payload.entity_counts["price_indices"], len(PRICE_INDEX_ROWS))
            self.assertEqual(payload.entity_counts["price_index_sources"], len(PRICE_INDEX_SOURCE_ROWS))
            price_index_codes = {
                row.code
                for row in session.query(ReferencePriceIndex).all()
            }
            price_index_source_series = {
                row.series_id
                for row in session.query(ReferencePriceIndexSource).all()
            }
            self.assertEqual(
                {
                    row.quote_type
                    for row in session.query(ReferencePriceIndex).all()
                },
                {"SPOT"},
            )
            self.assertTrue(
                price_index_codes.issuperset(
                    {
                        "MT_BELVIEU_PROPANE_D",
                        "LNG_ASIA_IMF_M",
                        "CORN_GLOBAL_IMF_M",
                        "COAL_AUSTRALIA_IMF_M",
                        "COPPER_GLOBAL_IMF_M",
                        "CAISO_NP15_RT5M",
                        "ERCOT_HB_HOUSTON_RT15M",
                        "COCOA_GLOBAL_IMF_M",
                        "COFFEE_ARABICA_IMF_M",
                        "ALL_COMMODITIES_IMF_M",
                        "APSP_CRUDE_IMF_M",
                        "MASS_HUB_ONPEAK_DA",
                        "MISO_INDIANA_HUB_RT5M",
                        "NYISO_NYC_RT5M",
                        "NYISO_LONGIL_RT5M",
                    }
                )
            )
            self.assertTrue(
                price_index_source_series.issuperset(
                    {
                        "PET.EER_EPLLPA_PF4_Y44MB_DPG.D",
                        "PNGASJPUSDM",
                        "PMAIZMTUSDM",
                        "PCOALAUUSDM",
                        "PCOPPUSDM",
                        "NP15",
                        "HB_HOUSTON",
                        "PJM WH Real Time Peak",
                        "PALLFNFINDEXM",
                        "PCOCOUSDM",
                        "PCOFFOTMUSDM",
                        "POILAPSPUSDM",
                        "Nepool MH DA LMP Peak",
                        "INDIANA.HUB",
                        "N.Y.C.",
                        "LONGIL",
                    }
                )
            )
            self.assertTrue(
                {
                    row.code
                    for row in session.query(ReferenceCurrency).all()
                }.issuperset({"USC", "XXX"})
            )
            self.assertTrue(
                {
                    row.code
                    for row in session.query(ReferenceUnit).all()
                }.issuperset({"LB", "KG", "M3", "INDEX"})
            )
            calendar_codes = {
                row.code
                for row in session.query(ReferenceCalendar).all()
            }
            self.assertEqual(len(calendar_codes), payload.entity_counts["calendars"])
            self.assertTrue(
                calendar_codes.issuperset(
                    {
                        "AE_PUBLIC",
                        "AU_BANK_NATIONAL",
                        "AU_NSW_BANK",
                        "AU_QLD_BANK",
                        "AU_VIC_BANK",
                        "AU_WA_BANK",
                        "CA_LYNX",
                        "CME_ENERGY",
                        "DE_BADEN_WUERTTEMBERG_PUBLIC",
                        "DE_BAVARIA_PUBLIC",
                        "ERCOT",
                        "EUR_TARGET",
                        "FUJAIRAH_PORT",
                        "HK_BANK_NATIONAL",
                        "HKEX",
                        "ICE_EU",
                        "ICE_US",
                        "IESO",
                        "JPX",
                        "LME",
                        "MISO",
                        "MX_SPEI",
                        "NAESB_GAS",
                        "NASDAQ",
                        "NYSE",
                        "NYISO",
                        "PJM",
                        "SGX",
                        "SINGAPORE_PORT",
                        "SPP",
                        "UK_CHAPS",
                        "US_CHIPS",
                        "US_FEDWIRE",
                        "USGC_PORT",
                    }
                )
            )
            self.assertTrue(
                calendar_codes.issuperset(
                    {
                        "AZ_BANK_NATIONAL",
                        "BR_BANK_NATIONAL",
                        "CA_BANK_AB_BC_NS_ON",
                        "CA_BANK_NATIONAL",
                        "CA_BANK_QC",
                        "CN_BANK_NATIONAL",
                        "CO_BANK_NATIONAL",
                        "CZ_BANK_NATIONAL",
                        "DE_PUBLIC_NATIONAL",
                        "EUR_TARGET",
                        "FI_BANK",
                        "FR_BANK_PLACE",
                        "HU_BANK_NATIONAL",
                        "IL_ZAHAV",
                        "IN_RBI_BENGALURU",
                        "IN_RBI_CHENNAI",
                        "IN_RBI_HYDERABAD",
                        "IN_RBI_KOLKATA",
                        "IN_RBI_MUMBAI",
                        "IN_RBI_NEW_DELHI",
                        "IT_PUBLIC",
                        "JP_BANK_NATIONAL",
                        "KR_BANK_NATIONAL",
                        "MX_BANK_CNBV",
                        "NL_PUBLIC",
                        "NO_NBO",
                        "SG_BANK_NATIONAL",
                        "TH_BANK_NATIONAL",
                        "TW_BANK_NATIONAL",
                        "UA_BANK_NATIONAL",
                        "UK_BANK_EW",
                        "UK_BANK_NI",
                        "UK_BANK_SCOTLAND",
                        "US_FED_BANK",
                        "VN_BANK_NATIONAL",
                        "ZA_BANK_NATIONAL",
                    }
                )
            )
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferenceRailLine).all()
                },
                {
                    "BNSF_SOUTHERN_TRANSCON",
                    "UP_GULF_COAST_CORRIDOR",
                    "CN_GREAT_LAKES_CORRIDOR",
                    "CPKC_MIDCONTINENT_GULF",
                    "NS_ATLANTIC_TERMINAL_CORRIDOR",
                },
            )
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferenceRailRoute).all()
                },
                {
                    "BNSF_WAHA_TO_HSC",
                    "UP_MIDLAND_TO_CUSHING",
                    "CPKC_CUSHING_TO_HSC",
                    "CN_AECO_TO_DAWN",
                    "NS_DAWN_TO_NYH",
                    "BNSF_HSC_TO_WAHA_BACKHAUL",
                },
            )
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferenceAsset).all()
                },
                {
                    "COLONIAL_USA",
                    "DIXIE_USA",
                    "EXPLORER_USA",
                    "FLANAGAN_SOUTH_USA",
                    "OASIS_TX",
                    "SEAWAY_USA",
                    "SIM_WAHA_GATHERING",
                    "SIM_ERCOT_CCGT",
                    "SIM_HENRY_CAVERN",
                    "SIM_HSC_LNG_EXPORT",
                    "SIM_MIDLAND_FIELD",
                    "SIM_PJM_DATA_CENTER",
                    "SIM_USGC_REFINERY",
                    "SIM_USGC_TERMINAL",
                    "TGP_USA",
                    "TRANSCO_USA",
                    "TRANS_PECOS_TX",
                    "WAHA_HEADER_TX",
                },
            )
            self.assertEqual(
                {
                    row.asset_reality
                    for row in session.query(ReferenceAsset).all()
                },
                {"REAL", "SIMULATED"},
            )
            self.assertEqual(
                {
                    row.code
                    for row in session.query(ReferencePriceIndex).all()
                },
                {row["code"] for row in PRICE_INDEX_ROWS},
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
                        "INDIANA_HUB",
                        "KATY",
                        "LEIDY",
                        "MASS_HUB",
                        "MIDLAND",
                        "MISO_INDIANA_HUB",
                        "MONT_BELVIEU",
                        "NP15",
                        "NYISO_NYC",
                        "NYISO_LONGIL",
                        "PALO_VERDE",
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
            bnsf_line = session.get(ReferenceRailLine, "BNSF_SOUTHERN_TRANSCON")
            bnsf_route = session.get(ReferenceRailRoute, "BNSF_WAHA_TO_HSC")
            backhaul_route = session.get(ReferenceRailRoute, "BNSF_HSC_TO_WAHA_BACKHAUL")
            bnsf_overlay = session.get(ReferenceSpatialFeature, "BNSF_WAHA_TO_HSC_OVERLAY")
            self.assertIsNotNone(bnsf_line)
            self.assertIsNotNone(bnsf_route)
            self.assertIsNotNone(backhaul_route)
            self.assertIsNotNone(bnsf_overlay)
            assert bnsf_line is not None
            assert bnsf_route is not None
            assert backhaul_route is not None
            assert bnsf_overlay is not None
            self.assertEqual(bnsf_line.railroad_code, "BNSF")
            self.assertEqual(bnsf_line.default_timezone, "America/Chicago")
            self.assertEqual(bnsf_route.rail_line_code, "BNSF_SOUTHERN_TRANSCON")
            self.assertEqual(bnsf_route.origin_location_code, "WAHA")
            self.assertEqual(bnsf_route.destination_location_code, "HOUSTON_SHIP_CHANNEL")
            self.assertEqual(bnsf_route.service_calendar_code, "USGC_PORT")
            self.assertEqual(bnsf_route.route_direction, "FORWARD")
            self.assertEqual(bnsf_route.placement_cutoff_time_local, "15:00")
            self.assertEqual(bnsf_route.release_cutoff_time_local, "11:00")
            self.assertEqual(bnsf_route.placement_free_time_hours, 48)
            self.assertEqual(bnsf_route.release_free_time_hours, 24)
            self.assertEqual(backhaul_route.route_direction, "REVERSE")
            self.assertEqual(backhaul_route.service_calendar_code, "USGC_PORT")
            self.assertEqual(backhaul_route.placement_free_time_hours, 24)
            self.assertEqual(bnsf_overlay.entity_type, "RAIL_ROUTE")
            self.assertEqual(bnsf_overlay.entity_code, "BNSF_WAHA_TO_HSC")
            self.assertEqual(bnsf_overlay.feature_kind, "ROUTE")
            self.assertEqual(bnsf_overlay.geometry_type, "LINE")
            self.assertTrue(bnsf_overlay.is_primary)
            self.assertEqual(bnsf_overlay.source_name, "Curated Rail Route Seed")
            self.assertEqual(bnsf_overlay.notes, "Straight-line overlay seeded from rail route endpoint locations.")
            self.assertEqual(session.query(ReferencePipelineDetail).count(), 10)
            self.assertEqual(session.query(ReferencePipelinePoint).count(), 33)
            self.assertEqual(session.query(ReferencePipelinePath).count(), 12)
            sim_refinery = session.get(ReferenceAsset, "SIM_USGC_REFINERY")
            transco_asset = session.get(ReferenceAsset, "TRANSCO_USA")
            oasis_detail = session.get(ReferencePipelineDetail, "OASIS_TX")
            colonial_linden_point = session.get(ReferencePipelinePoint, "COLONIAL_LINDEN")
            oasis_path = session.get(ReferencePipelinePath, "OASIS_WAHA_TO_KATY")
            self.assertIsNotNone(sim_refinery)
            self.assertIsNotNone(transco_asset)
            self.assertIsNotNone(oasis_detail)
            self.assertIsNotNone(colonial_linden_point)
            self.assertIsNotNone(oasis_path)
            assert sim_refinery is not None
            assert transco_asset is not None
            assert oasis_detail is not None
            assert colonial_linden_point is not None
            assert oasis_path is not None
            self.assertEqual(sim_refinery.asset_class, "REFINERY")
            self.assertEqual(sim_refinery.asset_type, "CONVERSION")
            self.assertEqual(sim_refinery.asset_reality, "SIMULATED")
            self.assertEqual(sim_refinery.location_code, "USGC")
            self.assertEqual(transco_asset.asset_class, "PIPELINE")
            self.assertEqual(transco_asset.asset_reality, "REAL")
            self.assertEqual(transco_asset.commodity_code, "NATURAL_GAS")
            self.assertEqual(transco_asset.location_code, "LEIDY")
            self.assertEqual(oasis_detail.jurisdiction_type, "INTRASTATE")
            self.assertEqual(oasis_detail.topology_model, "POINT_TO_POINT")
            self.assertEqual(oasis_detail.market_hub_location_code, "WAHA")
            self.assertTrue(oasis_detail.is_bidirectional)
            self.assertEqual(colonial_linden_point.location_code, "LINDEN_JUNCTION")
            self.assertTrue(colonial_linden_point.is_pricing_point)
            self.assertEqual(oasis_path.receipt_point_code, "OASIS_WAHA_HUB")
            self.assertEqual(oasis_path.delivery_point_code, "OASIS_KATY_HUB")
            self.assertEqual(oasis_path.delivery_location_code, "KATY")
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
                        "ABERCORE",
                        "AMERICAN_PLANT_FOOD",
                        "ASILI",
                        "BP",
                        "CARGILL",
                        "CEFETRA",
                        "CHEVRON",
                        "CIAMSA",
                        "2222_SR",
                        "0857_HK",
                        "COP",
                        "CONSTELLATION",
                        "CSC_SUGAR",
                        "CROWN_POINT",
                        "CUMBERLAND",
                        "DUK",
                        "ENB",
                        "ENR_F",
                        "ETG",
                        "FIBRE_TRADE",
                        "HARTREE",
                        "HOWLETT_FARMS",
                        "INTERNATIONAL_MATERIALS",
                        "INTEROCEANIC",
                        "ENGIE",
                        "JPM",
                        "LINKONE",
                        "MERCURIA",
                        "PBR",
                        "REDWOOD_GROUP",
                        "RWE",
                        "RYCO_HOLDINGS",
                        "SMIRKS",
                        "SPRING_VALLEY",
                        "SURESOURCE",
                        "TELF_AG",
                        "TRAFIGURA",
                        "VALERO",
                        "WESTFELDT_BROTHERS",
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
            hartree = session.get(ReferenceCounterparty, "HARTREE")
            telf_ag = session.get(ReferenceCounterparty, "TELF_AG")
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
            self.assertIsNotNone(hartree)
            self.assertIsNotNone(telf_ag)
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
            assert hartree is not None
            assert telf_ag is not None
            self.assertEqual(alcoa.counterparty_type, "END_USER")
            self.assertEqual(american_airlines.counterparty_type, "END_USER")
            self.assertEqual(acadian.counterparty_type, "BROKER")
            self.assertEqual(apple.counterparty_type, "END_USER")
            self.assertEqual(hartree.name, "Hartree")
            self.assertEqual(hartree.counterparty_type, "END_USER")
            self.assertEqual(telf_ag.name, "Telf Ag")
            self.assertEqual(telf_ag.description, "Existing client base starter row.")
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
            self.assertEqual(session.query(Trade).filter(Trade.unit_of_measure.is_(None)).count(), 0)

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
