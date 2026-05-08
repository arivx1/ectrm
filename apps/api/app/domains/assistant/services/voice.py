from __future__ import annotations

from pathlib import Path
from time import perf_counter
from typing import Any, cast

import httpx

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.schemas.assistant import AssistantVoiceTranscriptionOut, AssistantVoiceTranscriptionSettingsOut

logger = get_logger(__name__)

SUPPORTED_VOICE_TRANSCRIPTION_CONTENT_TYPES: tuple[str, ...] = (
    "audio/flac",
    "audio/m4a",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/mpga",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-wav",
    "video/mp4",
)
SUPPORTED_VOICE_TRANSCRIPTION_SUFFIXES: tuple[str, ...] = (
    "flac",
    "m4a",
    "mp3",
    "mp4",
    "mpeg",
    "mpga",
    "ogg",
    "wav",
    "webm",
)
CONTENT_TYPE_SUFFIX_HINTS: dict[str, str] = {
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mpga": "mpga",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-wav": "wav",
    "video/mp4": "mp4",
}


class AssistantVoiceTranscriptionError(Exception):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def build_assistant_voice_transcription_settings() -> AssistantVoiceTranscriptionSettingsOut:
    return AssistantVoiceTranscriptionSettingsOut(
        enabled=bool(
            settings.ASSISTANT_ENABLED
            and settings.ASSISTANT_VOICE_TRANSCRIPTION_ENABLED
            and settings.OPENAI_API_KEY.strip()
            and settings.OPENAI_AUDIO_TRANSCRIPTION_MODEL.strip()
        ),
        provider="openai",
        model=settings.OPENAI_AUDIO_TRANSCRIPTION_MODEL.strip(),
        max_upload_bytes=settings.ASSISTANT_VOICE_TRANSCRIPTION_MAX_UPLOAD_BYTES,
        supported_content_types=list(SUPPORTED_VOICE_TRANSCRIPTION_CONTENT_TYPES),
    )


async def transcribe_assistant_voice_audio(
    *,
    filename: str,
    content_type: str | None,
    payload: bytes,
) -> AssistantVoiceTranscriptionOut:
    runtime_settings = build_assistant_voice_transcription_settings()
    if not runtime_settings.enabled:
        raise AssistantVoiceTranscriptionError(
            status_code=503,
            detail="Assistant voice transcription is not configured on this API.",
        )

    if not payload:
        raise AssistantVoiceTranscriptionError(
            status_code=422,
            detail="Voice transcription requires a non-empty audio upload.",
        )

    if len(payload) > runtime_settings.max_upload_bytes:
        raise AssistantVoiceTranscriptionError(
            status_code=413,
            detail=(
                "Voice transcription uploads must be 25 MB or smaller. "
                f"Received {len(payload):,} bytes."
            ),
        )

    normalized_content_type = _normalize_content_type(content_type)
    resolved_filename = _resolve_upload_filename(filename, normalized_content_type)
    response_payload = await _post_multipart(
        url=f"{settings.OPENAI_BASE_URL.rstrip('/')}/audio/transcriptions",
        headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY.strip()}"},
        data={
            "model": runtime_settings.model,
            "response_format": "json",
        },
        files={
            "file": (
                resolved_filename,
                payload,
                normalized_content_type or "application/octet-stream",
            ),
        },
        provider_label="OpenAI Voice Transcription",
    )
    transcript = _extract_transcription_text(response_payload)
    if not transcript:
        raise AssistantVoiceTranscriptionError(
            status_code=502,
            detail="OpenAI Voice Transcription returned no transcript text.",
        )

    return AssistantVoiceTranscriptionOut(
        provider="openai",
        model=runtime_settings.model,
        text=transcript,
    )


def _normalize_content_type(content_type: str | None) -> str | None:
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    return normalized or None


def _resolve_upload_filename(filename: str, content_type: str | None) -> str:
    normalized_filename = Path(filename.strip() or "voice-note.webm").name
    suffix = normalized_filename.rsplit(".", 1)[-1].lower() if "." in normalized_filename else ""
    if suffix in SUPPORTED_VOICE_TRANSCRIPTION_SUFFIXES:
        return normalized_filename

    hinted_suffix = CONTENT_TYPE_SUFFIX_HINTS.get(content_type or "")
    if hinted_suffix:
        stem = normalized_filename.rsplit(".", 1)[0] if "." in normalized_filename else normalized_filename
        stem = stem or "voice-note"
        return f"{stem}.{hinted_suffix}"

    raise AssistantVoiceTranscriptionError(
        status_code=422,
        detail=(
            "Voice transcription accepts flac, m4a, mp3, mp4, mpeg, mpga, ogg, wav, or webm audio uploads."
        ),
    )


def _extract_transcription_text(response_payload: dict[str, Any]) -> str:
    text = response_payload.get("text")
    if not isinstance(text, str):
        return ""
    return text.strip()


async def _post_multipart(
    *,
    url: str,
    headers: dict[str, str],
    data: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
    provider_label: str,
) -> dict[str, Any]:
    started_at = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.ASSISTANT_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url,
                headers=headers,
                data=data,
                files=files,
            )
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider=provider_label,
            method="POST",
            url=url,
            status_code=getattr(getattr(exc, "response", None), "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc.__class__.__name__,
        )
        raise AssistantVoiceTranscriptionError(
            status_code=502,
            detail=f"{provider_label} request failed: {exc}",
        ) from exc

    if response.is_error:
        detail = _extract_provider_error_message(provider_label, response)
        log_outbound_request(
            logger,
            provider=provider_label,
            method="POST",
            url=url,
            status_code=response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=detail,
        )
        raise AssistantVoiceTranscriptionError(
            status_code=502 if response.status_code >= 500 else 400,
            detail=detail,
        )

    log_outbound_request(
        logger,
        provider=provider_label,
        method="POST",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    return cast(dict[str, Any], response.json())


def _extract_provider_error_message(provider_label: str, response: httpx.Response) -> str:
    default_message = f"{provider_label} request failed with status {response.status_code}."
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        return text or default_message

    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
        type_value = error.get("type")
        if isinstance(type_value, str) and type_value.strip():
            return f"{default_message} {type_value.strip()}"
    if isinstance(error, str) and error.strip():
        return error.strip()
    detail = payload.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail.strip()
    return default_message
