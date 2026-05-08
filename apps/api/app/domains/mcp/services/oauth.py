from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.provider import AuthorizationCode
from mcp.server.auth.provider import AuthorizationParams
from mcp.server.auth.provider import OAuthAuthorizationServerProvider
from mcp.server.auth.provider import RefreshToken
from mcp.server.auth.provider import TokenError
from mcp.server.auth.provider import construct_redirect_uri
from mcp.server.auth.settings import AuthSettings
from mcp.server.auth.settings import ClientRegistrationOptions
from mcp.server.auth.settings import RevocationOptions
from mcp.shared.auth import OAuthClientInformationFull
from mcp.shared.auth import OAuthToken
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import HTMLResponse
from starlette.responses import JSONResponse
from starlette.responses import RedirectResponse
from starlette.responses import Response

from apps.api.app.config import settings
from apps.api.app.core.auth import authenticate_user
from apps.api.app.core.auth import create_user_session
from apps.api.app.core.auth import provision_single_user_auth_user
from apps.api.app.core.auth import revoke_user_session
from apps.api.app.models.user_account import UserAccount
from apps.api.app.models.user_session import UserSession

MCP_DEFAULT_REQUIRED_SCOPE = "mcp:tools"
MCP_OAUTH_LOGIN_PATH = "/login"
MCP_OAUTH_WHOAMI_PATH = "/whoami"


def mcp_oauth_enabled() -> bool:
    return settings.MCP_AUTH_MODE == "oauth"


def mcp_oauth_required_scopes() -> list[str]:
    scopes = [token.strip() for token in settings.MCP_OAUTH_REQUIRED_SCOPES.split() if token.strip()]
    if not scopes:
        raise ValueError("MCP_OAUTH_REQUIRED_SCOPES must declare at least one scope when MCP auth mode is oauth.")
    return scopes


def mcp_oauth_login_methods() -> list[str]:
    methods = ["password"]
    if settings.SINGLE_USER_AUTH_ENABLED:
        methods.append("single-user")
    return methods


def build_mcp_auth_settings(*, mount_path: str) -> AuthSettings:
    issuer_url = settings.MCP_OAUTH_ISSUER_URL.strip().rstrip("/")
    if not issuer_url:
        raise ValueError("MCP_OAUTH_ISSUER_URL must be configured when MCP auth mode is oauth.")
    if not issuer_url.endswith(mount_path):
        raise ValueError(f"MCP_OAUTH_ISSUER_URL must point at the mounted {mount_path} endpoint.")
    if not settings.MCP_OAUTH_SIGNING_SECRET.strip():
        raise ValueError("MCP_OAUTH_SIGNING_SECRET must be configured when MCP auth mode is oauth.")

    service_documentation_url = settings.MCP_OAUTH_SERVICE_DOCUMENTATION_URL.strip() or None
    required_scopes = mcp_oauth_required_scopes()

    return AuthSettings(
        issuer_url=issuer_url,
        service_documentation_url=service_documentation_url,
        client_registration_options=ClientRegistrationOptions(
            enabled=True,
            valid_scopes=required_scopes,
            default_scopes=required_scopes,
        ),
        revocation_options=RevocationOptions(enabled=True),
        required_scopes=required_scopes,
    )


def current_mcp_access_token() -> McpAccessToken | None:
    token = get_access_token()
    if isinstance(token, McpAccessToken):
        return token
    return None


@dataclass(frozen=True)
class PendingAuthorizationFlow:
    flow_id: str
    client_id: str
    client_name: str | None
    redirect_uri: str
    state: str | None
    scopes: tuple[str, ...]
    code_challenge: str
    redirect_uri_provided_explicitly: bool
    expires_at: float


@dataclass(frozen=True)
class McpSessionIdentity:
    session_id: str
    user_id: str
    role: str
    display_name: str
    email: str


class McpAuthorizationCode(AuthorizationCode):
    user_id: str


class McpRefreshToken(RefreshToken):
    session_id: str


class McpAccessToken(AccessToken):
    session_id: str
    user_id: str
    role: str
    display_name: str
    email: str


