from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from time import perf_counter
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.config import settings
from apps.api.app.core.logging import get_logger, log_outbound_request
from apps.api.app.domains.documents.services.ingestion import ingest_pdf_document
from apps.api.app.models.gmail_inbox_import_receipt import GmailInboxImportReceipt
from apps.api.app.schemas.document import (
    DocumentGmailImportedDocumentOut,
    DocumentGmailInboxAttachmentOut,
    DocumentGmailInboxBrowseResultOut,
    DocumentGmailInboxImportResultOut,
    DocumentGmailInboxMessageDetailOut,
    DocumentGmailInboxMessageSummaryOut,
    DocumentGmailInboxRuntimeSettingsOut,
)

logger = get_logger(__name__)
GMAIL_INBOX_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_INBOX_BROWSE_MAX_PAGE_SIZE = 50
GMAIL_INBOX_BODY_MAX_CHARS = 12_000


class GmailInboxIntegrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class GmailInboxConfig:
    enabled: bool
    client_id: str
    client_secret: str
    refresh_token: str
    account_email: str | None
    query: str
    max_messages_per_import: int
    timeout_seconds: int
    token_url: str
    api_base_url: str


@dataclass(frozen=True)
class GmailInboxAttachment:
    filename: str
    mime_type: str
    size_bytes: int
    part_token: str
    attachment_id: str | None
    inline_data: str | None
    importable: bool


class _HtmlTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"br", "p", "div", "li", "tr", "table", "section"}:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"p", "div", "li", "tr", "table", "section"}:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if data:
            self._parts.append(data)

    def get_text(self) -> str:
        combined = "".join(self._parts)
        combined = combined.replace("\xa0", " ")
        combined = re.sub(r"\n{3,}", "\n\n", combined)
        return combined.strip()


def build_gmail_inbox_runtime_settings() -> DocumentGmailInboxRuntimeSettingsOut:
    config = _gmail_inbox_config()
    auth_status = _gmail_inbox_auth_status(config)
    return DocumentGmailInboxRuntimeSettingsOut(
        enabled=config.enabled,
        configured=bool(config.enabled and auth_status == "configured"),
        provider="gmail_api",
        account_email=config.account_email,
        query=config.query,
        max_messages_per_import=config.max_messages_per_import,
        auth_status=auth_status,
    )


def list_gmail_inbox_messages(
    db: Session,
    *,
    query_override: str | None = None,
    page_size: int = 20,
    page_token: str | None = None,
) -> DocumentGmailInboxBrowseResultOut:
    config = _require_gmail_inbox_configured()
    resolved_query = _resolve_gmail_query(config, query_override)
    resolved_page_size = _resolve_gmail_browse_page_size(page_size)
    resolved_page_token = _optional_text(page_token)

    with httpx.Client(timeout=config.timeout_seconds) as http_client:
        access_token = _refresh_access_token(config, http_client=http_client)
        page_payload = _list_gmail_message_page(
            config,
            http_client=http_client,
            access_token=access_token,
            query=resolved_query,
            max_results=resolved_page_size,
            page_token=resolved_page_token,
        )
        message_summaries = page_payload.get("messages")
        next_page_token = _optional_text(page_payload.get("nextPageToken"))

        messages: list[DocumentGmailInboxMessageSummaryOut] = []
        for summary in message_summaries if isinstance(message_summaries, list) else []:
            message_id = _optional_text(summary.get("id"))
            if message_id is None:
                continue
            try:
                message = _get_gmail_message(
                    config,
                    http_client=http_client,
                    access_token=access_token,
                    message_id=message_id,
                    message_format="metadata",
                    metadata_headers=["Subject", "From"],
                )
            except LookupError:
                continue
            attachments = _extract_message_attachments(message.get("payload"))
            pdf_attachments = [attachment for attachment in attachments if attachment.importable]
            imported_pdf_count = sum(
                1
                for attachment in pdf_attachments
                if _gmail_receipt_exists(db, message_id=message_id, part_token=attachment.part_token)
            )
            messages.append(
                DocumentGmailInboxMessageSummaryOut(
                    message_id=message_id,
                    thread_id=_optional_text(message.get("threadId")) or _optional_text(summary.get("threadId")),
                    subject=_gmail_header_value(message.get("payload"), "subject"),
                    sender=_gmail_header_value(message.get("payload"), "from"),
                    received_at=_gmail_received_at(message),
                    snippet=_optional_text(message.get("snippet")),
                    unread=_gmail_message_unread(message),
                    attachment_count=len(attachments),
                    pdf_attachment_count=len(pdf_attachments),
                    imported_pdf_attachment_count=imported_pdf_count,
                )
            )

    return DocumentGmailInboxBrowseResultOut(
        query=resolved_query,
        page_size=resolved_page_size,
        next_page_token=next_page_token,
        messages=messages,
    )


