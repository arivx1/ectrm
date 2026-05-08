from __future__ import annotations

import copy
import enum
import unittest
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
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
from apps.api.app.domains.reports.services.pretrade_recommendations import (
    build_recommendation_run_payload,
    prepare_pretrade_recommendation_evaluation,
)
from apps.api.app.domains.reports.services.pretrade_reviews import PRETRADE_SHARED_OWNER_KEY
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval, AssistantAgentEvalRun
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.document_ingestion import DocumentIngestion
from apps.api.app.models.document_ingestion_page import DocumentIngestionPage
from apps.api.app.models.event import Event
from apps.api.app.models.report_preset import ReportPreset
from apps.api.app.models.trade import Trade
from apps.api.app.models.trade_invoice import TradeInvoice
from apps.api.app.models.trade_payment import TradePayment
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas.pretrade import (
    PreTradeRecommendationSourceProvenance,
    PreTradeRecommendationSourceSnapshot,
    PreTradeScenarioDraft,
)
from apps.api.app.schemas.assistant import ALL_ASSISTANT_ACTION_TYPES


@dataclass(frozen=True)
class AssistantEvalTradeFixture:
    trade_id: str
    commodity: str = "WTI"
    book: str = "CRUDE"
    portfolio: str = "PROMPT"
    counterparty: str = "ACME"
    status: str = "ACTIVE"
    price: float = 75.25
    volume: int = 1000
    event_type: str = "TradeCreated"


@dataclass(frozen=True)
class AssistantEvalAgentFixture:
    agent_id: str
    name: str
    capabilities: tuple[str, ...]
    allowed_workspaces: tuple[str, ...] = ("assistant",)
    allowed_tools: tuple[str, ...] = ()
    allowed_action_types: tuple[str, ...] = ()
    skills: tuple[str, ...] = ()
    role_key: str | None = None
    profile_kind: str = "CUSTOM"
    specialization_summary: str | None = None
    human_owner_role: str | None = None
    authority_ceiling: str | None = None
    orchestration_pattern: str = "SINGLE"
    parent_agent_id: str | None = None
    managed_agent_ids: tuple[str, ...] = ()
    delegation_guidance: str | None = None
    status: str = "ACTIVE"
    scope: str = "TEAM"
    provider: str | None = "openai"
    model: str | None = "gpt-5-mini"
    system_prompt: str | None = None
    publish: bool = True


@dataclass(frozen=True)
class AssistantEvalUserFixture:
    user_id: str
    email: str
    display_name: str
    role: str = "OPS_ADMIN"


@dataclass(frozen=True)
class AssistantEvalInvoiceFixture:
    trade_id: str
    invoice_id: int
    invoice_number: str
    invoice_amount: float
    status: str = "ISSUED"


@dataclass(frozen=True)
class AssistantEvalDocumentFixture:
    document_id: str
    status: str = "ANALYZED"
    review_status: str = "REVIEWED"
    processor_provider: str = "anthropic"
    processor_model: str = "claude-test"


@dataclass(frozen=True)
class AssistantEvalPreTradeRecommendationFixture:
    actor_id: str
    source_scenario_id: int | None = None
    source_review_id: int | None = None
    book: str = "GAS-US"
    commodity_class: str = "NATURAL_GAS"
    commodity: str = "HENRY_HUB"
    pricing_type: str = "FLOATING"
    trade_side: str = "BUY"
    target_price: float = 3.18
    target_volume: float = 8000
    current_net_position: float = 18000
    related_active_trade_count: int = 2
    latest_mark: float = 3.05
    price_index_code: str = "HH"
    thesis: str = "Desk hedging review."
    created_at: datetime = datetime(2026, 4, 20, 12, 0, tzinfo=timezone.utc)


