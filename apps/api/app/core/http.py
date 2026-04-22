from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

T = TypeVar("T")

VALIDATION_ERROR_STATUS_CODES: tuple[tuple[type[Exception], int], ...] = (
    (ValueError, status.HTTP_422_UNPROCESSABLE_ENTITY),
)
NOT_FOUND_ERROR_STATUS_CODES: tuple[tuple[type[Exception], int], ...] = (
    (LookupError, status.HTTP_404_NOT_FOUND),
)
NOT_FOUND_AND_VALIDATION_ERROR_STATUS_CODES: tuple[tuple[type[Exception], int], ...] = (
    (LookupError, status.HTTP_404_NOT_FOUND),
    (ValueError, status.HTTP_422_UNPROCESSABLE_ENTITY),
)
STANDARD_MUTATION_ERROR_STATUS_CODES: tuple[tuple[type[Exception], int], ...] = (
    (LookupError, status.HTTP_404_NOT_FOUND),
    (PermissionError, status.HTTP_403_FORBIDDEN),
    (ValueError, status.HTTP_422_UNPROCESSABLE_ENTITY),
)


def require_authenticated_actor(request: Request) -> str:
    actor_id = getattr(request.state, "actor_id", None)
    if not actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required")
    return actor_id


def authenticated_actor_role(request: Request) -> str | None:
    actor_role = getattr(request.state, "actor_role", None)
    return str(actor_role).strip() if actor_role is not None else None


def require_actor_role(
    request: Request,
    *,
    predicate: Callable[[str | None], bool],
    detail: str,
) -> str:
    actor_id = require_authenticated_actor(request)
    if not predicate(authenticated_actor_role(request)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    return actor_id


def provided_field_names(payload: object) -> set[str]:
    if hasattr(payload, "model_fields_set"):
        return set(getattr(payload, "model_fields_set"))
    return set(getattr(payload, "__fields_set__", set()))


def changes_from_payload(
    payload: object,
    *,
    empty_detail: str | None = None,
) -> dict[str, object | None]:
    field_names = provided_field_names(payload)
    if empty_detail and not field_names:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=empty_detail)
    return {field_name: getattr(payload, field_name) for field_name in field_names}


def execute_http_action(
    db: Session,
    action: Callable[[], T],
    *,
    commit: bool = False,
    handled_exceptions: tuple[tuple[type[Exception], int], ...] = (),
) -> T:
    try:
        result = action()
        if commit:
            db.commit()
        return result
    except HTTPException:
        if commit:
            db.rollback()
        raise
    except Exception as exc:
        if commit:
            db.rollback()
        for exception_type, status_code in handled_exceptions:
            if isinstance(exc, exception_type):
                raise HTTPException(status_code=status_code, detail=str(exc)) from exc
        raise
