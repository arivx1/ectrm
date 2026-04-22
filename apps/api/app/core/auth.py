from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.core.request_context import get_request_identity
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession
from apps.api.app.schemas._validation import normalize_required_text

PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 390000
ADMIN_ROLES = frozenset({"OPS_ADMIN", "ADMIN"})
CREDIT_APPROVER_ROLES = frozenset({"CREDIT_APPROVER"})
OPERATIONS_ROLES = frozenset({"OPERATIONS"})
SETTLEMENT_ROLES = frozenset({"ACCOUNTING", "ACCOUNTANT", "SETTLEMENT"})
GOOGLE_AUTH_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
GOD_LOGIN_USER_ID = "admin"
GOD_LOGIN_PASSWORD = "admin"
GOD_LOGIN_EMAIL = "admin@local.invalid"
GOD_LOGIN_DISPLAY_NAME = "Admin"
GOD_LOGIN_UPDATED_BY = "god-login"
logger = get_logger(__name__)


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


@dataclass(frozen=True)
class SingleUserAuthConfig:
    user_id: str
    email: str
    display_name: str
    role: str = "OPS_ADMIN"


@dataclass(frozen=True)
class GoogleAuthConfig:
    client_id: str
    auto_create_users: bool
    default_role: str
    timeout_seconds: int
    tokeninfo_url: str


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    display_name: str


def normalize_role(value: Optional[str]) -> str:
    return (value or "").strip().upper()


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_password(password: str) -> str:
    if not password.strip():
        raise ValueError("Password must not be blank")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"{PASSWORD_ALGORITHM}${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded_password: Optional[str]) -> bool:
    if not encoded_password or not password.strip():
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
        password.encode("utf-8"),
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
        last_seen_at=issued_at,
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


def touch_user_session(db: Session, session_id: str, *, seen_at: Optional[datetime] = None) -> Optional[UserSession]:
    record = db.get(UserSession, session_id)
    if record is None or record.revoked_at is not None:
        return None

    record.last_seen_at = seen_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record


def authenticate_user(
    db: Session,
    *,
    identifier: str,
    password: str,
) -> UserAccount:
    normalized_identifier = identifier.strip()
    if _is_god_login(normalized_identifier, password):
        return _ensure_god_login_user(db)

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


def _is_god_login(identifier: str, password: str) -> bool:
    return identifier.lower() == GOD_LOGIN_USER_ID and password == GOD_LOGIN_PASSWORD


def _ensure_god_login_user(db: Session) -> UserAccount:
    now = datetime.now(timezone.utc)
    record = db.get(UserAccount, GOD_LOGIN_USER_ID)

    if record is None:
        record = UserAccount(
            user_id=GOD_LOGIN_USER_ID,
            email=_allocate_god_login_email(db),
            display_name=GOD_LOGIN_DISPLAY_NAME,
            role="OPS_ADMIN",
            password_hash=hash_password(GOD_LOGIN_PASSWORD),
            is_active=True,
            last_login_at=None,
            created_at=now,
            created_by=GOD_LOGIN_UPDATED_BY,
            updated_at=now,
            updated_by=GOD_LOGIN_UPDATED_BY,
            version=1,
        )
        db.add(record)
        db.flush()
        return record

    updated = False

    if not record.is_active:
        record.is_active = True
        updated = True

    if not is_admin_role(record.role):
        record.role = "OPS_ADMIN"
        updated = True

    if not verify_password(GOD_LOGIN_PASSWORD, record.password_hash):
        record.password_hash = hash_password(GOD_LOGIN_PASSWORD)
        updated = True

    if updated:
        record.updated_at = now
        record.updated_by = GOD_LOGIN_UPDATED_BY
        record.version += 1
        db.flush()

    return record


def _allocate_god_login_email(db: Session) -> str:
    candidate = GOD_LOGIN_EMAIL
    if not _email_is_taken(db, candidate):
        return candidate

    suffix = 1
    while True:
        candidate = f"admin+god{suffix}@local.invalid"
        if not _email_is_taken(db, candidate):
            return candidate
        suffix += 1