def get_gmail_inbox_message_detail(
    db: Session,
    *,
    message_id: str,
) -> DocumentGmailInboxMessageDetailOut:
    config = _require_gmail_inbox_configured()
    resolved_message_id = _optional_text(message_id)
    if resolved_message_id is None:
        raise ValueError("Gmail message ID must not be blank.")

    with httpx.Client(timeout=config.timeout_seconds) as http_client:
        access_token = _refresh_access_token(config, http_client=http_client)
        message = _get_gmail_message(
            config,
            http_client=http_client,
            access_token=access_token,
            message_id=resolved_message_id,
            message_format="full",
        )

    attachments = _extract_message_attachments(message.get("payload"))
    body_text, body_truncated = _extract_message_body(message.get("payload"))
    return DocumentGmailInboxMessageDetailOut(
        message_id=resolved_message_id,
        thread_id=_optional_text(message.get("threadId")),
        subject=_gmail_header_value(message.get("payload"), "subject"),
        sender=_gmail_header_value(message.get("payload"), "from"),
        to_recipients=_gmail_header_value(message.get("payload"), "to"),
        received_at=_gmail_received_at(message),
        snippet=_optional_text(message.get("snippet")),
        unread=_gmail_message_unread(message),
        body_text=body_text,
        body_truncated=body_truncated,
        attachments=[
            DocumentGmailInboxAttachmentOut(
                filename=attachment.filename,
                mime_type=attachment.mime_type,
                size_bytes=attachment.size_bytes,
                part_token=attachment.part_token,
                attachment_id=attachment.attachment_id,
                importable=attachment.importable,
                already_imported=attachment.importable
                and _gmail_receipt_exists(
                    db,
                    message_id=resolved_message_id,
                    part_token=attachment.part_token,
                ),
            )
            for attachment in attachments
        ],
    )


def import_gmail_inbox_documents(
    db: Session,
    *,
    actor_id: str,
    query_override: str | None = None,
    max_messages_override: int | None = None,
) -> DocumentGmailInboxImportResultOut:
    config = _require_gmail_inbox_configured()
    resolved_query = _resolve_gmail_query(config, query_override)

    requested_max_messages = max_messages_override or config.max_messages_per_import
    resolved_max_messages = max(1, min(requested_max_messages, config.max_messages_per_import))

    with httpx.Client(timeout=config.timeout_seconds) as http_client:
        access_token = _refresh_access_token(config, http_client=http_client)
        message_summaries = _list_gmail_messages(
            config,
            http_client=http_client,
            access_token=access_token,
            query=resolved_query,
            max_results=resolved_max_messages,
        )

        matched_message_count = len(message_summaries)
        matched_attachment_count = 0
        imported_documents: list[DocumentGmailImportedDocumentOut] = []
        skipped_count = 0
        warnings: list[str] = []

        for summary in message_summaries:
            message_id = _optional_text(summary.get("id"))
            if message_id is None:
                continue
            try:
                message = _get_gmail_message(
                    config,
                    http_client=http_client,
                    access_token=access_token,
                    message_id=message_id,
                    message_format="full",
                )
            except LookupError:
                warnings.append(f"Skipped Gmail message {message_id}: the message was no longer available.")
                continue
            attachments = _extract_pdf_attachments(message.get("payload"))
            matched_attachment_count += len(attachments)
            if not attachments:
                continue

            thread_id = _optional_text(summary.get("threadId")) or _optional_text(message.get("threadId"))
            subject = _gmail_header_value(message.get("payload"), "subject")
            sender = _gmail_header_value(message.get("payload"), "from")
            received_at = _gmail_received_at(message)

            for attachment in attachments:
                if _gmail_receipt_exists(db, message_id=message_id, part_token=attachment.part_token):
                    skipped_count += 1
                    continue
                try:
                    payload = (
                        _decode_base64url(attachment.inline_data)
                        if attachment.inline_data is not None
                        else _get_gmail_attachment_bytes(
                            config,
                            http_client=http_client,
                            access_token=access_token,
                            message_id=message_id,
                            attachment_id=attachment.attachment_id,
                        )
                    )
                    document = ingest_pdf_document(
                        db,
                        actor_id=actor_id,
                        filename=attachment.filename,
                        content_type="application/pdf",
                        payload=payload,
                        display_name=_gmail_display_name(subject=subject, filename=attachment.filename),
                        processor_provider=None,
                    )
                except (LookupError, ValueError) as exc:
                    skipped_count += 1
                    warnings.append(
                        f"Skipped Gmail attachment {attachment.filename} from message {message_id}: {exc}"
                    )
                    continue

                db.add(
                    GmailInboxImportReceipt(
                        gmail_message_id=message_id,
                        gmail_thread_id=thread_id,
                        gmail_part_token=attachment.part_token,
                        gmail_attachment_id=attachment.attachment_id,
                        gmail_subject=_truncate_text(subject, 255),
                        gmail_sender=_truncate_text(sender, 255),
                        gmail_received_at=received_at,
                        document_id=document.document_id,
                        imported_at=datetime.now(timezone.utc),
                        imported_by=actor_id,
                        version=1,
                    )
                )
                imported_documents.append(
                    DocumentGmailImportedDocumentOut(
                        document_id=document.document_id,
                        display_name=document.display_name,
                        original_filename=document.original_filename,
                        gmail_message_id=message_id,
                        gmail_thread_id=thread_id,
                        gmail_subject=subject,
                        gmail_sender=sender,
                    )
                )

    return DocumentGmailInboxImportResultOut(
        query=resolved_query,
        requested_max_messages=resolved_max_messages,
        matched_message_count=matched_message_count,
        matched_attachment_count=matched_attachment_count,
        imported_count=len(imported_documents),
        skipped_count=skipped_count,
        imported_documents=imported_documents,
        warnings=warnings,
    )


