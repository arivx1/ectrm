from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from fastapi import Request
from sqlalchemy.orm import Session

from apps.api.app.core.http import authenticated_actor_role
from apps.api.app.core.http import changes_from_payload
from apps.api.app.core.http import execute_http_action
from apps.api.app.core.http import require_actor_role
from apps.api.app.core.http import require_authenticated_actor
from apps.api.app.core.http import VALIDATION_ERROR_STATUS_CODES

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class OperationalActorContext:
    actor_id: str
    actor_role: str | None = None


@dataclass(frozen=True, slots=True)
class OperationalMutationSpec:
    resolve_actor: Callable[[Request], OperationalActorContext]
    handled_exceptions: tuple[tuple[type[Exception], int], ...]


@dataclass(frozen=True, slots=True)
class OperationalQuerySpec:
    load: Callable[..., Any]
    handled_exceptions: tuple[tuple[type[Exception], int], ...] = VALIDATION_ERROR_STATUS_CODES
    commit: bool = False


def build_role_mutation_spec(
    *,
    predicate: Callable[[str | None], bool],
    detail: str,
    handled_exceptions: tuple[tuple[type[Exception], int], ...],
) -> OperationalMutationSpec:
    return OperationalMutationSpec(
        resolve_actor=lambda request: OperationalActorContext(
            actor_id=require_actor_role(
                request,
                predicate=predicate,
                detail=detail,
            )
        ),
        handled_exceptions=handled_exceptions,
    )


def _resolve_authenticated_actor(request: Request) -> OperationalActorContext:
    return OperationalActorContext(
        actor_id=require_authenticated_actor(request),
        actor_role=authenticated_actor_role(request),
    )


def execute_operational_query(
    db: Session,
    action: Callable[[], T],
    *,
    handled_exceptions: tuple[tuple[type[Exception], int], ...] = VALIDATION_ERROR_STATUS_CODES,
    commit: bool = False,
) -> T:
    return execute_http_action(
        db,
        action,
        commit=commit,
        handled_exceptions=handled_exceptions,
    )


def execute_operational_query_spec(
    spec: OperationalQuerySpec,
    db: Session,
    **kwargs: Any,
) -> Any:
    return execute_operational_query(
        db,
        lambda: spec.load(db, **kwargs),
        handled_exceptions=spec.handled_exceptions,
        commit=spec.commit,
    )


def execute_operational_mutation(
    spec: OperationalMutationSpec,
    request: Request,
    db: Session,
    action: Callable[[OperationalActorContext], T],
    *,
    commit: bool = True,
) -> T:
    actor = spec.resolve_actor(request)
    return execute_http_action(
        db,
        lambda: action(actor),
        commit=commit,
        handled_exceptions=spec.handled_exceptions,
    )


def execute_operational_patch_mutation(
    spec: OperationalMutationSpec,
    payload: object,
    request: Request,
    db: Session,
    action: Callable[[OperationalActorContext, dict[str, object | None]], T],
    *,
    empty_detail: str | None = None,
    before_action: Callable[[Session, dict[str, object | None], OperationalActorContext], None] | None = None,
    commit: bool = True,
) -> T:
    actor = spec.resolve_actor(request)
    changes = changes_from_payload(payload, empty_detail=empty_detail)
    if before_action is not None:
        before_action(db, changes, actor)
    return execute_http_action(
        db,
        lambda: action(actor, changes),
        commit=commit,
        handled_exceptions=spec.handled_exceptions,
    )


AUTHENTICATED_WORK_ITEM_MUTATION_SPEC = OperationalMutationSpec(
    resolve_actor=_resolve_authenticated_actor,
    handled_exceptions=(
        (LookupError, 404),
        (PermissionError, 403),
        (ValueError, 422),
    ),
)