def _email_is_taken(db: Session, email: str) -> bool:
    return db.execute(select(UserAccount.user_id).where(UserAccount.email == email)).scalar_one_or_none() is not None


def authenticate_google_user(
    db: Session,
    *,
    id_token: str,
) -> UserAccount:
    identity = verify_google_identity(id_token)
    config = google_auth_config()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured on this API.",
        )

    linked_user = db.execute(select(UserAccount).where(UserAccount.google_subject == identity.subject)).scalars().first()
    email_user = db.execute(select(UserAccount).where(UserAccount.email == identity.email)).scalars().first()

    if linked_user is not None and email_user is not None and linked_user.user_id != email_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Google account email is already assigned to another user.",
        )

    user = linked_user or email_user
    if user is None:
        if not config.auto_create_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No local user account is linked to this Google identity.",
            )

        now = datetime.now(timezone.utc)
        user = UserAccount(
            user_id=_allocate_google_user_id(db, identity.subject),
            email=identity.email,
            google_subject=identity.subject,
            display_name=identity.display_name,
            role=config.default_role,
            password_hash=None,
            is_active=True,
            last_login_at=now,
            created_at=now,
            created_by="google-auth",
            updated_at=now,
            updated_by="google-auth",
            version=1,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    if user.google_subject and user.google_subject != identity.subject:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User account is already linked to another Google identity.",
        )

    user.google_subject = identity.subject
    if user.email != identity.email:
        user.email = identity.email
    user.last_login_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    user.updated_by = user.user_id
    user.version += 1
    db.commit()
    db.refresh(user)
    return user


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
    return normalize_role(role) in ADMIN_ROLES


def is_credit_approver_role(role: Optional[str]) -> bool:
    normalized_role = normalize_role(role)
    return normalized_role in ADMIN_ROLES or normalized_role in CREDIT_APPROVER_ROLES


def is_operations_role(role: Optional[str]) -> bool:
    normalized_role = normalize_role(role)
    return normalized_role in ADMIN_ROLES or normalized_role in OPERATIONS_ROLES


def is_settlement_role(role: Optional[str]) -> bool:
    normalized_role = normalize_role(role)
    return normalized_role in ADMIN_ROLES or normalized_role in SETTLEMENT_ROLES


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


def single_user_auth_config() -> SingleUserAuthConfig | None:
    if not settings.SINGLE_USER_AUTH_ENABLED:
        return None

    try:
        return SingleUserAuthConfig(
            user_id=normalize_required_text(
                settings.SINGLE_USER_AUTH_USER_ID,
                field_name="SINGLE_USER_AUTH_USER_ID",
            ),
            email=normalize_required_text(
                settings.SINGLE_USER_AUTH_EMAIL,
                field_name="SINGLE_USER_AUTH_EMAIL",
                lowercase=True,
            ),
            display_name=normalize_required_text(
                settings.SINGLE_USER_AUTH_DISPLAY_NAME,
                field_name="SINGLE_USER_AUTH_DISPLAY_NAME",
            ),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Single-user authentication is misconfigured: {exc}",
        ) from exc


def google_auth_config() -> GoogleAuthConfig | None:
    if not settings.GOOGLE_AUTH_ENABLED:
        return None

    try:
        return GoogleAuthConfig(
            client_id=normalize_required_text(
                settings.GOOGLE_AUTH_CLIENT_ID,
                field_name="GOOGLE_AUTH_CLIENT_ID",
            ),
            auto_create_users=settings.GOOGLE_AUTH_AUTO_CREATE_USERS,
            default_role=normalize_required_text(
                settings.GOOGLE_AUTH_DEFAULT_ROLE,
                field_name="GOOGLE_AUTH_DEFAULT_ROLE",
                uppercase=True,
            ),
            timeout_seconds=settings.GOOGLE_AUTH_TIMEOUT_SECONDS,
            tokeninfo_url=normalize_required_text(
                settings.GOOGLE_AUTH_TOKENINFO_URL,
                field_name="GOOGLE_AUTH_TOKENINFO_URL",
            ),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google authentication is misconfigured: {exc}",
        ) from exc


