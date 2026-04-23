from __future__ import annotations

import enum
import json
import unittest
from datetime import datetime, timezone
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
from apps.api.app.domains.assistant.services.tools import AssistantToolService
from apps.api.app.models import Base
from apps.api.app.models.delivery_event import DeliveryEvent
from apps.api.app.models.delivery_obligation import DeliveryObligation
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_actualization import TradeActualization
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.schemas.assistant import AssistantPromptRequest


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
            session.query(PriceIndexObservation).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ExternalDataRun).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(DeliveryEvent).delete()
            session.query(TradeActualization).delete()
            session.query(DeliveryObligation).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeWorkflowItem).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
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
        self.assertEqual(candidate["supporting_records"]["confirmation_count"], 0)
        self.assertIn("No persisted confirmation ledger row exists", candidate["blocking_reasons"][0])
        self.assertEqual(candidate["suggested_next_tool"], "list_trade_confirmations")
        self.assertEqual(trace.tool_name, "list_trade_attention_candidates")
        self.assertIn("confirmation backlog", trace.summary)

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

    def test_tool_service_loads_workspace_summary(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_workspace_summary", {})

        self.assertEqual(result.output["trades"]["total_count"], 1)
        self.assertEqual(result.output["invoices"]["total_count"], 1)
        self.assertEqual(result.output["payments"]["total_count"], 1)
        self.assertEqual(result.output["deliveries"]["total_count"], 1)
        self.assertIn("Workspace summary loaded", trace.summary)

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
