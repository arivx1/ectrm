from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.integration import (
    GrainClientRecordingsOut,
    GrainConnectionTestOut,
    GrainRecordingSummaryOut,
    GrainRuntimeSettingsOut,
)

logger = get_logger(__name__)

GRAIN_DEFAULT_BASE_URL = "https://api.grain.com"
GRAIN_DEFAULT_PUBLIC_API_VERSION = "2025-10-31"
GRAIN_REQUIRED_CAPABILITIES = ("Grain recordings read access",)


class GrainIntegrationError(RuntimeError):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class GrainConfig:
    enabled: bool
    access_token: str
    base_url: str
    public_api_version: str
    timeout_seconds: int
    recording_limit: int


class GrainClient:
    def __init__(self, config: GrainConfig) -> None:
        self.config = config

    def list_recordings(self) -> dict[str, Any]:
        return self._post(
            "/_/public-api/v2/recordings",
            {"include": {"participants": True}},
        )

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", path, payload=payload)

    def _request(self, method: str, path: str, *, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.config.access_token}",
            "Public-Api-Version": self.config.public_api_version,
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        started_at = perf_counter()
        try:
            with httpx.Client(timeout=self.config.timeout_seconds) as client:
                response = client.request(method, url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            log_outbound_request(
                logger,
                provider="grain-api",
                method=method,
                url=url,
                status_code=getattr(getattr(exc, "response", None), "status_code", None),
                duration_ms=(perf_counter() - started_at) * 1000,
                error=exc,
            )
            raise GrainIntegrationError(502, f"Grain request failed for {path}.") from exc

        log_outbound_request(
            logger,
            provider="grain-api",
            method=method,
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=None if response.status_code < 400 else response.text,
        )

        if response.status_code >= 400:
            raise _grain_response_error(path=path, response=response)

        try:
            response_payload = response.json()
        except ValueError as exc:
            raise GrainIntegrationError(502, f"Grain request for {path} returned invalid JSON.") from exc
        if not isinstance(response_payload, dict):
            raise GrainIntegrationError(502, f"Grain request for {path} returned an unexpected response.")
        return response_payload


def build_grain_runtime_settings() -> GrainRuntimeSettingsOut:
    config = _grain_config()
    configured = config.enabled and bool(config.access_token)
    auth_status = "configured" if configured else "partial" if config.enabled else "none"
    missing_configuration: list[str] = []
    if not config.enabled:
        missing_configuration.append("GRAIN_ENABLED")
    if not config.access_token:
        missing_configuration.append("GRAIN_ACCESS_TOKEN or GRAIN_API_KEY")
    return GrainRuntimeSettingsOut(
        enabled=config.enabled,
        configured=configured,
        auth_status=auth_status,
        base_url=config.base_url,
        public_api_version=config.public_api_version,
        recording_limit=config.recording_limit,
        required_capabilities=list(GRAIN_REQUIRED_CAPABILITIES),
        missing_configuration=missing_configuration,
    )


def run_grain_connection_test(*, client: GrainClient | None = None) -> GrainConnectionTestOut:
    config = _require_grain_configured()
    grain_client = client or GrainClient(config)
    payload = grain_client.list_recordings()
    recording_payloads = payload.get("recordings")
    if not isinstance(recording_payloads, list):
        raise GrainIntegrationError(502, "Grain list recordings returned an unexpected response.")
    recordings = [
        _grain_recording_summary_from_payload(item)
        for item in recording_payloads
        if isinstance(item, dict)
    ]
    returned_recordings = recordings[: config.recording_limit]
    warnings: list[str] = []
    if not recordings:
        warnings.append("Grain connected successfully but returned no visible recordings.")
    return GrainConnectionTestOut(
        recording_count=len(recordings),
        returned_recording_count=len(returned_recordings),
        cursor=_optional_text(payload.get("cursor")),
        recordings=returned_recordings,
        required_capabilities=list(GRAIN_REQUIRED_CAPABILITIES),
        warnings=warnings,
    )


def build_grain_client_recordings(
    *,
    client_name: str,
    client: GrainClient | None = None,
) -> GrainClientRecordingsOut:
    config = _require_grain_configured()
    normalized_client_name = _required_text(client_name)
    grain_client = client or GrainClient(config)
    payload = grain_client.list_recordings()
    recording_payloads = payload.get("recordings")
    if not isinstance(recording_payloads, list):
        raise GrainIntegrationError(502, "Grain list recordings returned an unexpected response.")

    matched_recordings = [
        _grain_recording_summary_from_payload(item)
        for item in recording_payloads
        if isinstance(item, dict) and _recording_matches_client(item, normalized_client_name)
    ]
    returned_recordings = matched_recordings[: config.recording_limit]
    warnings: list[str] = []
    if not matched_recordings:
        warnings.append(f"No Grain recordings matched '{normalized_client_name}'.")
    if len(matched_recordings) > len(returned_recordings):
        warnings.append("More matching Grain recordings are available than this client view returned.")

    return GrainClientRecordingsOut(
        client_name=normalized_client_name,
        query=normalized_client_name,
        matched=bool(matched_recordings),
        recording_count=len(matched_recordings),
        returned_recording_count=len(returned_recordings),
        cursor=_optional_text(payload.get("cursor")),
        recordings=returned_recordings,
        required_capabilities=list(GRAIN_REQUIRED_CAPABILITIES),
        warnings=warnings,
    )


def _grain_config() -> GrainConfig:
    access_token = settings.GRAIN_ACCESS_TOKEN.strip() or settings.GRAIN_API_KEY.strip()
    base_url = settings.GRAIN_BASE_URL.strip() or GRAIN_DEFAULT_BASE_URL
    public_api_version = settings.GRAIN_PUBLIC_API_VERSION.strip() or GRAIN_DEFAULT_PUBLIC_API_VERSION
    return GrainConfig(
        enabled=settings.GRAIN_ENABLED,
        access_token=access_token,
        base_url=base_url.rstrip("/"),
        public_api_version=public_api_version,
        timeout_seconds=settings.GRAIN_TIMEOUT_SECONDS,
        recording_limit=settings.GRAIN_RECORDING_LIMIT,
    )


def _require_grain_configured() -> GrainConfig:
    config = _grain_config()
    if not config.enabled:
        raise GrainIntegrationError(503, "Grain integration is disabled on this API.")
    if not config.access_token:
        raise GrainIntegrationError(
            503,
            "Grain integration needs GRAIN_ACCESS_TOKEN or GRAIN_API_KEY before it can connect.",
        )
    return config


def _grain_response_error(*, path: str, response: httpx.Response) -> GrainIntegrationError:
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", "").strip()
        suffix = f" Retry after {retry_after}." if retry_after else ""
        return GrainIntegrationError(429, f"Grain rate limited the request for {path}.{suffix}")
    if response.status_code in {401, 403}:
        return GrainIntegrationError(
            502,
            "Grain rejected the configured credential. Confirm the token and recordings read access.",
        )
    return GrainIntegrationError(
        502,
        f"Grain request for {path} failed with HTTP {response.status_code}.",
    )


def _grain_recording_summary_from_payload(payload: dict[str, Any]) -> GrainRecordingSummaryOut:
    participants = payload.get("participants")
    return GrainRecordingSummaryOut(
        id=_required_payload_text(payload.get("id") or payload.get("recording_id"), "Grain recording id"),
        title=_optional_text(payload.get("title")),
        url=_optional_text(payload.get("url")),
        source=_optional_text(payload.get("source")),
        media_type=_optional_text(payload.get("media_type")),
        start_time=_optional_text(
            payload.get("start_datetime")
            or payload.get("start_time")
            or payload.get("created_at")
        ),
        end_time=_optional_text(payload.get("end_datetime") or payload.get("end_time")),
        duration_seconds=_recording_duration_seconds(payload),
        participant_count=len(participants) if isinstance(participants, list) else None,
    )


def _recording_duration_seconds(payload: dict[str, Any]) -> float | None:
    duration_ms = _optional_float(payload.get("duration_ms"))
    if duration_ms is not None:
        return duration_ms / 1000
    return _optional_float(payload.get("duration_seconds") or payload.get("duration"))


def _recording_matches_client(payload: dict[str, Any], client_name: str) -> bool:
    query = client_name.strip().lower()
    if not query:
        return False

    candidate_text: list[str] = []
    for field_name in ("title", "url", "source", "media_type"):
        value = _optional_text(payload.get(field_name))
        if value:
            candidate_text.append(value)

    participants = payload.get("participants")
    if isinstance(participants, list):
        for participant in participants:
            if isinstance(participant, dict):
                for value in participant.values():
                    text = _optional_text(value)
                    if text:
                        candidate_text.append(text)
            else:
                text = _optional_text(participant)
                if text:
                    candidate_text.append(text)

    return query in " ".join(candidate_text).lower()


def _required_text(value: object) -> str:
    text = _optional_text(value)
    if text is None:
        raise GrainIntegrationError(422, "Client name is required.")
    return text


def _required_payload_text(value: object, label: str) -> str:
    text = _optional_text(value)
    if text is None:
        raise GrainIntegrationError(502, f"{label} was missing from the Grain response.")
    return text


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _optional_float(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
