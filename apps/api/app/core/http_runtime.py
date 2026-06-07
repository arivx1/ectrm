from __future__ import annotations

import json
from time import perf_counter
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger

logger = get_logger(__name__)


def correlation_id_for_request(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None) or request.headers.get("x-correlation-id")


def request_log_extra(request: Request) -> dict[str, Any]:
    return {
        "correlation_id": correlation_id_for_request(request),
        "actor_id": getattr(request.state, "actor_id", None),
        "role": getattr(request.state, "actor_role", None),
        "session_id": getattr(request.state, "session_id", None),
        "request_method": request.method.upper(),
        "request_path": request.url.path,
        "source_surface": getattr(request.state, "source_surface", None),
    }


def _serialize_error_detail(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    try:
        serialized = json.dumps(detail, default=str, separators=(",", ":"))
    except TypeError:
        serialized = str(detail)
    return serialized if len(serialized) <= 500 else f"{serialized[:497]}..."


def log_request_completion(request: Request, status_code: int) -> None:
    if getattr(request.state, "request_completion_logged", False):
        return

    started_at = getattr(request.state, "request_started_at", None)
    duration_ms = (perf_counter() - started_at) * 1000 if started_at is not None else None
    request.state.request_completion_logged = True

    logger.info(
        "Request completed status_code=%s duration_ms=%s",
        status_code,
        f"{duration_ms:.2f}" if duration_ms is not None else "-",
        extra=request_log_extra(request),
    )


def attach_correlation_header(request: Request, response: Response) -> Response:
    correlation_id = correlation_id_for_request(request)
    if correlation_id:
        response.headers["x-correlation-id"] = correlation_id
    origin = request.headers.get("origin")
    if settings.is_cors_origin_allowed(origin):
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
        response.headers["access-control-expose-headers"] = "x-correlation-id"
        response.headers["vary"] = "Origin"
    return response


def log_handled_failure(request: Request, *, status_code: int, detail: Any) -> None:
    log_method = logger.error if status_code >= 500 else logger.warning
    log_method(
        "Handled request failure status_code=%s detail=%s",
        status_code,
        _serialize_error_detail(detail),
        extra=request_log_extra(request),
    )


def log_unhandled_exception(request: Request, exc: Exception) -> None:
    logger.error(
        "Unhandled exception while processing request",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra=request_log_extra(request),
    )


def build_auth_error_response(
    request: Request,
    *,
    status_code: int,
    message: str,
    correlation_id: str,
) -> JSONResponse:
    logger.warning(
        "Authentication rejected status_code=%s message=%s",
        status_code,
        message,
        extra={
            "correlation_id": correlation_id,
            "request_method": request.method.upper(),
            "request_path": request.url.path,
            "source_surface": getattr(request.state, "source_surface", None),
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
    origin = request.headers.get("origin")
    if settings.is_cors_origin_allowed(origin):
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
        response.headers["access-control-expose-headers"] = "x-correlation-id"
        response.headers["vary"] = "Origin"
    return response


def is_cors_preflight(request: Request) -> bool:
    return (
        request.method.upper() == "OPTIONS"
        and bool(request.headers.get("origin"))
        and bool(request.headers.get("access-control-request-method"))
    )
