from __future__ import annotations

import json
import uuid
from time import perf_counter
from typing import Any

from datetime import datetime, timezone
from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler as fastapi_http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from apps.api.app.core.auth import AuthError, is_admin_role, resolve_session_principal
from apps.api.app.core.logging import configure_logging, get_logger
from apps.api.app.core.request_context import reset_request_identity, set_request_identity
from apps.api.app.config import settings
from apps.api.app.core.query_params import (
    ADMIN_LIST_LIMIT_DEFAULT,
    ADMIN_LIST_LIMIT_MAX,
    STANDARD_LIST_LIMIT_DEFAULT,
    STANDARD_LIST_LIMIT_MAX,
)
from apps.api.app.deps.db import get_db
from apps.api.app.db.engine import SessionLocal
from apps.api.app.domains.assistant.services.chat import AssistantServiceError, build_assistant_runtime_settings
from apps.api.app.domains.operations.services import build_database_overview
from apps.api.app.routes.assistant import admin_router as assistant_admin_router
from apps.api.app.routes.assistant import router as assistant_router
from apps.api.app.routes.auth import router as auth_router
from apps.api.app.routes.admin_data import admin_router as admin_data_router
from apps.api.app.routes.external_data import admin_router as external_data_admin_router
from apps.api.app.routes.external_data import router as external_data_router
from apps.api.app.routes.events import router as events_router
from apps.api.app.routes.layout_definitions import router as layout_definitions_router
from apps.api.app.routes.operations import router as operations_router
from apps.api.app.routes.reference_data import router as reference_data_router
from apps.api.app.routes.reports import router as reports_router
from apps.api.app.routes.trading_sources import admin_router as trading_sources_admin_router
from apps.api.app.routes.trades import router as trades_router
from apps.api.app.routes.positions import router as positions_router
from apps.api.app.routes.roadmap import admin_router as roadmap_admin_router
from apps.api.app.routes.roadmap import router as roadmap_router
from apps.api.app.routes.shipments import router as shipments_router
from apps.api.app.routes.users import router as users_router
from apps.api.app.routes.weather import admin_router as weather_admin_router
from apps.api.app.routes.weather import router as weather_router
from apps.api.app.schemas.runtime_settings import (
    GoogleAuthRuntimeSettingsOut,
    PaginationSettingsOut,
    PublicRuntimeSettingsOut,
)

configure_logging()
logger = get_logger(__name__)

app = FastAPI(title="E/CTRM API", version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-correlation-id"],
)

app.state.session_factory = SessionLocal
app.state.started_at = datetime.now(timezone.utc)

app.include_router(auth_router)
app.include_router(events_router)
app.include_router(layout_definitions_router)
app.include_router(operations_router)
app.include_router(reference_data_router)
app.include_router(admin_data_router)
app.include_router(trading_sources_admin_router)
app.include_router(external_data_router)
app.include_router(external_data_admin_router)
app.include_router(assistant_router)
app.include_router(assistant_admin_router)
app.include_router(trades_router)
app.include_router(positions_router)
app.include_router(shipments_router)
app.include_router(roadmap_router)
app.include_router(roadmap_admin_router)
app.include_router(reports_router)
app.include_router(users_router)
app.include_router(weather_router)
app.include_router(weather_admin_router)

PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
PUBLIC_WRITE_PATHS = frozenset(
    {"/auth/session", "/auth/bootstrap-admin", "/auth/single-user-session", "/auth/google-session"}
)
ADMIN_PATH_PREFIXES = ("/admin", "/users")


def _correlation_id_for_request(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None) or request.headers.get("x-correlation-id")


def _request_log_extra(request: Request) -> dict[str, Any]:
    return {
        "correlation_id": _correlation_id_for_request(request),
        "actor_id": getattr(request.state, "actor_id", None),
        "role": getattr(request.state, "actor_role", None),
        "session_id": getattr(request.state, "session_id", None),
        "request_method": request.method.upper(),
        "request_path": request.url.path,
    }


def _serialize_error_detail(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    try:
        serialized = json.dumps(detail, default=str, separators=(",", ":"))
    except TypeError:
        serialized = str(detail)
    return serialized if len(serialized) <= 500 else f"{serialized[:497]}..."


def _log_request_completion(request: Request, status_code: int) -> None:
    if getattr(request.state, "request_completion_logged", False):
        return

    started_at = getattr(request.state, "request_started_at", None)
    duration_ms = (perf_counter() - started_at) * 1000 if started_at is not None else None
    request.state.request_completion_logged = True

    logger.info(
        "Request completed status_code=%s duration_ms=%s",
        status_code,
        f"{duration_ms:.2f}" if duration_ms is not None else "-",
        extra=_request_log_extra(request),
    )


def _attach_correlation_header(request: Request, response: Response) -> Response:
    correlation_id = _correlation_id_for_request(request)
    if correlation_id:
        response.headers["x-correlation-id"] = correlation_id
    return response


def _log_handled_failure(request: Request, *, status_code: int, detail: Any) -> None:
    log_method = logger.error if status_code >= 500 else logger.warning
    log_method(
        "Handled request failure status_code=%s detail=%s",
        status_code,
        _serialize_error_detail(detail),
        extra=_request_log_extra(request),
    )


def _auth_error(request: Request, status_code: int, message: str, correlation_id: str) -> JSONResponse:
    logger.warning(
        "Authentication rejected status_code=%s message=%s",
        status_code,
        message,
        extra={
            "correlation_id": correlation_id,
            "request_method": request.method.upper(),
            "request_path": request.url.path,
        },
    )
    response = JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": "AUTHENTICATION_REQUIRED",
                "message": message,
                "correlation_id": correlation_id,
            }
        },
    )
    response.headers["x-correlation-id"] = correlation_id
    return response


