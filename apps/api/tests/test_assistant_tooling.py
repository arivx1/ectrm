from __future__ import annotations

import enum
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

if not hasattr(enum, "StrEnum"):
    class _CompatStrEnum(str, enum.Enum):
        pass

    enum.StrEnum = _CompatStrEnum  # type: ignore[attr-defined]

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.domains.assistant.services.chat import AssistantService
from apps.api.app.domains.assistant.services.registry import to_managed_agent
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    build_recommendation_run_payload,
    prepare_pretrade_recommendation_evaluation,
)
from apps.api.app.domains.assistant.services.tools import AssistantToolService, AssistantToolServiceError
from apps.api.app.models import Base
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.home_view_definition import HomeViewDefinition
from apps.api.app.models.option_exposure import OptionExposure
from apps.api.app.models.position import Position
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_counterparty_credit_profile import ReferenceCounterpartyCreditProfile
from apps.api.app.models.reference_counterparty_external_credit_snapshot import (
    ReferenceCounterpartyExternalCreditSnapshot,
)
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.schemas.document import (
    DocumentGmailInboxAttachmentOut,
    DocumentGmailInboxBrowseResultOut,
    DocumentGmailInboxMessageDetailOut,
    DocumentGmailInboxMessageSummaryOut,
)
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationSourceProvenance,
    PreTradeRecommendationSourceSnapshot,
    PreTradeScenarioDraft,
)
from apps.api.app.schemas.assistant import AssistantMessageOut, AssistantPromptRequest, AssistantPromptResponse, AssistantUsageOut


