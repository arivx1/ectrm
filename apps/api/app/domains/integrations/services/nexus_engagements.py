from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.domains.integrations.services.gmail_inbox import (
    GmailInboxIntegrationError,
    list_gmail_inbox_messages,
)
from apps.api.app.domains.messages.services.workspace import list_messaging_workspace_state
from apps.api.app.models.nexus_contact import NexusContact
from apps.api.app.schemas.document import DocumentGmailInboxMessageSummaryOut
from apps.api.app.schemas.integration import (
    NexusClientEngagementOut,
    NexusClientEngagementRequest,
    NexusClientEngagementsOut,
)
from apps.api.app.schemas.messaging import (
    MessagingWorkspaceConversationOut,
    MessagingWorkspaceTimelineItemOut,
)

NEXUS_ENGAGEMENT_SNIPPET_MAX_CHARS = 320
NEXUS_CLIENT_DOMAIN_HINTS: dict[str, tuple[str, ...]] = {
    "international materials": ("imigroup.com", "imius.com"),
}


def build_nexus_client_engagements(
    db: Session,
    *,
    payload: NexusClientEngagementRequest,
) -> NexusClientEngagementsOut:
    client_name = payload.client_name
    domains = _normalize_domains([*payload.domains, *_domain_hints_for_client(client_name)])
    contact_emails = _normalize_emails(
        [
            *payload.contact_emails,
            *_load_nexus_contact_emails(db, client_name=client_name),
        ]
    )
    warnings: list[str] = []
    items: list[NexusClientEngagementOut] = []

    gmail_query = _build_gmail_engagement_query(
        domains=domains,
        contact_emails=contact_emails,
        lookback_days=payload.lookback_days,
    )
    if gmail_query is None:
        warnings.append(
            "Gmail engagement search skipped: no company domains or contact emails were available "
            "for sender/recipient matching."
        )
    else:
        try:
            gmail_messages = list_gmail_inbox_messages(
                db,
                query_override=gmail_query,
                page_size=payload.limit,
                page_token=None,
                label_ids=None,
            )
        except (ValueError, GmailInboxIntegrationError) as exc:
            warnings.append(f"Gmail engagement search unavailable: {exc}")
        else:
            skipped_gmail_messages = 0
            for message in gmail_messages.messages:
                engagement = _gmail_message_to_engagement(
                    message,
                    domains=domains,
                    contact_emails=contact_emails,
                )
                if engagement is None:
                    skipped_gmail_messages += 1
                    continue
                items.append(engagement)
            if skipped_gmail_messages:
                warnings.append(
                    f"Skipped {skipped_gmail_messages} Gmail match(es) without a company sender or recipient."
                )
            if gmail_messages.next_page_token:
                warnings.append("More Gmail matches are available beyond the returned engagement window.")

    slack_items, slack_warnings = _load_slack_engagement_items(
        db,
        client_name=client_name,
        domains=domains,
        contact_emails=contact_emails,
    )
    items.extend(slack_items)
    warnings.extend(slack_warnings)

    sorted_items = sorted(items, key=_engagement_sort_key, reverse=True)
    selected_items = sorted_items[: payload.limit]
    return NexusClientEngagementsOut(
        client_name=client_name,
        lookback_days=payload.lookback_days,
        requested_limit=payload.limit,
        matched_count=len(sorted_items),
        returned_count=len(selected_items),
        source_counts=_source_counts(sorted_items),
        gmail_query=gmail_query,
        items=selected_items,
        warnings=warnings,
    )


def _load_nexus_contact_emails(db: Session, *, client_name: str) -> list[str]:
    records = db.execute(
        select(NexusContact.email).where(
            func.lower(NexusContact.client_name) == client_name.casefold(),
            NexusContact.email.is_not(None),
        )
    ).scalars().all()
    return [record for record in records if record]


def _domain_hints_for_client(client_name: str) -> list[str]:
    return list(NEXUS_CLIENT_DOMAIN_HINTS.get(client_name.casefold(), ()))