class EctrmMcpOAuthProvider(
    OAuthAuthorizationServerProvider[McpAuthorizationCode, McpRefreshToken, McpAccessToken]
):
    def __init__(self, *, session_factory: Callable[[], Session], issuer_url: str, required_scopes: list[str]) -> None:
        self._session_factory = session_factory
        self._issuer_url = issuer_url.rstrip("/")
        self._required_scopes = tuple(required_scopes)
        self._lock = threading.RLock()
        self._clients: dict[str, OAuthClientInformationFull] = {}
        self._pending_flows: dict[str, PendingAuthorizationFlow] = {}
        self._authorization_codes: dict[str, McpAuthorizationCode] = {}

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        self._cleanup_expired_records()
        with self._lock:
            return self._clients.get(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        self._cleanup_expired_records()
        with self._lock:
            self._clients[client_info.client_id] = client_info

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        self._cleanup_expired_records()
        flow_id = secrets.token_urlsafe(24)
        scopes = tuple(params.scopes or self._default_scopes_for_client(client))

        pending_flow = PendingAuthorizationFlow(
            flow_id=flow_id,
            client_id=client.client_id,
            client_name=client.client_name,
            redirect_uri=str(params.redirect_uri),
            state=params.state,
            scopes=scopes,
            code_challenge=params.code_challenge,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            expires_at=time.time() + settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
        )
        with self._lock:
            self._pending_flows[flow_id] = pending_flow
        return f"{self._issuer_url}{MCP_OAUTH_LOGIN_PATH}?flow_id={flow_id}"

    async def load_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: str,
    ) -> McpAuthorizationCode | None:
        self._cleanup_expired_records()
        with self._lock:
            record = self._authorization_codes.get(authorization_code)
            if record is None or record.client_id != client.client_id:
                return None
            return record

    async def exchange_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: McpAuthorizationCode,
    ) -> OAuthToken:
        self._cleanup_expired_records()
        with self._lock:
            self._authorization_codes.pop(authorization_code.code, None)

        with self._session_factory() as db:
            user = db.get(UserAccount, authorization_code.user_id)
            if user is None or not user.is_active:
                raise TokenError("invalid_grant", "The authorized user is no longer active.")

            session_expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS
            )
            session_record, _ = create_user_session(db, user, expires_at=session_expires_at)
            access_token = self._issue_signed_token(
                kind="access",
                session_id=session_record.session_id,
                client_id=client.client_id,
                scopes=authorization_code.scopes,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS),
            )
            refresh_token = self._issue_signed_token(
                kind="refresh",
                session_id=session_record.session_id,
                client_id=client.client_id,
                scopes=authorization_code.scopes,
                expires_at=session_expires_at,
            )

        return OAuthToken(
            access_token=access_token,
            expires_in=settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(authorization_code.scopes),
            refresh_token=refresh_token,
        )

    async def load_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: str,
    ) -> McpRefreshToken | None:
        payload = self._decode_signed_token(refresh_token, expected_kind="refresh")
        if payload is None or payload["client_id"] != client.client_id:
            return None
        scopes = list(payload["scopes"])
        session_identity = self._load_active_session(payload["session_id"])
        if session_identity is None:
            return None
        return McpRefreshToken(
            token=refresh_token,
            client_id=client.client_id,
            scopes=scopes,
            expires_at=int(payload["exp"]),
            session_id=session_identity.session_id,
        )

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: McpRefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        session_identity = self._load_active_session(refresh_token.session_id)
        if session_identity is None:
            raise TokenError("invalid_grant", "The refresh token is invalid or has expired.")

        requested_scopes = scopes or refresh_token.scopes
        if any(scope not in refresh_token.scopes for scope in requested_scopes):
            raise TokenError("invalid_scope", "Requested scopes exceed the refresh token grants.")

        with self._session_factory() as db:
            revoke_user_session(db, refresh_token.session_id)
            current_user = db.get(UserAccount, session_identity.user_id)
            if current_user is None or not current_user.is_active:
                raise TokenError("invalid_grant", "The refresh token user is no longer active.")

            session_expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=settings.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS
            )
            new_session_record, _ = create_user_session(db, current_user, expires_at=session_expires_at)
            access_token = self._issue_signed_token(
                kind="access",
                session_id=new_session_record.session_id,
                client_id=client.client_id,
                scopes=requested_scopes,
                expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS),
            )
            new_refresh_token = self._issue_signed_token(
                kind="refresh",
                session_id=new_session_record.session_id,
                client_id=client.client_id,
                scopes=requested_scopes,
                expires_at=session_expires_at,
            )

        return OAuthToken(
            access_token=access_token,
            expires_in=settings.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
            scope=" ".join(requested_scopes),
            refresh_token=new_refresh_token,
        )

    async def load_access_token(self, token: str) -> McpAccessToken | None:
        payload = self._decode_signed_token(token, expected_kind="access")
        if payload is None:
            return None

        session_identity = self._load_active_session(payload["session_id"], touch=True)
        if session_identity is None:
            return None

        return McpAccessToken(
            token=token,
            client_id=payload["client_id"],
            scopes=list(payload["scopes"]),
            expires_at=int(payload["exp"]),
            session_id=session_identity.session_id,
            user_id=session_identity.user_id,
            role=session_identity.role,
            display_name=session_identity.display_name,
            email=session_identity.email,
        )

    async def revoke_token(self, token: McpAccessToken | McpRefreshToken) -> None:
        with self._session_factory() as db:
            revoke_user_session(db, token.session_id)

    async def handle_login_request(self, request: Request) -> Response:
        if request.method.upper() == "GET":
            return self._render_login_page(request)
        if request.method.upper() == "POST":
            return await self._handle_login_submission(request)
        return Response(status_code=405)

    async def handle_whoami_request(self, _request: Request) -> Response:
        token = current_mcp_access_token()
        if token is None:
            authorization = _request.headers.get("authorization", "")
            scheme, _, bearer_token = authorization.partition(" ")
            if scheme.lower() == "bearer" and bearer_token.strip():
                token = await self.load_access_token(bearer_token.strip())
        if token is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "A valid MCP OAuth access token is required."},
            )

        return JSONResponse(
            {
                "client_id": token.client_id,
                "session_id": token.session_id,
                "user_id": token.user_id,
                "email": token.email,
                "display_name": token.display_name,
                "role": token.role,
                "scopes": token.scopes,
            }
        )

    def _cleanup_expired_records(self) -> None:
        now = time.time()
        with self._lock:
            self._pending_flows = {
                key: value for key, value in self._pending_flows.items() if value.expires_at > now
            }
            self._authorization_codes = {
                key: value for key, value in self._authorization_codes.items() if value.expires_at > now
            }

    def _default_scopes_for_client(self, client: OAuthClientInformationFull) -> list[str]:
        if client.scope:
            return [token.strip() for token in client.scope.split() if token.strip()]
        return list(self._required_scopes)

    def _render_login_page(self, request: Request, *, error: str | None = None, identifier: str = "") -> HTMLResponse:
        self._cleanup_expired_records()
        flow = self._flow_from_request(request)
        if flow is None:
            return HTMLResponse(self._render_terminal_page("Authorization request expired or is invalid."), status_code=400)

        single_user_enabled = settings.SINGLE_USER_AUTH_ENABLED
        client_label = html.escape(flow.client_name or flow.client_id)
        scope_label = html.escape(", ".join(flow.scopes))
        error_markup = ""
        if error:
            error_markup = (
                '<p style="margin:0 0 16px;color:#9f1239;background:#fff1f2;border:1px solid #fecdd3;'
                'padding:12px 14px;border-radius:10px;">'
                f"{html.escape(error)}</p>"
            )

        single_user_markup = ""
        if single_user_enabled:
            single_user_markup = (
                '<form method="post" style="margin-top:12px;">'
                f'<input type="hidden" name="flow_id" value="{html.escape(flow.flow_id)}" />'
                '<input type="hidden" name="login_mode" value="single-user" />'
                '<button type="submit" name="decision" value="approve" '
                'style="width:100%;padding:12px 16px;border-radius:10px;border:1px solid #0f766e;'
                'background:#ccfbf1;color:#134e4a;font-weight:600;cursor:pointer;">'
                'Authorize With Single-User Access'
                "</button>"
                "</form>"
            )

        page = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(settings.MCP_SERVER_NAME)} Authorization</title>
  </head>
  <body style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f4;color:#1c1917;">
    <main style="max-width:460px;margin:48px auto;padding:0 20px;">
      <section style="background:#ffffff;border:1px solid #e7e5e4;border-radius:18px;padding:28px 24px;box-shadow:0 10px 30px rgba(28,25,23,0.08);">
        <p style="margin:0 0 8px;color:#57534e;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">ECTRM MCP</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">Authorize ChatGPT access</h1>
        <p style="margin:0 0 18px;color:#44403c;line-height:1.5;">
          <strong>{client_label}</strong> wants permission to call the read-only ECTRM MCP tools.
        </p>
        <p style="margin:0 0 18px;color:#44403c;line-height:1.5;">
          Requested scopes: <strong>{scope_label}</strong>
        </p>
        {error_markup}
        <form method="post">
          <input type="hidden" name="flow_id" value="{html.escape(flow.flow_id)}" />
          <label style="display:block;margin-bottom:12px;">
            <span style="display:block;margin-bottom:6px;font-size:14px;font-weight:600;">User ID or email</span>
            <input
              type="text"
              name="identifier"
              value="{html.escape(identifier)}"
              autocomplete="username"
              style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #d6d3d1;"
            />
          </label>
          <label style="display:block;margin-bottom:16px;">
            <span style="display:block;margin-bottom:6px;font-size:14px;font-weight:600;">Password</span>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #d6d3d1;"
            />
          </label>
          <button
            type="submit"
            name="decision"
            value="approve"
            style="width:100%;padding:12px 16px;border-radius:10px;border:0;background:#1d4ed8;color:#ffffff;font-weight:600;cursor:pointer;"
          >
            Sign In And Authorize
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            style="width:100%;margin-top:10px;padding:12px 16px;border-radius:10px;border:1px solid #d6d3d1;background:#ffffff;color:#44403c;font-weight:600;cursor:pointer;"
          >
            Cancel
          </button>
        </form>
        {single_user_markup}
      </section>
    </main>
  </body>
