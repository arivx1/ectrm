from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy.orm import Session

from apps.api.app.domains.assistant.services.action_catalog import (
    ALL_CATALOG_ACTION_TYPES,
    AssistantActionCatalogEntry,
)
from apps.api.app.models.assistant_action_request import AssistantActionRequest


@dataclass(frozen=True)
class AssistantActionExecutionContext:
    db: Session
    record: AssistantActionRequest
    actor_id: str
    actor_role: str | None
    decided_at: datetime


class AssistantActionHandler(Protocol):
    action_type: str

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        ...

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        ...

    def is_idempotent_retry(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> bool:
        ...


@dataclass(frozen=True)
class AssistantActionProposal:
    action_type: str
    summary: str
    description: str
    payload: dict[str, object]


@dataclass(frozen=True)
class AssistantActionPlanningCandidate:
    proposal: AssistantActionProposal | None = None
    warning: str | None = None


@dataclass(frozen=True)
class AssistantActionPlanningContext:
    message: str
    message_lower: str
    context: str | None
    context_fields: dict[str, str]
    persona: str | None
    db: Session


class AssistantActionPlanner(Protocol):
    action_type: str

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        ...


@dataclass(frozen=True)
class AssistantActionSpec:
    catalog_entry: AssistantActionCatalogEntry
    handler: AssistantActionHandler
    planner: AssistantActionPlanner
    requires_ready_preview: bool = False

    @property
    def action_type(self) -> str:
        return self.catalog_entry.name

    def execute(self, context: AssistantActionExecutionContext) -> dict[str, object]:
        return self.handler.execute(context)

    def plan(self, context: AssistantActionPlanningContext) -> AssistantActionPlanningCandidate | None:
        return self.planner.plan(context)

    def current_stale_state(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> dict[str, object | None]:
        return self.handler.current_stale_state(db=db, record=record)

    def is_idempotent_retry(
        self,
        *,
        db: Session,
        record: AssistantActionRequest,
    ) -> bool:
        return self.handler.is_idempotent_retry(db=db, record=record)


def build_assistant_action_spec_registry(
    specs: tuple[AssistantActionSpec, ...],
) -> dict[str, AssistantActionSpec]:
    registry: dict[str, AssistantActionSpec] = {}
    for spec in specs:
        if spec.handler.action_type != spec.catalog_entry.name:
            raise ValueError(
                "Assistant action spec handler/catalog mismatch: "
                f"{spec.handler.action_type!r} != {spec.catalog_entry.name!r}."
            )
        if spec.planner.action_type != spec.catalog_entry.name:
            raise ValueError(
                "Assistant action spec planner/catalog mismatch: "
                f"{spec.planner.action_type!r} != {spec.catalog_entry.name!r}."
            )
        if spec.action_type in registry:
            raise ValueError(f"Duplicate assistant action spec for {spec.action_type!r}.")
        registry[spec.action_type] = spec

    missing_actions = set(ALL_CATALOG_ACTION_TYPES) - set(registry)
    extra_actions = set(registry) - set(ALL_CATALOG_ACTION_TYPES)
    if missing_actions or extra_actions:
        raise ValueError(
            "Assistant action specs must cover the published action catalog exactly; "
            f"missing={sorted(missing_actions)!r}, extra={sorted(extra_actions)!r}."
        )
    return registry