def _build_gmail_engagement_query(
    *,
    domains: list[str],
    contact_emails: list[str],
    lookback_days: int,
) -> str | None:
    terms: list[str] = []
    participant_operators = ("from", "to", "cc", "bcc")
    for domain in domains:
        terms.extend(f"{operator}:{domain}" for operator in participant_operators)
    for email in contact_emails:
        terms.extend(f"{operator}:{email}" for operator in participant_operators)
    if not terms:
        return None
    return f"newer_than:{lookback_days}d ({' OR '.join(terms)})"


def _gmail_message_to_engagement(
    message: DocumentGmailInboxMessageSummaryOut,
    *,
    domains: list[str],
    contact_emails: list[str],
) -> NexusClientEngagementOut | None:
    title = message.subject or "Gmail message"
    matched_basis = _gmail_participant_matched_basis(
        message,
        domains=domains,
        contact_emails=contact_emails,
    )
    if not matched_basis:
        return None
    return NexusClientEngagementOut(
        provider="gmail",
        source_surface="gmail_api",
        external_id=message.message_id,
        title=title,
        snippet=_truncate_text(message.snippet, NEXUS_ENGAGEMENT_SNIPPET_MAX_CHARS),
        occurred_at=message.received_at,
        author=message.sender,
        matched_basis=matched_basis,
        metadata={
            "thread_id": message.thread_id,
            "unread": message.unread,
            "attachment_count": message.attachment_count,
            "pdf_attachment_count": message.pdf_attachment_count,
            "imported_pdf_attachment_count": message.imported_pdf_attachment_count,
            "to_recipients": message.to_recipients,
            "cc_recipients": message.cc_recipients,
        },
    )


def _load_slack_engagement_items(
    db: Session,
    *,
    client_name: str,
    domains: list[str],
    contact_emails: list[str],
) -> tuple[list[NexusClientEngagementOut], list[str]]:
    try:
        state = list_messaging_workspace_state(db)
    except Exception as exc:  # pragma: no cover - defensive around schema drift
        return [], [f"Slack engagement mirror unavailable: {exc}"]

    slack_conversations = [
        conversation
        for conversation in state.conversations
        if conversation.source_provider == "slack"
    ]
    if not slack_conversations:
        return [], ["No synced Slack conversations are available in the Messages mirror."]

    items: list[NexusClientEngagementOut] = []
    for conversation in slack_conversations:
        conversation_basis = _slack_conversation_matched_basis(
            conversation,
            client_name=client_name,
            domains=domains,
            contact_emails=contact_emails,
        )
        for timeline_item in conversation.timeline:
            if timeline_item.kind != "message" or timeline_item.deleted_at is not None:
                continue
            item_basis = _slack_message_matched_basis(
                timeline_item,
                client_name=client_name,
                domains=domains,
                contact_emails=contact_emails,
            )
            matched_basis = _merge_basis(conversation_basis, item_basis)
            if not matched_basis:
                continue
            author_name = timeline_item.author.name if timeline_item.author else None
            snippet = _truncate_text(" ".join(timeline_item.body), NEXUS_ENGAGEMENT_SNIPPET_MAX_CHARS)
            items.append(
                NexusClientEngagementOut(
                    provider="slack",
                    source_surface="messages_workspace_mirror",
                    external_id=timeline_item.id,
                    title=f"{conversation.label} - {author_name or 'Slack message'}",
                    snippet=snippet,
                    occurred_at=timeline_item.created_at,
                    author=author_name,
                    matched_basis=matched_basis,
                    conversation_id=conversation.conversation_id,
                    metadata={
                        "reply_count": timeline_item.reply_count,
                        "thread_root_message_id": timeline_item.thread_root_message_id,
                        "reactions": list(timeline_item.reactions),
                    },
                )
            )
    return items, []


def _slack_conversation_matched_basis(
    conversation: MessagingWorkspaceConversationOut,
    *,
    client_name: str,
    domains: list[str],
    contact_emails: list[str],
) -> list[str]:
    return _matched_basis(
        [
            conversation.conversation_id,
            conversation.label,
            conversation.description,
            conversation.topic,
            conversation.preview,
        ],
        client_name=client_name,
        domains=domains,
        contact_emails=contact_emails,
        prefix="slack_conversation",
    )