def _require_gmail_inbox_configured() -> GmailInboxConfig:
    config = _gmail_inbox_config()
    if not config.enabled:
        raise ValueError("Gmail inbox import is not enabled on this API.")
    if _gmail_inbox_auth_status(config) != "configured":
        raise GmailInboxIntegrationError("Gmail inbox import is not fully configured on this API.")
    return config


def _gmail_inbox_config() -> GmailInboxConfig:
    account_email = _optional_text(settings.GMAIL_INBOX_ACCOUNT_EMAIL)
    return GmailInboxConfig(
        enabled=settings.GMAIL_INBOX_ENABLED,
        client_id=settings.GMAIL_INBOX_CLIENT_ID.strip(),
        client_secret=settings.GMAIL_INBOX_CLIENT_SECRET.strip(),
        refresh_token=settings.GMAIL_INBOX_REFRESH_TOKEN.strip(),
        account_email=account_email,
        query=settings.GMAIL_INBOX_QUERY.strip(),
        max_messages_per_import=settings.GMAIL_INBOX_MAX_MESSAGES_PER_IMPORT,
        timeout_seconds=settings.GMAIL_INBOX_TIMEOUT_SECONDS,
        token_url=settings.GMAIL_INBOX_TOKEN_URL.strip() or "https://oauth2.googleapis.com/token",
        api_base_url=settings.GMAIL_INBOX_API_BASE_URL.strip() or "https://gmail.googleapis.com/gmail/v1",
    )


def _resolve_gmail_query(config: GmailInboxConfig, query_override: str | None) -> str:
    resolved_query = (query_override or config.query).strip()
    if not resolved_query:
        raise ValueError("Gmail inbox query must not be blank.")
    return resolved_query


def _resolve_gmail_browse_page_size(page_size: int | None) -> int:
    candidate = page_size or 20
    return max(1, min(candidate, GMAIL_INBOX_BROWSE_MAX_PAGE_SIZE))


def _gmail_inbox_auth_status(config: GmailInboxConfig) -> str:
    has_client_id = bool(config.client_id)
    has_refresh_token = bool(config.refresh_token)
    if has_client_id and has_refresh_token:
        return "configured"
    if has_client_id or has_refresh_token or bool(config.client_secret):
        return "partial"
    return "none"