@dataclass(frozen=True)
class AssistantEvalExpectations:
    http_status: int = 200
    provider: str = "openai"
    model: str = "gpt-5-mini"
    agent_id: str | None = None
    agent_name: str | None = None
    run_status: str | None = "COMPLETED"
    message_contains: tuple[str, ...] = ()
    warning_count: int | None = None
    warning_contains: tuple[str, ...] = ()
    warning_absent: tuple[str, ...] = ()
    tool_names: tuple[str, ...] | None = None
    tool_call_summary_contains: tuple[str, ...] = ()
    action_request_types: tuple[str, ...] | None = None
    action_request_statuses: tuple[str, ...] | None = None
    action_request_payloads: tuple[dict[str, object], ...] | None = None
    action_request_review_contexts: tuple[dict[str, object], ...] | None = None
    prompt_section_keys: tuple[str, ...] = ()
    prompt_section_absent_keys: tuple[str, ...] = ()
    prompt_section_content_contains: tuple[tuple[str, tuple[str, ...]], ...] = ()
    provider_request_count: int | None = None
    provider_tool_names: tuple[str, ...] | None = None
    provider_tools_key_present: bool | None = None


@dataclass(frozen=True)
class AssistantEvalFollowUpExpectations:
    http_status: int = 200
    action_request_status: str | None = None
    error_detail_contains: tuple[str, ...] = ()
    response_detail_contains: tuple[str, ...] = ()
    result_contains: dict[str, object] = field(default_factory=dict)
    result_is_none: bool | None = None
    trade_statuses: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class AssistantEvalCase:
    name: str
    request_payload: dict[str, Any]
    agent: AssistantEvalAgentFixture | None = None
    agents: tuple[AssistantEvalAgentFixture, ...] = ()
    request_user: AssistantEvalUserFixture | None = None
    trades: tuple[AssistantEvalTradeFixture, ...] = ()
    invoices: tuple[AssistantEvalInvoiceFixture, ...] = ()
    documents: tuple[AssistantEvalDocumentFixture, ...] = ()
    pretrade_recommendations: tuple[AssistantEvalPreTradeRecommendationFixture, ...] = ()
    provider_responses: tuple[dict[str, Any], ...] = ()
    follow_up_action: str | None = None
    follow_up_user: AssistantEvalUserFixture | None = None
    before_follow_up_trade_status_updates: tuple[tuple[str, str], ...] = ()
    follow_up_expectations: AssistantEvalFollowUpExpectations | None = None
    expectations: AssistantEvalExpectations = field(default_factory=AssistantEvalExpectations)


@dataclass(frozen=True)
class AssistantEvalResult:
    response_payload: dict[str, Any]
    run_payload: dict[str, Any] | None
    run_listing_payload: list[dict[str, Any]]
    captured_provider_requests: list[dict[str, Any]]
    follow_up_payload: dict[str, Any] | None = None


