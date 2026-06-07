from __future__ import annotations

import uuid
from time import perf_counter

from fastapi import Request

from apps.api.app.core.auth import AuthError, is_admin_role, resolve_session_principal
from apps.api.app.core.http_auth_policy import classify_http_auth_request
from apps.api.app.core.http_runtime import (
    build_auth_error_response,
    is_cors_preflight,
    log_request_completion,
)
from apps.api.app.core.request_context import reset_request_identity, set_request_identity


async def handle_http_session_request(
    request: Request,
    call_next,
    *,
    mcp_mount_path: str,
):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    request.state.correlation_id = correlation_id
    request.state.request_started_at = perf_counter()
    request.state.request_completion_logged = False
    auth_classification = classify_http_auth_request(
        request.method,
        request.url.path,
        mcp_mount_path=mcp_mount_path,
    )
    request.state.source_surface = auth_classification.source_surface

    if is_cors_preflight(request):
        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        log_request_completion(request, response.status_code)
        return response

    session_factory = request.app.state.session_factory
    principal = None

    with session_factory() as db:
        try:
            principal = resolve_session_principal(db, request.headers.get("authorization"))
        except AuthError as exc:
            if (
                auth_classification.is_protected_write
                or auth_classification.is_protected_read
                or auth_classification.is_admin_path
            ):
                response = build_auth_error_response(
                    request,
                    status_code=exc.status_code,
                    message=exc.message,
                    correlation_id=correlation_id,
                )
                log_request_completion(request, response.status_code)
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
        source_surface=request.state.source_surface,
    )

    try:
        if auth_classification.is_admin_path:
            if principal is None:
                response = build_auth_error_response(
                    request,
                    status_code=401,
                    message="Authentication is required for admin operations.",
                    correlation_id=correlation_id,
                )
                log_request_completion(request, response.status_code)
                return response
            if not is_admin_role(principal.role):
                response = build_auth_error_response(
                    request,
                    status_code=403,
                    message="An administrative session is required for this operation.",
                    correlation_id=correlation_id,
                )
                log_request_completion(request, response.status_code)
                return response
        elif auth_classification.is_protected_write and principal is None:
            response = build_auth_error_response(
                request,
                status_code=401,
                message="Authentication is required for write operations.",
                correlation_id=correlation_id,
            )
            log_request_completion(request, response.status_code)
            return response
        elif auth_classification.is_protected_read and principal is None:
            response = build_auth_error_response(
                request,
                status_code=401,
                message="Authentication is required for protected workspace data.",
                correlation_id=correlation_id,
            )
            log_request_completion(request, response.status_code)
            return response

        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        log_request_completion(request, response.status_code)
        return response
    finally:
        reset_request_identity(identity_token)
