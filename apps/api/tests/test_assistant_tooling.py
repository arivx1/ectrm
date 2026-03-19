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
        self.assertEqual(captured_payloads[1]["previous_response_id"], "resp_1")

        second_input = captured_payloads[1]["input"]
        assert isinstance(second_input, list)
        self.assertEqual(second_input[0]["type"], "function_call_output")
        self.assertEqual(second_input[0]["call_id"], "call_1")
        self.assertTrue(json.loads(second_input[0]["output"])["found"])


if __name__ == "__main__":
    unittest.main()