def _slack_message_matched_basis(
    item: MessagingWorkspaceTimelineItemOut,
    *,
    client_name: str,
    domains: list[str],
    contact_emails: list[str],
) -> list[str]:
    author_values: list[str | None] = []
    if item.author is not None:
        author_values = [item.author.name, item.author.title, item.author.presence]
    return _matched_basis(
        [
            item.source,
            item.label,
            item.detail,
            " ".join(item.body),
            *author_values,
        ],
        client_name=client_name,
        domains=domains,
        contact_emails=contact_emails,
        prefix="slack_message",
    )


def _gmail_participant_matched_basis(
    message: DocumentGmailInboxMessageSummaryOut,
    *,
    domains: list[str],
    contact_emails: list[str],
) -> list[str]:
    participant_text = " ".join(
        value
        for value in [
            message.sender,
            message.to_recipients,
            message.cc_recipients,
            message.bcc_recipients,
        ]
        if value
    ).casefold()
    if not participant_text:
        return []

    basis: list[str] = []
    for domain in domains:
        if domain.casefold() in participant_text:
            basis.append(f"gmail_participant:domain:{domain}")
    for email in contact_emails:
        if email.casefold() in participant_text:
            basis.append(f"gmail_participant:contact_email:{email}")
    return basis


def _matched_basis(
    values: list[str | None],
    *,
    client_name: str,
    domains: list[str],
    contact_emails: list[str],
    prefix: str | None = None,
) -> list[str]:
    text = " ".join(value for value in values if value).casefold()
    if not text:
        return []

    basis: list[str] = []
    basis_prefix = f"{prefix}:" if prefix else ""
    if client_name.casefold() in text:
        basis.append(f"{basis_prefix}client_name")
    for domain in domains:
        if domain.casefold() in text:
            basis.append(f"{basis_prefix}domain:{domain}")
    for email in contact_emails:
        if email.casefold() in text:
            basis.append(f"{basis_prefix}contact_email:{email}")
    return basis


def _normalize_domains(values: list[str]) -> list[str]:
    normalized_values: list[str] = []
    seen_values: set[str] = set()
    for value in values:
        normalized = value.strip().lower()
        normalized = re.sub(r"^https?://", "", normalized)
        normalized = normalized.removeprefix("www.")
        normalized = normalized.split("/", 1)[0].strip().lstrip("@")
        if not normalized or "." not in normalized:
            continue
        if normalized in seen_values:
            continue
        seen_values.add(normalized)
        normalized_values.append(normalized)
    return normalized_values


def _normalize_emails(values: list[str]) -> list[str]:
    normalized_values: list[str] = []
    seen_values: set[str] = set()
    for value in values:
        match = re.search(r"[\w.+%'-]+@[\w.-]+\.[A-Za-z]{2,}", value.strip())
        if match is None:
            continue
        normalized = match.group(0).lower()
        if normalized in seen_values:
            continue
        seen_values.add(normalized)
        normalized_values.append(normalized)
    return normalized_values


def _merge_basis(*basis_groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for basis_group in basis_groups:
        for item in basis_group:
            if item in seen:
                continue
            seen.add(item)
            merged.append(item)
    return merged


def _truncate_text(value: str | None, max_length: int) -> str | None:
    normalized = " ".join(str(value or "").split()).strip()
    if not normalized:
        return None
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[: max_length - 3].rstrip()}..."


def _engagement_sort_key(item: NexusClientEngagementOut) -> tuple[datetime, str, str]:
    occurred_at = item.occurred_at
    if occurred_at is None:
        occurred_at = datetime.min.replace(tzinfo=timezone.utc)
    elif occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    return (occurred_at, item.provider, item.external_id)


def _source_counts(items: list[NexusClientEngagementOut]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        counts[item.provider] = counts.get(item.provider, 0) + 1
    return counts