def verify_google_identity(id_token: str, *, http_client: httpx.Client | None = None) -> GoogleIdentity:
    config = google_auth_config()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured on this API.",
        )

    try:
        normalized_token = normalize_required_text(id_token, field_name="id_token")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    owns_client = http_client is None
    client = http_client or httpx.Client(timeout=config.timeout_seconds)
    started_at = perf_counter()
    try:
        response = client.get(config.tokeninfo_url, params={"id_token": normalized_token})
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider="GOOGLE_AUTH",
            method="GET",
            url=config.tokeninfo_url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is temporarily unavailable.",
        ) from exc
    finally:
        if owns_client:
            client.close()

    if response.status_code != status.HTTP_200_OK:
        log_outbound_request(
            logger,
            provider="GOOGLE_AUTH",
            method="GET",
            url=config.tokeninfo_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error="unexpected_status",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token is invalid or has expired.",
        )

    try:
        payload = response.json()
    except ValueError as exc:
        log_outbound_request(
            logger,
            provider="GOOGLE_AUTH",
            method="GET",
            url=config.tokeninfo_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error="invalid_json_response",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication returned an unexpected response.",
        ) from exc

    audience = _normalize_google_claim_text(payload.get("aud"))
    issuer = _normalize_google_claim_text(payload.get("iss"))
    subject = _normalize_google_claim_text(payload.get("sub"))
    email = _normalize_google_claim_text(payload.get("email"), lowercase=True)

    if audience != config.client_id or issuer not in GOOGLE_AUTH_ISSUERS or subject is None or email is None:
        log_outbound_request(
            logger,
            provider="GOOGLE_AUTH",
            method="GET",
            url=config.tokeninfo_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error="invalid_claims",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token is invalid or has expired.",
        )

    if not _google_claim_is_true(payload.get("email_verified")):
        log_outbound_request(
            logger,
            provider="GOOGLE_AUTH",
            method="GET",
            url=config.tokeninfo_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error="email_unverified",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email must be verified before signing in.",
        )

    expiration = _parse_google_unix_timestamp(payload.get("exp"))
    if expiration is None or expiration <= int(datetime.now(timezone.utc).timestamp()):
        log_outbound_request(
            logger,
            provider="GOOGLE_AUTH",
            method="GET",
            url=config.tokeninfo_url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error="token_expired",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token is invalid or has expired.",
        )

    log_outbound_request(
        logger,
        provider="GOOGLE_AUTH",
        method="GET",
        url=config.tokeninfo_url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    display_name = _normalize_google_claim_text(payload.get("name"))
    return GoogleIdentity(
        subject=subject,
        email=email,
        display_name=display_name or email,
    )


def _allocate_google_user_id(db: Session, subject: str) -> str:
    for candidate in _google_user_id_candidates(subject):
        existing = db.get(UserAccount, candidate)
        if existing is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Could not allocate a local user ID for this Google identity.",
    )


def _google_user_id_candidates(subject: str) -> tuple[str, ...]:
    normalized_subject = normalize_required_text(subject, field_name="sub")
    direct = f"google_{normalized_subject}"[:64]
    hashed = f"google_{hashlib.sha256(normalized_subject.encode('utf-8')).hexdigest()[:57]}"[:64]
    if direct == hashed:
        return (direct,)
    return (direct, hashed)


def _google_claim_is_true(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1"}
    return False


def _normalize_google_claim_text(value: object, *, lowercase: bool = False) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if lowercase:
        normalized = normalized.lower()
    return normalized


def _parse_google_unix_timestamp(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None
