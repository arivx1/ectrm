from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.request_context import get_request_identity
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession

PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 390000
ADMIN_ROLES = frozenset({"OPS_ADMIN", "ADMIN"})


class AuthError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass(frozen=True)
class SessionPrincipal:
    session_id: str
    user_id: str
    display_name: str
    role: str
    expires_at: datetime


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_password(password: str) -> str:
    normalized_password = password.strip()
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        normalized_password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"{PASSWORD_ALGORITHM}${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded_password: Optional[str]) -> bool:
    if not encoded_password:
        return False

    try:
        algorithm, iteration_text, salt_hex, digest_hex = encoded_password.split("$", maxsplit=3)
    except ValueError:
        return False

    if algorithm != PASSWORD_ALGORITHM:
        return False

    try:
        iterations = int(iteration_text)
        salt = bytes.fromhex(salt_hex)
        expected_digest = bytes.fromhex(digest_hex)
    except (ValueError, TypeError):
        return False

    candidate_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.strip().encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate_digest, expected_digest)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_user_session(db: Session, user: UserAccount) -> tuple[UserSession, str]:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(hours=settings.SESSION_TTL_HOURS)
    access_token = secrets.token_urlsafe(32)
    session = UserSession(
        session_id=str(uuid.uuid4()),
        user_id=user.user_id,
        token_hash=hash_session_token(access_token),
        role=user.role,
        created_at=issued_at,
        expires_at=expires_at,
        revoked_at=None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, access_token


def revoke_user_session(db: Session, session_id: str) -> None:
    record = db.get(UserSession, session_id)
    if record is None or record.revoked_at is not None:
        return
    record.revoked_at = datetime.now(timezone.utc)
    db.commit()


def authenticate_user(
    db: Session,
    *,
    identifier: str,
    password: str,
) -> UserAccount:
    normalized_identifier = identifier.strip()
    record = db.execute(
        select(UserAccount).where(
            or_(
                UserAccount.user_id == normalized_identifier,
                UserAccount.email == normalized_identifier.lower(),
            )
        )
    ).scalars().first()
    if record is None or not record.is_active or not verify_password(password, record.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return record


def resolve_session_principal(db: Session, authorization_header: Optional[str]) -> Optional[SessionPrincipal]:
    if not authorization_header:
        return None

    scheme, _, token = authorization_header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "A valid Bearer session token is required.")

    record = db.execute(
        select(UserSession, UserAccount)
        .join(UserAccount, UserAccount.user_id == UserSession.user_id)
        .where(UserSession.token_hash == hash_session_token(token.strip()))
    ).first()
    if record is None:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Session token is invalid or has expired.")

    session_record, user_record = record
    now = datetime.now(timezone.utc)
    revoked_at = _coerce_utc(session_record.revoked_at) if session_record.revoked_at is not None else None
    expires_at = _coerce_utc(session_record.expires_at)
    if revoked_at is not None or expires_at <= now:
        raise AuthError(status.HTTP_401_UNAUTHORIZED, "Session token is invalid or has expired.")
    if not user_record.is_active:
        raise AuthError(status.HTTP_403_FORBIDDEN, "User account is inactive.")

    return SessionPrincipal(
        session_id=session_record.session_id,
        user_id=user_record.user_id,
        display_name=user_record.display_name,
        role=user_record.role,
        expires_at=expires_at,
    )


def is_admin_role(role: Optional[str]) -> bool:
    return (role or "").strip().upper() in ADMIN_ROLES


def resolve_audit_actor_id(payload_actor_id: Optional[str], *, required: bool = True) -> Optional[str]:
    identity = get_request_identity()
    current_actor_id = (identity.actor_id or "").strip()
    normalized_payload_actor = (payload_actor_id or "").strip()

    if current_actor_id:
        if normalized_payload_actor and normalized_payload_actor != current_actor_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authenticated actor does not match the requested audit actor.",
            )
        return current_actor_id

    if normalized_payload_actor:
        return normalized_payload_actor

    if required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audit actor is required.",
        )
    return None


def bootstrap_admin_token() -> str:
    configured = settings.BOOTSTRAP_ADMIN_TOKEN.strip()
    if configured:
        return configured
    return settings.MUTATION_API_TOKEN.strip()
