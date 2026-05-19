from __future__ import annotations

import enum
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.event import Event
from apps.api.app.models.position import Position
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_accrual_lot import TradeAccrualLot
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class ReportsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

        cls.original_session_factory = app.state.session_factory
        app.state.session_factory = cls.SessionLocal

        def _get_test_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _get_test_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        app.state.session_factory = cls.original_session_factory
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self.now = datetime(2026, 4, 6, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(ReportPreset).delete()
            session.query(UserSession).delete()
            session.query(UserAccount).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(TradeAccrualLot).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(Position).delete()
            session.query(Event).delete()
            session.query(Trade).delete()
            session.commit()
        self.report_token = self._create_user_session(
            user_id="reports_viewer",
            email="reports@example.com",
            display_name="Reports Viewer",
        )
        self.report_headers = {"Authorization": f"Bearer {self.report_token}"}

    def _create_user_session(
        self,
        *,
        user_id: str,
        email: str,
        display_name: str,
        role: str = "TRADER",
    ) -> str:
        with self.SessionLocal() as session:
            user = UserAccount(
                user_id=user_id,
                email=email,
                display_name=display_name,
                role=role,
                password_hash=hash_password("supersecret1"),
                is_active=True,
                last_login_at=self.now,
                created_at=self.now,
                created_by="test",
                updated_at=self.now,
                updated_by="test",
                version=1,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            _, token = create_user_session(session, user)
            return token

    def _seed_trade(
        self,
        *,
        trade_id: str,
        counterparty: str,
        book: str,
        portfolio: str = "PROMPT",
        trade_currency_code: str = "USD",
        pricing_status: str = "PRICED",
        price_index_code: str | None = None,
        invoice_status: str = "ISSUED",
        payment_status: str = "PENDING",
        settlement_status: str = "INVOICED",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id=trade_id,
                    external_trade_id=f"EXT-{trade_id}",
                    source_system="ETRM",
                    created_at=self.now,
                    updated_at=self.now,
                    execution_timestamp=self.now,
                    trade_date=date(2026, 4, 1),
                    effective_start_date=date(2026, 4, 2),
                    effective_end_date=date(2026, 4, 10),
                    quality_spec=None,
                    unit_of_measure="BBL",
                    trade_currency_code=trade_currency_code,
                    location_code="CUSHING",
                    delivery_start=date(2026, 4, 2),
                    delivery_end=date(2026, 4, 10),
                    price_unit_code="BBL",
                    instrument_type="LINEAR",
                    option_type=None,
                    option_style=None,
                    option_strike_price=None,
                    option_expiration_date=None,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book=book,
                    portfolio=portfolio,
                    counterparty=counterparty,
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status=pricing_status,
                    confirmation_status="CONFIRMED",
                    nomination_status="NOMINATED",
                    allocation_status="ALLOCATED",
                    price_index_code=price_index_code,
                    price=80,
                    volume=1000,
                    invoice_status=invoice_status,
                    payment_status=payment_status,
                    settlement_status=settlement_status,
                    trader_user="trader.alpha",
                    status="ACTIVE",
                    last_event_id=f"evt-{trade_id.lower()}",
                )
            )
            session.commit()

    def _seed_price_observation(
        self,
        *,
        price_index_code: str,
        observation_date: date,
        value: float,
        unit_code: str = "BBL",
        currency_code: str = "USD",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                PriceIndexObservation(
                    price_index_code=price_index_code,
                    observation_date=observation_date,
                    value=Decimal(str(value)),
                    unit_code=unit_code,
                    currency_code=currency_code,
                    source_provider="TEST",
                    source_series_id=f"{price_index_code}-TEST",
                    source_frequency="DAILY",
                    source_published_at=self.now,
                    source_revision=None,
                    downloaded_at=self.now,
                    run_id=1,
                    raw_payload={"value": value},
                    created_at=self.now,
                    updated_at=self.now,
                )
            )
            session.commit()

    def _seed_trade_event(
        self,
        *,
        trade_id: str,
        event_id: str | None = None,
        event_type: str = "TradeCreated",
        payload: dict[str, object] | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            event_payload = payload
            if event_payload is None:
                trade = session.get(Trade, trade_id)
                if trade is None:
                    raise LookupError(f"Trade '{trade_id}' was not found for event seeding.")
                event_payload = {
                    "instrument_type": trade.instrument_type,
                    "trade_structure": trade.trade_structure,
                    "book": trade.book,
                    "portfolio": trade.portfolio,
                    "commodity_class": trade.commodity_class,
                    "pricing_type": trade.pricing_type,
                    "price_index_code": trade.price_index_code,
                    "trade_currency_code": trade.trade_currency_code,
                    "price_unit_code": trade.price_unit_code,
                    "trade_side": trade.trade_side,
                    "price": float(trade.price) if trade.price is not None else None,
                    "volume": float(trade.volume) if trade.volume is not None else None,
                    "settlement_status": trade.settlement_status,
                    "status": trade.status,
                }
            session.add(
                Event(
                    event_id=event_id or f"evt-{trade_id.lower()}",
                    aggregate_type="trade",
                    aggregate_id=trade_id,
                    event_type=event_type,
                    occurred_at=self.now,
                    recorded_at=self.now,
                    actor_id="trader.alpha",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload=event_payload,
                )
            )
            session.commit()

    def _seed_workflow_item(
        self,
        *,
        trade_id: str,
        workflow_type: str,
        status: str,
        owner: str | None = None,
        due_at: datetime | None = None,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeWorkflowItem(
                    trade_id=trade_id,
                    workflow_type=workflow_type,
                    status=status,
                    owner=owner,
                    due_at=due_at,
                    notes=None,
                    created_at=self.now,
                    created_by="ops.user",
                    updated_at=self.now,
                    updated_by="ops.user",
                    version=1,
                )
            )
            session.commit()

    def _seed_confirmation(
        self,
        *,
        trade_id: str,
        status: str = "CONFIRMED",
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeConfirmation(
                    trade_id=trade_id,
                    source_document_id=None,
                    confirmation_number=f"CNF-{trade_id}",
                    status=status,
                    sent_at=self.now,
                    confirmed_at=self.now if status == "CONFIRMED" else None,
                    issue_count=0,
                    last_issued_at=self.now,
                    last_issued_by="ops.user",
                    last_issue_method="EMAIL",
                    last_issue_recipient="ops@example.com",
                    last_issue_note=None,
                    receipt_status="CONFIRMED" if status == "CONFIRMED" else "PENDING",
                    received_at=self.now if status == "CONFIRMED" else None,
                    received_by="ops.user" if status == "CONFIRMED" else None,
                    response_method="EMAIL" if status == "CONFIRMED" else None,
                    response_reference=None,
                    response_note=None,
                    dispute_reason=None,
                    notes=None,
                    comparison_waiver_note=None,
                    comparison_waived_at=None,
                    comparison_waived_by=None,
                    created_at=self.now,
                    created_by="ops.user",
                    updated_at=self.now,
                    updated_by="ops.user",
                    version=1,
                )
            )
            session.commit()

    def _seed_accrual_lot(
        self,
        *,
        accrual_lot_id: str,
        trade_id: str,
        book: str,
        counterparty: str,
        actualized_quantity: float,
        billed_quantity: float,
        accrued_amount: float,
        billed_amount: float,
        collected_amount: float,
        disputed_amount: float = 0,
    ) -> None:
        with self.SessionLocal() as session:
            session.add(
                TradeAccrualLot(
                    accrual_lot_id=accrual_lot_id,
                    trade_id=trade_id,
                    delivery_id=f"DEL-{trade_id}",
                    leg_no=1,
                    book=book,
                    portfolio="PROMPT",
                    counterparty=counterparty,
                    commodity_class="CRUDE_OIL",
                    commodity="WTI",
                    trade_currency_code="USD",
                    accrual_currency_code="USD",
                    quantity_unit_code="BBL",
                    planned_quantity=Decimal(str(actualized_quantity)),
                    actualized_quantity=Decimal(str(actualized_quantity)),
                    billed_quantity=Decimal(str(billed_quantity)),
                    accrued_amount=Decimal(str(accrued_amount)),
                    billed_amount=Decimal(str(billed_amount)),
                    collected_amount=Decimal(str(collected_amount)),
                    disputed_amount=Decimal(str(disputed_amount)),
                    status="ACCRUED",
                    opened_at=self.now,
                    closed_at=None,
                    notes=None,
                    created_at=self.now,
                    created_by="settlement.ops",
                    updated_at=self.now,
                    updated_by="settlement.ops",
                    version=1,
                )
            )
            session.commit()

    def test_semantic_dataset_catalog_lists_workbook_ready_sources(self) -> None:
        response = self.client.get("/reports/datasets", headers=self.report_headers)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        dataset_ids = {dataset["dataset_id"] for dataset in payload}

        self.assertIn("current_trades", dataset_ids)
        self.assertIn("current_positions", dataset_ids)
        self.assertIn("reference_books", dataset_ids)
        self.assertIn("report_settlement_aging_rows", dataset_ids)
        self.assertIn("report_cash_forecast_points", dataset_ids)
        self.assertIn("report_settlement_exception_rows", dataset_ids)
        self.assertIn("report_pnl_trade_valuations", dataset_ids)

        aging_dataset = next(dataset for dataset in payload if dataset["dataset_id"] == "report_settlement_aging_rows")
        self.assertEqual(aging_dataset["source_kind"], "report_service")
        self.assertEqual(aging_dataset["source_ref"], "GET /reports/settlement-aging -> rows")
        self.assertEqual(aging_dataset["parameter_keys"], ["as_of", "book", "counterparty", "currency"])
        self.assertIn("as_of", aging_dataset["parameter_keys"])
        self.assertEqual(aging_dataset["access_policy_key"], "reports.read")

        field_keys = {field["field_key"] for field in aging_dataset["fields"]}
        self.assertIn("total_outstanding_amount", field_keys)
        self.assertIn("past_due_31_plus_amount", field_keys)
        self.assertIn("oldest_due_at", field_keys)

    def test_semantic_dataset_schema_endpoint_returns_one_dataset_or_404(self) -> None:
        response = self.client.get(
            "/reports/datasets/report_cash_forecast_points/schema",
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["dataset_id"], "report_cash_forecast_points")
        self.assertEqual(payload["grain"], "one row per forecast date and currency")
        self.assertEqual(payload["parameter_keys"], ["as_of", "book", "counterparty", "currency", "horizon_days"])
        amount_field = next(field for field in payload["fields"] if field["field_key"] == "expected_amount")
        self.assertEqual(amount_field["data_type"], "number")
        self.assertTrue(amount_field["aggregatable"])

        missing_response = self.client.get("/reports/datasets/not-a-dataset/schema", headers=self.report_headers)
        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(
            missing_response.json()["detail"],
            "Semantic dataset 'not-a-dataset' was not found.",
        )

    def test_report_definition_validate_accepts_known_dataset_fields(self) -> None:
        response = self.client.post(
            "/reports/definitions/validate",
            json={
                "report_key": "settlement-aging-summary",
                "name": "Settlement Aging Summary",
                "dataset_id": "report_settlement_aging_rows",
                "columns": [
                    {"field_key": "counterparty_code", "label": "Counterparty"},
                    {"field_key": "total_outstanding_amount", "label": "Outstanding"},
                    {"field_key": "past_due_31_plus_amount", "label": "31+ Past Due"},
                ],
                "parameter_keys": ["as_of", "currency"],
                "default_sort": ["counterparty_code"],
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["valid"])
        self.assertEqual(payload["status"], "valid")
        self.assertEqual(payload["error_count"], 0)
        self.assertEqual(payload["referenced_dataset_ids"], ["report_settlement_aging_rows"])
        dependencies = payload["dependency_edges"]
        self.assertTrue(
            any(
                edge["dependency_role"] == "source"
                and edge["to_kind"] == "semantic_dataset"
                and edge["to_ref"] == "report_settlement_aging_rows"
                for edge in dependencies
            )
        )
        self.assertTrue(
            any(edge["dependency_role"] == "field" and edge["field_ref"] == "total_outstanding_amount" for edge in dependencies)
        )
        self.assertTrue(
            any(edge["dependency_role"] == "parameter" and edge["field_ref"] == "currency" for edge in dependencies)
        )

    def test_report_definition_validate_rejects_unknown_dataset_fields(self) -> None:
        response = self.client.post(
            "/reports/definitions/validate",
            json={
                "report_key": "bad-aging-summary",
                "name": "Bad Aging Summary",
                "dataset_id": "report_settlement_aging_rows",
                "columns": [
                    {"field_key": "not_a_real_field"},
                    {"field_key": "not_a_real_field"},
                ],
                "parameter_keys": ["not_a_real_parameter", "not_a_real_parameter"],
                "default_sort": ["also_not_real"],
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertEqual(payload["status"], "invalid")
        issue_codes = {issue["code"] for issue in payload["issues"]}
        self.assertIn("unknown_field", issue_codes)
        self.assertIn("duplicate_column", issue_codes)
        self.assertIn("unknown_parameter", issue_codes)
        self.assertIn("duplicate_parameter", issue_codes)
        self.assertIn("unknown_sort_field", issue_codes)

    def test_workbook_definition_validate_accepts_dataset_and_formula_sheet_draft(self) -> None:
        response = self.client.post(
            "/reports/workbooks/validate",
            json={
                "workbook_key": "settlement-pack",
                "name": "Settlement Pack",
                "parameter_keys": ["as_of", "book"],
                "sheets": [
                    {
                        "sheet_key": "aging",
                        "sheet_name": "Aging",
                        "sheet_kind": "dataset",
                        "dataset_id": "report_settlement_aging_rows",
                        "columns": [
                            {"field_key": "counterparty_code"},
                            {"field_key": "total_outstanding_amount"},
                        ],
                    },
                    {
                        "sheet_key": "summary",
                        "sheet_name": "Summary",
                        "sheet_kind": "formula",
                        "depends_on": ["aging"],
                        "formulas": ["SUM(aging[total_outstanding_amount])"],
                    },
                ],
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["valid"])
        self.assertEqual(payload["error_count"], 0)
        self.assertEqual(payload["warning_count"], 1)
        self.assertEqual(payload["issues"][0]["code"], "formula_parse_not_enabled")
        self.assertEqual(payload["referenced_dataset_ids"], ["report_settlement_aging_rows"])
        self.assertTrue(
            any(
                edge["from_ref"] == "workbook_definition:settlement-pack.sheet:summary"
                and edge["to_kind"] == "workbook_sheet"
                and edge["to_ref"] == "aging"
                and edge["dependency_role"] == "formula_input"
                for edge in payload["dependency_edges"]
            )
        )

    def test_workbook_definition_validate_warns_for_report_sheet_parameters(self) -> None:
        response = self.client.post(
            "/reports/workbooks/validate",
            json={
                "workbook_key": "report-backed-pack",
                "name": "Report Backed Pack",
                "parameter_keys": ["as_of"],
                "sheets": [
                    {
                        "sheet_key": "aging_report",
                        "sheet_name": "Aging Report",
                        "sheet_kind": "report",
                        "report_key": "settlement-aging-summary",
                    },
                ],
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["valid"])
        self.assertEqual(payload["error_count"], 0)
        issue_codes = {issue["code"] for issue in payload["issues"]}
        self.assertIn("parameter_resolution_not_enabled", issue_codes)
        self.assertIn("report_sheet_resolution_not_enabled", issue_codes)
        self.assertTrue(
            any(
                edge["from_ref"] == "workbook_definition:report-backed-pack.sheet:aging_report"
                and edge["to_kind"] == "report_definition"
                and edge["to_ref"] == "settlement-aging-summary"
                and edge["dependency_role"] == "source"
                for edge in payload["dependency_edges"]
            )
        )

    def test_workbook_definition_validate_rejects_duplicate_and_unknown_sheet_dependencies(self) -> None:
        response = self.client.post(
            "/reports/workbooks/validate",
            json={
                "workbook_key": "bad-settlement-pack",
                "name": "Bad Settlement Pack",
                "parameter_keys": ["not_supported"],
                "sheets": [
                    {
                        "sheet_key": "summary",
                        "sheet_name": "Summary",
                        "sheet_kind": "formula",
                        "depends_on": ["missing"],
                    },
                    {
                        "sheet_key": "summary",
                        "sheet_name": "Duplicate Summary",
                        "sheet_kind": "dataset",
                        "dataset_id": "missing_dataset",
                    },
                    {
                        "sheet_key": "report_ref",
                        "sheet_name": "Report Ref",
                        "sheet_kind": "report",
                    },
                    {
                        "sheet_key": "prior_run",
                        "sheet_name": "Prior Run",
                        "sheet_kind": "workbook_run",
                    },
                ],
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertEqual(payload["status"], "invalid")
        issue_codes = {issue["code"] for issue in payload["issues"]}
        self.assertIn("duplicate_sheet_key", issue_codes)
        self.assertIn("unknown_sheet_dependency", issue_codes)
        self.assertIn("unknown_parameter", issue_codes)
        self.assertIn("unknown_dataset", issue_codes)
        self.assertIn("missing_report", issue_codes)
        self.assertIn("missing_run", issue_codes)

    def test_pnl_history_report_accepts_as_of_and_portfolio_filters(self) -> None:
        self._seed_trade(trade_id="T-PNL-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS", portfolio="PROMPT")
        self._seed_trade(
            trade_id="T-PNL-2",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            portfolio="LOAD_SHAPING",
        )

        response = self.client.get(
            "/reports/pnl-history",
            params={"as_of": "2026-04-06", "portfolio": "prompt"},
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_pnl"], 80000.0)
        self.assertEqual(payload["point_count"], 1)
        self.assertEqual(len(payload["valuations"]), 1)
        self.assertEqual(payload["valuations"][0]["trade_id"], "T-PNL-1")
        self.assertEqual(payload["valuations"][0]["portfolio"], "PROMPT")

    def test_pnl_comparison_report_returns_two_snapshot_delta(self) -> None:
        self._seed_trade(trade_id="T-COMP-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS", portfolio="PROMPT")
        self._seed_trade(
            trade_id="T-COMP-2",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            portfolio="LOAD_SHAPING",
        )

        response = self.client.get(
            "/reports/pnl-compare",
            params={
                "from_as_of": "2026-04-05",
                "to_as_of": "2026-04-06",
                "portfolio": "prompt",
            },
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["from_as_of"], "2026-04-05")
        self.assertEqual(payload["to_as_of"], "2026-04-06")
        self.assertEqual(payload["delta"]["total_pnl"], 80000.0)
        self.assertEqual(
            payload["attribution_summary"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 80000.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 0.0,
                "reconciled_pnl_delta": 80000.0,
            },
        )
        self.assertEqual(len(payload["portfolio_deltas"]), 1)
        self.assertEqual(payload["portfolio_deltas"][0]["portfolio"], "PROMPT")
        self.assertEqual(len(payload["attributions"]), 1)
        self.assertEqual(payload["attributions"][0]["trade_id"], "T-COMP-1")
        self.assertEqual(payload["attributions"][0]["attribution_category"], "NEW_POSITION")
        self.assertEqual(
            payload["attributions"][0]["breakdown"],
            {
                "market_move_pnl": 0.0,
                "quantity_change_pnl": 80000.0,
                "coverage_change_pnl": 0.0,
                "other_change_pnl": 0.0,
                "realization_transfer_pnl": 0.0,
                "reconciled_pnl_delta": 80000.0,
            },
        )
        self.assertEqual(payload["attributions"][0]["driver_events"], [])
        self.assertEqual(
            payload["attributions"][0]["driver_summary"],
            "No lifecycle events in the compare window; exposure changed across snapshots without a captured trade event.",
        )
        self.assertEqual(
            payload["daily_bridge"],
            [
                {
                    "from_as_of": "2026-04-05",
                    "to_as_of": "2026-04-06",
                    "delta": {
                        "total_pnl": 80000.0,
                        "realized_pnl": 0.0,
                        "unrealized_pnl": 80000.0,
                        "priced_trade_count": 1,
                        "realized_trade_count": 0,
                        "unrealized_trade_count": 1,
                    },
                    "attribution_summary": {
                        "market_move_pnl": 0.0,
                        "quantity_change_pnl": 80000.0,
                        "coverage_change_pnl": 0.0,
                        "other_change_pnl": 0.0,
                        "realization_transfer_pnl": 0.0,
                        "reconciled_pnl_delta": 80000.0,
                    },
                    "changed_trade_count": 1,
                    "top_driver_trade_id": "T-COMP-1",
                    "top_driver_category": "NEW_POSITION",
                    "top_driver_pnl_delta": 80000.0,
                    "top_driver_summary": (
                        "No lifecycle events in the compare window; exposure changed across snapshots "
                        "without a captured trade event."
                    ),
                }
            ],
        )

    def _seed_invoice(
        self,
        *,
        trade_id: str,
        invoice_number: str,
        invoice_amount: float,
        due_at: datetime,
        status: str = "ISSUED",
        invoice_currency_code: str = "USD",
    ) -> int:
        with self.SessionLocal() as session:
            invoice = TradeInvoice(
                trade_id=trade_id,
                invoice_number=invoice_number,
                invoice_currency_code=invoice_currency_code,
                invoice_amount=invoice_amount,
                status=status,
                issued_at=self.now,
                due_at=due_at,
                dispute_reason="Pricing discrepancy" if status == "DISPUTED" else None,
                notes=None,
                created_at=self.now,
                created_by="settlement.ops",
                updated_at=self.now,
                updated_by="settlement.ops",
                version=1,
            )
            session.add(invoice)
            session.commit()
            session.refresh(invoice)
            return invoice.id

    def _seed_payment(
        self,
        *,
        trade_id: str,
        invoice_id: int,
        payment_amount: float,
        due_at: datetime,
        status: str = "PAID",
        received_at: datetime | None = None,
        payment_currency_code: str = "USD",
    ) -> int:
        with self.SessionLocal() as session:
            payment = TradePayment(
                trade_id=trade_id,
                invoice_id=invoice_id,
                payment_reference=f"PMT-{trade_id}-{invoice_id}",
                payment_currency_code=payment_currency_code,
                payment_amount=payment_amount,
                status=status,
                due_at=due_at,
                received_at=received_at,
                notes=None,
                created_at=self.now,
                created_by="cash.ops",
                updated_at=self.now,
                updated_by="cash.ops",
                version=1,
            )
            session.add(payment)
            session.commit()
            session.refresh(payment)
            return payment.id

    def test_settlement_aging_report_groups_open_invoices_into_buckets(self) -> None:
        self._seed_trade(trade_id="T-AGE-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(trade_id="T-AGE-2", counterparty="SHELL_TRADING", book="CRUDE_PHYS", invoice_status="APPROVED")
        self._seed_trade(trade_id="T-AGE-3", counterparty="BP_TRADING", book="DISTILLATES", invoice_status="DISPUTED")
        self._seed_trade(
            trade_id="T-AGE-4",
            counterparty="MERCURIA",
            book="CRUDE_PHYS",
            invoice_status="APPROVED",
            payment_status="PAID",
            settlement_status="SETTLED",
        )

        self._seed_invoice(
            trade_id="T-AGE-1",
            invoice_number="INV-AGE-1",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 6, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )
        self._seed_invoice(
            trade_id="T-AGE-2",
            invoice_number="INV-AGE-2",
            invoice_amount=500,
            due_at=datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_invoice(
            trade_id="T-AGE-3",
            invoice_number="INV-AGE-3",
            invoice_amount=300,
            due_at=datetime(2026, 2, 25, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        paid_invoice_id = self._seed_invoice(
            trade_id="T-AGE-4",
            invoice_number="INV-AGE-4",
            invoice_amount=250,
            due_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-AGE-4",
            invoice_id=paid_invoice_id,
            payment_amount=250,
            due_at=datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 3, 15, 0, tzinfo=timezone.utc),
        )

        response = self.client.get("/reports/settlement-aging?as_of=2026-04-06", headers=self.report_headers)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["invoice_count"], 3)
        self.assertEqual(body["overdue_invoice_count"], 2)
        self.assertEqual(body["disputed_invoice_count"], 1)
        self.assertEqual(body["row_count"], 2)

        usd_summary = next(row for row in body["currency_summaries"] if row["currency_code"] == "USD")
        self.assertEqual(usd_summary["total_outstanding_amount"], 1800.0)
        self.assertEqual(usd_summary["current_amount"], 1000.0)
        self.assertEqual(usd_summary["past_due_1_7_amount"], 500.0)
        self.assertEqual(usd_summary["past_due_31_plus_amount"], 300.0)
        self.assertEqual(usd_summary["disputed_amount"], 300.0)

        rows_by_counterparty = {row["counterparty_code"]: row for row in body["rows"]}
        self.assertEqual(rows_by_counterparty["SHELL_TRADING"]["trade_count"], 2)
        self.assertEqual(rows_by_counterparty["SHELL_TRADING"]["total_outstanding_amount"], 1500.0)
        self.assertEqual(rows_by_counterparty["BP_TRADING"]["disputed_invoice_count"], 1)

    def test_cash_forecast_report_separates_open_overdue_and_received_cash(self) -> None:
        self._seed_trade(trade_id="T-CASH-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(trade_id="T-CASH-2", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(
            trade_id="T-CASH-3",
            counterparty="MERCURIA",
            book="CRUDE_PHYS",
            payment_status="PENDING",
            settlement_status="PARTIALLY_SETTLED",
        )
        self._seed_trade(
            trade_id="T-CASH-4",
            counterparty="VITOL",
            book="DISTILLATES",
            trade_currency_code="EUR",
        )

        self._seed_invoice(
            trade_id="T-CASH-1",
            invoice_number="INV-CASH-1",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )
        self._seed_invoice(
            trade_id="T-CASH-2",
            invoice_number="INV-CASH-2",
            invoice_amount=400,
            due_at=datetime(2026, 4, 4, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        partial_invoice_id = self._seed_invoice(
            trade_id="T-CASH-3",
            invoice_number="INV-CASH-3",
            invoice_amount=900,
            due_at=datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-CASH-3",
            invoice_id=partial_invoice_id,
            payment_amount=350,
            due_at=datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 7, 14, 0, tzinfo=timezone.utc),
        )
        self._seed_invoice(
            trade_id="T-CASH-4",
            invoice_number="INV-CASH-4",
            invoice_amount=200,
            due_at=datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
            invoice_currency_code="EUR",
        )

        response = self.client.get("/reports/cash-forecast?as_of=2026-04-06&horizon_days=7", headers=self.report_headers)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["horizon_days"], 7)
        self.assertIn("Expected cash is derived", body["basis"])
        self.assertEqual(body["row_count"], 4)

        summaries = {row["currency_code"]: row for row in body["currency_summaries"]}
        self.assertEqual(summaries["USD"]["open_outstanding_amount"], 1950.0)
        self.assertEqual(summaries["USD"]["overdue_outstanding_amount"], 400.0)
        self.assertEqual(summaries["USD"]["expected_horizon_amount"], 1550.0)
        self.assertEqual(summaries["USD"]["received_horizon_amount"], 350.0)
        self.assertEqual(summaries["USD"]["upcoming_invoice_count"], 2)
        self.assertEqual(summaries["USD"]["overdue_invoice_count"], 1)
        self.assertEqual(summaries["USD"]["received_payment_count"], 1)
        self.assertEqual(summaries["EUR"]["open_outstanding_amount"], 200.0)
        self.assertEqual(summaries["EUR"]["expected_horizon_amount"], 200.0)

        points = {(row["forecast_date"], row["currency_code"]): row for row in body["points"]}
        self.assertEqual(points[("2026-04-07", "USD")]["received_amount"], 350.0)
        self.assertEqual(points[("2026-04-08", "USD")]["expected_amount"], 1000.0)
        self.assertEqual(points[("2026-04-09", "EUR")]["expected_amount"], 200.0)
        self.assertEqual(points[("2026-04-12", "USD")]["expected_amount"], 550.0)

    def test_cash_forecast_validates_horizon_days(self) -> None:
        response = self.client.get("/reports/cash-forecast?horizon_days=0", headers=self.report_headers)
        self.assertEqual(response.status_code, 422)
        self.assertIn("horizon_days must be greater than zero", response.json()["detail"])

    def test_settlement_exception_report_surfaces_disputes_short_pays_and_overdues(self) -> None:
        self._seed_trade(trade_id="T-EX-1", counterparty="BP_TRADING", book="CRUDE_PHYS", invoice_status="DISPUTED")
        self._seed_trade(
            trade_id="T-EX-2",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            payment_status="PENDING",
            settlement_status="PARTIALLY_SETTLED",
        )
        self._seed_trade(trade_id="T-EX-3", counterparty="VITOL", book="DISTILLATES")

        self._seed_invoice(
            trade_id="T-EX-1",
            invoice_number="INV-EX-1",
            invoice_amount=700,
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        short_pay_invoice_id = self._seed_invoice(
            trade_id="T-EX-2",
            invoice_number="INV-EX-2",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-EX-2",
            invoice_id=short_pay_invoice_id,
            payment_amount=400,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 5, 17, 0, tzinfo=timezone.utc),
        )
        self._seed_invoice(
            trade_id="T-EX-3",
            invoice_number="INV-EX-3",
            invoice_amount=300,
            due_at=datetime(2026, 4, 3, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )

        response = self.client.get("/reports/settlement-exceptions?as_of=2026-04-06", headers=self.report_headers)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["row_count"], 4)
        self.assertEqual(body["blocked_count"], 3)
        self.assertEqual(body["warning_count"], 1)

        summaries = {row["exception_type"]: row for row in body["summaries"]}
        self.assertEqual(summaries["DISPUTED_INVOICE"]["exception_count"], 1)
        self.assertEqual(summaries["SHORT_PAY"]["exception_count"], 1)
        self.assertEqual(summaries["OVERDUE_PAYMENT"]["exception_count"], 2)

        dispute_rows = [row for row in body["rows"] if row["exception_type"] == "DISPUTED_INVOICE"]
        self.assertEqual(len(dispute_rows), 1)
        self.assertEqual(dispute_rows[0]["trade_id"], "T-EX-1")
        self.assertEqual(dispute_rows[0]["severity"], "blocked")

        short_pay_rows = [row for row in body["rows"] if row["exception_type"] == "SHORT_PAY"]
        self.assertEqual(len(short_pay_rows), 1)
        self.assertEqual(short_pay_rows[0]["trade_id"], "T-EX-2")
        self.assertEqual(short_pay_rows[0]["severity"], "in-progress")
        self.assertEqual(short_pay_rows[0]["total_paid_amount"], 400.0)
        self.assertEqual(short_pay_rows[0]["outstanding_amount"], 600.0)

        overdue_rows = [row for row in body["rows"] if row["exception_type"] == "OVERDUE_PAYMENT"]
        self.assertEqual(len(overdue_rows), 2)
        overdue_trade_ids = {row["trade_id"] for row in overdue_rows}
        self.assertEqual(overdue_trade_ids, {"T-EX-1", "T-EX-3"})

    def test_settlement_reports_support_server_side_filters_and_filter_options(self) -> None:
        self._seed_trade(trade_id="T-FLT-1", counterparty="SHELL_TRADING", book="CRUDE_PHYS")
        self._seed_trade(
            trade_id="T-FLT-2",
            counterparty="VITOL",
            book="DISTILLATES",
            trade_currency_code="EUR",
        )
        self._seed_trade(trade_id="T-FLT-3", counterparty="BP_TRADING", book="CRUDE_PHYS", invoice_status="DISPUTED")

        self._seed_invoice(
            trade_id="T-FLT-1",
            invoice_number="INV-FLT-1",
            invoice_amount=1000,
            due_at=datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
        )
        self._seed_invoice(
            trade_id="T-FLT-2",
            invoice_number="INV-FLT-2",
            invoice_amount=200,
            due_at=datetime(2026, 4, 9, 12, 0, tzinfo=timezone.utc),
            status="ISSUED",
            invoice_currency_code="EUR",
        )
        short_pay_invoice_id = self._seed_invoice(
            trade_id="T-FLT-3",
            invoice_number="INV-FLT-3",
            invoice_amount=600,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        self._seed_payment(
            trade_id="T-FLT-3",
            invoice_id=short_pay_invoice_id,
            payment_amount=250,
            due_at=datetime(2026, 4, 10, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 5, 13, 0, tzinfo=timezone.utc),
        )

        aging_response = self.client.get(
            "/reports/settlement-aging?as_of=2026-04-06&book=DISTILLATES&currency=EUR",
            headers=self.report_headers,
        )
        self.assertEqual(aging_response.status_code, 200)
        aging_body = aging_response.json()
        self.assertEqual(aging_body["row_count"], 1)
        self.assertEqual(aging_body["invoice_count"], 1)
        self.assertEqual(aging_body["rows"][0]["counterparty_code"], "VITOL")
        self.assertEqual(aging_body["currency_summaries"][0]["currency_code"], "EUR")

        forecast_response = self.client.get(
            "/reports/cash-forecast?as_of=2026-04-06&horizon_days=7&counterparty=VITOL&currency=EUR",
            headers=self.report_headers,
        )
        self.assertEqual(forecast_response.status_code, 200)
        forecast_body = forecast_response.json()
        self.assertEqual(forecast_body["row_count"], 1)
        self.assertEqual(len(forecast_body["currency_summaries"]), 1)
        self.assertEqual(forecast_body["currency_summaries"][0]["currency_code"], "EUR")
        self.assertEqual(forecast_body["points"][0]["currency_code"], "EUR")

        exception_response = self.client.get(
            "/reports/settlement-exceptions?as_of=2026-04-06&counterparty=BP_TRADING&exception_type=SHORT_PAY&severity=in-progress",
            headers=self.report_headers,
        )
        self.assertEqual(exception_response.status_code, 200)
        exception_body = exception_response.json()
        self.assertEqual(exception_body["row_count"], 1)
        self.assertEqual(exception_body["rows"][0]["trade_id"], "T-FLT-3")
        self.assertEqual(exception_body["rows"][0]["exception_type"], "SHORT_PAY")

        filter_options_response = self.client.get(
            "/reports/settlement-filter-options?as_of=2026-04-06",
            headers=self.report_headers,
        )
        self.assertEqual(filter_options_response.status_code, 200)
        filter_options = filter_options_response.json()
        self.assertEqual(filter_options["books"], ["CRUDE_PHYS", "DISTILLATES"])
        self.assertEqual(filter_options["counterparties"], ["BP_TRADING", "SHELL_TRADING", "VITOL"])
        self.assertEqual(filter_options["currencies"], ["EUR", "USD"])
        self.assertEqual(
            filter_options["exception_types"],
            ["DISPUTED_INVOICE", "SHORT_PAY", "OVERDUE_PAYMENT"],
        )
        self.assertEqual(filter_options["severities"], ["blocked", "in-progress"])

    def test_settlement_presets_are_scoped_to_user_and_shared_scope(self) -> None:
        response = self.client.get("/reports/settlement-presets")
        self.assertEqual(response.status_code, 401)

        alpha_token = self._create_user_session(
            user_id="trader_alpha",
            email="alpha@example.com",
            display_name="Trader Alpha",
        )
        beta_token = self._create_user_session(
            user_id="trader_beta",
            email="beta@example.com",
            display_name="Trader Beta",
        )

        alpha_personal = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Midwest cash watch",
                "scope": "PERSONAL",
                "filters": {
                    "book": "CRUDE_PHYS",
                    "currency": "USD",
                },
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_personal.status_code, 201)
        self.assertEqual(alpha_personal.json()["scope"], "PERSONAL")

        alpha_shared = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Desk blocked cash",
                "scope": "SHARED",
                "filters": {
                    "exception_type": "OVERDUE_PAYMENT",
                    "severity": "blocked",
                },
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_shared.status_code, 201)
        shared_preset_id = alpha_shared.json()["preset_id"]
        self.assertTrue(alpha_shared.json()["can_edit"])

        beta_personal = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Midwest cash watch",
                "scope": "PERSONAL",
                "filters": {
                    "counterparty": "VITOL",
                    "currency": "EUR",
                },
            },
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_personal.status_code, 201)

        alpha_duplicate = self.client.post(
            "/reports/settlement-presets",
            json={
                "name": "Desk blocked cash",
                "scope": "SHARED",
                "filters": {},
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_duplicate.status_code, 409)

        alpha_list = self.client.get(
            "/reports/settlement-presets",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_list.status_code, 200)
        alpha_names = {row["name"] for row in alpha_list.json()}
        self.assertEqual(alpha_names, {"Midwest cash watch", "Desk blocked cash"})

        beta_list = self.client.get(
            "/reports/settlement-presets",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_list.status_code, 200)
        beta_rows = beta_list.json()
        beta_names = {row["name"] for row in beta_rows}
        self.assertEqual(beta_names, {"Midwest cash watch", "Desk blocked cash"})
        shared_row = next(row for row in beta_rows if row["name"] == "Desk blocked cash")
        self.assertFalse(shared_row["can_edit"])

        beta_update_shared = self.client.patch(
            f"/reports/settlement-presets/{shared_preset_id}",
            json={"name": "Desk blocked cash v2"},
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_update_shared.status_code, 403)

        alpha_update_shared = self.client.patch(
            f"/reports/settlement-presets/{shared_preset_id}",
            json={
                "name": "Desk blocked cash v2",
                "filters": {
                    "exception_type": "OVERDUE_PAYMENT",
                    "severity": "blocked",
                    "currency": "USD",
                },
            },
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_update_shared.status_code, 200)
        self.assertEqual(alpha_update_shared.json()["name"], "Desk blocked cash v2")
        self.assertEqual(alpha_update_shared.json()["filters"]["currency"], "USD")

        beta_delete_shared = self.client.delete(
            f"/reports/settlement-presets/{shared_preset_id}",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_delete_shared.status_code, 403)

        alpha_delete_shared = self.client.delete(
            f"/reports/settlement-presets/{shared_preset_id}",
            headers={"Authorization": f"Bearer {alpha_token}"},
        )
        self.assertEqual(alpha_delete_shared.status_code, 204)

        beta_list_after_delete = self.client.get(
            "/reports/settlement-presets",
            headers={"Authorization": f"Bearer {beta_token}"},
        )
        self.assertEqual(beta_list_after_delete.status_code, 200)
        beta_names_after_delete = {row["name"] for row in beta_list_after_delete.json()}
        self.assertEqual(beta_names_after_delete, {"Midwest cash watch"})

    def test_trading_eod_report_rolls_blocked_and_warning_checks(self) -> None:
        self._seed_trade(
            trade_id="T-EOD-BLOCKED",
            counterparty="BP_TRADING",
            book="CRUDE_PHYS",
            pricing_status="PENDING",
            invoice_status="DISPUTED",
            payment_status="PENDING",
            settlement_status="DISPUTED",
        )
        self._seed_invoice(
            trade_id="T-EOD-BLOCKED",
            invoice_number="INV-EOD-BLOCKED",
            invoice_amount=700,
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            status="DISPUTED",
        )
        self._seed_workflow_item(
            trade_id="T-EOD-BLOCKED",
            workflow_type="INVOICE",
            status="ISSUED",
            owner="settlement.ops",
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        )
        self._seed_accrual_lot(
            accrual_lot_id="LOT-EOD-BLOCKED",
            trade_id="T-EOD-BLOCKED",
            book="CRUDE_PHYS",
            counterparty="BP_TRADING",
            actualized_quantity=1000,
            billed_quantity=750,
            accrued_amount=500,
            billed_amount=250,
            collected_amount=0,
        )

        response = self.client.get(
            "/reports/trading-eod?business_date=2026-04-06&as_of=2026-04-06",
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["business_date"], "2026-04-06")
        self.assertEqual(payload["as_of"], "2026-04-06")
        self.assertEqual(payload["status"], "BLOCKED")
        self.assertEqual(payload["blocked_check_count"], 2)
        self.assertEqual(payload["warning_check_count"], 2)
        self.assertEqual(payload["ready_check_count"], 0)
        self.assertIn("live projections", payload["basis"])
        self.assertEqual(payload["trade_summary"]["pending_pricing_count"], 1)
        self.assertEqual(payload["settlement_summary"]["blocked_exception_count"], 2)
        self.assertEqual(payload["projection_summary"]["structural_issue_count"], 1)
        self.assertEqual(payload["accrual_summary"]["row_count"], 1)
        self.assertEqual(payload["accrual_summary"]["unbilled_amount_total"], 250.0)

        checks_by_key = {row["key"]: row for row in payload["checks"]}
        self.assertEqual(checks_by_key["pricing_readiness"]["status"], "WARNING")
        self.assertEqual(checks_by_key["workflow_pressure"]["status"], "WARNING")
        self.assertEqual(checks_by_key["settlement_posture"]["status"], "BLOCKED")
        self.assertEqual(checks_by_key["projection_integrity"]["status"], "BLOCKED")

    def test_trading_eod_report_can_return_ready_status(self) -> None:
        self._seed_trade(
            trade_id="T-EOD-READY",
            counterparty="SHELL_TRADING",
            book="CRUDE_PHYS",
            pricing_status="PRICED",
            price_index_code="WTI_TEST",
            invoice_status="APPROVED",
            payment_status="PAID",
            settlement_status="SETTLED",
        )
        self._seed_trade_event(trade_id="T-EOD-READY")
        self._seed_price_observation(
            price_index_code="WTI_TEST",
            observation_date=date(2026, 4, 6),
            value=90,
        )
        self._seed_confirmation(trade_id="T-EOD-READY", status="CONFIRMED")
        self._seed_workflow_item(
            trade_id="T-EOD-READY",
            workflow_type="CONFIRMATION",
            status="CONFIRMED",
            owner="ops.user",
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        )
        paid_invoice_id = self._seed_invoice(
            trade_id="T-EOD-READY",
            invoice_number="INV-EOD-READY",
            invoice_amount=400,
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            status="APPROVED",
        )
        self._seed_payment(
            trade_id="T-EOD-READY",
            invoice_id=paid_invoice_id,
            payment_amount=400,
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
            status="PAID",
            received_at=datetime(2026, 4, 5, 15, 0, tzinfo=timezone.utc),
        )
        self._seed_workflow_item(
            trade_id="T-EOD-READY",
            workflow_type="PAYMENT",
            status="PAID",
            owner="settlement.ops",
            due_at=datetime(2026, 4, 5, 12, 0, tzinfo=timezone.utc),
        )
        self._seed_accrual_lot(
            accrual_lot_id="LOT-EOD-READY",
            trade_id="T-EOD-READY",
            book="CRUDE_PHYS",
            counterparty="SHELL_TRADING",
            actualized_quantity=1000,
            billed_quantity=1000,
            accrued_amount=400,
            billed_amount=400,
            collected_amount=400,
        )

        response = self.client.get(
            "/reports/trading-eod?business_date=2026-04-06",
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "READY")
        self.assertEqual(payload["blocked_check_count"], 0)
        self.assertEqual(payload["warning_check_count"], 0)
        self.assertEqual(payload["ready_check_count"], 4)
        self.assertEqual(payload["trade_summary"]["active_trade_count"], 1)
        self.assertEqual(payload["projection_summary"]["structural_issue_count"], 0)
        self.assertEqual(payload["projection_summary"]["invariant_issue_count"], 0)
        self.assertEqual(payload["settlement_summary"]["blocked_exception_count"], 0)

        checks_by_key = {row["key"]: row for row in payload["checks"]}
        self.assertTrue(all(row["status"] == "READY" for row in checks_by_key.values()))

    def test_trading_eod_report_rejects_as_of_before_business_date(self) -> None:
        response = self.client.get(
            "/reports/trading-eod?business_date=2026-04-07&as_of=2026-04-06",
            headers=self.report_headers,
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "as_of must be on or after business_date")