</html>"""
        return HTMLResponse(page)

    async def _handle_login_submission(self, request: Request) -> Response:
        self._cleanup_expired_records()
        form = await request.form()
        flow_id = str(form.get("flow_id", "")).strip()
        decision = str(form.get("decision", "")).strip().lower()
        identifier = str(form.get("identifier", "")).strip()
        password = str(form.get("password", ""))
        login_mode = str(form.get("login_mode", "")).strip().lower()

        flow = self._get_pending_flow(flow_id)
        if flow is None:
            return HTMLResponse(self._render_terminal_page("Authorization request expired or is invalid."), status_code=400)

        if decision in {"deny", "cancel"}:
            self._drop_pending_flow(flow.flow_id)
            redirect_url = construct_redirect_uri(
                flow.redirect_uri,
                error="access_denied",
                state=flow.state,
            )
            return RedirectResponse(url=redirect_url, status_code=303)

        try:
            user = self._authenticate_authorization_request(
                identifier=identifier,
                password=password,
                login_mode=login_mode,
            )
        except HTTPException as exc:
            message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            return self._render_login_page(request, error=message, identifier=identifier)

        authorization_code = McpAuthorizationCode(
            code=secrets.token_urlsafe(32),
            scopes=list(flow.scopes),
            expires_at=time.time() + settings.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
            client_id=flow.client_id,
            code_challenge=flow.code_challenge,
            redirect_uri=flow.redirect_uri,
            redirect_uri_provided_explicitly=flow.redirect_uri_provided_explicitly,
            user_id=user.user_id,
        )
        with self._lock:
            self._authorization_codes[authorization_code.code] = authorization_code
            self._pending_flows.pop(flow.flow_id, None)

        redirect_url = construct_redirect_uri(
            flow.redirect_uri,
            code=authorization_code.code,
            state=flow.state,
        )
        return RedirectResponse(url=redirect_url, status_code=303)

    def _authenticate_authorization_request(
        self,
        *,
        identifier: str,
        password: str,
        login_mode: str,
    ) -> UserAccount:
        with self._session_factory() as db:
            if login_mode == "single-user":
                return provision_single_user_auth_user(db)

            user = authenticate_user(db, identifier=identifier, password=password)
            user.last_login_at = datetime.now(timezone.utc)
            user.updated_at = datetime.now(timezone.utc)
            user.updated_by = user.user_id
            user.version += 1
            db.commit()
            db.refresh(user)
            return user

    def _flow_from_request(self, request: Request) -> PendingAuthorizationFlow | None:
        flow_id = request.query_params.get("flow_id", "").strip()
        if not flow_id:
            return None
        return self._get_pending_flow(flow_id)

    def _get_pending_flow(self, flow_id: str) -> PendingAuthorizationFlow | None:
        with self._lock:
            flow = self._pending_flows.get(flow_id)
            if flow is None or flow.expires_at <= time.time():
                self._pending_flows.pop(flow_id, None)
                return None
            return flow

    def _drop_pending_flow(self, flow_id: str) -> None:
        with self._lock:
            self._pending_flows.pop(flow_id, None)

    def _render_terminal_page(self, message: str) -> str:
        escaped_message = html.escape(message)
        return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(settings.MCP_SERVER_NAME)} Authorization</title>
  </head>
  <body style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f4;color:#1c1917;">
    <main style="max-width:460px;margin:48px auto;padding:0 20px;">
      <section style="background:#ffffff;border:1px solid #e7e5e4;border-radius:18px;padding:28px 24px;box-shadow:0 10px 30px rgba(28,25,23,0.08);">
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">Authorization finished</h1>
        <p style="margin:0;color:#44403c;line-height:1.5;">{escaped_message}</p>
      </section>
    </main>
  </body>
</html>"""

    def _issue_signed_token(
        self,
        *,
        kind: str,
        session_id: str,
        client_id: str,
        scopes: list[str],
        expires_at: datetime,
    ) -> str:
        payload = {
            "kind": kind,
            "session_id": session_id,
            "client_id": client_id,
            "scopes": list(scopes),
            "exp": int(expires_at.timestamp()),
        }
        encoded_payload = self._encode_token_payload(payload)
        signature = self._sign_token_payload(encoded_payload)
        return f"{encoded_payload}.{signature}"

    def _decode_signed_token(self, token: str, *, expected_kind: str) -> dict[str, Any] | None:
        try:
            encoded_payload, encoded_signature = token.split(".", maxsplit=1)
        except ValueError:
            return None

        expected_signature = self._sign_token_payload(encoded_payload)
        if not hmac.compare_digest(encoded_signature, expected_signature):
            return None

        try:
            payload = json.loads(self._urlsafe_b64decode(encoded_payload).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

        if payload.get("kind") != expected_kind:
            return None
        if int(payload.get("exp", 0)) <= int(time.time()):
            return None
        if not payload.get("session_id") or not payload.get("client_id"):
            return None
        if not isinstance(payload.get("scopes"), list):
            return None
        return payload

    def _load_active_session(self, session_id: str, *, touch: bool = False) -> McpSessionIdentity | None:
        with self._session_factory() as db:
            record = db.execute(
                select(UserSession, UserAccount)
                .join(UserAccount, UserAccount.user_id == UserSession.user_id)
                .where(UserSession.session_id == session_id)
            ).first()
            if record is None:
                return None

            session_record, user = record
            now = datetime.now(timezone.utc)
            revoked_at = _coerce_utc(session_record.revoked_at) if session_record.revoked_at is not None else None
            expires_at = _coerce_utc(session_record.expires_at)
            if revoked_at is not None or expires_at <= now or not user.is_active:
                return None

            if touch:
                session_record.last_seen_at = now
                db.commit()
                db.refresh(session_record)

            return McpSessionIdentity(
                session_id=session_record.session_id,
                user_id=user.user_id,
                role=user.role,
                display_name=user.display_name,
                email=user.email,
            )

    def _encode_token_payload(self, payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return self._urlsafe_b64encode(raw)

    def _sign_token_payload(self, encoded_payload: str) -> str:
        secret = settings.MCP_OAUTH_SIGNING_SECRET.encode("utf-8")
        digest = hmac.new(secret, encoded_payload.encode("utf-8"), hashlib.sha256).digest()
        return self._urlsafe_b64encode(digest)

    def _urlsafe_b64encode(self, value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")

    def _urlsafe_b64decode(self, value: str) -> bytes:
        padding = "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(value + padding)


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
