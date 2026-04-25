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
from apps.api.app.domains.assistant.services.action_catalog import (
    ALL_CATALOG_ACTION_TYPES,
    ASSISTANT_ACTION_CATALOG,
)
from apps.api.app.domains.assistant.services.action_registry import ACTION_HANDLERS, ACTION_SPECS
from apps.api.app.domains.assistant.services.action_planners import (
    ACTION_PLANNER_SEQUENCE,
    ACTION_PLANNERS,
)
from apps.api.app.domains.assistant.services.chat import ASSISTANT_ACTION_DEFINITIONS
from apps.api.app.domains.assistant.services.policies import POLICY_RULES
from apps.api.app.domains.assistant.services.role_archetypes import validate_role_archetype_registry
from apps.api.app.domains.assistant.services.execution import prepare_assistant_execution
from apps.api.app.domains.assistant.services.tools import build_tool_definitions
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval, AssistantAgentEvalRun
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.models.assistant_agent_profile_request import AssistantAgentProfileRequest
from apps.api.app.models.assistant_agent_work_package import AssistantAgentWorkPackage
from apps.api.app.models.assistant_conversation import AssistantConversation
from apps.api.app.models.assistant_prompt_navigation_outcome import AssistantPromptNavigationOutcome
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.assistant_run_feedback import AssistantRunFeedback
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_confirmation import TradeConfirmation
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.trade_workflow_item import TradeWorkflowItem
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.assistant import ALL_ASSISTANT_ACTION_TYPES, AssistantPromptRequest


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
            "ASSISTANT_MAX_OUTPUT_TOKENS": settings.ASSISTANT_MAX_OUTPUT_TOKENS,
            "ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION": settings.ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION,
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
            session.query(AssistantAgentWorkPackage).delete()
            session.query(AssistantActionRequest).delete()
            session.query(AssistantPromptNavigationOutcome).delete()
            session.query(AssistantRunFeedback).delete()
            session.query(AssistantAgentEvalRun).delete()
            session.query(AssistantRun).delete()
            session.query(AssistantConversation).delete()
            session.query(AssistantAgentEval).delete()
            session.query(AssistantAgent).delete()
            session.query(AssistantAgentProfileRequest).delete()
            session.query(MutationProvenanceRecord).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(UserAccount).delete()
            session.commit()

        settings.ASSISTANT_ENABLED = True
        settings.ASSISTANT_DEFAULT_PROVIDER = "anthropic"
        settings.ASSISTANT_COMPANY_NAME = "Acme Energy"
        settings.ASSISTANT_COMPANY_CONTEXT = "Acme Energy runs an operator-facing commodity trading platform."
        settings.ASSISTANT_BUSINESS_CONTEXT = "Acme tracks trade lifecycle changes through explicit events."
        settings.ASSISTANT_MAX_OUTPUT_TOKENS = 3200
        settings.ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION = 100_000
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

    def test_admin_role_archetypes_expose_governed_role_contract(self) -> None:
        validate_role_archetype_registry()
        token = self._create_session_token(role="OPS_ADMIN")

        response = self.client.get(
            "/admin/assistant/role-archetypes",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        role_keys = [row["role_key"] for row in payload]
        self.assertIn("trade-ops-copilot", role_keys)
        self.assertIn("trade-capture-agent", role_keys)
        self.assertIn("pre-trade-structuring-agent", role_keys)
        self.assertIn("control-tower-agent", role_keys)
        phase_1_roles = [row for row in payload if row["catalog_status"] == "PHASE_1"]
        self.assertEqual(
            [row["role_key"] for row in phase_1_roles],
            [
                "market-research-agent",
                "pre-trade-structuring-agent",
                "risk-sentinel",
                "document-agent",
                "reporting-reconciliation-agent",
            ],
        )

        trade_ops = next(row for row in payload if row["role_key"] == "trade-ops-copilot")
        self.assertEqual(trade_ops["catalog_status"], "SEEDED")
        self.assertEqual(trade_ops["authority_ceiling"], "EXECUTE")
        self.assertEqual(trade_ops["human_owner_role"], "Operations Lead")
        self.assertEqual(trade_ops["current_profile_ids"], ["trade-ops-copilot"])
        self.assertIn("ACTION", trade_ops["capability_ceiling"])
        self.assertEqual(
            trade_ops["maximum_action_types"],
            [
                "issue_trade_confirmation",
                "record_trade_confirmation_response",
                "update_trade_workflow_item",
                "record_trade_actualization",
                "reprocess_document_ingestion",
            ],
        )
        self.assertIn("get_trade_workbench", trade_ops["default_tools"])
        self.assertGreaterEqual(len(trade_ops["stop_conditions"]), 1)
        self.assertGreaterEqual(len(trade_ops["required_eval_coverage"]), 1)
        self.assertEqual(trade_ops["eval_gate"]["status"], "PASS")
        self.assertIn("Allowed operational action execution.", trade_ops["eval_gate"]["covered_cases"])
        self.assertEqual(trade_ops["eval_gate"]["missing_cases"], [])

        pre_trade = next(row for row in payload if row["role_key"] == "pre-trade-structuring-agent")
        self.assertEqual(pre_trade["catalog_status"], "PHASE_1")
        self.assertEqual(pre_trade["current_profile_ids"], ["pre-trade-structuring-agent"])
        self.assertEqual(pre_trade["authority_ceiling"], "DRAFT")
        self.assertIn("analyze_pretrade_scenario_draft", pre_trade["default_tools"])
        self.assertIn("get_pretrade_recommendation_run", pre_trade["default_tools"])

        trade_capture = next(row for row in payload if row["role_key"] == "trade-capture-agent")
        self.assertEqual(trade_capture["catalog_status"], "SEEDED")
        self.assertEqual(trade_capture["current_profile_ids"], ["trade-capture-agent"])
        self.assertEqual(trade_capture["authority_ceiling"], "EXECUTE")
        self.assertEqual(trade_capture["maximum_action_types"], ["cancel_trade"])

        accounting_posting = next(row for row in payload if row["role_key"] == "accounting-posting-agent")
        self.assertEqual(accounting_posting["catalog_status"], "SEEDED")
        self.assertEqual(accounting_posting["current_profile_ids"], ["accounting-posting-agent"])
        self.assertEqual(accounting_posting["authority_ceiling"], "DRAFT")
        self.assertEqual(accounting_posting["maximum_action_types"], [])

    def test_admin_seed_sync_exposes_role_profiles_with_policy_and_eval_status(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")

        seed_response = self.client.post(
            "/admin/data/assistant-agents/seed",
            headers={"Authorization": f"Bearer {token}"},
            json={"requested_by": "assistant_user"},
        )

        self.assertEqual(seed_response.status_code, 200)
        self.assertEqual(seed_response.json()["total_profiles"], 15)
        self.assertEqual(seed_response.json()["total_templates"], 15)

        listing_response = self.client.get(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(listing_response.status_code, 200)
        profiles = {row["agent_id"]: row for row in listing_response.json()}
        self.assertEqual(len(profiles), 15)

        active_profiles = [row for row in profiles.values() if row["status"] == "ACTIVE"]
        self.assertEqual(
            sorted(row["agent_id"] for row in active_profiles),
            [
                "accounting-posting-agent",
                "accrual-controller-agent",
                "counterparty-state-sync-agent",
                "document-agent",
                "fee-accrual-agent",
                "logistics-coordinator",
                "market-research-agent",
                "movement-controller-agent",
                "pre-trade-structuring-agent",
                "reporting-reconciliation-agent",
                "risk-sentinel",
                "settlement-copilot",
                "trade-capture-agent",
                "trade-governor",
                "trade-ops-copilot",
            ],
        )
        for profile in active_profiles:
            self.assertEqual(profile["profile_kind"], "ROLE_DERIVED")
            self.assertTrue(profile["role_key"])
            self.assertTrue(profile["human_owner_role"])
            self.assertTrue(profile["authority_ceiling"])
            self.assertIn("policy_notes", profile["effective_policy"])
            self.assertIn(profile["eval_gate"]["status"], {"PASS", "BLOCKED"})
        self.assertEqual(profiles["movement-controller-agent"]["allowed_action_types"], ["record_trade_actualization", "update_trade_workflow_item"])
        self.assertEqual(profiles["accounting-posting-agent"]["allowed_action_types"], [])
        self.assertEqual(profiles["accounting-posting-agent"]["authority_ceiling"], "DRAFT")

    def test_action_handler_registry_covers_all_published_action_types(self) -> None:
        self.assertEqual(set(ACTION_SPECS), set(ALL_ASSISTANT_ACTION_TYPES))
        self.assertEqual(set(ACTION_HANDLERS), set(ALL_ASSISTANT_ACTION_TYPES))
        self.assertEqual(set(ACTION_HANDLERS), set(ACTION_SPECS))

    def test_action_catalog_drives_backend_action_surfaces(self) -> None:
        catalog_names = tuple(entry.name for entry in ASSISTANT_ACTION_CATALOG)
        self.assertEqual(catalog_names, ALL_CATALOG_ACTION_TYPES)
        self.assertEqual(catalog_names, ALL_ASSISTANT_ACTION_TYPES)
        self.assertEqual(tuple(ACTION_SPECS), catalog_names)
        self.assertEqual(set(catalog_names), set(ACTION_HANDLERS))
        self.assertEqual(
            tuple(definition.name for definition in ASSISTANT_ACTION_DEFINITIONS),
            catalog_names,
        )

        action_policy_rules = {
            rule.resource_id: rule
            for rule in POLICY_RULES
            if rule.resource_type == "action"
        }
        self.assertEqual(set(action_policy_rules), set(catalog_names))
        for entry in ASSISTANT_ACTION_CATALOG:
            rule = action_policy_rules[entry.name]
            self.assertEqual(rule.policy_key, entry.policy_key)
            self.assertEqual(rule.risk_level, entry.risk_level)
            self.assertEqual(rule.max_scope, entry.max_scope)
            self.assertEqual(rule.roles, entry.reviewer_roles)
            self.assertEqual(rule.workspaces, entry.workspaces)
            self.assertEqual(rule.approval_required, entry.approval_required)

            action_spec = ACTION_SPECS[entry.name]
            self.assertIs(action_spec.catalog_entry, entry)
            self.assertEqual(action_spec.handler.action_type, entry.name)
            self.assertEqual(action_spec.planner.action_type, entry.name)

        self.assertTrue(ACTION_SPECS["issue_trade_invoice"].requires_ready_preview)
        self.assertFalse(ACTION_SPECS["cancel_trade"].requires_ready_preview)

    def test_action_planner_registry_covers_all_published_action_types(self) -> None:
        self.assertEqual(set(ACTION_PLANNERS), set(ALL_ASSISTANT_ACTION_TYPES))
        self.assertEqual(set(ACTION_PLANNERS), {planner.action_type for planner in ACTION_PLANNER_SEQUENCE})
        self.assertEqual(len(ACTION_PLANNER_SEQUENCE), len(ACTION_PLANNERS))
        self.assertEqual(set(ACTION_PLANNERS), set(ACTION_SPECS))
        self.assertEqual(
            tuple(
                spec.planner
                for spec in sorted(ACTION_SPECS.values(), key=lambda spec: spec.catalog_entry.planner_priority)
            ),
            ACTION_PLANNER_SEQUENCE,
        )
        self.assertEqual(
            tuple(planner.action_type for planner in ACTION_PLANNER_SEQUENCE),
            (
                "cancel_trade",
                "issue_trade_confirmation",
                "update_trade_workflow_item",
                "record_trade_confirmation_response",
                "issue_trade_invoice",
                "create_trade_payment",
                "reprocess_document_ingestion",
            ),
        )

    def test_admin_role_archetype_detail_normalizes_role_key(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")

        response = self.client.get(
            "/admin/assistant/role-archetypes/SETTLEMENT-COPILOT",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["role_key"], "settlement-copilot")
        self.assertEqual(payload["catalog_status"], "SEEDED")
        self.assertEqual(payload["current_profile_ids"], ["settlement-copilot"])
        self.assertEqual(payload["maximum_action_types"], ["issue_trade_invoice", "create_trade_payment"])

    def test_admin_role_archetype_detail_returns_404_for_unknown_role(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")

        response = self.client.get(
            "/admin/assistant/role-archetypes/unknown-role",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Assistant agent role archetype not found")

    def test_admin_profile_request_approval_gates_custom_agent_activation(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")

        request_response = self.client.post(
            "/admin/assistant/profile-requests",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "requested_agent_id": "weather-dispatch-analyst",
                "business_problem": "Dispatchers need weather-driven exception triage during volatile delivery windows.",
                "proposed_mission": "Explain weather exposure, summarize affected workflow items, and stage narrow follow-up when evidence supports it.",
                "human_owner_role": "Operations Lead",
                "requested_workspaces": ["assistant", "operations"],
                "work_objects": ["workflow item", "delivery window", "weather alert"],
                "requested_inputs_tools": ["list_workflow_items", "get_workspace_summary"],
                "expected_outputs": ["Exception summary", "Follow-up checklist"],
                "requested_authority_ceiling": "STAGE",
                "stop_conditions": ["Weather evidence or workflow ownership is ambiguous."],
                "success_metrics": ["Reduce manual weather exception triage time."],
                "proposed_eval_cases": ["Denied workflow update when weather evidence is stale."],
                "requested_by": "ops_user",
            },
        )

        self.assertEqual(request_response.status_code, 201)
        profile_request = request_response.json()
        self.assertEqual(profile_request["status"], "REQUESTED")
        self.assertEqual(profile_request["requested_agent_id"], "weather-dispatch-analyst")

        approve_response = self.client.post(
            f"/admin/assistant/profile-requests/{profile_request['request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "reviewed_by": "platform-owner",
                "approval_notes": "Owner and eval case reviewed for a narrow custom rollout.",
            },
        )

        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(approve_response.json()["status"], "APPROVED")

        create_response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "weather-dispatch-analyst",
                "name": "Weather Dispatch Analyst",
                "description": "Draft custom profile for weather-driven operations triage.",
                "status": "DRAFT",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "profile_kind": "CUSTOM",
                "specialization_summary": "Weather-sensitive operations exception triage.",
                "human_owner_role": "Operations Lead",
                "authority_ceiling": "STAGE",
                "activation_notes": "Approved custom profile request will gate activation.",
                "profile_request_id": profile_request["request_id"],
                "allowed_workspaces": ["assistant", "operations"],
                "capabilities": ["READ", "EXPLAIN", "ACTION"],
                "allowed_tools": ["list_workflow_items", "get_workspace_summary"],
                "allowed_action_types": ["update_trade_workflow_item"],
                "system_prompt": "Explain weather-sensitive operational blockers and stage narrow follow-up only when evidence is current.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["status"], "DRAFT")
        self.assertEqual(create_response.json()["profile_request_id"], profile_request["request_id"])

        eval_listing = self.client.get(
            "/admin/assistant/agent-evals?agent_id=weather-dispatch-analyst",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(eval_listing.status_code, 200)
        self.assertEqual(len(eval_listing.json()), 1)
        seeded_eval = eval_listing.json()[0]
        self.assertEqual(seeded_eval["name"], "Denied workflow update when weather evidence is stale.")
        self.assertEqual(seeded_eval["prompt"], "Denied workflow update when weather evidence is stale.")
        self.assertIn(f"Profile request #{profile_request['request_id']}", seeded_eval["context"])
        self.assertTrue(seeded_eval["use_live_tools"])
        self.assertEqual(seeded_eval["expected_substrings"], [])
        self.assertEqual(seeded_eval["expected_tool_names"], [])
        self.assertEqual(seeded_eval["expected_action_types"], [])

        update_response = self.client.put(
            "/admin/assistant/agents/weather-dispatch-analyst",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Weather Dispatch Analyst",
                "description": "Custom profile for weather-driven operations triage.",
                "status": "ACTIVE",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "profile_kind": "CUSTOM",
                "specialization_summary": "Weather-sensitive operations exception triage.",
                "human_owner_role": "Operations Lead",
                "authority_ceiling": "STAGE",
                "activation_notes": "Approved by platform owner after owner, eval, and prompt review.",
                "profile_request_id": profile_request["request_id"],
                "allowed_workspaces": ["assistant", "operations"],
                "capabilities": ["READ", "EXPLAIN", "ACTION"],
                "allowed_tools": ["list_workflow_items", "get_workspace_summary"],
                "allowed_action_types": ["update_trade_workflow_item"],
                "system_prompt": "Explain weather-sensitive operational blockers and stage narrow follow-up only when evidence is current.",
                "updated_by": "assistant_user",
            },
        )

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["status"], "ACTIVE")
        self.assertEqual(update_response.json()["eval_gate"]["status"], "PASS")
        self.assertGreaterEqual(update_response.json()["eval_gate"]["custom_case_count"], 1)

        request_listing = self.client.get(
            "/admin/assistant/profile-requests",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(request_listing.status_code, 200)
        self.assertEqual(request_listing.json()[0]["status"], "ACTIVATED")
        self.assertEqual(request_listing.json()[0]["linked_agent_id"], "weather-dispatch-analyst")

        with self.SessionLocal() as session:
            operation_keys = {
                row.operation_key
                for row in session.query(MutationProvenanceRecord).all()
            }
        self.assertIn("assistant_agent_profile_request.requested", operation_keys)
        self.assertIn("assistant_agent_profile_request.approved", operation_keys)
        self.assertIn("assistant_agent_eval.seeded_from_profile_request", operation_keys)
        self.assertIn("assistant_agent_profile_request.activated", operation_keys)
        self.assertIn("assistant_agent.activated", operation_keys)

    def test_admin_agent_eval_catalog_crud_flow(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")
        self._create_agent(
            agent_id="trade-eval-agent",
            name="Trade Eval Agent",
            status="DRAFT",
            allowed_workspaces=["assistant", "trades"],
            capabilities=["READ", "EXPLAIN"],
            allowed_tools=["get_trade_by_id"],
            provider="openai",
            model="gpt-5-mini",
        )

        create_response = self.client.post(
            "/admin/assistant/agent-evals",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "trade-eval-agent",
                "name": "Explains selected trade evidence",
                "workspace": "assistant",
                "prompt": "Explain selected trade T-1000 and cite the evidence.",
                "context": "Selected trade:\n- trade_id: T-1000",
                "use_live_tools": False,
                "expected_substrings": ["Trade Eval Agent"],
                "expected_tool_names": [],
                "expected_action_types": [],
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(create_response.status_code, 201)
        created_eval = create_response.json()
        self.assertEqual(created_eval["agent_id"], "trade-eval-agent")
        self.assertIsNone(created_eval["latest_run"])

        fake_service = _FakeAssistantService()
        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=fake_service,
        ):
            run_response = self.client.post(
                f"/admin/assistant/agent-evals/{created_eval['eval_id']}/run",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(run_response.status_code, 200)
        run_payload = run_response.json()
        self.assertEqual(run_payload["status"], "PASS")
        self.assertEqual(run_payload["failure_reasons"], [])
        self.assertIsNotNone(run_payload["run_id"])
        self.assertEqual(run_payload["run_by"], "assistant_user")
        self.assertEqual(fake_service.calls[0]["agent_definition"].status, "DRAFT")

        listing_response = self.client.get(
            "/admin/assistant/agent-evals?agent_id=trade-eval-agent",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(listing_response.status_code, 200)
        self.assertEqual(listing_response.json()[0]["latest_run"]["status"], "PASS")

        update_response = self.client.put(
            f"/admin/assistant/agent-evals/{created_eval['eval_id']}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Explains selected trade evidence",
                "workspace": "assistant",
                "prompt": "Explain selected trade T-1000 and cite the evidence.",
                "context": "Selected trade:\n- trade_id: T-1000",
                "use_live_tools": False,
                "expected_substrings": ["not present in the response"],
                "expected_tool_names": [],
                "expected_action_types": [],
                "updated_by": "assistant_user",
            },
        )
        self.assertEqual(update_response.status_code, 200)

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=_FakeAssistantService(),
        ):
            failed_run_response = self.client.post(
                f"/admin/assistant/agent-evals/{created_eval['eval_id']}/run",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(failed_run_response.status_code, 200)
        self.assertEqual(failed_run_response.json()["status"], "FAIL")
        self.assertEqual(
            failed_run_response.json()["failure_reasons"],
            ["Missing expected text: not present in the response"],
        )

        run_history_response = self.client.get(
            f"/admin/assistant/agent-evals/{created_eval['eval_id']}/runs",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(run_history_response.status_code, 200)
        self.assertEqual([row["status"] for row in run_history_response.json()], ["FAIL", "PASS"])

        delete_response = self.client.delete(
            f"/admin/assistant/agent-evals/{created_eval['eval_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(delete_response.status_code, 204)

        empty_listing_response = self.client.get(
            "/admin/assistant/agent-evals?agent_id=trade-eval-agent",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(empty_listing_response.status_code, 200)
        self.assertEqual(empty_listing_response.json(), [])

    def test_admin_custom_agent_activation_requires_approved_profile_request(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")

        response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "ungoverned-custom-agent",
                "name": "Ungoverned Custom Agent",
                "description": "Attempts to activate without an approved custom profile request.",
                "status": "ACTIVE",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "profile_kind": "CUSTOM",
                "specialization_summary": "Ungoverned custom activation.",
                "human_owner_role": "Operations Lead",
                "authority_ceiling": "DRAFT",
                "activation_notes": "Reviewed prompt preview.",
                "allowed_workspaces": ["assistant"],
                "capabilities": ["READ", "EXPLAIN"],
                "allowed_tools": [],
                "allowed_action_types": [],
                "system_prompt": "Summarize custom workflow context.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("custom profiles need an approved profile request", response.json()["detail"])

    def test_admin_custom_agent_stage_authority_requires_specialization_eval_case(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")

        response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "mapped-custom-governor",
                "name": "Mapped Custom Governor",
                "description": "Attempts stage authority from a role mapping without custom eval coverage.",
                "status": "ACTIVE",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "role_key": "trade-governor",
                "profile_kind": "CUSTOM",
                "specialization_summary": "Custom cancel governance.",
                "human_owner_role": "Trader, Desk Lead, or Admin",
                "authority_ceiling": "STAGE",
                "activation_notes": "Role mapping reviewed, but no specialization eval request exists.",
                "allowed_workspaces": ["assistant", "trades"],
                "capabilities": ["READ", "EXPLAIN", "ACTION"],
                "allowed_tools": ["get_trade_by_id"],
                "allowed_action_types": ["cancel_trade"],
                "system_prompt": "Review trade cancellation evidence.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("above draft-only authority need a persisted specialization-specific eval case", response.json()["detail"])

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

    def test_assistant_prompt_warns_when_openai_hits_output_limit(self) -> None:
        token = self._create_session_token()
        settings.ASSISTANT_MAX_OUTPUT_TOKENS = 128

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
                "output_text": "Partial answer cut mid-list",
                "usage": {"input_tokens": 15, "output_tokens": 128},
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
                    "messages": [
                        {"role": "user", "content": "Give me a detailed plan."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["message"]["content"], "Partial answer cut mid-list")
        self.assertIn(
            "GPT reached ASSISTANT_MAX_OUTPUT_TOKENS (128) before finishing, so the answer may be cut off.",
            payload["warnings"],
        )

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
                "daily_token_allocation": 50_000,
                "system_prompt": "Explain the current trade and call out missing context.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["status"], "DRAFT")
        self.assertIsNone(create_response.json()["role_key"])
        self.assertEqual(create_response.json()["profile_kind"], "CUSTOM")
        self.assertEqual(create_response.json()["daily_token_allocation"], 50_000)
        self.assertEqual(create_response.json()["token_budget"]["allocated_tokens"], 50_000)
        self.assertEqual(create_response.json()["token_budget"]["allocation_source"], "AGENT")
        self.assertEqual(
            [decision["resource_id"] for decision in create_response.json()["effective_policy"]["allowed_tools"]],
            [],
        )
        self.assertEqual(create_response.json()["effective_policy"]["allowed_actions"], [])
        self.assertEqual(
            {
                decision["resource_id"]
                for decision in create_response.json()["effective_policy"]["blocked_actions"]
            },
            {
                "cancel_trade",
                "issue_trade_confirmation",
                "record_trade_confirmation_response",
                "update_trade_workflow_item",
                "issue_trade_invoice",
                "create_trade_payment",
                "reprocess_document_ingestion",
            },
        )
        self.assertEqual(create_response.json()["allowed_tools"], [])
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
                "role_key": "trade-explainer",
                "profile_kind": "ROLE_DERIVED",
                "specialization_summary": "Role-derived profile for trade explanations.",
                "human_owner_role": "Trader",
                "authority_ceiling": "EXPLAIN",
                "activation_notes": "Created from the role catalog preset.",
                "allowed_workspaces": ["assistant", "trades"],
                "capabilities": ["READ", "EXPLAIN"],
                "daily_token_allocation": 40_000,
                "system_prompt": "Explain the trade and draft next-step suggestions.",
                "updated_by": "assistant_user",
            },
        )

        self.assertEqual(update_response.status_code, 200)
        updated_payload = update_response.json()
        self.assertEqual(updated_payload["status"], "ACTIVE")
        self.assertEqual(updated_payload["version"], 2)
        self.assertEqual(updated_payload["role_key"], "trade-explainer")
        self.assertEqual(updated_payload["profile_kind"], "ROLE_DERIVED")
        self.assertEqual(updated_payload["specialization_summary"], "Role-derived profile for trade explanations.")
        self.assertEqual(updated_payload["human_owner_role"], "Trader")
        self.assertEqual(updated_payload["authority_ceiling"], "EXPLAIN")
        self.assertEqual(updated_payload["activation_notes"], "Created from the role catalog preset.")
        self.assertEqual(updated_payload["daily_token_allocation"], 40_000)
        self.assertEqual(updated_payload["token_budget"]["allocated_tokens"], 40_000)
        self.assertEqual(
            updated_payload["allowed_tools"],
            [
                "get_trade_by_id",
                "list_trade_events",
                "get_trade_workbench",
                "list_positions",
                "get_market_context",
                "search_reference_data",
                "get_workspace_summary",
            ],
        )
        self.assertEqual(updated_payload["allowed_action_types"], [])
        self.assertEqual(updated_payload["eval_gate"]["status"], "PASS")
        self.assertIn("Grounded trade explanation.", updated_payload["eval_gate"]["covered_cases"])

        admin_listing = self.client.get(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(admin_listing.status_code, 200)
        self.assertEqual(len(admin_listing.json()), 1)
        self.assertEqual(admin_listing.json()[0]["system_prompt"], "Explain the trade and draft next-step suggestions.")
        self.assertEqual(admin_listing.json()[0]["role_key"], "trade-explainer")
        self.assertEqual(admin_listing.json()[0]["profile_kind"], "ROLE_DERIVED")

        public_listing = self.client.get("/assistant/agents")
        self.assertEqual(public_listing.status_code, 200)
        self.assertEqual([row["agent_id"] for row in public_listing.json()], ["trade-explainer"])
        self.assertEqual(public_listing.json()[0]["role_key"], "trade-explainer")
        self.assertEqual(public_listing.json()[0]["profile_kind"], "ROLE_DERIVED")
        self.assertEqual(public_listing.json()[0]["token_budget"]["status"], "GREEN")
        self.assertEqual(public_listing.json()[0]["daily_token_allocation"], 40_000)
        self.assertEqual(public_listing.json()[0]["token_budget"]["allocated_tokens"], 40_000)
        self.assertGreaterEqual(len(public_listing.json()[0]["effective_policy"]["allowed_tools"]), 1)

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

    def test_admin_self_update_draft_generates_reviewable_agent_revision_from_learning_signals(self) -> None:
        token = self._create_session_token()
        captured_request: dict[str, object] = {}
        now = datetime.now(timezone.utc)
        self._create_agent(
            agent_id="noisy-agent",
            name="Noisy Agent",
            status="ACTIVE",
            allowed_workspaces=["assistant", "operations"],
            capabilities=["READ", "EXPLAIN", "ACTION"],
            allowed_tools=["list_workflow_items", "get_trade_workbench"],
            allowed_action_types=["update_trade_workflow_item"],
            provider="openai",
            model="gpt-5-mini",
            role_key="trade-ops-copilot",
            profile_kind="ROLE_DERIVED",
            specialization_summary="Workflow triage specialist.",
            human_owner_role="Operations Lead",
            authority_ceiling="STAGE",
            activation_notes="Prompt reviewed for staged workflow work.",
        )
        with self.SessionLocal() as session:
            run = AssistantRun(
                conversation_id=None,
                status="COMPLETED",
                user_id="ops_alpha",
                session_id="self-update-session",
                user_role="OPS_ADMIN",
                workspace="operations",
                agent_id="noisy-agent",
                agent_name="Noisy Agent",
                agent_role_key="trade-ops-copilot",
                agent_profile_kind="ROLE_DERIVED",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=False,
                request_messages=[{"role": "user", "content": "Review the queue."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=[],
                tool_calls=[],
                input_tokens=50,
                output_tokens=20,
                latest_user_message="Review the queue.",
                assistant_message="Staged a workflow update without citing the owner.",
                error_detail=None,
                created_at=now - timedelta(hours=2),
                completed_at=now - timedelta(hours=2),
            )
            eval_record = AssistantAgentEval(
                agent_id="noisy-agent",
                name="Queue owner coverage",
                workspace="operations",
                prompt="Who owns the blocked workflow item and what should happen next?",
                context=None,
                use_live_tools=True,
                expected_substrings=["owner"],
                expected_tool_names=["list_workflow_items"],
                expected_action_types=["update_trade_workflow_item"],
                created_at=now - timedelta(days=1),
                created_by="ops_admin",
                updated_at=now - timedelta(days=1),
                updated_by="ops_admin",
            )
            session.add_all([run, eval_record])
            session.flush()
            session.add(
                AssistantRunFeedback(
                    run_id=run.id,
                    conversation_id=None,
                    user_id="ops_alpha",
                    session_id="self-update-session",
                    user_role="OPS_ADMIN",
                    rating="NEEDS_WORK",
                    comment="Surface the queue owner before staging workflow updates.",
                    created_at=now - timedelta(minutes=45),
                    updated_at=now - timedelta(minutes=45),
                )
            )
            session.add(
                AssistantAgentEvalRun(
                    eval_id=eval_record.id,
                    agent_id="noisy-agent",
                    run_id=None,
                    status="FAIL",
                    failure_reasons=["Did not identify the workflow owner before proposing the action."],
                    observed_tool_names=["list_workflow_items"],
                    observed_action_types=["update_trade_workflow_item"],
                    response_message="A workflow update should be staged.",
                    started_at=now - timedelta(minutes=20),
                    completed_at=now - timedelta(minutes=19),
                    run_by="ops_admin",
                )
            )
            session.commit()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            captured_request["url"] = url
            captured_request["headers"] = headers
            captured_request["payload"] = payload
            captured_request["provider_label"] = provider_label
            return {
                "output_text": json.dumps(
                    {
                        "description": "Stages workflow work only after naming the queue owner and evidence.",
                        "allowed_workspaces": ["assistant", "operations"],
                        "capabilities": ["READ", "EXPLAIN"],
                        "allowed_tools": ["list_workflow_items"],
                        "allowed_action_types": [],
                        "system_prompt": "Name the queue owner, cite the evidence, and stop instead of staging when ownership is unclear.",
                        "change_summary": [
                            "Removed ACTION so the agent can explain and draft without staging unsupported workflow changes.",
                            "Strengthened the prompt to require queue-owner evidence before proposing next steps.",
                        ],
                    }
                ),
                "usage": {"input_tokens": 120, "output_tokens": 60},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/admin/assistant/agents/noisy-agent/self-update-draft",
                headers={"Authorization": f"Bearer {token}"},
                json={"brief": "Focus on missing queue-owner evidence and over-eager staging."},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["agent_id"], "noisy-agent")
        self.assertEqual(payload["status"], "ACTIVE")
        self.assertEqual(payload["scope"], "TEAM")
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["model"], "gpt-5-mini")
        self.assertEqual(payload["capabilities"], ["READ", "EXPLAIN"])
        self.assertEqual(payload["allowed_tools"], ["list_workflow_items"])
        self.assertEqual(payload["allowed_action_types"], [])
        self.assertEqual(payload["builder_provider"], "openai")
        self.assertEqual(payload["builder_model"], "gpt-5")
        self.assertEqual(len(payload["change_summary"]), 2)
        self.assertIn("queue owner", payload["evidence"]["recent_needs_work_feedback"][0])
        self.assertIn("Queue owner coverage", payload["evidence"]["failing_eval_cases"][0])
        self.assertIn("Focus on missing queue-owner evidence", payload["source_brief"])
        self.assertEqual(payload["warnings"], [])

        request_payload = captured_request["payload"]
        assert isinstance(request_payload, dict)
        self.assertEqual(captured_request["provider_label"], "OpenAI Agent Self Update")
        self.assertEqual(captured_request["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(request_payload["model"], "gpt-5")
        self.assertEqual(request_payload["text"]["format"]["name"], "assistant_agent_self_update_draft")
        self.assertIn("Surface the queue owner before staging workflow updates.", request_payload["input"])
        self.assertIn("Did not identify the workflow owner", request_payload["input"])
        self.assertIn("Do not expand allowed workspaces, capabilities, live tools, or governed actions.", request_payload["input"])

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
            role_key="ops-coordinator",
            profile_kind="ROLE_DERIVED",
            specialization_summary="Role-derived profile for operations analysis.",
            human_owner_role="Operations Lead",
            authority_ceiling="EXPLAIN",
            activation_notes="Created from the role catalog preset.",
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
        self.assertEqual(payload["agent_role_key"], "ops-coordinator")
        self.assertEqual(payload["agent_profile_kind"], "ROLE_DERIVED")
        self.assertEqual(payload["message"]["content"], "Ops Analyst: Summarize the current operations posture.")
        agent_definition = fake_service.calls[0]["agent_definition"]
        self.assertIsNotNone(agent_definition)
        self.assertEqual(agent_definition.agent_id, "ops-analyst")
        self.assertEqual(agent_definition.role_key, "ops-coordinator")
        self.assertEqual(agent_definition.profile_kind, "ROLE_DERIVED")
        self.assertEqual(agent_definition.human_owner_role, "Operations Lead")
        self.assertEqual(agent_definition.authority_ceiling, "EXPLAIN")
        self.assertEqual(agent_definition.allowed_workspaces, ("assistant", "admin"))
        prompt_context = fake_service.calls[0]["prompt_context"]
        self.assertEqual(prompt_context.agent_role_key, "ops-coordinator")
        self.assertEqual(prompt_context.agent_profile_kind, "ROLE_DERIVED")
        agent_section = next(section for section in prompt_context.sections if section.key == "managed-agent")
        self.assertIn("role_key: ops-coordinator", agent_section.content)
        self.assertIn("profile_kind: ROLE_DERIVED", agent_section.content)

        run_response = self.client.get(
            f"/assistant/runs/{payload['run_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(run_response.status_code, 200)
        run_payload = run_response.json()
        self.assertEqual(run_payload["agent_role_key"], "ops-coordinator")
        self.assertEqual(run_payload["agent_profile_kind"], "ROLE_DERIVED")

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
        action_request = payload["action_requests"][0]
        self.assertEqual(action_request["status"], "PENDING")
        self.assertEqual(action_request["action_type"], "cancel_trade")
        self.assertEqual(action_request["payload"], {"trade_id": "T-1007"})
        self.assertEqual(action_request["lifecycle"]["stage"], "AWAITING_REVIEW")
        self.assertEqual(action_request["lifecycle"]["label"], "Awaiting review")
        self.assertEqual(action_request["lifecycle"]["tone"], "attention")
        self.assertFalse(action_request["lifecycle"]["is_terminal"])
        self.assertTrue(action_request["lifecycle"]["can_approve"])
        self.assertTrue(action_request["lifecycle"]["can_reject"])

        review_context = action_request["review_context"]
        self.assertEqual(review_context["owning_work_object"], {"type": "trade", "id": "T-1007", "label": "Trade T-1007"})
        self.assertEqual(review_context["required_reviewer_role"], "TRADER_OR_DESK_LEAD")
        self.assertIn("Trade T-1007 was identified", review_context["business_rationale"])
        self.assertEqual(
            review_context["proposed_mutation"],
            {"operation": "cancel_trade", "trade_id": "T-1007", "status": "CANCELLED"},
        )
        self.assertEqual(review_context["stale_state_basis"]["status"], "ACTIVE")
        self.assertEqual(review_context["stale_state_basis"]["last_event_id"], "evt-t-1007")
        self.assertIn("Create a TradeCancelled event.", review_context["expected_downstream_effects"])
        self.assertEqual(review_context["idempotency_key"], "assistant-action:cancel_trade:T-1007:evt-t-1007")
        self.assertEqual(review_context["execution_mode"], "REVIEW_REQUIRED")
        self.assertIn("STALE_STATE_RECHECK_REQUIRED", action_request["lifecycle"]["review_risk_flags"])

        prompt_context = fake_service.calls[0]["prompt_context"]
        approval_section = next(
            section for section in prompt_context.sections if section.key == "approval-gated-action"
        )
        self.assertIn("payload: {'trade_id': 'T-1007'}", approval_section.content)
        self.assertNotIn("review_context", approval_section.content)

        with self.SessionLocal() as session:
            record = session.query(AssistantActionRequest).one()
            self.assertIn("review_context", record.payload)
            stored_review_context = dict(review_context)
            stored_review_context.pop("action_preview", None)
            stored_review_context.pop("autonomous_execution_reason", None)
            stored_review_context.pop("delegated_ability_override_reason", None)
            self.assertEqual(record.payload["review_context"], stored_review_context)

    def test_execute_capable_agent_autonomously_executes_cancel_trade_action(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1010")
        self._create_agent(
            agent_id="trade-captain-auto",
            name="Trade Captain Auto",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["ACTION", "EXPLAIN"],
            allowed_action_types=["cancel_trade"],
            provider="openai",
            model="gpt-5-mini",
            authority_ceiling="EXECUTE",
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
                    "agent_id": "trade-captain-auto",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1010\n- commodity: WTI",
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": "Cancel the selected trade."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["action_requests"]), 1)
        action_request = payload["action_requests"][0]
        self.assertEqual(action_request["status"], "EXECUTED")
        self.assertEqual(action_request["lifecycle"]["stage"], "EXECUTED")
        self.assertEqual(action_request["review_context"]["execution_mode"], "AUTONOMOUS")
        self.assertIn(
            "typed services",
            action_request["review_context"]["autonomous_execution_reason"],
        )
        self.assertIn("Governed action update:", payload["message"]["content"])
        self.assertIn("Cancel trade T-1010", payload["message"]["content"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1010")
            self.assertIsNotNone(trade)
            assert trade is not None
            self.assertEqual(trade.status, "CANCELLED")

            record = session.query(AssistantActionRequest).one()
            self.assertEqual(record.status, "EXECUTED")
            self.assertEqual(record.decided_by, "trade-captain-auto")

    def test_assistant_agent_listing_marks_depleted_token_budget_red(self) -> None:
        settings.ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION = 20
        self._create_agent(
            agent_id="budget-runner",
            name="Budget Runner",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["READ", "EXPLAIN"],
            provider="openai",
            model="gpt-5-mini",
        )
        self._create_assistant_run(agent_id="budget-runner", input_tokens=12, output_tokens=8)

        response = self.client.get("/assistant/agents")

        self.assertEqual(response.status_code, 200)
        budget = response.json()[0]["token_budget"]
        self.assertEqual(budget["status"], "RED")
        self.assertEqual(budget["allocated_tokens"], 20)
        self.assertEqual(budget["used_tokens"], 20)
        self.assertEqual(budget["remaining_tokens"], 0)
        self.assertEqual(budget["percent_used"], 100.0)
        self.assertEqual(budget["allocation_source"], "DEFAULT")
        self.assertEqual(budget["warning_threshold_percent"], 80.0)
        self.assertIn("window_started_at", budget)

    def test_assistant_agent_listing_marks_near_depleted_token_budget_amber(self) -> None:
        self._create_agent(
            agent_id="budget-watch",
            name="Budget Watch",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["READ", "EXPLAIN"],
            provider="openai",
            model="gpt-5-mini",
            daily_token_allocation=50,
        )
        self._create_assistant_run(agent_id="budget-watch", input_tokens=30, output_tokens=10)

        response = self.client.get("/assistant/agents")

        self.assertEqual(response.status_code, 200)
        budget = response.json()[0]["token_budget"]
        self.assertEqual(budget["status"], "AMBER")
        self.assertEqual(budget["allocated_tokens"], 50)
        self.assertEqual(budget["used_tokens"], 40)
        self.assertEqual(budget["remaining_tokens"], 10)
        self.assertEqual(budget["percent_used"], 80.0)
        self.assertEqual(budget["allocation_source"], "AGENT")

    def test_assistant_prompt_rejects_agent_with_depleted_token_budget(self) -> None:
        settings.ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION = 20
        token = self._create_session_token()
        self._create_agent(
            agent_id="budget-runner",
            name="Budget Runner",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["READ", "EXPLAIN"],
            provider="openai",
            model="gpt-5-mini",
        )
        self._create_assistant_run(agent_id="budget-runner", input_tokens=12, output_tokens=8)
        fake_service = _FakeAssistantService()

        preview_response = self.client.post(
            "/assistant/context",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "budget-runner",
                "workspace": "assistant",
            },
        )
        self.assertEqual(preview_response.status_code, 200)
        self.assertEqual(preview_response.json()["agent_id"], "budget-runner")

        with patch(
            "apps.api.app.routes.assistant.get_assistant_service",
            return_value=fake_service,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "agent_id": "budget-runner",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "Can you still answer?"},
                    ],
                },
            )

        self.assertEqual(response.status_code, 429)
        self.assertIn("in the red", response.json()["detail"])
        self.assertEqual(fake_service.calls, [])

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

    def test_admin_agent_create_rejects_action_capability_without_explicit_actions(self) -> None:
        token = self._create_session_token()

        response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "trade-governor-empty-actions",
                "name": "Trade Governor Empty Actions",
                "description": "Attempts action authority without an explicit action allowlist.",
                "status": "DRAFT",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "role_key": "trade-governor",
                "profile_kind": "ROLE_DERIVED",
                "allowed_workspaces": ["assistant", "trades"],
                "capabilities": ["READ", "EXPLAIN", "ACTION"],
                "allowed_tools": [],
                "allowed_action_types": [],
                "system_prompt": "Review trade state before recommending actions.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("must declare explicit allowed_action_types", response.json()["detail"])

    def test_admin_agent_create_rejects_role_profile_expansion(self) -> None:
        token = self._create_session_token()

        response = self.client.post(
            "/admin/assistant/agents",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "agent_id": "trade-explainer-expanded",
                "name": "Trade Explainer Expanded",
                "description": "Attempts to expand beyond the trade explainer role.",
                "status": "DRAFT",
                "scope": "TEAM",
                "provider": "openai",
                "model": "gpt-5-mini",
                "role_key": "trade-explainer",
                "profile_kind": "ROLE_DERIVED",
                "authority_ceiling": "DRAFT",
                "allowed_workspaces": ["assistant", "settlement"],
                "capabilities": ["READ", "EXPLAIN"],
                "allowed_tools": ["list_trade_invoices"],
                "allowed_action_types": [],
                "system_prompt": "Explain the selected trade state.",
                "created_by": "assistant_user",
            },
        )

        self.assertEqual(response.status_code, 400)
        detail = response.json()["detail"]
        self.assertIn("allowed_workspaces exceeds role trade-explainer", detail)
        self.assertIn("allowed_tools exceeds role trade-explainer", detail)
        self.assertIn("authority ceiling DRAFT exceeds role trade-explainer ceiling EXPLAIN", detail)

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

    def test_assistant_prompt_blocks_action_staging_when_policy_scope_exceeded(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1014P")
        self._create_agent(
            agent_id="org-action-agent",
            name="Org Action Agent",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["ACTION", "EXPLAIN"],
            scope="ORGANIZATION",
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
                    "agent_id": "org-action-agent",
                    "workspace": "assistant",
                    "context": "Selected trade:\n- trade_id: T-1014P\n- commodity: WTI",
                    "use_live_tools": False,
                    "messages": [
                        {"role": "user", "content": "Cancel the selected trade."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action_requests"], [])
        prompt_context = fake_service.calls[0]["prompt_context"]
        self.assertIsNotNone(prompt_context)
        self.assertIn(
            "Org Action Agent scope ORGANIZATION exceeds policy max scope TEAM.",
            prompt_context.warnings,
        )

        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantActionRequest).count(), 0)

    def test_admin_policy_simulation_stages_actions_without_persisting_requests(self) -> None:
        token = self._create_session_token(role="OPS_ADMIN")
        self._create_trade_with_event(trade_id="T-1022")
        self._create_agent(
            agent_id="sim-governor",
            name="Simulation Governor",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["READ", "EXPLAIN", "ACTION"],
            allowed_tools=["get_trade_by_id"],
            allowed_action_types=["cancel_trade"],
            provider="openai",
            model="gpt-5-mini",
        )

        response = self.client.post(
            "/admin/assistant/agents/sim-governor/policy-simulation",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "workspace": "assistant",
                "phase": "stage",
                "actor_role": "OPS_ADMIN",
                "context": "Selected trade:\n- trade_id: T-1022\n- commodity: WTI",
                "prompt": "Cancel the selected trade.",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["agent_id"], "sim-governor")
        self.assertEqual(payload["workspace"], "assistant")
        self.assertEqual(payload["phase"], "stage")
        self.assertEqual(payload["actor_role"], "OPS_ADMIN")
        self.assertEqual(
            [decision["resource_id"] for decision in payload["allowed_tools"]],
            ["get_trade_by_id"],
        )
        self.assertEqual(
            [decision["resource_id"] for decision in payload["allowed_actions"]],
            ["cancel_trade"],
        )
        self.assertEqual(len(payload["staged_action_proposals"]), 1)
        self.assertEqual(payload["staged_action_proposals"][0]["action_type"], "cancel_trade")
        self.assertTrue(payload["staged_action_proposals"][0]["decision"]["allowed"])
        self.assertEqual(payload["staging_warnings"], [])
        self.assertIn("Simulation is read-only", payload["simulation_notes"][0])

        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantActionRequest).count(), 0)

    def test_admin_policy_simulation_rechecks_execute_actor_role(self) -> None:
        admin_token = self._create_session_token(role="OPS_ADMIN")
        trader_token = self._create_session_token(user_id="desk_trader", role="TRADER")
        self._create_agent(
            agent_id="sim-executor",
            name="Simulation Executor",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["ACTION"],
            allowed_action_types=["cancel_trade"],
            provider="openai",
            model="gpt-5-mini",
        )

        response = self.client.post(
            "/admin/assistant/agents/sim-executor/policy-simulation",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "workspace": "assistant",
                "phase": "execute",
                "actor_role": "TRADER",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        cancel_decision = next(
            decision
            for decision in payload["blocked_actions"]
            if decision["resource_id"] == "cancel_trade"
        )
        self.assertEqual(cancel_decision["reason"], "TRADER cannot execute cancel_trade.")

        non_admin_response = self.client.post(
            "/admin/assistant/agents/sim-executor/policy-simulation",
            headers={"Authorization": f"Bearer {trader_token}"},
            json={"workspace": "assistant", "phase": "stage"},
        )
        self.assertEqual(non_admin_response.status_code, 403)

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
        self.assertEqual(payload["lifecycle"]["stage"], "EXECUTED")
        self.assertEqual(payload["lifecycle"]["tone"], "success")
        self.assertTrue(payload["lifecycle"]["is_terminal"])
        self.assertFalse(payload["lifecycle"]["can_approve"])
        self.assertFalse(payload["lifecycle"]["can_reject"])
        self.assertEqual(payload["lifecycle"]["decided_label"], "Executed by assistant_user")
        self.assertEqual(payload["result"]["trade_id"], "T-1008")
        self.assertEqual(payload["result"]["trade_status"], "CANCELLED")
        self.assertEqual(
            payload["result"]["approval_policy"]["idempotency_key"],
            "assistant-action:cancel_trade:T-1008:evt-t-1008",
        )
        self.assertEqual(payload["result"]["approval_policy"]["stale_state_mismatches"], [])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008")
            assert trade is not None
            self.assertEqual(trade.status, "CANCELLED")
            cancelled_events = session.query(Event).filter(Event.event_type == "TradeCancelled").count()
            self.assertEqual(cancelled_events, 1)

    def test_assistant_action_request_approval_records_reviewer_corrections(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008C",
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "review_outcome": "APPROVED_WITH_CORRECTIONS",
                "decision_note": "Approved after correcting reviewer context.",
                "correction_summary": "Updated the rationale before execution.",
                "correction_fields": ["business_rationale", "business_rationale", "supporting_records"],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["review_outcome"], "APPROVED_WITH_CORRECTIONS")
        self.assertEqual(payload["decision_note"], "Approved after correcting reviewer context.")
        self.assertEqual(payload["correction_summary"], "Updated the rationale before execution.")
        self.assertEqual(payload["correction_fields"], ["business_rationale", "supporting_records"])

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, action_request_id)
            assert record is not None
            self.assertEqual(record.review_outcome, "APPROVED_WITH_CORRECTIONS")
            self.assertEqual(record.decision_note, "Approved after correcting reviewer context.")
            self.assertEqual(record.correction_summary, "Updated the rationale before execution.")
            self.assertEqual(record.correction_fields, ["business_rationale", "supporting_records"])

    def test_assistant_action_request_approval_requires_correction_detail(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008M",
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
            json={"review_outcome": "APPROVED_WITH_CORRECTIONS"},
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("correction summary", response.json()["detail"])

    def test_assistant_action_request_approval_blocks_replayed_idempotency_key(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008R",
        )

        with self.SessionLocal() as session:
            original = session.get(AssistantActionRequest, action_request_id)
            assert original is not None
            duplicate = AssistantActionRequest(
                run_id=original.run_id,
                status="PENDING",
                user_id=original.user_id,
                session_id=original.session_id,
                workspace=original.workspace,
                agent_id=original.agent_id,
                agent_name=original.agent_name,
                action_type=original.action_type,
                summary=original.summary,
                description=original.description,
                payload=dict(original.payload or {}),
                result=None,
                error_detail=None,
                created_at=original.created_at,
                decided_at=None,
                decided_by=None,
            )
            session.add(duplicate)
            session.commit()
            duplicate_action_request_id = duplicate.id

        first_response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(first_response.json()["status"], "EXECUTED")

        replay_response = self.client.post(
            f"/assistant/action-requests/{duplicate_action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(replay_response.status_code, 200)
        replay_payload = replay_response.json()
        self.assertEqual(replay_payload["status"], "FAILED")
        self.assertIn("idempotency key", replay_payload["error_detail"])

        with self.SessionLocal() as session:
            cancelled_events = (
                session.query(Event)
                .filter(Event.aggregate_id == "T-1008R", Event.event_type == "TradeCancelled")
                .count()
            )
            self.assertEqual(cancelled_events, 1)

    def test_assistant_action_request_approval_requires_review_context(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008M",
        )

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, action_request_id)
            assert record is not None
            record.payload = {"trade_id": "T-1008M"}
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("requires review_context", payload["error_detail"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008M")
            assert trade is not None
            self.assertEqual(trade.status, "ACTIVE")
            cancelled_events = (
                session.query(Event)
                .filter(Event.aggregate_id == "T-1008M", Event.event_type == "TradeCancelled")
                .count()
            )
            self.assertEqual(cancelled_events, 0)

    def test_assistant_action_request_approval_requires_stale_state_basis(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008B",
        )

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, action_request_id)
            assert record is not None
            payload = dict(record.payload or {})
            review_context = dict(payload.get("review_context") or {})
            review_context["stale_state_basis"] = {}
            payload["review_context"] = review_context
            record.payload = payload
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("requires review_context.stale_state_basis", payload["error_detail"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008B")
            assert trade is not None
            self.assertEqual(trade.status, "ACTIVE")
            cancelled_events = (
                session.query(Event)
                .filter(Event.aggregate_id == "T-1008B", Event.event_type == "TradeCancelled")
                .count()
            )
            self.assertEqual(cancelled_events, 0)

    def test_assistant_action_request_approval_blocks_stale_review_context(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008S",
        )

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008S")
            assert trade is not None
            trade.last_event_id = "evt-t-1008s-amended"
            trade.updated_at = datetime.now(timezone.utc)
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("staged review context is stale", payload["error_detail"])
        self.assertIn("last_event_id", payload["error_detail"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008S")
            assert trade is not None
            self.assertEqual(trade.status, "ACTIVE")
            cancelled_events = (
                session.query(Event)
                .filter(Event.aggregate_id == "T-1008S", Event.event_type == "TradeCancelled")
                .count()
            )
            self.assertEqual(cancelled_events, 0)

    def test_assistant_action_request_approval_blocks_stale_confirmation_issue(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1014S")
        self._seed_confirmation_record(
            trade_id="T-1014S",
            confirmation_id=140,
            status="PENDING",
            issue_count=0,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected confirmation:\n"
                "- confirmation_id: 140\n"
                "- issue_method: EMAIL\n"
                "- issue_recipient: confirmations@acme.example\n"
            ),
            message="Issue this confirmation.",
        )

        with self.SessionLocal() as session:
            confirmation = session.get(TradeConfirmation, 140)
            assert confirmation is not None
            confirmation.status = "SENT"
            confirmation.issue_count = 1
            confirmation.version += 1
            confirmation.updated_at = datetime.now(timezone.utc)
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("staged review context is stale", payload["error_detail"])
        self.assertIn("issue_count", payload["error_detail"])

        with self.SessionLocal() as session:
            confirmation = session.get(TradeConfirmation, 140)
            assert confirmation is not None
            self.assertEqual(confirmation.issue_count, 1)

    def test_assistant_action_request_approval_blocks_stale_confirmation_response(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1015S")
        self._seed_confirmation_record(
            trade_id="T-1015S",
            confirmation_id=150,
            status="SENT",
            issue_count=1,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected confirmation:\n"
                "- confirmation_id: 150\n"
                "- action: COUNTERPARTY_CONFIRMED\n"
                "- response_method: EMAIL\n"
            ),
            message="Record this confirmation as confirmed.",
        )

        with self.SessionLocal() as session:
            confirmation = session.get(TradeConfirmation, 150)
            assert confirmation is not None
            confirmation.status = "DISPUTED"
            confirmation.receipt_status = "COUNTERPARTY_DISPUTED"
            confirmation.version += 1
            confirmation.updated_at = datetime.now(timezone.utc)
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("staged review context is stale", payload["error_detail"])
        self.assertIn("receipt_status", payload["error_detail"])

        with self.SessionLocal() as session:
            confirmation = session.get(TradeConfirmation, 150)
            assert confirmation is not None
            self.assertEqual(confirmation.status, "DISPUTED")
            self.assertEqual(confirmation.receipt_status, "COUNTERPARTY_DISPUTED")

    def test_assistant_action_request_approval_rechecks_agent_action_policy(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008P",
        )

        with self.SessionLocal() as session:
            agent = session.get(AssistantAgent, "trade-captain")
            assert agent is not None
            agent.allowed_action_types = ["update_trade_workflow_item"]
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("does not allow cancel_trade", response.json()["detail"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008P")
            assert trade is not None
            self.assertEqual(trade.status, "ACTIVE")
            cancelled_events = (
                session.query(Event)
                .filter(Event.aggregate_id == "T-1008P", Event.event_type == "TradeCancelled")
                .count()
            )
            self.assertEqual(cancelled_events, 0)

    def test_assistant_action_request_approval_rechecks_reviewer_role_policy(self) -> None:
        token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1008R",
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("TRADER cannot execute cancel_trade", response.json()["detail"])

        with self.SessionLocal() as session:
            trade = session.get(Trade, "T-1008R")
            assert trade is not None
            self.assertEqual(trade.status, "ACTIVE")
            cancelled_events = (
                session.query(Event)
                .filter(Event.aggregate_id == "T-1008R", Event.event_type == "TradeCancelled")
                .count()
            )
            self.assertEqual(cancelled_events, 0)

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

    def test_assistant_action_request_approval_accepts_idempotent_workflow_retry(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1016R")
        self._seed_workflow_item_record(
            trade_id="T-1016R",
            item_id=161,
            workflow_type="CONFIRMATION",
            status="PENDING",
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected workflow item:\n"
                "- item_id: 161\n"
                "- status: CONFIRMED\n"
            ),
            message="Update workflow item 161 to confirmed.",
        )

        with self.SessionLocal() as session:
            workflow_item = session.get(TradeWorkflowItem, 161)
            assert workflow_item is not None
            workflow_item.status = "CONFIRMED"
            workflow_item.version += 1
            workflow_item.updated_at = datetime.now(timezone.utc)
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertTrue(payload["result"]["approval_policy"]["idempotent_retry_rechecked"])
        self.assertGreaterEqual(len(payload["result"]["approval_policy"]["stale_state_mismatches"]), 1)

        with self.SessionLocal() as session:
            workflow_item = session.get(TradeWorkflowItem, 161)
            assert workflow_item is not None
            self.assertEqual(workflow_item.status, "CONFIRMED")
            self.assertEqual(workflow_item.version, 2)

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
        self.assertIn("DRY_RUN_PREVIEW_READY", action_request["lifecycle"]["review_risk_flags"])

        review_context = action_request["review_context"]
        preview = review_context["action_preview"]
        self.assertEqual(preview["preview_type"], "issue_trade_invoice")
        self.assertEqual(preview["status"], "READY")
        self.assertEqual(preview["existing_invoice_count"], 0)
        self.assertIn("INV-T-1017", preview["summary"])
        self.assertIn("USD 2500.00", preview["summary"])
        preview_fields = {change["field"]: change for change in preview["field_changes"]}
        self.assertEqual(preview_fields["invoice_number"]["proposed_value"], "INV-T-1017")
        self.assertEqual(preview_fields["invoice_amount"]["proposed_value"], 2500.0)
        self.assertIn("Create one trade invoice record.", preview["expected_side_effects"])

        with self.SessionLocal() as session:
            invoice_count = session.query(TradeInvoice).filter(TradeInvoice.trade_id == "T-1017").count()
            self.assertEqual(invoice_count, 0)

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "EXECUTED")
        self.assertEqual(payload["result"]["trade_id"], "T-1017")
        self.assertEqual(payload["result"]["status"], "ISSUED")
        self.assertEqual(payload["result"]["approval_policy"]["action_preview_status"], "READY")
        self.assertIn("action_preview_ready", payload["result"]["approval_policy"]["checks"])

        with self.SessionLocal() as session:
            invoice = session.query(TradeInvoice).filter(TradeInvoice.trade_id == "T-1017").one()
            self.assertEqual(invoice.invoice_number, "INV-T-1017")
            self.assertEqual(float(invoice.invoice_amount), 2500.0)

    def test_assistant_action_request_invoice_preview_blocks_duplicate_invoice_number(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1017P")
        self._seed_invoice_record(
            trade_id="T-1017P",
            invoice_id=172,
            invoice_number="INV-T-1017P",
            invoice_amount=500.0,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected trade:\n"
                "- trade_id: T-1017P\n"
                "- invoice_number: INV-T-1017P\n"
                "- invoice_amount: 2500\n"
            ),
            message="Issue invoice for this trade.",
        )

        self.assertEqual(action_request["action_type"], "issue_trade_invoice")
        self.assertEqual(action_request["status"], "PENDING")
        self.assertEqual(action_request["lifecycle"]["label"], "Preview blocked")
        self.assertEqual(action_request["lifecycle"]["tone"], "danger")
        self.assertFalse(action_request["lifecycle"]["can_approve"])
        self.assertTrue(action_request["lifecycle"]["can_reject"])
        self.assertIn("DRY_RUN_PREVIEW_BLOCKED", action_request["lifecycle"]["review_risk_flags"])

        preview = action_request["review_context"]["action_preview"]
        self.assertEqual(preview["status"], "BLOCKED")
        self.assertEqual(preview["existing_invoice_count"], 1)
        self.assertEqual(preview["expected_side_effects"], [])
        self.assertTrue(
            any("already in use" in reason for reason in preview["blocking_reasons"]),
            preview["blocking_reasons"],
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("preview is not ready", payload["error_detail"])
        self.assertIn("already in use", payload["error_detail"])

        with self.SessionLocal() as session:
            invoice_count = (
                session.query(TradeInvoice)
                .filter(
                    TradeInvoice.trade_id == "T-1017P",
                    TradeInvoice.invoice_number == "INV-T-1017P",
                )
                .count()
            )
            self.assertEqual(invoice_count, 1)

    def test_assistant_action_request_approval_requires_invoice_preview(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1017M")

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected trade:\n"
                "- trade_id: T-1017M\n"
                "- invoice_number: INV-T-1017M\n"
                "- invoice_amount: 2500\n"
            ),
            message="Issue invoice for this trade.",
        )

        with self.SessionLocal() as session:
            record = session.get(AssistantActionRequest, action_request["action_request_id"])
            assert record is not None
            record_payload = dict(record.payload)
            review_context = dict(record_payload["review_context"])
            review_context.pop("action_preview")
            record_payload["review_context"] = review_context
            record.payload = record_payload
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("requires a ready issue_trade_invoice preview", payload["error_detail"])

        with self.SessionLocal() as session:
            invoice_count = session.query(TradeInvoice).filter(TradeInvoice.trade_id == "T-1017M").count()
            self.assertEqual(invoice_count, 0)

    def test_assistant_action_request_approval_blocks_invoice_when_invoice_set_changed(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1017S")

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected trade:\n"
                "- trade_id: T-1017S\n"
                "- invoice_number: INV-T-1017S-STAGED\n"
                "- invoice_amount: 2500\n"
            ),
            message="Issue invoice for this trade.",
        )

        self._seed_invoice_record(
            trade_id="T-1017S",
            invoice_id=171,
            invoice_number="INV-T-1017S-MANUAL",
            invoice_amount=500.0,
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("staged review context is stale", payload["error_detail"])
        self.assertIn("existing_invoice_count", payload["error_detail"])

        with self.SessionLocal() as session:
            staged_invoice_count = (
                session.query(TradeInvoice)
                .filter(
                    TradeInvoice.trade_id == "T-1017S",
                    TradeInvoice.invoice_number == "INV-T-1017S-STAGED",
                )
                .count()
            )
            self.assertEqual(staged_invoice_count, 0)

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

    def test_assistant_action_request_approval_blocks_payment_when_payment_set_changed(self) -> None:
        token = self._create_session_token()
        self._create_trade_with_event(trade_id="T-1018S")
        self._seed_invoice_record(
            trade_id="T-1018S",
            invoice_id=181,
            invoice_number="INV-T-1018S",
            invoice_amount=1800.0,
        )

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected invoice:\n"
                "- invoice_id: 181\n"
                "- payment_reference: PAY-T-1018S-STAGED\n"
                "- payment_amount: 800\n"
                "- status: PAID\n"
            ),
            message="Record payment for this invoice.",
        )

        self._seed_payment_record(
            trade_id="T-1018S",
            invoice_id=181,
            payment_id=1811,
            payment_reference="PAY-T-1018S-MANUAL",
            payment_amount=500.0,
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("staged review context is stale", payload["error_detail"])
        self.assertIn("existing_payment_count", payload["error_detail"])

        with self.SessionLocal() as session:
            staged_payment_count = (
                session.query(TradePayment)
                .filter(
                    TradePayment.invoice_id == 181,
                    TradePayment.payment_reference == "PAY-T-1018S-STAGED",
                )
                .count()
            )
            self.assertEqual(staged_payment_count, 0)

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

    def test_assistant_action_request_approval_blocks_stale_document_reprocess(self) -> None:
        token = self._create_session_token()
        self._seed_document_record(document_id="DOC-1019S")

        action_request = self._create_action_request_via_prompt(
            token=token,
            context=(
                "Selected document:\n"
                "- document_id: DOC-1019S\n"
                "- processor_provider: openai\n"
            ),
            message="Reprocess this document.",
        )

        with self.SessionLocal() as session:
            document = session.get(DocumentIngestion, "DOC-1019S")
            assert document is not None
            document.status = "PROCESSING"
            document.version += 1
            document.updated_at = datetime.now(timezone.utc)
            session.commit()

        response = self.client.post(
            f"/assistant/action-requests/{action_request['action_request_id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("staged review context is stale", payload["error_detail"])
        self.assertIn("version", payload["error_detail"])

        with self.SessionLocal() as session:
            document = session.get(DocumentIngestion, "DOC-1019S")
            page = (
                session.query(DocumentIngestionPage)
                .filter(DocumentIngestionPage.document_id == "DOC-1019S")
                .one()
            )
            assert document is not None
            self.assertEqual(document.status, "PROCESSING")
            self.assertEqual(document.review_status, "REVIEWED")
            self.assertEqual(page.classification_status, "ANALYZED")

    def test_assistant_action_request_rejection_keeps_trade_active(self) -> None:
        token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=token,
            trade_id="T-1009",
        )

        response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/reject",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "decision_note": "Desk did not confirm unwind intent.",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "REJECTED")
        self.assertEqual(payload["lifecycle"]["stage"], "REJECTED")
        self.assertEqual(payload["lifecycle"]["tone"], "neutral")
        self.assertTrue(payload["lifecycle"]["is_terminal"])
        self.assertFalse(payload["lifecycle"]["can_approve"])
        self.assertFalse(payload["lifecycle"]["can_reject"])
        self.assertEqual(payload["lifecycle"]["decided_label"], "Rejected by assistant_user")
        self.assertEqual(payload["review_outcome"], "REJECTED")
        self.assertEqual(payload["decision_note"], "Desk did not confirm unwind intent.")
        self.assertIsNone(payload["correction_summary"])
        self.assertEqual(payload["correction_fields"], [])
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
        self.assertEqual([row["action_request_id"] for row in payload["items"]], [other_action_request_id])
        self.assertEqual(payload["items"][0]["user_id"], "ops_user")
        self.assertEqual(payload["items"][0]["status"], "PENDING")
        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["summary"]["total_count"], 1)
        self.assertEqual(payload["summary"]["pending_count"], 1)
        self.assertEqual(payload["summary"]["rejected_count"], 0)

    def test_admin_action_request_listing_filters_history_and_summarizes_decisions(self) -> None:
        admin_token = self._create_session_token()
        target_action_request_id = self._create_cancel_trade_action_request(
            token=admin_token,
            trade_id="T-1014",
        )

        other_token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )
        self._create_cancel_trade_action_request(
            token=other_token,
            trade_id="T-1015",
        )

        reject_response = self.client.post(
            f"/assistant/action-requests/{target_action_request_id}/reject",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reject_response.status_code, 200)

        response = self.client.get(
            "/admin/assistant/action-requests"
            "?status=REJECTED"
            "&action_type=cancel_trade"
            "&agent_id=trade-captain"
            "&user_id=assistant_user"
            "&decided_by=assistant_user"
            "&search=T-1014"
            "&limit=1"
            "&offset=0",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total_count"], 1)
        self.assertFalse(payload["has_more"])
        self.assertEqual(payload["items"][0]["action_request_id"], target_action_request_id)
        self.assertEqual(payload["items"][0]["status"], "REJECTED")
        self.assertEqual(payload["items"][0]["decided_by"], "assistant_user")
        self.assertEqual(payload["summary"]["total_count"], 1)
        self.assertEqual(payload["summary"]["pending_count"], 0)
        self.assertEqual(payload["summary"]["rejected_count"], 1)
        self.assertGreaterEqual(payload["summary"]["avg_decision_seconds"], 0)

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

    def test_admin_outcome_metrics_group_actions_and_apply_thresholds(self) -> None:
        admin_token = self._create_session_token()
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            workflow_run = AssistantRun(
                conversation_id=None,
                status="COMPLETED",
                user_id="ops_alpha",
                session_id="workflow-session",
                user_role="OPS_ADMIN",
                workspace="operations",
                agent_id="workflow-agent",
                agent_name="Workflow Agent",
                agent_role_key="operations-coordinator",
                agent_profile_kind="ROLE_DERIVED",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=False,
                request_messages=[{"role": "user", "content": "Review workflow items."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=[],
                tool_calls=[],
                input_tokens=100,
                output_tokens=40,
                latest_user_message="Review workflow items.",
                assistant_message="Staged workflow updates.",
                error_detail=None,
                created_at=now - timedelta(hours=2),
                completed_at=now - timedelta(hours=2),
            )
            noisy_run = AssistantRun(
                conversation_id=None,
                status="COMPLETED",
                user_id="ops_beta",
                session_id="noisy-session",
                user_role="OPS_ADMIN",
                workspace="assistant",
                agent_id="noisy-agent",
                agent_name="Noisy Agent",
                agent_role_key="trade-captain",
                agent_profile_kind="CUSTOM",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=False,
                request_messages=[{"role": "user", "content": "Review cancellations."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=["Missing source citation."],
                tool_calls=[
                    {
                        "tool_name": "get_trade_by_id",
                        "summary": "Fetch trade failed: unsupported lookup.",
                        "arguments": {},
                    }
                ],
                input_tokens=80,
                output_tokens=20,
                latest_user_message="Review cancellations.",
                assistant_message="Staged noisy cancellations.",
                error_detail=None,
                created_at=now - timedelta(hours=1),
                completed_at=now - timedelta(hours=1),
            )
            session.add_all([workflow_run, noisy_run])
            session.flush()
            noisy_run_id = noisy_run.id
            session.add_all(
                [
                    AssistantRunFeedback(
                        run_id=workflow_run.id,
                        conversation_id=None,
                        user_id="ops_alpha",
                        session_id="workflow-session",
                        user_role="OPS_ADMIN",
                        rating="HELPFUL",
                        comment="Clear proposals.",
                        created_at=now - timedelta(minutes=45),
                        updated_at=now - timedelta(minutes=45),
                    ),
                    AssistantRunFeedback(
                        run_id=noisy_run.id,
                        conversation_id=None,
                        user_id="ops_beta",
                        session_id="noisy-session",
                        user_role="OPS_ADMIN",
                        rating="NEEDS_WORK",
                        comment="Explain why each cancellation is appropriate before staging.",
                        created_at=now - timedelta(minutes=35),
                        updated_at=now - timedelta(minutes=5),
                    ),
                ]
            )
            session.add_all(
                [
                    AssistantPromptNavigationOutcome(
                        run_id=workflow_run.id,
                        conversation_id=None,
                        user_id="ops_alpha",
                        session_id="workflow-session",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="ACCEPTED",
                        intent_key="open_workspace|operations|workflow_item|WF-1001|||Open Work Queue",
                        target_view="operations",
                        target_label="Open Work Queue",
                        target_rationale="Review the queue blocker in operations.",
                        focus_type="workflow_item",
                        focus_id="WF-1001",
                        focus_label="Late confirmation",
                        detail=None,
                        created_at=now - timedelta(minutes=28),
                        updated_at=now - timedelta(minutes=28),
                    ),
                    AssistantPromptNavigationOutcome(
                        run_id=workflow_run.id,
                        conversation_id=None,
                        user_id="ops_alpha",
                        session_id="workflow-session",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="ACCEPTED",
                        intent_key="open_workspace|operations|workflow_item|WF-1002|||Open Work Queue",
                        target_view="operations",
                        target_label="Open Work Queue",
                        target_rationale="Review the queue blocker in operations.",
                        focus_type="workflow_item",
                        focus_id="WF-1002",
                        focus_label="Scheduling lag",
                        detail=None,
                        created_at=now - timedelta(minutes=27),
                        updated_at=now - timedelta(minutes=27),
                    ),
                    AssistantPromptNavigationOutcome(
                        run_id=workflow_run.id,
                        conversation_id=None,
                        user_id="ops_alpha",
                        session_id="workflow-session",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="ACCEPTED",
                        intent_key="open_workspace|operations|workflow_item|WF-1003|||Open Work Queue",
                        target_view="operations",
                        target_label="Open Work Queue",
                        target_rationale="Review the queue blocker in operations.",
                        focus_type="workflow_item",
                        focus_id="WF-1003",
                        focus_label="Allocation follow-up",
                        detail=None,
                        created_at=now - timedelta(minutes=26),
                        updated_at=now - timedelta(minutes=26),
                    ),
                    AssistantPromptNavigationOutcome(
                        run_id=noisy_run.id,
                        conversation_id=None,
                        user_id="ops_beta",
                        session_id="noisy-session",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="DISMISSED",
                        intent_key="open_workspace|settlement|invoice|INV-1|||Open Settlement",
                        target_view="settlement",
                        target_label="Open Settlement",
                        target_rationale="Review invoice follow-through in settlement.",
                        focus_type="invoice",
                        focus_id="INV-1",
                        focus_label="INV-1",
                        detail=None,
                        created_at=now - timedelta(minutes=24),
                        updated_at=now - timedelta(minutes=24),
                    ),
                    AssistantPromptNavigationOutcome(
                        run_id=noisy_run.id,
                        conversation_id=None,
                        user_id="ops_beta",
                        session_id="noisy-session",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="DISMISSED",
                        intent_key="open_workspace|settlement|invoice|INV-2|||Open Settlement",
                        target_view="settlement",
                        target_label="Open Settlement",
                        target_rationale="Review invoice follow-through in settlement.",
                        focus_type="invoice",
                        focus_id="INV-2",
                        focus_label="INV-2",
                        detail="User kept working from the prompt thread.",
                        created_at=now - timedelta(minutes=23),
                        updated_at=now - timedelta(minutes=23),
                    ),
                    AssistantPromptNavigationOutcome(
                        run_id=noisy_run.id,
                        conversation_id=None,
                        user_id="ops_beta",
                        session_id="noisy-session",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="FAILED",
                        intent_key="invalid_navigation_payload",
                        target_view=None,
                        target_label=None,
                        target_rationale=None,
                        focus_type=None,
                        focus_id=None,
                        focus_label=None,
                        detail="A workspace handoff suggestion could not be applied and was ignored.",
                        created_at=now - timedelta(minutes=22),
                        updated_at=now - timedelta(minutes=22),
                    ),
                ]
            )

            for index in range(10):
                session.add(
                    AssistantActionRequest(
                        run_id=workflow_run.id,
                        status="EXECUTED",
                        user_id="ops_alpha",
                        session_id="workflow-session",
                        workspace="operations",
                        agent_id="workflow-agent",
                        agent_name="Workflow Agent",
                        action_type="update_trade_workflow_item",
                        summary=f"Workflow update {index}",
                        description="Update a workflow item.",
                        payload={
                            "review_context": {
                                "owning_work_object": {
                                    "type": "trade_workflow_item",
                                    "id": str(index + 1),
                                    "label": f"Workflow item {index + 1}",
                                },
                                "required_reviewer_role": "OPS_ADMIN",
                                "business_rationale": "Operations owner review is required before workflow mutation.",
                                "stale_state_basis": {"version": index},
                            }
                        },
                        result={"workflow_item": {"id": index + 1}},
                        error_detail=None,
                        review_outcome="APPROVED_WITH_CORRECTIONS" if index == 0 else "APPROVED_AS_IS",
                        decision_note="Owner corrected before approval." if index == 0 else None,
                        correction_summary="Reviewer corrected owner evidence." if index == 0 else None,
                        correction_fields=["owner"] if index == 0 else None,
                        created_at=now - timedelta(minutes=30 + index),
                        decided_at=now - timedelta(minutes=20 + index),
                        decided_by="ops_lead",
                    )
                )

            for index in range(4):
                session.add(
                    AssistantActionRequest(
                        run_id=noisy_run.id,
                        status="REJECTED",
                        user_id="ops_beta",
                        session_id="noisy-session",
                        workspace="assistant",
                        agent_id="noisy-agent",
                        agent_name="Noisy Agent",
                        action_type="cancel_trade",
                        summary=f"Noisy cancellation {index}",
                        description="Cancel a trade.",
                        payload={"trade_id": f"T-NOISY-{index}"},
                        result=None,
                        error_detail=None,
                        created_at=now - timedelta(minutes=25 + index),
                        decided_at=now - timedelta(minutes=15 + index),
                        decided_by="desk_lead",
                    )
                )
            session.add(
                AssistantActionRequest(
                    run_id=noisy_run.id,
                    status="FAILED",
                    user_id="ops_beta",
                    session_id="noisy-session",
                    workspace="assistant",
                    agent_id="noisy-agent",
                    agent_name="Noisy Agent",
                    action_type="cancel_trade",
                    summary="Stale cancellation",
                    description="Cancel a stale trade.",
                    payload={"trade_id": "T-STALE"},
                    result=None,
                    error_detail="The staged review context is stale. Refresh and stage a new action.",
                    created_at=now - timedelta(minutes=18),
                    decided_at=now - timedelta(minutes=8),
                    decided_by="desk_lead",
                )
            )
            session.add(
                AssistantActionRequest(
                    run_id=noisy_run.id,
                    status="FAILED",
                    user_id="ops_beta",
                    session_id="noisy-session",
                    workspace="assistant",
                    agent_id="noisy-agent",
                    agent_name="Noisy Agent",
                    action_type="cancel_trade",
                    summary="Unsupported cancellation",
                    description="Attempt an unsupported cancellation path.",
                    payload={"trade_id": "T-UNSUPPORTED"},
                    result=None,
                    error_detail="Unsupported action attempt: unknown action type for this role.",
                    created_at=now - timedelta(minutes=17),
                    decided_at=now - timedelta(minutes=7),
                    decided_by="desk_lead",
                )
            )
            session.add(
                AssistantActionRequest(
                    run_id=noisy_run.id,
                    status="FAILED",
                    user_id="ops_beta",
                    session_id="noisy-session",
                    workspace="assistant",
                    agent_id="noisy-agent",
                    agent_name="Noisy Agent",
                    action_type="cancel_trade",
                    summary="Policy drift cancellation",
                    description="Attempt a cancellation after role policy changed.",
                    payload={"trade_id": "T-POLICY"},
                    result=None,
                    error_detail="Policy drift after role change: cancel_trade is no longer allowed.",
                    created_at=now - timedelta(minutes=15),
                    decided_at=now - timedelta(minutes=5),
                    decided_by="desk_lead",
                )
            )
            session.add(
                AssistantActionRequest(
                    run_id=noisy_run.id,
                    status="EXECUTED",
                    user_id="ops_beta",
                    session_id="noisy-session",
                    workspace="assistant",
                    agent_id="noisy-agent",
                    agent_name="Noisy Agent",
                    action_type="cancel_trade",
                    summary="Accepted cancellation",
                    description="Cancel a trade.",
                    payload={"trade_id": "T-ACCEPTED"},
                    result={"event_id": "evt-accepted"},
                    error_detail=None,
                    created_at=now - timedelta(minutes=16),
                    decided_at=now - timedelta(minutes=6),
                    decided_by="desk_lead",
                )
            )
            session.commit()

        response = self.client.get(
            "/admin/assistant/outcome-metrics",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["thresholds"]["min_decided_actions_for_promotion"], 10)
        self.assertEqual(payload["thresholds"]["repeated_failed_actions_pause_threshold"], 3)
        self.assertEqual(payload["thresholds"]["unsupported_attempt_pause_threshold"], 1)
        self.assertEqual(payload["thresholds"]["policy_drift_pause_threshold"], 1)
        self.assertEqual(payload["total_feedback_count"], 2)
        self.assertEqual(payload["helpful_feedback_count"], 1)
        self.assertEqual(payload["needs_work_feedback_count"], 1)
        self.assertEqual(payload["feedback_helpful_rate"], 0.5)

        agent_rows = {row["agent_id"]: row for row in payload["by_agent"]}
        workflow_row = agent_rows["workflow-agent"]
        self.assertEqual(workflow_row["agent_role_key"], "operations-coordinator")
        self.assertEqual(workflow_row["run_count"], 1)
        self.assertEqual(workflow_row["staged_action_count"], 10)
        self.assertEqual(workflow_row["executed_action_count"], 10)
        self.assertEqual(workflow_row["correction_count"], 1)
        self.assertEqual(workflow_row["correction_rate"], 0.1)
        self.assertEqual(workflow_row["helpful_feedback_count"], 1)
        self.assertEqual(workflow_row["needs_work_feedback_count"], 0)
        self.assertEqual(workflow_row["feedback_helpful_rate"], 1)
        self.assertEqual(
            workflow_row["recommendation"]["recommended_action"],
            "ELIGIBLE_FOR_BOUNDED_REVIEW",
        )
        self.assertTrue(workflow_row["recommendation"]["promotion_candidate"])

        noisy_row = agent_rows["noisy-agent"]
        self.assertEqual(noisy_row["warning_count"], 1)
        self.assertEqual(noisy_row["tool_call_count"], 1)
        self.assertEqual(noisy_row["tool_error_count"], 1)
        self.assertEqual(noisy_row["tool_error_rate"], 1)
        self.assertEqual(noisy_row["stale_action_count"], 1)
        self.assertEqual(noisy_row["unsupported_attempt_count"], 1)
        self.assertEqual(noisy_row["policy_drift_count"], 1)
        self.assertEqual(noisy_row["helpful_feedback_count"], 0)
        self.assertEqual(noisy_row["needs_work_feedback_count"], 1)
        self.assertEqual(noisy_row["feedback_helpful_rate"], 0)
        self.assertEqual(noisy_row["recommendation"]["recommended_action"], "RECOMMEND_PAUSE")
        self.assertTrue(noisy_row["recommendation"]["pause_recommended"])
        self.assertIn(
            "Repeated failed actions exceed the pause threshold.",
            noisy_row["recommendation"]["reasons"],
        )
        self.assertIn(
            "Unsupported tool or action attempts were observed.",
            noisy_row["recommendation"]["reasons"],
        )
        self.assertIn(
            "Policy validation drift was observed after role or permission changes.",
            noisy_row["recommendation"]["reasons"],
        )
        self.assertGreater(noisy_row["rejection_rate"], 0.4)

        role_rows = {row["agent_role_key"]: row for row in payload["by_role"]}
        self.assertEqual(role_rows["operations-coordinator"]["staged_action_count"], 10)
        self.assertEqual(
            role_rows["operations-coordinator"]["recommendation"]["recommended_action"],
            "ELIGIBLE_FOR_BOUNDED_REVIEW",
        )
        self.assertEqual(role_rows["trade-captain"]["tool_error_count"], 1)
        self.assertEqual(role_rows["trade-captain"]["unsupported_attempt_count"], 1)
        self.assertEqual(role_rows["trade-captain"]["policy_drift_count"], 1)
        self.assertEqual(role_rows["trade-captain"]["recommendation"]["recommended_action"], "RECOMMEND_PAUSE")

        profile_rows = {row["agent_profile_kind"]: row for row in payload["by_profile"]}
        self.assertEqual(profile_rows["ROLE_DERIVED"]["staged_action_count"], 10)
        self.assertEqual(profile_rows["CUSTOM"]["unsupported_attempt_count"], 1)
        self.assertEqual(profile_rows["CUSTOM"]["recommendation"]["recommended_action"], "RECOMMEND_PAUSE")

        workspace_rows = {row["workspace"]: row for row in payload["by_workspace"]}
        self.assertEqual(workspace_rows["operations"]["feedback_count"], 1)
        self.assertEqual(workspace_rows["operations"]["helpful_feedback_count"], 1)
        self.assertEqual(workspace_rows["assistant"]["feedback_count"], 1)
        self.assertEqual(workspace_rows["assistant"]["needs_work_feedback_count"], 1)

        recent_feedback = payload["recent_feedback"]
        self.assertEqual(recent_feedback[0]["run_id"], noisy_run_id)
        self.assertEqual(recent_feedback[0]["agent_id"], "noisy-agent")
        self.assertEqual(recent_feedback[0]["workspace"], "assistant")
        self.assertEqual(recent_feedback[0]["rating"], "NEEDS_WORK")
        self.assertIn("cancellation", recent_feedback[0]["comment"])

        prompt_navigation_summary = payload["prompt_navigation_summary"]
        self.assertEqual(prompt_navigation_summary["total_outcome_count"], 6)
        self.assertEqual(prompt_navigation_summary["accepted_count"], 3)
        self.assertEqual(prompt_navigation_summary["dismissed_count"], 2)
        self.assertEqual(prompt_navigation_summary["failed_count"], 1)

        prompt_target_rows = {
            (row["target_view"], row["focus_type"]): row for row in payload["by_prompt_target"]
        }
        operations_prompt_row = prompt_target_rows[("operations", "workflow_item")]
        self.assertEqual(operations_prompt_row["accepted_count"], 3)
        self.assertEqual(operations_prompt_row["signal"], "CANDIDATE_FOR_RULE")
        self.assertIn("deterministic rule candidate", operations_prompt_row["signal_reasons"][0])
        self.assertGreaterEqual(len(operations_prompt_row["recent_prompt_examples"]), 1)
        settlement_prompt_row = prompt_target_rows[("settlement", "invoice")]
        self.assertEqual(settlement_prompt_row["dismissed_count"], 2)
        self.assertEqual(settlement_prompt_row["signal"], "NARROW")
        invalid_prompt_row = prompt_target_rows[(None, None)]
        self.assertEqual(invalid_prompt_row["failed_count"], 1)

        recent_prompt_navigation_outcomes = payload["recent_prompt_navigation_outcomes"]
        self.assertEqual(recent_prompt_navigation_outcomes[0]["outcome"], "FAILED")
        self.assertIsNone(recent_prompt_navigation_outcomes[0]["target_view"])
        self.assertEqual(recent_prompt_navigation_outcomes[0]["source_workspace"], "assistant")
        self.assertIn("ignored", recent_prompt_navigation_outcomes[0]["detail"])

        action_rows = {row["action_type"]: row for row in payload["by_action_type"]}
        self.assertEqual(action_rows["update_trade_workflow_item"]["executed_action_count"], 10)
        self.assertEqual(action_rows["update_trade_workflow_item"]["correction_count"], 1)
        self.assertEqual(
            action_rows["update_trade_workflow_item"]["recommendation"]["recommended_action"],
            "ELIGIBLE_FOR_BOUNDED_REVIEW",
        )
        self.assertEqual(action_rows["cancel_trade"]["stale_action_count"], 1)
        self.assertEqual(action_rows["cancel_trade"]["unsupported_attempt_count"], 1)
        self.assertEqual(action_rows["cancel_trade"]["policy_drift_count"], 1)
        self.assertEqual(action_rows["cancel_trade"]["recommendation"]["recommended_action"], "RECOMMEND_PAUSE")

        filtered_metrics_response = self.client.get(
            "/admin/assistant/outcome-metrics?role_key=operations-coordinator&profile_kind=ROLE_DERIVED",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(filtered_metrics_response.status_code, 200)
        filtered_metrics = filtered_metrics_response.json()
        self.assertEqual([row["agent_id"] for row in filtered_metrics["by_agent"]], ["workflow-agent"])
        self.assertEqual([row["agent_role_key"] for row in filtered_metrics["by_role"]], ["operations-coordinator"])
        self.assertEqual(
            [(row["target_view"], row["focus_type"]) for row in filtered_metrics["by_prompt_target"]],
            [("operations", "workflow_item")],
        )
        self.assertEqual([row["agent_profile_kind"] for row in filtered_metrics["by_profile"]], ["ROLE_DERIVED"])
        self.assertEqual(
            [row["action_type"] for row in filtered_metrics["by_action_type"]],
            ["update_trade_workflow_item"],
        )

        filtered_runs_response = self.client.get(
            "/admin/assistant/runs?role_key=operations-coordinator&profile_kind=ROLE_DERIVED",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(filtered_runs_response.status_code, 200)
        filtered_runs = filtered_runs_response.json()
        self.assertEqual([row["agent_id"] for row in filtered_runs], ["workflow-agent"])
        self.assertEqual(filtered_runs[0]["agent_role_key"], "operations-coordinator")
        self.assertEqual(filtered_runs[0]["agent_profile_kind"], "ROLE_DERIVED")

        filtered_actions_response = self.client.get(
            "/admin/assistant/action-requests?role_key=operations-coordinator&profile_kind=ROLE_DERIVED",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(filtered_actions_response.status_code, 200)
        filtered_actions = filtered_actions_response.json()
        self.assertEqual(filtered_actions["total_count"], 10)
        self.assertEqual(filtered_actions["summary"]["executed_count"], 10)
        self.assertTrue(
            all(row["action_type"] == "update_trade_workflow_item" for row in filtered_actions["items"])
        )

    def test_admin_autonomy_review_brief_combines_metrics_eval_and_knowledge_base(self) -> None:
        admin_token = self._create_session_token()
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            agent = AssistantAgent(
                agent_id="workflow-agent",
                name="Workflow Agent",
                description="Stages workflow updates for operations review.",
                status="ACTIVE",
                scope="TEAM",
                provider="openai",
                model="gpt-5-mini",
                role_key="trade-ops-copilot",
                profile_kind="ROLE_DERIVED",
                specialization_summary="Workflow item update specialist.",
                human_owner_role="Operations Lead",
                authority_ceiling="STAGE",
                activation_notes="Approved for staged workflow update review.",
                profile_request_id=None,
                allowed_workspaces=["assistant", "operations"],
                capabilities=["READ", "EXPLAIN", "ACTION"],
                allowed_tools=["list_workflow_items"],
                allowed_action_types=["update_trade_workflow_item"],
                daily_token_allocation=None,
                system_prompt="Stage only reviewable workflow updates.",
                created_at=now - timedelta(days=1),
                created_by="ops_admin",
                updated_at=now - timedelta(days=1),
                updated_by="ops_admin",
                version=1,
            )
            run = AssistantRun(
                conversation_id=None,
                status="COMPLETED",
                user_id="ops_alpha",
                session_id="workflow-session",
                user_role="OPS_ADMIN",
                workspace="operations",
                agent_id="workflow-agent",
                agent_name="Workflow Agent",
                agent_role_key="trade-ops-copilot",
                agent_profile_kind="ROLE_DERIVED",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=False,
                request_messages=[{"role": "user", "content": "Review workflow items."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=[],
                tool_calls=[],
                input_tokens=100,
                output_tokens=40,
                latest_user_message="Review workflow items.",
                assistant_message="Staged workflow updates.",
                error_detail=None,
                created_at=now - timedelta(hours=2),
                completed_at=now - timedelta(hours=2),
            )
            session.add_all([agent, run])
            session.flush()

            for index in range(10):
                session.add(
                    AssistantActionRequest(
                        run_id=run.id,
                        status="EXECUTED",
                        user_id="ops_alpha",
                        session_id="workflow-session",
                        workspace="operations",
                        agent_id="workflow-agent",
                        agent_name="Workflow Agent",
                        action_type="update_trade_workflow_item",
                        summary=f"Workflow update {index}",
                        description="Update a workflow item.",
                        payload={"review_context": {"stale_state_basis": {"version": index}}},
                        result={"workflow_item": {"id": index + 1}},
                        error_detail=None,
                        created_at=now - timedelta(minutes=30 + index),
                        decided_at=now - timedelta(minutes=20 + index),
                        decided_by="ops_lead",
                    )
                )
            session.commit()

        response = self.client.get(
            "/admin/assistant/agents/workflow-agent/autonomy-review",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["agent_id"], "workflow-agent")
        self.assertEqual(payload["current_authority"], "STAGE")
        self.assertEqual(payload["recommended_next_authority"], "ELIGIBLE_FOR_BOUNDED_REVIEW")
        self.assertIn("Observed action outcomes pass", payload["recommendation_reasons"][0])
        self.assertEqual(payload["outcome_metrics"]["decided_action_count"], 10)
        self.assertEqual(
            payload["outcome_metrics"]["recommendation"]["recommended_action"],
            "ELIGIBLE_FOR_BOUNDED_REVIEW",
        )
        self.assertEqual(payload["action_type_metrics"][0]["action_type"], "update_trade_workflow_item")
        self.assertEqual(payload["eval_signal"]["status"], "DECLARED")
        self.assertIn("Allowed operational action execution.", payload["eval_signal"]["required_cases"])
        self.assertIn("Operations Lead", payload["human_owner_role"])
        self.assertTrue(payload["knowledge_base_entries"])
        self.assertTrue(any(entry["entry_type"] for entry in payload["knowledge_base_entries"]))
        self.assertIn(
            "Run policy simulation for each allowed action type before increasing autonomy.",
            payload["review_checklist"],
        )

    def test_admin_autonomy_review_requires_admin_and_existing_agent(self) -> None:
        trader_token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )
        admin_token = self._create_session_token()

        non_admin_response = self.client.get(
            "/admin/assistant/agents/missing-agent/autonomy-review",
            headers={"Authorization": f"Bearer {trader_token}"},
        )
        self.assertEqual(non_admin_response.status_code, 403)

        missing_response = self.client.get(
            "/admin/assistant/agents/missing-agent/autonomy-review",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(missing_response.status_code, 404)

    def test_admin_agent_health_review_groups_deterministic_work_packages(self) -> None:
        admin_token = self._create_session_token()
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            for index, agent_id in enumerate(("workflow-alpha", "workflow-beta")):
                agent_name = f"Workflow {index}"
                agent = AssistantAgent(
                    agent_id=agent_id,
                    name=agent_name,
                    description="Stages workflow updates for operations review.",
                    status="ACTIVE",
                    scope="TEAM",
                    provider="openai",
                    model="gpt-5-mini",
                    role_key="trade-ops-copilot",
                    profile_kind="ROLE_DERIVED",
                    specialization_summary="Workflow item update specialist.",
                    human_owner_role="Operations Lead",
                    authority_ceiling="STAGE",
                    activation_notes="Approved for staged workflow update review.",
                    profile_request_id=None,
                    allowed_workspaces=["assistant", "operations"],
                    capabilities=["READ", "EXPLAIN", "ACTION"],
                    allowed_tools=["list_workflow_items"],
                    allowed_action_types=["update_trade_workflow_item"],
                    daily_token_allocation=None,
                    system_prompt="Stage only reviewable workflow updates.",
                    created_at=now - timedelta(days=1),
                    created_by="ops_admin",
                    updated_at=now - timedelta(days=1),
                    updated_by="ops_admin",
                    version=1,
                )
                run = AssistantRun(
                    conversation_id=None,
                    status="COMPLETED",
                    user_id=f"ops_{index}",
                    session_id=f"workflow-session-{index}",
                    user_role="OPS_ADMIN",
                    workspace="operations",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    agent_role_key="trade-ops-copilot",
                    agent_profile_kind="ROLE_DERIVED",
                    provider="openai",
                    model="gpt-5-mini",
                    use_live_tools=False,
                    request_messages=[{"role": "user", "content": "Review workflow items."}],
                    application_context=None,
                    prompt_sections=[],
                    rendered_system_prompt="System prompt.",
                    warnings=[],
                    tool_calls=[],
                    input_tokens=100,
                    output_tokens=40,
                    latest_user_message="Review workflow items.",
                    assistant_message="Staged workflow updates.",
                    error_detail=None,
                    created_at=now - timedelta(hours=2),
                    completed_at=now - timedelta(hours=2),
                )
                session.add_all([agent, run])
                session.flush()
                session.add(
                    AssistantActionRequest(
                        run_id=run.id,
                        status="EXECUTED",
                        user_id=f"ops_{index}",
                        session_id=f"workflow-session-{index}",
                        workspace="operations",
                        agent_id=agent_id,
                        agent_name=agent_name,
                        action_type="update_trade_workflow_item",
                        summary="Workflow update",
                        description="Update a workflow item.",
                        payload={"review_context": {"stale_state_basis": {"version": index}}},
                        result={"workflow_item": {"id": index + 1}},
                        error_detail=None,
                        created_at=now - timedelta(minutes=30 + index),
                        decided_at=now - timedelta(minutes=20 + index),
                        decided_by="ops_lead",
                    )
                )
            session.commit()

        response = self.client.get(
            "/admin/assistant/agent-health-review",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["agent_count"], 2)
        self.assertGreaterEqual(payload["work_package_count"], 1)
        package = next(
            row
            for row in payload["work_packages"]
            if row["source_candidates"]
            and "update_trade_workflow_item" in row["source_candidates"][0]
        )
        self.assertTrue(package["work_package_id"].startswith("policy-"))
        self.assertEqual(package["package_type"], "POLICY")
        self.assertEqual(package["priority"], "P2")
        self.assertEqual(package["status"], "CANDIDATE")
        self.assertEqual(package["source_agent_ids"], ["workflow-alpha", "workflow-beta"])
        self.assertIn("typed policy or service logic", package["source_candidates"][0])
        self.assertIn("Operations Lead", package["recommended_owner_role"])
        self.assertTrue(any("policy simulation" in check.lower() for check in package["acceptance_checks"]))
        item_ids = {item["agent_id"]: item["work_package_ids"] for item in payload["review_items"]}
        self.assertIn(package["work_package_id"], item_ids["workflow-alpha"])
        self.assertIn(package["work_package_id"], item_ids["workflow-beta"])

        accept_response = self.client.post(
            f"/admin/assistant/agent-health-review/work-packages/{package['work_package_id']}/accept",
            json={"notes": "Promote into the policy backlog."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(accept_response.status_code, 200)
        accepted_package = accept_response.json()
        self.assertEqual(accepted_package["work_package_id"], package["work_package_id"])
        self.assertEqual(accepted_package["status"], "ACCEPTED")
        self.assertEqual(accepted_package["accepted_by"], "assistant_user")
        self.assertEqual(accepted_package["notes"], "Promote into the policy backlog.")
        self.assertEqual(accepted_package["implementation_evidence"]["eval_ids"], [])
        self.assertEqual(accepted_package["implementation_evidence"]["test_names"], [])
        self.assertEqual(accepted_package["implementation_evidence"]["doc_paths"], [])
        self.assertIsNone(accepted_package["implementation_evidence"]["pr_url"])
        self.assertIsNone(accepted_package["implementation_evidence"]["commit_sha"])
        self.assertIsNone(accepted_package["implementation_evidence"]["owner"])

        start_response = self.client.patch(
            f"/admin/assistant/agent-work-packages/{package['work_package_id']}",
            json={"status": "IN_PROGRESS", "notes": "Implementation started."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(start_response.json()["status"], "IN_PROGRESS")
        self.assertEqual(start_response.json()["notes"], "Implementation started.")

        missing_evidence_response = self.client.patch(
            f"/admin/assistant/agent-work-packages/{package['work_package_id']}",
            json={"status": "IMPLEMENTED"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(missing_evidence_response.status_code, 400)
        self.assertIn(
            "Implementation evidence is required",
            missing_evidence_response.json()["detail"],
        )

        implemented_response = self.client.patch(
            f"/admin/assistant/agent-work-packages/{package['work_package_id']}",
            json={
                "status": "IMPLEMENTED",
                "notes": "Implemented checks with passing coverage.",
                "implementation_evidence": {
                    "pr_url": "https://github.com/org/repo/pull/123",
                    "commit_sha": "ABC123DEF456",
                    "eval_ids": [12, 18, 12],
                    "test_names": ["assistant_api", "api contract"],
                    "doc_paths": ["docs/engineering/agent-knowledge-base.md"],
                    "owner": "Operations Lead",
                },
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(implemented_response.status_code, 200)
        implemented_payload = implemented_response.json()
        self.assertEqual(implemented_payload["status"], "IMPLEMENTED")
        self.assertEqual(implemented_payload["notes"], "Implemented checks with passing coverage.")
        self.assertEqual(
            implemented_payload["implementation_evidence"],
            {
                "pr_url": "https://github.com/org/repo/pull/123",
                "commit_sha": "abc123def456",
                "eval_ids": [12, 18],
                "test_names": ["assistant_api", "api contract"],
                "doc_paths": ["docs/engineering/agent-knowledge-base.md"],
                "owner": "Operations Lead",
            },
        )
        self.assertEqual(implemented_payload["implemented_by"], "assistant_user")
        self.assertIsNotNone(implemented_payload["implemented_at"])

        invalid_transition_response = self.client.patch(
            f"/admin/assistant/agent-work-packages/{package['work_package_id']}",
            json={"status": "DISMISSED", "notes": "Close anyway."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(invalid_transition_response.status_code, 409)

        list_response = self.client.get(
            "/admin/assistant/agent-work-packages?status=IMPLEMENTED",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(list_response.status_code, 200)
        listed_packages = list_response.json()
        self.assertEqual([row["work_package_id"] for row in listed_packages], [package["work_package_id"]])
        self.assertEqual(
            listed_packages[0]["implementation_evidence"]["pr_url"],
            "https://github.com/org/repo/pull/123",
        )
        self.assertEqual(listed_packages[0]["implemented_by"], "assistant_user")

        invalid_filter_response = self.client.get(
            "/admin/assistant/agent-work-packages?status=UNKNOWN",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(invalid_filter_response.status_code, 400)

    def test_admin_agent_health_review_requires_admin_role(self) -> None:
        token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )

        response = self.client.get(
            "/admin/assistant/agent-health-review",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

        list_response = self.client.get(
            "/admin/assistant/agent-work-packages",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(list_response.status_code, 403)

        accept_response = self.client.post(
            "/admin/assistant/agent-health-review/work-packages/missing/accept",
            json={"notes": "Nope."},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(accept_response.status_code, 403)

        update_response = self.client.patch(
            "/admin/assistant/agent-work-packages/missing",
            json={"status": "IN_PROGRESS", "notes": "Nope."},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(update_response.status_code, 403)

    def test_admin_accepts_agent_health_work_package_into_persisted_backlog(self) -> None:
        admin_token = self._create_session_token()
        self._seed_repeated_workflow_action_candidates(now=datetime.now(timezone.utc))

        review_response = self.client.get(
            "/admin/assistant/agent-health-review",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(review_response.status_code, 200)
        package = next(
            row
            for row in review_response.json()["work_packages"]
            if row["source_candidates"] and "update_trade_workflow_item" in row["source_candidates"][0]
        )

        accept_response = self.client.post(
            f"/admin/assistant/agent-health-review/work-packages/{package['work_package_id']}/accept",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "accepted_by": "ops_lead",
                "notes": "Promote repeated workflow decisions into typed policy.",
            },
        )

        self.assertEqual(accept_response.status_code, 200)
        accepted = accept_response.json()
        self.assertEqual(accepted["work_package_id"], package["work_package_id"])
        self.assertEqual(accepted["status"], "ACCEPTED")
        self.assertEqual(accepted["accepted_by"], "ops_lead")
        self.assertEqual(accepted["source_agent_ids"], ["workflow-alpha", "workflow-beta"])
        self.assertEqual(accepted["notes"], "Promote repeated workflow decisions into typed policy.")

        list_response = self.client.get(
            "/admin/assistant/agent-work-packages?status=ACCEPTED",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(list_response.status_code, 200)
        records = list_response.json()
        self.assertEqual([row["work_package_id"] for row in records], [package["work_package_id"]])
        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantAgentWorkPackage).count(), 1)

    def test_admin_lists_agent_work_packages_with_evidence_filters(self) -> None:
        admin_token = self._create_session_token()
        now = datetime.now(timezone.utc)
        self._create_work_package(
            work_package_id="policy-pr-tests",
            title="Policy package with PR and tests",
            status="IMPLEMENTED",
            implementation_evidence={
                "pr_url": "https://github.com/org/repo/pull/123",
                "test_names": ["apps.api.tests.test_assistant_api"],
            },
            now=now,
        )
        self._create_work_package(
            work_package_id="policy-eval-docs",
            title="Policy package with evals and docs",
            status="IMPLEMENTED",
            implementation_evidence={
                "eval_ids": [12],
                "doc_paths": ["docs/engineering/agent-knowledge-base.md"],
            },
            now=now - timedelta(minutes=5),
        )
        self._create_work_package(
            work_package_id="policy-in-progress",
            title="Policy package in progress",
            status="IN_PROGRESS",
            implementation_evidence={},
            now=now - timedelta(minutes=10),
        )

        pr_filter_response = self.client.get(
            "/admin/assistant/agent-work-packages?status=IMPLEMENTED&has_pr=true&has_tests=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(pr_filter_response.status_code, 200)
        self.assertEqual(
            [row["work_package_id"] for row in pr_filter_response.json()],
            ["policy-pr-tests"],
        )

        eval_filter_response = self.client.get(
            "/admin/assistant/agent-work-packages?status=IMPLEMENTED&has_eval=true&has_docs=true&has_pr=false",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(eval_filter_response.status_code, 200)
        self.assertEqual(
            [row["work_package_id"] for row in eval_filter_response.json()],
            ["policy-eval-docs"],
        )

    def test_admin_control_tower_summary_reports_roster_activity_and_trust_signals(self) -> None:
        admin_token = self._create_session_token()
        now = datetime.now(timezone.utc)
        self._create_agent(
            agent_id="watch-agent",
            name="Watch Agent",
            status="ACTIVE",
            allowed_workspaces=["assistant"],
            capabilities=["READ", "EXPLAIN"],
            allowed_tools=["get_trade_by_id"],
            allowed_action_types=[],
            authority_ceiling="EXPLAIN",
        )
        self._create_agent(
            agent_id="risky-agent",
            name="Risky Agent",
            status="ACTIVE",
            allowed_workspaces=["assistant", "operations"],
            capabilities=["READ", "EXPLAIN", "ACTION"],
            allowed_tools=["list_workflow_items"],
            allowed_action_types=[],
            authority_ceiling="STAGE",
        )
        self._create_agent(
            agent_id="draft-agent",
            name="Draft Agent",
            status="DRAFT",
            allowed_workspaces=["assistant"],
            capabilities=["READ"],
            allowed_tools=["get_trade_by_id"],
            allowed_action_types=[],
        )
        self._create_agent(
            agent_id="paused-agent",
            name="Paused Agent",
            status="PAUSED",
            allowed_workspaces=["assistant"],
            capabilities=["READ"],
            allowed_tools=["get_trade_by_id"],
            allowed_action_types=[],
        )
        self._create_agent(
            agent_id="retired-agent",
            name="Retired Agent",
            status="RETIRED",
            allowed_workspaces=["assistant"],
            capabilities=["READ"],
            allowed_tools=["get_trade_by_id"],
            allowed_action_types=[],
        )

        with self.SessionLocal() as session:
            watch_run = AssistantRun(
                conversation_id=None,
                status="COMPLETED",
                user_id="ops_alpha",
                session_id="watch-session",
                user_role="OPS_ADMIN",
                workspace="assistant",
                agent_id="watch-agent",
                agent_name="Watch Agent",
                agent_role_key=None,
                agent_profile_kind="CUSTOM",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=True,
                request_messages=[{"role": "user", "content": "Watch the queue."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=["Tool response was truncated."],
                tool_calls=[{"name": "get_trade_by_id"}, {"name": "list_workflow_items"}],
                input_tokens=100,
                output_tokens=40,
                latest_user_message="Watch the queue.",
                assistant_message="Queue reviewed.",
                error_detail=None,
                created_at=now - timedelta(hours=3),
                completed_at=now - timedelta(hours=3),
            )
            risky_run = AssistantRun(
                conversation_id=None,
                status="FAILED",
                user_id="ops_beta",
                session_id="risky-session",
                user_role="OPS_ADMIN",
                workspace="operations",
                agent_id="risky-agent",
                agent_name="Risky Agent",
                agent_role_key=None,
                agent_profile_kind="CUSTOM",
                provider="openai",
                model="gpt-5-mini",
                use_live_tools=False,
                request_messages=[{"role": "user", "content": "Stage the action."}],
                application_context=None,
                prompt_sections=[],
                rendered_system_prompt="System prompt.",
                warnings=[],
                tool_calls=[],
                input_tokens=80,
                output_tokens=20,
                latest_user_message="Stage the action.",
                assistant_message=None,
                error_detail="Policy validation failed.",
                created_at=now - timedelta(hours=2),
                completed_at=now - timedelta(hours=2),
            )
            session.add_all([watch_run, risky_run])
            session.flush()
            session.add_all(
                [
                    AssistantActionRequest(
                        run_id=risky_run.id,
                        status="PENDING",
                        user_id="ops_beta",
                        session_id="risky-session",
                        workspace="operations",
                        agent_id="risky-agent",
                        agent_name="Risky Agent",
                        action_type="issue_trade_invoice",
                        summary="Issue invoice",
                        description="Issue an invoice for review.",
                        payload={"review_context": {"action_preview": {"status": "BLOCKED"}}},
                        result=None,
                        error_detail=None,
                        created_at=now - timedelta(hours=5),
                        decided_at=None,
                        decided_by=None,
                    ),
                    AssistantActionRequest(
                        run_id=risky_run.id,
                        status="FAILED",
                        user_id="ops_beta",
                        session_id="risky-session",
                        workspace="operations",
                        agent_id="risky-agent",
                        agent_name="Risky Agent",
                        action_type="issue_trade_invoice",
                        summary="Failed invoice",
                        description="Attempted invoice execution.",
                        payload={"invoice_id": "INV-1"},
                        result=None,
                        error_detail="Preview was blocked.",
                        created_at=now - timedelta(hours=2, minutes=30),
                        decided_at=now - timedelta(hours=2),
                        decided_by="ops_lead",
                    ),
                    AssistantActionRequest(
                        run_id=watch_run.id,
                        status="REJECTED",
                        user_id="ops_alpha",
                        session_id="watch-session",
                        workspace="assistant",
                        agent_id="watch-agent",
                        agent_name="Watch Agent",
                        action_type="cancel_trade",
                        summary="Reject cancellation",
                        description="Cancel a trade.",
                        payload={"trade_id": "T-1"},
                        result=None,
                        error_detail=None,
                        created_at=now - timedelta(hours=1),
                        decided_at=now - timedelta(minutes=50),
                        decided_by="ops_lead",
                    ),
                    AssistantActionRequest(
                        run_id=watch_run.id,
                        status="EXECUTED",
                        user_id="ops_alpha",
                        session_id="watch-session",
                        workspace="assistant",
                        agent_id="watch-agent",
                        agent_name="Watch Agent",
                        action_type="update_trade_workflow_item",
                        summary="Update workflow",
                        description="Update a workflow item.",
                        payload={"workflow_item_id": 1},
                        result={"workflow_item": {"id": 1}},
                        error_detail=None,
                        created_at=now - timedelta(minutes=45),
                        decided_at=now - timedelta(minutes=30),
                        decided_by="ops_lead",
                    ),
                ]
            )
            session.commit()
        self._create_work_package(
            work_package_id="policy-implemented-pr-tests",
            title="Implemented package with PR and tests",
            status="IMPLEMENTED",
            source_agent_id="watch-agent",
            source_agent_name="Watch Agent",
            implementation_evidence={
                "pr_url": "https://github.com/org/repo/pull/123",
                "commit_sha": "abc123def456",
                "test_names": ["apps.api.tests.test_assistant_api"],
            },
            now=now,
        )
        self._create_work_package(
            work_package_id="policy-implemented-eval-docs",
            title="Implemented package with evals and docs",
            status="IMPLEMENTED",
            source_agent_id="risky-agent",
            source_agent_name="Risky Agent",
            implementation_evidence={
                "eval_ids": [12],
                "test_names": ["apps.api.tests.test_assistant_agent_health_review"],
                "doc_paths": ["docs/engineering/agent-knowledge-base.md"],
            },
            now=now - timedelta(minutes=5),
        )
        self._create_work_package(
            work_package_id="policy-in-progress",
            title="Policy package in progress",
            status="IN_PROGRESS",
            source_agent_id="watch-agent",
            source_agent_name="Watch Agent",
            implementation_evidence={},
            now=now - timedelta(minutes=10),
        )
        self._create_work_package(
            work_package_id="policy-stale-accepted",
            title="Accepted package still waiting on shipped proof",
            status="ACCEPTED",
            source_agent_id="risky-agent",
            source_agent_name="Risky Agent",
            implementation_evidence={},
            now=now - timedelta(days=5),
        )
        self._create_work_package(
            work_package_id="policy-stale-in-progress",
            title="In-progress package stalled without shipped proof",
            status="IN_PROGRESS",
            source_agent_id="watch-agent",
            source_agent_name="Watch Agent",
            implementation_evidence={},
            now=now - timedelta(days=4),
        )

        response = self.client.get(
            "/admin/assistant/control-tower/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["created_after"], None)
        self.assertEqual(payload["created_before"], None)
        self.assertEqual(payload["roster"]["total_count"], 5)
        self.assertEqual(payload["roster"]["active_count"], 2)
        self.assertEqual(payload["roster"]["draft_count"], 1)
        self.assertEqual(payload["roster"]["paused_count"], 1)
        self.assertEqual(payload["roster"]["retired_count"], 1)
        self.assertEqual(payload["roster"]["action_capable_count"], 1)
        self.assertEqual(payload["roster"]["missing_eval_coverage_count"], 1)
        self.assertEqual(payload["roster"]["policy_warning_count"], 1)

        self.assertEqual(payload["runs"]["total_count"], 2)
        self.assertEqual(payload["runs"]["completed_count"], 1)
        self.assertEqual(payload["runs"]["failed_count"], 1)
        self.assertEqual(payload["runs"]["warning_count"], 1)
        self.assertEqual(payload["runs"]["tool_call_count"], 2)
        self.assertIsNotNone(payload["runs"]["latest_run_at"])

        self.assertEqual(payload["actions"]["total_count"], 4)
        self.assertEqual(payload["actions"]["pending_count"], 1)
        self.assertEqual(payload["actions"]["failed_count"], 1)
        self.assertEqual(payload["actions"]["rejected_count"], 1)
        self.assertEqual(payload["actions"]["executed_count"], 1)
        self.assertEqual(payload["actions"]["preview_blocked_count"], 1)
        oldest_pending = payload["actions"]["oldest_pending_action"]
        self.assertEqual(oldest_pending["agent_id"], "risky-agent")
        self.assertEqual(oldest_pending["action_type"], "issue_trade_invoice")
        self.assertGreaterEqual(oldest_pending["age_seconds"], 4 * 60 * 60)

        self.assertEqual(payload["work_packages"]["total_count"], 5)
        self.assertEqual(payload["work_packages"]["accepted_count"], 1)
        self.assertEqual(payload["work_packages"]["in_progress_count"], 2)
        self.assertEqual(payload["work_packages"]["implemented_count"], 2)
        self.assertEqual(payload["work_packages"]["dismissed_count"], 0)
        self.assertEqual(payload["work_packages"]["stale_count"], 2)
        self.assertEqual(payload["work_packages"]["stale_accepted_count"], 1)
        self.assertEqual(payload["work_packages"]["stale_in_progress_count"], 1)
        self.assertEqual(payload["work_packages"]["implemented_with_pr_count"], 1)
        self.assertEqual(payload["work_packages"]["implemented_with_commit_count"], 1)
        self.assertEqual(payload["work_packages"]["implemented_with_eval_count"], 1)
        self.assertEqual(payload["work_packages"]["implemented_with_tests_count"], 2)
        self.assertEqual(payload["work_packages"]["implemented_with_docs_count"], 1)
        self.assertEqual(payload["work_packages"]["implemented_missing_evidence_count"], 0)

        signals = {(row["agent_id"], row["signal_type"]): row for row in payload["trust_signals"]}
        self.assertIn(("risky-agent", "MISSING_EVAL_COVERAGE"), signals)
        self.assertIn(("risky-agent", "POLICY_WARNING"), signals)
        self.assertIn(("risky-agent", "ACTION_BACKLOG"), signals)
        self.assertIn(("risky-agent", "FAILED_ACTIONS"), signals)
        self.assertIn(("risky-agent", "STALE_WORK_PACKAGE"), signals)
        self.assertIn(("watch-agent", "STALE_WORK_PACKAGE"), signals)
        self.assertIn(("watch-agent", "RUN_WARNING"), signals)
        self.assertEqual(signals[("risky-agent", "POLICY_WARNING")]["severity"], "danger")
        self.assertEqual(signals[("risky-agent", "MISSING_EVAL_COVERAGE")]["eval_status"], "BLOCKED")
        self.assertEqual(signals[("risky-agent", "STALE_WORK_PACKAGE")]["severity"], "warning")
        self.assertEqual(signals[("watch-agent", "STALE_WORK_PACKAGE")]["severity"], "danger")
        self.assertIn(
            "Accepted",
            signals[("risky-agent", "STALE_WORK_PACKAGE")]["details"][0],
        )
        self.assertIn(
            "In Progress",
            signals[("watch-agent", "STALE_WORK_PACKAGE")]["details"][0],
        )
        self.assertIn(
            "must declare explicit allowed_action_types",
            signals[("risky-agent", "POLICY_WARNING")]["details"][0],
        )

    def test_admin_control_tower_summary_requires_admin_role(self) -> None:
        token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )

        response = self.client.get(
            "/admin/assistant/control-tower/summary",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_assistant_run_audit_trace_links_approved_action_mutation(self) -> None:
        admin_token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=admin_token,
            trade_id="T-1016",
        )

        approve_response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(approve_response.status_code, 200)
        event_id = approve_response.json()["result"]["event_id"]

        with self.SessionLocal() as session:
            action_request = session.get(AssistantActionRequest, action_request_id)
            assert action_request is not None
            run_id = action_request.run_id

        response = self.client.get(
            f"/admin/assistant/runs/{run_id}/audit-trace",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["run"]["run_id"], run_id)
        self.assertEqual(payload["mutation_event_count"], 1)
        self.assertEqual(payload["action_requests"][0]["action_request"]["action_request_id"], action_request_id)
        self.assertEqual(payload["action_requests"][0]["mutation_events"][0]["event_id"], event_id)
        self.assertEqual(payload["action_requests"][0]["mutation_events"][0]["event_type"], "TradeCancelled")
        self.assertIn("mutation", [entry["entry_type"] for entry in payload["timeline"]])

    def test_admin_assistant_run_audit_trace_keeps_rejected_action_mutation_free(self) -> None:
        admin_token = self._create_session_token()
        action_request_id = self._create_cancel_trade_action_request(
            token=admin_token,
            trade_id="T-1017",
        )

        reject_response = self.client.post(
            f"/assistant/action-requests/{action_request_id}/reject",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(reject_response.status_code, 200)

        with self.SessionLocal() as session:
            action_request = session.get(AssistantActionRequest, action_request_id)
            assert action_request is not None
            run_id = action_request.run_id

        response = self.client.get(
            f"/admin/assistant/runs/{run_id}/audit-trace",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mutation_event_count"], 0)
        self.assertEqual(payload["action_requests"][0]["mutation_events"], [])
        self.assertIn("decision", [entry["entry_type"] for entry in payload["timeline"]])
        self.assertNotIn("mutation", [entry["entry_type"] for entry in payload["timeline"]])

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

    def test_assistant_prompt_prefetches_workspace_summary_candidates_for_open_invoices(self) -> None:
        token = self._create_session_token()
        captured_requests: list[dict[str, object]] = []
        now = datetime(2026, 4, 23, 16, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id="evt-t-invoice-prefetch",
                    aggregate_type="trade",
                    aggregate_id="T-INVOICE-PREFETCH",
                    event_type="TradeCreated",
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="assistant_user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-INVOICE-PREFETCH"},
                )
            )
            session.add(
                Trade(
                    trade_id="T-INVOICE-PREFETCH",
                    external_trade_id="EXT-T-INVOICE-PREFETCH",
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now - timedelta(days=2),
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
                    confirmation_status="CONFIRMED",
                    nomination_status="COMPLETED",
                    allocation_status="COMPLETED",
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    price_index_code=None,
                    price=75.25,
                    volume=1000,
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-t-invoice-prefetch",
                )
            )
            session.commit()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_requests.append(payload)
            return {
                "output_text": "Prefetched invoice candidates.",
                "usage": {"input_tokens": 28, "output_tokens": 9},
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
                    "workspace": "settlement",
                    "use_live_tools": True,
                    "messages": [
                        {"role": "assistant", "content": "Workspace summary shows open invoices that still need issuing."},
                        {"role": "user", "content": "Let's handle the open invoices."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["message"]["content"], "Prefetched invoice candidates.")
        self.assertEqual(payload["tool_calls"], [])

        self.assertEqual(len(captured_requests), 1)
        first_request = captured_requests[0]
        self.assertIn("Live Tool Prefetch: get_workspace_summary", first_request["instructions"])
        self.assertIn("tool: list_invoice_issue_candidates", first_request["instructions"])
        self.assertIn("T-INVOICE-PREFETCH", first_request["instructions"])
        self.assertIn("Top priority is T-INVOICE-PREFETCH because", first_request["instructions"])

        run_detail = self.client.get(
            f"/assistant/runs/{payload['run_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(run_detail.status_code, 200)
        tool_sections = [
            section
            for section in run_detail.json()["prompt_sections"]
            if section["source"] == "tool"
        ]
        self.assertGreaterEqual(len(tool_sections), 2)
        self.assertTrue(
            any("tool: list_invoice_issue_candidates" in section["content"] for section in tool_sections)
        )

    def test_assistant_prompt_prefetches_workspace_summary_candidates_from_explicit_summary_targets(self) -> None:
        token = self._create_session_token()
        captured_requests: list[dict[str, object]] = []
        now = datetime(2026, 4, 23, 16, 0, tzinfo=timezone.utc)

        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id="evt-t-summary-target-prefetch",
                    aggregate_type="trade",
                    aggregate_id="T-SUMMARY-TARGET-PREFETCH",
                    event_type="TradeCreated",
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="assistant_user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": "T-SUMMARY-TARGET-PREFETCH"},
                )
            )
            session.add(
                Trade(
                    trade_id="T-SUMMARY-TARGET-PREFETCH",
                    external_trade_id="EXT-T-SUMMARY-TARGET-PREFETCH",
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now - timedelta(days=3),
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
                    confirmation_status="CONFIRMED",
                    nomination_status="COMPLETED",
                    allocation_status="COMPLETED",
                    invoice_status="PENDING",
                    payment_status="PENDING",
                    settlement_status="PENDING",
                    price_index_code=None,
                    price=74.5,
                    volume=500,
                    trader_user="assistant_user",
                    status="ACTIVE",
                    last_event_id="evt-t-summary-target-prefetch",
                )
            )
            session.commit()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_requests.append(payload)
            return {
                "output_text": "Explicit summary targets prefetched invoice candidates.",
                "usage": {"input_tokens": 24, "output_tokens": 8},
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
                    "summary_targets": ["settlement.invoice_pending_count"],
                    "use_live_tools": True,
                    "messages": [
                        {"role": "user", "content": "Start with the first one."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["message"]["content"],
            "Explicit summary targets prefetched invoice candidates.",
        )

        self.assertEqual(len(captured_requests), 1)
        first_request = captured_requests[0]
        self.assertIn("Requested Workspace Summary Focus", first_request["instructions"])
        self.assertIn("settlement.invoice_pending_count", first_request["instructions"])
        self.assertIn("tool: list_invoice_issue_candidates", first_request["instructions"])
        self.assertIn("T-SUMMARY-TARGET-PREFETCH", first_request["instructions"])
        self.assertIn("Top priority is T-SUMMARY-TARGET-PREFETCH because", first_request["instructions"])

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

    def test_assistant_run_feedback_records_user_feedback_and_reloads_conversation(self) -> None:
        token = self._create_session_token()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Feedback-ready answer.",
                "usage": {"input_tokens": 18, "output_tokens": 6},
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
                    "messages": [
                        {"role": "user", "content": "Explain the selected exposure."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        prompt_payload = response.json()
        run_id = prompt_payload["run_id"]
        conversation_id = prompt_payload["conversation_id"]

        feedback_response = self.client.post(
            f"/assistant/runs/{run_id}/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json={"rating": "NEEDS_WORK", "comment": "Cite the exposure records next time."},
        )

        self.assertEqual(feedback_response.status_code, 200)
        feedback_payload = feedback_response.json()
        self.assertEqual(feedback_payload["run_id"], run_id)
        self.assertEqual(feedback_payload["conversation_id"], conversation_id)
        self.assertEqual(feedback_payload["user_id"], "assistant_user")
        self.assertEqual(feedback_payload["rating"], "NEEDS_WORK")
        self.assertEqual(feedback_payload["comment"], "Cite the exposure records next time.")

        update_response = self.client.post(
            f"/assistant/runs/{run_id}/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json={"rating": "HELPFUL"},
        )

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["feedback_id"], feedback_payload["feedback_id"])
        self.assertEqual(update_response.json()["rating"], "HELPFUL")
        self.assertIsNone(update_response.json()["comment"])

        detail_response = self.client.get(
            f"/assistant/conversations/{conversation_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(detail_response.status_code, 200)
        assistant_message = next(
            message for message in detail_response.json()["messages"] if message["role"] == "assistant"
        )
        self.assertEqual(assistant_message["feedback"]["feedback_id"], feedback_payload["feedback_id"])
        self.assertEqual(assistant_message["feedback"]["rating"], "HELPFUL")

        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantRunFeedback).count(), 1)

    def test_assistant_run_feedback_is_scoped_to_accessible_runs(self) -> None:
        owner_token = self._create_session_token()
        other_token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Owner-only answer.",
                "usage": {"input_tokens": 10, "output_tokens": 4},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "Summarize my queue."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        run_id = response.json()["run_id"]

        feedback_response = self.client.post(
            f"/assistant/runs/{run_id}/feedback",
            headers={"Authorization": f"Bearer {other_token}"},
            json={"rating": "HELPFUL"},
        )

        self.assertEqual(feedback_response.status_code, 403)
        self.assertIn("do not have access", feedback_response.json()["detail"])

    def test_assistant_prompt_navigation_outcomes_record_distinct_route_feedback(self) -> None:
        token = self._create_session_token()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Use operations for the confirmation blocker.",
                "usage": {"input_tokens": 12, "output_tokens": 5},
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
                    "messages": [
                        {"role": "user", "content": "Where should I handle the confirmation blocker?"},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        run_id = response.json()["run_id"]
        conversation_id = response.json()["conversation_id"]

        accepted_response = self.client.post(
            f"/assistant/runs/{run_id}/prompt-navigation-outcomes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "outcome": "ACCEPTED",
                "intent_key": "open_workspace|operations|trade|TRD-1001|||Open Work Queue",
                "target_view": "operations",
                "target_label": "Open Work Queue",
                "target_rationale": "Review the blocker in operations.",
                "focus_type": "trade",
                "focus_id": "TRD-1001",
                "focus_label": "TRD-1001",
            },
        )

        self.assertEqual(accepted_response.status_code, 200)
        accepted_payload = accepted_response.json()
        self.assertEqual(accepted_payload["run_id"], run_id)
        self.assertEqual(accepted_payload["conversation_id"], conversation_id)
        self.assertEqual(accepted_payload["surface"], "PROMPT_HOME")
        self.assertEqual(accepted_payload["outcome"], "ACCEPTED")
        self.assertEqual(accepted_payload["target_view"], "operations")

        duplicate_response = self.client.post(
            f"/assistant/runs/{run_id}/prompt-navigation-outcomes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "outcome": "ACCEPTED",
                "intent_key": "open_workspace|operations|trade|TRD-1001|||Open Work Queue",
                "target_view": "operations",
                "target_label": "Open Work Queue",
                "detail": "The user followed the route.",
            },
        )

        self.assertEqual(duplicate_response.status_code, 200)
        self.assertEqual(duplicate_response.json()["outcome_id"], accepted_payload["outcome_id"])
        self.assertEqual(duplicate_response.json()["detail"], "The user followed the route.")

        dismissed_response = self.client.post(
            f"/assistant/runs/{run_id}/prompt-navigation-outcomes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "outcome": "DISMISSED",
                "intent_key": "open_workspace|operations|trade|TRD-1001|||Open Work Queue",
                "target_view": "operations",
                "target_label": "Open Work Queue",
            },
        )

        self.assertEqual(dismissed_response.status_code, 200)
        self.assertEqual(dismissed_response.json()["outcome"], "DISMISSED")
        self.assertNotEqual(dismissed_response.json()["outcome_id"], accepted_payload["outcome_id"])

        with self.SessionLocal() as session:
            self.assertEqual(session.query(AssistantPromptNavigationOutcome).count(), 2)

    def test_assistant_prompt_navigation_outcomes_are_scoped_to_accessible_runs(self) -> None:
        owner_token = self._create_session_token()
        other_token = self._create_session_token(
            user_id="desk_user",
            email="desk@example.com",
            display_name="Desk User",
            role="TRADER",
        )

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Use operations for the confirmation blocker.",
                "usage": {"input_tokens": 10, "output_tokens": 4},
            }

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "provider": "openai",
                    "workspace": "assistant",
                    "messages": [
                        {"role": "user", "content": "Where should I handle the confirmation blocker?"},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        run_id = response.json()["run_id"]

        outcome_response = self.client.post(
            f"/assistant/runs/{run_id}/prompt-navigation-outcomes",
            headers={"Authorization": f"Bearer {other_token}"},
            json={
                "outcome": "ACCEPTED",
                "intent_key": "open_workspace|operations|trade|TRD-1001|||Open Work Queue",
                "target_view": "operations",
            },
        )

        self.assertEqual(outcome_response.status_code, 403)
        self.assertIn("do not have access", outcome_response.json()["detail"])

    def test_prompt_home_navigation_outcomes_can_be_recorded_without_an_assistant_run(self) -> None:
        token = self._create_session_token()

        first_response = self.client.post(
            "/assistant/prompt-navigation-outcomes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "outcome": "ACCEPTED",
                "intent_key": "open_workspace|operations|trade|T-AMEND-100|41||Open confirmation",
                "target_view": "operations",
                "target_label": "Open confirmation",
                "target_rationale": "Review the confirmation blocker with the operations owner.",
                "focus_type": "trade",
                "focus_id": "T-AMEND-100",
                "focus_label": "T-AMEND-100",
            },
        )

        self.assertEqual(first_response.status_code, 200)
        first_payload = first_response.json()
        self.assertIsNone(first_payload["run_id"])
        self.assertIsNone(first_payload["conversation_id"])
        self.assertEqual(first_payload["target_label"], "Open confirmation")

        second_response = self.client.post(
            "/assistant/prompt-navigation-outcomes",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "outcome": "ACCEPTED",
                "intent_key": "open_workspace|operations|trade|T-AMEND-101|44||Open confirmation",
                "target_view": "operations",
                "target_label": "Open confirmation",
                "target_rationale": "Review the confirmation blocker with the operations owner.",
                "focus_type": "trade",
                "focus_id": "T-AMEND-101",
                "focus_label": "T-AMEND-101",
            },
        )

        self.assertEqual(second_response.status_code, 200)
        self.assertNotEqual(second_response.json()["outcome_id"], first_payload["outcome_id"])

        with self.SessionLocal() as session:
            outcomes = session.query(AssistantPromptNavigationOutcome).order_by(AssistantPromptNavigationOutcome.id.asc()).all()
            self.assertEqual(len(outcomes), 2)
            self.assertIsNone(outcomes[0].run_id)
            self.assertEqual(outcomes[0].target_label, "Open confirmation")

    def test_assistant_prompt_route_recommendations_are_role_scoped_and_promote_candidates(self) -> None:
        ops_token = self._create_session_token()
        trader_token = self._create_session_token(
            user_id="trader_alpha",
            email="trader.alpha@example.com",
            display_name="Trader Alpha",
            role="TRADER",
        )
        now = datetime.now(timezone.utc)

        with self.SessionLocal() as session:
            for role, user_id, target_view, target_label, target_rationale, focus_type in [
                (
                    "OPS_ADMIN",
                    "ops_admin",
                    "operations",
                    "Open Work Queue",
                    "Use operations for confirmation blockers and handoffs.",
                    None,
                ),
                (
                    "TRADER",
                    "trader_alpha",
                    "trades",
                    "Open Trade Capture",
                    "Use Trade Capture for trade inspection and amendment follow-through.",
                    None,
                ),
            ]:
                for index in range(3):
                    created_at = now - timedelta(days=1, minutes=index)
                    session_id = f"{role.lower()}-prompt-route-{index}"
                    run = AssistantRun(
                        conversation_id=None,
                        status="COMPLETED",
                        user_id=user_id,
                        session_id=session_id,
                        user_role=role,
                        workspace="assistant",
                        agent_id=None,
                        agent_name=None,
                        agent_role_key=None,
                        agent_profile_kind=None,
                        provider="openai",
                        model="gpt-5-mini",
                        use_live_tools=False,
                        request_messages=[{"role": "user", "content": "Where should I go next?"}],
                        application_context=None,
                        prompt_sections=[],
                        rendered_system_prompt="System prompt.",
                        warnings=[],
                        tool_calls=[],
                        input_tokens=12,
                        output_tokens=6,
                        latest_user_message="Where should I go next?",
                        assistant_message=target_rationale,
                        error_detail=None,
                        created_at=created_at,
                        completed_at=created_at,
                    )
                    session.add(run)
                    session.flush()
                    session.add(
                        AssistantPromptNavigationOutcome(
                            run_id=run.id,
                            conversation_id=None,
                            user_id=user_id,
                            session_id=session_id,
                            user_role=role,
                            surface="PROMPT_HOME",
                            outcome="ACCEPTED",
                            intent_key=f"open_workspace|{target_view}|workspace|workspace|||{target_label}",
                            target_view=target_view,
                            target_label=target_label,
                            target_rationale=target_rationale,
                            focus_type=focus_type,
                            focus_id=None,
                            focus_label=None,
                            detail=None,
                            created_at=created_at,
                            updated_at=created_at,
                        )
                    )
            for index in range(3):
                created_at = now - timedelta(hours=2, minutes=index)
                session.add(
                    AssistantPromptNavigationOutcome(
                        run_id=None,
                        conversation_id=None,
                        user_id="ops_admin",
                        session_id=f"ops-promoted-route-{index}",
                        user_role="OPS_ADMIN",
                        surface="PROMPT_HOME",
                        outcome="ACCEPTED",
                        intent_key=f"open_workspace|operations|trade|T-AMEND-10{index}|41||Open confirmation",
                        target_view="operations",
                        target_label="Open confirmation",
                        target_rationale="Review the confirmation blocker with the operations owner.",
                        focus_type="trade",
                        focus_id=f"T-AMEND-10{index}",
                        focus_label=f"T-AMEND-10{index}",
                        detail=None,
                        created_at=created_at,
                        updated_at=created_at,
                    )
                )
            session.commit()

        ops_response = self.client.get(
            "/assistant/prompt-route-recommendations",
            headers={"Authorization": f"Bearer {ops_token}"},
        )

        self.assertEqual(ops_response.status_code, 200)
        ops_payload = ops_response.json()
        self.assertEqual(len(ops_payload), 2)
        self.assertEqual(ops_payload[0]["target_view"], "operations")
        self.assertEqual(ops_payload[0]["target_label"], "Open confirmation")
        self.assertEqual(ops_payload[0]["focus_type"], "trade")
        self.assertEqual(ops_payload[0]["accepted_count"], 3)
        self.assertEqual(ops_payload[0]["outcome_count"], 3)
        self.assertEqual(ops_payload[0]["acceptance_rate"], 1.0)
        self.assertEqual(ops_payload[0]["signal"], "CANDIDATE_FOR_RULE")
        self.assertIn("deterministic rule candidate", ops_payload[0]["signal_reasons"][0])
        self.assertEqual(ops_payload[1]["target_label"], "Open Work Queue")

        trader_response = self.client.get(
            "/assistant/prompt-route-recommendations",
            headers={"Authorization": f"Bearer {trader_token}"},
        )

        self.assertEqual(trader_response.status_code, 200)
        trader_payload = trader_response.json()
        self.assertEqual(len(trader_payload), 1)
        self.assertEqual(trader_payload[0]["target_view"], "trades")
        self.assertEqual(trader_payload[0]["target_label"], "Open Trade Capture")

    def test_prepare_assistant_execution_does_not_persist_new_conversation(self) -> None:
        token = self._create_session_token()
        payload = AssistantPromptRequest.model_validate(
            {
                "provider": "openai",
                "workspace": "assistant",
                "messages": [
                    {"role": "user", "content": "What can you help me do?"},
                ],
            }
        )

        with self.SessionLocal() as session:
            prepared = prepare_assistant_execution(
                db=session,
                payload=payload,
                authorization_header=f"Bearer {token}",
            )
            self.assertIsNone(prepared.conversation)
            self.assertEqual(session.query(AssistantConversation).count(), 0)

    def test_assistant_conversation_listing_excludes_empty_threads(self) -> None:
        token = self._create_session_token()

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, payload, provider_label
            return {
                "output_text": "Saved answer.",
                "usage": {"input_tokens": 10, "output_tokens": 4},
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
                    "messages": [
                        {"role": "user", "content": "Persist this conversation."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        valid_conversation_id = response.json()["conversation_id"]

        now = datetime.now(timezone.utc) + timedelta(minutes=1)
        with self.SessionLocal() as session:
            session.add(
                AssistantConversation(
                    user_id="assistant_user",
                    session_id="legacy-session",
                    user_role="OPS_ADMIN",
                    workspace="assistant",
                    agent_id=None,
                    agent_name=None,
                    provider="openai",
                    model="gpt-5-mini",
                    use_live_tools=False,
                    title="Empty legacy conversation",
                    run_count=0,
                    latest_run_id=None,
                    latest_user_message=None,
                    latest_assistant_message=None,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()

        conversations_response = self.client.get(
            "/assistant/conversations",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(conversations_response.status_code, 200)
        self.assertEqual(
            [conversation["conversation_id"] for conversation in conversations_response.json()],
            [valid_conversation_id],
        )

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

        conversation_data = self._decode_last_sse_event_payload(stream_body, "conversation")
        self.assertEqual(conversation_data["run_count"], 1)
        self.assertEqual(conversation_data["latest_user_message"], "Stream this reply.")

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

    def _seed_repeated_workflow_action_candidates(self, *, now: datetime) -> None:
        with self.SessionLocal() as session:
            for index, agent_id in enumerate(("workflow-alpha", "workflow-beta")):
                agent_name = f"Workflow {index + 1}"
                agent = AssistantAgent(
                    agent_id=agent_id,
                    name=agent_name,
                    description="Stages workflow updates for operations review.",
                    status="ACTIVE",
                    scope="TEAM",
                    provider="openai",
                    model="gpt-5-mini",
                    role_key="trade-ops-copilot",
                    profile_kind="ROLE_DERIVED",
                    specialization_summary="Workflow item update specialist.",
                    human_owner_role="Operations Lead",
                    authority_ceiling="STAGE",
                    activation_notes="Approved for staged workflow update review.",
                    profile_request_id=None,
                    allowed_workspaces=["assistant", "operations"],
                    capabilities=["READ", "EXPLAIN", "ACTION"],
                    allowed_tools=["list_workflow_items"],
                    allowed_action_types=["update_trade_workflow_item"],
                    daily_token_allocation=None,
                    system_prompt="Stage only reviewable workflow updates.",
                    created_at=now - timedelta(days=1),
                    created_by="ops_admin",
                    updated_at=now - timedelta(days=1),
                    updated_by="ops_admin",
                    version=1,
                )
                run = AssistantRun(
                    conversation_id=None,
                    status="COMPLETED",
                    user_id=f"ops_{index}",
                    session_id=f"workflow-session-{index}",
                    user_role="OPS_ADMIN",
                    workspace="operations",
                    agent_id=agent_id,
                    agent_name=agent_name,
                    agent_role_key="trade-ops-copilot",
                    agent_profile_kind="ROLE_DERIVED",
                    provider="openai",
                    model="gpt-5-mini",
                    use_live_tools=False,
                    request_messages=[{"role": "user", "content": "Review workflow items."}],
                    application_context=None,
                    prompt_sections=[],
                    rendered_system_prompt="System prompt.",
                    warnings=[],
                    tool_calls=[],
                    input_tokens=100,
                    output_tokens=40,
                    latest_user_message="Review workflow items.",
                    assistant_message="Staged workflow updates.",
                    error_detail=None,
                    created_at=now - timedelta(hours=2),
                    completed_at=now - timedelta(hours=2),
                )
                session.add_all([agent, run])
                session.flush()
                session.add(
                    AssistantActionRequest(
                        run_id=run.id,
                        status="EXECUTED",
                        user_id=f"ops_{index}",
                        session_id=f"workflow-session-{index}",
                        workspace="operations",
                        agent_id=agent_id,
                        agent_name=agent_name,
                        action_type="update_trade_workflow_item",
                        summary="Workflow update",
                        description="Update a workflow item.",
                        payload={"review_context": {"stale_state_basis": {"version": index}}},
                        result={"workflow_item": {"id": index + 1}},
                        error_detail=None,
                        created_at=now - timedelta(minutes=30 + index),
                        decided_at=now - timedelta(minutes=20 + index),
                        decided_by="ops_lead",
                    )
                )
            session.commit()

    def _create_work_package(
        self,
        *,
        work_package_id: str,
        title: str,
        status: str,
        source_agent_id: str = "workflow-alpha",
        source_agent_name: str = "Workflow Alpha",
        implementation_evidence: dict[str, object] | None = None,
        owner_role: str = "Operations Lead",
        now: datetime | None = None,
    ) -> None:
        resolved_now = now or datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                AssistantAgentWorkPackage(
                    work_package_id=work_package_id,
                    title=title,
                    package_type="POLICY",
                    priority="P2",
                    status=status,
                    source_agent_ids=[source_agent_id],
                    source_agent_names=[source_agent_name],
                    source_recommendations=["KEEP_STAGED"],
                    source_candidates=["Promote recurring reviewer decisions into typed policy."],
                    recommended_owner_role=owner_role,
                    rationale="Autonomy review surfaced a recurring deterministic candidate.",
                    acceptance_checks=["Run policy simulation before rollout."],
                    knowledge_base_titles=[],
                    implementation_evidence=implementation_evidence or {},
                    accepted_at=resolved_now - timedelta(hours=4),
                    accepted_by="ops_admin",
                    implemented_at=resolved_now - timedelta(hours=1) if status == "IMPLEMENTED" else None,
                    implemented_by="ops_admin" if status == "IMPLEMENTED" else None,
                    notes="Tracked in the backlog.",
                    created_at=resolved_now - timedelta(hours=4),
                    created_by="ops_admin",
                    updated_at=resolved_now,
                    updated_by="ops_admin",
                )
            )
            session.commit()

    def _create_agent(
        self,
        *,
        agent_id: str,
        name: str,
        status: str,
        allowed_workspaces: list[str],
        capabilities: list[str],
        scope: str = "TEAM",
        allowed_tools: list[str] | None = None,
        allowed_action_types: list[str] | None = None,
        provider: str | None = None,
        model: str | None = None,
        role_key: str | None = None,
        profile_kind: str = "CUSTOM",
        specialization_summary: str | None = None,
        human_owner_role: str | None = None,
        authority_ceiling: str | None = None,
        activation_notes: str | None = None,
        daily_token_allocation: int | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        resolved_allowed_tools = (
            list(allowed_tools)
            if allowed_tools is not None
            else [tool.name for tool in build_tool_definitions()]
            if "READ" in {capability.upper() for capability in capabilities}
            else []
        )
        resolved_allowed_action_types = (
            list(allowed_action_types)
            if allowed_action_types is not None
            else list(ALL_ASSISTANT_ACTION_TYPES)
            if "ACTION" in {capability.upper() for capability in capabilities}
            else []
        )
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
                    scope=scope,
                    provider=provider,
                    model=model,
                    role_key=role_key,
                    profile_kind=profile_kind,
                    specialization_summary=specialization_summary,
                    human_owner_role=human_owner_role,
                    authority_ceiling=authority_ceiling,
                    activation_notes=activation_notes,
                    allowed_workspaces=allowed_workspaces,
                    capabilities=capabilities,
                    allowed_tools=resolved_allowed_tools,
                    allowed_action_types=resolved_allowed_action_types,
                    daily_token_allocation=daily_token_allocation,
                    system_prompt=f"System prompt for {name}.",
                    created_at=now,
                    created_by="test-suite",
                    updated_at=now,
                    updated_by="test-suite",
                    version=1,
                )
            )
            session.commit()

    def _create_assistant_run(
        self,
        *,
        agent_id: str,
        input_tokens: int,
        output_tokens: int,
    ) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                AssistantRun(
                    conversation_id=None,
                    status="COMPLETED",
                    user_id="assistant_user",
                    session_id="test-session",
                    user_role="TRADER",
                    workspace="assistant",
                    agent_id=agent_id,
                    agent_name=agent_id,
                    provider="openai",
                    model="gpt-5-mini",
                    use_live_tools=False,
                    request_messages=[{"role": "user", "content": "Hello"}],
                    application_context=None,
                    prompt_sections=[],
                    rendered_system_prompt="System prompt.",
                    warnings=[],
                    tool_calls=[],
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latest_user_message="Hello",
                    assistant_message="Hi.",
                    error_detail=None,
                    created_at=now,
                    completed_at=now,
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

    def _seed_payment_record(
        self,
        *,
        trade_id: str,
        invoice_id: int,
        payment_id: int,
        payment_reference: str,
        payment_amount: float,
    ) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                TradePayment(
                    id=payment_id,
                    trade_id=trade_id,
                    invoice_id=invoice_id,
                    payment_reference=payment_reference,
                    payment_currency_code="USD",
                    payment_amount=payment_amount,
                    status="PAID",
                    due_at=now + timedelta(days=5),
                    received_at=now,
                    notes="Assistant API payment fixture",
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
