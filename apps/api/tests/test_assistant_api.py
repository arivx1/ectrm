from __future__ import annotations

import enum
import json
import unittest
from datetime import datetime, timedelta, timezone
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
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
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
            "OPENAI_AGENT_BUILDER_MODEL": settings.OPENAI_AGENT_BUILDER_MODEL,
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
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(TradeConfirmation).delete()
            session.query(TradeWorkflowItem).delete()
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
        settings.OPENAI_AGENT_BUILDER_MODEL = "gpt-5"
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
        self.assertIn("database", public_settings_response.json())

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
            [
                "get_trade_by_id",
                "list_trades",
                "list_trade_events",
                "list_positions",
                "search_reference_data",
                "get_market_context",
                "list_workflow_items",
                "list_trade_confirmations",
                "get_trade_workbench",
                "list_trade_invoices",
                "list_trade_payments",
                "get_trade_settlement_summary",
                "list_deliveries",
                "list_documents",
                "get_document_ingestion",
                "get_workspace_summary",
            ],
        )
        self.assertEqual(create_response.json()["allowed_action_types"], [])

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
            [
                "get_trade_by_id",
                "list_trades",
                "list_trade_events",
                "list_positions",
                "search_reference_data",
                "get_market_context",
                "list_workflow_items",
                "list_trade_confirmations",
                "get_trade_workbench",
                "list_trade_invoices",
                "list_trade_payments",
                "get_trade_settlement_summary",
                "list_deliveries",
                "list_documents",
                "get_document_ingestion",
                "get_workspace_summary",
            ],
        )
        self.assertEqual(updated_payload["allowed_action_types"], [])

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

    def test_admin_agent_builder_generates_openai_pinned_draft(self) -> None:
        token = self._create_session_token()
        captured_request: dict[str, object] = {}

        async def _fake_post_json(*, url, headers, payload, provider_label):
            captured_request["url"] = url
            captured_request["headers"] = headers
            captured_request["payload"] = payload
            captured_request["provider_label"] = provider_label
            return {
                "output_text": json.dumps(
                    {
                        "agent_id": "ops-openai-briefing",
                        "name": "Ops OpenAI Briefing",
                        "description": "Summarizes queue pressure and downstream blockers for operations leads.",
                        "scope": "TEAM",
                        "allowed_workspaces": ["assistant", "operations", "settlement"],
                        "capabilities": ["READ", "EXPLAIN", "ACTION"],
                        "allowed_tools": ["list_workflow_items", "get_trade_settlement_summary"],
                        "allowed_action_types": ["update_trade_workflow_item"],
                        "system_prompt": "Summarize operational blockers, explain the evidence, and draft concise follow-up notes.",
                    }
                ),
                "usage": {"input_tokens": 90, "output_tokens": 40},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/admin/assistant/agents/build",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "brief": "Build an operations handoff agent that works from live queue data and drafts follow-up notes.",
                    "current_draft": {
                        "status": "DRAFT",
                        "provider": "google",
                        "model": "gemini-2.5-flash",
                        "allowed_workspaces": ["assistant"],
                        "capabilities": ["EXPLAIN", "ACTION"],
                        "allowed_action_types": ["cancel_trade"],
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["model"], "gpt-5-mini")
        self.assertEqual(payload["builder_provider"], "openai")
        self.assertEqual(payload["builder_model"], "gpt-5")
        self.assertEqual(payload["status"], "DRAFT")
        self.assertEqual(payload["allowed_tools"], ["list_workflow_items", "get_trade_settlement_summary"])
        self.assertEqual(payload["allowed_action_types"], ["update_trade_workflow_item"])
        self.assertIn("pinned to OpenAI", payload["warnings"][0])

        request_payload = captured_request["payload"]
        assert isinstance(request_payload, dict)
        self.assertEqual(captured_request["provider_label"], "OpenAI Agent Builder")
        self.assertEqual(captured_request["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(request_payload["model"], "gpt-5")
        self.assertEqual(request_payload["text"]["format"]["type"], "json_schema")
        self.assertEqual(
            request_payload["text"]["format"]["name"],
            "assistant_agent_builder_draft",
        )
        self.assertIn("Build an operations handoff agent", request_payload["input"])
        self.assertIn('"provider":"openai"', request_payload["input"])
        self.assertIn('"action_type_options"', request_payload["input"])
        self.assertIn('"allowed_action_types":["cancel_trade"]', request_payload["input"])

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

    def test_admin_agent_create_rejects_action_allowlist_without_action_capability(self) -> None:
        token = self._create_session_token()

        response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "trade-reader-limited",
                "name": "Trade Reader Limited",
                "description": "Read-only trade explainer.",
                "status": "DRAFT",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "allowed_workspaces": ["assistant"],
                "capabilities": ["READ", "EXPLAIN"],
                "allowed_action_types": ["cancel_trade"],
                "system_prompt": "Explain the current trade state.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("allowed_action_types", response.json()["detail"])

    def test_assistant_prompt_respects_agent_allowed_action_types(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1014A")
        self._create_agent(
            agent_id="trade-captain",
            name="Trade Captain",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["ACTION", "EXPLAIN"],
            allowed_action_types=["cancel_trade"],
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
                    "context": "Selected trade:\n- trade_id: T-1014A\n- commodity: WTI",
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": "Issue invoice for this trade amount 2500."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action_requests"], [])

        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantActionRequest).count(), 0)

    def test_assistant_prompt_extracts_workflow_owner_and_due_date_from_message(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1014B")
        self._seed_workflow_item_record(
            trade_id="T-1014B",
            item_id=141,
            workflow_type="CONFIRMATION",
            status="PENDING",
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context="Selected workflow item:\n- item_id: 141",
            message="Assign workflow item 141 to cash.ops due 2026-04-21T15:00:00+00:00.",
        )

        self.assertEqual(action_request["action_type"], "update_trade_workflow_item")
        self.assertEqual(action_request["payload"]["changes"]["owner"], "cash.ops")
        self.assertEqual(action_request["payload"]["changes"]["due_at"], "2026-04-21T15:00:00+00:00")

    def test_assistant_prompt_extracts_invoice_amount_and_due_date_from_message(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1014C")

        action_request = self._create_action_request_via_prompt(
            token=token,
            context="Selected trade:\n- trade_id: T-1014C\n- commodity: WTI",
            message="Issue invoice for this trade invoice amount 2500 due 2026-04-24T12:00:00+00:00.",
        )

        self.assertEqual(action_request["action_type"], "issue_trade_invoice")
        self.assertEqual(action_request["payload"]["invoice_amount"], 2500.0)
        self.assertEqual(action_request["payload"]["due_at"], "2026-04-24T12:00:00+00:00")

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

    def test_assistant_action_request_approval_executes_confirmation_issue(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1014")
        self._seed_confirmation_record(
            trade_id="T-1014",
            confirmation_id=14,
            status="PENDING",
            issue_count=0,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected confirmation:\n"
                "- confirmation_id: 14\n"
                "- issue_method: EMAIL\n"
                "- issue_recipient: confirmations@acme.example\n"
            ),
            message="Issue this confirmation.",
        )

        self.assertEqual(action_request["action_type"], "issue_trade_confirmation")
        self.assertEqual(action_request["payload"]["confirmation_id"], 14)

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["confirmation_id"], 14)
        self.assertEqual(payload["result"]["status"], "SENT")

        with self.SessionLocal() as session:
            confirmation = session.get(TradeConfirmation, 14)
            assert confirmation is not None
            self.assertEqual(confirmation.status, "SENT")
            self.assertEqual(confirmation.issue_count, 1)
            self.assertEqual(confirmation.last_issue_method, "EMAIL")
            self.assertEqual(confirmation.last_issue_recipient, "confirmations@acme.example")

    def test_assistant_action_request_approval_records_confirmation_response(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1015")
        self._seed_confirmation_record(
            trade_id="T-1015",
            confirmation_id=15,
            status="SENT",
            issue_count=1,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected confirmation:\n"
                "- confirmation_id: 15\n"
                "- action: COUNTERPARTY_DISPUTED\n"
                "- dispute_reason: Volume mismatch\n"
                "- response_method: EMAIL\n"
            ),
            message="Record this confirmation as disputed.",
        )

        self.assertEqual(action_request["action_type"], "record_trade_confirmation_response")
        self.assertEqual(action_request["payload"]["action"], "COUNTERPARTY_DISPUTED")

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["confirmation_id"], 15)
        self.assertEqual(payload["result"]["status"], "DISPUTED")
        self.assertEqual(payload["result"]["receipt_status"], "COUNTERPARTY_DISPUTED")

        with self.SessionLocal() as session:
            confirmation = session.get(TradeConfirmation, 15)
            assert confirmation is not None
            self.assertEqual(confirmation.status, "DISPUTED")
            self.assertEqual(confirmation.receipt_status, "COUNTERPARTY_DISPUTED")
            self.assertEqual(confirmation.dispute_reason, "Volume mismatch")

    def test_assistant_action_request_approval_updates_workflow_item(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1016")
        self._seed_workflow_item_record(
            trade_id="T-1016",
            item_id=16,
            workflow_type="CONFIRMATION",
            status="PENDING",
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected workflow item:\n"
                "- item_id: 16\n"
                "- status: CONFIRMED\n"
                "- notes: Counterparty verbally matched terms.\n"
            ),
            message="Update workflow item 16 to confirmed.",
        )

        self.assertEqual(action_request["action_type"], "update_trade_workflow_item")
        self.assertEqual(action_request["payload"]["item_id"], 16)

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["item_id"], 16)
        self.assertEqual(payload["result"]["status"], "CONFIRMED")

        with self.SessionLocal() as session:
            workflow_item = session.get(TradeWorkflowItem, 16)
            assert workflow_item is not None
            self.assertEqual(workflow_item.status, "CONFIRMED")
            self.assertEqual(workflow_item.notes, "Counterparty verbally matched terms.")

    def test_assistant_action_request_approval_executes_invoice_issue(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1017")

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected trade:\n"
                "- trade_id: T-1017\n"
                "- invoice_number: INV-T-1017\n"
                "- invoice_amount: 2500\n"
            ),
            message="Issue invoice for this trade.",
        )

        self.assertEqual(action_request["action_type"], "issue_trade_invoice")
        self.assertEqual(action_request["payload"]["trade_id"], "T-1017")

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["trade_id"], "T-1017")
        self.assertEqual(payload["result"]["status"], "ISSUED")

        with self.SessionLocal() as session:
            invoice = session.query(TradeInvoice).filter(TradeInvoice.trade_id == "T-1017").one()
            self.assertEqual(invoice.invoice_number, "INV-T-1017")
            self.assertEqual(float(invoice.invoice_amount), 2500.0)

    def test_assistant_action_request_approval_executes_payment_creation(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1018")
        self._seed_invoice_record(
            trade_id="T-1018",
            invoice_id=18,
            invoice_number="INV-T-1018",
            invoice_amount=1800.0,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected invoice:\n"
                "- invoice_id: 18\n"
                "- payment_reference: PAY-T-1018-1\n"
                "- payment_amount: 1800\n"
                "- status: PAID\n"
            ),
            message="Record payment for this invoice.",
        )

        self.assertEqual(action_request["action_type"], "create_trade_payment")
        self.assertEqual(action_request["payload"]["invoice_id"], 18)

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["invoice_id"], 18)
        self.assertEqual(payload["result"]["status"], "PAID")

        with self.SessionLocal() as session:
            payment = session.query(TradePayment).filter(TradePayment.invoice_id == 18).one()
            self.assertEqual(payment.payment_reference, "PAY-T-1018-1")
            self.assertEqual(payment.status, "PAID")
            self.assertEqual(float(payment.payment_amount), 1800.0)

    def test_assistant_action_request_approval_reprocesses_document(self) -> None:
        token = self._create_session_token()
        self._seed_document_record(document_id="DOC-1019")

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected document:\n"
                "- document_id: DOC-1019\n"
                "- processor_provider: openai\n"
            ),
            message="Reprocess this document.",
        )

        self.assertEqual(action_request["action_type"], "reprocess_document_ingestion")
        self.assertEqual(action_request["payload"]["document_id"], "DOC-1019")

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["document_id"], "DOC-1019")
        self.assertEqual(payload["result"]["status"], "UPLOADED")

        with self.SessionLocal() as session:
            document = session.get(DocumentIngestion, "DOC-1019")
            page = (
                session.query(DocumentIngestionPage)
                .filter(DocumentIngestionPage.document_id == "DOC-1019")
                .one()
            )
            assert document is not None
            self.assertEqual(document.status, "UPLOADED")
            self.assertEqual(document.review_status, "UNREVIEWED")
            self.assertEqual(document.processor_provider, "openai")
            self.assertEqual(page.classification_status, "PENDING")
            self.assertEqual(page.extraction_status, "PENDING")
            self.assertEqual(page.review_status, "UNREVIEWED")

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
        self.assertIsInstance(first_request["instructions"], str)
        first_input = first_request["input"]
        assert isinstance(first_input, list)
        self.assertEqual(first_input[0]["role"], "user")
        self.assertEqual(
            first_input[0]["content"],
            "Explain the selected trade and recent changes.",
        )
        self.assertNotIn("type", first_input[0])
        self.assertEqual(second_request["previous_response_id"], "resp_1")

        second_input = second_request["input"]
        assert isinstance(second_input, list)
        self.assertEqual([item["call_id"] for item in second_input], ["call_1", "call_2"])

    def test_trades_endpoint_returns_deterministic_recency_order(self) -> None:
        token = self._create_session_token()
        latest_timestamp = datetime(2026, 4, 8, 17, 30, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            session.add_all(
                [
                    Event(
                        event_id="evt-latest-a",
                        aggregate_type="trade",
                        aggregate_id="T-LATEST-A",
                        event_type="TradeCreated",
                        occurred_at=latest_timestamp,
                        recorded_at=latest_timestamp,
                        actor_id="assistant_user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"trade_id": "T-LATEST-A"},
                    ),
                    Event(
                        event_id="evt-latest-b",
                        aggregate_type="trade",
                        aggregate_id="T-LATEST-B",
                        event_type="TradeCreated",
                        occurred_at=latest_timestamp,
                        recorded_at=latest_timestamp,
                        actor_id="assistant_user",
                        correlation_id=None,
                        causation_id=None,
                        schema_version=1,
                        payload={"trade_id": "T-LATEST-B"},
                    ),
                    Trade(
                        trade_id="T-LATEST-A",
                        external_trade_id="EXT-T-LATEST-A",
                        source_system="TEST",
                        created_at=latest_timestamp,
                        updated_at=latest_timestamp,
                        execution_timestamp=latest_timestamp,
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
                        last_event_id="evt-latest-a",
                    ),
                    Trade(
                        trade_id="T-LATEST-B",
                        external_trade_id="EXT-T-LATEST-B",
                        source_system="TEST",
                        created_at=latest_timestamp,
                        updated_at=latest_timestamp,
                        execution_timestamp=latest_timestamp,
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
                        last_event_id="evt-latest-b",
                    ),
                ]
            )
            session.commit()

        response = self.client.get(
            "/trades",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([row["trade_id"] for row in payload[:2]], ["T-LATEST-B", "T-LATEST-A"])

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
        self.assertNotIn("Live tool results:", request_payload["instructions"])

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
        allowed_action_types: list[str] | None = None,
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
                    allowed_action_types=list(allowed_action_types or []),
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

    def _seed_confirmation_record(
        self,
        *,
        trade_id: str,
        confirmation_id: int,
        status: str,
        issue_count: int,
    ) -> None:
        now = datetime.now(timezone.utc)
        sent_at = now - timedelta(hours=1) if issue_count else None
        with self.SessionLocal() as session:
            session.add(
                TradeConfirmation(
                    id=confirmation_id,
                    trade_id=trade_id,
                    source_document_id=None,
                    confirmation_number=f"CNF-{trade_id}",
                    status=status,
                    sent_at=sent_at,
                    confirmed_at=None,
                    issue_count=issue_count,
                    last_issued_at=sent_at,
                    last_issued_by="ops.confirmations" if issue_count else None,
                    last_issue_method="EMAIL" if issue_count else None,
                    last_issue_recipient="confirmations@acme.example" if issue_count else None,
                    last_issue_note="Previously issued" if issue_count else None,
                    receipt_status="ISSUED_AWAITING_RESPONSE" if issue_count else "NOT_ISSUED",
                    received_at=None,
                    received_by=None,
                    response_method=None,
                    response_reference=None,
                    response_note=None,
                    dispute_reason=None,
                    notes="Assistant API test fixture",
                    comparison_waiver_note=None,
                    comparison_waived_at=None,
                    comparison_waived_by=None,
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _seed_workflow_item_record(
        self,
        *,
        trade_id: str,
        item_id: int,
        workflow_type: str,
        status: str,
    ) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                TradeWorkflowItem(
                    id=item_id,
                    trade_id=trade_id,
                    workflow_type=workflow_type,
                    status=status,
                    owner="ops.queue",
                    due_at=now + timedelta(days=1),
                    notes="Initial workflow state",
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _seed_invoice_record(
        self,
        *,
        trade_id: str,
        invoice_id: int,
        invoice_number: str,
        invoice_amount: float,
    ) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                TradeInvoice(
                    id=invoice_id,
                    trade_id=trade_id,
                    delivery_id=None,
                    leg_no=None,
                    invoice_number=invoice_number,
                    invoice_currency_code="USD",
                    billed_quantity=1000,
                    quantity_unit_code="BBL",
                    invoice_amount=invoice_amount,
                    status="ISSUED",
                    issued_at=now,
                    due_at=now + timedelta(days=5),
                    dispute_reason=None,
                    notes="Assistant API invoice fixture",
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _seed_document_record(self, *, document_id: str) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                DocumentIngestion(
                    document_id=document_id,
                    original_filename=f"{document_id}.pdf",
                    display_name=f"{document_id}.pdf",
                    content_type="application/pdf",
                    storage_key=f"documents/{document_id}.pdf",
                    sha256="0" * 64,
                    size_bytes=2048,
                    page_count=1,
                    status="ANALYZED",
                    processor_provider="anthropic",
                    processor_model="claude-test",
                    classifier_version="test-classifier",
                    extractor_version="test-extractor",
                    analysis_summary={"status": "ready"},
                    processing_errors=["Old error"],
                    review_status="REVIEWED",
                    review_notes="Needs rerun",
                    reviewed_at=now,
                    reviewed_by="ops.docs",
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=2,
                )
            )
            session.add(
                DocumentIngestionPage(
                    document_id=document_id,
                    page_number=1,
                    classification_status="ANALYZED",
                    extraction_status="ANALYZED",
                    document_kind="CONFIRMATION",
                    document_subtype="TRADE",
                    classification_confidence=0.99,
                    classification_payload={"kind": "CONFIRMATION"},
                    header_fields=[],
                    table_blocks=[],
                    raw_text="Trade confirmation text",
                    processing_warnings=[],
                    processing_errors=[],
                    review_status="REVIEWED",
                    review_notes="Reviewed page",
                    reviewed_at=now,
                    reviewed_by="ops.docs",
                    processed_at=now,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

    def _create_action_request_via_prompt(
        self,
        *,
        token: str,
        context: str,
        message: str,
    ) -> dict[str, object]:
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
                    "context": context,
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": message},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["action_requests"]), 1)
        return payload["action_requests"][0]

    def _create_cancel_trade_action_request(self, *, token: str, trade_id: str) -> int:
        self._create_trade_with_event(trade_id=trade_id)
        action_request = self._create_action_request_via_prompt(
            token=token,
            context=f"Selected trade:\n- trade_id: {trade_id}\n- commodity: WTI",
            message="Cancel the selected trade.",
        )
        return action_request["action_request_id"]


if __name__ == "__main__":
    unittest.main()
