from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RequestIdentity:
    actor_id: Optional[str]
    role: Optional[str]
    session_id: Optional[str]
    correlation_id: Optional[str]
    request_method: Optional[str]
    request_path: Optional[str]


_CURRENT_IDENTITY: ContextVar[RequestIdentity] = ContextVar(
    "ectrm_request_identity",
    default=RequestIdentity(
        actor_id=None,
        role=None,
        session_id=None,
        correlation_id=None,
        request_method=None,
        request_path=None,
    ),
)


def set_request_identity(
    *,
    actor_id: Optional[str],
    role: Optional[str],
    session_id: Optional[str],
    correlation_id: Optional[str] = None,
    request_method: Optional[str] = None,
    request_path: Optional[str] = None,
) -> Token[RequestIdentity]:
    return _CURRENT_IDENTITY.set(
        RequestIdentity(
            actor_id=actor_id,
            role=role,
            session_id=session_id,
            correlation_id=correlation_id,
            request_method=request_method,
            request_path=request_path,
        ),
    )


def reset_request_identity(token: Token[RequestIdentity]) -> None:
    _CURRENT_IDENTITY.reset(token)


def get_request_identity() -> RequestIdentity:
    return _CURRENT_IDENTITY.get()
