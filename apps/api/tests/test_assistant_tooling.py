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
from apps.api.app.models.external_data_run import ExternalDataRun
from apps.api.app.models.external_series_definition import ExternalSeriesDefinition
from apps.api.app.models.external_series_observation import ExternalSeriesObservation
from apps.api.app.models.price_index_observation import PriceIndexObservation
from apps.api.app.models.reference_price_index import ReferencePriceIndex
from apps.api.app.models.trade import Trade
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
            "OPENAI_BASE_URL": settings.OPENAI_BASE_URL,
        }

        with self.SessionLocal() as session:
            session.query(ExternalSeriesObservation).delete()
            session.query(ExternalSeriesDefinition).delete()
            session.query(PriceIndexObservation).delete()
            session.query(ReferencePriceIndex).delete()
            session.query(ExternalDataRun).delete()
            session.query(Trade).delete()
            session.add(
                Trade(
                    trade_id="T-1001",
                    external_trade_id="EXT-1001",
                    source_system="ops",
                    created_at=datetime(2026, 3, 17, 12, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 17, 12, 5, tzinfo=timezone.utc),
                    execution_timestamp=datetime(2026, 3, 17, 11, 45, tzinfo=timezone.utc),
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
                    settlement_status="PENDING",
                    trader_user="trader_1",
                    status="ACTIVE",
                    last_event_id="evt-1001",
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
                    ExternalSeriesObservation(
                        id=1,
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
                        id=2,
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

    def test_tool_service_returns_market_context(self) -> None:
        with self.SessionLocal() as session:
            service = AssistantToolService(session)
            result, trace = service.execute_tool("get_market_context", {"commodity": "WTI", "limit": 5})

        self.assertEqual(trace.tool_name, "get_market_context")
        self.assertEqual(result.output["commodity"], "WTI")
        self.assertEqual(result.output["price_indices"][0]["price_index_code"], "WTI_CUSHING_D")
        self.assertEqual(result.output["macro"][0]["series_code"], "FRED_DGS10")
        self.assertEqual(result.output["positioning"][0]["series_code"], "CFTC_WTI_MM_NET")

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
