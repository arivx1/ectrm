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
from apps.api.app.domains.assistant.services.registry import snapshot_payload_from_record
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.models.assistant_action_request import AssistantActionRequest
from apps.api.app.models.assistant_agent import AssistantAgent
from apps.api.app.models.assistant_agent_eval import AssistantAgentEval
from apps.api.app.models.assistant_agent_eval_run import AssistantAgentEvalRun
from apps.api.app.models.assistant_agent_revision import AssistantAgentRevision
from apps.api.app.models.assistant_run import AssistantRun
from apps.api.app.models.event import Event
from apps.api.app.models.mutation_provenance import MutationProvenanceRecord
from apps.api.app.models.trade import Trade
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession


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
    status: str = "ACTIVE"
    scope: str = "TEAM"
    provider: str | None = "openai"
    model: str | None = "gpt-5-mini"
    system_prompt: str | None = None
    publish: bool = True


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
    action_request_types: tuple[str, ...] | None = None
    action_request_statuses: tuple[str, ...] | None = None
    action_request_payloads: tuple[dict[str, object], ...] | None = None
    prompt_section_keys: tuple[str, ...] = ()
    prompt_section_absent_keys: tuple[str, ...] = ()
    provider_request_count: int | None = None
    provider_tool_names: tuple[str, ...] | None = None
    provider_tools_key_present: bool | None = None


@dataclass(frozen=True)
class AssistantEvalCase:
    name: str
    request_payload: dict[str, Any]
    agent: AssistantEvalAgentFixture | None = None
    trades: tuple[AssistantEvalTradeFixture, ...] = ()
    provider_responses: tuple[dict[str, Any], ...] = ()
    expectations: AssistantEvalExpectations = field(default_factory=AssistantEvalExpectations)


@dataclass(frozen=True)
class AssistantEvalResult:
    response_payload: dict[str, Any]
    run_payload: dict[str, Any] | None
    run_listing_payload: list[dict[str, Any]]
    captured_provider_requests: list[dict[str, Any]]


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
            session.query(MutationProvenanceRecord).delete()
            session.query(AssistantRun).delete()
            session.query(AssistantAgentEvalRun).delete()
            session.query(AssistantAgentEval).delete()
            session.query(AssistantAgentRevision).delete()
            session.query(AssistantAgent).delete()
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
        token = self._create_session_token()

        if case.agent is not None:
            self._create_agent(case.agent)
        for trade in case.trades:
            self._create_trade_with_event(trade)

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

        self._assert_case_result(
            case=case,
            response_payload=response_payload,
            run_payload=run_payload,
            captured_provider_requests=captured_provider_requests,
        )
        return AssistantEvalResult(
            response_payload=response_payload,
            run_payload=run_payload,
            run_listing_payload=run_listing_payload,
            captured_provider_requests=captured_provider_requests,
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

        if expectations.action_request_types is not None:
            actual_action_types = [action_request["action_type"] for action_request in response_payload["action_requests"]]
            self.assertEqual(actual_action_types, list(expectations.action_request_types), msg=case.name)

        if expectations.action_request_statuses is not None:
            actual_action_statuses = [action_request["status"] for action_request in response_payload["action_requests"]]
            self.assertEqual(actual_action_statuses, list(expectations.action_request_statuses), msg=case.name)

        if expectations.action_request_payloads is not None:
            actual_action_payloads = [action_request["payload"] for action_request in response_payload["action_requests"]]
            self.assertEqual(actual_action_payloads, list(expectations.action_request_payloads), msg=case.name)

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

    def _create_session_token(self) -> str:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            user = session.get(UserAccount, "assistant_user")
            if user is None:
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
                        created_by="assistant-eval-suite",
                        updated_at=now,
                        updated_by="assistant-eval-suite",
                        version=1,
                    )
                )
                session.commit()
                user = session.get(UserAccount, "assistant_user")
                assert user is not None
            else:
                user.last_login_at = now
                user.updated_at = now
                user.updated_by = "assistant-eval-suite"
                session.commit()

            _, token = create_user_session(session, user)
            return token

    def _create_agent(self, fixture: AssistantEvalAgentFixture) -> None:
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as session:
            record = AssistantAgent(
                agent_id=fixture.agent_id,
                name=fixture.name,
                description=f"{fixture.name} evaluation agent.",
                status=fixture.status,
                scope=fixture.scope,
                provider=fixture.provider,
                model=fixture.model,
                allowed_workspaces=list(fixture.allowed_workspaces),
                capabilities=list(fixture.capabilities),
                allowed_tools=list(fixture.allowed_tools),
                allowed_action_types=list(fixture.allowed_action_types),
                system_prompt=fixture.system_prompt or f"System prompt for {fixture.name}.",
                created_at=now,
                created_by="assistant-eval-suite",
                updated_at=now,
                updated_by="assistant-eval-suite",
                version=1,
            )
            session.add(record)
            session.flush()
            revision = AssistantAgentRevision(
                agent_id=fixture.agent_id,
                version=record.version,
                payload=snapshot_payload_from_record(record),
                change_summary=["Created draft."],
                created_at=now,
                created_by="assistant-eval-suite",
                published_at=now if fixture.publish else None,
                published_by="assistant-eval-suite" if fixture.publish else None,
                restored_from_revision_id=None,
            )
            session.add(revision)
            session.flush()
            record.latest_revision_id = revision.revision_id
            if fixture.publish:
                record.published_revision_id = revision.revision_id
                record.published_snapshot = revision.payload
                record.published_at = now
                record.published_by = "assistant-eval-suite"
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