class AssistantApiEvalHarness(unittest.TestCase):
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
            "ASSISTANT_MAX_TOOL_ROUNDS": settings.ASSISTANT_MAX_TOOL_ROUNDS,
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
            session.query(AssistantAgentEvalRun).delete()
            session.query(AssistantRun).delete()
            session.query(AssistantAgentEval).delete()
            session.query(AssistantAgent).delete()
            session.query(TradePayment).delete()
            session.query(TradeInvoice).delete()
            session.query(DocumentIngestionPage).delete()
            session.query(DocumentIngestion).delete()
            session.query(ReportPreset).delete()
            session.query(Trade).delete()
            session.query(Event).delete()
            session.query(UserAccount).delete()
            session.commit()

        settings.ASSISTANT_ENABLED = True
        settings.ASSISTANT_DEFAULT_PROVIDER = "openai"
        settings.ASSISTANT_COMPANY_NAME = "Acme Energy"
        settings.ASSISTANT_COMPANY_CONTEXT = "Acme Energy runs an operator-facing commodity trading platform."
        settings.ASSISTANT_BUSINESS_CONTEXT = "Acme tracks trade lifecycle changes through explicit events."
        settings.ASSISTANT_MAX_TOOL_ROUNDS = 4
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

    def run_eval_case(self, case: AssistantEvalCase) -> AssistantEvalResult:
        token = self._create_session_token(case.request_user)

        if case.agent is not None:
            self._create_agent(case.agent)
        for agent in case.agents:
            self._create_agent(agent)
        for trade in case.trades:
            self._create_trade_with_event(trade)
        for invoice in case.invoices:
            self._create_invoice_record(invoice)
        for document in case.documents:
            self._create_document_record(document)
        for recommendation in case.pretrade_recommendations:
            self._create_pretrade_recommendation_run(recommendation)

        queued_responses = [copy.deepcopy(payload) for payload in case.provider_responses]
        captured_provider_requests: list[dict[str, Any]] = []

        async def _fake_post_json(*, url, headers, payload, provider_label):
            del url, headers, provider_label
            captured_provider_requests.append(copy.deepcopy(payload))
            if not queued_responses:
                raise AssertionError(f"No provider response queued for assistant eval case '{case.name}'.")
            return queued_responses.pop(0)

        with patch(
            "apps.api.app.domains.assistant.services.chat._post_json",
            side_effect=_fake_post_json,
        ):
            response = self.client.post(
                "/assistant/respond",
                headers={"Authorization": f"Bearer {token}"},
                json=case.request_payload,
            )

        self.assertEqual(
            response.status_code,
            case.expectations.http_status,
            msg=f"assistant eval case '{case.name}' returned {response.status_code}: {response.text}",
        )

        response_payload = response.json()
        run_payload: dict[str, Any] | None = None
        run_listing_payload: list[dict[str, Any]] = []
        follow_up_payload: dict[str, Any] | None = None

        if response.status_code == 200:
            run_id = response_payload.get("run_id")
            self.assertIsInstance(run_id, int, msg=f"assistant eval case '{case.name}' did not record a run")

            run_detail = self.client.get(
                f"/assistant/runs/{run_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(run_detail.status_code, 200, msg=f"assistant eval case '{case.name}' could not load run detail")
            run_payload = run_detail.json()

            run_listing = self.client.get(
                "/assistant/runs",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(run_listing.status_code, 200, msg=f"assistant eval case '{case.name}' could not list runs")
            run_listing_payload = run_listing.json()
            self.assertTrue(
                any(run["run_id"] == run_id for run in run_listing_payload),
                msg=f"assistant eval case '{case.name}' did not appear in run listing",
            )

        if case.follow_up_action is not None:
            for trade_id, status in case.before_follow_up_trade_status_updates:
                self._set_trade_status(trade_id=trade_id, status=status)
            follow_up_payload = self._run_follow_up_action(
                case=case,
                token=token,
                response_payload=response_payload,
            )

        self._assert_case_result(
            case=case,
            response_payload=response_payload,
            run_payload=run_payload,
            captured_provider_requests=captured_provider_requests,
        )
        if case.follow_up_expectations is not None:
            if follow_up_payload is None:
                self.fail(f"assistant eval case '{case.name}' did not produce a follow-up payload")
            self._assert_follow_up_result(
                case=case,
                follow_up_payload=follow_up_payload,
            )
        return AssistantEvalResult(
            response_payload=response_payload,
            run_payload=run_payload,
            run_listing_payload=run_listing_payload,
            captured_provider_requests=captured_provider_requests,
            follow_up_payload=follow_up_payload,
        )

    def _assert_case_result(
        self,
        *,
        case: AssistantEvalCase,
        response_payload: dict[str, Any],
        run_payload: dict[str, Any] | None,
        captured_provider_requests: list[dict[str, Any]],
    ) -> None:
        expectations = case.expectations

        if expectations.http_status != 200:
            return

        self.assertEqual(response_payload["provider"], expectations.provider, msg=case.name)
        self.assertEqual(response_payload["model"], expectations.model, msg=case.name)
        self.assertEqual(response_payload.get("agent_id"), expectations.agent_id, msg=case.name)
        self.assertEqual(response_payload.get("agent_name"), expectations.agent_name, msg=case.name)

        assistant_message = response_payload["message"]["content"]
        for fragment in expectations.message_contains:
            self.assertIn(fragment, assistant_message, msg=case.name)

        warnings = response_payload["warnings"]
        if expectations.warning_count is not None:
            self.assertEqual(len(warnings), expectations.warning_count, msg=case.name)
        for fragment in expectations.warning_contains:
            self.assertTrue(any(fragment in warning for warning in warnings), msg=case.name)
        for fragment in expectations.warning_absent:
            self.assertTrue(all(fragment not in warning for warning in warnings), msg=case.name)

        if expectations.tool_names is not None:
            actual_tool_names = [tool_call["tool_name"] for tool_call in response_payload["tool_calls"]]
            self.assertEqual(actual_tool_names, list(expectations.tool_names), msg=case.name)
        tool_call_summaries = [str(tool_call.get("summary") or "") for tool_call in response_payload["tool_calls"]]
        for fragment in expectations.tool_call_summary_contains:
            self.assertTrue(any(fragment in summary for summary in tool_call_summaries), msg=case.name)

        if expectations.action_request_types is not None:
            actual_action_types = [action_request["action_type"] for action_request in response_payload["action_requests"]]
            self.assertEqual(actual_action_types, list(expectations.action_request_types), msg=case.name)

        if expectations.action_request_statuses is not None:
            actual_action_statuses = [action_request["status"] for action_request in response_payload["action_requests"]]
            self.assertEqual(actual_action_statuses, list(expectations.action_request_statuses), msg=case.name)

        if expectations.action_request_payloads is not None:
            actual_action_payloads = [action_request["payload"] for action_request in response_payload["action_requests"]]
            self.assertEqual(actual_action_payloads, list(expectations.action_request_payloads), msg=case.name)

        if expectations.action_request_review_contexts is not None:
            actual_review_contexts = [
                action_request["review_context"] for action_request in response_payload["action_requests"]
            ]
            self.assertEqual(actual_review_contexts, list(expectations.action_request_review_contexts), msg=case.name)

        if run_payload is None:
            self.fail(f"assistant eval case '{case.name}' did not produce a run payload")

        self.assertEqual(run_payload["provider"], response_payload["provider"], msg=case.name)
        self.assertEqual(run_payload["model"], response_payload["model"], msg=case.name)
        self.assertEqual(run_payload["latest_user_message"], case.request_payload["messages"][-1]["content"], msg=case.name)
        self.assertEqual(run_payload["assistant_message"], response_payload["message"]["content"], msg=case.name)
        self.assertEqual(run_payload["use_live_tools"], case.request_payload.get("use_live_tools", True), msg=case.name)

        if expectations.run_status is not None:
            self.assertEqual(run_payload["status"], expectations.run_status, msg=case.name)

        if expectations.tool_names is not None:
            actual_run_tool_names = [tool_call["tool_name"] for tool_call in run_payload["tool_calls"]]
            self.assertEqual(actual_run_tool_names, list(expectations.tool_names), msg=case.name)
        run_tool_call_summaries = [str(tool_call.get("summary") or "") for tool_call in run_payload["tool_calls"]]
        for fragment in expectations.tool_call_summary_contains:
            self.assertTrue(any(fragment in summary for summary in run_tool_call_summaries), msg=case.name)

        if expectations.warning_count is not None:
            self.assertEqual(len(run_payload["warnings"]), expectations.warning_count, msg=case.name)
        for fragment in expectations.warning_contains:
            self.assertTrue(any(fragment in warning for warning in run_payload["warnings"]), msg=case.name)
        for fragment in expectations.warning_absent:
            self.assertTrue(all(fragment not in warning for warning in run_payload["warnings"]), msg=case.name)

        prompt_section_keys = [section["key"] for section in run_payload["prompt_sections"]]
        for key in expectations.prompt_section_keys:
            self.assertIn(key, prompt_section_keys, msg=case.name)
        for key in expectations.prompt_section_absent_keys:
            self.assertNotIn(key, prompt_section_keys, msg=case.name)
        prompt_section_content_by_key = {
            section["key"]: section["content"]
            for section in run_payload["prompt_sections"]
        }
        for key, fragments in expectations.prompt_section_content_contains:
            content = prompt_section_content_by_key.get(key)
            self.assertIsNotNone(content, msg=case.name)
            assert content is not None
            for fragment in fragments:
                self.assertIn(fragment, content, msg=case.name)

        if expectations.provider_request_count is not None:
            self.assertEqual(len(captured_provider_requests), expectations.provider_request_count, msg=case.name)

        if expectations.provider_tools_key_present is not None:
            has_tools_key = "tools" in captured_provider_requests[0] if captured_provider_requests else False
            self.assertEqual(has_tools_key, expectations.provider_tools_key_present, msg=case.name)

        if expectations.provider_tool_names is not None:
            provider_tool_names = []
            if captured_provider_requests:
                provider_tool_names = [tool["name"] for tool in captured_provider_requests[0].get("tools", [])]
            self.assertEqual(provider_tool_names, list(expectations.provider_tool_names), msg=case.name)

    def _run_follow_up_action(
        self,
        *,
        case: AssistantEvalCase,
        token: str,
        response_payload: dict[str, Any],
    ) -> dict[str, Any]:
        action_requests = response_payload.get("action_requests", [])
        self.assertTrue(
            action_requests,
            msg=f"assistant eval case '{case.name}' did not stage an action request for follow-up",
        )
        action_request_id = action_requests[0]["action_request_id"]
        follow_up_token = self._create_session_token(case.follow_up_user) if case.follow_up_user is not None else token

        if case.follow_up_action == "approve_first_action_request":
            response = self.client.post(
                f"/assistant/action-requests/{action_request_id}/approve",
                headers={"Authorization": f"Bearer {follow_up_token}"},
            )
        elif case.follow_up_action == "reject_first_action_request":
            response = self.client.post(
                f"/assistant/action-requests/{action_request_id}/reject",
                headers={"Authorization": f"Bearer {follow_up_token}"},
            )
        else:
            self.fail(f"assistant eval case '{case.name}' configured unsupported follow_up_action '{case.follow_up_action}'")

        expected_status = (
            case.follow_up_expectations.http_status
            if case.follow_up_expectations is not None
            else 200
        )
        self.assertEqual(
            response.status_code,
            expected_status,
            msg=f"assistant eval case '{case.name}' follow-up returned {response.status_code}: {response.text}",
        )
        return response.json()

    def _assert_follow_up_result(
        self,
        *,
        case: AssistantEvalCase,
        follow_up_payload: dict[str, Any],
    ) -> None:
        expectations = case.follow_up_expectations
        if expectations is None:
            return

        if expectations.action_request_status is not None:
            self.assertEqual(follow_up_payload["status"], expectations.action_request_status, msg=case.name)

        error_detail = follow_up_payload.get("error_detail")
        for fragment in expectations.error_detail_contains:
            self.assertIsInstance(error_detail, str, msg=case.name)
            assert isinstance(error_detail, str)
            self.assertIn(fragment, error_detail, msg=case.name)

        response_detail = follow_up_payload.get("detail")
        for fragment in expectations.response_detail_contains:
            self.assertIsInstance(response_detail, str, msg=case.name)
            assert isinstance(response_detail, str)
            self.assertIn(fragment, response_detail, msg=case.name)

        result = follow_up_payload.get("result")
        if expectations.result_is_none is True:
            self.assertIsNone(result, msg=case.name)
        elif expectations.result_is_none is False:
            self.assertIsNotNone(result, msg=case.name)

        for key, expected_value in expectations.result_contains.items():
            self.assertIsInstance(result, dict, msg=case.name)
            assert isinstance(result, dict)
            self.assertEqual(result.get(key), expected_value, msg=case.name)

        for trade_id, expected_status in expectations.trade_statuses:
            with self.SessionLocal() as session:
                trade = session.get(Trade, trade_id)
                self.assertIsNotNone(trade, msg=case.name)
                assert trade is not None
                self.assertEqual(trade.status, expected_status, msg=case.name)

    def _create_session_token(self, fixture: AssistantEvalUserFixture | None = None) -> str:
        user_fixture = fixture or AssistantEvalUserFixture(
            user_id="assistant_user",
            email="assistant@example.com",
            display_name="Assistant User",
            role="OPS_ADMIN",
        )
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            user = session.get(UserAccount, user_fixture.user_id)
            if user is None:
                session.add(
                    UserAccount(
                        user_id=user_fixture.user_id,
                        email=user_fixture.email,
                        display_name=user_fixture.display_name,
                        role=user_fixture.role,
                        password_hash=hash_password("supersecret1"),
                        is_active=True,
                        last_login_at=now,
                        created_at=now,
                        created_by="assistant-eval-suite",
                        updated_at=now,
                        updated_by="assistant-eval-suite",
                        version=1,
                    )
                )
                session.commit()
                user = session.get(UserAccount, user_fixture.user_id)
                assert user is not None
            else:
                user.email = user_fixture.email
                user.display_name = user_fixture.display_name
                user.role = user_fixture.role
                user.last_login_at = now
                user.updated_at = now
                user.updated_by = "assistant-eval-suite"
                session.commit()

            _, token = create_user_session(session, user)
            return token

    def _create_agent(self, fixture: AssistantEvalAgentFixture) -> None:
        now = datetime.now(timezone.utc)
        normalized_capabilities = {capability.upper() for capability in fixture.capabilities}
        allowed_action_types = (
            list(fixture.allowed_action_types)
            if fixture.allowed_action_types
            else list(ALL_ASSISTANT_ACTION_TYPES)
            if "ACTION" in normalized_capabilities
            else []
        )
        with self.SessionLocal() as session:
            session.add(
                AssistantAgent(
                    agent_id=fixture.agent_id,
                    name=fixture.name,
                    description=f"{fixture.name} evaluation agent.",
                    status=fixture.status,
                    scope=fixture.scope,
                    provider=fixture.provider,
                    model=fixture.model,
                    role_key=fixture.role_key,
                    profile_kind=fixture.profile_kind,
                    specialization_summary=fixture.specialization_summary,
                    human_owner_role=fixture.human_owner_role,
                    authority_ceiling=fixture.authority_ceiling,
                    orchestration_pattern=fixture.orchestration_pattern,
                    parent_agent_id=fixture.parent_agent_id,
                    managed_agent_ids=list(fixture.managed_agent_ids),
                    delegation_guidance=fixture.delegation_guidance,
                    allowed_workspaces=list(fixture.allowed_workspaces),
                    capabilities=list(fixture.capabilities),
                    skills=list(fixture.skills),
                    allowed_tools=list(fixture.allowed_tools),
                    allowed_action_types=allowed_action_types,
                    system_prompt=fixture.system_prompt or f"System prompt for {fixture.name}.",
                    created_at=now,
                    created_by="assistant-eval-suite",
                    updated_at=now,
                    updated_by="assistant-eval-suite",
                    version=1,
                )
            )
            session.commit()

    def _create_trade_with_event(self, fixture: AssistantEvalTradeFixture) -> None:
        now = datetime.now(timezone.utc)
        event_id = f"evt-{fixture.trade_id.lower()}"
        with self.SessionLocal() as session:
            session.add(
                Event(
                    event_id=event_id,
                    aggregate_type="trade",
                    aggregate_id=fixture.trade_id,
                    event_type=fixture.event_type,
                    occurred_at=now,
                    recorded_at=now,
                    actor_id="assistant_user",
                    correlation_id=None,
                    causation_id=None,
                    schema_version=1,
                    payload={"trade_id": fixture.trade_id},
                )
            )
            session.add(
                Trade(
                    trade_id=fixture.trade_id,
                    external_trade_id=f"EXT-{fixture.trade_id}",
                    source_system="TEST",
                    created_at=now,
                    updated_at=now,
                    execution_timestamp=now,
                    trade_nature="PHYSICAL",
                    trade_structure="SINGLE",
                    trade_side="BUY",
                    book=fixture.book,
                    portfolio=fixture.portfolio,
                    counterparty=fixture.counterparty,
                    commodity_class="CRUDE",
                    commodity=fixture.commodity,
                    pricing_type="FIXED",
                    pricing_status="PRICED",
                    price_index_code=None,
                    price=fixture.price,
                    volume=fixture.volume,
                    settlement_status="PENDING",
                    trader_user="assistant_user",
                    status=fixture.status,
                    last_event_id=event_id,
                )
            )
            session.commit()

    def _create_pretrade_recommendation_run(self, fixture: AssistantEvalPreTradeRecommendationFixture) -> None:
        draft = PreTradeScenarioDraft(
            book=fixture.book,
            portfolio="PROMPT",
            counterparty="ACME",
            commodity_class=fixture.commodity_class,
            commodity=fixture.commodity,
            trade_side=fixture.trade_side,
            pricing_type=fixture.pricing_type,
            price_index_code=fixture.price_index_code,
            target_price=fixture.target_price,
            target_volume=fixture.target_volume,
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
                    record_id=f"desk-{fixture.source_scenario_id or fixture.source_review_id or 0}",
                    observed_at=fixture.created_at,
                    ingested_at=fixture.created_at,
                    captured_by=fixture.actor_id,
                ),
                payload={
                    "related_active_trade_count": fixture.related_active_trade_count,
                    "current_net_position": fixture.current_net_position,
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
                    observed_at=fixture.created_at,
                    ingested_at=fixture.created_at,
                    captured_by=fixture.actor_id,
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
                freshness="FRESH",
                summary="Latest mark loaded.",
                provenance=PreTradeRecommendationSourceProvenance(
                    provider="Price Service",
                    dataset="price-index-observations",
                    record_id=fixture.price_index_code,
                    observed_at=fixture.created_at,
                    ingested_at=fixture.created_at,
                    captured_by=fixture.actor_id,
                ),
                payload={
                    "latest_mark": fixture.latest_mark,
                    "price_index_code": fixture.price_index_code,
                    "observation_date": fixture.created_at.date().isoformat(),
                },
            ),
        ]
        evaluation = prepare_pretrade_recommendation_evaluation(
            draft=draft,
            input_snapshots=snapshots,
            as_of=fixture.created_at,
            actor_id=fixture.actor_id,
        )

        with self.SessionLocal() as session:
            session.add(
                ReportPreset(
                    preset_key="pretrade_recommendation_run",
                    scope="PERSONAL" if fixture.source_review_id is None else "SHARED",
                    scope_owner_key=fixture.actor_id if fixture.source_review_id is None else PRETRADE_SHARED_OWNER_KEY,
                    name="Assistant eval pre-trade recommendation",
                    name_key=(
                        f"assistant-eval-pretrade-{fixture.actor_id}-"
                        f"{fixture.source_scenario_id or fixture.source_review_id or 0}-"
                        f"{int(fixture.created_at.timestamp())}"
                    ),
                    filters_json=build_recommendation_run_payload(
                        thesis=fixture.thesis,
                        draft=draft,
                        source_scenario_id=fixture.source_scenario_id,
                        source_review_id=fixture.source_review_id,
                        input_snapshots=evaluation.input_snapshots,
                        recommendation=evaluation.recommendation,
                    ),
                    created_at=fixture.created_at,
                    created_by=fixture.actor_id,
                    updated_at=fixture.created_at,
                    updated_by=fixture.actor_id,
                    version=1,
                )
            )
            session.commit()

    def _set_trade_status(self, *, trade_id: str, status: str) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            trade = session.get(Trade, trade_id)
            self.assertIsNotNone(trade, msg=f"assistant eval fixture trade '{trade_id}' was not found for status update")
            assert trade is not None
            trade.status = status
            trade.updated_at = now
            trade.updated_by = "assistant-eval-suite"
            session.commit()

    def _create_invoice_record(self, fixture: AssistantEvalInvoiceFixture) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                TradeInvoice(
                    id=fixture.invoice_id,
                    trade_id=fixture.trade_id,
                    delivery_id=None,
                    leg_no=None,
                    invoice_number=fixture.invoice_number,
                    invoice_currency_code="USD",
                    billed_quantity=1000,
                    quantity_unit_code="BBL",
                    invoice_amount=fixture.invoice_amount,
                    status=fixture.status,
                    issued_at=now,
                    due_at=now,
                    dispute_reason=None,
                    notes="Assistant eval invoice fixture",
                    created_at=now,
                    created_by="assistant-eval-suite",
                    updated_at=now,
                    updated_by="assistant-eval-suite",
                    version=1,
                )
            )
            session.commit()

    def _create_document_record(self, fixture: AssistantEvalDocumentFixture) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            session.add(
                DocumentIngestion(
                    document_id=fixture.document_id,
                    original_filename=f"{fixture.document_id}.pdf",
                    display_name=f"{fixture.document_id}.pdf",
                    content_type="application/pdf",
                    storage_key=f"documents/{fixture.document_id}.pdf",
                    sha256="0" * 64,
                    size_bytes=2048,
                    page_count=1,
                    status=fixture.status,
                    processor_provider=fixture.processor_provider,
                    processor_model=fixture.processor_model,
                    classifier_version="assistant-eval-classifier",
                    extractor_version="assistant-eval-extractor",
                    analysis_summary={"status": "ready"},
                    processing_errors=["Old error"],
                    review_status=fixture.review_status,
                    review_notes="Needs rerun",
                    reviewed_at=now,
                    reviewed_by="ops.docs",
                    created_at=now,
                    created_by="assistant-eval-suite",
                    updated_at=now,
                    updated_by="assistant-eval-suite",
                    version=2,
                )
            )
            session.add(
                DocumentIngestionPage(
                    document_id=fixture.document_id,
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
                    review_status=fixture.review_status,
                    review_notes="Reviewed page",
                    reviewed_at=now,
                    reviewed_by="ops.docs",
                    processed_at=now,
                    created_at=now,
                    updated_at=now,
                )
            )
            session.commit()
