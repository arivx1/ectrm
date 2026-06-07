from __future__ import annotations

import uuid

from fastapi import FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler as fastapi_http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from apps.api.app.core.auth import AuthError
from apps.api.app.core.http_runtime import (
    attach_correlation_header,
    build_auth_error_response,
    correlation_id_for_request,
    log_handled_failure,
    log_request_completion,
    log_unhandled_exception,
)
from apps.api.app.domains.assistant.services.chat import AssistantServiceError


def register_http_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.add_exception_handler(AuthError, auth_exception_handler)
    app.add_exception_handler(AssistantServiceError, assistant_service_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)


async def unhandled_exception_handler(request: Request, exc: Exception):
    correlation_id = correlation_id_for_request(request)
    log_unhandled_exception(request, exc)
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
    log_request_completion(request, response.status_code)
    return attach_correlation_header(request, response)


async def auth_exception_handler(request: Request, exc: AuthError):
    correlation_id = correlation_id_for_request(request) or str(uuid.uuid4())
    response = build_auth_error_response(
        request,
        status_code=exc.status_code,
        message=exc.message,
        correlation_id=correlation_id,
    )
    log_request_completion(request, response.status_code)
    return attach_correlation_header(request, response)


async def assistant_service_exception_handler(request: Request, exc: AssistantServiceError):
    log_handled_failure(request, status_code=exc.status_code, detail=exc.detail)
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    log_request_completion(request, response.status_code)
    return attach_correlation_header(request, response)


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    log_handled_failure(request, status_code=exc.status_code, detail=exc.detail)
    response = await fastapi_http_exception_handler(request, exc)
    log_request_completion(request, response.status_code)
    return attach_correlation_header(request, response)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    log_handled_failure(request, status_code=422, detail=exc.errors())
    response = await request_validation_exception_handler(request, exc)
    log_request_completion(request, response.status_code)
    return attach_correlation_header(request, response)