def _refresh_access_token(config: GmailInboxConfig, *, http_client: httpx.Client) -> str:
    payload = {
        "client_id": config.client_id,
        "refresh_token": config.refresh_token,
        "grant_type": "refresh_token",
    }
    if config.client_secret:
        payload["client_secret"] = config.client_secret

    started_at = perf_counter()
    try:
        response = http_client.post(
            config.token_url,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider="gmail-inbox-oauth",
            method="POST",
            url=config.token_url,
            status_code=getattr(exc.response, "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc,
        )
        raise GmailInboxIntegrationError("Could not refresh the Gmail inbox access token.") from exc

    log_outbound_request(
        logger,
        provider="gmail-inbox-oauth",
        method="POST",
        url=config.token_url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    access_token = _optional_text(response.json().get("access_token"))
    if access_token is None:
        raise GmailInboxIntegrationError("Gmail OAuth token refresh did not return an access token.")
    return access_token


def _list_gmail_messages(
    config: GmailInboxConfig,
    *,
    http_client: httpx.Client,
    access_token: str,
    query: str,
    max_results: int,
) -> list[dict[str, Any]]:
    payload = _list_gmail_message_page(
        config,
        http_client=http_client,
        access_token=access_token,
        query=query,
        max_results=max_results,
        page_token=None,
    )
    messages = payload.get("messages")
    return list(messages) if isinstance(messages, list) else []


def _list_gmail_message_page(
    config: GmailInboxConfig,
    *,
    http_client: httpx.Client,
    access_token: str,
    query: str,
    max_results: int,
    page_token: str | None,
) -> dict[str, Any]:
    params = {
        "labelIds": "INBOX",
        "includeSpamTrash": "false",
        "maxResults": str(max_results),
        "q": query,
    }
    if page_token:
        params["pageToken"] = page_token
    return _gmail_get_json(
        config,
        http_client=http_client,
        access_token=access_token,
        path="/users/me/messages",
        params=params,
    )


def _get_gmail_message(
    config: GmailInboxConfig,
    *,
    http_client: httpx.Client,
    access_token: str,
    message_id: str,
    message_format: str,
    metadata_headers: list[str] | None = None,
) -> dict[str, Any]:
    params: dict[str, str] = {"format": message_format}
    if metadata_headers:
        params["metadataHeaders"] = ",".join(metadata_headers)
    payload = _gmail_get_json(
        config,
        http_client=http_client,
        access_token=access_token,
        path=f"/users/me/messages/{message_id}",
        params=params,
    )
    return payload


def _get_gmail_attachment_bytes(
    config: GmailInboxConfig,
    *,
    http_client: httpx.Client,
    access_token: str,
    message_id: str,
    attachment_id: str | None,
) -> bytes:
    if attachment_id is None:
        raise LookupError("Gmail attachment data was missing an attachment ID.")
    payload = _gmail_get_json(
        config,
        http_client=http_client,
        access_token=access_token,
        path=f"/users/me/messages/{message_id}/attachments/{attachment_id}",
    )
    data = _optional_text(payload.get("data"))
    if data is None:
        raise LookupError("Gmail attachment response did not contain attachment data.")
    return _decode_base64url(data)


def _gmail_get_json(
    config: GmailInboxConfig,
    *,
    http_client: httpx.Client,
    access_token: str,
    path: str,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    url = f"{config.api_base_url.rstrip('/')}{path}"
    started_at = perf_counter()
    try:
        response = http_client.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        log_outbound_request(
            logger,
            provider="gmail-inbox-api",
            method="GET",
            url=url,
            status_code=exc.response.status_code,
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc,
        )
        if exc.response.status_code == 404:
            raise LookupError(f"Gmail resource for {path} was not found.") from exc
        raise GmailInboxIntegrationError(f"Gmail inbox request failed for {path}.") from exc
    except httpx.HTTPError as exc:
        log_outbound_request(
            logger,
            provider="gmail-inbox-api",
            method="GET",
            url=url,
            status_code=getattr(exc.response, "status_code", None),
            duration_ms=(perf_counter() - started_at) * 1000,
            error=exc,
        )
        raise GmailInboxIntegrationError(f"Gmail inbox request failed for {path}.") from exc

    log_outbound_request(
        logger,
        provider="gmail-inbox-api",
        method="GET",
        url=url,
        status_code=response.status_code,
        duration_ms=(perf_counter() - started_at) * 1000,
    )
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def _extract_pdf_attachments(payload: Any) -> list[GmailInboxAttachment]:
    return [attachment for attachment in _extract_message_attachments(payload) if attachment.importable]


def _extract_message_attachments(payload: Any) -> list[GmailInboxAttachment]:
    attachments: list[GmailInboxAttachment] = []
    if not isinstance(payload, dict):
        return attachments

    filename = _optional_text(payload.get("filename"))
    mime_type = _optional_text(payload.get("mimeType"), lowercase=True) or "application/octet-stream"
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    parts = payload.get("parts") if isinstance(payload.get("parts"), list) else []
    part_id = _optional_text(payload.get("partId"))

    if filename:
        attachment_id = _optional_text(body.get("attachmentId"))
        inline_data = _optional_text(body.get("data"))
        part_token = attachment_id or f"inline:{part_id or filename}"
        attachments.append(
            GmailInboxAttachment(
                filename=filename,
                mime_type=mime_type,
                size_bytes=_integer_value(body.get("size")),
                part_token=part_token,
                attachment_id=attachment_id,
                inline_data=inline_data,
                importable=filename.lower().endswith(".pdf") or mime_type == "application/pdf",
            )
        )

    for part in parts:
        attachments.extend(_extract_message_attachments(part))
    return attachments


def _extract_message_body(payload: Any) -> tuple[str | None, bool]:
    plain_parts = _collect_message_body_parts(payload, target_mime_types={"text/plain"})
    if plain_parts:
        return _truncate_body_text("\n\n".join(part for part in plain_parts if part))

    html_parts = _collect_message_body_parts(payload, target_mime_types={"text/html"})
    if not html_parts:
        return None, False

    extractor = _HtmlTextExtractor()
    for html_part in html_parts:
        extractor.feed(html_part)
        extractor.feed("\n")
    return _truncate_body_text(extractor.get_text())


def _collect_message_body_parts(payload: Any, *, target_mime_types: set[str]) -> list[str]:
    if not isinstance(payload, dict):
        return []

    text_parts: list[str] = []
    filename = _optional_text(payload.get("filename"))
    mime_type = _optional_text(payload.get("mimeType"), lowercase=True)
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    parts = payload.get("parts") if isinstance(payload.get("parts"), list) else []

    if not filename and mime_type in target_mime_types:
        data = _optional_text(body.get("data"))
        if data is not None:
            text_value = _decode_base64url_text(data)
            if text_value:
                text_parts.append(text_value)

    for part in parts:
        text_parts.extend(_collect_message_body_parts(part, target_mime_types=target_mime_types))
    return text_parts


def _gmail_header_value(payload: Any, header_name: str) -> str | None:
    if not isinstance(payload, dict):
        return None
    headers = payload.get("headers")
    if not isinstance(headers, list):
        return None
    target_name = header_name.strip().lower()
    for header in headers:
        if not isinstance(header, dict):
            continue
        name = _optional_text(header.get("name"), lowercase=True)
        if name != target_name:
            continue
        return _optional_text(header.get("value"))
    return None


def _gmail_received_at(message: dict[str, Any]) -> datetime | None:
    internal_date_value = _optional_text(message.get("internalDate"))
    if internal_date_value and internal_date_value.isdigit():
        try:
            return datetime.fromtimestamp(int(internal_date_value) / 1000, tz=timezone.utc)
        except (OverflowError, ValueError):
            return None
    return None


def _gmail_message_unread(message: dict[str, Any]) -> bool:
    label_ids = message.get("labelIds")
    if not isinstance(label_ids, list):
        return False
    return "UNREAD" in {str(label).strip().upper() for label in label_ids}


def _gmail_display_name(*, subject: str | None, filename: str) -> str:
    cleaned_subject = _optional_text(subject)
    if cleaned_subject:
        return f"Gmail · {cleaned_subject} · {filename}"
    return f"Gmail · {filename}"


def _gmail_receipt_exists(db: Session, *, message_id: str, part_token: str) -> bool:
    existing = db.execute(
        select(GmailInboxImportReceipt.receipt_id).where(
            GmailInboxImportReceipt.gmail_message_id == message_id,
            GmailInboxImportReceipt.gmail_part_token == part_token,
        )
    ).scalar_one_or_none()
    return existing is not None


def _optional_text(value: object, *, lowercase: bool = False) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    return normalized.lower() if lowercase else normalized


def _integer_value(value: object) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, float):
        return max(int(value), 0)
    if isinstance(value, str) and value.strip().isdigit():
        return max(int(value.strip()), 0)
    return 0


def _truncate_text(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    return value[:max_length]


def _truncate_body_text(value: str | None) -> tuple[str | None, bool]:
    if value is None:
        return None, False
    normalized = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    if not normalized:
        return None, False
    if len(normalized) <= GMAIL_INBOX_BODY_MAX_CHARS:
        return normalized, False
    return normalized[:GMAIL_INBOX_BODY_MAX_CHARS].rstrip(), True


def _decode_base64url_text(value: str | None) -> str | None:
    decoded_bytes = _decode_base64url(value)
    decoded_text = decoded_bytes.decode("utf-8", errors="replace").strip()
    return decoded_text or None


def _decode_base64url(value: str | None) -> bytes:
    if value is None:
        raise GmailInboxIntegrationError("Gmail attachment data was empty.")
    normalized = value.encode("utf-8")
    padding = (-len(normalized)) % 4
    if padding:
        normalized += b"=" * padding
    try:
        return base64.urlsafe_b64decode(normalized)
    except (ValueError, TypeError) as exc:
        raise GmailInboxIntegrationError("Could not decode Gmail attachment data.") from exc
