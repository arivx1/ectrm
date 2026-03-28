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

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.config import settings
from apps.api.app.core.auth import create_user_session, hash_password
from apps.api.app.deps.db import get_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_conversation import AssistantConversation
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


class _FakeAssistantService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def generate_response(self, payload, agent_definition=None, prompt_context=None):
        self.calls.append(
            {
                "payload": payload,
                "agent_definition": agent_definition,
                "prompt_context": prompt_context,
            }
        )
        provider = payload.provider or getattr(agent_definition, "provider", None) or "openai"
        model = getattr(agent_definition, "model", None) or "gpt-5-mini"
        agent_name = getattr(agent_definition, "name", None)
        return {
            "agent_id": getattr(agent_definition, "agent_id", None),
            "agent_name": agent_name,
            "provider": provider,
            "model": model,
            "message": {
                "role": "assistant",
                "content": f"{agent_name or 'Echo'}: {payload.messages[-1].content}",
            },
            "usage": {"input_tokens": 12, "output_tokens": 8},
            "warnings": [],
            "tool_calls": [],
        }


class AssistantApiTests(unittest.TestCase):
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
        self._previous_settings = {
            "ASSISTANT_ENABLED": settings.ASSISTANT_ENABLED,
            "ASSISTANT_DEFAULT_PROVIDER": settings.ASSISTANT_DEFAULT_PROVIDER,
            "ASSISTANT_COMPANY_NAME": settings.ASSISTANT_COMPANY_NAME,
            "ASSISTANT_COMPANY_CONTEXT": settings.ASSISTANT_COMPANY_CONTEXT,
            "ASSISTANT_BUSINESS_CONTEXT": settings.ASSISTANT_BUSINESS_CONTEXT,
            "OPENAI_API_KEY": settings.OPENAI_API_KEY,
            "OPENAI_MODEL": settings.OPENAI_MODEL,
            "OPENAI_BASE_URL": settings.OPENAI_BASE_URL,
            "ANTHROPIC_API_KEY": settings.ANTHROPIC_API_KEY,
            "ANTHROPIC_MODEL": settings.ANTHROPIC_MODEL,
            "ANTHROPIC_BASE_URL": settings.ANTHROPIC_BASE_URL,
            "GOOGLE_API_KEY": settings.GOOGLE_API_KEY,
            "GOOGLE_MODEL": settings.GOOGLE_MODEL,
            "GOOGLE_BASE_URL": settings.GOOGLE_BASE_URL,
        }

        with self.SessionLocal() as session:
            session.query(UserSession).delete()
            session.query(AssistantActionRequest).delete()
            session.query(AssistantRun).delete()
            session.query(AssistantConversation).delete()
            session.query(AssistantAgent).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(UserAccount).delete()
            session.commit()

        settings.ASSISTANT_ENABLED = True
        settings.ASSISTANT_DEFAULT_PROVIDER = "anthropic"
        settings.ASSISTANT_COMPANY_NAME = "Acme Energy"
        settings.ASSISTANT_COMPANY_CONTEXT = "Acme Energy runs an operator-facing commodity trading platform."
        settings.ASSISTANT_BUSINESS_CONTEXT = "Acme tracks trade lifecycle changes through explicit events."
        settings.OPENAI_API_KEY = "openai-test-key"
        settings.OPENAI_MODEL = "gpt-5-mini"
        settings.OPENAI_BASE_URL = "https://api.openai.com/v1"
        settings.ANTHROPIC_API_KEY = ""
        settings.ANTHROPIC_MODEL = "claude-sonnet-4-5"
        settings.ANTHROPIC_BASE_URL = "https://api.anthropic.com"
        settings.GOOGLE_API_KEY = "google-test-key"
        settings.GOOGLE_MODEL = "gemini-2.5-flash"
        settings.GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def tearDown(self) -> None:
        for key, value in self._previous_settings.items():
            setattr(settings, key, value)

    def test_assistant_settings_report_effective_provider_status(self) -> None:
        response = self.client.get("/assistant/settings")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["default_provider"], "anthropic")
        self.assertEqual(payload["effective_default_provider"], "openai")
        self.assertEqual(payload["configured_provider_count"], 2)
        self.assertGreaterEqual(len(payload["available_tools"]), 1)
        self.assertEqual(payload["available_tools"][0]["name"], "get_trade_by_id")

        providers = {row["provider"]: row for row in payload["providers"]}
        self.assertTrue(providers["openai"]["enabled"])
        self.assertTrue(providers["openai"]["configured"])
        self.assertFalse(providers["anthropic"]["enabled"])
        self.assertFalse(providers["anthropic"]["configured"])
        self.assertTrue(providers["anthropic"]["is_default"])
        self.assertEqual(providers["google"]["setup_env_var"], "GOOGLE_API_KEY")

        public_settings_response = self.client.get("/settings/public")
        self.assertEqual(public_settings_response.status_code, 200)
        self.assertIn("assistant", public_settings_response.json())

    def test_assistant_prompt_requires_authentication(self) -> None:
        response = self.client.post(
            "/assistant/respond",
            json={
                "messages": [
                    {"role": "user", "content": "Summarize the current platform state."},
                ]
            },
        )

        self.assertEqual(response.status_code, 401)

    def test_assistant_prompt_returns_response_for_authenticated_session(self) -> None:
        token = self._create_session_token()
        fake_service = _FakeAssistantService()

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=fake_service,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "context": "API health is ok.",
                    "messages": [
                        {"role": "user", "content": "What can you tell me?"},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["model"], "gpt-5-mini")
        self.assertEqual(payload["message"]["role"], "assistant")
        self.assertEqual(payload["message"]["content"], "Echo: What can you tell me?")
        self.assertEqual(payload["tool_calls"], [])
        self.assertEqual(fake_service.calls[0]["agent_definition"], None)
        prompt_context = fake_service.calls[0]["prompt_context"]
        self.assertIsNotNone(prompt_context)
        self.assertIn("Acme Energy", prompt_context.system_prompt)
        self.assertIn("Authenticated User", prompt_context.system_prompt)
        self.assertIn("Application Context", prompt_context.system_prompt)

    def test_assistant_prompt_context_preview_includes_business_user_and_data_sections(self) -> None:
        token = self._create_session_token()

        response = self.client.post(
            "/assistant/context",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "workspace": "assistant",
                "context": "Loaded trades: 0.",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["model"], "gpt-5-mini")
        section_keys = {section["key"] for section in payload["sections"]}
        self.assertIn("organization", section_keys)
        self.assertIn("user", section_keys)
        self.assertIn("data-inventory", section_keys)
        self.assertIn("world-model", section_keys)
        self.assertIn("workspace", section_keys)
        self.assertIn("application-context", section_keys)
        self.assertIn("Acme Energy", payload["rendered_system_prompt"])
        self.assertIn("assistant_user", payload["rendered_system_prompt"])
        self.assertIn("Loaded trades: 0.", payload["rendered_system_prompt"])

    def test_assistant_prompt_context_preview_stays_pure_grounding_when_live_tools_enabled(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1000")

        response = self.client.post(
            "/assistant/context",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "workspace": "assistant",
                "context": "Selected trade:\n- trade_id: T-1000\n- commodity: WTI",
                "use_live_tools": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        tool_sections = [section for section in payload["sections"] if section["source"] == "tool"]
        self.assertEqual(tool_sections, [])
        self.assertNotIn("Live tool results:", payload["rendered_system_prompt"])

    def test_admin_agent_crud_and_public_listing_flow(self) -> None:
        token = self._create_session_token()

        create_response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "trade-explainer",
                "name": "Trade Explainer",
                "description": "Explains selected trade state and recent changes.",
                "status": "DRAFT",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "allowed_workspaces": ["assistant", "trades"],
                "capabilities": ["READ", "EXPLAIN"],
                "system_prompt": "Explain the current trade and call out missing context.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["status"], "DRAFT")
        self.assertEqual(
            create_response.json()["allowed_tools"],
            ["get_trade_by_id", "list_trades", "list_trade_events", "list_positions", "search_reference_data"],
        )

        public_listing = self.client.get("/assistant/agents")
        self.assertEqual(public_listing.status_code, 200)
        self.assertEqual(public_listing.json(), [])

        update_response = self.client.put(
            "/admin/assistant/agents/trade-explainer",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Trade Explainer",
                "description": "Explains selected trade state and recent changes.",
                "status": "ACTIVE",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "allowed_workspaces": ["assistant", "trades"],
                "capabilities": ["READ", "EXPLAIN", "DRAFT"],
                "system_prompt": "Explain the trade and draft next-step suggestions.",
                "updated_by": "assistant_user",
            },
        )

        self.assertEqual(update_response.status_code, 200)
        updated_payload = update_response.json()
        self.assertEqual(updated_payload["status"], "ACTIVE")
        self.assertEqual(updated_payload["version"], 2)
        self.assertEqual(
            updated_payload["allowed_tools"],
            ["get_trade_by_id", "list_trades", "list_trade_events", "list_positions", "search_reference_data"],
        )

        admin_listing = self.client.get(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(admin_listing.status_code, 200)
        self.assertEqual(len(admin_listing.json()), 1)
        self.assertEqual(admin_listing.json()[0]["system_prompt"], "Explain the trade and draft next-step suggestions.")

        public_listing = self.client.get("/assistant/agents")
        self.assertEqual(public_listing.status_code, 200)
        self.assertEqual([row["agent_id"] for row in public_listing.json()], ["trade-explainer"])

    def test_assistant_prompt_uses_managed_agent_definition(self) -> None:
        token = self._create_session_token()
        self._create_agent(
            agent_id="ops-analyst",
            name="Ops Analyst",
            status="ACTIVE",
            allowed_workspaces=["assistant", "admin"],
            capabilities=["READ", "EXPLAIN"],
            provider="openai",
            model="gpt-5-mini",
        )
        fake_service = _FakeAssistantService()

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=fake_service,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_id": "ops-analyst",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "Summarize the current operations posture."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["agent_id"], "ops-analyst")
        self.assertEqual(payload["agent_name"], "Ops Analyst")
        self.assertEqual(payload["message"]["content"], "Ops Analyst: Summarize the current operations posture.")
        agent_definition = fake_service.calls[0]["agent_definition"]
        self.assertIsNotNone(agent_definition)
        self.assertEqual(agent_definition.agent_id, "ops-analyst")
        self.assertEqual(agent_definition.allowed_workspaces, ("assistant", "admin"))

    def test_assistant_prompt_rejects_agent_for_unconfigured_workspace(self) -> None:
        token = self._create_session_token()
        self._create_agent(
            agent_id="trade-ops",
            name="Trade Ops",
            status="ACTIVE",
            allowed_workspaces=["trades"],
            capabilities=["READ"],
        )

        response = self.client.post(
            "/assistant/respond",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "trade-ops",
                "workspace": "assistant",
                "messages": [
                    {"role": "user", "content": "Can you help here?"},
                ],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("not configured for the assistant workspace", response.json()["detail"])

    def test_assistant_prompt_creates_cancel_trade_action_request_for_action_agent(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1007")
        self._create_agent(
            agent_id="trade-captain",
            name="Trade Captain",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["ACTION", "EXPLAIN"],
            provider="openai",
            model="gpt-5-mini",
        )
        fake_service = _FakeAssistantService()

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=fake_service,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_id": "trade-captain",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1007\n- commodity: WTI",
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": "Cancel the selected trade."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload["run_id"], int)
        self.assertEqual(len(payload["action_requests"]), 1)
        self.assertEqual(payload["action_requests"][0]["status"], "PENDING")
        self.assertEqual(payload["action_requests"][0]["action_type"], "cancel_trade")
        self.assertEqual(payload["action_requests"][0]["payload"], {"trade_id": "T-1007"})

        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantActionRequest).count(), 1)

    def test_assistant_action_request_approval_executes_trade_cancellation(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008",
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["trade_id"], "T-1008")
        self.assertEqual(payload["result"]["trade_status"], "CANCELLED")

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008")
            assert trade is not None
            self.assertEqual(trade.status, "CANCELLED")
            cancelled_events = session.query(Event).filter(Event.event_type == "TradeCancelled").count()
            self.assertEqual(cancelled_events, 1)

    def test_assistant_action_request_rejection_keeps_trade_active(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1009",
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/reject",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "REJECTED")
        self.assertIsNone(payload["result"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1009")
            assert trade is not None
            self.assertEqual(trade.status, "ACTIVE")
            cancelled_events = session.query(Event).filter(Event.event_type == "TradeCancelled").count()
            self.assertEqual(cancelled_events, 0)

    def test_assistant_action_request_listing_is_scoped_to_current_user(self) -> None:
        token = self._create_session_token()
        own_action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1010",
        )

        other_token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )
        self._create_cancel_trade_action_request(
            token=other_token,
            trade_id="T-1011",
        )

        response = self.client.get(
            "/assistant/action-requests?status=PENDING",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["action_request_id"], own_action_request_id)
        self.assertEqual(payload[0]["user_id"], "assistant_user")
        self.assertEqual(payload[0]["status"], "PENDING")

    def test_admin_action_request_listing_filters_pending_queue_across_users(self) -> None:
        admin_token = self._create_session_token()
        own_action_request_id = self._create_cancel_trade_action_request(
            token=admin_token,
            trade_id="T-1012",
        )

        other_token = self._create_session_token(
            user_id="ops_user",
            email="ops@example.com",
            display_name="Ops User",
            role="TRADER",
        )
        other_action_request_id = self._create_cancel_trade_action_request(
            token=other_token,
            trade_id="T-1013",
        )

        reject_response = self.client.post(
            f"/assistant/action-requests/{own_action_request_id}/reject",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reject_response.status_code, 200)

        response = self.client.get(
            "/admin/assistant/action-requests?status=PENDING",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([row["action_request_id"] for row in payload], [other_action_request_id])
        self.assertEqual(payload[0]["user_id"], "ops_user")
        self.assertEqual(payload[0]["status"], "PENDING")

    def test_admin_action_request_listing_requires_admin_role(self) -> None:
        token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )

        response = self.client.get(
            "/admin/assistant/action-requests",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertEqual(payload["error"]["code"], "AUTHENTICATION_REQUIRED")
        self.assertEqual(
            payload["error"]["message"],
            "An administrative session is required for this operation.",
        )

    def test_assistant_prompt_executes_live_tools_and_returns_tool_trace(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1001")
        captured_requests: list[dict[str, object]] = []

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_requests.append(payload)
            if len(captured_requests) == 1:
                return {
                    "id": "resp_1",
                    "output": [
                        {
                            "type": "function_call",
                            "id": "fc_1",
                            "call_id": "call_1",
                            "name": "get_trade_by_id",
                            "arguments": '{"trade_id":"T-1001"}',
                        },
                        {
                            "type": "function_call",
                            "id": "fc_2",
                            "call_id": "call_2",
                            "name": "list_trade_events",
                            "arguments": '{"trade_id":"T-1001","limit":5}',
                        },
                    ],
                    "usage": {"input_tokens": 55, "output_tokens": 21},
                }

            return {
                "id": "resp_2",
                "output_text": "Tool-backed answer.",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "Tool-backed answer.",
                            }
                        ],
                    }
                ],
                "usage": {"input_tokens": 18, "output_tokens": 9},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "context": (
                        "API health: ok.\n"
                        "Selected trade:\n"
                        "- trade_id: T-1001\n"
                        "- commodity: WTI\n"
                    ),
                    "use_live_tools": True,
                    "messages": [
                        {"role": "user", "content": "Explain the selected trade and recent changes."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["message"]["content"], "Tool-backed answer.")
        self.assertEqual([tool_call["tool_name"] for tool_call in payload["tool_calls"]], ["get_trade_by_id", "list_trade_events"])

        self.assertEqual(len(captured_requests), 2)
        first_request = captured_requests[0]
        second_request = captured_requests[1]
        self.assertIn("tools", first_request)
        self.assertEqual(second_request["previous_response_id"], "resp_1")

        second_input = second_request["input"]
        assert isinstance(second_input, list)
        self.assertEqual([item["call_id"] for item in second_input], ["call_1", "call_2"])

    def test_assistant_prompt_respects_agent_allowed_tools(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1005")
        self._create_agent(
            agent_id="trade-reader",
            name="Trade Reader",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["READ", "EXPLAIN"],
            allowed_tools=["get_trade_by_id"],
            provider="openai",
            model="gpt-5-mini",
        )
        captured_requests: list[dict[str, object]] = []

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_requests.append(payload)
            if len(captured_requests) == 1:
                return {
                    "id": "resp_allowed_1",
                    "output": [
                        {
                            "type": "function_call",
                            "id": "fc_allowed_1",
                            "call_id": "call_allowed_1",
                            "name": "get_trade_by_id",
                            "arguments": '{"trade_id":"T-1005"}',
                        }
                    ],
                    "usage": {"input_tokens": 14, "output_tokens": 5},
                }
            return {
                "id": "resp_allowed_2",
                "output_text": "Only the allowed trade lookup was used.",
                "usage": {"input_tokens": 9, "output_tokens": 7},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_id": "trade-reader",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1005\n- commodity: WTI",
                    "use_live_tools": True,
                    "messages": [
                        {"role": "user", "content": "Explain the selected trade and recent changes."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([tool_call["tool_name"] for tool_call in payload["tool_calls"]], ["get_trade_by_id"])
        self.assertEqual(payload["warnings"], [])

        self.assertEqual(len(captured_requests), 2)
        first_request = captured_requests[0]
        second_request = captured_requests[1]
        self.assertEqual([tool["name"] for tool in first_request["tools"]], ["get_trade_by_id"])
        self.assertEqual(second_request["previous_response_id"], "resp_allowed_1")

    def test_assistant_prompt_skips_live_tools_for_non_read_managed_agent(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1003")
        self._create_agent(
            agent_id="writer",
            name="Writer",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["EXPLAIN", "DRAFT"],
            provider="openai",
            model="gpt-5-mini",
        )
        captured_request: dict[str, object] = {}

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_request["payload"] = payload
            return {
                "output_text": "No live reads were used.",
                "usage": {"input_tokens": 34, "output_tokens": 8},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_id": "writer",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1003\n- commodity: WTI",
                    "use_live_tools": True,
                    "messages": [
                        {"role": "user", "content": "Explain the selected trade and recent changes."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["tool_calls"], [])
        self.assertEqual(
            payload["warnings"],
            ["Writer does not include READ capability, so live tools were disabled for this response."],
        )

        request_payload = captured_request["payload"]
        assert isinstance(request_payload, dict)
        self.assertNotIn("Live tool results:", request_payload["input"][0]["content"][0]["text"])

    def test_assistant_prompt_skips_live_tools_when_disabled(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1002")
        captured_request: dict[str, object] = {}

        async def _fake_post_json(*, url, headers, payload, provider_label):
            captured_request["payload"] = payload
            return {
                "output_text": "No tools used.",
                "usage": {"input_tokens": 34, "output_tokens": 8},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1002\n- commodity: WTI",
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": "Explain the selected trade and recent changes."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["tool_calls"], [])

        request_payload = captured_request["payload"]
        assert isinstance(request_payload, dict)
        self.assertNotIn("tools", request_payload)

    def test_assistant_prompt_records_run_trace_and_lists_it(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1006")

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Recorded run.",
                "usage": {"input_tokens": 22, "output_tokens": 6},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1006\n- commodity: WTI",
                    "use_live_tools": True,
                    "messages": [
                        {"role": "user", "content": "Explain the selected trade."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload["run_id"], int)
        self.assertIsNotNone(payload["run_recorded_at"])

        run_detail = self.client.get(
            f"/assistant/runs/{payload['run_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(run_detail.status_code, 200)
        run_payload = run_detail.json()
        self.assertEqual(run_payload["status"], "COMPLETED")
        self.assertEqual(run_payload["provider"], "openai")
        self.assertEqual(run_payload["assistant_message"], "Recorded run.")
        self.assertEqual(run_payload["latest_user_message"], "Explain the selected trade.")
        self.assertGreaterEqual(len(run_payload["prompt_sections"]), 1)
        self.assertEqual(
            [section["source"] for section in run_payload["prompt_sections"] if section["source"] == "tool"],
            [],
        )

        run_listing = self.client.get(
            "/admin/assistant/runs",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(run_listing.status_code, 200)
        self.assertEqual(run_listing.json()[0]["run_id"], payload["run_id"])

    def test_assistant_prompt_persists_conversation_and_reloads_it(self) -> None:
        token = self._create_session_token()

        responses = [
            {
                "output_text": "First answer.",
                "usage": {"input_tokens": 12, "output_tokens": 4},
            },
            {
                "output_text": "Second answer.",
                "usage": {"input_tokens": 18, "output_tokens": 7},
            },
        ]

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return responses.pop(0)

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            first_response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "First question?"},
                    ],
                },
            )

            first_payload = first_response.json()
            second_response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "conversation_id": first_payload["conversation_id"],
                    "provider": "openai",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "First question?"},
                        {"role": "assistant", "content": "First answer."},
                        {"role": "user", "content": "Second question?"},
                    ],
                },
            )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)

        first_payload = first_response.json()
        second_payload = second_response.json()
        self.assertIsInstance(first_payload["conversation_id"], int)
        self.assertEqual(second_payload["conversation_id"], first_payload["conversation_id"])

        conversations_response = self.client.get(
            "/assistant/conversations",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(conversations_response.status_code, 200)
        conversations_payload = conversations_response.json()
        self.assertEqual(conversations_payload[0]["conversation_id"], first_payload["conversation_id"])
        self.assertEqual(conversations_payload[0]["run_count"], 2)

        detail_response = self.client.get(
            f"/assistant/conversations/{first_payload['conversation_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(detail_response.status_code, 200)
        detail_payload = detail_response.json()
        self.assertEqual([message["role"] for message in detail_payload["messages"]], ["user", "assistant", "user", "assistant"])
        self.assertEqual(detail_payload["messages"][0]["content"], "First question?")
        self.assertEqual(detail_payload["messages"][1]["content"], "First answer.")
        self.assertEqual(detail_payload["messages"][3]["content"], "Second answer.")

    def test_assistant_stream_route_emits_events_and_records_conversation(self) -> None:
        token = self._create_session_token()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Streamed answer.",
                "usage": {"input_tokens": 15, "output_tokens": 5},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            with self.client.stream(
                "POST",
                "/assistant/respond/stream",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "Stream this reply."},
                    ],
                },
            ) as response:
                stream_lines = [line for line in response.iter_lines() if line]

        self.assertEqual(response.status_code, 200)
        stream_body = "\n".join(stream_lines)
        self.assertIn("event: conversation", stream_body)
        self.assertIn("event: assistant.metadata", stream_body)
        self.assertIn("event: assistant.delta", stream_body)
        self.assertIn("event: assistant.complete", stream_body)

        completion_data = self._decode_last_sse_event_payload(stream_body, "assistant.complete")
        self.assertEqual(completion_data["message"]["content"], "Streamed answer.")
        self.assertIsInstance(completion_data["conversation_id"], int)

        detail_response = self.client.get(
            f"/assistant/conversations/{completion_data['conversation_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(
            [message["content"] for message in detail_response.json()["messages"]],
            ["Stream this reply.", "Streamed answer."],
        )

    def _decode_last_sse_event_payload(self, stream_body: str, event_name: str) -> dict[str, object]:
        lines = [line.strip() for line in stream_body.splitlines() if line.strip()]
        for index, line in enumerate(lines):
            if line != f"event: {event_name}":
                continue
            data_lines: list[str] = []
            next_index = index + 1
            while next_index < len(lines) and not lines[next_index].startswith("event:"):
                if lines[next_index].startswith("data:"):
                    data_lines.append(lines[next_index][len("data:") :].strip())
                next_index += 1
            if data_lines:
                return json.loads("\n".join(data_lines))
        raise AssertionError(f"Event {event_name} not found in stream body")

    def _create_session_token(
        self,
        *,
        user_id: str = "assistant_user",
        email: str | None = None,
        display_name: str | None = None,
        role: str = "OPS_ADMIN",
    ) -> str:
        now = datetime.now(timezone.utc)
        resolved_email = email or f"{user_id}@example.com"
        resolved_display_name = display_name or user_id.replace("_", " ").title()
        with self.SessionLocal() as session:
            user = session.get(UserAccount, user_id)
            if user is None:
                session.add(
                    UserAccount(
                        user_id=user_id,
                        email=resolved_email,
                        display_name=resolved_display_name,
                        role=role,
                        password_hash=hash_password("supersecret1"),
                        is_active=True,
                        last_login_at=now,
                        created_at=now,
                        created_by="test-suite",
                        updated_at=now,
                        updated_by="test-suite",
                        version=1,
                    )
                )
            else:
                user.email = resolved_email
                user.display_name = resolved_display_name
                user.role = role
                user.last_login_at = now
                user.updated_at = now
                user.updated_by = "test-suite"
            session.commit()
            user = session.get(UserAccount, user_id)
            assert user is not None
            _, token = create_user_session(session, user)
            return token

    def _create_agent(
        self,
        *,
        agent_id: str,
        name: str,
        status: str,
        allowed_workspaces: list[str],
        capabilities: list[str],
        allowed_tools: list[str] | None = None,
        provider: str | None = None,
        model: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            existing = session.get(AssistantAgent, agent_id)
            if existing is not None:
                return
            session.add(
                AssistantAgent(
                    agent_id=agent_id,
                    name=name,
                    description=f"{name} description.",
                    status=status,
                    scope="TEAM",
                    provider=provider,
                    model=model,
                    allowed_workspaces=allowed_workspaces,
                    capabilities=capabilities,
                    allowed_tools=list(allowed_tools or []),
                    system_prompt=f"System prompt for {name}.",
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _create_trade_with_event(self, *, trade_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id=f"evt-{trade_id.lower()}",
                    aggregate_type="trade",
                    aggregate_id=trade_id,
                    event_type="TradeCreated",
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="assistant_user",
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
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book="CRUDE",
                    portfolio="PROMPT",
                    counterparty="ACME",
                    commodity_class="CRUDE",
                    commodity="WTI",
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id=f"evt-{trade_id.lower()}",
                )
            )
            session.commit()

    def _create_cancel_trade_action_request(self, *, token: str, trade_id: str) -> int:
        self._create_trade_with_event(trade_id=trade_id)
        self._create_agent(
            agent_id="trade-captain",
            name="Trade Captain",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["ACTION", "EXPLAIN"],
            provider="openai",
            model="gpt-5-mini",
        )
        fake_service = _FakeAssistantService()

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=fake_service,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_id": "trade-captain",
                    "workspace": "assistant",
                    "context": f"Selected trade:\n- trade_id: {trade_id}\n- commodity: WTI",
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": "Cancel the selected trade."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        return payload["action_requests"][0]["action_request_id"]


if __name__ == "__main__":
    unittest.main()