def _is_cors_preflight(request: Request) -> bool:
    return (
        request.method.upper() == "OPTIONS"
        and bool(request.headers.get("origin"))
        and bool(request.headers.get("access-control-request-method"))
    )


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id
    request.state.request_started_at = perf_counter()
    request.state.request_completion_logged = False

    if _is_cors_preflight(request):
        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        _log_request_completion(request, response.status_code)
        return response

    session_factory = request.app.state.session_factory
    principal = None

    with session_factory() as db:
        try:
            principal = resolve_session_principal(db, request.headers.get("authorization"))
        except AuthError as exc:
            request_path = request.url.path
            protected_write = request.method.upper() in PROTECTED_METHODS and request_path not in PUBLIC_WRITE_PATHS
            admin_path = request_path.startswith(ADMIN_PATH_PREFIXES)
            if protected_write or admin_path:
                response = _auth_error(request, exc.status_code, exc.message, correlation_id)
                _log_request_completion(request, response.status_code)
                return response

    request.state.actor_id = principal.user_id if principal is not None else None
    request.state.actor_role = principal.role if principal is not None else None
    request.state.session_id = principal.session_id if principal is not None else None
    request.state.session_expires_at = principal.expires_at if principal is not None else None

    identity_token = set_request_identity(
        actor_id=request.state.actor_id,
        role=request.state.actor_role,
        session_id=request.state.session_id,
        correlation_id=correlation_id,
        request_method=request.method.upper(),
        request_path=request.url.path,
    )

    try:
        request_path = request.url.path
        protected_write = request.method.upper() in PROTECTED_METHODS and request_path not in PUBLIC_WRITE_PATHS
        admin_path = request_path.startswith(ADMIN_PATH_PREFIXES)

        if admin_path:
            if principal is None:
                response = _auth_error(request, 401, "Authentication is required for admin operations.", correlation_id)
                _log_request_completion(request, response.status_code)
                return response
            if not is_admin_role(principal.role):
                response = _auth_error(request, 403, "An administrative session is required for this operation.", correlation_id)
                _log_request_completion(request, response.status_code)
                return response
        elif protected_write and principal is None:
            response = _auth_error(
                request,
                401,
                "Authentication is required for write operations.",
                correlation_id,
            )
            _log_request_completion(request, response.status_code)
            return response

        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        _log_request_completion(request, response.status_code)
        return response
    finally:
        reset_request_identity(identity_token)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def version():
    return {"version": settings.APP_VERSION}


@app.get("/settings/public", response_model=PublicRuntimeSettingsOut)
def public_runtime_settings(db: Session = Depends(get_db)) -> PublicRuntimeSettingsOut:
    google_auth_client_id = settings.GOOGLE_AUTH_CLIENT_ID.strip() or None
    return PublicRuntimeSettingsOut(
        app_version=settings.APP_VERSION,
        database=build_database_overview(db),
        cors_allow_origins=settings.cors_allow_origins,
        mutation_protection_enabled=True,
        bootstrap_admin_enabled=bool(settings.BOOTSTRAP_ADMIN_TOKEN.strip() or settings.MUTATION_API_TOKEN.strip()),
        single_user_auth_enabled=settings.SINGLE_USER_AUTH_ENABLED,
        google_auth=GoogleAuthRuntimeSettingsOut(
            enabled=bool(settings.GOOGLE_AUTH_ENABLED and google_auth_client_id),
            client_id=google_auth_client_id,
            auto_create_users=settings.GOOGLE_AUTH_AUTO_CREATE_USERS,
        ),
        session_ttl_hours=settings.SESSION_TTL_HOURS,
        eia_base_url=settings.EIA_BASE_URL,
        eia_timeout_seconds=settings.EIA_TIMEOUT_SECONDS,
        pagination=PaginationSettingsOut(
            standard_default=STANDARD_LIST_LIMIT_DEFAULT,
            standard_max=STANDARD_LIST_LIMIT_MAX,
            admin_default=ADMIN_LIST_LIMIT_DEFAULT,
            admin_max=ADMIN_LIST_LIMIT_MAX,
        ),
        assistant=build_assistant_runtime_settings(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    correlation_id = _correlation_id_for_request(request)
    logger.error(
        "Unhandled exception while processing request",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra=_request_log_extra(request),
    )
    response = JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "UNHANDLED_EXCEPTION",
                "message": "Unexpected server error.",
                "correlation_id": correlation_id,
            }
        },
    )
    _log_request_completion(request, response.status_code)
    return _attach_correlation_header(request, response)


@app.exception_handler(AuthError)
async def auth_exception_handler(request: Request, exc: AuthError):
    correlation_id = _correlation_id_for_request(request) or str(uuid.uuid4())
    response = _auth_error(request, exc.status_code, exc.message, correlation_id)
    _log_request_completion(request, response.status_code)
    return _attach_correlation_header(request, response)


@app.exception_handler(AssistantServiceError)
async def assistant_service_exception_handler(request: Request, exc: AssistantServiceError):
    _log_handled_failure(request, status_code=exc.status_code, detail=exc.detail)
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    _log_request_completion(request, response.status_code)
    return _attach_correlation_header(request, response)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    _log_handled_failure(request, status_code=exc.status_code, detail=exc.detail)
    response = await fastapi_http_exception_handler(request, exc)
    _log_request_completion(request, response.status_code)
    return _attach_correlation_header(request, response)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    _log_handled_failure(request, status_code=422, detail=exc.errors())
    response = await request_validation_exception_handler(request, exc)
    _log_request_completion(request, response.status_code)
    return _attach_correlation_header(request, response)
