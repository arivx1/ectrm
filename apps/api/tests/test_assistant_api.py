from __future__ import annotations

import enum
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
from apps.api.app.models.assistant_agent import AssistantAgent
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
            session.query(AssistantRun).delete()
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

    def test_assistant_prompt_context_preview_includes_live_tool_section_for_selected_trade(self) -> None:
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
        self.assertEqual(len(tool_sections), 1)
        self.assertEqual(tool_sections[0]["key"], "live-tool-results")
        self.assertIn("Loaded trade T-1000", tool_sections[0]["content"])
        self.assertIn("Live tool results:", payload["rendered_system_prompt"])

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
        captured_request: dict[str, object] = {}

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_request["payload"] = payload
            return {
                "output_text": "Only the allowed trade lookup was used.",
                "usage": {"input_tokens": 31, "output_tokens": 7},
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
        self.assertIn("skipped disallowed live tools: list_trade_events", " ".join(payload["warnings"]).lower())

        request_payload = captured_request["payload"]
        assert isinstance(request_payload, dict)
        self.assertEqual([tool["name"] for tool in request_payload["tools"]], ["get_trade_by_id"])

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

    def test_assistant_prompt_merges_prefetched_and_provider_tool_calls(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1004")

        class _ToolAwareAssistantService:
            async def generate_response(self, payload, agent_definition=None, prompt_context=None):
                del payload, agent_definition, prompt_context
                return {
                    "provider": "openai",
                    "model": "gpt-5-mini",
                    "message": {"role": "assistant", "content": "Merged tool output."},
                    "usage": {"input_tokens": 18, "output_tokens": 7},
                    "warnings": [],
                    "tool_calls": [
                        {
                            "tool_name": "list_positions",
                            "arguments": {"limit": 5},
                            "summary": "Returned 1 position row(s).",
                            "record_count": 1,
                        }
                    ],
                }

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=_ToolAwareAssistantService(),
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1004\n- commodity: WTI",
                    "use_live_tools": True,
                    "messages": [
                        {"role": "user", "content": "Explain the selected trade and recent changes."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            [tool_call["tool_name"] for tool_call in payload["tool_calls"]],
            ["get_trade_by_id", "list_trade_events", "list_positions"],
        )

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

        run_listing = self.client.get(
            "/admin/assistant/runs",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(run_listing.status_code, 200)
        self.assertEqual(run_listing.json()[0]["run_id"], payload["run_id"])

    def _create_session_token(self) -> str:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                UserAccount(
                    user_id="assistant_user",
                    email="assistant@example.com",
                    display_name="Assistant User",
                    role="OPS_ADMIN",
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
            session.commit()
            user = session.get(UserAccount, "assistant_user")
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


if __name__ == "__main__":
    unittest.main()
