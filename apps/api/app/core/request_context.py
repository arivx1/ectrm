from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RequestIdentity:
    actor_id: Optional[str]
    role: Optional[str]
    session_id: Optional[str]


_CURRENT_IDENTITY: ContextVar[RequestIdentity] = ContextVar(
    "ectrm_request_identity",
    default=RequestIdentity(actor_id=None, role=None, session_id=None),
)


def set_request_identity(
    *,
    actor_id: Optional[str],
    role: Optional[str],
    session_id: Optional[str],
) -> Token[RequestIdentity]:
    return _CURRENT_IDENTITY.set(
        RequestIdentity(actor_id=actor_id, role=role, session_id=session_id),
    )


def reset_request_identity(token: Token[RequestIdentity]) -> None:
    _CURRENT_IDENTITY.reset(token)


def get_request_identity() -> RequestIdentity:
    return _CURRENT_IDENTITY.get()
