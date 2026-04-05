from __future__ import annotations

import logging
import os

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


def get_logger(name: str | None = None) -> logging.Logger:
    configure_logging()
    if not name:
        return logging.getLogger(LOGGER_NAMESPACE)

    normalized_name = name.strip()
    if normalized_name.startswith("apps.api.app."):
        normalized_name = normalized_name.removeprefix("apps.api.app.")
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{normalized_name}")