class AssistantToolingTests(unittest.IsolatedAsyncioTestCase):
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
        self._previous_settings = {
            "ASSISTANT_ENABLED": settings.ASSISTANT_ENABLED,
            "ASSISTANT_DEFAULT_PROVIDER": settings.ASSISTANT_DEFAULT_PROVIDER,
            "ASSISTANT_MAX_TOOL_ROUNDS": settings.ASSISTANT_MAX_TOOL_ROUNDS,
            "OPENAI_API_KEY": settings.OPENAI_API_KEY,
            "OPENAI_MODEL": settings.OPENAI_MODEL,
            "OPENAI_AGENT_BUILDER_MODEL": settings.OPENAI_AGENT_BUILDER_MODEL,
            "OPENAI_BASE_URL": settings.OPENAI_BASE_URL,
        }

        with self.SessionLocal() as session:
            session.query(ExternalSeriesObservation).delete()
            session.query(ExternalSeriesDefinition).delete()
            session.query(OptionExposure).delete()
            session.query(Position).delete()
            session.query(PriceIndexObservation).delete()
            session.query(ReferenceCounterpartyExternalCreditSnapshot).delete()
            session.query(ReferenceCounterpartyCreditProfile).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ExternalDataRun).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(AssistantAgent).delete()
            session.query(DeliveryEvent).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryObligation).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(HomeViewDefinition).delete()
            session.query(ReportPreset).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(UserAccount).delete()
            session.add(
                Event(
                    event_id="evt-1001",
                    aggregate_type="trade",
                    aggregate_id="T-1001",
                    event_type="TradeCreated",
                    occurred_at=datetime(2026, 3, 17, 11, 45, tzinfo=timezone.utc),
                    recorded_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    actor_id="trader_1",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-1001"},
                )
            )
            session.add(
                Trade(
                    trade_id="T-1001",
                    external_trade_id="EXT-1001",
                    source_system="ops",
                    created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 17, 12, 5, tzinfo=timezone.utc),
                    execution_timestamp=datetime(2026, 3, 17, 11, 45, tzinfo=timezone.utc),
                    trade_date=datetime(2026, 3, 17, 0, 0, tzinfo=timezone.utc).date(),
                    trade_currency_code="USD",
                    location_code="HENRY",
                    delivery_start=datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc).date(),
                    delivery_end=datetime(2026, 4, 30, 0, 0, tzinfo=timezone.utc).date(),
                    unit_of_measure="MMBTU",
                    price_unit_code="USD_MMBTU",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS-US",
                    portfolio="NORTH",
                    counterparty="ACME",
                    commodity_class="GAS",
                    commodity="HH",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=3.25,
                    volume=1000,
                    confirmation_status="PENDING",
                    nomination_status="SCHEDULED",
                    allocation_status="PENDING",
                    actualization_status="PARTIALLY_ACTUALIZED",
                    invoice_status="ISSUED",
                    payment_status="DUE",
                    settlement_status="PARTIALLY_SETTLED",
                    trader_user="trader_1",
                    status="ACTIVE",
                    last_event_id="evt-1001",
                )
            )
            session.add_all(
                [
                    TradeWorkflowItem(
                        id=1,
                        trade_id="T-1001",
                        workflow_type="CONFIRMATION",
                        status="PENDING",
                        owner="ops.confirmations",
                        due_at=datetime(2099, 3, 20, 12, 0, tzinfo=timezone.utc),
                        notes="Awaiting confirmation outreach.",
                        created_at=datetime(2026, 3, 17, 12, 10, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 10, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    TradeWorkflowItem(
                        id=2,
                        trade_id="T-1001",
                        workflow_type="PAYMENT",
                        status="DUE",
                        owner="cash.ops",
                        due_at=datetime(2099, 3, 22, 17, 0, tzinfo=timezone.utc),
                        notes="Cash settlement due after invoice approval.",
                        created_at=datetime(2026, 3, 17, 12, 20, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 20, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    TradeWorkflowItem(
                        id=3,
                        trade_id="T-1001",
                        workflow_type="INVOICE",
                        status="APPROVED",
                        owner="settlement.ops",
                        due_at=datetime(2099, 3, 18, 12, 0, tzinfo=timezone.utc),
                        notes="Invoice approved and closed.",
                        created_at=datetime(2026, 3, 17, 12, 25, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 25, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                ]
            )
            session.add_all(
                [
                    TradeConfirmation(
                        id=1,
                        trade_id="T-1001",
                        source_document_id=None,
                        confirmation_number="CNF-1001-A",
                        status="SENT",
                        sent_at=datetime(2026, 3, 17, 13, 0, tzinfo=timezone.utc),
                        confirmed_at=None,
                        issue_count=1,
                        last_issued_at=datetime(2026, 3, 17, 13, 0, tzinfo=timezone.utc),
                        last_issued_by="ops.confirmations",
                        last_issue_method="EMAIL",
                        last_issue_recipient="acme@example.com",
                        last_issue_note="Initial issue",
                        receipt_status="ISSUED_AWAITING_RESPONSE",
                        received_at=None,
                        received_by=None,
                        response_method=None,
                        response_reference=None,
                        response_note=None,
                        dispute_reason=None,
                        notes="Original draft",
                        comparison_waiver_note=None,
                        comparison_waived_at=None,
                        comparison_waived_by=None,
                        created_at=datetime(2026, 3, 17, 12, 30, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 13, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    TradeConfirmation(
                        id=2,
                        trade_id="T-1001",
                        source_document_id=None,
                        confirmation_number="CNF-1001-B",
                        status="DISPUTED",
                        sent_at=datetime(2026, 3, 18, 9, 0, tzinfo=timezone.utc),
                        confirmed_at=None,
                        issue_count=2,
                        last_issued_at=datetime(2026, 3, 18, 9, 0, tzinfo=timezone.utc),
                        last_issued_by="ops.confirmations",
                        last_issue_method="EMAIL",
                        last_issue_recipient="acme@example.com",
                        last_issue_note="Superseded and reissued",
                        receipt_status="COUNTERPARTY_DISPUTED",
                        received_at=datetime(2026, 3, 18, 10, 0, tzinfo=timezone.utc),
                        received_by="ops.confirmations",
                        response_method="EMAIL",
                        response_reference="reply-1001",
                        response_note="Counterparty challenged price terms.",
                        dispute_reason="Price mismatch",
                        notes="Current disputed draft",
                        comparison_waiver_note=None,
                        comparison_waived_at=None,
                        comparison_waived_by=None,
                        created_at=datetime(2026, 3, 18, 8, 45, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 18, 10, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=2,
                    ),
                ]
            )
            session.add(
                TradeInvoice(
                    id=1,
                    trade_id="T-1001",
                    delivery_id="DEL-1001",
                    leg_no=None,
                    invoice_number="INV-T-1001",
                    invoice_currency_code="USD",
                    billed_quantity=1000,
                    quantity_unit_code="MMBTU",
                    invoice_amount=3250,
                    status="ISSUED",
                    issued_at=datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc),
                    due_at=datetime(2099, 3, 25, 12, 0, tzinfo=timezone.utc),
                    dispute_reason=None,
                    notes="Primary settlement invoice.",
                    created_at=datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc),
                    created_by="system",
                    updated_at=datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc),
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                TradePayment(
                    id=1,
                    trade_id="T-1001",
                    invoice_id=1,
                    payment_reference="PAY-T-1001-1",
                    payment_currency_code="USD",
                    payment_amount=1000,
                    status="PAID",
                    due_at=datetime(2099, 3, 27, 12, 0, tzinfo=timezone.utc),
                    received_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
                    notes="First cash collection remains open.",
                    created_at=datetime(2026, 3, 19, 9, 0, tzinfo=timezone.utc),
                    created_by="system",
                    updated_at=datetime(2026, 3, 19, 9, 0, tzinfo=timezone.utc),
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                DeliveryObligation(
                    delivery_id="DEL-1001",
                    trade_id="T-1001",
                    trade_leg_id=None,
                    leg_no=None,
                    external_trade_id="EXT-1001",
                    direction="BUY",
                    mode_family="NETWORK_FLOW",
                    transport_mode="PIPELINE",
                    transport_mode_source="TRADE_DERIVED",
                    delivery_profile="FLOW_WINDOW",
                    book="GAS-US",
                    book_source="TRADE_DERIVED",
                    portfolio="NORTH",
                    portfolio_source="TRADE_DERIVED",
                    counterparty="ACME",
                    counterparty_source="TRADE_DERIVED",
                    commodity_class="GAS",
                    commodity="HH",
                    volume=1000,
                    unit_of_measure="MMBTU",
                    trade_currency_code="USD",
                    price_unit_code="USD_MMBTU",
                    location_code="HENRY",
                    location_source="TRADE_DERIVED",
                    delivery_start=datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc).date(),
                    delivery_end=datetime(2026, 4, 30, 0, 0, tzinfo=timezone.utc).date(),
                    delivery_window_source="TRADE_DERIVED",
                    execution_status="PLANNED",
                    execution_status_source="TRADE_DERIVED",
                    operations_owner="ops.scheduler",
                    operations_owner_source="MANUAL",
                    external_reference="PIPE-REF-1001",
                    external_reference_source="MANUAL",
                    ops_notes="Pipeline path confirmed.",
                    ops_notes_source="MANUAL",
                    booked_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    source_trade_updated_at=datetime(2026, 3, 17, 12, 5, tzinfo=timezone.utc),
                    created_at=datetime(2026, 3, 17, 12, 10, tzinfo=timezone.utc),
                    created_by="system",
                    updated_at=datetime(2026, 3, 18, 8, 0, tzinfo=timezone.utc),
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                DeliveryEvent(
                    id=1,
                    delivery_id="DEL-1001",
                    trade_id="T-1001",
                    leg_no=None,
                    event_type="PLAN_CAPTURED",
                    execution_status="PLANNED",
                    occurred_at=datetime(2026, 3, 18, 8, 0, tzinfo=timezone.utc),
                    location_code="HENRY",
                    reference_code="PIPE-REF-1001",
                    source="system",
                    notes="Initial delivery plan captured.",
                    created_at=datetime(2026, 3, 18, 8, 0, tzinfo=timezone.utc),
                    created_by="system",
                    updated_at=datetime(2026, 3, 18, 8, 0, tzinfo=timezone.utc),
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                TradeActualization(
                    id=1,
                    delivery_id="DEL-1001",
                    trade_id="T-1001",
                    leg_no=None,
                    actual_quantity=980,
                    actualized_at=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
                    source="scheduler",
                    notes="Interim actualization.",
                    created_at=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
                    created_by="scheduler",
                    updated_at=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
                    updated_by="scheduler",
                    version=1,
                )
            )
            session.add(
                DocumentIngestion(
                    document_id="doc-1001",
                    original_filename="trade-confirmation.pdf",
                    display_name="Trade Confirmation T-1001",
                    content_type="application/pdf",
                    storage_key="documents/doc-1001.pdf",
                    sha256="0" * 64,
                    size_bytes=1024,
                    page_count=1,
                    status="ANALYZED",
                    processor_provider="openai",
                    processor_model="gpt-5-mini",
                    classifier_version="test-classifier",
                    extractor_version="test-extractor",
                    analysis_summary={},
                    processing_errors=[],
                    review_status="IN_REVIEW",
                    review_notes="Need economics signoff.",
                    reviewed_at=None,
                    reviewed_by=None,
                    created_at=datetime(2026, 3, 18, 14, 0, tzinfo=timezone.utc),
                    created_by="ops.confirmations",
                    updated_at=datetime(2026, 3, 18, 14, 30, tzinfo=timezone.utc),
                    updated_by="ops.confirmations",
                    version=1,
                )
            )
            session.add(
                DocumentIngestionPage(
                    page_id=1,
                    document_id="doc-1001",
                    page_number=1,
                    classification_status="ANALYZED",
                    extraction_status="ANALYZED",
                    document_kind="TRADE_CONFIRMATION",
                    document_subtype=None,
                    classification_confidence=0.98,
                    classification_payload={"reason": "seeded"},
                    header_fields=[
                        {
                            "field_key": "trade_id",
                            "label": "Trade ID",
                            "value": "T-1001",
                            "confidence": 0.99,
                            "source": "ocr",
                        },
                        {
                            "field_key": "confirmation_number",
                            "label": "Confirmation Number",
                            "value": "CNF-1001-B",
                            "confidence": 0.95,
                            "source": "ocr",
                        },
                    ],
                    table_blocks=[],
                    raw_text="Trade confirmation for T-1001.",
                    processing_warnings=[],
                    processing_errors=[],
                    review_status="UNREVIEWED",
                    review_notes=None,
                    reviewed_at=None,
                    reviewed_by=None,
                    processed_at=datetime(2026, 3, 18, 14, 15, tzinfo=timezone.utc),
                    created_at=datetime(2026, 3, 18, 14, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 18, 14, 15, tzinfo=timezone.utc),
                )
            )
            session.add(
                ReferencePriceIndex(
                    code="WTI_CUSHING_D",
                    name="WTI Cushing Spot Daily",
                    commodity_code="WTI",
                    currency_code="USD",
                    unit_code="BBL",
                    provider="EIA",
                    market="CUSHING",
                    location_code=None,
                    calendar_code=None,
                    description="WTI test index",
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    created_by="system",
                    updated_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                ExternalDataRun(
                    id=1,
                    provider="FRED",
                    job_name="sync_fred_series",
                    status="SUCCEEDED",
                    started_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    finished_at=datetime(2026, 3, 17, 12, 1, tzinfo=timezone.utc),
                    requested_by="system",
                    series_count=2,
                    observation_count=3,
                    error_summary=None,
                    created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                )
            )
            session.add(
                ExternalDataRun(
                    id=2,
                    provider="CAISO",
                    job_name="sync_caiso_power_series",
                    status="SUCCEEDED",
                    started_at=datetime(2026, 3, 17, 12, 10, tzinfo=timezone.utc),
                    finished_at=datetime(2026, 3, 17, 12, 11, tzinfo=timezone.utc),
                    requested_by="system",
                    series_count=1,
                    observation_count=1,
                    error_summary=None,
                    created_at=datetime(2026, 3, 17, 12, 10, tzinfo=timezone.utc),
                )
            )
            session.add(
                PriceIndexObservation(
                    id=1,
                    price_index_code="WTI_CUSHING_D",
                    observation_date=datetime(2026, 3, 17, 0, 0, tzinfo=timezone.utc).date(),
                    value=66.1,
                    unit_code="BBL",
                    currency_code="USD",
                    source_provider="EIA",
                    source_series_id="PET.RWTC.D",
                    source_frequency="DAILY",
                    source_published_at=datetime(2026, 3, 17, 17, 0, tzinfo=timezone.utc),
                    source_revision="2026-03-17T17:00:00Z",
                    downloaded_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                    run_id=1,
                    raw_payload={"period": "2026-03-17", "value": "66.1"},
                    created_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                )
            )
            session.add_all(
                [
                    ExternalSeriesDefinition(
                        code="EIA_CRUDE_PROD_US_M",
                        provider="EIA_FUNDAMENTALS",
                        dataset_code="PET",
                        series_id="PET.MCRFPUS2.M",
                        name="U.S. Crude Oil Field Production",
                        category="fundamentals",
                        frequency="monthly",
                        unit_code="KBBL_D",
                        source_url="https://www.eia.gov/dnav/pet/pet_crd_crpdn_adc_mbblpd_m.htm",
                        description="Fundamentals test series",
                        query_params=None,
                        transform_rule="field:value",
                        is_active=True,
                        created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="FRED_DGS10",
                        provider="FRED",
                        dataset_code=None,
                        series_id="DGS10",
                        name="10-Year Treasury Constant Maturity Rate",
                        category="macro",
                        frequency="daily",
                        unit_code="PCT",
                        source_url="https://fred.stlouisfed.org/series/DGS10",
                        description="Macro test series",
                        query_params=None,
                        transform_rule="field:value",
                        is_active=True,
                        created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="CFTC_WTI_MM_NET",
                        provider="CFTC",
                        dataset_code="72hh-3qpy",
                        series_id="067651",
                        name="WTI Managed Money Net Position",
                        category="positioning",
                        frequency="weekly",
                        unit_code="CONTRACTS",
                        source_url="https://publicreporting.cftc.gov/",
                        description="WTI positioning test series",
                        query_params={"cftc_contract_market_code": "067651"},
                        transform_rule="net:m_money_positions_long_all:m_money_positions_short_all",
                        is_active=True,
                        created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesDefinition(
                        code="CAISO_NP15_RT5M",
                        provider="CAISO",
                        dataset_code=None,
                        series_id="NP15",
                        name="CAISO NP15 Real-Time 5-Minute Hub LMP",
                        category="power",
                        frequency="daily",
                        unit_code="USD_MWH",
                        source_url="https://oasis.caiso.com/oasisapi/prc_hub_lmp/PRC_HUB_LMP.html",
                        description="Power test series",
                        query_params={"hub": "NP15"},
                        transform_rule="field:lmp",
                        is_active=True,
                        created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        created_by="system",
                        updated_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                        updated_by="system",
                        version=1,
                    ),
                    ExternalSeriesObservation(
                        id=1,
                        series_code="EIA_CRUDE_PROD_US_M",
                        observation_date=datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc).date(),
                        value=13246,
                        unit_code="KBBL_D",
                        source_provider="EIA_FUNDAMENTALS",
                        source_series_id="PET.MCRFPUS2.M",
                        source_frequency="MONTHLY",
                        source_published_at=datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc),
                        source_revision="2026-03-01T12:00:00Z",
                        downloaded_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload={"period": "2026-02", "value": "13246"},
                        created_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                    ),
                    ExternalSeriesObservation(
                        id=2,
                        series_code="FRED_DGS10",
                        observation_date=datetime(2026, 3, 17, 0, 0, tzinfo=timezone.utc).date(),
                        value=4.2,
                        unit_code="PCT",
                        source_provider="FRED",
                        source_series_id="DGS10",
                        source_frequency="DAILY",
                        source_published_at=None,
                        source_revision="2026-03-17:2026-03-17",
                        downloaded_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload={"date": "2026-03-17", "value": "4.2"},
                        created_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                    ),
                    ExternalSeriesObservation(
                        id=3,
                        series_code="CFTC_WTI_MM_NET",
                        observation_date=datetime(2026, 3, 17, 0, 0, tzinfo=timezone.utc).date(),
                        value=73347,
                        unit_code="CONTRACTS",
                        source_provider="CFTC",
                        source_series_id="067651",
                        source_frequency="WEEKLY",
                        source_published_at=datetime(2026, 3, 17, 0, 0, tzinfo=timezone.utc),
                        source_revision="abc-1",
                        downloaded_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                        run_id=1,
                        raw_payload={"id": "abc-1", "report_date_as_yyyy_mm_dd": "2026-03-17T00:00:00.000"},
                        created_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 17, 18, 0, tzinfo=timezone.utc),
                    ),
                    ExternalSeriesObservation(
                        id=4,
                        series_code="CAISO_NP15_RT5M",
                        observation_date=datetime(2026, 3, 17, 0, 0, tzinfo=timezone.utc).date(),
                        value=29.4,
                        unit_code="USD_MWH",
                        source_provider="CAISO",
                        source_series_id="NP15",
                        source_frequency="5MIN",
                        source_published_at=None,
                        source_revision="2026-03-17:HE12:I03",
                        downloaded_at=datetime(2026, 3, 17, 18, 5, tzinfo=timezone.utc),
                        run_id=2,
                        raw_payload={"trade_date": "2026-03-17", "hour": 12, "interval": 3, "hub": "NP15", "lmp": "29.4"},
                        created_at=datetime(2026, 3, 17, 18, 5, tzinfo=timezone.utc),
                        updated_at=datetime(2026, 3, 17, 18, 5, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

        settings.ASSISTANT_ENABLED = True
        settings.ASSISTANT_DEFAULT_PROVIDER = "openai"
        settings.ASSISTANT_MAX_TOOL_ROUNDS = 4
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"
        settings.OPENAI_BASE_URL = "https://api.openai.com/v1"

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def _build_pretrade_recommendation_inputs(
        self,
        *,
        actor_id: str,
        source_scenario_id: int,
        created_at: datetime,
        current_net_position: float,
        target_volume: float,
        trade_side: str = "BUY",
        latest_mark_freshness: str = "FRESH",
        latest_mark: float = 3.05,
    ) -> tuple[PreTradeScenarioDraft, list[PreTradeRecommendationSourceSnapshot]]:
        draft = PreTradeScenarioDraft(
            book="GAS-US",
            portfolio="PROMPT",
            counterparty="ACME",
            commodity_class="NATURAL_GAS",
            commodity="HENRY_HUB",
            trade_side=trade_side,
            pricing_type="FLOATING",
            price_index_code="HH",
            target_price=3.18,
            target_volume=target_volume,
            trade_currency_code="USD",
            unit_of_measure="MMBTU",
            price_unit_code="USD_MMBTU",
            location_code="HENRY_HUB",
        )
        snapshots = [
            PreTradeRecommendationSourceSnapshot(
                source_key="desk-context",
                source_type="INTERNAL",
                source_available=True,
                freshness="FRESH",
                summary="Desk context loaded.",
                provenance=PreTradeRecommendationSourceProvenance(
                    provider="Desk Exposure Service",
                    dataset="active-trades-and-positions",
                    record_id=f"desk-{source_scenario_id}",
                    observed_at=created_at,
                    ingested_at=created_at,
                    captured_by=actor_id,
                ),
                payload={
                    "related_active_trade_count": 2,
                    "current_net_position": current_net_position,
                    "current_counterparty_exposure": 125000,
                },
            ),
            PreTradeRecommendationSourceSnapshot(
                source_key="counterparty-credit",
                source_type="INTERNAL",
                source_available=True,
                freshness="FRESH",
                summary="Counterparty credit loaded.",
                provenance=PreTradeRecommendationSourceProvenance(
                    provider="Credit Service",
                    dataset="counterparty-credit-profiles",
                    record_id="ACME",
                    observed_at=created_at,
                    ingested_at=created_at,
                    captured_by=actor_id,
                ),
                payload={
                    "has_credit_profile": True,
                    "credit_limit_amount": 500000,
                    "breach_action": "MONITOR",
                    "credit_rating": "BBB",
                },
            ),
            PreTradeRecommendationSourceSnapshot(
                source_key="latest-mark",
                source_type="EXTERNAL",
                source_available=True,
                freshness=latest_mark_freshness,
                summary="Latest Henry Hub mark loaded.",
                provenance=PreTradeRecommendationSourceProvenance(
                    provider="Price Service",
                    dataset="price-index-observations",
                    record_id="HH",
                    observed_at=created_at,
                    ingested_at=created_at,
                    captured_by=actor_id,
                ),
                payload={
                    "latest_mark": latest_mark,
                    "price_index_code": "HH",
                    "observation_date": created_at.date().isoformat(),
                },
            ),
        ]
        return draft, snapshots

    def _seed_pretrade_recommendation_run(
        self,
        *,
        actor_id: str,
        source_scenario_id: int,
        created_at: datetime,
        current_net_position: float,
        target_volume: float,
        trade_side: str = "BUY",
        scope_owner_key: str | None = None,
    ) -> int:
        draft, snapshots = self._build_pretrade_recommendation_inputs(
            actor_id=actor_id,
            source_scenario_id=source_scenario_id,
            created_at=created_at,
            current_net_position=current_net_position,
            target_volume=target_volume,
            trade_side=trade_side,
        )
        evaluation = prepare_pretrade_recommendation_evaluation(
            draft=draft,
            input_snapshots=snapshots,
            as_of=created_at,
            actor_id=actor_id,
        )

        with self.SessionLocal() as session:
            record = ReportPreset(
                preset_key="pretrade_recommendation_run",
                scope="PERSONAL",
                scope_owner_key=scope_owner_key or actor_id,
                name=f"Scenario {source_scenario_id} recommendation",
                name_key=f"pretrade-run-{actor_id}-{source_scenario_id}-{int(created_at.timestamp())}",
                filters_json=build_recommendation_run_payload(
                    thesis="Desk hedging review.",
                    draft=draft,
                    source_scenario_id=source_scenario_id,
                    source_review_id=None,
                    input_snapshots=evaluation.input_snapshots,
                    recommendation=evaluation.recommendation,
                ),
                created_at=created_at,
                created_by=actor_id,
                updated_at=created_at,
                updated_by=actor_id,
                version=1,
            )
            session.add(record)
            session.commit()
            return record.id

    def test_tool_service_returns_trade_projection(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_trade_by_id", {"trade_id": "T-1001"})

        self.assertTrue(result.output["found"])
        self.assertEqual(result.output["trade"]["trade_id"], "T-1001")
        self.assertEqual(trace.tool_name, "get_trade_by_id")
        self.assertEqual(trace.record_count, 1)

    def test_tool_service_orders_latest_trades_deterministically_and_reports_ties(self) -> None:
        latest_timestamp = datetime(2026, 4, 8, 17, 30, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Trade(
                        trade_id="T-LATEST-A",
                        external_trade_id="EXT-LATEST-A",
                        source_system="ops",
                        created_at=latest_timestamp,
                        updated_at=latest_timestamp,
                        execution_timestamp=latest_timestamp,
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE-US",
                        portfolio="PROMPT",
                        counterparty="ACME",
                        commodity_class="CRUDE",
                        commodity="WTI",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=78.25,
                        volume=1000,
                        settlement_status="PENDING",
                        trader_user="trader_1",
                        status="ACTIVE",
                        last_event_id="evt-latest-a",
                    ),
                    Trade(
                        trade_id="T-LATEST-B",
                        external_trade_id="EXT-LATEST-B",
                        source_system="ops",
                        created_at=latest_timestamp,
                        updated_at=latest_timestamp,
                        execution_timestamp=latest_timestamp,
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="CRUDE-US",
                        portfolio="PROMPT",
                        counterparty="ACME",
                        commodity_class="CRUDE",
                        commodity="WTI",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=79.25,
                        volume=1000,
                        settlement_status="PENDING",
                        trader_user="trader_1",
                        status="ACTIVE",
                        last_event_id="evt-latest-b",
                    ),
                ]
            )
            session.commit()

            service = AssistantToolService(session)
            result, trace = service.execute_tool("list_trades", {"limit": 1})

        self.assertEqual(result.output["items"][0]["trade_id"], "T-LATEST-B")
        self.assertEqual(result.output["latest_group"]["count"], 2)
        self.assertEqual(
            result.output["latest_group"]["trade_ids"],
            ["T-LATEST-B", "T-LATEST-A"],
        )
        self.assertIn("2 trades share the latest ordering boundary", trace.summary)

    def test_tool_service_reports_orphaned_projection_when_trade_events_missing(self) -> None:
        orphan_timestamp = datetime(2026, 4, 8, 17, 30, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="T-ORPHAN",
                    external_trade_id="EXT-ORPHAN",
                    source_system="ops",
                    created_at=orphan_timestamp,
                    updated_at=orphan_timestamp,
                    execution_timestamp=orphan_timestamp,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE-US",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=80.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="trader_1",
                    status="ACTIVE",
                    last_event_id="evt-orphan",
                )
            )
            session.commit()

            service = AssistantToolService(session)
            result, trace = service.execute_tool("list_trade_events", {"trade_id": "T-ORPHAN", "limit": 10})

        diagnostics = result.output["diagnostics"]
        self.assertEqual(result.output["count"], 0)
        self.assertTrue(diagnostics["trade_projection_found"])
        self.assertEqual(diagnostics["trade_projection_last_event_id"], "evt-orphan")
        self.assertFalse(diagnostics["last_event_found"])
        self.assertEqual(diagnostics["total_trade_events"], 0)
        self.assertEqual(diagnostics["consistency_status"], "projection_last_event_missing")
        self.assertIn("last_event_id evt-orphan is missing from the event store", trace.summary)

    def test_tool_service_can_lookup_event_by_event_id(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("list_trade_events", {"event_id": "evt-1001", "limit": 10})

        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["items"][0]["event_id"], "evt-1001")
        self.assertTrue(result.output["diagnostics"]["last_event_found"])
        self.assertEqual(result.output["diagnostics"]["consistency_status"], "ok")
        self.assertEqual(trace.summary, "Returned 1 event row(s) for event_id evt-1001.")

    def test_tool_service_returns_market_context(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_market_context", {"commodity": "WTI", "limit": 5})

        self.assertEqual(trace.tool_name, "get_market_context")
        self.assertEqual(result.output["commodity"], "WTI")
        self.assertEqual(result.output["price_indices"][0]["price_index_code"], "WTI_CUSHING_D")
        self.assertEqual(result.output["fundamentals"][0]["series_code"], "EIA_CRUDE_PROD_US_M")
        self.assertEqual(result.output["power"][0]["series_code"], "CAISO_NP15_RT5M")
        self.assertEqual(result.output["macro"][0]["series_code"], "FRED_DGS10")
        self.assertEqual(result.output["positioning"][0]["series_code"], "CFTC_WTI_MM_NET")

    def test_tool_service_returns_latest_commodity_prices(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_latest_commodity_prices", {"commodity": "WTI", "limit": 5})

        self.assertEqual(trace.tool_name, "get_latest_commodity_prices")
        self.assertEqual(result.output["commodity"], "WTI")
        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["items"][0]["price_index_code"], "WTI_CUSHING_D")
        self.assertEqual(result.output["items"][0]["value"], 66.1)
        self.assertIn("Loaded 1 latest commodity price row(s) for WTI.", trace.summary)

    @patch("apps.api.app.domains.assistant.services.tools.load_market_news_headlines")
    def test_tool_service_returns_latest_market_news(self, mock_load_market_news_headlines) -> None:
        mock_load_market_news_headlines.return_value = {
            "generated_at": datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
            "commodity": "WTI",
            "search_query": "WTI crude oil when:2d",
            "count": 2,
            "items": [
                {
                    "title": "Crude rallies on supply risk",
                    "source": "Reuters",
                    "published_at": datetime(2026, 5, 5, 11, 0, tzinfo=timezone.utc),
                    "link": "https://news.google.com/rss/articles/abc",
                },
                {
                    "title": "OPEC watchers track prompt balances",
                    "source": "Bloomberg",
                    "published_at": datetime(2026, 5, 5, 9, 30, tzinfo=timezone.utc),
                    "link": "https://news.google.com/rss/articles/def",
                },
            ],
        }

        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_latest_market_news", {"commodity": "WTI", "limit": 2})

        self.assertEqual(trace.tool_name, "get_latest_market_news")
        self.assertEqual(result.output["commodity"], "WTI")
        self.assertEqual(result.output["count"], 2)
        self.assertEqual(result.output["items"][0]["source"], "Reuters")
        self.assertEqual(result.output["items"][0]["title"], "Crude rallies on supply risk")
        self.assertEqual(trace.summary, "Loaded 2 recent headline(s) for WTI.")

    def test_tool_service_loads_settlement_report_filter_options(self) -> None:
        now = datetime(2026, 4, 22, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                TradeInvoice(
                    id=701,
                    trade_id="T-1001",
                    delivery_id=None,
                    leg_no=None,
                    invoice_number="INV-1001",
                    invoice_currency_code="USD",
                    billed_quantity=1000,
                    quantity_unit_code="MMBTU",
                    invoice_amount=3250,
                    status="ISSUED",
                    issued_at=now,
                    due_at=now,
                    dispute_reason=None,
                    notes="Settlement tool test invoice",
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

            service = AssistantToolService(session, actor_id="trader_one")
            result, trace = service.execute_tool("get_settlement_report_filter_options", {})

        self.assertIn("GAS-US", result.output["books"])
        self.assertIn("ACME", result.output["counterparties"])
        self.assertIn("USD", result.output["currencies"])
        self.assertEqual(trace.tool_name, "get_settlement_report_filter_options")
        self.assertIn("settlement report filter options", trace.summary.lower())

    def test_tool_service_lists_visible_settlement_report_presets_for_actor(self) -> None:
        now = datetime(2026, 4, 22, 13, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    ReportPreset(
                        preset_key="settlement",
                        scope="PERSONAL",
                        scope_owner_key="trader_one",
                        name="Trader One Cash",
                        name_key="trader one cash",
                        filters_json={"book": "GAS-US", "currency": "USD"},
                        created_at=now,
                        created_by="trader_one",
                        updated_at=now,
                        updated_by="trader_one",
                        version=1,
                    ),
                    ReportPreset(
                        preset_key="settlement",
                        scope="SHARED",
                        scope_owner_key="__shared__",
                        name="Desk Exceptions",
                        name_key="desk exceptions",
                        filters_json={"severity": "blocked"},
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                    ReportPreset(
                        preset_key="settlement",
                        scope="PERSONAL",
                        scope_owner_key="trader_two",
                        name="Hidden Preset",
                        name_key="hidden preset",
                        filters_json={"currency": "EUR"},
                        created_at=now,
                        created_by="trader_two",
                        updated_at=now,
                        updated_by="trader_two",
                        version=1,
                    ),
                ]
            )
            session.commit()

            service = AssistantToolService(session, actor_id="trader_one")
            result, trace = service.execute_tool("list_settlement_report_presets", {})

        self.assertEqual(result.output["count"], 2)
        preset_names = {item["name"] for item in result.output["items"]}
        self.assertEqual(preset_names, {"Trader One Cash", "Desk Exceptions"})
        self.assertEqual(trace.tool_name, "list_settlement_report_presets")
        self.assertIn("settlement report preset", trace.summary.lower())

    def test_tool_service_analyzes_pretrade_draft_against_latest_visible_saved_run(self) -> None:
        previous_run_id = self._seed_pretrade_recommendation_run(
            actor_id="trader_one",
            source_scenario_id=17,
            created_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
            current_net_position=25000,
            target_volume=5000,
        )
        draft, snapshots = self._build_pretrade_recommendation_inputs(
            actor_id="trader_one",
            source_scenario_id=17,
            created_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
            current_net_position=25000,
            target_volume=8000,
            latest_mark_freshness="STALE",
            latest_mark=2.2,
        )

        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="trader_one")
            result, trace = service.execute_tool(
                "analyze_pretrade_scenario_draft",
                {
                    "thesis": "Refresh the working hedge draft against a weaker mark.",
                    "draft": draft.model_dump(mode="json", exclude_none=True),
                    "source_scenario_id": 17,
                    "input_snapshots": [
                        snapshot.model_dump(mode="json", exclude_none=True)
                        for snapshot in snapshots
                    ],
                },
            )

        analysis = result.output["analysis"]
        self.assertEqual(analysis["comparison"]["previous_run_id"], previous_run_id)
        self.assertEqual(analysis["recommendation"]["stance"], "ESCALATE")
        self.assertEqual(analysis["recommendation"]["opportunity_summary"]["category"], "MARK_GAP")
        self.assertEqual(analysis["recommendation"]["hedge_recommendation"]["instrument_type"], "SWAP")
        self.assertEqual(trace.tool_name, "analyze_pretrade_scenario_draft")
        self.assertEqual(trace.record_count, 1)
        self.assertIn("scenario 17 draft", trace.summary)
        self.assertIn("saved run", trace.summary)

    def test_tool_service_analyzes_pretrade_draft_with_live_snapshot_collection(self) -> None:
        seed_now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="PT-1001",
                    external_trade_id=None,
                    source_system="seed",
                    created_at=seed_now,
                    updated_at=seed_now,
                    execution_timestamp=seed_now,
                    trade_date=seed_now.date(),
                    trade_currency_code="USD",
                    location_code="HENRY_HUB",
                    delivery_start=seed_now.date(),
                    delivery_end=seed_now.date(),
                    unit_of_measure="MMBTU",
                    price_unit_code="USD_MMBTU",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS-US",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="NATURAL_GAS",
                    commodity="HENRY_HUB",
                    pricing_type="FLOATING",
                    pricing_status="PENDING",
                    price_index_code="HH",
                    price=3.1,
                    volume=6000,
                    confirmation_status="PENDING",
                    nomination_status="PENDING",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="trader_one",
                    status="ACTIVE",
                    last_event_id="evt-pt-1001",
                )
            )
            session.add(
                Position(
                    commodity="HENRY_HUB",
                    net_volume=18000,
                    updated_at=seed_now,
                )
            )
            session.add(
                ReferenceCounterpartyCreditProfile(
                    counterparty_code="ACME",
                    credit_rating="BBB",
                    review_due_at=seed_now.date(),
                    limit_currency_code="USD",
                    limit_amount=500000,
                    breach_action="MONITOR",
                    notes=None,
                    created_at=seed_now,
                    created_by="seed",
                    updated_at=seed_now,
                    updated_by="seed",
                    version=1,
                )
            )
            session.add(
                ReferenceCounterpartyExternalCreditSnapshot(
                    counterparty_code="ACME",
                    provider="S&P",
                    source_entity_id="acme",
                    source_entity_name="Acme",
                    match_basis=None,
                    matched_identifier_value=None,
                    as_of_date=seed_now.date(),
                    rating_scale="issuer",
                    rating_value="BBB",
                    rating_outlook="Stable",
                    credit_score=None,
                    probability_of_default=None,
                    recommended_limit_currency_code="USD",
                    recommended_limit_amount=450000,
                    commentary=None,
                    downloaded_at=seed_now,
                    run_id=1,
                    raw_payload={},
                    created_at=seed_now,
                    updated_at=seed_now,
                    version=1,
                )
            )
            session.add(
                PriceIndexObservation(
                    id=44,
                    price_index_code="HH",
                    observation_date=seed_now.date(),
                    value=3.05,
                    unit_code="USD_MMBTU",
                    currency_code="USD",
                    source_provider="ICE",
                    source_series_id="HH",
                    source_frequency="DAILY",
                    source_published_at=seed_now,
                    source_revision=None,
                    downloaded_at=seed_now,
                    run_id=1,
                    raw_payload={},
                    created_at=seed_now,
                    updated_at=seed_now,
                )
            )
            session.add(
                OptionExposure(
                    trade_id="OPT-HH-1",
                    book="GAS-US",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="NATURAL_GAS",
                    commodity="HENRY_HUB",
                    trade_side="BUY",
                    option_type="CALL",
                    option_style="EUROPEAN",
                    option_strike_price=3.2,
                    option_expiration_date=seed_now.date(),
                    contract_volume=3000,
                    premium_price=0.12,
                    premium_cashflow=360,
                    underlying_equivalent_volume=2500,
                    trade_currency_code="USD",
                    price_unit_code="USD_MMBTU",
                    updated_at=seed_now,
                )
            )
            session.commit()

        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="trader_one")
            result, trace = service.execute_tool(
                "analyze_pretrade_scenario_draft",
                {
                    "thesis": "Use live evidence for the current gas setup.",
                    "draft": {
                        "book": "GAS-US",
                        "portfolio": "PROMPT",
                        "counterparty": "ACME",
                        "commodity_class": "NATURAL_GAS",
                        "commodity": "HENRY_HUB",
                        "trade_side": "BUY",
                        "pricing_type": "FLOATING",
                        "price_index_code": "HH",
                        "target_price": 3.18,
                        "target_volume": 8000,
                        "trade_currency_code": "USD",
                        "unit_of_measure": "MMBTU",
                        "price_unit_code": "USD_MMBTU",
                        "location_code": "HENRY_HUB",
                    },
                },
            )

        analysis = result.output["analysis"]
        snapshots_by_key = {
            snapshot["adapter_key"]: snapshot
            for snapshot in analysis["input_snapshots"]
        }
        self.assertEqual(snapshots_by_key["desk-context"]["payload"]["current_net_position"], 18000)
        self.assertEqual(snapshots_by_key["latest-mark"]["payload"]["latest_mark"], 3.05)
        self.assertEqual(snapshots_by_key["option-exposure"]["payload"]["option_delta"], 2500)
        self.assertEqual(analysis["recommendation"]["stance"], "PROCEED_WITH_CARE")
        self.assertEqual(analysis["recommendation"]["hedge_recommendation"]["instrument_type"], "OPTIONS")
        self.assertIn("missing evidence item", trace.summary)

    def test_tool_service_requires_valid_pretrade_draft_analysis_arguments(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="trader_one")
            with self.assertRaisesRegex(
                AssistantToolServiceError,
                "draft: Field required",
            ):
                service.execute_tool(
                    "analyze_pretrade_scenario_draft",
                    {"source_scenario_id": 17},
                )

    def test_tool_service_loads_latest_visible_pretrade_recommendation_run(self) -> None:
        older_run_id = self._seed_pretrade_recommendation_run(
            actor_id="trader_one",
            source_scenario_id=17,
            created_at=datetime(2026, 4, 20, 9, 0, tzinfo=timezone.utc),
            current_net_position=25000,
            target_volume=5000,
        )
        newer_run_id = self._seed_pretrade_recommendation_run(
            actor_id="trader_one",
            source_scenario_id=17,
            created_at=datetime(2026, 4, 20, 10, 0, tzinfo=timezone.utc),
            current_net_position=25000,
            target_volume=7000,
        )

        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="trader_one")
            result, trace = service.execute_tool(
                "get_pretrade_recommendation_run",
                {"source_scenario_id": 17},
            )

        self.assertTrue(result.output["found"])
        self.assertEqual(result.output["run"]["run_id"], newer_run_id)
        self.assertEqual(result.output["run"]["comparison"]["previous_run_id"], older_run_id)
        self.assertEqual(result.output["run"]["recommendation"]["opportunity_summary"]["category"], "RISK_INCREASE")
        self.assertEqual(result.output["run"]["recommendation"]["hedge_recommendation"]["instrument_type"], "SWAP")
        self.assertEqual(trace.tool_name, "get_pretrade_recommendation_run")
        self.assertEqual(trace.record_count, 1)
        self.assertIn("scenario 17", trace.summary)

    def test_tool_service_hides_other_users_personal_pretrade_recommendation_runs(self) -> None:
        hidden_run_id = self._seed_pretrade_recommendation_run(
            actor_id="trader_two",
            source_scenario_id=22,
            created_at=datetime(2026, 4, 21, 9, 0, tzinfo=timezone.utc),
            current_net_position=12000,
            target_volume=4000,
            scope_owner_key="trader_two",
        )

        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="trader_one")
            result, trace = service.execute_tool(
                "get_pretrade_recommendation_run",
                {"run_id": hidden_run_id},
            )

        self.assertFalse(result.output["found"])
        self.assertEqual(result.output["lookup"]["run_id"], hidden_run_id)
        self.assertEqual(trace.tool_name, "get_pretrade_recommendation_run")
        self.assertEqual(trace.record_count, 0)
        self.assertIn("No visible pre-trade recommendation run matched", trace.summary)

    def test_tool_service_requires_one_pretrade_recommendation_lookup_selector(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="trader_one")
            with self.assertRaisesRegex(
                AssistantToolServiceError,
                "Provide exactly one of run_id, source_scenario_id, or source_review_id",
            ):
                service.execute_tool(
                    "get_pretrade_recommendation_run",
                    {"run_id": 1, "source_scenario_id": 2},
                )

    def test_tool_service_lists_open_workflow_items_for_requested_queue(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_workflow_items",
                {"queue": "settlement", "limit": 10},
            )

        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["items"][0]["workflow_type"], "PAYMENT")
        self.assertEqual(result.output["items"][0]["queue"], "settlement")
        self.assertFalse(result.output["items"][0]["is_closed"])
        self.assertEqual(trace.tool_name, "list_workflow_items")
        self.assertIn("settlement queue", trace.summary)

    def test_tool_service_lists_current_confirmation_by_default(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_trade_confirmations",
                {"trade_id": "T-1001", "limit": 10},
            )

        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["items"][0]["confirmation_number"], "CNF-1001-B")
        self.assertTrue(result.output["items"][0]["is_current"])
        self.assertTrue(result.output["items"][0]["needs_attention"])
        self.assertEqual(result.output["items"][0]["workflow_owner"], "ops.confirmations")
        self.assertIn("need follow-up", trace.summary)

    def test_tool_service_can_include_confirmation_history(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_trade_confirmations",
                {"trade_id": "T-1001", "current_only": False, "limit": 10},
            )

        confirmation_numbers = [row["confirmation_number"] for row in result.output["items"]]
        self.assertEqual(result.output["count"], 2)
        self.assertEqual(confirmation_numbers, ["CNF-1001-B", "CNF-1001-A"])
        self.assertTrue(result.output["items"][0]["is_current"])
        self.assertFalse(result.output["items"][1]["is_current"])
        self.assertEqual(trace.tool_name, "list_trade_confirmations")

    def test_tool_service_lists_trade_invoices_with_outstanding_balance(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_trade_invoices",
                {"trade_id": "T-1001", "limit": 10},
            )

        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["items"][0]["invoice_number"], "INV-T-1001")
        self.assertEqual(result.output["items"][0]["outstanding_amount"], 2250.0)
        self.assertEqual(trace.tool_name, "list_trade_invoices")

    def test_tool_service_lists_invoice_issue_candidates(self) -> None:
        now = datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="T-OPEN-INVOICE",
                    external_trade_id="EXT-OPEN-INVOICE",
                    source_system="ops",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now,
                    trade_date=now.date(),
                    trade_currency_code="USD",
                    delivery_start=now.date(),
                    delivery_end=now.date(),
                    unit_of_measure="MMBTU",
                    price_unit_code="USD_MMBTU",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS-US",
                    portfolio="NORTH",
                    counterparty="ACME",
                    commodity_class="GAS",
                    commodity="HH",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=4.25,
                    volume=2000,
                    confirmation_status="CONFIRMED",
                    nomination_status="COMPLETED",
                    allocation_status="COMPLETED",
                    actualization_status="ACTUALIZED",
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="trader_1",
                    status="ACTIVE",
                    last_event_id="evt-open-invoice",
                )
            )
            session.add(
                TradeActualization(
                    delivery_id="DLV-T-OPEN-INVOICE",
                    trade_id="T-OPEN-INVOICE",
                    leg_no=None,
                    actual_quantity=2000,
                    actualized_at=now,
                    source="scheduler",
                    notes="Ready for settlement invoice.",
                    created_at=now,
                    created_by="scheduler",
                    updated_at=now,
                    updated_by="scheduler",
                    version=1,
                )
            )
            session.commit()

            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_invoice_issue_candidates",
                {"limit": 10},
            )

        rows_by_trade_id = {row["trade_id"]: row for row in result.output["items"]}
        self.assertIn("T-OPEN-INVOICE", rows_by_trade_id)
        candidate = rows_by_trade_id["T-OPEN-INVOICE"]
        self.assertEqual(candidate["readiness_status"], "READY")
        self.assertEqual(candidate["notional_amount"], 8500.0)
        self.assertEqual(
            candidate["priority_reason"],
            "Ready-to-issue invoice candidates rise before blocked previews.",
        )
        self.assertEqual(
            candidate["recommended_action"],
            {
                "action_type": "issue_trade_invoice",
                "requires_approval": True,
                "payload": {"trade_id": "T-OPEN-INVOICE"},
                "preview_status": "READY",
            },
        )
        self.assertEqual(trace.tool_name, "list_invoice_issue_candidates")
        self.assertIn("invoice issue candidate", trace.summary)
        self.assertIn("Top priority is T-OPEN-INVOICE because", trace.summary)

    def test_tool_service_lists_trade_attention_candidates_without_child_rows(self) -> None:
        now = datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Trade(
                    trade_id="T-NO-CNF",
                    external_trade_id="EXT-NO-CNF",
                    source_system="ops",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=datetime(2026, 3, 18, 10, 0, tzinfo=timezone.utc),
                    trade_date=now.date(),
                    trade_currency_code="USD",
                    location_code="HENRY",
                    delivery_start=now.date(),
                    delivery_end=now.date(),
                    unit_of_measure="MMBTU",
                    price_unit_code="USD_MMBTU",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS-US",
                    portfolio="NORTH",
                    counterparty="ACME",
                    commodity_class="GAS",
                    commodity="HH",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=4.25,
                    volume=2000,
                    confirmation_status="PENDING",
                    nomination_status="SCHEDULED",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    trader_user="trader_1",
                    status="ACTIVE",
                    last_event_id="evt-no-cnf",
                )
            )
            session.commit()

            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_trade_attention_candidates",
                {"candidate_type": "confirmation_backlog", "limit": 10},
            )

        rows_by_trade_id = {row["trade_id"]: row for row in result.output["items"]}
        self.assertIn("T-NO-CNF", rows_by_trade_id)
        candidate = rows_by_trade_id["T-NO-CNF"]
        self.assertEqual(candidate["candidate_types"], ["confirmation_backlog"])
        self.assertIn("dashboard.attention.confirmation_backlog_count", candidate["source_count_keys"])
        self.assertEqual(
            candidate["priority_reason"],
            "Older unconfirmed trades rise first in the confirmation queue.",
        )
        self.assertEqual(candidate["supporting_records"]["confirmation_count"], 0)
        self.assertIn("No persisted confirmation ledger row exists", candidate["blocking_reasons"][0])
        self.assertEqual(candidate["suggested_next_tool"], "list_trade_confirmations")
        self.assertEqual(trace.tool_name, "list_trade_attention_candidates")
        self.assertIn("confirmation backlog", trace.summary)
        self.assertIn("Top priority is", trace.summary)
        self.assertIn("Older unconfirmed trades rise first in the confirmation queue.", trace.summary)

    def test_tool_service_prioritizes_payment_due_candidates_by_cash_urgency(self) -> None:
        now = datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            for trade_id, payment_status in (("T-PMT-ORDER-OVERDUE", "OVERDUE"), ("T-PMT-ORDER-DUE", "DUE")):
                session.add(
                    Event(
                        event_id=f"evt-{trade_id.lower()}",
                        aggregate_type="trade",
                        aggregate_id=trade_id,
                        event_type="TradeCreated",
                        occurred_at=now,
                        recorded_at=now,
                        actor_id="trader_4",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"trade_id": trade_id},
                    )
                )
                session.add(
                    Trade(
                        trade_id=trade_id,
                        external_trade_id=f"EXT-{trade_id}",
                        source_system="ops",
                        created_at=now,
                        updated_at=now,
                        execution_timestamp=datetime(2026, 3, 20, 9, 0, tzinfo=timezone.utc),
                        trade_date=now.date(),
                        trade_currency_code="USD",
                        location_code="HENRY",
                        delivery_start=now.date(),
                        delivery_end=now.date(),
                        unit_of_measure="MMBTU",
                        price_unit_code="USD_MMBTU",
                        trade_nature="PHYSICAL",
                        trade_structure="SINGLE",
                        trade_side="BUY",
                        book="GAS-US",
                        portfolio="NORTH",
                        counterparty="ACME",
                        commodity_class="GAS",
                        commodity="HH",
                        pricing_type="FIXED",
                        pricing_status="PRICED",
                        price_index_code=None,
                        price=4.0,
                        volume=1500,
                        confirmation_status="CONFIRMED",
                        nomination_status="SCHEDULED",
                        allocation_status="PENDING",
                        actualization_status="PENDING",
                        invoice_status="ISSUED",
                        payment_status=payment_status,
                        settlement_status="INVOICED",
                        trader_user="trader_4",
                        status="ACTIVE",
                        last_event_id=f"evt-{trade_id.lower()}",
                    )
                )
            session.commit()

            service = AssistantToolService(session)
            result, _trace = service.execute_tool(
                "list_trade_attention_candidates",
                {"candidate_type": "payment_due", "limit": 10},
            )

        returned_trade_ids = [row["trade_id"] for row in result.output["items"]]
        self.assertLess(
            returned_trade_ids.index("T-PMT-ORDER-OVERDUE"),
            returned_trade_ids.index("T-PMT-ORDER-DUE"),
        )
        self.assertIn("Top priority is T-PMT-ORDER-OVERDUE because", _trace.summary)
        rows_by_trade_id = {row["trade_id"]: row for row in result.output["items"]}
        self.assertEqual(
            rows_by_trade_id["T-PMT-ORDER-OVERDUE"]["priority_reason"],
            "Overdue cash rises ahead of merely due payments.",
        )
        self.assertEqual(
            rows_by_trade_id["T-PMT-ORDER-DUE"]["priority_reason"],
            "Due cash follows overdue items, then older trades.",
        )

    def test_tool_service_lists_payment_due_attention_candidates(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_trade_attention_candidates",
                {"candidate_type": "payment_due", "limit": 10},
            )

        rows_by_trade_id = {row["trade_id"]: row for row in result.output["items"]}
        self.assertIn("T-1001", rows_by_trade_id)
        candidate = rows_by_trade_id["T-1001"]
        self.assertEqual(candidate["source_count_keys"], ["settlement.payment_due_count"])
        self.assertEqual(
            candidate["priority_reason"],
            "Due cash follows overdue items, then older trades.",
        )
        self.assertEqual(candidate["supporting_records"]["invoice_count"], 1)
        self.assertEqual(candidate["supporting_records"]["payment_count"], 1)
        self.assertEqual(candidate["supporting_records"]["candidate_invoice_id"], 1)
        self.assertEqual(
            candidate["recommended_action"],
            {
                "action_type": "create_trade_payment",
                "requires_approval": True,
                "payload": {"invoice_id": 1},
                "basis": "open_invoice_balance",
            },
        )
        self.assertEqual(trace.tool_name, "list_trade_attention_candidates")
        self.assertIn("settlement.payment_due_count", trace.summary)

    def test_tool_service_payment_due_candidate_points_to_invoices_when_no_payment_rows_exist(self) -> None:
        now = datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id="evt-pmt-no-row",
                    aggregate_type="trade",
                    aggregate_id="T-PMT-NO-ROW",
                    event_type="TradeCreated",
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="trader_2",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-PMT-NO-ROW"},
                )
            )
            session.add(
                Trade(
                    trade_id="T-PMT-NO-ROW",
                    external_trade_id="EXT-PMT-NO-ROW",
                    source_system="ops",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=datetime(2026, 3, 20, 9, 0, tzinfo=timezone.utc),
                    trade_date=now.date(),
                    trade_currency_code="USD",
                    location_code="HENRY",
                    delivery_start=now.date(),
                    delivery_end=now.date(),
                    unit_of_measure="MMBTU",
                    price_unit_code="USD_MMBTU",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS-US",
                    portfolio="NORTH",
                    counterparty="ACME",
                    commodity_class="GAS",
                    commodity="HH",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=4.0,
                    volume=1500,
                    confirmation_status="CONFIRMED",
                    nomination_status="SCHEDULED",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    invoice_status="ISSUED",
                    payment_status="DUE",
                    settlement_status="INVOICED",
                    trader_user="trader_2",
                    status="ACTIVE",
                    last_event_id="evt-pmt-no-row",
                )
            )
            session.add(
                TradeInvoice(
                    id=2,
                    trade_id="T-PMT-NO-ROW",
                    delivery_id="DEL-PMT-NO-ROW",
                    leg_no=None,
                    invoice_number="INV-PMT-NO-ROW",
                    invoice_currency_code="USD",
                    billed_quantity=1500,
                    quantity_unit_code="MMBTU",
                    invoice_amount=1500,
                    status="ISSUED",
                    issued_at=now,
                    due_at=datetime(2026, 3, 26, 12, 0, tzinfo=timezone.utc),
                    dispute_reason=None,
                    notes="Payment not yet recorded.",
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.commit()

            service = AssistantToolService(session)
            result, _trace = service.execute_tool(
                "list_trade_attention_candidates",
                {"candidate_type": "payment_due", "limit": 10},
            )

        rows_by_trade_id = {row["trade_id"]: row for row in result.output["items"]}
        candidate = rows_by_trade_id["T-PMT-NO-ROW"]
        self.assertEqual(candidate["supporting_records"]["payment_count"], 0)
        self.assertEqual(candidate["suggested_next_tool"], "list_trade_invoices")
        self.assertEqual(
            candidate["recommended_action"],
            {
                "action_type": "create_trade_payment",
                "requires_approval": True,
                "payload": {"invoice_id": 2},
                "basis": "open_invoice_balance",
            },
        )

    def test_tool_service_payment_due_candidate_skips_create_action_when_balance_is_reserved(self) -> None:
        now = datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id="evt-pmt-reserved",
                    aggregate_type="trade",
                    aggregate_id="T-PMT-RESERVED",
                    event_type="TradeCreated",
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="trader_3",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-PMT-RESERVED"},
                )
            )
            session.add(
                Trade(
                    trade_id="T-PMT-RESERVED",
                    external_trade_id="EXT-PMT-RESERVED",
                    source_system="ops",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc),
                    trade_date=now.date(),
                    trade_currency_code="USD",
                    location_code="HENRY",
                    delivery_start=now.date(),
                    delivery_end=now.date(),
                    unit_of_measure="MMBTU",
                    price_unit_code="USD_MMBTU",
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="GAS-US",
                    portfolio="NORTH",
                    counterparty="ACME",
                    commodity_class="GAS",
                    commodity="HH",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=4.1,
                    volume=1200,
                    confirmation_status="CONFIRMED",
                    nomination_status="SCHEDULED",
                    allocation_status="PENDING",
                    actualization_status="PENDING",
                    invoice_status="ISSUED",
                    payment_status="DUE",
                    settlement_status="INVOICED",
                    trader_user="trader_3",
                    status="ACTIVE",
                    last_event_id="evt-pmt-reserved",
                )
            )
            session.add(
                TradeInvoice(
                    id=3,
                    trade_id="T-PMT-RESERVED",
                    delivery_id="DEL-PMT-RESERVED",
                    leg_no=None,
                    invoice_number="INV-PMT-RESERVED",
                    invoice_currency_code="USD",
                    billed_quantity=1200,
                    quantity_unit_code="MMBTU",
                    invoice_amount=1200,
                    status="ISSUED",
                    issued_at=now,
                    due_at=datetime(2026, 3, 26, 12, 0, tzinfo=timezone.utc),
                    dispute_reason=None,
                    notes="Open payment row already reserves the full amount.",
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.add(
                TradePayment(
                    id=2,
                    trade_id="T-PMT-RESERVED",
                    invoice_id=3,
                    payment_reference="PAY-PMT-RESERVED-1",
                    payment_currency_code="USD",
                    payment_amount=1200,
                    status="DUE",
                    due_at=datetime(2026, 3, 26, 12, 0, tzinfo=timezone.utc),
                    received_at=None,
                    notes="Unpaid row still reserves the invoice balance.",
                    created_at=now,
                    created_by="system",
                    updated_at=now,
                    updated_by="system",
                    version=1,
                )
            )
            session.commit()

            service = AssistantToolService(session)
            result, _trace = service.execute_tool(
                "list_trade_attention_candidates",
                {"candidate_type": "payment_due", "limit": 10},
            )

        rows_by_trade_id = {row["trade_id"]: row for row in result.output["items"]}
        candidate = rows_by_trade_id["T-PMT-RESERVED"]
        self.assertEqual(candidate["suggested_next_tool"], "list_trade_payments")
        self.assertEqual(candidate["supporting_records"]["candidate_invoice_open_amount"], 1200.0)
        self.assertEqual(candidate["supporting_records"]["candidate_invoice_unreserved_amount"], 0.0)
        self.assertIsNone(candidate["recommended_action"])
        self.assertIn("reserve the remaining invoice balance", candidate["blocking_reasons"][0])

    def test_tool_service_payment_list_points_to_attention_candidates(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("list_trade_payments", {"limit": 10})

        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["payment_due_candidate_count"], 1)
        self.assertEqual(result.output["suggested_next_tool"], "list_trade_attention_candidates")
        self.assertIn("payment status", trace.summary)

    def test_tool_service_builds_trade_settlement_summary(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "get_trade_settlement_summary",
                {"trade_id": "T-1001"},
            )

        self.assertTrue(result.output["found"])
        self.assertEqual(result.output["invoice_count"], 1)
        self.assertEqual(result.output["payment_count"], 1)
        self.assertEqual(result.output["total_invoiced_amount"], 3250.0)
        self.assertEqual(result.output["outstanding_amount"], 2250.0)
        self.assertIn("Settlement summary for T-1001", trace.summary)

    def test_tool_service_builds_trade_workbench(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "get_trade_workbench",
                {"trade_id": "T-1001", "row_limit": 5, "event_limit": 5},
            )

        self.assertTrue(result.output["found"])
        self.assertEqual(result.output["trade"]["trade_id"], "T-1001")
        self.assertEqual(result.output["workflow"]["open_count"], 2)
        self.assertEqual(result.output["settlement"]["invoice_count"], 1)
        self.assertEqual(result.output["deliveries"]["count"], 1)
        self.assertEqual(result.output["recent_events"]["total_count"], 1)
        self.assertIn("Built trade workbench for T-1001", trace.summary)

    def test_tool_service_lists_deliveries(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool(
                "list_deliveries",
                {"trade_id": "T-1001", "limit": 10},
            )

        self.assertEqual(result.output["count"], 1)
        self.assertEqual(result.output["items"][0]["delivery_id"], "DEL-1001")
        self.assertEqual(result.output["items"][0]["event_count"], 1)
        self.assertEqual(result.output["items"][0]["actualized_quantity"], 980.0)
        self.assertIn("trade T-1001", trace.summary)

    def test_tool_service_lists_documents_and_loads_document_detail(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            list_result, list_trace = service.execute_tool(
                "list_documents",
                {"document_kind": "TRADE_CONFIRMATION", "limit": 10},
            )
            detail_result, detail_trace = service.execute_tool(
                "get_document_ingestion",
                {"document_id": "doc-1001"},
            )

        self.assertEqual(list_result.output["count"], 1)
        self.assertEqual(list_result.output["items"][0]["dominant_document_kind"], "TRADE_CONFIRMATION")
        self.assertTrue(detail_result.output["found"])
        self.assertEqual(detail_result.output["document"]["document_id"], "doc-1001")
        self.assertEqual(detail_result.output["document"]["pages"][0]["document_kind"], "TRADE_CONFIRMATION")
        self.assertEqual(list_trace.tool_name, "list_documents")
        self.assertEqual(detail_trace.tool_name, "get_document_ingestion")

    def test_tool_service_returns_document_type_count_chart(self) -> None:
        created_at = datetime(2026, 3, 19, 14, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add_all(
                [
                    DocumentIngestion(
                        document_id="doc-invoice-summary",
                        original_filename="invoice-summary.pdf",
                        display_name="Invoice From Summary",
                        content_type="application/pdf",
                        storage_key="documents/doc-invoice-summary.pdf",
                        sha256="1" * 64,
                        size_bytes=2048,
                        page_count=1,
                        status="ANALYZED",
                        processor_provider="openai",
                        processor_model="gpt-5-mini",
                        classifier_version="test-classifier",
                        extractor_version="test-extractor",
                        analysis_summary={"dominant_document_kind": "INVOICE"},
                        processing_errors=[],
                        review_status="VERIFIED",
                        review_notes=None,
                        reviewed_at=None,
                        reviewed_by=None,
                        created_at=created_at,
                        created_by="settlement.ops",
                        updated_at=created_at,
                        updated_by="settlement.ops",
                        version=1,
                    ),
                    DocumentIngestion(
                        document_id="doc-invoice-page",
                        original_filename="invoice-page.pdf",
                        display_name="Invoice From Page",
                        content_type="application/pdf",
                        storage_key="documents/doc-invoice-page.pdf",
                        sha256="2" * 64,
                        size_bytes=2048,
                        page_count=1,
                        status="ANALYZED",
                        processor_provider="openai",
                        processor_model="gpt-5-mini",
                        classifier_version="test-classifier",
                        extractor_version="test-extractor",
                        analysis_summary={},
                        processing_errors=[],
                        review_status="IN_REVIEW",
                        review_notes=None,
                        reviewed_at=None,
                        reviewed_by=None,
                        created_at=created_at,
                        created_by="settlement.ops",
                        updated_at=created_at,
                        updated_by="settlement.ops",
                        version=1,
                    ),
                ]
            )
            session.add_all(
                [
                    DocumentIngestionPage(
                        document_id="doc-invoice-summary",
                        page_number=1,
                        classification_status="ANALYZED",
                        extraction_status="ANALYZED",
                        document_kind="UNKNOWN",
                        document_subtype=None,
                        classification_confidence=0.8,
                        classification_payload={},
                        header_fields=[],
                        table_blocks=[],
                        raw_text="Settlement invoice.",
                        processing_warnings=[],
                        processing_errors=[],
                        review_status="UNREVIEWED",
                        review_notes=None,
                        reviewed_at=None,
                        reviewed_by=None,
                        processed_at=created_at,
                        created_at=created_at,
                        updated_at=created_at,
                    ),
                    DocumentIngestionPage(
                        document_id="doc-invoice-page",
                        page_number=1,
                        classification_status="ANALYZED",
                        extraction_status="ANALYZED",
                        document_kind="INVOICE",
                        document_subtype=None,
                        classification_confidence=0.93,
                        classification_payload={},
                        header_fields=[],
                        table_blocks=[],
                        raw_text="Settlement invoice.",
                        processing_warnings=[],
                        processing_errors=[],
                        review_status="UNREVIEWED",
                        review_notes=None,
                        reviewed_at=None,
                        reviewed_by=None,
                        processed_at=created_at,
                        created_at=created_at,
                        updated_at=created_at,
                    ),
                ]
            )
            session.commit()
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_document_type_counts", {})
            bar_result, _bar_trace = service.execute_tool("get_document_type_counts", {"chart_type": "bar"})

        segments_by_kind = {
            segment["document_kind"]: segment for segment in result.output["segments"]
        }
        self.assertEqual(result.output["total_count"], 3)
        self.assertEqual(result.output["type_count"], 2)
        self.assertEqual(segments_by_kind["INVOICE"]["count"], 2)
        self.assertEqual(segments_by_kind["TRADE_CONFIRMATION"]["count"], 1)
        self.assertEqual(result.output["chart"]["artifact_type"], "ectrm.chart")
        self.assertEqual(result.output["chart"]["chart_type"], "pie")
        self.assertEqual(result.output["chart"]["segments"][0]["document_kind"], "INVOICE")
        self.assertEqual(bar_result.output["chart"]["chart_type"], "bar")
        self.assertEqual(trace.tool_name, "get_document_type_counts")
        self.assertEqual(trace.record_count, 3)
        self.assertEqual(trace.output_preview["top_document_kind"], "INVOICE")

    def test_tool_service_reads_home_view_catalog_options_and_visible_instances(self) -> None:
        now = datetime(2026, 3, 19, 15, 0, tzinfo=timezone.utc)
        price_card = {
            "card_id": "prices",
            "visible": True,
            "placement": {"order": 0, "column_span": 2, "row_span": 1},
            "parameters": {"price_sort": "updated_desc"},
            "filters": {"price_index_code": "WTI_CUSHING_D"},
            "data_bindings": ["latest_price_marks"],
        }
        with self.SessionLocal() as session:
            session.add_all(
                [
                    HomeViewDefinition(
                        definition_key="home_view_trader_wti",
                        name="Trader WTI Watch",
                        name_key="trader wti watch",
                        scope="PERSONAL",
                        scope_owner_key="trader_1",
                        base_template_key="system_home",
                        base_template_version=1,
                        persona_hint="trader",
                        layout_json={"cards": [price_card]},
                        filters_json={"global": {"commodity_code": "WTI"}},
                        status="ACTIVE",
                        created_at=now,
                        created_by="trader_1",
                        updated_at=now,
                        updated_by="trader_1",
                        version=2,
                    ),
                    HomeViewDefinition(
                        definition_key="home_view_shared_wti",
                        name="Desk WTI Watch",
                        name_key="desk wti watch",
                        scope="ORGANIZATION",
                        scope_owner_key="organization",
                        base_template_key="system_home",
                        base_template_version=1,
                        persona_hint="trader",
                        layout_json={"cards": [price_card]},
                        filters_json={"global": {"commodity_code": "WTI"}},
                        status="ACTIVE",
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                    HomeViewDefinition(
                        definition_key="home_view_retired",
                        name="Retired Desk Watch",
                        name_key="retired desk watch",
                        scope="TEAM",
                        scope_owner_key="team:default",
                        base_template_key="system_home",
                        base_template_version=1,
                        persona_hint=None,
                        layout_json={"cards": [price_card]},
                        filters_json={"global": {}},
                        status="RETIRED",
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=3,
                    ),
                    HomeViewDefinition(
                        definition_key="home_view_other_user",
                        name="Other User Watch",
                        name_key="other user watch",
                        scope="PERSONAL",
                        scope_owner_key="other_user",
                        base_template_key="system_home",
                        base_template_version=1,
                        persona_hint=None,
                        layout_json={"cards": [price_card]},
                        filters_json={"global": {}},
                        status="ACTIVE",
                        created_at=now,
                        created_by="other_user",
                        updated_at=now,
                        updated_by="other_user",
                        version=1,
                    ),
                    HomeViewDefinition(
                        definition_key="home_view_shared_draft",
                        name="Draft Shared Watch",
                        name_key="draft shared watch",
                        scope="ORGANIZATION",
                        scope_owner_key="organization",
                        base_template_key="system_home",
                        base_template_version=1,
                        persona_hint=None,
                        layout_json={"cards": [price_card]},
                        filters_json={"global": {}},
                        status="DRAFT",
                        created_at=now,
                        created_by="ops_admin",
                        updated_at=now,
                        updated_by="ops_admin",
                        version=1,
                    ),
                ]
            )
            session.commit()

            service = AssistantToolService(session, actor_id="trader_1")
            cards_result, cards_trace = service.execute_tool("list_home_view_cards", {})
            template_result, template_trace = service.execute_tool("get_home_system_template", {})
            options_result, options_trace = service.execute_tool(
                "get_home_view_filter_options",
                {"card_id": "prices", "limit": 5},
            )
            instances_result, instances_trace = service.execute_tool("list_home_view_instances", {})
            shared_result, _shared_trace = service.execute_tool(
                "list_home_view_instances",
                {"scope": "SHARED", "include_cards": False},
            )

        self.assertEqual(cards_result.output["card_count"], 6)
        self.assertIn("prices", cards_trace.output_preview["card_ids"])
        self.assertEqual(template_result.output["template_key"], "system_home")
        self.assertTrue(template_result.output["immutable"])
        self.assertEqual(template_trace.output_preview["card_count"], 6)

        price_options = options_result.output["cards"][0]
        filters_by_field = {field["field"]: field for field in price_options["filters"]}
        parameters_by_field = {field["field"]: field for field in price_options["parameters"]}
        self.assertEqual(filters_by_field["price_index_code"]["options"][0]["code"], "WTI_CUSHING_D")
        self.assertIn("SPOT", filters_by_field["quote_type"]["options"])
        self.assertIn("updated_desc", parameters_by_field["price_sort"]["options"])
        self.assertEqual(options_trace.output_preview["card_id"], "prices")

        visible_names = {item["name"] for item in instances_result.output["items"]}
        self.assertEqual(visible_names, {"Trader WTI Watch", "Desk WTI Watch"})
        personal = next(item for item in instances_result.output["items"] if item["scope"] == "PERSONAL")
        shared = next(item for item in instances_result.output["items"] if item["scope"] == "ORGANIZATION")
        self.assertEqual(personal["scope_owner_key"], "trader_1")
        self.assertEqual(personal["version"], 2)
        self.assertTrue(personal["validation"]["ok"])
        self.assertEqual(personal["cards"][0]["filters"], {"price_index_code": "WTI_CUSHING_D"})
        self.assertTrue(shared["is_shared"])
        self.assertEqual(shared_result.output["count"], 1)
        self.assertEqual(shared_result.output["items"][0]["name"], "Desk WTI Watch")
        self.assertNotIn("Retired Desk Watch", visible_names)
        self.assertNotIn("Draft Shared Watch", visible_names)
        self.assertNotIn("Other User Watch", visible_names)
        self.assertEqual(instances_trace.tool_name, "list_home_view_instances")
        self.assertEqual(instances_trace.output_preview["count"], 2)

    def test_tool_service_lists_gmail_messages_and_loads_message_detail(self) -> None:
        browse_result = DocumentGmailInboxBrowseResultOut(
            query="from:backoffice@example.com",
            page_size=2,
            next_page_token="gmail-next-page",
            messages=[
                DocumentGmailInboxMessageSummaryOut(
                    message_id="gmail-msg-1",
                    thread_id="gmail-thread-1",
                    subject="May Settlement Package",
                    sender="backoffice@example.com",
                    received_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
                    snippet="Attached is the May settlement package.",
                    unread=True,
                    attachment_count=2,
                    pdf_attachment_count=1,
                    imported_pdf_attachment_count=1,
                ),
                DocumentGmailInboxMessageSummaryOut(
                    message_id="gmail-msg-2",
                    thread_id="gmail-thread-2",
                    subject="Storage Invoice Backup",
                    sender="ops@example.com",
                    received_at=datetime(2026, 5, 7, 9, 30, tzinfo=timezone.utc),
                    snippet="Backup copy attached.",
                    unread=False,
                    attachment_count=1,
                    pdf_attachment_count=1,
                    imported_pdf_attachment_count=0,
                ),
            ],
        )
        message_detail = DocumentGmailInboxMessageDetailOut(
            message_id="gmail-msg-1",
            thread_id="gmail-thread-1",
            subject="May Settlement Package",
            sender="backoffice@example.com",
            to_recipients="ops@example.com",
            received_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
            snippet="Attached is the May settlement package.",
            unread=True,
            body_text="Please review the attached settlement package.",
            body_truncated=False,
            attachments=[
                DocumentGmailInboxAttachmentOut(
                    filename="settlement.pdf",
                    mime_type="application/pdf",
                    size_bytes=2048,
                    part_token="attachment-1",
                    attachment_id="attachment-1",
                    importable=True,
                    already_imported=True,
                ),
                DocumentGmailInboxAttachmentOut(
                    filename="notes.txt",
                    mime_type="text/plain",
                    size_bytes=256,
                    part_token="attachment-2",
                    attachment_id="attachment-2",
                    importable=False,
                    already_imported=False,
                ),
            ],
        )

        with self.SessionLocal() as session:
            with patch(
                "apps.api.app.domains.assistant.services.tools.load_gmail_inbox_messages",
                return_value=browse_result,
            ) as list_mock, patch(
                "apps.api.app.domains.assistant.services.tools.load_gmail_inbox_message_detail",
                return_value=message_detail,
            ) as detail_mock:
                service = AssistantToolService(session)
                list_result, list_trace = service.execute_tool(
                    "list_gmail_inbox_messages",
                    {"query": "from:backoffice@example.com", "limit": 2},
                )
                detail_result, detail_trace = service.execute_tool(
                    "get_gmail_inbox_message",
                    {"message_id": "gmail-msg-1"},
                )

        list_mock.assert_called_once_with(
            session,
            query_override="from:backoffice@example.com",
            page_size=2,
            page_token=None,
        )
        detail_mock.assert_called_once_with(session, message_id="gmail-msg-1")
        self.assertEqual(list_result.output["count"], 2)
        self.assertEqual(list_result.output["items"][0]["message_id"], "gmail-msg-1")
        self.assertEqual(list_result.output["next_page_token"], "gmail-next-page")
        self.assertTrue(detail_result.output["found"])
        self.assertEqual(detail_result.output["message"]["message_id"], "gmail-msg-1")
        self.assertTrue(detail_result.output["message"]["attachments"][0]["already_imported"])
        self.assertEqual(list_trace.tool_name, "list_gmail_inbox_messages")
        self.assertIn("More messages are available", list_trace.summary)
        self.assertEqual(detail_trace.tool_name, "get_gmail_inbox_message")
        self.assertIn("1 importable PDF attachment", detail_trace.summary)

    def test_tool_service_loads_workspace_summary(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_workspace_summary", {})

        self.assertEqual(result.output["trades"]["total_count"], 1)
        self.assertEqual(result.output["invoices"]["total_count"], 1)
        self.assertEqual(result.output["payments"]["total_count"], 1)
        self.assertEqual(result.output["deliveries"]["total_count"], 1)
        self.assertIn("Workspace summary loaded", trace.summary)

    def test_tool_service_lists_managed_agents_and_loads_agent_profile(self) -> None:
        now = datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops_admin",
                    email="ops-admin@example.com",
                    google_subject=None,
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=None,
                    is_active=True,
                    last_login_at=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add_all(
                [
                    AssistantAgent(
                        agent_id="control-tower-agent",
                        name="Control Tower Agent",
                        description="Supervises managed agents.",
                        status="ACTIVE",
                        scope="ORGANIZATION",
                        provider=None,
                        model=None,
                        role_key="control-tower-agent",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Supervisory manager.",
                        human_owner_role="Admin or Platform Owner",
                        authority_ceiling="DRAFT",
                        activation_notes="Seeded for roster introspection tests.",
                        orchestration_pattern="TRIAGE",
                        parent_agent_id=None,
                        managed_agent_ids=["settlement-copilot", "market-research-agent"],
                        delegation_guidance="Route roster questions to the right specialist before summarizing.",
                        allowed_workspaces=["assistant", "admin"],
                        capabilities=["READ", "EXPLAIN", "DRAFT"],
                        skills=["agent_supervision", "inter_agent_consultation"],
                        allowed_tools=["get_workspace_summary"],
                        allowed_action_types=[],
                        daily_token_allocation=None,
                        system_prompt="Supervise managed agents.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                    AssistantAgent(
                        agent_id="settlement-copilot",
                        name="Settlement Copilot",
                        description="Settlement specialist.",
                        status="ACTIVE",
                        scope="TEAM",
                        provider=None,
                        model=None,
                        role_key="settlement-copilot",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Settlement manager.",
                        human_owner_role="Settlement Lead",
                        authority_ceiling="EXECUTE",
                        activation_notes="Seeded for roster introspection tests.",
                        orchestration_pattern="MANAGER",
                        parent_agent_id="control-tower-agent",
                        managed_agent_ids=[],
                        delegation_guidance="Keep settlement synthesis here.",
                        allowed_workspaces=["assistant", "settlement"],
                        capabilities=["READ", "EXPLAIN", "DRAFT", "ACTION"],
                        skills=["settlement_operations", "inter_agent_consultation"],
                        allowed_tools=["get_trade_settlement_summary"],
                        allowed_action_types=["issue_trade_invoice"],
                        daily_token_allocation=None,
                        system_prompt="Handle settlement.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                    AssistantAgent(
                        agent_id="market-research-agent",
                        name="Market Research Agent",
                        description="Market specialist.",
                        status="ACTIVE",
                        scope="TEAM",
                        provider=None,
                        model=None,
                        role_key="market-research-agent",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Research manager.",
                        human_owner_role="Desk Lead",
                        authority_ceiling="DRAFT",
                        activation_notes="Seeded for roster introspection tests.",
                        orchestration_pattern="PARALLEL",
                        parent_agent_id="control-tower-agent",
                        managed_agent_ids=[],
                        delegation_guidance="Fan out research.",
                        allowed_workspaces=["assistant", "reports"],
                        capabilities=["READ", "EXPLAIN", "DRAFT"],
                        skills=["market_intelligence", "inter_agent_consultation"],
                        allowed_tools=["get_market_context"],
                        allowed_action_types=[],
                        daily_token_allocation=None,
                        system_prompt="Handle market research.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                ]
            )
            session.commit()

            service = AssistantToolService(session, actor_id="ops_admin")
            list_result, list_trace = service.execute_tool("list_managed_agents", {})
            profile_result, profile_trace = service.execute_tool(
                "get_managed_agent_profile",
                {"agent_id": "control-tower-agent"},
            )

        self.assertEqual(list_trace.tool_name, "list_managed_agents")
        self.assertEqual(list_result.output["count"], 3)
        control_tower = next(
            item for item in list_result.output["items"] if item["agent_id"] == "control-tower-agent"
        )
        self.assertEqual(
            control_tower["build_recipe"],
            "role + skills + capabilities + workspaces + live tools + governed actions + system prompt",
        )
        self.assertIn("settlement-copilot", control_tower["managed_agent_ids"])
        self.assertIn("market-research-agent", control_tower["managed_agent_ids"])
        self.assertIn("manages settlement-copilot, market-research-agent", control_tower["relationship_summary"])
        self.assertGreaterEqual(len(list_trace.evidence_items), 2)
        self.assertEqual(list_trace.evidence_items[0].kind, "agent_hierarchy")
        self.assertEqual(list_trace.evidence_items[0].title, "Managed agent roster")

        self.assertEqual(profile_trace.tool_name, "get_managed_agent_profile")
        self.assertTrue(profile_result.output["found"])
        self.assertEqual(profile_result.output["agent"]["agent_id"], "control-tower-agent")
        self.assertEqual(profile_result.output["build_recipe"]["orchestration_pattern"], "TRIAGE")
        self.assertTrue(profile_result.output["build_recipe"]["system_prompt_visible"])
        self.assertEqual(profile_result.output["build_recipe"]["system_prompt"], "Supervise managed agents.")
        self.assertEqual(profile_result.output["role_archetype"]["role_key"], "control-tower-agent")
        self.assertEqual(
            profile_result.output["relationships"]["managed_agent_ids"],
            ["settlement-copilot", "market-research-agent"],
        )
        self.assertEqual(
            {row["agent_id"] for row in profile_result.output["relationships"]["related_agents"]},
            {"settlement-copilot", "market-research-agent"},
        )
        self.assertGreaterEqual(len(profile_trace.evidence_items), 2)
        self.assertEqual(profile_trace.evidence_items[0].locator, "control-tower-agent")
        self.assertTrue(
            any(item.kind == "agent_hierarchy" for item in profile_trace.evidence_items)
        )

    async def test_app_introspection_tools_expose_catalog_schema_and_codebase(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session, actor_id="ops_admin")
            catalog_result, catalog_trace = service.execute_tool("get_application_catalog", {})
            schema_result, schema_trace = service.execute_tool(
                "get_data_schema_catalog",
                {"table_name": "assistant_agents"},
            )
            search_result, search_trace = service.execute_tool(
                "search_codebase",
                {
                    "query": "build_application_access_summary",
                    "scope": "api",
                    "path_prefix": "apps/api/app/domains/assistant/services",
                },
            )
            read_result, read_trace = service.execute_tool(
                "read_codebase_file",
                {
                    "path": "apps/api/app/domains/assistant/services/app_context_catalog.py",
                    "start_line": 1,
                    "end_line": 24,
                },
            )

        self.assertEqual(catalog_trace.tool_name, "get_application_catalog")
        self.assertGreater(catalog_result.output["route_group_count"], 0)
        self.assertIn("assistant", {row["domain"] for row in catalog_result.output["route_groups"]})
        self.assertIn(
            "docs/engineering/ai-workflow.md",
            set(catalog_result.output["documentation_entry_points"]),
        )
        self.assertGreaterEqual(len(catalog_trace.evidence_items), 2)
        self.assertEqual(catalog_trace.evidence_items[0].kind, "application")
        self.assertTrue(
            any(item.kind == "route_group" for item in catalog_trace.evidence_items)
        )

        self.assertEqual(schema_trace.tool_name, "get_data_schema_catalog")
        self.assertTrue(schema_result.output["found"])
        self.assertEqual(schema_result.output["table"]["table_name"], "assistant_agents")
        self.assertEqual(schema_result.output["table"]["model_name"], "AssistantAgent")
        self.assertIn("agent_id", schema_result.output["table"]["primary_key"])
        self.assertEqual(len(schema_trace.evidence_items), 1)
        self.assertEqual(schema_trace.evidence_items[0].kind, "table")
        self.assertEqual(schema_trace.evidence_items[0].title, "assistant_agents")

        self.assertEqual(search_trace.tool_name, "search_codebase")
        self.assertGreaterEqual(search_result.output["count"], 1)
        self.assertTrue(
            any(
                row["path"] == "apps/api/app/domains/assistant/services/app_context_catalog.py"
                for row in search_result.output["items"]
            )
        )
        self.assertGreaterEqual(len(search_trace.evidence_items), 1)
        self.assertEqual(search_trace.evidence_items[0].kind, "code_search_hit")
        self.assertIn(
            "apps/api/app/domains/assistant/services/app_context_catalog.py",
            search_trace.evidence_items[0].locator or "",
        )

        self.assertEqual(read_trace.tool_name, "read_codebase_file")
        self.assertEqual(
            read_result.output["path"],
            "apps/api/app/domains/assistant/services/app_context_catalog.py",
        )
        self.assertIn("APP_CONTEXT_INTROSPECTION_TOOL_NAMES", read_result.output["content"])
        self.assertEqual(len(read_trace.evidence_items), 1)
        self.assertEqual(read_trace.evidence_items[0].kind, "code_file")
        self.assertIn("app_context_catalog.py:1-24", read_trace.evidence_items[0].locator or "")

    async def test_consult_managed_agent_limits_manager_to_configured_subordinates(self) -> None:
        now = datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops_admin",
                    email="ops-admin@example.com",
                    google_subject=None,
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=None,
                    is_active=True,
                    last_login_at=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add_all(
                [
                    AssistantAgent(
                        agent_id="control-tower-agent",
                        name="Control Tower Agent",
                        description="Supervises managed agents.",
                        status="ACTIVE",
                        scope="ORGANIZATION",
                        provider=None,
                        model=None,
                        role_key="control-tower-agent",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Supervisory manager.",
                        human_owner_role="Admin or Platform Owner",
                        authority_ceiling="DRAFT",
                        activation_notes="Seeded for hierarchy tests.",
                        orchestration_pattern="TRIAGE",
                        parent_agent_id=None,
                        managed_agent_ids=["settlement-copilot"],
                        delegation_guidance="Consult only configured domain managers before escalating.",
                        allowed_workspaces=["assistant", "admin"],
                        capabilities=["READ", "EXPLAIN", "DRAFT"],
                        skills=["agent_supervision", "inter_agent_consultation"],
                        allowed_tools=["consult_managed_agent", "get_workspace_summary"],
                        allowed_action_types=[],
                        daily_token_allocation=None,
                        system_prompt="Supervise managed agents.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                    AssistantAgent(
                        agent_id="settlement-copilot",
                        name="Settlement Copilot",
                        description="Settlement specialist.",
                        status="ACTIVE",
                        scope="TEAM",
                        provider=None,
                        model=None,
                        role_key="settlement-copilot",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Settlement manager.",
                        human_owner_role="Settlement Lead",
                        authority_ceiling="EXECUTE",
                        activation_notes="Seeded for hierarchy tests.",
                        orchestration_pattern="MANAGER",
                        parent_agent_id="control-tower-agent",
                        managed_agent_ids=[],
                        delegation_guidance="Keep settlement synthesis here.",
                        allowed_workspaces=["assistant", "settlement"],
                        capabilities=["READ", "EXPLAIN", "DRAFT", "ACTION"],
                        skills=["settlement_operations"],
                        allowed_tools=["get_trade_settlement_summary"],
                        allowed_action_types=["issue_trade_invoice"],
                        daily_token_allocation=None,
                        system_prompt="Handle settlement.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                    AssistantAgent(
                        agent_id="market-research-agent",
                        name="Market Research Agent",
                        description="Market specialist.",
                        status="ACTIVE",
                        scope="TEAM",
                        provider=None,
                        model=None,
                        role_key="market-research-agent",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Research manager.",
                        human_owner_role="Desk Lead",
                        authority_ceiling="DRAFT",
                        activation_notes="Seeded for hierarchy tests.",
                        orchestration_pattern="PARALLEL",
                        parent_agent_id="control-tower-agent",
                        managed_agent_ids=[],
                        delegation_guidance="Fan out research.",
                        allowed_workspaces=["assistant", "reports"],
                        capabilities=["READ", "EXPLAIN", "DRAFT"],
                        skills=["market_intelligence"],
                        allowed_tools=["get_market_context"],
                        allowed_action_types=[],
                        daily_token_allocation=None,
                        system_prompt="Handle market research.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                ]
            )
            session.commit()

            manager_record = session.get(AssistantAgent, "control-tower-agent")
            assert manager_record is not None
            service = AssistantToolService(
                session,
                actor_id="ops_admin",
                caller_agent=to_managed_agent(manager_record),
            )

            async def fake_generate_response(self, payload, agent_definition=None, prompt_context=None):
                del self, payload, prompt_context
                return SimpleNamespace(
                    message=SimpleNamespace(content=f"{agent_definition.name} advisory answer."),
                    warnings=[],
                    tool_calls=[],
                )

            with patch.object(AssistantService, "generate_response", new=fake_generate_response):
                allowed_result, allowed_trace = await service.execute_tool_async(
                    "consult_managed_agent",
                    {
                        "agent_id": "settlement-copilot",
                        "question": "What should I look at first in the settlement queue?",
                    },
                )

                self.assertTrue(allowed_result.output["ok"])
                self.assertTrue(allowed_result.output["advisory_only"])
                self.assertEqual(allowed_result.output["agent_id"], "settlement-copilot")
                self.assertEqual(allowed_result.output["build_recipe"]["orchestration_pattern"], "MANAGER")
                self.assertEqual(allowed_trace.tool_name, "consult_managed_agent")

                with self.assertRaises(AssistantToolServiceError) as exc:
                    await service.execute_tool_async(
                        "consult_managed_agent",
                        {
                            "agent_id": "market-research-agent",
                            "question": "Give me a market view.",
                        },
                    )

        self.assertIn("configured managed agents", str(exc.exception))

    async def test_enlist_managed_agent_records_delegated_run_and_executes_governed_action(self) -> None:
        now = datetime(2026, 5, 7, 18, 0, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="ops_admin",
                    email="ops-admin@example.com",
                    google_subject=None,
                    display_name="Ops Admin",
                    role="OPS_ADMIN",
                    password_hash=None,
                    is_active=True,
                    last_login_at=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.add_all(
                [
                    AssistantAgent(
                        agent_id="control-tower-agent",
                        name="Control Tower Agent",
                        description="Supervises managed agents.",
                        status="ACTIVE",
                        scope="ORGANIZATION",
                        provider=None,
                        model=None,
                        role_key="control-tower-agent",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Supervisory manager.",
                        human_owner_role="Admin or Platform Owner",
                        authority_ceiling="DRAFT",
                        activation_notes="Seeded for delegated execution tests.",
                        orchestration_pattern="TRIAGE",
                        parent_agent_id=None,
                        managed_agent_ids=["trade-capture-agent"],
                        delegation_guidance="Route lifecycle work to the trade capture lane when execution is warranted.",
                        allowed_workspaces=["assistant", "admin"],
                        capabilities=["READ", "EXPLAIN", "DRAFT"],
                        skills=["agent_supervision", "inter_agent_consultation"],
                        allowed_tools=["enlist_managed_agent", "get_workspace_summary"],
                        allowed_action_types=[],
                        daily_token_allocation=None,
                        system_prompt="Supervise managed agents.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                    AssistantAgent(
                        agent_id="trade-capture-agent",
                        name="Trade Capture Agent",
                        description="Captures governed trade lifecycle changes.",
                        status="ACTIVE",
                        scope="TEAM",
                        provider=None,
                        model=None,
                        role_key="trade-capture-agent",
                        profile_kind="ROLE_DERIVED",
                        specialization_summary="Trade execution specialist.",
                        human_owner_role="Trader",
                        authority_ceiling="EXECUTE",
                        activation_notes="Seeded for delegated execution tests.",
                        orchestration_pattern="SINGLE",
                        parent_agent_id="control-tower-agent",
                        managed_agent_ids=[],
                        delegation_guidance="Handle direct governed trade lifecycle work here.",
                        allowed_workspaces=["assistant", "trades"],
                        capabilities=["READ", "EXPLAIN", "DRAFT", "ACTION"],
                        skills=["trade_lifecycle_management"],
                        allowed_tools=["get_trade_by_id"],
                        allowed_action_types=["cancel_trade"],
                        daily_token_allocation=None,
                        system_prompt="Use the governed trade action contract when the request is explicit.",
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    ),
                ]
            )
            session.commit()

            manager_record = session.get(AssistantAgent, "control-tower-agent")
            assert manager_record is not None
            service = AssistantToolService(
                session,
                actor_id="ops_admin",
                caller_agent=to_managed_agent(manager_record),
            )

            async def fake_generate_response(self, payload, agent_definition=None, prompt_context=None):
                del self, payload, prompt_context
                return AssistantPromptResponse(
                    agent_id=agent_definition.agent_id if agent_definition is not None else None,
                    agent_name=agent_definition.name if agent_definition is not None else None,
                    agent_role_key=agent_definition.role_key if agent_definition is not None else None,
                    agent_profile_kind=agent_definition.profile_kind if agent_definition is not None else None,
                    provider="openai",
                    model="gpt-5-mini",
                    message=AssistantMessageOut(
                        content=f"{agent_definition.name} handled the delegated trade lifecycle task."
                    ),
                    usage=AssistantUsageOut(input_tokens=12, output_tokens=10),
                    warnings=[],
                    tool_calls=[],
                    action_requests=[],
                )

            with patch.object(AssistantService, "generate_response", new=fake_generate_response):
                result, trace = await service.execute_tool_async(
                    "enlist_managed_agent",
                    {
                        "agent_id": "trade-capture-agent",
                        "task": "Cancel trade T-1001 if it is still active and report the outcome.",
                    },
                )

            self.assertEqual(trace.tool_name, "enlist_managed_agent")
            self.assertTrue(result.output["ok"])
            self.assertTrue(result.output["delegated"])
            self.assertFalse(result.output["advisory_only"])
            self.assertEqual(result.output["agent_id"], "trade-capture-agent")
            self.assertEqual(result.output["executed_action_count"], 1)
            self.assertEqual(result.output["pending_action_count"], 0)
            self.assertEqual(result.output["failed_action_count"], 0)
            self.assertEqual(len(result.output["action_requests"]), 1)
            self.assertEqual(result.output["action_requests"][0]["action_type"], "cancel_trade")
            self.assertEqual(result.output["action_requests"][0]["status"], "EXECUTED")
            self.assertIn("Executed 1 governed action", trace.summary)
            self.assertEqual(trace.output_preview["agent_id"], "trade-capture-agent")
            self.assertEqual(trace.output_preview["executed_action_count"], 1)
            self.assertIn("delegated trade lifecycle task", str(trace.output_preview["answer"]))

            delegated_run = session.query(AssistantRun).order_by(AssistantRun.id.desc()).first()
            delegated_request = session.query(AssistantActionRequest).order_by(AssistantActionRequest.id.desc()).first()
            cancelled_trade = session.get(Trade, "T-1001")

        assert delegated_run is not None
        assert delegated_request is not None
        assert cancelled_trade is not None
        self.assertIsNone(delegated_run.conversation_id)
        self.assertEqual(delegated_run.agent_id, "trade-capture-agent")
        self.assertEqual(delegated_request.run_id, delegated_run.id)
        self.assertEqual(delegated_request.status, "EXECUTED")
        self.assertEqual(cancelled_trade.status, "CANCELLED")
        self.assertEqual(
            delegated_request.payload["review_context"]["delegated_by_agent"]["agent_id"],
            "control-tower-agent",
        )

    async def test_openai_response_executes_tool_call_and_returns_trace(self) -> None:
        captured_payloads: list[dict[str, object]] = []
        queued_responses = [
            {
                "id": "resp_1",
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_1",
                        "call_id": "call_1",
                        "name": "get_trade_by_id",
                        "arguments": json.dumps({"trade_id": "T-1001"}),
                    }
                ],
                "usage": {"input_tokens": 11, "output_tokens": 4},
            },
            {
                "id": "resp_2",
                "output_text": "Trade T-1001 is ACTIVE in book GAS-US with commodity HH.",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "Trade T-1001 is ACTIVE in book GAS-US with commodity HH.",
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 7, "output_tokens": 12},
            },
        ]

        async def fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_payloads.append(payload)
            return queued_responses.pop(0)

        with self.SessionLocal() as session:
            service = AssistantService(session)
            payload = AssistantPromptRequest(
                provider="openai",
                workspace="assistant",
                use_live_tools=True,
                messages=[{"role": "user", "content": "Summarize trade T-1001."}],
            )

            with patch(
                "apps.api.app.domains.assistant.services.chat._post_json",
                side_effect=fake_post_json,
            ):
                response = await service.generate_response(payload)

        self.assertEqual(response.provider, "openai")
        self.assertEqual(response.model, "gpt-5-mini")
        self.assertEqual(
            response.message.content,
            "Trade T-1001 is ACTIVE in book GAS-US with commodity HH.",
        )
        self.assertEqual(response.usage.input_tokens, 18)
        self.assertEqual(response.usage.output_tokens, 16)
        self.assertEqual(len(response.tool_calls), 1)
        self.assertEqual(response.tool_calls[0].tool_name, "get_trade_by_id")
        self.assertEqual(response.tool_calls[0].arguments["trade_id"], "T-1001")
        self.assertIn("Loaded trade T-1001", response.tool_calls[0].summary)

        self.assertEqual(len(captured_payloads), 2)
        self.assertIn("tools", captured_payloads[0])
        self.assertIsInstance(captured_payloads[0]["instructions"], str)
        first_input = captured_payloads[0]["input"]
        assert isinstance(first_input, list)
        self.assertEqual(first_input[0]["role"], "user")
        self.assertEqual(first_input[0]["content"], "Summarize trade T-1001.")
        self.assertNotIn("type", first_input[0])
        self.assertEqual(captured_payloads[1]["previous_response_id"], "resp_1")

        second_input = captured_payloads[1]["input"]
        assert isinstance(second_input, list)
        self.assertEqual(second_input[0]["type"], "function_call_output")
        self.assertEqual(second_input[0]["call_id"], "call_1")
        self.assertTrue(json.loads(second_input[0]["output"])["found"])


if __name__ == "__main__":
    unittest.main()
