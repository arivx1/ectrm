from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urlsplit
from urllib.parse import urlunsplit

from apps.api.app.core.request_context import get_request_identity

LOGGER_NAMESPACE = "ectrm.api"
LOG_LEVEL_ENV_VAR = "ECTRM_API_LOG_LEVEL"
DEFAULT_LOG_LEVEL = "INFO"
LOG_FORMAT = (
    "%(asctime)s %(levelname)s [%(name)s] %(message)s "
    "correlation_id=%(correlation_id)s actor_id=%(actor_id)s role=%(role)s "
    "session_id=%(session_id)s request_method=%(request_method)s request_path=%(request_path)s"
)


def _normalize_log_value(value: object | None) -> object:
    if value in (None, ""):
        return "-"
    return value


def _normalize_duration_ms(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.2f}"


def _summarize_log_error(error: object | None) -> str:
    if error in (None, ""):
        return "-"
    message = str(error).strip()
    if not message:
        return "-"
    if len(message) > 240:
        return f"{message[:237]}..."
    return message


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        identity = get_request_identity()
        record.correlation_id = _normalize_log_value(
            getattr(record, "correlation_id", None) or identity.correlation_id,
        )
        record.actor_id = _normalize_log_value(getattr(record, "actor_id", None) or identity.actor_id)
        record.role = _normalize_log_value(getattr(record, "role", None) or identity.role)
        record.session_id = _normalize_log_value(getattr(record, "session_id", None) or identity.session_id)
        record.request_method = _normalize_log_value(
            getattr(record, "request_method", None) or identity.request_method,
        )
        record.request_path = _normalize_log_value(getattr(record, "request_path", None) or identity.request_path)
        return True


def _resolve_log_level() -> int:
    configured_level = os.getenv(LOG_LEVEL_ENV_VAR, DEFAULT_LOG_LEVEL).strip().upper()
    return getattr(logging, configured_level, logging.INFO)


def configure_logging() -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAMESPACE)
    logger.setLevel(_resolve_log_level())

    if not any(getattr(handler, "_ectrm_handler", False) for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.setLevel(_resolve_log_level())
        handler.setFormatter(logging.Formatter(LOG_FORMAT))
        handler.addFilter(RequestContextFilter())
        handler._ectrm_handler = True  # type: ignore[attr-defined]
        logger.addHandler(handler)

    logger.propagate = False
    return logger


def sanitize_outbound_target(url: str) -> str:
    normalized_url = (url or "").strip()
    if not normalized_url:
        return "-"

    split = urlsplit(normalized_url)
    if not split.scheme and not split.netloc:
        return normalized_url.split("?", maxsplit=1)[0] or "-"

    return urlunsplit(
        (
            split.scheme,
            split.netloc,
            split.path or "/",
            "",
            "",
        )
    )


def resolve_http_status_code(response: Any) -> int | None:
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        return status_code

    status = getattr(response, "status", None)
    if isinstance(status, int):
        return status

    getcode = getattr(response, "getcode", None)
    if callable(getcode):
        try:
            resolved = getcode()
        except TypeError:
            resolved = None
        if isinstance(resolved, int):
            return resolved

    return None


def log_outbound_request(
    logger: logging.Logger,
    *,
    provider: str,
    method: str,
    url: str,
    status_code: int | None,
    duration_ms: float | None,
    error: object | None = None,
) -> None:
    message = (
        "Outbound request failed provider=%s method=%s target=%s status_code=%s duration_ms=%s error=%s"
        if error is not None
        else "Outbound request completed provider=%s method=%s target=%s status_code=%s duration_ms=%s"
    )
    args: tuple[object, ...] = (
        provider,
        (method or "").strip().upper() or "-",
        sanitize_outbound_target(url),
        status_code if status_code is not None else "-",
        _normalize_duration_ms(duration_ms),
    )

    if error is None:
        logger.info(message, *args)
        return

    log_method = logger.error if status_code is None or status_code >= 500 else logger.warning
    log_method(message, *args, _summarize_log_error(error))


def get_logger(name: str | None = None) -> logging.Logger:
    configure_logging()
    if not name:
        return logging.getLogger(LOGGER_NAMESPACE)

    normalized_name = name.strip()
    if normalized_name.startswith("apps.api.app."):
        normalized_name = normalized_name.removeprefix("apps.api.app.")
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{normalized_name}")
